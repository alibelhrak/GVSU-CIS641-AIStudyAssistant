/**
 * Quick Find (Ctrl+K): one search over the student's pages (and pages shared with them), courses,
 * assignments and study groups. With no words, the most recently edited pages.
 */
import { Router } from 'express';
import { Course, Group, Note, Task, User } from '../models/index.js';
import { h } from '../middleware/error.js';
import { groupIdsOf } from '../services/access.js';

const r = Router();
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const snippetOf = (text, rx) => {
  const at = (text || '').search(rx);
  return at < 0 ? '' : text.slice(Math.max(0, at - 50), at + 90).replace(/[#*_`>|~]+|\[ ?x?\]/g, ' ').replace(/\s+/g, ' ').trim();
};

r.get('/', h(async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 100);
  const groups = await groupIdsOf(req.userId);
  const access = { $or: [{ user: req.userId }, { 'shares.user': req.userId }, { groups: { $in: groups } }] };
  const notePart = async (filter, limit, withText) => {
    const list = await Note.find({ ...access, ...filter }).select(`title icon parent user updatedAt${withText ? ' text markdown' : ''}`).sort({ updatedAt: -1 }).limit(limit).lean();
    const parents = new Map((await Note.find({ _id: { $in: list.map((n) => n.parent).filter(Boolean) } }).select('title icon').lean()).map((p) => [String(p._id), p]));
    const owners = new Map((await User.find({ _id: { $in: list.filter((n) => String(n.user) !== String(req.userId)).map((n) => n.user) } }).select('name').lean()).map((u) => [String(u._id), u.name]));
    return list.map((n) => {
      const p = n.parent && parents.get(String(n.parent));
      return { id: String(n._id), title: n.title, icon: n.icon, updatedAt: n.updatedAt, parent: p ? `${p.icon ? `${p.icon} ` : ''}${p.title || 'Untitled'}` : '',
        owner: owners.get(String(n.user)) || '', snippet: withText ? snippetOf(n.text || n.markdown, withText) : '' };
    });
  };
  if (!q) return res.json({ notes: await notePart({}, 8, null), courses: [], tasks: [], groups: [] });

  const rx = new RegExp(esc(q), 'i');
  const [inTitle, courses, tasks, myGroups] = await Promise.all([
    notePart({ title: rx }, 12, rx),
    Course.find({ user: req.userId, $or: [{ code: rx }, { name: rx }] }).select('code name color').limit(5).lean(),
    Task.find({ user: req.userId, title: rx }).select('title type dueDate done course').sort({ done: 1, dueDate: 1 }).limit(8).lean(),
    Group.find({ _id: { $in: groups }, name: rx }).select('name color').limit(5).lean(),
  ]);
  const seen = new Set(inTitle.map((n) => n.id));
  const inText = (await notePart({ $or: [{ text: rx }, { markdown: rx }] }, 20, rx)).filter((n) => !seen.has(n.id)).slice(0, 12);
  const codes = new Map((await Course.find({ _id: { $in: tasks.map((x) => x.course) } }).select('code').lean()).map((c) => [String(c._id), c.code]));
  res.json({
    notes: [...inTitle, ...inText],
    courses: courses.map((c) => ({ id: String(c._id), code: c.code, name: c.name, color: c.color })),
    tasks: tasks.map((x) => ({ id: String(x._id), title: x.title, type: x.type, dueDate: x.dueDate, done: x.done, course: codes.get(String(x.course)) || '' })),
    groups: myGroups.map((g) => ({ id: String(g._id), name: g.name, color: g.color })),
  });
}));

export default r;
