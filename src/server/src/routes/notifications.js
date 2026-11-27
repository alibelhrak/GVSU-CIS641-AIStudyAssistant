/** The notifications inbox (🔔 in the sidebar) */
import { Router } from 'express';
import mongoose from 'mongoose';
import { Notification, User } from '../models/index.js';
import { h } from '../middleware/error.js';

const r = Router();

r.get('/', h(async (req, res) => {
  const list = await Notification.find({ user: req.userId }).sort({ createdAt: -1 }).limit(60).lean();
  const people = new Map((await User.find({ _id: { $in: list.map((n) => n.actor).filter(Boolean) } }).select('name avatar').lean()).map((u) => [String(u._id), u]));
  res.json(list.map((n) => ({ id: String(n._id), kind: n.kind, title: n.title, body: n.body, url: n.url, read: n.read, at: n.createdAt,
    actor: n.actor ? { id: String(n.actor), name: people.get(String(n.actor))?.name || '', avatar: people.get(String(n.actor))?.avatar || '' } : null })));
}));
r.get('/count', h(async (req, res) => res.json({ unread: await Notification.countDocuments({ user: req.userId, read: false }) })));
// { ids: [...] } marks those as read; no ids marks everything as read
r.post('/read', h(async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter((x) => mongoose.isValidObjectId(x)).slice(0, 200) : null;
  await Notification.updateMany({ user: req.userId, read: false, ...(ids ? { _id: { $in: ids } } : {}) }, { $set: { read: true } });
  res.json({ ok: true });
}));
r.delete('/', h(async (req, res) => { await Notification.deleteMany({ user: req.userId, read: true }); res.json({ ok: true }); }));

export default r;
