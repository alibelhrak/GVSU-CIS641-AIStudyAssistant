/**
 * Notes: Notion-style pages the student writes in the app.
 * A note can sit inside another note (sub-pages), have an emoji icon, belong to a course and be a favorite.
 * The editor's blocks are stored as they are, plus a plain-text copy used for search and by Ask AI.
 *
 * POST /api/notes/ai is the AI inside the editor (like Notion AI): it writes, continues, summarizes or
 * rewrites text and streams back Markdown, which the editor turns into blocks.
 */
import { Router } from 'express';
import mongoose from 'mongoose';
import { Note, Course, Feedback } from '../models/index.js';
import { h, HttpError } from '../middleware/error.js';
import { config, chatEnabled } from '../config.js';
import { thinkFilter } from './chat.js';
import notesChat from './notesChat.js';
import { fetchLLM, isGarbled } from '../services/llmGuard.js';

const r = Router();
const MAX_CONTENT = 3_000_000;          // characters of editor data per note (pictures included)
const LIST_FIELDS = 'title icon parent course favorite updatedAt createdAt';

const mine = (req) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Note not found');
  return { _id: req.params.id, user: req.userId };
};

/** Plain text of the editor blocks (headings, lists, tables...), for search and the AI */
export function blocksToText(blocks, depth = 0) {
  if (!Array.isArray(blocks)) return '';
  const inline = (c) => (typeof c === 'string' ? c : Array.isArray(c) ? c.map((x) => (x?.type === 'link' ? inline(x.content) : x?.text || '')).join('') : '');
  return blocks.map((b) => {
    const pad = '  '.repeat(depth);
    let line = '';
    if (b?.type === 'table') {
      line = (b.content?.rows || []).map((row) => row.cells.map((cell) => inline(cell?.content || cell)).join(' | ')).join('\n');
    } else {
      const t = inline(b?.content);
      const mark = { heading: '#'.repeat(b?.props?.level || 1) + ' ', bulletListItem: '- ', numberedListItem: '1. ',
        checkListItem: b?.props?.checked ? '[x] ' : '[ ] ', quote: '> ' }[b?.type] || '';
      line = b?.type === 'codeBlock' ? `\`\`\`\n${t}\n\`\`\`` : t ? mark + t : '';
    }
    const kids = blocksToText(b?.children, depth + 1);
    return [line && pad + line, kids].filter(Boolean).join('\n');
  }).filter(Boolean).join('\n');
}

async function checkRefs(userId, { parent, course }, selfId) {
  if (parent) {
    if (!mongoose.isValidObjectId(parent) || !(await Note.exists({ _id: parent, user: userId }))) throw new HttpError(400, 'Parent page not found');
    // A page cannot be moved inside itself or one of its own sub-pages
    for (let id = parent; id && selfId; ) {
      if (String(id) === String(selfId)) throw new HttpError(400, 'A page cannot go inside itself');
      id = (await Note.findById(id).select('parent').lean())?.parent;
    }
  }
  if (course && (!mongoose.isValidObjectId(course) || !(await Course.exists({ _id: course, user: userId })))) {
    throw new HttpError(400, 'Choose one of your courses');
  }
}

function pick(body = {}) {
  const out = {};
  if (typeof body.title === 'string') out.title = body.title.slice(0, 200);
  if (typeof body.icon === 'string') out.icon = body.icon.slice(0, 16);
  if (typeof body.favorite === 'boolean') out.favorite = body.favorite;
  if (typeof body.cover === 'string') {
    const ok = body.cover === '' || /^[a-z]{2,20}$/.test(body.cover)
      || (body.cover.length <= 1_500_000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(body.cover));
    if (!ok) throw new HttpError(400, 'That cover picture is too big or not a picture. Try a JPG or PNG.');
    out.cover = body.cover;
  }
  if (typeof body.coverY === 'number' && Number.isFinite(body.coverY)) out.coverY = Math.min(100, Math.max(0, Math.round(body.coverY)));
  if (body.parent !== undefined) out.parent = body.parent || null;
  if (body.course !== undefined) out.course = body.course || null;
  if (typeof body.markdown === 'string') out.markdown = body.markdown.slice(0, 100000);
  if (body.content !== undefined) {
    if (!Array.isArray(body.content)) throw new HttpError(400, 'Invalid note content');
    if (JSON.stringify(body.content).length > MAX_CONTENT) throw new HttpError(413, 'This note is too big. Remove some pictures or split it into sub-pages.');
    out.content = body.content;
    out.text = blocksToText(body.content).slice(0, 200000);
  }
  return out;
}

