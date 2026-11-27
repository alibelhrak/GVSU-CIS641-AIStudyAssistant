/**
 * Live co-editing of shared note pages (several people typing in the same page at once).
 *
 * Browsers connect with a WebSocket to /api/collab/<noteId>?token=<login token> and speak the
 * standard Yjs protocol (y-websocket): "sync" messages carry document changes, "awareness"
 * messages carry who is there and where their cursor is.
 *
 * Each open page is a "room" kept in memory while at least one person has it open. The page
 * itself is still saved the usual way (the editors' browsers PATCH /api/notes/:id), so when
 * everyone leaves the room is dropped and the next visitor starts it again from the saved page.
 * Viewers receive changes but anything they send is ignored.
 */
import { WebSocketServer } from 'ws';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { userFromToken } from '../middleware/auth.js';
import { noteAccess, canEdit, isShared } from './access.js';

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;
const MAX_MESSAGE = 4 * 1024 * 1024;   // pictures in a page can make big changes
const rooms = new Map();                // noteId -> room

function roomFor(noteId) {
  let room = rooms.get(noteId);
  if (room) { clearTimeout(room.dropTimer); return room; }
  const doc = new Y.Doc();
  const awareness = new awarenessProtocol.Awareness(doc);
  awareness.setLocalState(null);   // the server itself is not a participant
  room = { id: noteId, doc, awareness, conns: new Map(), seededBy: null, seededAt: 0, dropTimer: null };

  doc.on('update', (update) => {
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MESSAGE_SYNC);
    syncProtocol.writeUpdate(enc, update);
    const msg = encoding.toUint8Array(enc);
    for (const ws of room.conns.keys()) send(room, ws, msg);
  });
  awareness.on('update', ({ added, updated, removed }, origin) => {
    const changed = added.concat(updated, removed);
    const info = room.conns.get(origin);
    if (info) {
      added.forEach((id) => info.clients.add(id));
      removed.forEach((id) => info.clients.delete(id));
    }
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(enc, awarenessProtocol.encodeAwarenessUpdate(awareness, changed));
    const msg = encoding.toUint8Array(enc);
    for (const ws of room.conns.keys()) send(room, ws, msg);
  });
  rooms.set(noteId, room);
  return room;
}

function send(room, ws, msg) {
  if (ws.readyState !== ws.OPEN) return closeConn(room, ws);
  ws.send(msg, (err) => { if (err) closeConn(room, ws); });
}

function closeConn(room, ws) {
  const info = room.conns.get(ws);
  if (!info) return;
  room.conns.delete(ws);
  awarenessProtocol.removeAwarenessStates(room.awareness, [...info.clients], null);
  try { ws.close(); } catch { /* already closed */ }
  if (!room.conns.size) {
    // keep the room a little while (a page reload reconnects right away), then forget it
    room.dropTimer = setTimeout(() => {
      if (!room.conns.size) { room.doc.destroy(); rooms.delete(room.id); }
    }, 30_000);
  }
}

function onMessage(room, ws, data) {
  const info = room.conns.get(ws);
  if (!info) return;
  try {
    const dec = decoding.createDecoder(new Uint8Array(data));
    const enc = encoding.createEncoder();
    const type = decoding.readVarUint(dec);
    if (type === MESSAGE_SYNC) {
      encoding.writeVarUint(enc, MESSAGE_SYNC);
      const kind = decoding.readVarUint(dec);
      if (kind === syncProtocol.messageYjsSyncStep1) {
        syncProtocol.readSyncStep1(dec, enc, room.doc);           // send them what they are missing
      } else if (info.canEdit && kind === syncProtocol.messageYjsSyncStep2) {
        syncProtocol.readSyncStep2(dec, room.doc, ws);
      } else if (info.canEdit && kind === syncProtocol.messageYjsUpdate) {
        syncProtocol.readUpdate(dec, room.doc, ws);
      }                                                           // viewers: changes are ignored
      if (encoding.length(enc) > 1) send(room, ws, encoding.toUint8Array(enc));
    } else if (type === MESSAGE_AWARENESS) {
      awarenessProtocol.applyAwarenessUpdate(room.awareness, decoding.readVarUint8Array(dec), ws);
    }
  } catch {
    closeConn(room, ws);
  }
}

