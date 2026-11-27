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
      delete ret.verifyCodeHash;
      delete ret.verifyTicketHash;
      delete ret.tokenVersion;
      delete ret.verifyExpires;
      delete ret.verifyAttempts;
      delete ret.verifySentAt;
      delete ret.verifySends;
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
  // Email check at sign-up: false until the 6-digit code is entered.
  // Accounts made before this existed have no value and count as verified.
  emailVerified: Boolean,
  // When the student confirmed being 13 or older and agreed to the Terms of Service (at sign-up)
  termsAcceptedAt: Date,
  verifyCodeHash: String,          // fingerprint of the emailed code, never the code itself
  verifyTicketHash: String,        // fingerprint of the private ticket held by the device that signed up
  verifyExpires: Date,
  verifyAttempts: { type: Number, default: 0 },
  verifySentAt: Date,
  verifySends: { type: [Date], default: undefined },   // when codes were sent (limits resends)
  tokenVersion: { type: Number, default: 0 },   // raised to sign out every device
  avatar: { type: String, default: '', maxlength: 120_000 },   // profile picture: a small square JPEG/WebP as a data URL
  pendingEmail: { type: String, lowercase: true, trim: true },   // new email waiting for its code
  // Look and feel, saved to the account so it follows the student to every device
  prefs: {
    theme: { type: String, enum: ['system', 'light', 'dark', 'paper', 'midnight'] },
    accent: { type: String, enum: ['blue', 'purple', 'green', 'orange', 'pink'] },
    font: { type: String, enum: ['default', 'serif', 'mono', 'readable'] },
    size: { type: String, enum: ['s', 'm', 'l', 'xl'] },
    motion: { type: String, enum: ['system', 'reduce'] },
    weekStart: { type: String, enum: ['mon', 'sun'] },
    startPage: { type: String, enum: ['dashboard', 'chat', 'notes', 'schedule', 'tasks'] },
    codeAI: { type: String, enum: ['on', 'off'] },   // AI code suggestions in Notes
    codeTheme: { type: String, enum: ['auto', 'github-dark', 'github-light', 'dracula', 'monokai', 'one-dark-pro', 'one-light', 'tokyo-night', 'nord', 'catppuccin-mocha', 'catppuccin-latte', 'night-owl', 'solarized-dark', 'solarized-light', 'rose-pine', 'ayu-dark'] },   // colors of code blocks in Notes
  },
  // App language (also used for emails sent later)
  language: { type: String, enum: ['en', 'fr', 'es', 'ar', 'zh', 'hi'], default: 'en' },
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
  weeklyGoalHours: { type: Number, default: 5, min: 0, max: 168 },   // null = no weekly goal
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
  lang: { type: String, default: 'en' },   // language the text was written in
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
  folder: { type: Schema.Types.ObjectId, ref: 'Folder', default: null },   // the student's own folder in the notes list
  wide: { type: Boolean, default: false },                                  // full-width page
  textSize: { type: String, enum: ['s', 'm', 'l'], default: 'm' },          // small, default or large text
  title: { type: String, default: '', trim: true, maxlength: 200 },
  icon: { type: String, default: '', maxlength: 16 },
  cover: { type: String, default: '', maxlength: 1_500_000 },   // a preset name or a picture (data URL)
  coverY: { type: Number, default: 50, min: 0, max: 100 },       // which part of the picture shows (top 0 - bottom 100)
  favorite: { type: Boolean, default: false },
  content: { type: [Schema.Types.Mixed], default: [] },
  text: { type: String, default: '' },   // plain text of the content, for search and for the AI
  markdown: { type: String, default: '' },   // a note written by Ask AI; the editor turns it into blocks when first opened
  // Sharing: people invited by email (viewer or editor), study groups (members can edit), and a public read-only link
  shares: [{ _id: false, user: { type: Schema.Types.ObjectId, ref: 'User', required: true }, role: { type: String, enum: ['viewer', 'editor'], default: 'editor' }, at: { type: Date, default: Date.now } }],
  groups: { type: [{ type: Schema.Types.ObjectId, ref: 'Group' }], default: [] },
  publicId: { type: String, default: undefined },   // set when "Share to web" is on
  links: { type: [{ type: Schema.Types.ObjectId, ref: 'Note' }], default: [] },      // pages this page links to (@page mentions and links), for backlinks
  mentions: { type: [{ type: Schema.Types.ObjectId, ref: 'User' }], default: [] },  // people @mentioned on the page
}, opts).index({ 'shares.user': 1 }).index({ groups: 1 }).index({ links: 1 }).index({ publicId: 1 }, { unique: true, sparse: true }));


/** Thumbs up / down on an AI answer, so the team can see what works */
export const Feedback = model('Feedback', new Schema({
  user: ref('User'),
  where: { type: String, default: 'notes-ai', maxlength: 30 },
  rating: { type: String, enum: ['up', 'down'], required: true },
  prompt: { type: String, default: '', maxlength: 2000 },
  answer: { type: String, default: '', maxlength: 4000 },
}, opts));

/** A folder the student made in the notes list (pages can be put inside) */
export const Folder = model('Folder', new Schema({
  user: ref('User'),
  name: { type: String, required: [true, 'Name the folder'], trim: true, maxlength: 60 },
  color: { type: String, default: '', maxlength: 20 },
  order: { type: Number, default: 0 },
}, opts));

export const TRASH_KINDS = ['course', 'task', 'session', 'log', 'material', 'note', 'chat'];

