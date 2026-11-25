import { Router } from 'express';
import { Course, Task, StudySession, StudyLog, Recommendation } from '../models/index.js';
import { h, HttpError } from '../middleware/error.js';
import { buildCandidates } from '../services/recommendationEngine.js';
import { writeMessages } from '../services/llm.js';

const r = Router();
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Recompute recommendations for the signed-in student and return the pending ones.
 * The browser sends its own date (?today=YYYY-MM-DD) so "due tomorrow" matches
 * the student's time zone.
 */
r.post('/generate', h(async (req, res) => {
  const today = ISO.test(req.query.today) ? req.query.today : new Date().toISOString().slice(0, 10);
  const user = req.userId;
  const [courses, tasks, sessions, logs, existing] = await Promise.all([
    Course.find({ user }).lean(),
    Task.find({ user, done: false }).lean(),
    StudySession.find({ user }).lean(),
    StudyLog.find({ user }).lean(),
    Recommendation.find({ user }),
  ]);

  // Step 1 + 2: the rules find and rank the study gaps
  const candidates = buildCandidates({ tasks, sessions, logs, today });
  const byKey = new Map(existing.map((rec) => [rec.key, rec]));
  const taskById = new Map(tasks.map((t) => [String(t._id), t]));
  const courseById = new Map(courses.map((c) => [String(c._id), c]));

  // Advice that no longer applies (task done, enough time planned, ...) goes away
  const liveKeys = candidates.map((c) => c.key);
  await Recommendation.deleteMany({ user, status: 'pending', key: { $nin: liveKeys } });

  // Only ask the LLM about advice that is new or whose countdown changed
  const needText = candidates.filter((c) => {
    const rec = byKey.get(c.key);
    if (!rec) return true;                       // never seen
    if (rec.status !== 'pending') return false;  // already accepted or dismissed
    return rec.daysLeft !== c.daysLeft;
  });

  // Step 3: the LLM (or the rules) write the text
  const facts = needText.map((c) => {
    const task = taskById.get(c.taskId);
    return {
      ref: c.key,
      course: courseById.get(c.courseId)?.code ?? 'this course',
      title: task.title,
      type: task.type,
      priority: task.priority,
      daysLeft: c.daysLeft,
      studiedHours: c.studiedHours,
      plannedHours: c.plannedHours,
      neededHours: c.neededHours,
      gapHours: c.gapHours,
    };
  });
  const texts = await writeMessages(facts);

  await Promise.all(needText.map((c) => {
    const { taskId, courseId, ...numbers } = c;
    return Recommendation.findOneAndUpdate(
      { user, key: c.key },
      { ...numbers, ...texts.get(c.key), task: taskId, course: courseId, status: 'pending' },
      { upsert: true, setDefaultsOnInsert: true },
    );
  }));

  res.json(await Recommendation.find({ user, status: 'pending' }).sort({ score: -1 }));
}));

/** Step 4a: accept, so the planned sessions go into the study schedule. */
r.post('/:id/accept', h(async (req, res) => {
  const rec = await Recommendation.findOne({ _id: req.params.id, user: req.userId, status: 'pending' });
  if (!rec) throw new HttpError(404, 'Recommendation not found');
  const task = await Task.findById(rec.task);
  const sessions = await StudySession.insertMany(rec.plan.map((p) => ({
    user: req.userId,
    course: rec.course,
    date: p.date,
    startTime: '18:00',
    hours: p.hours,
    note: task ? `Prep: ${task.title}` : 'Study session',
  })));
  rec.status = 'accepted';
  await rec.save();
  res.json({ recommendation: rec, sessions });
}));

/** Step 4b: dismiss, so this advice is hidden. It comes back only if the study gap changes. */
r.post('/:id/dismiss', h(async (req, res) => {
  const rec = await Recommendation.findOneAndUpdate(
    { _id: req.params.id, user: req.userId, status: 'pending' },
    { status: 'dismissed' },
    { new: true },
  );
  if (!rec) throw new HttpError(404, 'Recommendation not found');
  res.json(rec);
}));

export default r;