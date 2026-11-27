/**
 * Suggested edits: people who can only view a shared page change a copy of it and send it
 * to the owner, who sees what changed (line by line) and accepts or rejects it.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../lib/api.js';
import { t } from '../lib/i18n.jsx';
import { Icon } from '../icons.jsx';

/** Line diff (longest common subsequence), good for pages of a few thousand lines */
export function lineDiff(a, b) {
  const x = a.split('\n'); const y = b.split('\n');
  let start = 0;
  while (start < x.length && start < y.length && x[start] === y[start]) start += 1;
  let endX = x.length; let endY = y.length;
  while (endX > start && endY > start && x[endX - 1] === y[endY - 1]) { endX -= 1; endY -= 1; }
  const mx = x.slice(start, endX); const my = y.slice(start, endY);
  const out = x.slice(0, start).map((s) => ({ op: ' ', s }));
  if (mx.length * my.length > 4_000_000) {   // too big to compare line by line: show it as replaced
    mx.forEach((s) => out.push({ op: '-', s })); my.forEach((s) => out.push({ op: '+', s }));
  } else {
    const n = mx.length; const m = my.length;
    const L = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i -= 1) for (let j = m - 1; j >= 0; j -= 1) L[i][j] = mx[i] === my[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    let i = 0; let j = 0;
    while (i < n && j < m) {
      if (mx[i] === my[j]) { out.push({ op: ' ', s: mx[i] }); i += 1; j += 1; }
      else if (L[i + 1][j] >= L[i][j + 1]) { out.push({ op: '-', s: mx[i] }); i += 1; }
      else { out.push({ op: '+', s: my[j] }); j += 1; }
    }
    while (i < n) { out.push({ op: '-', s: mx[i] }); i += 1; }
    while (j < m) { out.push({ op: '+', s: my[j] }); j += 1; }
  }
  x.slice(endX).forEach((s) => out.push({ op: ' ', s }));
  return out;
}

/** Only the changed lines, with 2 lines around each change */
function Diff({ from, to }) {
  const d = lineDiff(from, to);
  const keep = d.map(() => false);
  d.forEach((l, i) => { if (l.op !== ' ') for (let k = Math.max(0, i - 2); k <= Math.min(d.length - 1, i + 2); k += 1) keep[k] = true; });
  const rows = [];
  d.forEach((l, i) => {
    if (keep[i]) rows.push(<div key={i} className={`sg-line ${l.op === '+' ? 'add' : l.op === '-' ? 'del' : ''}`}><span aria-hidden="true">{l.op}</span>{l.s || ' '}</div>);
    else if (keep[i - 1]) rows.push(<div key={i} className="sg-line gap">⋯</div>);
  });
  const added = d.filter((l) => l.op === '+').length; const removed = d.filter((l) => l.op === '-').length;
  return (
    <>
      <p className="sg-stats"><span className="add">+{added}</span> <span className="del">−{removed}</span> {t('lines')}</p>
      <div className="sg-diff" data-no-translate>{rows.length ? rows : <div className="sg-line gap">{t('Only formatting changed.')}</div>}</div>
    </>
  );
}

/** How many suggestions are waiting on this page (owner/editors: all; viewers: their own) */
export function useSuggestions(noteId, enabled) {
  const [list, setList] = useState([]);
  const reload = () => (noteId && enabled ? api.get(`/notes/${noteId}/suggestions`).then(setList).catch(() => setList([])) : setList([]));
  useEffect(() => { reload(); }, [noteId, enabled]); // eslint-disable-line react-hooks/exhaustive-deps
  return [list, reload];
}

/** Review window: what each suggestion changes, with Accept / Reject (or Withdraw for your own) */
export default function SuggestionsDialog({ note, list, canEdit, getEditor, onChanged, notify, onClose }) {
  const [open, setOpen] = useState(list[0]?.id || null);
  const [busy, setBusy] = useState(null);
  useEffect(() => { if (!open && list[0]) setOpen(list[0].id); }, [list]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const esc = (e) => { if (e.key === 'Escape') onClose(); }; document.addEventListener('keydown', esc); return () => document.removeEventListener('keydown', esc); }, [onClose]);

  const accept = async (s) => {
    const editor = getEditor();
    if (!editor) return;
    setBusy(s.id);
    try {
      const { content } = await api.get(`/notes/${note.id}/suggestions/${s.id}`);
      await api.post(`/notes/${note.id}/versions`).catch(() => {});   // the page as it was, in Page history
      editor.replaceBlocks(editor.document, content?.length ? content : [{ type: 'paragraph' }]);
      await api.post(`/notes/${note.id}/suggestions/${s.id}/accept`);
      notify(t('Suggestion accepted. The old version is in Page history.'));
      onChanged();
    } catch (err) { notify(err.message); } finally { setBusy(null); }
  };
  const reject = async (s) => {
    setBusy(s.id);
    try {
      await api.post(`/notes/${note.id}/suggestions/${s.id}/reject`);
      notify(s.mine && !canEdit ? t('Suggestion withdrawn') : t('Suggestion rejected'));
      onChanged();
    } catch (err) { notify(err.message); } finally { setBusy(null); }
  };

  return createPortal(
    <div className="install-overlay" onMouseDown={onClose} role="presentation">
      <div className="rem-card sg-card" role="dialog" aria-modal="true" aria-label="Suggested edits" onMouseDown={(e) => e.stopPropagation()}>
        <div className="sg-head">
          <b><Icon name="pencil" size={16} /> {t('Suggested edits')}</b>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </div>
        {!list.length && <p className="muted">{t('No suggestions waiting.')}</p>}
        <div className="sg-list">
          {list.map((s) => (
            <div key={s.id} className={`sg-item ${open === s.id ? 'open' : ''}`}>
              <button type="button" className="sg-item-top" onClick={() => setOpen(open === s.id ? null : s.id)} aria-expanded={open === s.id}>
                <span><b data-no-translate>{s.mine ? t('You') : s.by}</b> <span className="muted">· {new Date(s.at).toLocaleString(document.documentElement.lang || 'en', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span></span>
                {s.message && <span className="sg-msg" data-no-translate>“{s.message}”</span>}
              </button>
              {open === s.id && (
                <>
                  {canEdit && s.stale && <p className="sg-warn"><Icon name="info" size={14} /> {t('The page changed after this was suggested. Accepting replaces the whole page with the suggested version (the current one is kept in Page history).')}</p>}
                  <Diff from={s.baseText} to={s.text} />
                  <div className="sg-actions">
                    {canEdit && <button type="button" className="btn primary sm" disabled={busy === s.id} onClick={() => accept(s)}><Icon name="tick" size={14} /> {t('Accept')}</button>}
                    <button type="button" className="btn sm" disabled={busy === s.id} onClick={() => reject(s)}>{canEdit ? t('Reject') : t('Withdraw')}</button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
