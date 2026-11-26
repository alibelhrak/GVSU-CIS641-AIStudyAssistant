/**
 * "Ask AI": a chat with a large language model that knows the student's own data.
 *
 * The browser sends the conversation; the server adds a system message with the
 * student's courses, deadlines, hours studied and study gaps, calls any
 * OpenAI-compatible /chat/completions API with stream: true, and passes the
 * answer back to the browser piece by piece, so it appears word by word.
 *
 * Messages can carry attachments: text taken from files (read in the browser, PDFs too)
 * and pictures. Only the newest attachments are sent again, to keep requests small.
 * Pictures go to VISION_MODEL, a model that can see images.
 *
 * The AI can also change the planner with tools (add courses, tasks and study sessions, log time,
 * update tasks); see services/chatTools.js. The answer is sent as one JSON object per line:
 *   {"t":"text","v":"..."}    words of the answer
 *   {"t":"action",...}        something the AI changed (shown as a card with Undo)
 *   {"t":"error","v":"..."}   a problem after the answer started
 */
import { Router } from 'express';
import { config, chatEnabled } from '../config.js';
import { Course, Task, StudySession, StudyLog, Recommendation, User, Note } from '../models/index.js';
import { h, HttpError } from '../middleware/error.js';
import { addDays, buildCandidates, daysBetween } from '../services/recommendationEngine.js';
import { TOOLS, runTool } from '../services/chatTools.js';

const r = Router();
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const MAX_MESSAGES = 20;       // only the most recent part of a long conversation is sent
const MAX_CHARS = 4000;        // typed text per message
const MAX_FILE_CHARS = 16000;  // text taken from attached files (free AI plans have small limits)
const MAX_IMAGES = 3;          // pictures per message
const IMAGE_URL = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;

const PRIORITY = { high: 'high', med: 'medium', low: 'low' };

/** A short, plain-text summary of the student's data for the model. */
async function studentContext(userId, today) {
  const [user, courses, tasks, sessions, logs, recs, notes] = await Promise.all([
    User.findById(userId).lean(),
    Course.find({ user: userId }).lean(),
    Task.find({ user: userId, done: false }).sort({ dueDate: 1 }).lean(),
    StudySession.find({ user: userId }).lean(),
    StudyLog.find({ user: userId }).lean(),
    Recommendation.find({ user: userId, status: 'pending' }).lean(),
    Note.find({ user: userId }).select('title course updatedAt').sort({ updatedAt: -1 }).limit(40).lean(),
  ]);
  const code = new Map(courses.map((c) => [String(c._id), c.code]));
  const weekStart = addDays(today, -6);
  const hoursThisWeek = (id) =>
    sessions.filter((s) => String(s.course) === id && s.done && s.date >= weekStart && s.date <= today).reduce((t, s) => t + s.hours, 0) +
    logs.filter((l) => String(l.course) === id && l.date >= weekStart && l.date <= today).reduce((t, l) => t + l.hours, 0);

  const lines = [`Student: ${user?.name || 'Student'}`, `Today: ${today}`, ''];

  lines.push('Courses (hours studied in the last 7 days / weekly goal):');
  if (!courses.length) lines.push('- none yet');
  for (const c of courses) lines.push(`- ${c.code} ${c.name}: ${hoursThisWeek(String(c._id))} h / ${c.weeklyGoalHours} h`);

  lines.push('', 'Open tasks due in the next 30 days:');
  const soon = tasks.filter((t) => { const d = daysBetween(today, t.dueDate); return d >= -3 && d <= 30; });
  if (!soon.length) lines.push('- none');
  for (const t of soon.slice(0, 25)) {
    const d = daysBetween(today, t.dueDate);
    const when = d < 0 ? `${-d} days overdue` : d === 0 ? 'due today' : d === 1 ? 'due tomorrow' : `due in ${d} days`;
    lines.push(`- ${code.get(String(t.course)) || '?'} | ${t.type}: ${t.title} | ${t.dueDate} (${when}) | ${PRIORITY[t.priority]} priority | needs about ${t.hoursNeeded} h`);
  }

  const gaps = buildCandidates({ tasks, sessions, logs, today, max: 5 });
  lines.push('', 'Study gaps computed by the app (hours still needed = needed - studied - planned):');
  if (!gaps.length) lines.push('- none, the student is on track');
  for (const g of gaps) {
    const t = tasks.find((x) => String(x._id) === g.taskId);
    lines.push(`- ${code.get(g.courseId) || '?'} ${t?.title}: needs ${g.neededHours} h, studied ${g.studiedHours} h, planned ${g.plannedHours} h, gap ${g.gapHours} h, ${g.daysLeft} days left`);
  }

  const upcoming = sessions.filter((s) => !s.done && s.date >= today && s.date <= addDays(today, 7))
    .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
  lines.push('', 'Planned study sessions in the next 7 days:');
  if (!upcoming.length) lines.push('- none');
  for (const s of upcoming.slice(0, 20)) lines.push(`- ${s.date} ${s.startTime}, ${s.hours} h, ${code.get(String(s.course)) || '?'}${s.note ? ` (${s.note})` : ''}`);

  lines.push('', 'Notes the student wrote (titles only; use read_note to read one):');
  if (!notes.length) lines.push('- none');
  for (const n of notes) lines.push(`- ${n.title || 'Untitled'}${n.course ? ` (${code.get(String(n.course)) || '?'})` : ''}`);

  if (recs.length) {
    lines.push('', 'Recommendations currently shown on the dashboard:');
    for (const rec of recs) lines.push(`- ${rec.message}`);
  }
  return lines.join('\n');
}

