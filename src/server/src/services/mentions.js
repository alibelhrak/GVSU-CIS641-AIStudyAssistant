/**
 * @mentions and links between pages.
 * scanContent() finds, in a page's blocks, the pages it links to (@page mentions and links to /notes/<id>)
 * and the people it @mentions. The pages are kept on the note (for backlinks: "linked from"), and people
 * who are newly mentioned are told by email and push (only if they can open the page).
 */
import mongoose from 'mongoose';
import { Note } from '../models/index.js';
import { roleOn } from './access.js';
import { notifyMentioned } from './invites.js';

const ID = /^[a-f0-9]{24}$/;
const NOTE_LINK = /\/notes\/([a-f0-9]{24})/;

export function scanContent(blocks) {
  const links = new Set(); const people = new Set();
  const inline = (list) => {
    if (!Array.isArray(list)) return;
    for (const c of list) {
      if (c?.type === 'mention' && ID.test(String(c.props?.id || ''))) {
        if (c.props.kind === 'page') links.add(c.props.id);
        if (c.props.kind === 'user') people.add(c.props.id);
      }
      if (c?.type === 'link') { const m = String(c.href || '').match(NOTE_LINK); if (m) links.add(m[1]); inline(c.content); }
    }
  };
  const walk = (list) => {
    if (!Array.isArray(list)) return;
    for (const b of list) {
      if (b?.type === 'table') (b.content?.rows || []).forEach((r) => r.cells?.forEach((cell) => inline(cell?.content || cell)));
      else inline(b?.content);
      walk(b?.children);
    }
  };
  walk(blocks);
  return { links: [...links].slice(0, 200), mentions: [...people].slice(0, 100) };
}

/** Called after a page is saved: store its links and tell people who were just @mentioned */
export async function afterSave(noteId, byUserId, content, before) {
  const { links, mentions } = scanContent(content);
  await Note.updateOne({ _id: noteId }, { $set: { links: links.filter((x) => x !== String(noteId)).map((x) => new mongoose.Types.ObjectId(x)), mentions: mentions.map((x) => new mongoose.Types.ObjectId(x)) } });
  const had = new Set((before || []).map(String));
  const fresh = mentions.filter((u) => !had.has(u) && u !== String(byUserId));
  if (!fresh.length) return;
  const note = await Note.findById(noteId).select('title icon user shares groups');
  for (const u of fresh.slice(0, 20)) {
    if (await roleOn(note, u)) notifyMentioned({ toId: u, fromId: byUserId, note });
  }
}
