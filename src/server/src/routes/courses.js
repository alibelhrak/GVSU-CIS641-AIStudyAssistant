import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { Course, Task, StudySession, StudyLog, Material, Recommendation } from '../models/index.js';
import { crud } from './crud.js';

// Removing a course removes everything that belongs to it, including uploaded files.
async function cascade(course) {
  const q = { course: course._id };
  const files = await Material.find({ ...q, kind: 'file' });
  await Promise.all(files.map((m) => fs.rm(path.join(config.uploadDir, m.storedName), { force: true })));
  await Promise.all([Task, StudySession, StudyLog, Material, Recommendation].map((M) => M.deleteMany(q)));
}

export default crud(Course, ['code', 'name', 'weeklyGoalHours', 'color'], { afterDelete: cascade });