const SYSTEM = `You are "Study Assistant", a friendly and very capable study coach built into a student planner app.
You can help with anything a strong tutor can: explain concepts step by step, give examples, quiz the student,
summarize topics, help with writing and code, and plan study time.

When the question is about the student's own courses, deadlines, hours or plans, use ONLY the data below.
Never invent courses, deadlines, hours or sessions that are not in the data. If something is missing, say so
and suggest adding it in the app (Courses, Assignments & Exams, or Study Schedule).
When you suggest a plan, be concrete (days, hours, what to do in each session) and realistic.
Write in clear, simple English. Use Markdown: short paragraphs, bullet lists, **bold** for key points,
and code blocks for code. Keep answers focused; do not repeat the whole data back to the student.
When the student attaches files or pictures, read them carefully and refer to them by name.
Tables are welcome when they help (Markdown tables with a |---| header row).

YOU CAN CHANGE THE PLANNER with your tools: add_course, add_task, update_task, add_study_session, log_study_time, add_note, add_to_note.
You can also read the student's notes: read_note for one note, search_notes to find where a topic is written.
When the student asks about "my notes", look them up first and answer from them, naming the note you used.
- When the student asks you to add, create, plan, schedule, log, move or finish something, DO IT with the tools
  instead of explaining how to do it by hand. You may call several tools at once (for example every exam in a syllabus).
- Work out real dates (YYYY-MM-DD) from Today. If something important is missing and has no sensible default
  (for example the due date of an exam), ask one short question first. Defaults: weekly goal 5 h, task 4 h,
  priority med, session start 18:00.
- Add a course with add_course before adding its tasks if it does not exist yet.
- If a tool answers with ok:false, fix the problem or tell the student. Never say you did something that failed.
- After using tools, confirm in one or two short sentences what you did. Do not repeat every detail; the app shows them.
- You cannot delete anything. If the student wants to delete, tell them to use the page in the app.

HOW THE APP WORKS (use these exact names; never invent buttons or pages that are not listed here)
- Dashboard: "What to study next" shows the app's recommendations; each has "Accept and add to schedule" and "Dismiss".
  It also shows "Study progress" (hours this week against each course's goal), "Upcoming deadlines",
  "Today's sessions" and "Log study time" (pick a Course and Hours, then "Log time").
- Courses: the "Add a course" form has Course code, Course name, Weekly study goal (hrs) and Color, then "Add course".
- Assignments & Exams: the "Add an assignment, exam or task" form has Title, Course, Type (Assignment, Exam, Quiz,
  Project, Reading), Due date, Priority and Study hours needed, then "Add". Tasks are ticked off when done.
- Study Schedule: the "Add a study session" form has Course, Date, Start, Hours and Focus, then "Add session".
  Sessions are ticked off when finished.
- Materials: choose a course under "Add to a course", then "Upload files" or "Add a link".
- Notes: Notion-style pages with sub-pages. Type "/" in a page for headings, lists, to-dos, tables, code and pictures.
  Each page can have an emoji, a course tag and be a favorite. "Ask AI" on a page sends it to this chat.
- Ask AI: this chat. The student can attach files and pictures, dictate, or use Voice mode.
When the student asks you to write, summarize or save something as a note, use add_note with well-structured Markdown;
to add to a note that already exists, use add_to_note.
Inside a note, the student can also select text or press Ctrl+J (or type /ai) to have AI write or edit right in the page.

STUDENT DATA
`;