/**
 * Something the student deleted, kept for 30 days so it can be restored.
 * `items` holds copies of every record that was removed with it (a course takes its tasks, sessions ...).
 * Uploaded files stay on disk until the item is deleted for good.
 */
export const TrashItem = model('TrashItem', new Schema({
  user: ref('User'),
  kind: { type: String, enum: TRASH_KINDS, required: true },
  title: { type: String, default: '', maxlength: 200 },
  detail: { type: String, default: '', maxlength: 200 },
  items: [{ _id: false, model: String, docs: [Schema.Types.Mixed] }],
  files: { type: [String], default: [] },
  notes: { type: [Schema.Types.ObjectId], default: [] },   // notes that lost this course's tag (given back on restore)
}, opts).index({ user: 1, createdAt: -1 }));

/** A study group: members share deadlines, pages and a chat */
export const Group = model('Group', new Schema({
  name: { type: String, required: [true, 'Name the group'], trim: true, maxlength: 60 },
  description: { type: String, default: '', trim: true, maxlength: 300 },
  color: { type: String, default: '#2383e2', maxlength: 20 },
  owner: ref('User'),
  members: [{ _id: false, user: { type: Schema.Types.ObjectId, ref: 'User', required: true }, role: { type: String, enum: ['owner', 'member'], default: 'member' }, at: { type: Date, default: Date.now } }],
}, opts).index({ 'members.user': 1 }));

export const GroupMessage = model('GroupMessage', new Schema({
  group: ref('Group'),
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, required: true, trim: true, maxlength: 2000 },
}, opts).index({ group: 1, createdAt: -1 }));

/** A deadline the whole group works toward (each member can copy it into their own tasks) */
export const GroupTask = model('GroupTask', new Schema({
  group: ref('Group'),
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: [true, 'Title is required'], trim: true, maxlength: 200 },
  type: { type: String, enum: TASK_TYPES, default: 'Assignment' },
  dueDate: isoDate,
  done: { type: Boolean, default: false },
}, opts).index({ group: 1, dueDate: 1 }));

/** A report about a shared page or a group chat message, for the app's moderator to review */
export const REPORT_REASONS = ['harassment', 'hate', 'sexual', 'violence', 'spam', 'privacy', 'cheating', 'other'];
export const Report = model('Report', new Schema({
  kind: { type: String, enum: ['page', 'message', 'note_message'], required: true },
  note: { type: Schema.Types.ObjectId, ref: 'Note', default: null },
  message: { type: Schema.Types.ObjectId, ref: 'GroupMessage', default: null },
  noteMessage: { type: Schema.Types.ObjectId, ref: 'NoteMessage', default: null },   // a message in a page's chat
  group: { type: Schema.Types.ObjectId, ref: 'Group', default: null },
  author: { type: Schema.Types.ObjectId, ref: 'User', default: null },     // who wrote the reported content
  reporter: { type: Schema.Types.ObjectId, ref: 'User', default: null },   // null: someone without an account (public link)
  via: { type: String, enum: ['app', 'public'], default: 'app' },
  reason: { type: String, enum: REPORT_REASONS, required: true },
  details: { type: String, default: '', trim: true, maxlength: 1000 },
  snapshot: { type: String, default: '', maxlength: 2500 },                 // what the content said when it was reported
  status: { type: String, enum: ['open', 'removed'], default: 'open' },
}, opts).index({ reporter: 1, note: 1, message: 1, createdAt: -1 }));

/**
 * A student's linked Zoom account (only needed to START meetings; anyone can join with the link).
 * The tokens are encrypted (AES-256-GCM) and never sent to the browser.
 */
export const ZoomLink = model('ZoomLink', new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  zoomUserId: { type: String, required: true, index: true },
  email: { type: String, default: '' },
  access: { type: String, required: true },     // encrypted
  refresh: { type: String, required: true },    // encrypted
  expiresAt: { type: Date, required: true },
}, { timestamps: true }));

/** A video meeting of a study group: created through Zoom, or a link a member pasted (Zoom, Teams, Meet ...) */
export const GroupMeeting = model('GroupMeeting', new Schema({
  group: ref('Group'),
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  topic: { type: String, required: [true, 'Name the meeting'], trim: true, maxlength: 120 },
  provider: { type: String, enum: ['zoom', 'link'], default: 'zoom' },
  start: { type: Date, required: true },        // when it starts (for "now": the moment it was made)
  duration: { type: Number, default: 60, min: 5, max: 600 },   // minutes
  joinUrl: { type: String, required: true, maxlength: 1000 },
  zoomId: { type: String, default: '' },
  passcode: { type: String, default: '', maxlength: 40 },
}, opts).index({ group: 1, start: 1 }));

/** Earlier versions of a note page, saved automatically, so a page can be restored after a mistake */
export const NoteVersion = model('NoteVersion', new Schema({
  note: ref('Note'),
  user: { type: Schema.Types.ObjectId, ref: 'User', default: null },   // whose change came next (who "caused" the save)
  title: { type: String, default: '' },
  icon: { type: String, default: '' },
  content: { type: Schema.Types.Mixed, default: [] },
  length: { type: Number, default: 0 },                                 // characters of text, to show "1,240 characters"
  reason: { type: String, enum: ['auto', 'shrink'], default: 'auto' },  // shrink: saved just before a big part was removed
}, { timestamps: true }).index({ note: 1, createdAt: -1 }));

/** The chat on a shared note page: everyone who can open the page can read and write it */
export const NoteMessage = model('NoteMessage', new Schema({
  note: ref('Note'),
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, required: true, trim: true, maxlength: 2000 },
}, { timestamps: true }).index({ note: 1, createdAt: -1 }));
