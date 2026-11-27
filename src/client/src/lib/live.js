/**
 * Live co-editing of a shared page (see server/src/services/collab.js).
 * A Yjs document is kept in sync with everyone who has the page open, over a WebSocket.
 */
import { useEffect, useState } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { getToken } from './api.js';

const COLORS = ['#e03131', '#2f9e44', '#1971c2', '#f08c00', '#9c36b5', '#0c8599', '#d6336c', '#5f3dc4'];
/** A steady color for each person (their cursor and their circle) */
export const colorFor = (key = '') => COLORS[[...String(key)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % COLORS.length];

function connect(noteId) {
  const doc = new Y.Doc();
  const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/collab`;
  const provider = new WebsocketProvider(url, noteId, doc, { params: { token: getToken() || '' }, disableBc: true, maxBackoffTime: 5000 });
  return { doc, provider, destroy: () => { provider.destroy(); doc.destroy(); } };
}

/**
 * Connects while `enabled`. status: 'connecting' → 'synced', or 'failed' when the
 * connection can't be made (then the page is edited the normal way).
 */
export function useLive(noteId, enabled) {
  const [live, setLive] = useState(null);
  const [status, setStatus] = useState('connecting');
  const [people, setPeople] = useState([]);

  useEffect(() => {
    if (!enabled || !noteId) { setLive(null); return undefined; }
    const l = connect(noteId);
    setLive(l);
    setStatus('connecting');
    setPeople([]);
    let synced = false;
    let closes = 0;
    const onSync = (ok) => { if (ok) { synced = true; setStatus('synced'); } };
    const onClose = () => { closes += 1; if (!synced && closes >= 3) setStatus('failed'); };
    const timer = setTimeout(() => { if (!synced) setStatus('failed'); }, 9000);
    const onPeople = () => {
      const me = l.provider.awareness.clientID;
      const seen = new Map();
      l.provider.awareness.getStates().forEach((state, id) => {
        if (id !== me && state.user?.name && !seen.has(state.user.name)) seen.set(state.user.name, state.user);
      });
      setPeople([...seen.values()]);
    };
    l.provider.on('sync', onSync);
    l.provider.on('connection-close', onClose);
    l.provider.awareness.on('change', onPeople);
    return () => {
      clearTimeout(timer);
      l.provider.off('sync', onSync);
      l.provider.off('connection-close', onClose);
      l.provider.awareness.off('change', onPeople);
      l.destroy();
      setLive(null);
    };
  }, [noteId, enabled]);

  return { live, status, people };
}
