/**
 * Page history: before a save changes a page, the server may keep a copy of how it was.
 *  - "shrink": the save removes a big part of the page (40 % or more of a page of 200+ characters).
 *    Kept every time, so nothing is ever lost to a mistake, a bad AI rewrite or a sync problem.
 *  - "auto": at most one copy every 15 minutes while someone keeps editing.
 * The 40 newest copies of each page are kept, for up to 60 days.
 */
import { Note, NoteVersion } from '../models/index.js';

const EVERY = 15 * 60_000;
const KEEP = 40;
const DAYS = 60;

export async function snapshotBefore(noteId, userId, newText, { force = false } = {}) {
  try {
    const old = await Note.findById(noteId).select('text').lean();
    if (!old) return;
    const oldLen = (old.text || '').trim().length;
    const newLen = String(newText || '').trim().length;
    if (!oldLen || (!force && (old.text || '') === (newText || ''))) return;
    const shrink = oldLen >= 200 && newLen <= oldLen * 0.6;
    const last = await NoteVersion.findOne({ note: noteId }).sort({ createdAt: -1 }).select('createdAt length').lean();
    // Two people editing live both save the same change: one copy of it is enough
    if (!force && last && last.length === oldLen && Date.now() - last.createdAt.getTime() < 120_000) return;
    if (!force && !shrink && last && Date.now() - last.createdAt.getTime() < EVERY) return;
    const full = await Note.findById(noteId).select('title icon content text').lean();
    await NoteVersion.create({ note: noteId, user: userId, title: full.title, icon: full.icon, content: full.content || [], length: oldLen, reason: shrink ? 'shrink' : 'auto' });
    const extra = await NoteVersion.find({ note: noteId }).sort({ createdAt: -1 }).skip(KEEP).select('_id').lean();
    if (extra.length) await NoteVersion.deleteMany({ _id: { $in: extra.map((v) => v._id) } });
  } catch (err) {
    console.warn('Page history: could not save a version:', err.message);   // saving the page itself must never fail because of this
  }
}

export const purgeOldVersions = () => NoteVersion.deleteMany({ createdAt: { $lt: new Date(Date.now() - DAYS * 86400_000) } });
