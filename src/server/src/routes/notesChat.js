/**
 * Notes AI chat: the panel on the right of a note, like Notion AI.
 *
 * The browser sends the conversation and the page as a list of blocks, each with its id and its Markdown.
 * The model answers in words and can change the page with tools (edit, insert, delete a block, or rewrite
 * the page). The server checks every change and passes it on to the browser, which applies it to the
 * editor right away and keeps a copy of the page from before, so the student can Undo.
 *
 * The answer is sent as one JSON object per line:
 *   {"t":"text","v":"..."}                     words of the answer
 *   {"t":"edit","op":{...},"label":"..."}      a change to apply to the page
 *   {"t":"error","v":"..."}                    a problem after the answer started
 */
import { config, chatEnabled } from '../config.js';
import { HttpError } from '../middleware/error.js';
import { cleanAttachments, toApiMessage, thinkFilter } from './chat.js';
import { fetchLLM, isGarbled } from '../services/llmGuard.js';
import { langOf, replyIn, LANG_NAMES } from '../i18n.js';

const MAX_PAGE = 16000;        // characters of the page sent to the model
const MAX_MESSAGES = 16;

const SYSTEM = `You are Notes AI, the assistant inside a student's notes page in the AI Study Assistant app (like Notion AI).
You can answer questions about the page, explain, quiz, brainstorm, and you can CHANGE THE PAGE with your tools.

THE PAGE is given as blocks: "[id] markdown". Use the ids exactly as given.
- edit_block: replace one block with new Markdown (can be several blocks).
- insert_blocks: add new Markdown after a block id, or at "START" or "END".
- delete_block: remove a block.
- replace_page: rewrite the whole page. Only when the student asks to rewrite or reorganize everything.
Rules:
- Only change the page when the student asks you to write, add, fix, format, translate, reorganize or remove something.
  For questions, just answer in the chat.
- Prefer small, precise edits to the blocks that need them. Keep everything else as it is.
- Write Markdown: # headings, - bullets, 1. lists, - [ ] to-dos, **bold**, tables, > quotes, \`\`\` code.
  For math use plain text (x^2, sqrt(x), sum over i) because the editor has no equation blocks.
- After changing the page, answer with one or two sentences saying what you changed. Do not repeat the new text.
- Answer in the student's language. Be accurate; say so when you are not sure.`;

const TOOLS = [
  { type: 'function', function: { name: 'edit_block', description: 'Replace one block of the page with new Markdown.',
    parameters: { type: 'object', properties: { id: { type: 'string' }, markdown: { type: 'string' } }, required: ['id', 'markdown'] } } },
  { type: 'function', function: { name: 'insert_blocks', description: 'Insert new Markdown after a block, or at START or END of the page.',
    parameters: { type: 'object', properties: { after: { type: 'string', description: 'A block id, "START" or "END"' }, markdown: { type: 'string' } }, required: ['after', 'markdown'] } } },
  { type: 'function', function: { name: 'delete_block', description: 'Remove one block from the page.',
    parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } } },
  { type: 'function', function: { name: 'replace_page', description: 'Rewrite the whole page with new Markdown.',
    parameters: { type: 'object', properties: { markdown: { type: 'string' } }, required: ['markdown'] } } },
];

