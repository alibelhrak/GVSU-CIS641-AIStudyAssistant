/**
 * AI inside a note, like Notion AI.
 *
 * Open it by selecting text (the "Ask AI" button in the formatting toolbar), by typing "/ai" or
 * one of the AI "/" commands, by pressing Ctrl+J (Cmd+J on Mac), or from the "Ask AI" menu.
 * The answer is streamed from POST /api/notes/ai as Markdown, shown as a preview, and only goes into
 * the page when the student clicks Insert or Replace. Try again, follow-up instructions and Discard
 * work like in Notion.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { getToken } from '../lib/api.js';
import { markdown } from './Chat.jsx';
import { Icon } from '../icons.jsx';

/** Buttons when text is selected */
export const EDIT_ACTIONS = [
  { id: 'improve', label: 'Improve writing', icon: '✨' },
  { id: 'fix', label: 'Fix spelling & grammar', icon: '✓' },
  { id: 'shorter', label: 'Make shorter', icon: '↙' },
  { id: 'longer', label: 'Make longer', icon: '↗' },
  { id: 'simplify', label: 'Simplify language', icon: '🧩' },
  { id: 'professional', label: 'Make it academic', icon: '🎓' },
  { id: 'explain', label: 'Explain this', icon: '💡' },
  { id: 'bullets', label: 'Turn into a bullet list', icon: '•' },
  { id: 'table', label: 'Turn into a table', icon: '▦' },
  { id: 'translate', label: 'Translate to English', icon: '🌍', language: 'English' },
  { id: 'translate', label: 'Translate to French', icon: '🌍', language: 'French' },
  { id: 'translate', label: 'Translate to Spanish', icon: '🌍', language: 'Spanish' },
  { id: 'translate', label: 'Translate to Arabic', icon: '🌍', language: 'Arabic' },
];

/** Buttons when writing at the cursor */
export const WRITE_ACTIONS = [
  { id: 'continue', label: 'Continue writing', icon: '✍️' },
  { id: 'summary', label: 'Summarize this page', icon: '📝' },
  { id: 'takeaways', label: 'Key takeaways', icon: '🎯' },
  { id: 'quiz', label: 'Practice quiz', icon: '❓' },
  { id: 'flashcards', label: 'Flashcards (table)', icon: '🃏' },
  { id: 'todos', label: 'Find to-dos', icon: '☑️' },
  { id: 'outline', label: 'Outline', icon: '🗂️' },
  { id: 'brainstorm', label: 'Brainstorm ideas', icon: '🧠' },
];

/** Reads the context when the AI opens: the selected blocks, or where the cursor is */
export function aiContext(editor, { useSelection = true } = {}) {
  let blocks = [];
  try {
    const sel = useSelection ? editor.getSelection() : undefined;
    if (sel?.blocks?.length && editor.getSelectedText?.().trim()) blocks = sel.blocks;
  } catch { /* no selection */ }
  let anchor = null;
  try { anchor = editor.getTextCursorPosition().block; } catch { /* editor not focused */ }
  return {
    blocks,
    selection: blocks.length ? editor.blocksToMarkdownLossy(blocks) : '',
    anchor: blocks.length ? null : anchor,
  };
}

const isEmptyBlock = (b) => b && b.type === 'paragraph' && (!b.content || (Array.isArray(b.content) && !b.content.length));