/** Keep only well-formed attachments, within the size limits. */
function cleanAttachments(list) {
  if (!Array.isArray(list)) return [];
  let chars = 0;
  let images = 0;
  const out = [];
  for (const a of list.slice(0, 8)) {
    const name = typeof a?.name === 'string' ? a.name.slice(0, 120) : 'file';
    if (a?.type === 'text' && typeof a.text === 'string' && chars < MAX_FILE_CHARS) {
      const text = a.text.slice(0, MAX_FILE_CHARS - chars);
      chars += text.length;
      out.push({ type: 'text', name, text, cut: text.length < a.text.length });
    } else if (a?.type === 'image' && typeof a.dataUrl === 'string' && images < MAX_IMAGES
      && a.dataUrl.length < 3_000_000 && IMAGE_URL.test(a.dataUrl)) {
      images += 1;
      out.push({ type: 'image', name, dataUrl: a.dataUrl });
    } else {
      out.push({ type: 'name', name });          // too big, or already sent earlier: just mention it
    }
  }
  return out;
}

/** One chat message in the format the AI API expects. */
function toApiMessage(m, withFiles) {
  if (m.role !== 'user' || !m.attachments.length) return { role: m.role, content: m.content };
  const files = m.attachments.map((a) => {
    if (withFiles && a.type === 'text') {
      return `\n\n--- Attached file: ${a.name} ---\n${a.text}${a.cut ? '\n[... the rest of the file was cut to fit ...]' : ''}\n--- End of ${a.name} ---`;
    }
    if (withFiles && a.type === 'image') return `\n\n[Attached picture: ${a.name}]`;
    return `\n\n[The student attached "${a.name}" earlier in the conversation]`;
  }).join('');
  const text = (m.content || 'Please look at the attached file.') + files;
  const images = withFiles ? m.attachments.filter((a) => a.type === 'image') : [];
  if (!images.length) return { role: 'user', content: text };
  return {
    role: 'user',
    content: [{ type: 'text', text }, ...images.map((a) => ({ type: 'image_url', image_url: { url: a.dataUrl } }))],
  };
}

/** Some models "think out loud" inside <think>...</think>. Hide that part from the student. */
export function thinkFilter() {
  let inside = false;
  let buf = '';
  const partial = (s, tag) => { for (let k = Math.min(tag.length - 1, s.length); k > 0; k -= 1) if (tag.startsWith(s.slice(-k))) return k; return 0; };
  const push = (piece) => {
    buf += piece;
    let out = '';
    for (;;) {
      const tag = inside ? '</think>' : '<think>';
      const at = buf.indexOf(tag);
      if (at < 0) {
        const keep = partial(buf, tag);
        if (!inside) out += buf.slice(0, buf.length - keep);
        buf = buf.slice(buf.length - keep);
        return out;
      }
      if (!inside) out += buf.slice(0, at);
      buf = buf.slice(at + tag.length);
      inside = !inside;
    }
  };
  push.flush = () => { const rest = inside ? '' : buf; buf = ''; return rest; };
  return push;
}

