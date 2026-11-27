/** The 🔔 inbox: pages shared with you, @mentions, comments, suggestions, groups and meetings */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { t } from '../lib/i18n.jsx';
import { Icon } from '../icons.jsx';
import { Face } from './NoteShare.jsx';
import { useInvites, answerInvite } from './Groups.jsx';

const KIND_ICON = { share: 'share', group: 'users', invite: 'mail', mention: 'link', comment: 'comment', meeting: 'video', suggestion: 'pencil' };
const ago = (at) => {
  const s = (Date.now() - new Date(at)) / 1000;
  if (s < 60) return t('now');
  if (s < 3600) return t('{n} min ago', { n: Math.floor(s / 60) });
  if (s < 86400) return t('{n} h ago', { n: Math.floor(s / 3600) });
  return new Date(at).toLocaleDateString(document.documentElement.lang || 'en', { month: 'short', day: 'numeric' });
};

/** Unread count, checked every minute while the app is open */
export function useInboxCount() {
  const [n, setN] = useState(0);
  useEffect(() => {
    let stop = false;
    const check = () => { if (document.visibilityState === 'visible') api.get('/notifications/count').then((d) => { if (!stop) setN(d.unread); }).catch(() => {}); };
    check();
    const timer = setInterval(check, 60000);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('sa-inbox', check);
    return () => { stop = true; clearInterval(timer); document.removeEventListener('visibilitychange', check); window.removeEventListener('sa-inbox', check); };
  }, []);
  return [n, setN];
}

export default function Inbox({ onClose, onRead }) {
  const navigate = useNavigate();
  const [list, setList] = useState(null);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [invites, setInvites] = useInvites();
  const [answered, setAnswered] = useState({});   // group id -> 'accepted' | 'declined'
  const [busy, setBusy] = useState(null);
  const inviteOf = (n) => (n.kind === 'invite' ? new URLSearchParams(n.url.split('?')[1] || '').get('invite') : null);
  const answer = async (n, gid, accept) => {
    setBusy(gid);
    try {
      await answerInvite(gid, accept);
      setInvites((l) => l.filter((x) => x.id !== gid));
      setAnswered((a) => ({ ...a, [gid]: accept ? 'accepted' : 'declined' }));
      if (!n.read) { api.post('/notifications/read', { ids: [n.id] }).catch(() => {}); onRead(-1); setList((l) => l.map((x) => (x.id === n.id ? { ...x, read: true } : x))); }
      if (accept) { onClose(); navigate(`/groups/${gid}`); }
    } catch (err) { setAnswered((a) => ({ ...a, [gid]: err.message })); } finally { setBusy(null); }
  };
  useEffect(() => { api.get('/notifications').then(setList).catch(() => setList([])); }, []);
  useEffect(() => { const esc = (e) => { if (e.key === 'Escape') onClose(); }; document.addEventListener('keydown', esc); return () => document.removeEventListener('keydown', esc); }, [onClose]);

  const openOne = (n) => {
    if (!n.read) { api.post('/notifications/read', { ids: [n.id] }).catch(() => {}); onRead(-1); }
    onClose();
    if (n.url?.startsWith('/')) navigate(n.url);
  };
  const readAll = async () => {
    await api.post('/notifications/read', {}).catch(() => {});
    setList((l) => l.map((n) => ({ ...n, read: true }))); onRead(0);
  };
  const clearRead = async () => {
    await api.del('/notifications').catch(() => {});
    setList((l) => l.filter((n) => !n.read));
  };
  const shown = (list || []).filter((n) => !unreadOnly || !n.read);

  return createPortal(
    <div className="install-overlay inbox-overlay" onMouseDown={onClose} role="presentation">
      <div className="inbox" role="dialog" aria-modal="true" aria-label="Inbox" onMouseDown={(e) => e.stopPropagation()}>
        <div className="inbox-head">
          <b><Icon name="bell" size={16} /> {t('Inbox')}</b>
          <span className="inbox-tools">
            <label className="inbox-filter"><input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} /> {t('Unread only')}</label>
            <button type="button" className="btn sm" onClick={readAll} disabled={!list?.some((n) => !n.read)}>{t('Mark all read')}</button>
            <button className="icon-btn" type="button" onClick={onClose} aria-label="Close"><Icon name="close" size={17} /></button>
          </span>
        </div>
        <div className="inbox-list">
          {list === null ? <div className="chat-loading"><span className="thinking"><i /><i /><i /></span></div>
            : !shown.length ? (
              <div className="pchat-empty"><Icon name="bell" size={28} /><b>{unreadOnly ? t('You’re all caught up') : t('Nothing here yet')}</b>
                <p className="muted">{t('When someone shares a page with you, @mentions you, comments or suggests edits, it shows up here.')}</p></div>
            ) : shown.map((n) => {
              const gid = inviteOf(n);
              const pending = gid && invites.some((x) => x.id === gid) && !answered[gid];
              return (
              <div key={n.id} className="inbox-row">
              <button type="button" className={`inbox-item ${n.read ? '' : 'unread'}`} onClick={() => openOne(n)}>
                <span className="inbox-face">{n.actor ? <Face person={n.actor} size={30} /> : <Icon name="bell" size={18} />}
                  <span className="inbox-kind"><Icon name={KIND_ICON[n.kind] || 'bell'} size={11} /></span></span>
                <span className="inbox-text">
                  <b data-no-translate>{n.title}</b>
                  {n.body && <span className="inbox-body" data-no-translate>{n.body}</span>}
                  <span className="muted">{ago(n.at)}</span>
                </span>
                {!n.read && <span className="inbox-dot" aria-label={t('Unread')} />}
              </button>
              {pending && (
                <div className="inbox-actions">
                  <button type="button" className="btn primary sm" disabled={busy === gid} onClick={() => answer(n, gid, true)}><Icon name="tick" size={14} /> {t('Accept')}</button>
                  <button type="button" className="btn sm" disabled={busy === gid} onClick={() => answer(n, gid, false)}>{t('Decline')}</button>
                </div>
              )}
              {gid && answered[gid] && <p className="inbox-answer muted">{answered[gid] === 'accepted' ? t('You joined this group') : answered[gid] === 'declined' ? t('Invitation declined') : answered[gid]}</p>}
              </div>
              );
            })}
        </div>
        {list?.some((n) => n.read) && <button type="button" className="inbox-clear" onClick={clearRead}>{t('Clear read notifications')}</button>}
      </div>
    </div>,
    document.body,
  );
}
