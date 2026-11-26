/**
 * Notes AI: a chat panel next to the page, like Notion AI.
 *
 * It sees the open page (the "page" chip; click it to leave the page out), files and pictures the student
 * attaches, and the conversation. It can answer, or change the page: every change is applied right away,
 * listed as a step, highlighted in the page, and can be undone in one click.
 * Answers have Copy, Add to page, thumbs up / down and Undo, like in Notion.
 */
import { useEffect, useRef, useState } from 'react';
import { api, getToken } from '../lib/api.js';
import { markdown, readFile, AttachmentChip, MAX_FILES } from './Chat.jsx';
import { Icon } from '../icons.jsx';

const SUGGESTIONS = [
  { icon: '📝', text: 'Summarize this page' },
  { icon: '🧹', text: 'Fix the spelling, grammar and formatting everywhere on this page' },
  { icon: '❓', text: 'Add a 5-question practice quiz with answers at the end of the page' },
  { icon: '🃏', text: 'Add a flashcards table of the key terms at the end' },
  { icon: '💡', text: 'Explain this page simply, with examples' },
  { icon: '🗂️', text: 'Reorganize this page into a clear study guide' },
];

const storeKey = (id) => `notes-ai:${id}`;
const load = (id) => { try { return JSON.parse(sessionStorage.getItem(storeKey(id)) || '[]'); } catch { return []; } };
const keep = (id, msgs) => {
  // Pictures and file text are not kept, only their names
  const slim = msgs.map(({ snapshot, ...m }) => ({ ...m, pending: false,
    attachments: m.attachments?.map((a) => ({ id: a.id, name: a.name, type: 'name', info: a.info, wasImage: a.type === 'image' || a.wasImage })) }));
  try { sessionStorage.setItem(storeKey(id), JSON.stringify(slim.slice(-40))); } catch { /* storage full */ }
};

/** Turns one change from the AI into editor blocks. Returns the ids of the new blocks. */
function applyOp(editor, op, idMap) {
  const resolve = (id) => idMap.get(id) || id;
  const parse = (md) => editor.tryParseMarkdownToBlocks(md || '');
  const get = (id) => (id ? editor.getBlock(resolve(id)) : undefined);
  const doc = editor.document;
  const isEmpty = (b) => b?.type === 'paragraph' && (!b.content || !b.content.length);
  if (op.type === 'edit') {
    const old = get(op.id);
    if (!old) return [];
    const blocks = parse(op.markdown);
    if (!blocks.length) { editor.removeBlocks([old]); return []; }
    const { insertedBlocks } = editor.replaceBlocks([old], blocks);
    if (insertedBlocks?.[0]) idMap.set(op.id, insertedBlocks[0].id);
    return (insertedBlocks || []).map((b) => b.id);
  }
  if (op.type === 'insert') {
    const blocks = parse(op.markdown);
    if (!blocks.length) return [];
    let inserted;
    if (doc.length === 1 && isEmpty(doc[0])) inserted = editor.replaceBlocks(doc, blocks).insertedBlocks;
    else if (op.after === 'START') inserted = editor.insertBlocks(blocks, doc[0], 'before');
    else inserted = editor.insertBlocks(blocks, get(op.after) || doc.at(-1), 'after');
    return (inserted || []).map((b) => b.id);
  }
  if (op.type === 'delete') {
    const old = get(op.id);
    if (old) editor.removeBlocks([old]);
    return [];
  }
  if (op.type === 'page') {
    const blocks = parse(op.markdown);
    if (!blocks.length) return [];
    return (editor.replaceBlocks(editor.document, blocks).insertedBlocks || []).map((b) => b.id);
  }
  return [];
}

