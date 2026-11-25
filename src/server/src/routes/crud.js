import { Router } from 'express';
import mongoose from 'mongoose';
import { Course } from '../models/index.js';
import { h, HttpError } from '../middleware/error.js';

/** Throws unless `courseId` is a course owned by the signed-in student. */
export async function assertOwnsCourse(userId, courseId) {
  const ok = mongoose.isValidObjectId(courseId) && (await Course.exists({ _id: courseId, user: userId }));
  if (!ok) throw new HttpError(400, 'Choose one of your courses');
}

/**
 * List, create, update and delete routes for one model.
 * Only the listed `fields` can be set by the browser, and every query
 * is limited to the signed-in student's own records.
 */
export function crud(Model, fields, { sort = { createdAt: 1 }, afterDelete } = {}) {
  const r = Router();
  const pick = (body = {}) => Object.fromEntries(fields.filter((f) => body[f] !== undefined).map((f) => [f, body[f]]));
  const findMine = (req) => ({ _id: req.params.id, user: req.userId });

  r.get('/', h(async (req, res) => {
    res.json(await Model.find({ user: req.userId }).sort(sort));
  }));

  r.post('/', h(async (req, res) => {
    const data = pick(req.body);
    if (fields.includes('course')) await assertOwnsCourse(req.userId, data.course);
    res.status(201).json(await Model.create({ ...data, user: req.userId }));
  }));

  r.patch('/:id', h(async (req, res) => {
    const data = pick(req.body);
    if (data.course !== undefined) await assertOwnsCourse(req.userId, data.course);
    const doc = await Model.findOneAndUpdate(findMine(req), data, { new: true, runValidators: true });
    if (!doc) throw new HttpError(404, 'Not found');
    res.json(doc);
  }));

  r.delete('/:id', h(async (req, res) => {
    const doc = await Model.findOneAndDelete(findMine(req));
    if (!doc) throw new HttpError(404, 'Not found');
    if (afterDelete) await afterDelete(doc, req);
    res.status(204).end();
  }));

  return r;
}