// All pages (without their content), most recently edited first
r.get('/', h(async (req, res) => {
  res.json(await Note.find({ user: req.userId }).select(LIST_FIELDS).sort({ updatedAt: -1 }));
}));

// ---------- AI inside the editor ----------
const WRITE = `You are the writing assistant inside a student's notes app, like Notion AI.
Reply with ONLY the text that goes into the note, written in Markdown: # headings, - bullets, 1. numbered lists,
- [ ] to-dos, **bold**, tables, > quotes and \`\`\` code. Never add a preamble ("Here is...", "Sure") or a closing remark,
and never wrap the whole answer in a code block. Keep it accurate, clear and useful for studying.
Write in the same language as the note unless asked to translate. Use LaTeX-free plain math (x^2, sqrt(x)).`;

/** What each button asks for. {sel} = the student selected text; otherwise the answer goes at the cursor. */
const ACTIONS = {
  // with selected text
  improve: 'Improve the writing of the SELECTED TEXT: clearer and better flow, same meaning, same format (lists stay lists).',
  fix: 'Fix spelling, grammar and punctuation in the SELECTED TEXT. Change nothing else.',
  shorter: 'Make the SELECTED TEXT shorter, keeping the important ideas.',
  longer: 'Make the SELECTED TEXT longer, with more detail and explanation.',
  simplify: 'Rewrite the SELECTED TEXT in simpler words a first-year student understands.',
  explain: 'Explain the SELECTED TEXT simply, with an example. Start with a short heading-free paragraph.',
  bullets: 'Turn the SELECTED TEXT into a clear bullet list.',
  table: 'Turn the SELECTED TEXT into a Markdown table with sensible columns.',
  professional: 'Rewrite the SELECTED TEXT in a formal, academic tone.',
  // at the cursor
  continue: 'Continue writing the page from where it stops (the last part of the PAGE). Write 1-3 paragraphs or list items that fit naturally.',
  summary: 'Write a short summary of the PAGE: a "## Summary" heading and 3-6 bullets.',
  takeaways: 'Write the key takeaways of the PAGE: a "## Key takeaways" heading and the 5 most important points to remember for an exam.',
  quiz: 'Write a practice quiz on the PAGE: a "## Practice quiz" heading, 5 numbered questions (mix of multiple choice and short answer), then a "### Answers" heading with the answers.',
  flashcards: 'Make flashcards from the PAGE: a "## Flashcards" heading and a table with columns Term | Definition (8-12 rows).',
  todos: 'Find the tasks and things to review in the PAGE and write them as a "## To do" heading with - [ ] to-dos.',
  outline: 'Write an outline for this page based on its title and content: headings and bullets to fill in.',
  brainstorm: 'Brainstorm ideas for the topic of the PAGE: a "## Ideas" heading and 8-10 bullets.',
};

