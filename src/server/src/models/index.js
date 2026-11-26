import mongoose from 'mongoose';

const { Schema, model } = mongoose;

// A link to another record (for example, the course a task belongs to)
const ref = (name) => ({ type: Schema.Types.ObjectId, ref: name, required: true, index: true });

// Dates are stored as text like "2026-11-24"
const isoDate = { type: String, required: true, match: [/^\d{4}-\d{2}-\d{2}$/, 'Dates must be YYYY-MM-DD'] };

// When a record is sent to the browser: use `id` instead of `_id`,
// and never send the password hash or the owner id
const opts = {
  timestamps: true,
  toJSON: {
    virtuals: true,
    versionKey: false,
    transform: (_doc, ret) => {
      delete ret._id;
      delete ret.user;
      delete ret.passwordHash;
      delete ret.storedName;
      delete ret.resetTokenHash;
      delete ret.resetExpires;
      return ret;
    },
  },
};

export const TASK_TYPES = ['Assignment', 'Exam', 'Quiz', 'Project', 'Reading'];
export const PRIORITIES = ['high', 'med', 'low'];

export const User = model('User', new Schema({
  name: { type: String, required: [true, 'Name is required'], trim: true },
  email: { type: String, required: [true, 'Email is required'], unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  // "Forgot password": a fingerprint of the emailed reset code, and when it stops working
  resetTokenHash: { type: String, index: true },
  resetExpires: Date,
  // Reminders the student turned on (all off until they choose), and how to send them
  reminders: {
    daily: { type: Boolean, default: false },       // morning summary
    deadlines: { type: Boolean, default: false },   // due today / due tomorrow
    sessions: { type: Boolean, default: false },    // a study session starts soon
    weekly: { type: Boolean, default: false },      // Sunday evening progress
    email: { type: Boolean, default: true },
    push: { type: Boolean, default: false },
    hour: { type: Number, default: 7, min: 0, max: 23 },             // local hour for the morning reminders
    timezone: { type: String, default: 'America/Detroit', maxlength: 60 },
  },
}, opts));

/** A browser or phone that accepts push notifications for this student */
export const PushSub = model('PushSub', new Schema({
  user: ref('User'),
  endpoint: { type: String, required: true, unique: true, maxlength: 2000 },
  keys: { p256dh: { type: String, required: true }, auth: { type: String, required: true } },
  device: { type: String, default: '', maxlength: 120 },
}, opts));

/** Reminders already sent, so the same one is never sent twice */
export const ReminderLog = model('ReminderLog', new Schema({
  user: ref('User'),
  key: { type: String, required: true, maxlength: 200 },
}, opts).index({ user: 1, key: 1 }, { unique: true }));

export const Course = model('Course', new Schema({
  user: ref('User'),
  code: { type: String, required: [true, 'Course code is required'], trim: true },
  name: { type: String, required: [true, 'Course name is required'], trim: true },
  weeklyGoalHours: { type: Number, default: 5, min: 0 },
  color: { type: String, default: '#2b4fd8' },
}, opts));

export const Task = model('Task', new Schema({
  user: ref('User'),
  course: ref('Course'),
  title: { type: String, required: [true, 'Title is required'], trim: true },
  type: { type: String, enum: TASK_TYPES, default: 'Assignment' },
  dueDate: isoDate,
  priority: { type: String, enum: PRIORITIES, default: 'med' },
  hoursNeeded: { type: Number, default: 0, min: 0 },
  done: { type: Boolean, default: false },
}, opts));

export const StudySession = model('StudySession', new Schema({
  user: ref('User'),
  course: ref('Course'),
  date: isoDate,
  startTime: { type: String, default: '18:00', match: [/^\d{2}:\d{2}$/, 'Time must be HH:MM'] },
  hours: { type: Number, required: true, min: [0.25, 'A session is at least 15 minutes'] },
  note: { type: String, default: '', trim: true },
  done: { type: Boolean, default: false },
}, opts));

export const StudyLog = model('StudyLog', new Schema({
  user: ref('User'),
  course: ref('Course'),
  date: isoDate,
  hours: { type: Number, required: true, min: [0.25, 'Log at least 15 minutes'] },
}, opts));

export const Material = model('Material', new Schema({
  user: ref('User'),
  course: ref('Course'),
  name: { type: String, required: [true, 'Name is required'], trim: true },
  kind: { type: String, enum: ['file', 'link'], required: true },
  url: String,
  storedName: String,
  size: Number,
  mimeType: String,
}, opts));

export const Recommendation = model('Recommendation', new Schema({
  user: ref('User'),
  task: ref('Task'),
  course: ref('Course'),
  key: { type: String, required: true },   // identifies "the same advice" so it isn't shown twice
  message: String,
  reason: String,
  source: { type: String, enum: ['llm', 'rules'], default: 'rules' },
  daysLeft: Number,
  studiedHours: Number,
  plannedHours: Number,
  neededHours: Number,
  gapHours: Number,
  score: Number,
  plan: [{ _id: false, date: String, hours: Number }],
  status: { type: String, enum: ['pending', 'accepted', 'dismissed'], default: 'pending' },
}, opts));

// Ask AI conversations. Messages are stored as sent by the browser (checked in routes/conversations.js)
export const Conversation = model('Conversation', new Schema({
  user: ref('User'),
  title: { type: String, default: 'New chat', trim: true, maxlength: 120 },
  messages: { type: [Schema.Types.Mixed], default: [] },
}, opts));

// Notes (Notion-style pages). `content` holds the editor's blocks; `parent` makes sub-pages.
export const Note = model('Note', new Schema({
  user: ref('User'),
  parent: { type: Schema.Types.ObjectId, ref: 'Note', default: null, index: true },
  course: { type: Schema.Types.ObjectId, ref: 'Course', default: null },
  title: { type: String, default: '', trim: true, maxlength: 200 },
  icon: { type: String, default: '', maxlength: 16 },
  cover: { type: String, default: '', maxlength: 1_500_000 },   // a preset name or a picture (data URL)
  coverY: { type: Number, default: 50, min: 0, max: 100 },       // which part of the picture shows (top 0 - bottom 100)
  favorite: { type: Boolean, default: false },
  content: { type: [Schema.Types.Mixed], default: [] },
  text: { type: String, default: '' },   // plain text of the content, for search and for the AI
  markdown: { type: String, default: '' },   // a note written by Ask AI; the editor turns it into blocks when first opened
}, opts));


/** Thumbs up / down on an AI answer, so the team can see what works */
export const Feedback = model('Feedback', new Schema({
  user: ref('User'),
  where: { type: String, default: 'notes-ai', maxlength: 30 },
  rating: { type: String, enum: ['up', 'down'], required: true },
  prompt: { type: String, default: '', maxlength: 2000 },
  answer: { type: String, default: '', maxlength: 4000 },
}, opts));
