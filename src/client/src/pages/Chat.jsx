import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getToken } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useData } from '../lib/store.jsx';
import { todayIso } from '../lib/dates.js';
import { Icon } from '../icons.jsx';
import '../chat.css';

const SUGGESTIONS = [
  { title: 'What should I study tonight?', text: 'Look at my deadlines and tell me where to start.' },
  { title: 'Plan my week', text: 'Make a day-by-day study plan for my upcoming deadlines.' },
  { title: 'Add my exams for me', text: 'Add my CIS 641 final exam on December 12 and plan three 2-hour study sessions before it.' },
  { title: 'Quiz me', text: 'Give me 5 quick questions to test what I know about my most urgent exam topic. Ask them one at a time.' },
];

// ---------- Limits for attachments (the server checks them again) ----------
const MAX_FILES = 5;
const MAX_IMAGES = 3;
const MAX_TEXT = 16000;                 // characters of text taken from one message's files
const MAX_FILE_MB = 20;
const TEXT_FILE = /\.(txt|md|markdown|csv|tsv|json|xml|html?|css|jsx?|tsx?|py|java|c|cpp|h|hpp|cs|go|rb|php|sql|sh|bat|ya?ml|ini|log|tex|r|swift|kt|ipynb)$/i;

// ---------- Tiny, safe Markdown → HTML (escape first, then format): lists, tables, code, quotes ----------
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function inline(s) {
  return s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])_([^_]+)_(?=[\s.,!?)]|$)/g, '$1<em>$2</em>')
    .replace(/(^|[\s(])\*([^*]+)\*(?=[\s.,!?)]|$)/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const cells = (row) => row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => inline(c.trim()));
export function markdown(src) {
  const out = [];
  const parts = esc(src).split(/```/);                      // odd parts are code blocks
  parts.forEach((part, i) => {
    if (i % 2 === 1) {
      const code = part.replace(/^[\w+-]*\n/, '');          // drop the language name
      out.push(`<pre><code>${code.replace(/\n$/, '')}</code></pre>`);
      return;
    }
    let list = null;                                         // 'ul' | 'ol' | null
    const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
    const lines = part.split('\n');
    for (let k = 0; k < lines.length; k += 1) {
      const line = lines[k].trimEnd();
      // Table: a "| a | b |" row followed by a "|---|---|" row
      if (TABLE_ROW.test(line) && TABLE_SEP.test(lines[k + 1] || '')) {
        close();
        const head = cells(line);
        const rows = [];
        for (k += 2; k < lines.length && TABLE_ROW.test(lines[k].trimEnd()); k += 1) rows.push(cells(lines[k]));
        k -= 1;
        out.push(`<div class="md-table"><table><thead><tr>${head.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${
          rows.map((r) => `<tr>${head.map((_, j) => `<td>${r[j] ?? ''}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
        continue;
      }
      const h = line.match(/^(#{1,4})\s+(.*)/);
      const ul = line.match(/^\s*[-*•]\s+(.*)/);
      const ol = line.match(/^\s*\d+[.)]\s+(.*)/);
      const quote = line.match(/^&gt;\s?(.*)/);
      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { close(); out.push('<hr />'); }
      else if (h) { close(); out.push(`<h4>${inline(h[2])}</h4>`); }
      else if (ul) { if (list !== 'ul') { close(); out.push('<ul>'); list = 'ul'; } out.push(`<li>${inline(ul[1])}</li>`); }
      else if (ol) { if (list !== 'ol') { close(); out.push('<ol>'); list = 'ol'; } out.push(`<li>${inline(ol[1])}</li>`); }
      else if (quote) { close(); out.push(`<blockquote>${inline(quote[1])}</blockquote>`); }
      else if (!line.trim()) { close(); }
      else { close(); out.push(`<p>${inline(line)}</p>`); }
    }
    close();
  });
  return out.join('');
}

// ---------- Reading attached files in the browser ----------
const fmtSize = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`);
let nextId = 1;

/** Text from every page of a PDF (the PDF reader is loaded only when it is first needed) */
async function readPdf(file) {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  let text = '';
  for (let p = 1; p <= doc.numPages && text.length < MAX_TEXT; p += 1) {
    const content = await (await doc.getPage(p)).getTextContent();
    text += `\n[Page ${p}]\n${content.items.map((it) => (it.str || '') + (it.hasEOL ? '\n' : ' ')).join('')}`;
  }
  return { text: text.trim(), pages: doc.numPages };
}

/** Pictures are made smaller (longest side 1280 px, JPEG) so they upload fast */
async function shrinkImage(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.85);
}

async function readFile(file, imagesSoFar) {
  if (file.size > MAX_FILE_MB * 1048576) throw new Error(`${file.name} is larger than ${MAX_FILE_MB} MB`);
  const base = { id: nextId++, name: file.name || 'pasted image', size: file.size };
  if (/^image\/(png|jpe?g|webp|gif)$/.test(file.type)) {
    if (imagesSoFar >= MAX_IMAGES) throw new Error(`Up to ${MAX_IMAGES} pictures per message`);
    return { ...base, type: 'image', dataUrl: await shrinkImage(file) };
  }
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    const { text, pages } = await readPdf(file);
    if (!text) throw new Error(`${file.name} has no text to read (it may be a scanned PDF). Try a screenshot instead.`);
    return { ...base, type: 'text', text: text.slice(0, MAX_TEXT), info: `PDF · ${pages} page${pages > 1 ? 's' : ''}` };
  }
  if (file.type.startsWith('text/') || TEXT_FILE.test(file.name)) {
    const text = await file.text();
    return { ...base, type: 'text', text: text.slice(0, MAX_TEXT), info: fmtSize(file.size) };
  }
  if (/\.(docx?|pptx?|xlsx?)$/i.test(file.name)) throw new Error(`${file.name}: save Word, PowerPoint and Excel files as PDF first`);
  throw new Error(`${file.name}: this file type can't be read. Try PDF, text, code or a picture.`);
}

