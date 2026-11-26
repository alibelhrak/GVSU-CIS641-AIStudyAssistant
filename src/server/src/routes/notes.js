/**
 * Notes: Notion-style pages the student writes in the app.
 * A note can sit inside another note (sub-pages), have an emoji icon, belong to a course and be a favorite.
 * The editor's blocks are stored as they are, plus a plain-text copy used for search and by Ask AI.
 */
import { Router } from 'express';
import mongoose from 'mongoose';
import { Note, Course } from '../models/index.js';
import { h, HttpError } from '../middleware/error.js';

const r = Router();
const MAX_CONTENT = 3_000_000;          // characters of editor data per note (pictures included)
const LIST_FIELDS = 'title icon parent course favorite updatedAt createdAt';

const mine = (req) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Note not found');
  return { _id: req.params.id, user: req.userId };
};

/** Plain text of the editor blocks (headings, lists, tables...), for search and the AI */
export function blocksToText(blocks, depth = 0) {
  if (!Array.isArray(blocks)) return '';
  const inline = (c) => (typeof c === 'string' ? c : Array.isArray(c) ? c.map((x) => (x?.type === 'link' ? inline(x.content) : x?.text || '')).join('') : '');
  return blocks.map((b) => {
    const pad = '  '.repeat(depth);
    let line = '';
    if (b?.type === 'table') {
      line = (b.content?.rows || []).map((row) => row.cells.map((cell) => inline(cell?.content || cell)).join(' | ')).join('\n');
    } else {
      const t = inline(b?.content);
      const mark = { heading: '#'.repeat(b?.props?.level || 1) + ' ', bulletListItem: '- ', numberedListItem: '1. ',
        checkListItem: b?.props?.checked ? '[x] ' : '[ ] ', quote: '> ' }[b?.type] || '';
      line = b?.type === 'codeBlock' ? `\`\`\`\n${t}\n\`\`\`` : t ? mark + t : '';
    }
    const kids = blocksToText(b?.children, depth + 1);
    return [line && pad + line, kids].filter(Boolean).join('\n');
  }).filter(Boolean).join('\n');
}

async function checkRefs(userId, { parent, course }, selfId) {
  if (parent) {
    if (!mongoose.isValidObjectId(parent) || !(await Note.exists({ _id: parent, user: userId }))) throw new HttpError(400, 'Parent page not found');
    // A page cannot be moved inside itself or one of its own sub-pages
    for (let id = parent; id && selfId; ) {
      if (String(id) === String(selfId)) throw new HttpError(400, 'A page cannot go inside itself');
      id = (await Note.findById(id).select('parent').lean())?.parent;
    }
  }
  if (course && (!mongoose.isValidObjectId(course) || !(await Course.exists({ _id: course, user: userId })))) {
    throw new HttpError(400, 'Choose one of your courses');
  }
}

function pick(body = {}) {
  const out = {};
  if (typeof body.title === 'string') out.title = body.title.slice(0, 200);
  if (typeof body.icon === 'string') out.icon = body.icon.slice(0, 16);
  if (typeof body.favorite === 'boolean') out.favorite = body.favorite;
  if (body.parent !== undefined) out.parent = body.parent || null;
  if (body.course !== undefined) out.course = body.course || null;
  if (typeof body.markdown === 'string') out.markdown = body.markdown.slice(0, 100000);
  if (body.content !== undefined) {
    if (!Array.isArray(body.content)) throw new HttpError(400, 'Invalid note content');
    if (JSON.stringify(body.content).length > MAX_CONTENT) throw new HttpError(413, 'This note is too big. Remove some pictures or split it into sub-pages.');
    out.content = body.content;
    out.text = blocksToText(body.content).slice(0, 200000);
  }
  return out;
}

// All pages (without their content), most recently edited first
r.get('/', h(async (req, res) => {
  res.json(await Note.find({ user: req.userId }).select(LIST_FIELDS).sort({ updatedAt: -1 }));
}));

// Search titles and text
r.get('/search', h(async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 100);
  if (!q) return res.json([]);
  const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const found = await Note.find({ user: req.userId, $or: [{ title: rx }, { text: rx }] }).select(`${LIST_FIELDS} text`).limit(30);
  res.json(found.map((n) => {
    const at = n.text.search(rx);
    const snippet = at < 0 ? '' : n.text.slice(Math.max(0, at - 40), at + 80).replace(/[#*_`>|~]+|\[ ?x?\]/g, ' ').replace(/\s+/g, ' ').trim();
    const { text, ...rest } = n.toJSON();
    return { ...rest, snippet };
  }));
}));

r.get('/:id', h(async (req, res) => {
  const note = await Note.findOne(mine(req));
  if (!note) throw new HttpError(404, 'Note not found');
  res.json(note);
}));

r.post('/', h(async (req, res) => {
  const data = pick(req.body);
  await checkRefs(req.userId, data);
  const note = await Note.create({ ...data, user: req.userId });
  res.status(201).json(note);
}));

r.patch('/:id', h(async (req, res) => {
  const data = pick(req.body);
  await checkRefs(req.userId, data, req.params.id);
  const note = await Note.findOneAndUpdate(mine(req), data, { new: true, runValidators: true });
  if (!note) throw new HttpError(404, 'Note not found');
  const { content, text, ...meta } = note.toJSON();   // the editor already has the content
  res.json(meta);
}));

// Deleting a page also deletes its sub-pages
r.delete('/:id', h(async (req, res) => {
  const root = await Note.findOne(mine(req)).select('_id');
  if (!root) throw new HttpError(404, 'Note not found');
  const ids = [root._id];
  for (let level = [root._id]; level.length; ) {
    level = (await Note.find({ user: req.userId, parent: { $in: level } }).select('_id').lean()).map((n) => n._id);
    ids.push(...level);
  }
  await Note.deleteMany({ user: req.userId, _id: { $in: ids } });
  res.json({ deleted: ids.length });
}));

export default r;
