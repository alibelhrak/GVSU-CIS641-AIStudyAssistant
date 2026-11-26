/**
 * Folders in the notes list: the student's own groups of pages.
 * Deleting a folder keeps its pages (they go back to their course group).
 */
import { Router } from 'express';
import mongoose from 'mongoose';
import { Folder, Note } from '../models/index.js';
import { h, HttpError } from '../middleware/error.js';

const r = Router();
const MAX_FOLDERS = 100;
const cleanName = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, 60) : '');
const cleanColor = (v) => (typeof v === 'string' && /^(#[0-9a-f]{6}|)$/i.test(v) ? v : undefined);
const mine = (req) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Folder not found');
  return { _id: req.params.id, user: req.userId };
};

r.get('/', h(async (req, res) => {
  res.json(await Folder.find({ user: req.userId }).sort({ order: 1, createdAt: 1 }));
}));

r.post('/', h(async (req, res) => {
  const name = cleanName(req.body?.name);
  if (!name) throw new HttpError(400, 'Name the folder');
  const count = await Folder.countDocuments({ user: req.userId });
  if (count >= MAX_FOLDERS) throw new HttpError(400, `You can have up to ${MAX_FOLDERS} folders`);
  res.status(201).json(await Folder.create({ user: req.userId, name, color: cleanColor(req.body?.color) ?? '', order: count }));
}));

r.patch('/:id', h(async (req, res) => {
  const set = {};
  if (req.body?.name !== undefined) {
    set.name = cleanName(req.body.name);
    if (!set.name) throw new HttpError(400, 'Name the folder');
  }
  if (cleanColor(req.body?.color) !== undefined) set.color = req.body.color;
  if (Number.isFinite(req.body?.order)) set.order = req.body.order;
  const folder = await Folder.findOneAndUpdate(mine(req), set, { new: true, runValidators: true });
  if (!folder) throw new HttpError(404, 'Folder not found');
  res.json(folder);
}));

r.delete('/:id', h(async (req, res) => {
  const folder = await Folder.findOneAndDelete(mine(req));
  if (!folder) throw new HttpError(404, 'Folder not found');
  await Note.updateMany({ user: req.userId, folder: folder._id }, { folder: null });
  res.json({ ok: true });
}));

export default r;
