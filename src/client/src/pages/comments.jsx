/**
 * Comments on text, like Notion: select words, press "Comment", and talk about them in a thread
 * next to the page. The words keep a "comment" mark (the thread's id) so clicking them opens it.
 */
import { useEffect, useRef, useState } from 'react';
import { createReactStyleSpec, useComponentsContext, useBlockNoteEditor } from '@blocknote/react';
import { api } from '../lib/api.js';
import { t } from '../lib/i18n.jsx';
import { Icon } from '../icons.jsx';
import { Face } from './NoteShare.jsx';

export const commentStyleSpec = createReactStyleSpec(
  { type: 'comment', propSchema: 'string' },
  { render: ({ value, contentRef }) => <span className="cmark" data-comment={value} ref={contentRef} /> },
);

/** Changes the mark of one thread everywhere in the page (to = null removes it) */
export function retagComment(editor, from, to) {
  if (!editor) return;
  const fixText = (items) => {
    let changed = false;
    const out = items.map((it) => {
      if (it.type === 'link' && Array.isArray(it.content)) {
        const inner = fixText(it.content);
        if (inner) { changed = true; return { ...it, content: inner }; }
        return it;
      }
      if (it.type !== 'text' || it.styles?.comment !== from) return it;
      changed = true;
      const styles = { ...it.styles };
      if (to) styles.comment = to; else delete styles.comment;
      return { ...it, styles };
    });
    return changed ? out : null;
  };
  const walk = (blocks) => {
    for (const b of blocks) {
      if (Array.isArray(b.content)) {
        const c = fixText(b.content);
        if (c) editor.updateBlock(b, { content: c });
      } else if (b.content?.type === 'tableContent') {
        let changed = false;
        const rows = b.content.rows.map((row) => ({ ...row, cells: row.cells.map((cell) => {
          const list = Array.isArray(cell) ? cell : cell.content || [];
          const c = fixText(list);
          if (!c) return cell;
          changed = true;
          return Array.isArray(cell) ? c : { ...cell, content: c };
        }) }));
        if (changed) editor.updateBlock(b, { content: { ...b.content, rows } });
      }
      if (b.children?.length) walk(b.children);
    }
  };
  try { walk(editor.document); } catch { /* the page changed under us: nothing to do */ }
}

/** "Comment" in the toolbar over selected text */
export function CommentToolbarButton({ onComment }) {
  const Components = useComponentsContext();
  const editor = useBlockNoteEditor();
  return (
    <Components.FormattingToolbar.Button className="bn-comment-button" mainTooltip={t('Comment')} label={t('Comment')}
      icon={<Icon name="comment" size={16} />}
      onClick={() => {
        const quote = editor.getSelectedText().trim().slice(0, 500);
        if (!quote) return;
        const temp = `new-${Date.now()}`;
        editor.addStyles({ comment: temp });
        onComment({ temp, quote });
      }}>
      <Icon name="comment" size={16} /><span>{t('Comment')}</span>
    </Components.FormattingToolbar.Button>
  );
}

const when = (at) => {
  const d = new Date(at);
  const today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString(document.documentElement.lang || 'en', { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString(document.documentElement.lang || 'en', { month: 'short', day: 'numeric' });
};

function Composer({ placeholder, onSend, autoFocus, onCancel }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async (e) => {
    e?.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    try { await onSend(text.trim()); setText(''); } finally { setBusy(false); }
  };
  return (
    <form className="cm-compose" onSubmit={send}>
      <textarea rows={1} value={text} autoFocus={autoFocus} maxLength={2000} placeholder={placeholder} aria-label={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) send(e);
          else if (e.key === 'Escape' && onCancel) { e.preventDefault(); onCancel(); }
        }} />
      {onCancel && <button type="button" className="btn sm" onClick={onCancel}>{t('Cancel')}</button>}
      <button type="submit" className="btn primary sm" disabled={!text.trim() || busy} aria-label="Send"><Icon name="send" size={14} /></button>
    </form>
  );
}

