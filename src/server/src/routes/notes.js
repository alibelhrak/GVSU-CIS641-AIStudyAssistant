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
import crypto from 'node:crypto';
import { Note, Course, Feedback, Folder, User, Group } from '../models/index.js';
import { noteAccess, canEdit, groupIdsOf } from '../services/access.js';
import { claimSeed, seedDone } from '../services/collab.js';
import { moveToTrash } from '../services/trash.js';
import { h, HttpError } from '../middleware/error.js';
import { config, chatEnabled } from '../config.js';
import { thinkFilter } from './chat.js';
import notesChat from './notesChat.js';
import { langOf, LANG_NAMES } from '../i18n.js';
import { notifyPageShared } from '../services/invites.js';
import { fetchLLM, isGarbled } from '../services/llmGuard.js';

const r = Router();

// ---------- AI code suggestions ("ghost text", like Copilot in VS Code) ----------
// Short and fast: the recommendation model (or CODE_MODEL), no streaming, at most 20 per minute per student.
const codeCalls = new Map();   // userId -> times of recent requests
function codeQuota(userId) {
  const now = Date.now();
  const recent = (codeCalls.get(userId) || []).filter((t) => now - t < 60000);
  if (recent.length >= 20) return false;
  recent.push(now);
  codeCalls.set(userId, recent);
  if (codeCalls.size > 5000) codeCalls.delete(codeCalls.keys().next().value);
  return true;
}
const CODE_SYSTEM = `You are a code completion engine, like GitHub Copilot, inside a student's notes app.
Continue the code exactly at <CURSOR>. Reply with ONLY the text to insert at the cursor:
- no explanation, no Markdown, no code fences, no quotes around it;
- never repeat code that is already before the cursor, and do not repeat what comes after it;
- finish the current line, and add up to 8 more lines only when they clearly belong (for example the body of a function);
- match the existing indentation, naming and style; keep it correct and simple, as for a student;
- if nothing useful fits, reply with an empty answer.`;

/** Clean what the model returned so it can be inserted as is */
export function cleanCompletion(raw, before, after) {
  let text = String(raw || '').replace(/<think>[\s\S]*?<\/think>/g, '');
  const fence = text.match(/```[\w+#-]*\n?([\s\S]*?)(?:```|$)/);
  if (fence) text = fence[1];
  text = text.replace(/<\/?CURSOR\/?>/g, '').replace(/\s+$/, '');
  // The model sometimes repeats the start of the current line: drop the repeated part
  const line = before.slice(before.lastIndexOf('\n') + 1);
  if (line.trim() && text.startsWith(line)) text = text.slice(line.length);
  else if (line.trim() && text.trimStart().startsWith(line.trim()) && line.trim().length > 2) text = text.trimStart().slice(line.trim().length);
  // ...or what already follows the cursor
  const next = after.split('\n')[0].trim();
  if (next && text.endsWith(next)) text = text.slice(0, -next.length);
  return text.length > 1200 ? text.slice(0, 1200) : text;
}

r.post('/complete', h(async (req, res) => {
  const model = process.env.CODE_MODEL || config.llm.model || config.llm.chatModel;
  if (!config.llm.baseUrl || !model) return res.json({ text: '' });
  if (!codeQuota(String(req.userId))) return res.json({ text: '', limited: true });
  const b = req.body || {};
  const language = String(b.language || 'text').replace(/[^\w+#-]/g, '').slice(0, 30) || 'text';
  const before = String(b.before || '').slice(-3000);
  const after = String(b.after || '').slice(0, 800);
  if (!before.trim()) return res.json({ text: '' });
  const user = `Note title: ${String(b.title || '').slice(0, 120) || '(none)'}
Language: ${language === 'text' ? 'unknown (guess from the code)' : language}

${before}<CURSOR>${after}`;
  let upstream;
  try {
    upstream = await fetchLLM(`${config.llm.baseUrl}/chat/completions`, {
      method: 'POST',
      signal: AbortSignal.timeout(9000),
      headers: { 'Content-Type': 'application/json', ...(config.llm.apiKey ? { Authorization: `Bearer ${config.llm.apiKey}` } : {}) },
      body: JSON.stringify({
        model, temperature: 0.15, max_tokens: 220,
        ...(/gpt-oss/i.test(model) ? { reasoning_effort: 'low' } : {}),
        messages: [{ role: 'system', content: CODE_SYSTEM }, { role: 'user', content: user }],
      }),
    }, { retries: 0 });
  } catch {
    return res.json({ text: '' });
  }
  if (!upstream.ok) return res.json({ text: '', busy: upstream.status === 429 });
  const data = await upstream.json().catch(() => null);
  const text = cleanCompletion(data?.choices?.[0]?.message?.content, before, after);
  res.json({ text });   // (no garble check: code is full of symbols)
}));
const MAX_CONTENT = 3_000_000;          // characters of editor data per note (pictures included)
const LIST_FIELDS = 'title icon parent course folder favorite updatedAt createdAt shares groups publicId';
// What someone a page is shared with may change (the owner keeps course, folder, place and layout)
const EDITOR_FIELDS = ['title', 'icon', 'cover', 'coverY', 'content', 'text', 'markdown'];

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
      line = b?.type === 'codeBlock' ? `\`\`\`${String(b.props?.language || '').replace(/[^\w+#-]/g, '').replace(/^text$/, '')}\n${t}\n\`\`\`` : t ? mark + t : '';
    }
    const kids = blocksToText(b?.children, depth + 1);
    return [line && pad + line, kids].filter(Boolean).join('\n');
  }).filter(Boolean).join('\n');
}

