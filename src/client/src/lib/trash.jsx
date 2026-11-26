import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from './api.js';
import { useData } from './store.jsx';
import { t } from './i18n.jsx';
import { Icon } from '../icons.jsx';

/** What each kind of deleted thing is called, and its icon */
const KINDS = {
  course: { label: 'Course', icon: 'book' },
  task: { label: 'Task', icon: 'check' },
  session: { label: 'Study session', icon: 'calendar' },
  log: { label: 'Logged hours', icon: 'history' },
  material: { label: 'Material', icon: 'clip' },
  note: { label: 'Page', icon: 'file' },
  chat: { label: 'Ask AI chat', icon: 'chat' },
};
const DAY = 86400000;
const daysLeft = (expiresAt) => Math.max(0, Math.ceil((new Date(expiresAt) - Date.now()) / DAY));

/** The Trash window: everything deleted in the last 30 days */
export function TrashPanel(props) {
  return createPortal(<Trash {...props} />, document.body);
}

function Trash({ onClose }) {
  const { reload, notify } = useData();
  const [items, setItems] = useState(null);
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState('');
  const [confirm, setConfirm] = useState(null);   // an item id, or 'all'

  useEffect(() => {
    api.get('/trash').then(setItems).catch((err) => { setItems([]); notify(err.message); });
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const restore = async (item) => {
    setBusy(item.id);
    try {
      await api.post(`/trash/${item.id}/restore`);
      setItems((list) => list.filter((i) => i.id !== item.id));
      await reload();
      window.dispatchEvent(new Event('sa-restored'));
      notify(t('Restored'));
    } catch (err) {
      notify(err.message);
    } finally {
      setBusy('');
    }
  };
  const destroy = async (id) => {
    setConfirm(null);
    setBusy(id);
    try {
      if (id === 'all') { await api.del('/trash'); setItems([]); notify(t('Trash emptied')); }
      else { await api.del(`/trash/${id}`); setItems((list) => list.filter((i) => i.id !== id)); notify(t('Deleted for good')); }
    } catch (err) {
      notify(err.message);
    } finally {
      setBusy('');
    }
  };

  const kinds = items ? [...new Set(items.map((i) => i.kind))] : [];
  const shown = (items || []).filter((i) => (filter === 'all' || i.kind === filter)
    && (!q.trim() || `${i.title} ${i.detail}`.toLowerCase().includes(q.trim().toLowerCase())));

  return (
    <div className="install-overlay" onClick={onClose} role="presentation">
      <div className="rem-card trash-card" role="dialog" aria-modal="true" aria-labelledby="trash-title" onClick={(e) => e.stopPropagation()}>
        <div className="rem-head">
          <span className="rem-bell trash-badge"><Icon name="trash" size={20} /></span>
          <div><h2 id="trash-title">Trash</h2><p className="muted">Deleted things stay here for 30 days, then they are deleted for good.</p></div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Close"><Icon name="close" size={18} /></button>
        </div>

        {items === null ? <div className="chat-loading"><span className="thinking"><i /><i /><i /></span></div>
          : items.length === 0 ? (
            <div className="trash-empty">
              <span aria-hidden="true">🗑️</span>
              <b>The Trash is empty</b>
              <p className="muted">When you delete a course, task, session, file, page or chat, it waits here for 30 days in case you change your mind.</p>
            </div>
          ) : (
            <>
              <div className="trash-tools">
                <label className="trash-search">
                  <Icon name="search" size={15} />
                  <input type="search" placeholder="Search the Trash" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the Trash" />
                </label>
                {kinds.length > 1 && (
                  <div className="trash-filters" role="tablist">
                    <button type="button" className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>All</button>
                    {kinds.map((k) => <button key={k} type="button" className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{KINDS[k]?.label || k}</button>)}
                  </div>
                )}
              </div>
              <div className="rem-list trash-list">
                {shown.length === 0 && <p className="history-empty">Nothing matches.</p>}
                {shown.map((i) => {
                  const left = daysLeft(i.expiresAt);
                  return (
                    <div className="rem-row trash-row" key={i.id}>
                      <span className="trash-kind" title={t(KINDS[i.kind]?.label || i.kind)}><Icon name={KINDS[i.kind]?.icon || 'file'} size={16} /></span>
                      <div className="trash-text">
                        <b className="ellipsis" data-no-translate>{i.title || 'Untitled'}</b>
                        <span className="muted">
                          {KINDS[i.kind]?.label}{i.detail ? <> · <span data-no-translate>{i.detail}</span></> : null}
                        </span>
                        <span className={`trash-left ${left <= 3 ? 'soon' : ''}`}>{left <= 0 ? 'Deleted today' : left === 1 ? 'Deleted for good tomorrow' : `${left} days left`}</span>
                      </div>
                      {confirm === i.id ? (
                        <div className="trash-actions">
                          <button className="btn sm danger" type="button" onClick={() => destroy(i.id)}>Delete for good</button>
                          <button className="btn sm" type="button" onClick={() => setConfirm(null)}>Cancel</button>
                        </div>
                      ) : (
                        <div className="trash-actions">
                          <button className="btn sm" type="button" disabled={busy === i.id} onClick={() => restore(i)}><Icon name="undo" size={14} /> Restore</button>
                          <button className="icon-btn" type="button" disabled={busy === i.id} onClick={() => setConfirm(i.id)} title="Delete for good" aria-label="Delete for good"><Icon name="trash" size={15} /></button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="trash-foot">
                <span className="muted">{items.length === 1 ? t('1 item') : t('{n} items', { n: items.length })}</span>
                {confirm === 'all' ? (
                  <span className="trash-actions">
                    <span className="note">Delete everything in the Trash for good?</span>
                    <button className="btn sm danger" type="button" onClick={() => destroy('all')}>Empty Trash</button>
                    <button className="btn sm" type="button" onClick={() => setConfirm(null)}>Cancel</button>
                  </span>
                ) : <button className="btn sm ghost danger-text" type="button" disabled={busy === 'all'} onClick={() => setConfirm('all')}>Empty Trash</button>}
              </div>
            </>
          )}
      </div>
    </div>
  );
}