/** The Comments panel: every thread on the page, open ones first */
export default function CommentsPanel({ note, canEdit, getEditor, focus, draft, onDraftDone, notify, onClose }) {
  const [list, setList] = useState(null);
  const [showResolved, setShowResolved] = useState(false);
  const box = useRef(null);
  const owner = note.role === 'owner' || !note.role;

  const load = () => api.get(`/notes/${note.id}/comments`).then(setList).catch((err) => { notify(err.message); setList([]); });
  useEffect(() => {
    load();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') api.get(`/notes/${note.id}/comments`).then(setList).catch(() => {}); }, 20000);
    return () => clearInterval(timer);
  }, [note.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!focus || !list) return;
    const th = list.find((c) => c.id === focus);
    if (th?.resolved) setShowResolved(true);
    requestAnimationFrame(() => box.current?.querySelector(`[data-thread="${focus}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  }, [focus, list]);
  // A comment started but never sent: take its mark off the text again
  useEffect(() => () => { if (draft) retagComment(getEditor(), draft.temp, null); }, [draft]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = async (text) => {
    try {
      const c = await api.post(`/notes/${note.id}/comments`, { quote: draft.quote, text });
      retagComment(getEditor(), draft.temp, c.id);
      setList((l) => [...(l || []), c]);
      onDraftDone(c.id, true);
    } catch (err) { notify(err.message); throw err; }
  };
  const cancelDraft = () => { retagComment(getEditor(), draft.temp, null); onDraftDone(null, false); };
  const reply = async (c, text) => {
    try { const n = await api.post(`/notes/${note.id}/comments/${c.id}/replies`, { text }); setList((l) => l.map((x) => (x.id === c.id ? n : x))); }
    catch (err) { notify(err.message); throw err; }
  };
  const resolve = async (c, resolved) => {
    try {
      const n = await api.patch(`/notes/${note.id}/comments/${c.id}`, { resolved });
      if (resolved) retagComment(getEditor(), c.id, null);   // the words stop being highlighted
      setList((l) => l.map((x) => (x.id === c.id ? n : x)));
    } catch (err) { notify(err.message); }
  };
  const remove = async (c) => {
    try {
      await api.del(`/notes/${note.id}/comments/${c.id}`);
      if (canEdit) retagComment(getEditor(), c.id, null);
      setList((l) => l.filter((x) => x.id !== c.id));
    } catch (err) { notify(err.message); }
  };
  const jump = (c) => {
    const el = document.querySelector(`.note-editor-wrap .cmark[data-comment="${c.id}"]`);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 1200);
  };

  const open = (list || []).filter((c) => !c.resolved);
  const resolved = (list || []).filter((c) => c.resolved);
  const shown = showResolved ? resolved : open;

  return (
    <aside className="nai pchat cpanel" aria-label="Comments">
      <header className="nai-head">
        <span className="pchat-mark" aria-hidden="true"><Icon name="comment" size={16} /></span>
        <b>{t('Comments')}</b>
        <span className="nai-head-tools">
          <button className="icon-btn" type="button" title="Close (Esc)" aria-label="Close" onClick={onClose}><Icon name="close" size={17} /></button>
        </span>
      </header>
      <div className="cm-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={!showResolved} className={!showResolved ? 'on' : ''} onClick={() => setShowResolved(false)}>{t('Open')} {open.length > 0 && <span>{open.length}</span>}</button>
        <button type="button" role="tab" aria-selected={showResolved} className={showResolved ? 'on' : ''} onClick={() => setShowResolved(true)}>{t('Resolved')} {resolved.length > 0 && <span>{resolved.length}</span>}</button>
      </div>
      <div className="cm-list" ref={box}>
        {draft && !showResolved && (
          <div className="cm-thread on">
            <blockquote data-no-translate>{draft.quote}</blockquote>
            <Composer autoFocus placeholder={t('Add a comment…')} onSend={start} onCancel={cancelDraft} />
          </div>
        )}
        {list === null ? <div className="chat-loading"><span className="thinking"><i /><i /><i /></span></div>
          : !shown.length && !draft ? (
            <div className="pchat-empty">
              <Icon name="comment" size={28} />
              <b>{showResolved ? t('No resolved comments') : t('No comments yet')}</b>
              {!showResolved && <p className="muted">{canEdit ? t('Select some text and press “Comment” to ask a question or leave feedback about it.') : t('People who can edit this page can comment on its text. You can reply here.')}</p>}
            </div>
          ) : shown.map((c) => (
            <div key={c.id} data-thread={c.id} className={`cm-thread ${focus === c.id ? 'on' : ''}`}>
              <div className="cm-thread-top">
                {c.quote && <button type="button" className="cm-quote" onClick={() => jump(c)} title={t('Show in the page')} data-no-translate>{c.quote}</button>}
                <span className="cm-tools">
                  {canEdit && <button type="button" className="icon-btn" onClick={() => resolve(c, !c.resolved)} title={c.resolved ? t('Re-open') : t('Resolve')} aria-label={c.resolved ? t('Re-open') : t('Resolve')}>
                    <Icon name={c.resolved ? 'undo' : 'tick'} size={14} /></button>}
                  {(owner || c.messages[0]?.me) && <button type="button" className="icon-btn" onClick={() => remove(c)} title={t('Delete thread')} aria-label={t('Delete thread')}><Icon name="trash" size={14} /></button>}
                </span>
              </div>
              {c.messages.map((m) => (
                <div key={m.id} className="cm-msg">
                  <Face person={m.user} size={22} />
                  <div><b data-no-translate>{m.me ? t('You') : m.user.name}</b> <span className="muted">{when(m.at)}</span>
                    <p data-no-translate>{m.text}</p></div>
                </div>
              ))}
              {!c.resolved && <Composer placeholder={t('Reply…')} onSend={(text) => reply(c, text)} />}
            </div>
          ))}
      </div>
    </aside>
  );
}
