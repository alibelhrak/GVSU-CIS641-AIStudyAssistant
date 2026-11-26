/**
 * Trash: deleted things are kept for 30 days, then removed for good.
 * Deleting copies the record (and everything removed with it) into a TrashItem first,
 * so restoring puts back exactly the same records, with the same ids and dates.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import {
  Course, Task, StudySession, StudyLog, Material, Note, Conversation, Folder, TrashItem,
} from '../models/index.js';
import { HttpError } from '../middleware/error.js';

export const TRASH_DAYS = 30;
const DAY = 86400000;
const MODELS = { Course, Task, StudySession, StudyLog, Material, Note, Conversation };

const dayText = (iso) => iso || '';
const count = (n, word) => (n ? `${n} ${word}${n === 1 ? '' : 's'}` : '');
const hoursText = (h) => `${Math.round(h * 100) / 100} h`;

/** What is removed with a record, as { model: [docs] } (plain copies) */
async function collect(kind, doc, userId) {
  const user = userId;
  if (kind === 'course') {
    const q = { user, course: doc._id };
    const [tasks, sessions, logs, materials, notes] = await Promise.all([
      Task.find(q).lean(), StudySession.find(q).lean(), StudyLog.find(q).lean(), Material.find(q).lean(),
      Note.find(q).select('_id').lean(),
    ]);
    return {
      items: { Course: [doc], Task: tasks, StudySession: sessions, StudyLog: logs, Material: materials },
      files: materials.filter((m) => m.kind === 'file' && m.storedName).map((m) => m.storedName),
      notes: notes.map((n) => n._id),
      detail: [count(tasks.length, 'task'), count(sessions.length, 'session'), count(materials.length, 'material')].filter(Boolean).join(' · '),
    };
  }
  if (kind === 'note') {
    // the page and all its sub-pages
    const all = [doc];
    for (let level = [doc._id]; level.length; ) {
      const kids = await Note.find({ user, parent: { $in: level } }).lean();
      all.push(...kids);
      level = kids.map((n) => n._id);
    }
    return { items: { Note: all }, detail: all.length > 1 ? `+ ${count(all.length - 1, 'sub-page')}` : '' };
  }
  if (kind === 'material') return { items: { Material: [doc] }, files: doc.kind === 'file' && doc.storedName ? [doc.storedName] : [] };
  const model = { task: 'Task', session: 'StudySession', log: 'StudyLog', chat: 'Conversation' }[kind];
  return { items: { [model]: [doc] } };
}

async function courseCode(userId, id) {
  return id ? (await Course.findOne({ _id: id, user: userId }).select('code').lean())?.code || '' : '';
}

/**
 * Copy a record (and what goes with it) into the Trash, then remove all of it.
 * Returns the TrashItem id, which the browser can use for "Undo".
 */
export async function moveToTrash(kind, doc, userId) {
  const plain = typeof doc.toObject === 'function' ? doc.toObject({ depopulate: true }) : doc;
  const { items, files = [], notes = [], detail = '' } = await collect(kind, plain, userId);
  let title = plain.title || plain.name || '';
  let more = detail;
  if (kind === 'course') title = `${plain.code} · ${plain.name}`;
  if (kind === 'session') { title = `${await courseCode(userId, plain.course)} study session`.trim(); more = `${dayText(plain.date)} ${plain.startTime || ''} · ${hoursText(plain.hours)}`; }
  if (kind === 'log') { title = `${await courseCode(userId, plain.course)} logged hours`.trim(); more = `${dayText(plain.date)} · ${hoursText(plain.hours)}`; }
  if (kind === 'task') more = [await courseCode(userId, plain.course), plain.type, plain.dueDate && `due ${plain.dueDate}`].filter(Boolean).join(' · ');
  if (kind === 'material') more = [await courseCode(userId, plain.course), plain.kind === 'link' ? 'link' : 'file'].filter(Boolean).join(' · ');
  if (kind === 'note' && !title) title = 'Untitled';

  const trash = await TrashItem.create({
    user: userId, kind, title: String(title).slice(0, 200), detail: String(more).slice(0, 200),
    items: Object.entries(items).filter(([, docs]) => docs.length).map(([model, docs]) => ({ model, docs })),
    files, notes,
  });
  // Only now remove the originals (nothing is lost if saving the copy failed)
  for (const [model, docs] of Object.entries(items)) {
    if (docs.length) await MODELS[model].deleteMany({ user: userId, _id: { $in: docs.map((d) => d._id) } });
  }
  if (kind === 'course') await Note.updateMany({ user: userId, course: plain._id }, { course: null });
  return trash.id;
}

/** Put a Trash item back. Throws a clear message when its course is gone. */
export async function restoreFromTrash(item) {
  const user = item.user;
  const byModel = Object.fromEntries(item.items.map((i) => [i.model, i.docs]));

  // Tasks, sessions, logs and materials need their course
  if (item.kind !== 'course' && item.kind !== 'note' && item.kind !== 'chat') {
    const doc = Object.values(byModel)[0]?.[0];
    if (doc?.course && !(await Course.exists({ _id: doc.course, user }))) {
      const inTrash = await TrashItem.findOne({ user, kind: 'course', 'items.docs._id': doc.course }).select('title').lean();
      throw new HttpError(409, inTrash
        ? `Restore the course "${inTrash.title}" first.`
        : 'Its course was deleted for good, so this cannot come back.');
    }
  }
  if (byModel.Note) {
    // a parent page or course that is gone: the page comes back at the top level / without the course
    const ids = new Set(byModel.Note.map((n) => String(n._id)));
    for (const n of byModel.Note) {
      if (n.parent && !ids.has(String(n.parent)) && !(await Note.exists({ _id: n.parent, user }))) n.parent = null;
      if (n.course && !(await Course.exists({ _id: n.course, user }))) n.course = null;
      if (n.folder) n.folder = (await Folder.exists({ _id: n.folder, user })) ? n.folder : null;
    }
  }
  for (const [model, docs] of Object.entries(byModel)) {
    // the same ids as before; skip any that already exist
    const have = new Set((await MODELS[model].find({ _id: { $in: docs.map((d) => d._id) } }).select('_id').lean()).map((d) => String(d._id)));
    const fresh = docs.filter((d) => !have.has(String(d._id)));
    if (fresh.length) await MODELS[model].collection.insertMany(fresh);
  }
  if (item.kind === 'course' && item.notes?.length) {
    const courseId = byModel.Course[0]._id;
    await Note.updateMany({ user, _id: { $in: item.notes }, course: null }, { course: courseId });
  }
  await TrashItem.deleteOne({ _id: item._id });
}

/** Remove Trash items for good, with their uploaded files */
export async function deleteForever(filter) {
  const items = await TrashItem.find(filter).select('files').lean();
  if (!items.length) return 0;
  await Promise.all(items.flatMap((i) => i.files || []).map((f) => fs.rm(path.join(config.uploadDir, path.basename(f)), { force: true })));
  await TrashItem.deleteMany({ _id: { $in: items.map((i) => i._id) } });
  return items.length;
}

/** Items older than 30 days (one student, or everyone) */
export function purgeOld(now = new Date(), userId = null) {
  const old = { createdAt: { $lt: new Date(now.getTime() - TRASH_DAYS * DAY) } };
  return deleteForever(userId ? { ...old, user: userId } : old);
}

/** When an item will be deleted for good */
export const expiresAt = (createdAt) => new Date(new Date(createdAt).getTime() + TRASH_DAYS * DAY);