r.post('/ai', h(async (req, res) => {
  if (!chatEnabled()) throw new HttpError(503, 'The AI is not set up yet. The server needs LLM_BASE_URL, LLM_API_KEY and LLM_MODEL.');
  const b = req.body || {};
  const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
  const selection = str(b.selection, 12000).trim();
  const page = str(b.page, 14000);
  const prompt = str(b.prompt, 2000).trim();
  const lang = str(b.language, 40).trim();
  let task = ACTIONS[b.action];
  if (b.action === 'translate') task = `Translate the ${selection ? 'SELECTED TEXT' : 'PAGE'} to ${lang || 'English'}, keeping the format.`;
  if (!task && !prompt) throw new HttpError(400, 'Tell the AI what to write');
  if (task?.includes('SELECTED TEXT') && !selection) throw new HttpError(400, 'Select some text first');
  if (!task) task = selection
    ? `Do this with the SELECTED TEXT: ${prompt}\nYour answer replaces the selection or goes under it.`
    : `Do this: ${prompt}\nYour answer is inserted into the page at the cursor.`;
  else if (prompt) task += `\nAlso: ${prompt}`;

  const parts = [`PAGE TITLE: ${str(b.title, 200) || 'Untitled'}`, `PAGE:\n${page.trim() || '(empty page)'}`];
  if (selection) parts.push(`SELECTED TEXT:\n${selection}`);
  parts.push(`TASK: ${task}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  res.on('close', () => controller.abort());
  let upstream;
  try {
    upstream = await fetchLLM(`${config.llm.baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...(config.llm.apiKey ? { Authorization: `Bearer ${config.llm.apiKey}` } : {}) },
      body: JSON.stringify({
        model: config.llm.chatModel, stream: true, temperature: 0.4, max_tokens: 2500,
        messages: [{ role: 'system', content: WRITE }, { role: 'user', content: parts.join('\n\n') }],
      }),
    });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') return res.end();
    throw new HttpError(502, 'Could not reach the AI service. Try again in a moment.');
  }
  if (!upstream.ok || !upstream.body) {
    clearTimeout(timer);
    const detail = await upstream.text().catch(() => '');
    console.warn('Notes AI: LLM responded', upstream.status, detail.slice(0, 300));
    throw new HttpError(502, upstream.status === 429 ? 'The AI is busy right now. Wait a few seconds and try again.' : 'The AI service returned an error. Try again in a moment.');
  }

  // Pass the words on as plain text while they arrive
  res.status(200).set({ 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  const filter = thinkFilter();
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let written = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done || isGarbled(written)) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        const data = line.replace(/^data:\s*/, '').trim();
        if (!data || data === '[DONE]' || !line.startsWith('data:')) continue;
        try {
          const piece = JSON.parse(data).choices?.[0]?.delta?.content;
          if (piece) { const out = filter(piece); if (out) { written += out; res.write(out); } }
        } catch { /* a broken line; skip it */ }
      }
    }
    const rest = filter.flush();
    if (rest) res.write(rest);
  } catch (err) {
    if (err.name !== 'AbortError') console.warn('Notes AI: stream stopped:', err.message);
  } finally {
    clearTimeout(timer);
    res.end();
  }
}));

// The AI chat panel next to a note (see notesChat.js)
r.post('/chat', h(notesChat));

// Thumbs up / down on an AI answer
r.post('/feedback', h(async (req, res) => {
  const b = req.body || {};
  if (b.rating !== 'up' && b.rating !== 'down') throw new HttpError(400, 'Rating must be up or down');
  await Feedback.create({ user: req.userId, where: 'notes-ai', rating: b.rating,
    prompt: String(b.prompt || '').slice(0, 2000), answer: String(b.answer || '').slice(0, 4000) });
  res.status(201).json({ ok: true });
}));

// Search titles and text
r.get('/search', h(async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 100);
  if (!q) return res.json([]);
  const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const found = await Note.find({ user: req.userId, $or: [{ title: rx }, { text: rx }] }).select(`${LIST_FIELDS} text`).limit(30);
  res.json(found.map((n) => {
    const at = n.text.search(rx);
    const snippet = at < 0 ? '' : n.text.slice(Math.max(0, at - 40), at + 80).replace(/[#*_`>|~]+|\[ ?x?\]/g, ' ').replace(/\s+/g, ' ').trim();
    const { text, ...rest } = n.toJSON();
    return { ...rest, snippet };
  }));
}));

r.get('/:id', h(async (req, res) => {
  const note = await Note.findOne(mine(req));
  if (!note) throw new HttpError(404, 'Note not found');
  res.json(note);
}));

r.post('/', h(async (req, res) => {
  const data = pick(req.body);
  await checkRefs(req.userId, data);
  const note = await Note.create({ ...data, user: req.userId });
  res.status(201).json(note);
}));

r.patch('/:id', h(async (req, res) => {
  const data = pick(req.body);
  await checkRefs(req.userId, data, req.params.id);
  const note = await Note.findOneAndUpdate(mine(req), data, { new: true, runValidators: true });
  if (!note) throw new HttpError(404, 'Note not found');
  const { content, text, cover, ...meta } = note.toJSON();   // the editor already has these
  res.json(meta);
}));

// Deleting a page also deletes its sub-pages
r.delete('/:id', h(async (req, res) => {
  const root = await Note.findOne(mine(req)).select('_id');
  if (!root) throw new HttpError(404, 'Note not found');
  const ids = [root._id];
  for (let level = [root._id]; level.length; ) {
    level = (await Note.find({ user: req.userId, parent: { $in: level } }).select('_id').lean()).map((n) => n._id);
    ids.push(...level);
  }
  await Note.deleteMany({ user: req.userId, _id: { $in: ids } });
  res.json({ deleted: ids.length });
}));

export default r;