export function NoteAI({ editor, ctx, title, start, onClose, notify }) {
  const [phase, setPhase] = useState('ask');          // 'ask' | 'writing' | 'done'
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState('');
  const [last, setLast] = useState(null);             // the last request, for Try again
  const [active, setActive] = useState(0);
  const abort = useRef(null);
  const inputRef = useRef(null);
  const boxRef = useRef(null);
  const editing = Boolean(ctx.selection);

  const actions = editing ? EDIT_ACTIONS : WRITE_ACTIONS;
  const shown = useMemo(() => {
    const q = prompt.trim().toLowerCase();
    return q ? actions.filter((a) => a.label.toLowerCase().includes(q)) : actions;
  }, [prompt, actions]);
  useEffect(() => setActive(0), [prompt]);

  const run = async (req) => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setLast(req);
    setResult('');
    setPhase('writing');
    let text = '';
    try {
      const res = await fetch('/api/notes/ai', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({
          title,
          page: editor.blocksToMarkdownLossy(editor.document).slice(0, 14000),
          selection: req.selection ?? ctx.selection,
          action: req.action,
          language: req.language,
          prompt: req.prompt,
        }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `The AI could not answer (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        setResult(text);
      }
      text = text.replace(/^\s*```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/, '$1').trim();
      setResult(text);
      if (!text) throw new Error('The AI sent an empty answer. Try again.');
      setPhase('done');
    } catch (err) {
      if (err.name === 'AbortError') { setPhase(text.trim() ? 'done' : 'ask'); return; }
      notify(err.message);
      setPhase(text.trim() ? 'done' : 'ask');
    } finally {
      if (abort.current === controller) abort.current = null;
      setPrompt('');
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  // Started from a "/" command or a menu: run straight away
  useEffect(() => {
    if (start) run(start); else inputRef.current?.focus();
    return () => abort.current?.abort();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the box in view
  useEffect(() => { boxRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }); }, [phase]);

  const submit = () => {
    const text = prompt.trim();
    if (phase === 'done') {
      // A follow-up changes the answer we already have
      if (!text) return;
      run({ prompt: text, selection: result });
      return;
    }
    if (shown.length && (!text || shown.length < actions.length) && !/\s/.test(text) && shown[active]) { pick(shown[active]); return; }
    if (text) run({ prompt: text });
  };
  const pick = (a) => run({ action: a.id, language: a.language });

  const blocksOf = () => {
    const blocks = editor.tryParseMarkdownToBlocks(result);
    if (!blocks.length) throw new Error('Nothing to insert');
    return blocks;
  };
  const place = (mode) => {
    try {
      const blocks = blocksOf();
      const doc = editor.document;
      const exists = (b) => b && editor.getBlock(b.id);
      if (mode === 'replace' && ctx.blocks.length && ctx.blocks.every(exists)) {
        editor.replaceBlocks(ctx.blocks, blocks);
      } else if (ctx.blocks.length && exists(ctx.blocks.at(-1))) {
        editor.insertBlocks(blocks, ctx.blocks.at(-1), 'after');
      } else if (exists(ctx.anchor)) {
        const anchor = editor.getBlock(ctx.anchor.id);
        if (isEmptyBlock(anchor)) editor.replaceBlocks([anchor], blocks);
        else editor.insertBlocks(blocks, anchor, 'after');
      } else if (doc.length === 1 && isEmptyBlock(doc[0])) {
        editor.replaceBlocks(doc, blocks);
      } else {
        editor.insertBlocks(blocks, doc.at(-1), 'after');
      }
      onClose(true);
    } catch (err) {
      notify(err.message);
    }
  };

  const keyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); if (phase === 'writing') abort.current?.abort(); else onClose(false); return; }
    if (phase === 'ask' && shown.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : shown.length - 1)) % shown.length);
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
  };

  const where = editing
    ? `Editing ${ctx.blocks.length} selected block${ctx.blocks.length > 1 ? 's' : ''}`
    : 'Writing into this page';

  return (
    <div className="note-ai" ref={boxRef} role="dialog" aria-label="AI writer" onKeyDown={keyDown}>
      {editing && phase === 'ask' && (
        <div className="note-ai-quote"><span>Selected</span>{ctx.selection.slice(0, 220)}{ctx.selection.length > 220 ? '…' : ''}</div>
      )}
      {(phase !== 'ask' || result) && (
        <div className="note-ai-result">
          {result
            ? <div className="md" dangerouslySetInnerHTML={{ __html: markdown(result) }} />
            : <span className="thinking"><i /><i /><i /></span>}
        </div>
      )}
      <div className={`note-ai-bar ${phase === 'writing' ? 'busy' : ''}`}>
        <img src="/logo.png" alt="" width={20} height={20} />
        {phase === 'writing' ? (
          <span className="note-ai-status">AI is writing<span className="thinking"><i /><i /><i /></span></span>
        ) : (
          <input ref={inputRef} value={prompt} onChange={(e) => setPrompt(e.target.value)}
            placeholder={phase === 'done' ? 'Tell AI what to change…' : editing ? 'Ask AI to edit or explain the selection…' : 'Ask AI to write anything…'}
            aria-label="Ask AI" />
        )}
        {phase === 'writing' ? (
          <button className="icon-btn" type="button" onClick={() => abort.current?.abort()} aria-label="Stop" title="Stop (Esc)"><Icon name="stop" size={16} /></button>
        ) : (
          <button className="icon-btn send" type="button" onClick={submit} disabled={!prompt.trim() && phase === 'done'} aria-label="Send" title="Send (Enter)">
            <Icon name="send" size={16} />
          </button>
        )}
      </div>
      <div className="note-ai-menu" role="menu">
        {phase === 'ask' && (
          <>
            <p className="history-group">{where}</p>
            {shown.map((a, i) => (
              <button key={a.label} type="button" role="menuitem" className={i === active ? 'active' : ''} onMouseEnter={() => setActive(i)} onClick={() => pick(a)}>
                <span className="note-ai-ico">{a.icon}</span>{a.label}
              </button>
            ))}
            {!shown.length && prompt.trim() && <p className="history-empty">Press Enter to ask: "{prompt.trim()}"</p>}
          </>
        )}
        {phase === 'done' && (
          <>
            {editing && <button type="button" role="menuitem" onClick={() => place('replace')}><span className="note-ai-ico">⇄</span>Replace selection</button>}
            <button type="button" role="menuitem" onClick={() => place('insert')}><span className="note-ai-ico">↵</span>{editing ? 'Insert below' : 'Insert into page'}</button>
            <button type="button" role="menuitem" onClick={() => last && run(last)}><span className="note-ai-ico">↻</span>Try again</button>
            <button type="button" role="menuitem" onClick={() => navigator.clipboard?.writeText(result).then(() => notify('Copied'))}><span className="note-ai-ico">⧉</span>Copy</button>
            <button type="button" role="menuitem" className="danger" onClick={() => onClose(false)}><span className="note-ai-ico">✕</span>Discard</button>
          </>
        )}
      </div>
    </div>
  );
}
