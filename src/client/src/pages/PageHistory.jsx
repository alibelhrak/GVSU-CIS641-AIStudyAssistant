import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../lib/api.js';
import { t } from '../lib/i18n.jsx';
import { Icon } from '../icons.jsx';
import { ReadOnlyPage } from './Notes.jsx';

const when = (at) => new Date(at).toLocaleString(document.documentElement.lang || 'en', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/**
 * Page history: the copies the server kept of this page (before a big part was removed, and every 15 minutes
 * while editing). Pick one to see it, and restore it. Restoring goes through the editor, so it also reaches
 * everyone editing live, and it can be undone with Ctrl+Z.
 */
export default function PageHistory({ note, dark, getEditor, onClose, notify }) {
  const [list, setList] = useState(null);
  const [pick, setPick] = useState(null);       // { id, ... } the version shown
  const [preview, setPreview] = useState(null); // its content
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get(`/notes/${note.id}/versions`).then((l) => { setList(l); if (l[0]) setPick(l[0]); }).catch((err) => { notify(err.message); setList([]); });
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [note.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!pick) return;
    setPreview(null);
    api.get(`/notes/${note.id}/versions/${pick.id}`).then(setPreview).catch((err) => notify(err.message));
  }, [pick?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const restore = async () => {
    const editor = getEditor();
    if (!editor || !preview) return;
    setBusy(true);
    try {
      await api.post(`/notes/${note.id}/versions`);   // keep the page as it is now, so restoring can be undone later too
      const blocks = preview.content?.length ? preview.content : [{ type: 'paragraph' }];
      editor.replaceBlocks(editor.document, blocks);
      notify(t('Restored. Press Ctrl+Z to undo.'));
      onClose();
    } catch (err) { notify(err.message); setBusy(false); }
  };

  return createPortal(
    <div className="install-overlay" onClick={onClose} role="presentation">
      <div className="rem-card ph-card" role="dialog" aria-modal="true" aria-labelledby="ph-title" onClick={(e) => e.stopPropagation()}>
        <div className="rem-head">
          <span className="rem-bell"><Icon name="history" size={19} /></span>
          <div>
            <h2 id="ph-title">Page history</h2>
            <p className="muted">Copies are saved before a big part of the page is removed, and every 15 minutes while it is edited. They are kept for 60 days.</p>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Close"><Icon name="close" size={18} /></button>
        </div>
        {list === null ? <div className="chat-loading"><span className="thinking"><i /><i /><i /></span></div>
          : list.length === 0 ? <p className="note ph-none">No earlier versions yet. They appear here as the page is edited.</p> : (
            <div className="ph-body">
              <div className="ph-list" role="listbox" aria-label="Versions">
                {list.map((v) => (
                  <button key={v.id} type="button" role="option" aria-selected={pick?.id === v.id} className={`ph-item ${pick?.id === v.id ? 'on' : ''}`} onClick={() => setPick(v)}>
                    <b>{when(v.at)}</b>
                    <span className="muted">
                      {v.reason === 'shrink' ? <span className="ph-tag">{t('Before a big change')}</span> : null}
                      {t('{n} characters', { n: v.length.toLocaleString() })}{v.by ? <> · <span data-no-translate>{v.by === 'you' ? t('you') : v.by}</span></> : null}
                    </span>
                  </button>
                ))}
              </div>
              <div className="ph-preview">
                {preview ? (
                  <>
                    <div className="ph-preview-page"><ReadOnlyPage key={preview.id} note={{ title: preview.title, icon: preview.icon, content: preview.content }} dark={dark} /></div>
                    <div className="ph-actions">
                      <span className="note">The current page is saved in the history too, so you can come back to it.</span>
                      <button className="btn primary" type="button" onClick={restore} disabled={busy}><Icon name="history" size={15} /> Restore this version</button>
                    </div>
                  </>
                ) : <div className="chat-loading"><span className="thinking"><i /><i /><i /></span></div>}
              </div>
            </div>
          )}
      </div>
    </div>,
    document.body,
  );
}