async function checkRefs(userId, { parent, course, folder }, selfId) {
  if (folder && (!mongoose.isValidObjectId(folder) || !(await Folder.exists({ _id: folder, user: userId })))) {
    throw new HttpError(400, 'Folder not found');
  }
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
  if (body.folder !== undefined) out.folder = body.folder || null;
  if (typeof body.wide === 'boolean') out.wide = body.wide;
  if (['s', 'm', 'l'].includes(body.textSize)) out.textSize = body.textSize;
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
- [ ] to-dos, **bold**, tables, > quotes and \`\`\` code (always name the language: \`\`\`python, \`\`\`java ...). Never add a preamble ("Here is...", "Sure") or a closing remark,
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
  const appLang = LANG_NAMES[langOf(req)];
  if (b.action === 'translate') task = `Translate the ${selection ? 'SELECTED TEXT' : 'PAGE'} to ${lang || appLang}, keeping the format.`;
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
        messages: [{ role: 'system', content: appLang === 'English' ? WRITE : `${WRITE}\nThe app is set to ${appLang}: when the page is empty or the student writes the request in ${appLang}, write in ${appLang}.` }, { role: 'user', content: parts.join('\n\n') }],
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
  await Feedback.create({ user: req.userId, where: b.where === 'ask-ai' ? 'ask-ai' : 'notes-ai', rating: b.rating,
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

// Pages other people shared with this student (by email or through a study group)
r.get('/shared', h(async (req, res) => {
  const groups = await groupIdsOf(req.userId);
  const notes = await Note.find({ user: { $ne: req.userId }, $or: [{ 'shares.user': req.userId }, { groups: { $in: groups } }] })
    .select('title icon updatedAt user shares groups').sort({ updatedAt: -1 }).limit(200).lean();
  const owners = new Map((await User.find({ _id: { $in: [...new Set(notes.map((n) => String(n.user)))] } }).select('name').lean()).map((u) => [String(u._id), u.name]));
  const mineIds = new Set(groups.map(String));
  res.json(notes.map((n) => {
    const share = n.shares?.find((x) => String(x.user) === String(req.userId));
    const viaGroup = (n.groups || []).some((g) => mineIds.has(String(g)));
    return { id: String(n._id), title: n.title, icon: n.icon, updatedAt: n.updatedAt, owner: owners.get(String(n.user)) || '', role: viaGroup ? 'editor' : share?.role || 'viewer' };
  }));
}));

r.get('/:id', h(async (req, res) => {
  const { note, role } = await noteAccess(req.params.id, req.userId);
  if (!role) throw new HttpError(404, 'Note not found');
  const out = { ...note.toJSON(), role, shared: Boolean(note.shares.length || note.groups.length) };
  if (role !== 'owner') {
    // other people's organisation of the page is not theirs to see
    Object.assign(out, { course: null, folder: null, parent: null, favorite: false, publicId: undefined, shares: undefined, groups: undefined });
    out.owner = (await User.findById(note.user).select('name').lean())?.name || '';
  }
  res.json(out);
}));

r.post('/', h(async (req, res) => {
  const data = pick(req.body);
  await checkRefs(req.userId, data);
  const note = await Note.create({ ...data, user: req.userId });
  res.status(201).json(note);
}));

r.patch('/:id', h(async (req, res) => {
  const { note: found, role } = await noteAccess(req.params.id, req.userId, '_id');
  if (!role) throw new HttpError(404, 'Note not found');
  if (!canEdit(role)) throw new HttpError(403, 'You can only view this page');
  let data = pick(req.body);
  if (role === 'owner') await checkRefs(req.userId, data, req.params.id);
  else data = Object.fromEntries(Object.entries(data).filter(([k]) => EDITOR_FIELDS.includes(k)));
  const note = await Note.findByIdAndUpdate(found._id, data, { new: true, runValidators: true });
  const { content, text, cover, ...meta } = note.toJSON();   // the editor already has these
  if (role !== 'owner') Object.assign(meta, { course: null, folder: null, parent: null, favorite: false, publicId: undefined, shares: undefined, groups: undefined });
  res.json({ ...meta, role });
}));

// ---------- Sharing (the owner decides; people shared with can leave) ----------
const MAX_SHARES = 50;
const ownNote = async (req) => {
  const note = await Note.findOne(mine(req));
  if (!note) throw new HttpError(404, 'Note not found');
  return note;
};
async function sharingOf(note, userId) {
  const people = await User.find({ _id: { $in: note.shares.map((s) => s.user) } }).select('name email avatar').lean();
  const byId = new Map(people.map((u) => [String(u._id), u]));
  const myGroups = await Group.find({ 'members.user': userId }).select('name color members').lean();
  return {
    shares: note.shares.filter((s) => byId.has(String(s.user))).map((s) => {
      const u = byId.get(String(s.user));
      return { id: String(u._id), name: u.name, email: u.email, avatar: u.avatar || '', role: s.role };
    }),
    groups: note.groups.map(String),
    myGroups: myGroups.map((g) => ({ id: String(g._id), name: g.name, color: g.color, members: g.members.length })),
    publicId: note.publicId || null,
  };
}

r.get('/:id/sharing', h(async (req, res) => {
  res.json(await sharingOf(await ownNote(req), req.userId));
}));

// Invite someone who already has an account, by email
r.post('/:id/share', h(async (req, res) => {
  const note = await ownNote(req);
  const email = String(req.body?.email || '').trim().toLowerCase();
  const role = req.body?.role === 'viewer' ? 'viewer' : 'editor';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Enter an email address');
  const user = await User.findOne({ email }).select('_id emailVerified').lean();
  if (!user || user.emailVerified === false) throw new HttpError(404, 'No account uses this email yet. Ask them to sign up first, then invite them.');
  if (String(user._id) === String(req.userId)) throw new HttpError(400, 'This is your own page');
  const old = note.shares.find((s) => String(s.user) === String(user._id));
  if (old) old.role = role;
  else {
    if (note.shares.length >= MAX_SHARES) throw new HttpError(400, `A page can be shared with up to ${MAX_SHARES} people`);
    note.shares.push({ user: user._id, role });
  }
  await note.save();
  // Tell the new person by email (and push), without making the owner wait
  if (!old) notifyPageShared({ toId: user._id, fromId: req.userId, note, role });
  res.json(await sharingOf(note, req.userId));
}));

r.patch('/:id/share/:userId', h(async (req, res) => {
  const note = await ownNote(req);
  const s = note.shares.find((x) => String(x.user) === req.params.userId);
  if (!s) throw new HttpError(404, 'Not shared with this person');
  s.role = req.body?.role === 'viewer' ? 'viewer' : 'editor';
  await note.save();
  res.json(await sharingOf(note, req.userId));
}));

// The owner removes someone, or someone leaves a page shared with them
r.delete('/:id/share/:userId', h(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Note not found');
  const leaving = req.params.userId === 'me' || req.params.userId === String(req.userId);
  if (leaving) {
    const note = await Note.findOne({ _id: req.params.id, 'shares.user': req.userId });
    if (note) {
      note.shares = note.shares.filter((x) => String(x.user) !== String(req.userId));
      await note.save();
    }
    return res.json({ ok: true });
  }
  const note = await ownNote(req);
  note.shares = note.shares.filter((x) => String(x.user) !== req.params.userId);
  await note.save();
  res.json(await sharingOf(note, req.userId));
}));

// Share with study groups the owner belongs to (members can edit)
r.put('/:id/groups', h(async (req, res) => {
  const note = await ownNote(req);
  const ids = (Array.isArray(req.body?.groups) ? req.body.groups : []).filter((g) => mongoose.isValidObjectId(g)).slice(0, 20);
  const mineOnly = await Group.find({ _id: { $in: ids }, 'members.user': req.userId }).select('_id').lean();
  note.groups = mineOnly.map((g) => g._id);
  await note.save();
  res.json(await sharingOf(note, req.userId));
}));

// "Share to web": a link anyone can open to read the page (no account needed)
r.post('/:id/public', h(async (req, res) => {
  const note = await ownNote(req);
  note.publicId = req.body?.on ? (note.publicId || crypto.randomBytes(15).toString('base64url')) : undefined;
  await note.save();
  res.json(await sharingOf(note, req.userId));
}));

// Live editing: the first person to open an empty shared page fills it from the saved version
r.post('/:id/collab/seed', h(async (req, res) => {
  const { note, role } = await noteAccess(req.params.id, req.userId, '_id');
  if (!canEdit(role)) return res.json({ seed: false });
  if (req.body?.done) { seedDone(String(note._id)); return res.json({ ok: true }); }
  res.json({ seed: claimSeed(String(note._id), req.userId) });
}));

// Deleting a page also deletes its sub-pages
r.delete('/:id', h(async (req, res) => {
  const root = await Note.findOne(mine(req)).lean();
  if (!root) throw new HttpError(404, 'Note not found');
  // the page and its sub-pages go to the Trash together
  const trashId = await moveToTrash('note', root, req.userId);
  res.json({ ok: true, trashId });
}));

export default r;