r.post('/', h(async (req, res) => {
  if (!chatEnabled()) {
    throw new HttpError(503, 'The AI chat is not set up yet. The server needs LLM_BASE_URL, LLM_API_KEY and LLM_MODEL.');
  }
  const today = ISO.test(req.body?.today) ? req.body.today : new Date().toISOString().slice(0, 10);
  const incoming = Array.isArray(req.body?.messages) ? req.body.messages : [];
  const messages = incoming
    .filter((m) => m?.role === 'user' || m?.role === 'assistant')
    .map((m) => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content.slice(0, MAX_CHARS) : '',
      attachments: m.role === 'user' ? cleanAttachments(m.attachments) : [],
    }))
    .filter((m) => m.content.trim() || m.attachments.length)
    .slice(-MAX_MESSAGES);
  if (!messages.length || messages[messages.length - 1].role !== 'user') throw new HttpError(400, 'Type a message first');

  // Only the newest message with attachments sends its files again; older ones are just named
  let newest = -1;
  messages.forEach((m, i) => { if (m.attachments.some((a) => a.type !== 'name')) newest = i; });
  const apiMessages = messages.map((m, i) => toApiMessage(m, i === newest));
  const hasImages = apiMessages.some((m) => Array.isArray(m.content));
  if (hasImages && !config.llm.visionModel) {
    throw new HttpError(400, 'Reading pictures is not set up yet. The server needs VISION_MODEL (for Groq: qwen/qwen3.8-27b). Files and text work without it.');
  }
  const model = hasImages ? config.llm.visionModel : config.llm.chatModel;
  const convo = [{ role: 'system', content: SYSTEM + await studentContext(req.userId, today) }, ...apiMessages];

  // Stop asking the model if the student closes the page or presses Stop
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120000);
  res.on('close', () => controller.abort());

  // The answer is sent as one JSON object per line (see the top of this file)
  let started = false;
  const send = (obj) => {
    if (!started) {
      res.status(200).set({ 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' });
      res.flushHeaders();
      started = true;
    }
    res.write(`${JSON.stringify(obj)}\n`);
  };
  const fail = (status, message) => {
    if (!started) throw new HttpError(status, message);
    send({ t: 'error', v: message });
  };

  /** Asks the model once. Returns the response, or null after reporting an error. */
  async function ask(withTools) {
    let upstream;
    try {
      upstream = await fetch(`${config.llm.baseUrl}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(config.llm.apiKey ? { Authorization: `Bearer ${config.llm.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model,
          stream: true,
          temperature: 0.5,
          max_tokens: 2000,
          messages: convo,
          ...(withTools ? { tools: TOOLS, tool_choice: 'auto' } : {}),
        }),
      });
    } catch (err) {
      if (err.name === 'AbortError') return null;
      console.warn('Chat: could not reach the LLM:', err.message);
      fail(502, 'Could not reach the AI service. Try again in a moment.');
      return null;
    }
    if (upstream.ok && upstream.body) return upstream;
    const detail = await upstream.text().catch(() => '');
    // Some models sometimes write a broken tool call; then answer once more without tools
    if (withTools && upstream.status === 400 && /tool|function/i.test(detail)) {
      console.warn('Chat: tool call failed, answering without tools:', detail.slice(0, 200));
      return ask(false);
    }
    console.warn('Chat: LLM responded', upstream.status, detail.slice(0, 300));
    const why = {
      429: 'The AI is busy right now (rate limit). Wait a few seconds and try again.',
      413: 'That is too much text for the AI at once. Attach a shorter file or start a new chat.',
    }[upstream.status];
    fail(502, why || 'The AI service returned an error. Try again in a moment.');
    return null;
  }

  try {
    let wroteText = false;
    for (let round = 0; round < 5; round += 1) {
      const upstream = await ask(true);
      if (!upstream) break;

      // Read the streamed answer: words go straight to the browser, tool calls are collected
      const reader = upstream.body.getReader();
      const decoder = new TextDecoder();
      const visible = thinkFilter();
      const calls = [];
      let text = '';
      let buffer = '';
      const emit = (piece) => {
        if (!piece) return;
        if (!text && wroteText) send({ t: 'text', v: '\n\n' });   // a new paragraph after earlier actions
        text += piece;
        wroteText = true;
        send({ t: 'text', v: piece });
      };
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();                                   // keep a half-received line for later
        for (const line of lines) {
          const data = line.trim().startsWith('data:') ? line.trim().slice(5).trim() : '';
          if (!data || data === '[DONE]') continue;
          let delta;
          try { delta = JSON.parse(data).choices?.[0]?.delta; } catch { continue; }
          if (delta?.content) emit(visible(delta.content));
          for (const tc of delta?.tool_calls || []) {
            const c = (calls[tc.index ?? calls.length] ||= { id: '', name: '', args: '' });
            if (tc.id) c.id = tc.id;
            if (tc.function?.name) c.name += tc.function.name;
            if (tc.function?.arguments) c.args += tc.function.arguments;
          }
        }
      }
      emit(visible.flush());

      const todo = calls.filter((c) => c?.name).slice(0, 20);
      if (!todo.length) break;                                   // a normal answer: finished

      // Run the tools, show each change, and give the results back to the model
      convo.push({
        role: 'assistant',
        content: text || null,
        tool_calls: todo.map((c, k) => ({ id: c.id || `call_${round}_${k}`, type: 'function', function: { name: c.name, arguments: c.args || '{}' } })),
      });
      for (const [k, c] of todo.entries()) {
        const { result, action } = await runTool(req.userId, c.name, c.args, today);
        if (action) send({ t: 'action', ...action });
        convo.push({ role: 'tool', tool_call_id: c.id || `call_${round}_${k}`, content: JSON.stringify(result) });
      }
      if (round === 4) send({ t: 'text', v: '\n\n_I stopped after several steps. Ask me to continue if something is missing._' });
    }
    if (!started && !controller.signal.aborted) send({ t: 'text', v: '_The AI gave an empty answer. Please try again._' });
  } catch (err) {
    if (err instanceof HttpError) throw err;
    if (err.name !== 'AbortError') {
      console.warn('Chat: stream stopped:', err.message);
      fail(502, 'The answer was cut off. Please try again.');
    }
  } finally {
    clearTimeout(timer);
    if (started) res.end();
    else if (!res.headersSent && controller.signal.aborted) res.end();
  }
}));

export default r;
