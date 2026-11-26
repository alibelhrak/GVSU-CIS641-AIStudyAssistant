/**
 * Tools the Ask AI chat can use to change the student's planner.
 *
 * The AI model only *asks* for an action (a tool name and its arguments). This file checks every
 * argument, finds courses and tasks by name, and saves the change for the signed-in student only.
 * Nothing can be deleted from here; every action comes with an "undo" the browser can use.
 * The AI can also search and read the student's notes (search_notes, read_note), write new ones (add_note)
 * and add to an existing one (add_to_note).
 */
import { Course, Task, StudySession, StudyLog, Note, TASK_TYPES } from '../models/index.js';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{1,2}:\d{2}$/;
const PALETTE = ['#2b4fd8', '#d9730d', '#0f7b6c', '#ad1a72', '#6940a5', '#dfab01', '#e03e3e', '#337ea9'];
const PRIORITY = { high: 'high', med: 'med', medium: 'med', normal: 'med', low: 'low' };

const str = { type: 'string' };
const course = { type: 'string', description: 'The course code or name, for example "CIS 641"' };
const date = { type: 'string', description: 'Date as YYYY-MM-DD' };

/** What the AI model is told it can do (OpenAI "tools" format) */
export const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'add_course',
      description: 'Add a new course to the student\'s planner.',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'Short course code, for example "CIS 641"' },
          name: { type: 'string', description: 'Course name, for example "Software Engineering"' },
          weeklyGoalHours: { type: 'number', description: 'Hours the student wants to study each week (default 5)' },
        },
        required: ['code', 'name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_task',
      description: 'Add an assignment, exam, quiz, project or reading with a due date. The course must already exist.',
      parameters: {
        type: 'object',
        properties: {
          course,
          title: str,
          type: { type: 'string', enum: TASK_TYPES },
          dueDate: date,
          priority: { type: 'string', enum: ['high', 'med', 'low'] },
          hoursNeeded: { type: 'number', description: 'Estimated study hours needed (default 4)' },
        },
        required: ['course', 'title', 'type', 'dueDate'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_task',
      description: 'Change an existing assignment or exam: its due date, priority, hours needed, title, or mark it done / not done.',
      parameters: {
        type: 'object',
        properties: {
          task: { type: 'string', description: 'The current title of the task' },
          title: { type: 'string', description: 'New title' },
          dueDate: date,
          priority: { type: 'string', enum: ['high', 'med', 'low'] },
          hoursNeeded: { type: 'number' },
          done: { type: 'boolean' },
        },
        required: ['task'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_study_session',
      description: 'Plan a study session in the student\'s Study Schedule.',
      parameters: {
        type: 'object',
        properties: {
          course,
          date,
          startTime: { type: 'string', description: '24-hour time HH:MM (default 18:00)' },
          hours: { type: 'number', description: 'Length in hours, for example 1.5' },
          note: { type: 'string', description: 'What to focus on, for example "Practice exam questions"' },
        },
        required: ['course', 'date', 'hours'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_note',
      description: 'Create a new page in the student\'s Notes, for example a summary of an attached file, a study guide or lecture notes.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          markdown: { type: 'string', description: 'The note in Markdown: # headings, - bullets, 1. numbered lists, - [ ] to-dos, **bold**, tables, ```code```' },
          course: { type: 'string', description: 'Optional course code or name to tag the note with' },
          icon: { type: 'string', description: 'Optional single emoji for the page, for example 📘' },
        },
        required: ['title', 'markdown'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_note',
      description: 'Read one of the student\'s notes by its title, to answer questions, quiz the student or summarize it.',
      parameters: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_notes',
      description: 'Search all of the student\'s notes for words or a topic. Use it to answer questions about what the student wrote when you do not know which note it is in.',
      parameters: { type: 'object', properties: { query: { type: 'string', description: 'One to three key words' } }, required: ['query'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_to_note',
      description: 'Add Markdown to the end of an existing note (for example a summary, a quiz or more examples). Use add_note for a new page instead.',
      parameters: {
        type: 'object',
        properties: { title: { type: 'string', description: 'Title of the existing note' }, markdown: { type: 'string' } },
        required: ['title', 'markdown'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'log_study_time',
      description: 'Record study time the student already did (it counts toward their weekly goal).',
      parameters: {
        type: 'object',
        properties: { course, hours: { type: 'number' }, date: { type: 'string', description: 'YYYY-MM-DD, default today' } },
        required: ['course', 'hours'],
      },
    },
  },
];

class ToolError extends Error {}

const clean = (v, max = 120) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
function hours(v, { min = 0.25, max = 200, fallback } = {}) {
  const n = v === undefined || v === null || v === '' ? fallback : Number(v);
  if (n === undefined || !Number.isFinite(n) || n < min || n > max) throw new ToolError(`Hours must be a number between ${min} and ${max}.`);
  return Math.round(n * 4) / 4;                         // quarter hours
}
function isoDate(v, name = 'date') {
  // The round trip catches dates that do not exist, like 2026-02-30
  const real = ISO.test(v || '') && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
  if (!real) throw new ToolError(`The ${name} must be a real date written as YYYY-MM-DD.`);
  return v;
}
const shortDate = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

/** Finds one of the student's courses from what the AI wrote ("CIS641", "software engineering", ...) */
async function findCourse(userId, text) {
  const courses = await Course.find({ user: userId }).lean();
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const q = norm(text);
  if (!q) throw new ToolError('Say which course.');
  const list = courses.map((c) => `${c.code} (${c.name})`).join(', ') || 'none yet';
  const exact = courses.filter((c) => norm(c.code) === q || norm(c.name) === q || norm(c.code + c.name) === q);
  if (exact.length === 1) return exact[0];
  const loose = courses.filter((c) => q.includes(norm(c.code)) || norm(c.name).includes(q) || norm(c.code).includes(q));
  if (loose.length === 1) return loose[0];
  throw new ToolError(`No single course matches "${text}". The student's courses are: ${list}. Ask the student whether to add it as a new course; do not add it yourself.`);
}

/** Finds one of the student's tasks by its title */
async function findTask(userId, text) {
  const tasks = await Task.find({ user: userId }).lean();
  const q = clean(text).toLowerCase();
  if (!q) throw new ToolError('Say which task.');
  const exact = tasks.filter((t) => t.title.toLowerCase() === q);
  const found = exact.length ? exact : tasks.filter((t) => t.title.toLowerCase().includes(q) || q.includes(t.title.toLowerCase()));
  const open = found.filter((t) => !t.done);
  if (found.length === 1) return found[0];
  if (open.length === 1) return open[0];
  if (!found.length) throw new ToolError(`No task matches "${text}". Open tasks: ${tasks.filter((t) => !t.done).map((t) => t.title).join(', ') || 'none'}.`);
  throw new ToolError(`Several tasks match "${text}": ${found.map((t) => `${t.title} (due ${t.dueDate})`).join(', ')}. Use the exact title.`);
}

/** Finds one of the student's notes by its title */
async function findNote(userId, text) {
  const q = clean(text).toLowerCase();
  if (!q) throw new ToolError('Say which note.');
  const notes = await Note.find({ user: userId }).select('title text icon course updatedAt').lean();
  const title = (n) => (n.title || 'Untitled').toLowerCase();
  const exact = notes.filter((n) => title(n) === q);
  const found = exact.length ? exact : notes.filter((n) => title(n).includes(q) || q.includes(title(n)));
  if (found.length === 1) return found[0];
  const list = notes.map((n) => n.title || 'Untitled').slice(0, 30).join(', ') || 'none';
  if (!found.length) throw new ToolError(`No note matches "${text}". The student's notes are: ${list}.`);
  throw new ToolError(`Several notes match "${text}": ${found.map((n) => n.title).join(', ')}. Use the exact title.`);
}

const RUN = {
  async add_course(userId, a) {
    const code = clean(a.code, 30);
    const name = clean(a.name);
    if (!code || !name) throw new ToolError('A course needs a code and a name.');
    const existing = await Course.find({ user: userId }).lean();
    const same = existing.find((c) => c.code.toLowerCase().replace(/\s/g, '') === code.toLowerCase().replace(/\s/g, ''));
    if (same) return { result: { ok: true, note: 'This course already exists, nothing was added.', course: `${same.code} ${same.name}` } };
    const doc = await Course.create({
      user: userId, code, name,
      weeklyGoalHours: hours(a.weeklyGoalHours, { min: 0, max: 80, fallback: 5 }),
      color: PALETTE[existing.length % PALETTE.length],
    });
    return {
      result: { ok: true, added: `course ${doc.code} ${doc.name}` },
      action: { icon: 'book', title: 'Added course', detail: `${doc.code} · ${doc.name} · goal ${doc.weeklyGoalHours} h/week`,
        page: '/courses', undo: { method: 'DELETE', path: `/courses/${doc.id}` } },
    };
  },

  async add_task(userId, a, today) {
    const c = await findCourse(userId, a.course);
    const title = clean(a.title);
    if (!title) throw new ToolError('A task needs a title.');
    const type = TASK_TYPES.find((t) => t.toLowerCase() === String(a.type || '').toLowerCase()) || 'Assignment';
    const dueDate = isoDate(a.dueDate, 'due date');
    const dup = await Task.findOne({ user: userId, course: c._id, title, dueDate }).lean();
    if (dup) return { result: { ok: true, note: 'This task already exists, nothing was added.' } };
    const doc = await Task.create({
      user: userId, course: c._id, title, type, dueDate,
      priority: PRIORITY[String(a.priority || 'med').toLowerCase()] || 'med',
      hoursNeeded: hours(a.hoursNeeded, { min: 0, max: 200, fallback: 4 }),
    });
    const past = dueDate < today ? ' (this date is in the past)' : '';
    return {
      result: { ok: true, added: `${type} "${title}" for ${c.code}, due ${dueDate}${past}` },
      action: { icon: 'check', title: `Added ${type.toLowerCase()}`, detail: `${title} · ${c.code} · due ${shortDate(dueDate)} · ${doc.hoursNeeded} h`,
        page: '/tasks', undo: { method: 'DELETE', path: `/tasks/${doc.id}` } },
    };
  },

  async update_task(userId, a) {
    const t = await findTask(userId, a.task);
    const change = {};
    if (a.title !== undefined && clean(a.title)) change.title = clean(a.title);
    if (a.dueDate !== undefined) change.dueDate = isoDate(a.dueDate, 'due date');
    if (a.priority !== undefined) change.priority = PRIORITY[String(a.priority).toLowerCase()] || t.priority;
    if (a.hoursNeeded !== undefined) change.hoursNeeded = hours(a.hoursNeeded, { min: 0 });
    if (typeof a.done === 'boolean') change.done = a.done;
    if (!Object.keys(change).length) throw new ToolError('Say what to change.');
    const before = Object.fromEntries(Object.keys(change).map((k) => [k, t[k]]));
    await Task.updateOne({ _id: t._id, user: userId }, change, { runValidators: true });
    const words = Object.entries(change).map(([k, v]) => (k === 'done' ? (v ? 'marked done' : 'marked not done')
      : k === 'dueDate' ? `due ${shortDate(v)}` : k === 'hoursNeeded' ? `${v} h needed` : k === 'priority' ? `${v === 'med' ? 'medium' : v} priority` : `renamed to "${v}"`));
    return {
      result: { ok: true, updated: t.title, changes: change },
      action: { icon: change.done ? 'check' : 'pencil', title: 'Updated task', detail: `${t.title} · ${words.join(', ')}`,
        page: '/tasks', undo: { method: 'PATCH', path: `/tasks/${t._id}`, body: before } },
    };
  },

  async add_study_session(userId, a) {
    const c = await findCourse(userId, a.course);
    const day = isoDate(a.date);
    let startTime = clean(a.startTime, 5) || '18:00';
    if (!TIME.test(startTime)) throw new ToolError('Start time must be HH:MM (24-hour).');
    startTime = startTime.padStart(5, '0');
    const doc = await StudySession.create({
      user: userId, course: c._id, date: day, startTime,
      hours: hours(a.hours, { max: 12 }), note: clean(a.note, 200),
    });
    return {
      result: { ok: true, added: `study session for ${c.code} on ${day} at ${startTime}, ${doc.hours} h` },
      action: { icon: 'calendar', title: 'Planned study session', detail: `${c.code} · ${shortDate(day)} ${startTime} · ${doc.hours} h${doc.note ? ` · ${doc.note}` : ''}`,
        page: '/schedule', undo: { method: 'DELETE', path: `/sessions/${doc.id}` } },
    };
  },

  async add_note(userId, a) {
    const title = clean(a.title, 200) || 'Untitled';
    const markdown = typeof a.markdown === 'string' ? a.markdown.slice(0, 60000) : '';
    if (!markdown.trim()) throw new ToolError('The note needs some content.');
    const course = a.course ? (await findCourse(userId, a.course))._id : null;
    const icon = typeof a.icon === 'string' && a.icon.trim().length <= 8 ? a.icon.trim() : '📝';
    const doc = await Note.create({ user: userId, title, icon, course, markdown, text: markdown });
    return {
      result: { ok: true, added: `note "${title}"` },
      action: { icon: 'note', title: 'Created note', detail: `${icon} ${title}`,
        page: `/notes/${doc.id}`, undo: { method: 'DELETE', path: `/notes/${doc.id}` } },
    };
  },

  async read_note(userId, a) {
    const n = await findNote(userId, a.title);
    return { result: { ok: true, title: n.title, text: (n.text || '(empty note)').slice(0, 12000) } };
  },

  async search_notes(userId, a) {
    const words = clean(a.query, 100).toLowerCase().split(/\s+/).filter((w) => w.length > 1).slice(0, 5);
    if (!words.length) throw new ToolError('Give some words to search for.');
    const notes = await Note.find({ user: userId }).select('title text').lean();
    const hits = notes.map((n) => {
      const hay = `${n.title}\n${n.text || ''}`.toLowerCase();
      const score = words.reduce((s, w) => s + (hay.split(w).length - 1) + (n.title.toLowerCase().includes(w) ? 5 : 0), 0);
      const at = Math.max(0, hay.indexOf(words[0]));
      return { title: n.title || 'Untitled', score, excerpt: (n.text || '').slice(Math.max(0, at - 300), at + 900) };
    }).filter((x) => x.score > 0).sort((x, y) => y.score - x.score).slice(0, 4);
    if (!hits.length) return { result: { ok: true, found: 0, message: `No note mentions "${a.query}".` } };
    return { result: { ok: true, found: hits.length, notes: hits.map(({ title, excerpt }) => ({ title, excerpt })) } };
  },

  async add_to_note(userId, a) {
    const markdown = typeof a.markdown === 'string' ? a.markdown.slice(0, 30000).trim() : '';
    if (!markdown) throw new ToolError('Say what to add.');
    const found = await findNote(userId, a.title);
    const n = await Note.findById(found._id);
    // The editor turns this Markdown into blocks at the end of the page the next time it opens
    n.markdown = n.markdown ? `${n.markdown}\n\n${markdown}` : markdown;
    n.text = `${n.text || ''}\n\n${markdown}`.slice(0, 200000);
    await n.save();
    return {
      result: { ok: true, added_to: n.title },
      action: { icon: 'note', title: 'Added to note', detail: `${n.icon || '📝'} ${n.title || 'Untitled'}`, page: `/notes/${n.id}` },
    };
  },

  async log_study_time(userId, a, today) {
    const c = await findCourse(userId, a.course);
    const day = a.date ? isoDate(a.date) : today;
    const doc = await StudyLog.create({ user: userId, course: c._id, date: day, hours: hours(a.hours, { max: 16 }) });
    return {
      result: { ok: true, logged: `${doc.hours} h for ${c.code} on ${day}` },
      action: { icon: 'clip', title: 'Logged study time', detail: `${c.code} · ${doc.hours} h · ${shortDate(day)}`,
        page: '/', undo: { method: 'DELETE', path: `/logs/${doc.id}` } },
    };
  },
};

/**
 * Runs one tool call for the signed-in student.
 * Returns `result` (sent back to the AI) and, when something changed, `action` (shown in the chat).
 */
export async function runTool(userId, name, rawArgs, today) {
  let args = {};
  try { args = typeof rawArgs === 'string' ? JSON.parse(rawArgs || '{}') : rawArgs || {}; } catch {
    return { result: { ok: false, error: 'The arguments were not valid JSON.' } };
  }
  const fn = RUN[name];
  if (!fn) return { result: { ok: false, error: `Unknown tool ${name}.` } };
  try {
    return await fn(userId, args, today);
  } catch (err) {
    if (err instanceof ToolError) return { result: { ok: false, error: err.message } };
    if (err.name === 'ValidationError') return { result: { ok: false, error: Object.values(err.errors)[0]?.message || 'Invalid data' } };
    console.error('Chat tool failed:', name, err);
    return { result: { ok: false, error: 'Saving failed on the server.' } };
  }
}
