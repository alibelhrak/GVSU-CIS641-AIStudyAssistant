import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { Router } from 'express';
import multer from 'multer';
import { config } from '../config.js';
import { Material } from '../models/index.js';
import { h, HttpError } from '../middleware/error.js';
import { assertOwnsCourse } from './crud.js';

const upload = multer({
  storage: multer.diskStorage({
    destination: config.uploadDir,
    // Random name on disk; the original name is kept only in the database.
    filename: (_req, file, cb) => cb(null, crypto.randomUUID() + path.extname(file.originalname).slice(0, 10)),
  }),
  limits: { fileSize: 20 * 1024 * 1024, files: 10 },
});

const r = Router();

// List my materials, newest first
r.get('/', h(async (req, res) => {
  res.json(await Material.find({ user: req.userId }).sort({ createdAt: -1 }));
}));

// Save a link
r.post('/link', h(async (req, res) => {
  const { course, name, url } = req.body || {};
  await assertOwnsCourse(req.userId, course);
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) throw new HttpError(400, 'Links must start with http:// or https://');
  res.status(201).json(await Material.create({ user: req.userId, course, name, url, kind: 'link' }));
}));

// Upload files
r.post('/upload', upload.array('files', 10), h(async (req, res) => {
  const files = req.files || [];
  try {
    await assertOwnsCourse(req.userId, req.body.course);
    if (!files.length) throw new HttpError(400, 'Choose at least one file');
  } catch (err) {
    // Not allowed: delete what was just saved
    await Promise.all(files.map((f) => fs.rm(f.path, { force: true })));
    throw err;
  }
  const docs = await Material.insertMany(files.map((f) => ({
    user: req.userId,
    course: req.body.course,
    // keeps names with accents or Arabic letters correct
    name: Buffer.from(f.originalname, 'latin1').toString('utf8'),
    kind: 'file',
    storedName: f.filename,
    size: f.size,
    mimeType: f.mimetype,
  })));
  res.status(201).json(docs);
}));

// Download a file
r.get('/:id/file', h(async (req, res) => {
  const m = await Material.findOne({ _id: req.params.id, user: req.userId, kind: 'file' });
  if (!m) throw new HttpError(404, 'File not found');
  res.download(path.join(config.uploadDir, m.storedName), m.name);
}));

// Delete a file or link
r.delete('/:id', h(async (req, res) => {
  const m = await Material.findOneAndDelete({ _id: req.params.id, user: req.userId });
  if (!m) throw new HttpError(404, 'Not found');
  if (m.kind === 'file') await fs.rm(path.join(config.uploadDir, m.storedName), { force: true });
  res.status(204).end();
}));

export default r;