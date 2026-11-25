/**
 * "Ask AI": a chat with a large language model that knows the student's own data.
 * The server adds the student's courses, deadlines, hours and study gaps,
 * calls any OpenAI-compatible /chat/completions API with stream: true,
 * and passes the answer back to the browser piece by piece.
 */
import { Router } from 'express';
import { config, chatEnabled } from '../config.js';
import { Course, Task, StudySession, StudyLog, Recommendation, User } from '../models/index.js';
import { h, HttpError } from '../middleware/error.js';
import { addDays, buildCandidates, daysBetween } from '../services/recommendationEngine.js';

const r = Router();
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const MAX_MESSAGES = 20;       // only the most recent part of a long conversation is sent
const MAX_CHARS = 4000;        // per message

const PRIORITY = { high: 'high', med: 'medium', low: 'low' };

/** A short, plain-text summary of the student's data for the model. */
async function studentContext(userId, today) {
  const [user, courses, tasks, sessions, logs, recs] = await Promise.all([
    User.findById(userId).lean(),
    Course.find({ user: userId }).lean(),
    Task.find({ user: userId, done: false }).sort({ dueDate: 1 }).lean(),
    StudySession.find({ user: userId }).lean(),
    StudyLog.find({ user: userId }).lean(),
    Recommendation.find({ user: userId, status: 'pending' }).lean(),
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

STUDENT DATA
`;

r.post('/', h(async (req, res) => {
  if (!chatEnabled()) {
    throw new HttpError(503, 'The AI chat is not set up yet. The server needs LLM_BASE_URL, LLM_API_KEY and LLM_MODEL.');
  }
  const today = ISO.test(req.body?.today) ? req.body.today : new Date().toISOString().slice(0, 10);
  const incoming = Array.isArray(req.body?.messages) ? req.body.messages : [];
  const messages = incoming
    .filter((m) => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-MAX_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
  if (!messages.length || messages[messages.length - 1].role !== 'user') throw new HttpError(400, 'Type a message first');

  const context = await studentContext(req.userId, today);

  // Stop asking the model if the student closes the page or presses Stop
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  res.on('close', () => controller.abort());

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
        model: config.llm.chatModel,
        stream: true,
        temperature: 0.6,
        max_tokens: 1500,
        messages: [{ role: 'system', content: SYSTEM + context }, ...messages],
      }),
    });
  } catch (err) {
    clearTimeout(timer);
    console.warn('Chat: could not reach the LLM:', err.message);
    throw new HttpError(502, 'Could not reach the AI service. Try again in a moment.');
  }
  if (!upstream.ok || !upstream.body) {
    clearTimeout(timer);
    console.warn('Chat: LLM responded', upstream.status, (await upstream.text().catch(() => '')).slice(0, 300));
    throw new HttpError(502, upstream.status === 429
      ? 'The AI is busy right now (rate limit). Wait a few seconds and try again.'
      : 'The AI service returned an error. Try again in a moment.');
  }

  // Pass the answer through as plain text, piece by piece
  res.status(200).set({ 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();                                   // keep a half-received line for later
      for (const line of lines) {
        const data = line.trim().startsWith('data:') ? line.trim().slice(5).trim() : '';
        if (!data || data === '[DONE]') continue;
        try {
          const piece = JSON.parse(data).choices?.[0]?.delta?.content;
          if (piece) res.write(piece);
        } catch { /* ignore keep-alive or partial lines */ }
      }
    }
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.warn('Chat: stream stopped:', err.message);
      res.write('\n\n_The answer was cut off. Please try again._');
    }
  } finally {
    clearTimeout(timer);
    res.end();
  }
}));

export default r;