/**
 * Trash: list what the student deleted in the last 30 days, restore it, or delete it for good.
 */
import { Router } from 'express';
import mongoose from 'mongoose';
import { TrashItem } from '../models/index.js';
import { h, HttpError } from '../middleware/error.js';
import { deleteForever, expiresAt, purgeOld, restoreFromTrash } from '../services/trash.js';

const r = Router();
const find = async (req) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Not in the Trash');
  const item = await TrashItem.findOne({ _id: req.params.id, user: req.userId }).lean();
  if (!item) throw new HttpError(404, 'Not in the Trash (it may have been deleted for good)');
  return item;
};

r.get('/', h(async (req, res) => {
  await purgeOld(new Date(), req.userId);
  const items = await TrashItem.find({ user: req.userId }).select('kind title detail createdAt').sort({ createdAt: -1 }).lean();
  res.json(items.map((i) => ({ id: String(i._id), kind: i.kind, title: i.title, detail: i.detail, deletedAt: i.createdAt, expiresAt: expiresAt(i.createdAt) })));
}));

r.post('/:id/restore', h(async (req, res) => {
  const item = await find(req);
  await restoreFromTrash(item);
  res.json({ ok: true, kind: item.kind, title: item.title });
}));

r.delete('/:id', h(async (req, res) => {
  const item = await find(req);
  await deleteForever({ _id: item._id, user: req.userId });
  res.json({ ok: true });
}));

// Empty the Trash
r.delete('/', h(async (req, res) => {
  res.json({ deleted: await deleteForever({ user: req.userId }) });
}));

export default r;