// ---------- Voice: speech to text (dictation) and text to speech (read aloud) ----------
const SpeechRec = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;
const lang = () => navigator.language || 'en-US';
/** Markdown → words that sound natural when read aloud */
const plain = (md) => md
  .replace(/```[\s\S]*?```/g, ' (code block) ')
  .replace(/`([^`]+)`/g, '$1')
  .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
  .replace(/^\s*#+\s*/gm, '')
  .replace(/^\s*([-*•]|\d+[.)])\s+/gm, '')
  .replace(/[*_>]+/g, '')
  .replace(/\n+/g, '. ')
  .replace(/\.\s*\./g, '.')
  .trim();
/** Browsers stop reading very long text, so it is read in short pieces */
const chunks = (text) => (text.match(/[^.!?]+[.!?]*\s*/g) || [text]).reduce((list, s) => {
  if (list.length && (list[list.length - 1] + s).length < 220) list[list.length - 1] += s; else list.push(s);
  return list;
}, []);

/** What the AI did in an earlier answer, written out so it remembers it in the next question */
const withActions = (m) => {
  const done = (m.parts || []).filter((p) => p.type === 'action');
  if (!done.length) return m.content;
  return `${m.content}\n\n[Actions in the app: ${done.map((a) => `${a.title}: ${a.detail}${a.undone ? ' (the student pressed Undo)' : ''}`).join('; ')}]`;
};

function ActionCard({ a, onUndo, onView }) {
  return (
    <div className={`action-card ${a.undone ? 'undone' : ''}`}>
      <span className="action-icon"><Icon name={a.undone ? 'refresh' : a.icon || 'check'} size={16} /></span>
      <span className="action-text"><b>{a.undone ? `Undone: ${a.title.toLowerCase()}` : a.title}</b><span>{a.detail}</span></span>
      {!a.undone && (
        <span className="action-btns">
          {a.page && <button type="button" className="btn ghost sm" onClick={onView}>View</button>}
          {a.undo && <button type="button" className="btn sm" onClick={onUndo}>Undo</button>}
        </span>
      )}
    </div>
  );
}

// ---------- Saved conversations (chat history, stored on the server) ----------
const currentKey = (id) => `sa-chat-current-${id}`;
const getCurrent = (id) => { try { return sessionStorage.getItem(currentKey(id)); } catch { return null; } };
const setCurrent = (id, conv) => {
  try { if (conv) sessionStorage.setItem(currentKey(id), conv); else sessionStorage.removeItem(currentKey(id)); } catch { /* ignore */ }
};
/** Earlier versions kept one chat in the browser tab; it is moved into the history once */
const takeOldChat = (id) => {
  try { const old = JSON.parse(sessionStorage.getItem(`sa-chat-${id}`)) || []; sessionStorage.removeItem(`sa-chat-${id}`); return old; } catch { return []; }
};
/** What is saved: pictures are too big to keep, so only their names are */
const slim = (msgs) => msgs.filter((m) => !m.pending).map((m) => (m.attachments
  ? { ...m, attachments: m.attachments.map((a) => (a.type === 'image' ? { id: a.id, type: 'name', name: a.name, wasImage: true } : a)) }
  : m));
/** A conversation is named after its first question */
const titleOf = (msgs) => {
  const first = msgs.find((m) => m.role === 'user');
  const t = (first?.content || first?.attachments?.[0]?.name || 'New chat').replace(/\s+/g, ' ').trim();
  return t.length > 60 ? `${t.slice(0, 57)}…` : t;
};
/** "Today", "Yesterday", ... for the history list */
function groupOf(when) {
  const d = new Date(when);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((today - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
  return days <= 0 ? 'Today' : days === 1 ? 'Yesterday' : days < 7 ? 'Previous 7 days' : days < 30 ? 'Previous 30 days' : 'Older';
}
const wide = () => typeof window !== 'undefined' && window.innerWidth > 900;

function AttachmentChip({ a, onRemove }) {
  return (
    <div className={`att ${a.type === 'image' ? 'att-img' : ''}`} title={a.name}>
      {a.type === 'image'
        ? <img src={a.dataUrl} alt={a.name} />
        : <span className="att-icon"><Icon name={a.wasImage ? 'image' : 'file'} size={16} /></span>}
      {a.type !== 'image' && (
        <span className="att-text"><b className="ellipsis">{a.name}</b><span>{a.info || (a.wasImage ? 'Picture' : 'File')}</span></span>
      )}
      {onRemove && (
        <button type="button" className="att-x" onClick={onRemove} aria-label={`Remove ${a.name}`}><Icon name="close" size={12} /></button>
      )}
    </div>
  );
}

export default function Chat() {
  const { user } = useAuth();
  const { notify, reload } = useData();
  const navigate = useNavigate();
  const [messages, setMessages] = useState(() => takeOldChat(user.id));
  const [convId, setConvId] = useState(() => getCurrent(user.id));   // the open conversation (null = new)
  const [history, setHistory] = useState([]);                         // saved conversations, newest first
  const [panel, setPanel] = useState(wide);                           // history panel shown
  const [confirmDel, setConfirmDel] = useState(null);                 // id waiting for "Delete?" confirmation
  const [loadingConv, setLoadingConv] = useState(() => Boolean(getCurrent(user.id)));
  const [input, setInput] = useState('');
  const [drafts, setDrafts] = useState([]);           // files attached to the message being typed
  const [reading, setReading] = useState(false);      // files are being read
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(-1);
  const [editing, setEditing] = useState(null);       // { i, text } while a sent message is edited
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(-1);       // index of the answer being read aloud
  const [voice, setVoice] = useState(false);          // voice mode: talk, and hear the answers
  const [dragging, setDragging] = useState(false);

  const abort = useRef(null);
  const endRef = useRef(null);
  const boxRef = useRef(null);
  const fileRef = useRef(null);
  const recRef = useRef(null);
  const convRef = useRef(getCurrent(user.id));
  const savedRef = useRef('');                        // what was last saved, to skip saving twice
  const saveChain = useRef(Promise.resolve());        // saves run one after another
  const runId = useRef(0);                            // ignore answers that arrive after switching chats
  const live = useRef({});                            // latest values, for voice callbacks
  live.current = { messages, input, drafts, voice, busy };

  // ---------- Chat history ----------
  const openId = (id) => { convRef.current = id; setConvId(id); setCurrent(user.id, id); };

  /** Saves the open conversation (creates it the first time) */
  const save = async () => {
    const msgs = slim(live.current.messages);
    const json = JSON.stringify(msgs);
    if (!msgs.length || json === savedRef.current) return;
    const title = titleOf(msgs);
    let doc = null;
    if (convRef.current) {
      try {
        doc = await api.patch(`/conversations/${convRef.current}`, { title, messages: msgs });
      } catch (err) {
        if (err.message !== 'Conversation not found') throw err;   // try again on the next change
        convRef.current = null;                                    // it was deleted (maybe on another device)
      }
    }
    if (!doc) { doc = await api.post('/conversations', { title, messages: msgs }); openId(doc.id); }
    savedRef.current = json;
    setHistory((h) => [doc, ...h.filter((c) => c.id !== doc.id)]);
  };
  const flush = () => { saveChain.current = saveChain.current.then(save).catch(() => {}); return saveChain.current; };

  // Load the list, and the conversation that was open last time
  useEffect(() => {
    api.get('/conversations').then(setHistory).catch(() => {});
    const id = getCurrent(user.id);
    if (!id) return;
    api.get(`/conversations/${id}`)
      .then((c) => { savedRef.current = JSON.stringify(slim(c.messages)); setMessages(c.messages); })
      .catch(() => openId(null))
      .finally(() => setLoadingConv(false));
  }, [user.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Save shortly after every change (a finished answer, an edit, an undo...)
  useEffect(() => {
    if (busy || loadingConv || !messages.length) return undefined;
    const t = setTimeout(flush, 400);
    return () => clearTimeout(t);
  }, [messages, busy, loadingConv]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Leaves the current chat cleanly before showing another one */
  const leave = async () => {
    runId.current += 1;
    stop();
    setBusy(false);
    abort.current = null;
    recRef.current?.abort();
    await flush();
    setEditing(null);
    setDrafts([]);
    setConfirmDel(null);
    if (!wide()) setPanel(false);
  };

  const openConversation = async (id) => {
    if (id === convRef.current) { if (!wide()) setPanel(false); return; }
    await leave();
    setLoadingConv(true);
    try {
      const c = await api.get(`/conversations/${id}`);
      savedRef.current = JSON.stringify(slim(c.messages));
      openId(id);
      setMessages(c.messages);
    } catch (err) {
      notify(err.message);
      setHistory((h) => h.filter((c) => c.id !== id));
    } finally {
      setLoadingConv(false);
    }
  };

  const removeConversation = async (id) => {
    setConfirmDel(null);
    try {
      await api.del(`/conversations/${id}`);
      setHistory((h) => h.filter((c) => c.id !== id));
      if (id === convRef.current) {
        runId.current += 1;
        stop();
        setBusy(false);
        savedRef.current = '';
        openId(null);
        setMessages([]);
      }
      notify('Conversation deleted');
    } catch (err) {
      notify(err.message);
    }
  };
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages.length, busy]);
  useEffect(() => () => { abort.current?.abort(); recRef.current?.abort(); if (canSpeak) speechSynthesis.cancel(); }, []);

  // Let the text box grow with what you type (up to a limit)
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

  // ---------- Talking to the server ----------
  const run = async (history) => {
    setMessages([...history, { role: 'assistant', content: '', parts: [], pending: true }]);
    setBusy(true);
    setEditing(null);
    const controller = new AbortController();
    abort.current = controller;
    const mine = ++runId.current;
    const update = (fn) => setMessages((m) => {
      if (runId.current !== mine || !m.length) return m;     // the student switched to another chat
      const copy = [...m];
      copy[copy.length - 1] = fn(copy[copy.length - 1]);
      return copy;
    });
    // Words go into the last text part; each action the AI took becomes its own card
    const addText = (v) => update((last) => {
      const parts = [...last.parts];
      const tail = parts[parts.length - 1];
      if (tail?.type === 'text') parts[parts.length - 1] = { ...tail, v: tail.v + v }; else parts.push({ type: 'text', v });
      return { ...last, content: last.content + v, parts };
    });
    let answer = '';
    let finished = false;
    let changed = false;
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({
          today: todayIso(),
          messages: history.map((m) => ({
            role: m.role,
            content: m.role === 'assistant' ? withActions(m) : m.content,
            attachments: m.attachments?.map(({ type, name, text, dataUrl }) => ({ type, name, text, dataUrl })),
          })),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      // The answer arrives as one small JSON object per line
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const handle = (line) => {
        if (!line.trim()) return;
        let ev;
        try { ev = JSON.parse(line); } catch { return; }
        if (ev.t === 'text') { answer += ev.v; addText(ev.v); }
        else if (ev.t === 'action') {
          changed = true;
          const { t, ...action } = ev;
          update((last) => ({ ...last, parts: [...last.parts, { type: 'action', ...action }] }));
        } else if (ev.t === 'error') addText(`\n\n_${ev.v}_`);
      };
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        lines.forEach(handle);
      }
      handle(buffer);
      update((last) => ({ ...last, pending: false }));
      finished = true;
    } catch (err) {
      if (err.name === 'AbortError') update((last) => ({ ...last, pending: false, ...(last.content || last.parts.length ? {} : { content: '_Stopped._', parts: [{ type: 'text', v: '_Stopped._' }] }) }));
      else update((last) => ({ ...last, pending: false, error: true, content: err.message, parts: [] }));
    } finally {
      if (runId.current === mine) { setBusy(false); abort.current = null; }
    }
    if (runId.current !== mine) return;
    if (changed) reload().catch(() => {});                // the AI changed the planner: refresh every page
    // Voice mode: read the answer, then listen again
    if (finished && answer && live.current.voice) speak(answer, history.length, () => { if (live.current.voice) listen(); });
    else if (!live.current.voice) boxRef.current?.focus();
  };

  /** Undo one change the AI made (deletes what it added, or puts the old values back) */
  const undo = async (i, k) => {
    const part = messages[i].parts[k];
    try {
      if (part.undo.method === 'DELETE') await api.del(part.undo.path);
      else await api.patch(part.undo.path, part.undo.body);
      setMessages((m) => m.map((msg, mi) => (mi !== i ? msg
        : { ...msg, parts: msg.parts.map((p, pk) => (pk === k ? { ...p, undone: true } : p)) })));
      notify('Undone');
      reload().catch(() => {});
    } catch (err) {
      notify(err.message === 'Not found' ? 'That was already removed' : err.message);
    }
  };

  const send = (text = live.current.input, files = live.current.drafts) => {
    const content = text.trim();
    if ((!content && !files.length) || live.current.busy || reading) return;
    setInput('');
    setDrafts([]);
    run([...live.current.messages, { role: 'user', content, ...(files.length ? { attachments: files } : {}) }]);
  };

  const stop = () => {
    abort.current?.abort();
    if (canSpeak) speechSynthesis.cancel();
    setSpeaking(-1);
  };

  const retry = () => {
    const last = messages.length - 1;
    if (busy || last < 1 || messages[last].role !== 'assistant') return;
    run(messages.slice(0, last));
  };

  const saveEdit = () => {
    const { i, text } = editing;
    const m = messages[i];
    if (!text.trim() && !m.attachments?.length) return;
    stop();
    run([...messages.slice(0, i), { ...m, content: text.trim() }]);
  };

  const newChat = async () => {
    await leave();
    savedRef.current = '';
    openId(null);
    setMessages([]);
    boxRef.current?.focus();
  };

  // ---------- Attachments ----------
  const addFiles = async (list) => {
    const files = [...list];
    if (!files.length) return;
    setReading(true);
    let count = live.current.drafts.length;
    let images = live.current.drafts.filter((a) => a.type === 'image').length;
    for (const file of files) {
      if (count >= MAX_FILES) { notify(`Up to ${MAX_FILES} files per message`); break; }
      try {
        const a = await readFile(file, images);
        count += 1;
        if (a.type === 'image') images += 1;
        setDrafts((d) => [...d, a]);
      } catch (err) {
        notify(err.message);
      }
    }
    setReading(false);
    boxRef.current?.focus();
  };

  const onPaste = (e) => {
    if (e.clipboardData?.files?.length) { e.preventDefault(); addFiles(e.clipboardData.files); }
  };

  // ---------- Voice ----------
  function listen() {
    if (!SpeechRec || recRef.current) return;
    if (canSpeak) speechSynthesis.cancel();
    const rec = new SpeechRec();
    const voiceMode = live.current.voice;
    rec.lang = lang();
    rec.interimResults = true;
    rec.continuous = !voiceMode;                    // voice mode stops by itself when you stop talking
    const before = voiceMode || !live.current.input.trim() ? '' : `${live.current.input.trim()} `;
    let heard = '';
    let said = '';
    rec.onresult = (e) => {
      let interim = '';
      for (let k = e.resultIndex; k < e.results.length; k += 1) {
        if (e.results[k].isFinal) heard += e.results[k][0].transcript; else interim += e.results[k][0].transcript;
      }
      said = before + heard + interim;
      setInput(said);
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        notify('Allow microphone access for this site to talk to the assistant');
        setVoice(false);
      }
    };
    rec.onend = () => {
      recRef.current = null;
      setListening(false);
      if (live.current.voice && said.trim()) send(said);
    };
    recRef.current = rec;
    setListening(true);
    try { rec.start(); } catch { recRef.current = null; setListening(false); }
  }

  const toggleMic = () => {
    if (recRef.current) recRef.current.stop(); else listen();
  };

  function speak(text, i, after) {
    if (!canSpeak) { after?.(); return; }
    speechSynthesis.cancel();
    const parts = chunks(plain(text));
    setSpeaking(i);
    parts.forEach((part, k) => {
      const u = new SpeechSynthesisUtterance(part);
      u.lang = lang();
      if (k === parts.length - 1) u.onend = () => { setSpeaking(-1); after?.(); };
      u.onerror = () => setSpeaking(-1);
      speechSynthesis.speak(u);
    });
  }

  const toggleRead = (i) => {
    if (speaking === i) { speechSynthesis.cancel(); setSpeaking(-1); } else speak(messages[i].content, i);
  };

  const toggleVoice = () => {
    const on = !voice;
    setVoice(on);
    live.current.voice = on;
    if (on) { recRef.current?.abort(); recRef.current = null; listen(); }
    else { recRef.current?.abort(); if (canSpeak) speechSynthesis.cancel(); setSpeaking(-1); }
  };

  const copy = async (i) => {
    try { await navigator.clipboard.writeText(messages[i].content); setCopied(i); setTimeout(() => setCopied(-1), 1500); } catch { /* ignore */ }
  };

  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
  };

  const first = user.name.split(' ')[0];
  const lastBot = messages.length - 1;
  const canSend = (input.trim() || drafts.length) && !reading && !loadingConv;
  // History list in groups: Today, Yesterday, ...
  const groups = history.reduce((list, c) => {
    const label = groupOf(c.updatedAt);
    if (list.length && list[list.length - 1][0] === label) list[list.length - 1][1].push(c); else list.push([label, [c]]);
    return list;
  }, []);

  return (
    <div className={`chat ${dragging ? 'dragging' : ''} ${panel ? 'panel-open' : ''}`}
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false); }}
      onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}>

      <aside className="history" aria-label="Chat history">
        <div className="history-head">
          <b>Chats</b>
          <button className="icon-btn" type="button" onClick={() => setPanel(false)} aria-label="Hide chat history" title="Hide"><Icon name="sidebar" size={17} /></button>
        </div>
        <button className="btn primary sm history-new" type="button" onClick={newChat}><Icon name="plus" size={15} /> New chat</button>
        <div className="history-list">
          {history.length === 0 && <p className="history-empty">Your conversations will be saved here, so you can come back to them.</p>}
          {groups.map(([label, items]) => (
            <div key={label}>
              <p className="history-group">{label}</p>
              {items.map((c) => (
                <div key={c.id} className={`history-item ${c.id === convId ? 'active' : ''}`}>
                  {confirmDel === c.id ? (
                    <div className="history-confirm">
                      <span>Delete this chat?</span>
                      <button className="btn danger sm" type="button" onClick={() => removeConversation(c.id)}>Delete</button>
                      <button className="btn sm" type="button" onClick={() => setConfirmDel(null)}>Cancel</button>
                    </div>
                  ) : (
                    <>
                      <button type="button" className="history-open" onClick={() => openConversation(c.id)} title={c.title}>
                        <span className="ellipsis">{c.title}</span>
                      </button>
                      <button type="button" className="history-del" onClick={() => setConfirmDel(c.id)} aria-label={`Delete "${c.title}"`} title="Delete">
                        <Icon name="trash" size={14} />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </aside>
      {panel && <div className="history-scrim" onClick={() => setPanel(false)} aria-hidden="true" />}

      <div className="chat-main">
      <div className="chat-top">
        {!panel && (
          <button className="icon-btn" type="button" onClick={() => setPanel(true)} aria-label="Show chat history" title="Chat history"><Icon name="history" size={17} /></button>
        )}
        <span className="chat-title">
          <img src="/logo.png" alt="" width={22} height={22} />
          <span className="ellipsis">{messages.length ? titleOf(messages) : 'New chat'}</span>
        </span>
        {messages.length > 0 && (
          <button className="btn ghost sm" type="button" onClick={newChat}><Icon name="plus" size={15} /> New chat</button>
        )}
      </div>

      <div className="chat-scroll">
        {loadingConv ? (
          <div className="chat-loading"><span className="thinking"><i /><i /><i /></span></div>
        ) : messages.length === 0 ? (
          <div className="chat-empty">
            <img className="chat-orb" src="/logo.png" alt="" width={64} height={64} />
            <h2>How can I help, {first}?</h2>
            <p className="muted">I can see your courses, deadlines and study hours. Ask about your plan, attach your notes or syllabus, or tell me what to add and I'll put it in your planner.</p>
            <div className="suggest">
              {SUGGESTIONS.map((s, k) => (
                <button key={s.title} type="button" className="suggest-card" style={{ animationDelay: `${0.1 + k * 0.07}s` }} onClick={() => send(s.text, [])}>
                  <b>{s.title}</b><span>{s.text}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="msgs">
            {messages.map((m, i) => (m.role === 'user' ? (
              <div key={i} className="msg me">
                {m.attachments?.length > 0 && (
                  <div className="att-row">{m.attachments.map((a) => <AttachmentChip key={a.id || a.name} a={a} />)}</div>
                )}
                {editing?.i === i ? (
                  <div className="edit-box">
                    <textarea value={editing.text} autoFocus rows={3} onChange={(e) => setEditing({ i, text: e.target.value })}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(); } if (e.key === 'Escape') setEditing(null); }} />
                    <div className="edit-actions">
                      <button className="btn sm" type="button" onClick={() => setEditing(null)}>Cancel</button>
                      <button className="btn primary sm" type="button" onClick={saveEdit}>Send</button>
                    </div>
                  </div>
                ) : (
                  <>
                    {m.content && <div className="bubble"><p>{m.content}</p></div>}
                    <div className="msg-actions">
                      <button type="button" onClick={() => copy(i)} title="Copy" aria-label="Copy"><Icon name={copied === i ? 'check' : 'copy'} size={14} /></button>
                      {!busy && (
                        <button type="button" onClick={() => setEditing({ i, text: m.content })} title="Edit" aria-label="Edit message"><Icon name="pencil" size={14} /></button>
                      )}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div key={i} className={`msg bot ${m.error ? 'error-msg' : ''} ${i === lastBot ? 'latest' : ''}`}>
                <img className="bot-avatar" src="/logo.png" alt="" width={30} height={30} />
                <div className="bubble">
                  {m.parts?.length ? m.parts.map((p, k) => (p.type === 'action' ? (
                    <ActionCard key={k} a={p} onUndo={() => undo(i, k)} onView={() => navigate(p.page)} />
                  ) : (
                    <div key={k} className="md" dangerouslySetInnerHTML={{
                      __html: markdown(p.v) + (m.pending && k === m.parts.length - 1 ? '<span class="caret"></span>' : ''),
                    }} />
                  ))) : m.pending ? (
                    <span className="thinking"><i /><i /><i /></span>
                  ) : (
                    <div className="md" dangerouslySetInnerHTML={{ __html: markdown(m.content) }} />
                  )}
                  {m.pending && m.parts?.[m.parts.length - 1]?.type === 'action' && <span className="thinking"><i /><i /><i /></span>}
                  {!m.pending && (
                    <div className="msg-actions bot-actions">
                      {!m.error && m.content && (
                        <button type="button" onClick={() => copy(i)} title="Copy" aria-label="Copy">
                          <Icon name={copied === i ? 'check' : 'copy'} size={14} /><span>{copied === i ? 'Copied' : 'Copy'}</span>
                        </button>
                      )}
                      {!m.error && canSpeak && m.content && (
                        <button type="button" onClick={() => toggleRead(i)} title={speaking === i ? 'Stop reading' : 'Read aloud'} aria-label="Read aloud" className={speaking === i ? 'on' : ''}>
                          <Icon name={speaking === i ? 'stop' : 'volume'} size={14} /><span>{speaking === i ? 'Stop' : 'Read aloud'}</span>
                        </button>
                      )}
                      {i === lastBot && !busy && (
                        <button type="button" onClick={retry} title="Try again" aria-label="Try again"><Icon name="refresh" size={14} /><span>Retry</span></button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )))}
            <div ref={endRef} />
          </div>
        )}
      </div>

      <div className="composer-wrap">
        {voice && (
          <div className="voice-bar">
            <span className={`voice-dot ${listening ? 'listening' : speaking >= 0 ? 'speaking' : ''}`} />
            <span>{listening ? 'Listening… just talk' : busy ? 'Thinking…' : speaking >= 0 ? 'Speaking… tap the mic to interrupt' : 'Voice mode is on. Tap the mic to talk.'}</span>
            <button className="btn sm" type="button" onClick={toggleVoice}>End voice</button>
          </div>
        )}
        <form className="composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
          {drafts.length > 0 && (
            <div className="att-row drafts">
              {drafts.map((a) => <AttachmentChip key={a.id} a={a} onRemove={() => setDrafts((d) => d.filter((x) => x.id !== a.id))} />)}
            </div>
          )}
          <textarea ref={boxRef} rows={1} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKey} onPaste={onPaste}
            placeholder={listening ? 'Listening…' : 'Ask anything, or attach your notes…'} aria-label="Message" maxLength={4000} />
          <div className="composer-bar">
            <button className="tool" type="button" onClick={() => fileRef.current.click()} title="Attach files or pictures" aria-label="Attach files" disabled={reading}>
              {reading ? <span className="spinner" /> : <Icon name="clip" size={18} />}
            </button>
            <input ref={fileRef} type="file" multiple hidden
              accept="image/*,.pdf,.txt,.md,.csv,.json,.html,.css,.js,.jsx,.ts,.tsx,.py,.java,.c,.cpp,.h,.cs,.go,.rb,.php,.sql,.sh,.yml,.yaml,.xml,.log,.tex,.ipynb"
              onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
            {SpeechRec && (
              <button className={`tool ${listening ? 'rec' : ''}`} type="button" onClick={toggleMic}
                title={listening ? 'Stop dictation' : 'Dictate'} aria-label={listening ? 'Stop dictation' : 'Dictate'}>
                <Icon name="mic" size={18} />
              </button>
            )}
            <span className="grow" />
            {SpeechRec && canSpeak && (
              <button className={`tool voice-btn ${voice ? 'on' : ''}`} type="button" onClick={toggleVoice}
                title={voice ? 'End voice mode' : 'Voice mode: talk and hear the answers'} aria-label="Voice mode">
                <Icon name="wave" size={18} /><span>Voice</span>
              </button>
            )}
            {busy || speaking >= 0 ? (
              <button className="send stop" type="button" onClick={stop} aria-label="Stop" title="Stop"><Icon name="stop" size={16} /></button>
            ) : (
              <button className="send" type="submit" disabled={!canSend} aria-label="Send" title="Send"><Icon name="send" size={18} /></button>
            )}
          </div>
        </form>
        <p className="note composer-note">AI can make mistakes. Your deadlines and hours always come from your own data. Drop files here or paste a picture.</p>
      </div>

      {dragging && <div className="drop-hint"><Icon name="clip" size={28} /><b>Drop files to attach</b><span>PDF, text, code or pictures</span></div>}
      </div>
    </div>
  );
}
