import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { t } from '../lib/i18n.jsx';
import { colorFor } from '../lib/live.js';
import { Icon } from '../icons.jsx';

const initial = (name = '?') => name.trim()[0]?.toUpperCase() || '?';

/** A small round picture (or initial) for a person */
export function Face({ person, size = 28, ring }) {
  const style = { width: size, height: size, fontSize: size * 0.42, '--ring': ring || 'transparent', background: person.avatar ? undefined : person.color || colorFor(person.id || person.email || person.name) };
  return person.avatar
    ? <img className="face" src={person.avatar} alt="" style={style} title={person.name} />
    : <span className="face" style={style} title={person.name} data-no-translate>{initial(person.name)}</span>;
}

/** Who else has the page open right now (live pages) */
export function Presence({ people }) {
  if (!people?.length) return null;
  const shown = people.slice(0, 4);
  return (
    <div className="presence" aria-label={t('{n} people on this page').replace('{n}', people.length)} title={people.map((p) => p.name).join(', ')}>
      {shown.map((p) => <Face key={p.name} person={{ name: p.name, color: p.color }} size={26} ring={p.color} />)}
      {people.length > shown.length && <span className="face more">+{people.length - shown.length}</span>}
      <span className="presence-dot" aria-hidden="true" />
    </div>
  );
}

const ROLES = [{ id: 'editor', label: 'Can edit' }, { id: 'viewer', label: 'Can view' }];

/**
 * The Share window. The owner invites people (only existing accounts), shares with study groups
 * and turns on a public read-only link. Someone the page is shared with sees who owns it and can leave.
 */
export function ShareDialog({ note, onClose, onChanged, onLeft, notify }) {
  const owner = note.role === 'owner' || !note.role;
  const [data, setData] = useState(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('editor');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (owner) api.get(`/notes/${note.id}/sharing`).then(setData).catch((err) => setError(err.message));
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [note.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const apply = (d) => { setData(d); onChanged?.(d); };
  const run = async (fn) => {
    setBusy(true); setError('');
    try { apply(await fn()); return true; } catch (err) { setError(err.message); return false; } finally { setBusy(false); }
  };
  const invite = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    if (await run(() => api.post(`/notes/${note.id}/share`, { email: email.trim(), role }))) setEmail('');
  };
  const link = data?.publicId ? `${location.origin}/p/${data.publicId}` : '';
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* the link is selectable */ }
  };
  const leave = async () => {
    setBusy(true);
    try { await api.del(`/notes/${note.id}/share/me`); onLeft?.(); } catch (err) { setError(err.message); setBusy(false); }
  };
  const title = note.title || t('Untitled');

  return createPortal(
    <div className="install-overlay" onClick={onClose} role="presentation">
      <div className="rem-card share-card" role="dialog" aria-modal="true" aria-labelledby="share-title" onClick={(e) => e.stopPropagation()}>
        <div className="rem-head">
          <span className="rem-bell share-badge"><Icon name="users" size={20} /></span>
          <div>
            <h2 id="share-title">Share</h2>
            <p className="muted ellipsis"><span data-no-translate>{note.icon} {title}</span></p>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Close"><Icon name="close" size={18} /></button>
        </div>

        {!owner ? (
          <div className="share-guest">
            <p><b data-no-translate>{note.owner}</b> {note.role === 'viewer' ? t('shared this page with you. You can view it.') : t('shared this page with you. You can edit it, and everyone sees changes as they are typed.')}</p>
            {error && <p className="error-box">{error}</p>}
            <button className="btn danger" type="button" onClick={leave} disabled={busy}>Leave this page</button>
            <p className="note">You can only leave pages shared with you directly. Pages shared with a study group stay while you are in the group.</p>
          </div>
        ) : !data ? (
          error ? <p className="error-box">{error}</p> : <div className="chat-loading"><span className="thinking"><i /><i /><i /></span></div>
        ) : (
          <>
            <form className="share-invite" onSubmit={invite}>
              <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(''); }} placeholder="Email of a classmate" aria-label="Email of a classmate" autoFocus />
              <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="What they can do">
                {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
              <button className="btn primary" type="submit" disabled={busy || !email.trim()}>Invite</button>
            </form>
            <p className="note share-hint">They need a StudyPilot account with this email. They get an email with a link, and the page appears in their notes under "Shared with me".</p>
            {error && <p className="error-box">{error}</p>}

            <div className="share-list">
              <div className="share-row">
                <span className="face me"><Icon name="user" size={15} /></span>
                <div className="share-who"><b>You</b><span className="muted">Owner</span></div>
              </div>
              {data.shares.map((p) => (
                <div className="share-row" key={p.id}>
                  <Face person={p} />
                  <div className="share-who"><b data-no-translate>{p.name}</b><span className="muted" data-no-translate>{p.email}</span></div>
                  <select value={p.role} disabled={busy} aria-label={t('What they can do')}
                    onChange={(e) => (e.target.value === 'remove'
                      ? run(() => api.del(`/notes/${note.id}/share/${p.id}`))
                      : run(() => api.patch(`/notes/${note.id}/share/${p.id}`, { role: e.target.value })))}>
                    {ROLES.map((r) => <option key={r.id} value={r.id}>{t(r.label)}</option>)}
                    <option value="remove">{t('Remove')}</option>
                  </select>
                </div>
              ))}
            </div>

            <div className="share-section">
              <p className="code-menu-title">Study groups</p>
              {data.myGroups.length === 0 ? (
                <p className="note">You are not in a study group yet. <Link to="/groups" onClick={onClose}>Create one</Link> to share pages, deadlines and a chat with your team.</p>
              ) : data.myGroups.map((g) => {
                const on = data.groups.includes(g.id);
                return (
                  <label className="share-group" key={g.id}>
                    <input type="checkbox" checked={on} disabled={busy}
                      onChange={() => run(() => api.put(`/notes/${note.id}/groups`, { groups: on ? data.groups.filter((x) => x !== g.id) : [...data.groups, g.id] }))} />
                    <span className="dot" style={{ background: g.color }} />
                    <span className="ellipsis" data-no-translate>{g.name}</span>
                    <span className="muted">{g.members === 1 ? t('1 member') : t('{n} members').replace('{n}', g.members)}</span>
                  </label>
                );
              })}
              {data.myGroups.length > 0 && <p className="note">Group members can edit the page.</p>}
            </div>

            <div className="share-section">
              <button type="button" role="switch" aria-checked={Boolean(data.publicId)} className="look-row share-web" disabled={busy}
                onClick={() => run(() => api.post(`/notes/${note.id}/public`, { on: !data.publicId }))}>
                <Icon name="globe" size={17} />
                <span><b>Share to web</b><span className="muted">Anyone with the link can read the page, without an account.</span></span>
                <span className={`toggle ${data.publicId ? 'on' : ''}`} aria-hidden="true"><span /></span>
              </button>
              {link && (
                <div className="share-link">
                  <input readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Public link" data-no-translate />
                  <button className="btn sm" type="button" onClick={copy}><Icon name={copied ? 'tick' : 'link'} size={14} /> {copied ? t('Copied') : t('Copy link')}</button>
                </div>
              )}
            </div>
            <p className="note share-live"><Icon name="spark" size={13} /> Everyone who can edit sees changes live, as they are typed.</p>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
