/**
 * Who may open a note page:
 *  - the owner (the student who made it)
 *  - people it was shared with by email, as "viewer" (read only) or "editor"
 *  - members of a study group it was shared with (they can edit)
 */
import mongoose from 'mongoose';
import { Group, Note } from '../models/index.js';

/** Ids of the groups this student belongs to */
export async function groupIdsOf(userId) {
  return (await Group.find({ 'members.user': userId }).select('_id').lean()).map((g) => g._id);
}

const RANK = { viewer: 1, editor: 2, owner: 3 };

/** The student's role on a note: 'owner', 'editor', 'viewer' or null */
export async function roleOn(note, userId) {
  if (!note) return null;
  if (String(note.user) === String(userId)) return 'owner';
  let role = null;
  const share = (note.shares || []).find((s) => String(s.user) === String(userId));
  if (share) role = share.role;
  if (note.groups?.length && RANK[role] !== RANK.editor) {
    const inGroup = await Group.exists({ _id: { $in: note.groups }, 'members.user': userId });
    if (inGroup) role = 'editor';
  }
  return role;
}

/** Loads a note and the student's role on it (null when they may not see it) */
export async function noteAccess(noteId, userId, select) {
  if (!mongoose.isValidObjectId(noteId)) return { note: null, role: null };
  let q = Note.findById(noteId);
  if (select) q = q.select(`${select} user shares groups inDb`);
  const note = await q;
  let role = await roleOn(note, userId);
  // A database row can be opened by everyone who can open its database
  if (note?.inDb && role !== 'owner') {
    const db = await Note.findById(note.inDb).select('user shares groups').lean();
    const viaDb = await roleOn(db, userId);
    if ((RANK[viaDb] || 0) > (RANK[role] || 0)) role = viaDb;
  }
  return { note, role };
}

export const canEdit = (role) => role === 'owner' || role === 'editor';
export const isShared = (note) => Boolean(note?.shares?.length || note?.groups?.length);
