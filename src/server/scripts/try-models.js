import mongoose from 'mongoose';
import { config } from '../src/config.js';
import { User, Course, Task } from '../src/models/index.js';

await mongoose.connect(config.mongoUri);

const user = await User.create({ name: 'Test Student', email: `test${Date.now()}@example.com`, passwordHash: 'x' });
const course = await Course.create({ user: user._id, code: 'CIS 641', name: 'System Analysis and Design', weeklyGoalHours: 6 });
const task = await Task.create({ user: user._id, course: course._id, title: 'Midterm', type: 'Exam', dueDate: '2026-12-05', hoursNeeded: 10 });

console.log('Course:', course.toJSON());
console.log('Task:', task.toJSON());

// This one should fail: the date is in the wrong format
try {
  await Task.create({ user: user._id, course: course._id, title: 'Bad', dueDate: '12/05/2026' });
} catch (err) {
  console.log('Validation works:', err.errors.dueDate.message);
}

// Clean up the test data
await Promise.all([Task.deleteMany({ user: user._id }), Course.deleteMany({ user: user._id }), User.deleteOne({ _id: user._id })]);
await mongoose.disconnect();