function flash(ids) {
  setTimeout(() => {
    let first = null;
    for (const id of ids) {
      const el = document.querySelector(`.note-page .bn-block-outer[data-id="${id}"]`);
      if (!el) continue;
      first ||= el;
      el.classList.remove('ai-flash');
      void el.offsetWidth;            // restart the animation
      el.classList.add('ai-flash');
    }
    first?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, 30);
}

function Changes({ m, onUndo, onShow }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`nai-changes ${m.undone ? 'undone' : ''}`}>
      <div className="nai-changes-head">
        <span className="nai-changes-icon"><Icon name={m.undone ? 'undo' : 'pencil'} size={14} /></span>
        <b>{m.undone ? 'Changes undone' : `Edited the page · ${m.edits.length} change${m.edits.length > 1 ? 's' : ''}`}</b>
      </div>
      {!m.undone && (
        <div className="nai-changes-tools">
          <button type="button" className="btn sm" onClick={() => { setOpen((v) => !v); onShow(); }}>{open ? 'Hide changes' : 'Show changes'}</button>
          <button type="button" className="icon-btn" onClick={onUndo} title="Undo these changes" aria-label="Undo these changes"><Icon name="undo" size={15} /></button>
        </div>
      )}
      {open && !m.undone && (
        <ol className="nai-diff">
          {m.edits.map((e, i) => (
            <li key={i}>
              <button type="button" onClick={() => flash(e.ids || [])}>{e.label}</button>
              {e.before && <del>{e.before.slice(0, 220)}</del>}
              {e.after && <ins>{e.after.slice(0, 260)}</ins>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function NotesChat({ note, getEditor, onClose, notify, onChanged }) {
  const [messages, setMessages] = useState(() => load(note.id));
  const [input, setInput] = useState('');
  const [drafts, setDrafts] = useState([]);
  const [usePage, setUsePage] = useState(true);
  const [busy, setBusy] = useState(false);
  const [openSteps, setOpenSteps] = useState({});
  const [copied, setCopied] = useState(-1);
  const [dragging, setDragging] = useState(false);
  const abort = useRef(null);
  const boxRef = useRef(null);
  const endRef = useRef(null);
  const fileRef = useRef(null);
  const live = useRef(messages);
  live.current = messages;

  // Another page: load its chat
  useEffect(() => {
    abort.current?.abort();
    setMessages(load(note.id)); setDrafts([]); setInput(''); setBusy(false);
  }, [note.id]);
  useEffect(() => { if (!busy) keep(note.id, messages); }, [messages, busy, note.id]);
  useEffect(() => { if (messages.length) endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }); }, [messages.length, busy]);
  useEffect(() => { boxRef.current?.focus(); }, []);
  useEffect(() => () => abort.current?.abort(), []);

  const update = (fn) => setMessages((ms) => { const copy = [...ms]; copy[copy.length - 1] = fn(copy[copy.length - 1]); return copy; });

  const pageBlocks = () => {
    const editor = getEditor();
    if (!editor || !usePage) return [];
    return editor.document.map((b) => ({ id: b.id, md: editor.blocksToMarkdownLossy([b]).trim() }));
  };

  const send = async (textArg) => {
    const text = (textArg ?? input).trim();
    if ((!text && !drafts.length) || busy) return;
    const editor = getEditor();
    const user = { role: 'user', content: text, attachments: drafts, page: usePage ? note.title || 'Untitled' : '' };
    const history = [...live.current, user];
    setMessages([...history, { role: 'assistant', content: '', steps: [], edits: [], pending: true }]);
    setInput(''); setDrafts([]); setBusy(true);
    const controller = new AbortController();
    abort.current = controller;
    const idMap = new Map();
    let snapshot = null;
    try {
      const res = await fetch('/api/notes/chat', {
        method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({
          title: note.title, blocks: pageBlocks(),
          messages: history.map((m) => ({ role: m.role, content: m.content, attachments: m.role === 'user' ? m.attachments : undefined })),
        }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `The AI could not answer (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          if (!line.trim()) continue;
          let ev;
          try { ev = JSON.parse(line); } catch { continue; }
          if (ev.t === 'text') update((m) => ({ ...m, content: m.content + ev.v }));
          else if (ev.t === 'cut') update((m) => ({ ...m, content: m.content.slice(0, Math.max(0, m.content.length - ev.n)) }));
          else if (ev.t === 'error') update((m) => ({ ...m, content: `${m.content}${m.content ? '\n\n' : ''}⚠️ ${ev.v}` }));
          else if (ev.t === 'edit' && editor) {
            snapshot ||= JSON.parse(JSON.stringify(editor.document));
            let ids = [];
            try { ids = applyOp(editor, ev.op, idMap); } catch (err) { console.warn('Could not apply an AI change', err); }
            flash(ids);
            onChanged?.();
            const after = ev.op.markdown ? ev.op.markdown.replace(/\s+/g, ' ').trim() : '';
            update((m) => ({ ...m, steps: [...m.steps, ev.label], edits: [...m.edits, { label: ev.label, before: ev.before, after, ids }], snapshot }));
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') update((m) => ({ ...m, content: `${m.content}${m.content ? '\n\n' : ''}⚠️ ${err.message}` }));
    } finally {
      update((m) => ({ ...m, pending: false, content: m.content || (m.edits.length ? 'Done.' : '_Stopped._') }));
      setBusy(false);
      abort.current = null;
    }
  };

  const undo = (i) => {
    const editor = getEditor();
    const m = messages[i];
    if (!editor || !m.snapshot) { notify('Use Ctrl+Z in the page to undo these changes'); return; }
    editor.replaceBlocks(editor.document, m.snapshot);
    onChanged?.();
    setMessages((ms) => ms.map((x, k) => (k === i ? { ...x, undone: true } : x)));
    notify('Changes undone');
  };

  const addToPage = (m) => {
    const editor = getEditor();
    if (!editor) return;
    const ids = applyOp(editor, { type: 'insert', after: 'END', markdown: m.content }, new Map());
    flash(ids);
    onChanged?.();
    notify('Added to the page');
  };

  const rate = async (i, rating) => {
    const m = messages[i];
    const next = m.rating === rating ? null : rating;
    setMessages((ms) => ms.map((x, k) => (k === i ? { ...x, rating: next } : x)));
    if (!next) return;
    try {
      await api.post('/notes/feedback', { rating: next, prompt: messages[i - 1]?.content || '', answer: m.content });
      notify(next === 'up' ? 'Thanks for the feedback!' : 'Thanks. This helps us improve the AI.');
    } catch { /* feedback is optional */ }
  };

  const addFiles = async (list) => {
    let count = drafts.length;
    let images = drafts.filter((a) => a.type === 'image').length;
    for (const file of [...list]) {
      if (count >= MAX_FILES) { notify(`Up to ${MAX_FILES} files per message`); break; }
      try {
        const a = await readFile(file, images);
        count += 1;
        if (a.type === 'image') images += 1;
        setDrafts((d) => [...d, a]);
      } catch (err) { notify(err.message); }
    }
  };

  const copy = (i) => {
    navigator.clipboard?.writeText(messages[i].content).then(() => { setCopied(i); setTimeout(() => setCopied(-1), 1500); });
  };

  return (
    <aside className={`nai ${dragging ? 'dragging' : ''}`} aria-label="Notes AI"
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false); }}
      onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}>
      <header className="nai-head">
        <img src="/logo.png" alt="" width={22} height={22} />
        <b>Notes AI</b>
        <span className="nai-head-tools">
          <button className="icon-btn" type="button" title="New chat" aria-label="New chat" disabled={busy}
            onClick={() => { setMessages([]); setOpenSteps({}); boxRef.current?.focus(); }}><Icon name="plus" size={17} /></button>
          <button className="icon-btn" type="button" title="Close (Esc)" aria-label="Close" onClick={onClose}><Icon name="close" size={17} /></button>
        </span>
      </header>

      <div className="nai-scroll fade-scroll">
        {!messages.length ? (
          <div className="nai-empty">
            <img src="/logo.png" alt="" width={44} height={44} />
            <h3>How can I help with this page?</h3>
            <p className="muted">I can read <b>{note.icon} {note.title || 'Untitled'}</b>, answer questions about it, and edit it for you. Attach files or pictures too.</p>
            <div className="nai-suggest">
              {SUGGESTIONS.map((s, k) => (
                <button key={s.text} type="button" style={{ animationDelay: `${0.05 + k * 0.05}s` }} onClick={() => send(s.text)}>
                  <span>{s.icon}</span>{s.text}
                </button>
              ))}
            </div>
          </div>
        ) : messages.map((m, i) => (m.role === 'user' ? (
          <div key={i} className="nai-user">
            {(m.attachments?.length > 0 || m.page) && (
              <div className="nai-user-files">
                {m.page && <span className="nai-chip small"><Icon name="file" size={12} />{m.page}</span>}
                {m.attachments?.map((a) => <AttachmentChip key={a.id} a={a} />)}
              </div>
            )}
            {m.content && <div className="nai-bubble">{m.content}</div>}
          </div>
        ) : (
          <div key={i} className="nai-answer">
            {m.steps?.length > 0 && (
              <div className="nai-steps">
                <button type="button" onClick={() => setOpenSteps((o) => ({ ...o, [i]: !o[i] }))} aria-expanded={!!openSteps[i]}>
                  {m.pending ? <span className="nai-working">Editing the page</span> : `${m.steps.length} step${m.steps.length > 1 ? 's' : ''}`}
                  <Icon name="chevron" size={13} className={`nai-caret ${openSteps[i] ? 'open' : ''}`} />
                </button>
                {(openSteps[i] || m.pending) && (
                  <ol>{m.steps.map((s, k) => <li key={k} style={{ animationDelay: `${Math.min(k, 6) * 0.03}s` }}><Icon name="check" size={13} />{s}</li>)}</ol>
                )}
              </div>
            )}
            {m.content
              ? <div className="md" dangerouslySetInnerHTML={{ __html: markdown(m.content) }} />
              : m.pending && !m.steps?.length && <span className="thinking"><i /><i /><i /></span>}
            {!m.pending && m.edits?.length > 0 && (
              <Changes m={m} onUndo={() => undo(i)} onShow={() => flash(m.edits.flatMap((e) => e.ids || []))} />
            )}
            {!m.pending && (
              <div className="nai-actions">
                <button type="button" title="Copy" aria-label="Copy" onClick={() => copy(i)}><Icon name={copied === i ? 'check' : 'copy'} size={15} /></button>
                <button type="button" title="Add to page" aria-label="Add to page" onClick={() => addToPage(m)}><Icon name="plus" size={15} /></button>
                <button type="button" title="Good answer" aria-label="Good answer" className={m.rating === 'up' ? 'on' : ''} onClick={() => rate(i, 'up')}><Icon name="thumbUp" size={15} /></button>
                <button type="button" title="Bad answer" aria-label="Bad answer" className={m.rating === 'down' ? 'on down' : ''} onClick={() => rate(i, 'down')}><Icon name="thumbDown" size={15} /></button>
                {m.edits?.length > 0 && !m.undone && (
                  <button type="button" className="nai-undo" onClick={() => undo(i)}><Icon name="undo" size={15} /> Undo</button>
                )}
              </div>
            )}
          </div>
        )))}
        <div ref={endRef} />
      </div>

      <form className={`nai-composer ${busy ? 'busy' : ''}`} onSubmit={(e) => { e.preventDefault(); send(); }}>
        <div className="nai-chips">
          <button type="button" className={`nai-chip ${usePage ? '' : 'off'}`} onClick={() => setUsePage((v) => !v)}
            title={usePage ? 'The AI can read and edit this page. Click to leave it out.' : 'Click to let the AI read and edit this page'}>
            <Icon name="file" size={13} /><span className="ellipsis">{note.icon} {note.title || 'Untitled'}</span>
          </button>
          {drafts.map((a) => <AttachmentChip key={a.id} a={a} onRemove={() => setDrafts((d) => d.filter((x) => x.id !== a.id))} />)}
        </div>
        <textarea ref={boxRef} rows={1} value={input} placeholder="Do anything with AI…" aria-label="Message Notes AI"
          onChange={(e) => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${Math.min(e.target.scrollHeight, 180)}px`; }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
            if (e.key === 'Escape') { e.preventDefault(); if (busy) abort.current?.abort(); else onClose(); }
          }}
          onPaste={(e) => { const files = [...e.clipboardData.files]; if (files.length) { e.preventDefault(); addFiles(files); } }} />
        <div className="nai-composer-bar">
          <button type="button" className="icon-btn" title="Attach files or pictures" aria-label="Attach files" onClick={() => fileRef.current?.click()}>
            <Icon name="plus" size={18} />
          </button>
          <input ref={fileRef} type="file" multiple hidden accept="image/*,.pdf,.txt,.md,.csv,.json,.py,.js,.java,.c,.cpp,.html,.css"
            onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
          <span className="nai-hint">{usePage ? 'Can edit this page' : 'Page left out'}</span>
          {busy ? (
            <button type="button" className="nai-send stop" onClick={() => abort.current?.abort()} aria-label="Stop"><Icon name="stop" size={14} /></button>
          ) : (
            <button type="submit" className="nai-send" disabled={!input.trim() && !drafts.length} aria-label="Send"><Icon name="send" size={15} /></button>
          )}
        </div>
      </form>
      {dragging && <div className="nai-drop">Drop files to attach</div>}
    </aside>
  );
}
