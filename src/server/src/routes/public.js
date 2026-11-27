/**
 * Pages shared to the web: anyone with the link can read them (no account needed).
 */
import { Router } from 'express';
import { Note, User } from '../models/index.js';
import { h, HttpError } from '../middleware/error.js';

const r = Router();

r.get('/notes/:publicId', h(async (req, res) => {
  const id = String(req.params.publicId || '');
  if (!/^[A-Za-z0-9_-]{10,40}$/.test(id)) throw new HttpError(404, 'This page is not shared (anymore)');
  const note = await Note.findOne({ publicId: id }).select('title icon cover coverY content markdown updatedAt user').lean();
  if (!note) throw new HttpError(404, 'This page is not shared (anymore)');
  const owner = await User.findById(note.user).select('name').lean();
  res.set('Cache-Control', 'no-store');
  res.json({ title: note.title, icon: note.icon, cover: note.cover, coverY: note.coverY, content: note.content, markdown: note.content?.length ? '' : note.markdown || '', updatedAt: note.updatedAt, owner: owner?.name || '' });
}));

export default r;
