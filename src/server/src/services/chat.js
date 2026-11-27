/**
 * What the study group chat and the shared-page chat have in common: reactions on messages,
 * and "Seen by …" (when each person last had the chat open).
 *
 * GET …/messages?v=2&since=<time>&seen=1 answers { messages, reads, now }:
 *  - without `since`: the latest messages; with it: every message added or changed (a reaction) since then
 *  - seen=1 (the chat is open on screen) records that this person has seen everything up to now
 */
import mongoose from 'mongoose';
import { ChatRead, User } from '../models/index.js';
import { HttpError } from '../middleware/error.js';

export const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🎉', '✅'];

const person = (u, id) => ({ id: String(id), name: u?.name || 'Former member', avatar: u?.avatar || '' });

async function peopleFor(list, extra = []) {
  const ids = new Set(extra.map(String));
  list.forEach((m) => { ids.add(String(m.user)); (m.reactions || []).forEach((r) => ids.add(String(r.user))); });
  return new Map((await User.find({ _id: { $in: [...ids] } }).select('name avatar').lean()).map((u) => [String(u._id), u]));
}

/** One message for the browser, with its reactions grouped by emoji */
export function messageView(m, people, me) {
  const groups = new Map();
  for (const r of m.reactions || []) {
    if (!groups.has(r.emoji)) groups.set(r.emoji, []);
    groups.get(r.emoji).push(String(r.user));
  }
  return {
    id: String(m._id), text: m.text, at: m.createdAt, updatedAt: m.updatedAt || m.createdAt,
    me: String(m.user) === String(me), user: person(people.get(String(m.user)), m.user),
    reactions: [...groups].map(([emoji, users]) => ({ emoji, count: users.length, mine: users.includes(String(me)), names: users.map((u) => people.get(u)?.name || 'Former member') })),
  };
}

/** Messages of one chat (`filter` picks the chat), in the old shape (a list) or the new one (v=2) */
export async function listMessages({ Model, filter, kind, ref, userId, query, limit = 80, readers = null }) {
  const v2 = query.v === '2';
  const q = { ...filter };
  const since = v2 && query.since ? new Date(String(query.since)) : null;
  const after = !v2 && query.after ? new Date(String(query.after)) : null;
  if (since && !Number.isNaN(since.getTime())) q.updatedAt = { $gt: since };
  else if (after && !Number.isNaN(after.getTime())) q.createdAt = { $gt: after };
  const narrowed = Boolean(q.updatedAt || q.createdAt);
  const now = new Date();
  const list = (await Model.find(q).sort({ createdAt: -1 }).limit(narrowed ? 200 : limit).lean()).reverse();
  if (!v2) {
    const people = await peopleFor(list);
    return list.map((m) => messageView(m, people, userId));
  }
  if (query.seen === '1') await ChatRead.updateOne({ kind, ref, user: userId }, { $set: { at: now } }, { upsert: true });
  let reads = await ChatRead.find({ kind, ref, user: { $ne: userId } }).lean();
  if (readers) reads = reads.filter((r) => readers.has(String(r.user)));   // only people who are still in the group
  const people = await peopleFor(list, reads.map((r) => r.user));
  return {
    messages: list.map((m) => messageView(m, people, userId)),
    reads: reads.map((r) => ({ user: person(people.get(String(r.user)), r.user), at: r.at })),
    now: now.toISOString(),
  };
}

/** Add or take back my reaction (one emoji) on a message */
export async function toggleReaction({ Model, filter, mid, userId, emoji }) {
  if (!REACTIONS.includes(emoji)) throw new HttpError(400, 'Pick one of the reactions');
  if (!mongoose.isValidObjectId(mid)) throw new HttpError(404, 'Message not found');
  const m = await Model.findOne({ _id: mid, ...filter });
  if (!m) throw new HttpError(404, 'Message not found');
  const had = m.reactions.some((r) => String(r.user) === String(userId) && r.emoji === emoji);
  if (had) m.reactions = m.reactions.filter((r) => !(String(r.user) === String(userId) && r.emoji === emoji));
  else {
    if (m.reactions.filter((r) => String(r.user) === String(userId)).length >= 3) throw new HttpError(400, 'You can add up to 3 reactions to a message');
    if (m.reactions.length >= 100) throw new HttpError(400, 'This message has too many reactions');
    m.reactions.push({ user: userId, emoji });
  }
  m.markModified('reactions');
  await m.save();
  const people = await peopleFor([m]);
  return messageView(m.toObject(), people, userId);
}