/**
 * A room starts empty. The first editor whose browser finds the page blank fills it from the
 * saved version; everyone else waits a moment and receives it. Returns true to exactly one browser
 * (or again after 15 s, in case the first one closed the page before filling it).
 */
export function claimSeed(noteId, userId) {
  const room = rooms.get(String(noteId));
  if (!room) return false;
  if (room.seededBy && Date.now() - room.seededAt < 15_000) return false;
  if (room.seededBy && room.doc.getXmlFragment('document-store').length > 0 && room.seededOk) return false;
  room.seededBy = String(userId);
  room.seededAt = Date.now();
  return true;
}

/** The browser that filled the room says it is done */
export function seedDone(noteId) {
  const room = rooms.get(String(noteId));
  if (room) room.seededOk = true;
}

/** How many people have each page open (for tests and the health check) */
/**
 * Closes every live connection to a page after its access changed (someone removed, a role changed,
 * a report taken down). Browsers reconnect by themselves, and the access check runs again:
 * people who still have access rejoin, the others are refused.
 */
export function closeRoom(noteId) {
  const room = rooms.get(String(noteId));
  if (room) for (const ws of [...room.conns.keys()]) closeConn(room, ws);
}

export const roomStats = () => [...rooms.values()].map((r) => ({ id: r.id, people: r.conns.size }));

/** Adds the WebSocket endpoint to the HTTP server */
export function attachCollab(server) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE });

  server.on('upgrade', async (req, socket, head) => {
    const url = new URL(req.url, 'http://x');
    const m = url.pathname.match(/^\/api\/collab\/([a-f0-9]{24})$/i);
    if (!m) return socket.destroy();
    const refuse = (code, text) => { socket.write(`HTTP/1.1 ${code} ${text}\r\nConnection: close\r\n\r\n`); socket.destroy(); };
    const userId = await userFromToken(url.searchParams.get('token') || '');
    if (!userId) return refuse(401, 'Unauthorized');
    const { note, role } = await noteAccess(m[1], userId, '_id');
    if (!role) return refuse(403, 'Forbidden');
    if (!isShared(note)) return refuse(409, 'Not shared');   // private pages are edited without live sync
    wss.handleUpgrade(req, socket, head, (ws) => {
      const room = roomFor(m[1]);
      room.conns.set(ws, { userId, canEdit: canEdit(role), clients: new Set() });
      ws.binaryType = 'arraybuffer';
      ws.on('message', (data) => onMessage(room, ws, data));
      ws.on('close', () => closeConn(room, ws));
      ws.on('error', () => closeConn(room, ws));

      // keep the connection alive through proxies; drop it when the browser stops answering
      let alive = true;
      ws.on('pong', () => { alive = true; });
      const ping = setInterval(() => {
        if (!alive) { clearInterval(ping); return closeConn(room, ws); }
        alive = false;
        try { ws.ping(); } catch { clearInterval(ping); closeConn(room, ws); }
      }, 30_000);
      ws.on('close', () => clearInterval(ping));

      // start the sync: our state vector, then who else is here
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MESSAGE_SYNC);
      syncProtocol.writeSyncStep1(enc, room.doc);
      send(room, ws, encoding.toUint8Array(enc));
      const states = room.awareness.getStates();
      if (states.size) {
        const a = encoding.createEncoder();
        encoding.writeVarUint(a, MESSAGE_AWARENESS);
        encoding.writeVarUint8Array(a, awarenessProtocol.encodeAwarenessUpdate(room.awareness, [...states.keys()]));
        send(room, ws, encoding.toUint8Array(a));
      }
    });
  });
  return wss;
}