const short = (s, n = 48) => { const t = String(s || '').replace(/[#*_>`|-]+/g, ' ').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n)}…` : t; };

export default async function notesChat(req, res) {
  if (!chatEnabled()) throw new HttpError(503, 'The AI is not set up yet. The server needs LLM_BASE_URL, LLM_API_KEY and LLM_MODEL.');
  const b = req.body || {};
  const title = typeof b.title === 'string' ? b.title.slice(0, 200) : '';
  // The page: [{ id, md }]
  const blocks = (Array.isArray(b.blocks) ? b.blocks : [])
    .filter((x) => typeof x?.id === 'string' && /^[\w-]{1,64}$/.test(x.id) && typeof x.md === 'string')
    .slice(0, 400);
  const ids = new Map(blocks.map((x) => [x.id, x.md]));
  let pageText = '';
  let cut = false;
  for (const x of blocks) {
    const line = `[${x.id}] ${x.md.trim() || '(empty)'}\n`;
    if (pageText.length + line.length > MAX_PAGE) { cut = true; break; }
    pageText += line;
  }

  const messages = (Array.isArray(b.messages) ? b.messages : [])
    .filter((m) => m?.role === 'user' || m?.role === 'assistant')
    .map((m) => ({ role: m.role, content: typeof m.content === 'string' ? m.content.slice(0, 6000) : '',
      attachments: m.role === 'user' ? cleanAttachments(m.attachments) : [] }))
    .filter((m) => m.content.trim() || m.attachments.length)
    .slice(-MAX_MESSAGES);
  if (!messages.length || messages.at(-1).role !== 'user') throw new HttpError(400, 'Type a message first');
  let newest = -1;
  messages.forEach((m, i) => { if (m.attachments.some((a) => a.type !== 'name')) newest = i; });
  const apiMessages = messages.map((m, i) => toApiMessage(m, i === newest));
  const hasImages = apiMessages.some((m) => Array.isArray(m.content));
  if (hasImages && !config.llm.visionModel) throw new HttpError(400, 'Reading pictures is not set up yet (the server needs VISION_MODEL). Files and text work without it.');
  const model = hasImages ? config.llm.visionModel : config.llm.chatModel;
  const convo = [
    { role: 'system', content: `${SYSTEM}${replyIn(langOf(req))}${langOf(req) !== 'en' ? `Text you write into the page follows the page's own language; on an empty page use ${LANG_NAMES[langOf(req)]}.\n` : ''}\n\nPAGE TITLE: ${title || 'Untitled'}\nTHE PAGE${cut ? ' (only the first part fits; the rest is not shown)' : ''}:\n${pageText || '(the page is empty; use insert_blocks with after "START")'}` },
    ...apiMessages,
  ];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 240000);
  res.on('close', () => controller.abort());
  let started = false;
  const send = (obj) => {
    if (!started) {
      res.status(200).set({ 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' });
      res.flushHeaders();
      started = true;
    }
    res.write(`${JSON.stringify(obj)}\n`);
  };
  const fail = (status, message) => { if (!started) throw new HttpError(status, message); send({ t: 'error', v: message }); };

  async function ask(withTools) {
    let upstream;
    try {
      upstream = await fetchLLM(`${config.llm.baseUrl}/chat/completions`, {
        method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', ...(config.llm.apiKey ? { Authorization: `Bearer ${config.llm.apiKey}` } : {}) },
        body: JSON.stringify({ model, stream: true, temperature: 0.3, max_tokens: 4000, messages: convo,
          ...(withTools ? { tools: TOOLS, tool_choice: 'auto' } : {}) }),
      }, { onWait: (ms) => send({ t: 'status', v: `The AI service is busy (free plan limit). Continuing in ${Math.ceil(ms / 1000)} s…` }) });
    } catch (err) {
      if (err.name === 'AbortError') return null;
      fail(502, 'Could not reach the AI service. Try again in a moment.');
      return null;
    }
    if (upstream.ok && upstream.body) return upstream;
    const detail = await upstream.text().catch(() => '');
    if (withTools && upstream.status === 400 && /tool|function/i.test(detail)) return ask(false);
    console.warn('Notes chat: LLM responded', upstream.status, detail.slice(0, 300));
    fail(502, upstream.status === 429 ? 'The AI is busy right now (rate limit). Wait a few seconds and try again.'
      : upstream.status === 413 ? 'This page and files are too long for the AI at once. Try a shorter file.'
        : 'The AI service returned an error. Try again in a moment.');
    return null;
  }

  /** Checks one change and sends it to the browser. Returns what the model is told. */
  function apply(name, rawArgs) {
    let a;
    try { a = JSON.parse(rawArgs || '{}'); } catch { return { ok: false, error: 'The arguments were not valid JSON.' }; }
    const md = typeof a.markdown === 'string' ? a.markdown.slice(0, 30000) : '';
    const known = (id) => ids.has(id);
    if (name === 'edit_block') {
      if (!known(a.id)) return { ok: false, error: `No block with id "${a.id}".` };
      send({ t: 'edit', op: { type: 'edit', id: a.id, markdown: md }, label: `Edited "${short(ids.get(a.id))}"`, before: ids.get(a.id).slice(0, 600) });
      return { ok: true };
    }
    if (name === 'insert_blocks') {
      const after = a.after === 'START' || a.after === 'END' || known(a.after) ? a.after : 'END';
      if (!md.trim()) return { ok: false, error: 'Nothing to insert.' };
      const where = after === 'START' ? 'at the top' : after === 'END' ? 'at the end' : `after "${short(ids.get(after), 30)}"`;
      send({ t: 'edit', op: { type: 'insert', after, markdown: md }, label: `Added ${short(md, 34) || 'blocks'} ${where}` });
      return { ok: true };
    }
    if (name === 'delete_block') {
      if (!known(a.id)) return { ok: false, error: `No block with id "${a.id}".` };
      send({ t: 'edit', op: { type: 'delete', id: a.id }, label: `Removed "${short(ids.get(a.id))}"`, before: ids.get(a.id).slice(0, 600) });
      ids.delete(a.id);
      return { ok: true };
    }
    if (name === 'replace_page') {
      if (!md.trim()) return { ok: false, error: 'The new page is empty.' };
      send({ t: 'edit', op: { type: 'page', markdown: md }, label: 'Rewrote the page' });
      return { ok: true };
    }
    return { ok: false, error: `Unknown tool ${name}` };
  }

  try {
    let wroteText = false;
    let garbled = false;
    let edits = 0;
    for (let round = 0; round < 6 && !garbled; round += 1) {
      const upstream = await ask(true);
      if (!upstream) break;
      const reader = upstream.body.getReader();
      const decoder = new TextDecoder();
      const visible = thinkFilter();
      const calls = [];
      let text = '';
      let sent = 0;
      let buffer = '';
      const emit = (piece) => {
        if (!piece || garbled) return;
        if (!text && wroteText) { send({ t: 'text', v: '\n\n' }); sent += 2; }
        text += piece;
        wroteText = true;
        sent += piece.length;
        send({ t: 'text', v: piece });
        if (isGarbled(text)) { garbled = true; send({ t: 'cut', n: sent }); reader.cancel().catch(() => {}); }
      };
      for (;;) {
        const { value, done } = await reader.read().catch(() => ({ done: true }));
        if (done || garbled) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
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
      if (garbled) break;
      const todo = calls.filter((c) => c?.name).slice(0, 40);
      if (!todo.length) break;
      convo.push({ role: 'assistant', content: text || null,
        tool_calls: todo.map((c, k) => ({ id: c.id || `call_${round}_${k}`, type: 'function', function: { name: c.name, arguments: c.args || '{}' } })) });
      for (const [k, c] of todo.entries()) {
        const result = apply(c.name, c.args);
        if (result.ok) edits += 1;
        convo.push({ role: 'tool', tool_call_id: c.id || `call_${round}_${k}`, content: JSON.stringify(result) });
      }
    }
    if (garbled) send({ t: 'text', v: edits ? `Done. I made ${edits} change${edits > 1 ? 's' : ''} to the page (see the steps above).` : '_The answer came out garbled, so I stopped it. Please try again._' });
    if (!started && !controller.signal.aborted) send({ t: 'text', v: '_The AI gave an empty answer. Please try again._' });
  } catch (err) {
    if (err instanceof HttpError) throw err;
    if (err.name !== 'AbortError') { console.warn('Notes chat: stream stopped:', err.message); fail(502, 'The answer was cut off. Please try again.'); }
  } finally {
    clearTimeout(timer);
    if (started || controller.signal.aborted) res.end();
  }
}
