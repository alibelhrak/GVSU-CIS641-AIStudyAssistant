import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { t } from '../lib/i18n.jsx';
import { Icon } from '../icons.jsx';
import { Face } from './NoteShare.jsx';
import { ReportDialog } from './Report.jsx';

const seenKey = (id) => `sa-pchat-seen-${id}`;
const readSeen = (id) => { try { return localStorage.getItem(seenKey(id)) || ''; } catch { return ''; } };
const markSeen = (id, at) => { try { if (at) localStorage.setItem(seenKey(id), at); } catch { /* private mode */ } };
const timeOf = (at) => new Date(at).toLocaleTimeString(document.documentElement.lang || 'en', { hour: 'numeric', minute: '2-digit' });
const dayOf = (at) => new Date(at).toLocaleDateString(document.documentElement.lang || 'en', { weekday: 'short', month: 'short', day: 'numeric' });

/** How many messages arrived since this student last opened the page's chat (checked every 20 s while it is closed) */
export function usePageChatUnread(noteId, enabled, open) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled || open || !noteId) { setCount(0); return undefined; }
    let stop = false;
    const check = async () => {
      if (document.visibilityState !== 'visible') return;
      const seen = readSeen(noteId);
      const list = await api.get(`/notes/${noteId}/messages${seen ? `?after=${encodeURIComponent(seen)}` : ''}`).catch(() => null);
      if (!stop && list) setCount(list.filter((m) => !m.me).length);
    };
    check();
    const timer = setInterval(check, 20000);
    return () => { stop = true; clearInterval(timer); };
  }, [noteId, enabled, open]);
  return count;
}

/** The chat on a shared page: everyone who can open the page talks here, next to it */
export default function PageChat({ note, notify, onClose }) {
  const [msgs, setMsgs] = useState(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [reporting, setReporting] = useState(null);
  const box = useRef(null);
  const last = useRef(null);
  const stick = useRef(true);
  const input = useRef(null);

  const scroll = () => { const el = box.current; if (el && stick.current) el.scrollTop = el.scrollHeight; };
  useEffect(() => {
    let stop = false;
    last.current = null; stick.current = true; setMsgs(null);
    const first = async () => {
      const list = await api.get(`/notes/${note.id}/messages`).catch((err) => { notify(err.message); return []; });
      if (stop) return;
      setMsgs(list); last.current = list.at(-1)?.at || null; markSeen(note.id, last.current || new Date().toISOString());
      requestAnimationFrame(scroll);
    };
    const poll = async () => {
      if (stop || document.visibilityState !== 'visible') return;
      const more = await api.get(`/notes/${note.id}/messages${last.current ? `?after=${encodeURIComponent(last.current)}` : ''}`).catch(() => []);
      if (stop || !more.length) return;
      setMsgs((list) => { const have = new Set((list || []).map((m) => m.id)); return [...(list || []), ...more.filter((m) => !have.has(m.id))]; });
      last.current = more.at(-1).at; markSeen(note.id, last.current);
      requestAnimationFrame(scroll);
    };
    first();
    const timer = setInterval(poll, 4000);
    const esc = (e) => { if (e.key === 'Escape' && !reporting) onClose(); };
    document.addEventListener('keydown', esc);
    return () => { stop = true; clearInterval(timer); document.removeEventListener('keydown', esc); };
  }, [note.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async (e) => {
    e?.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const m = await api.post(`/notes/${note.id}/messages`, { text: body });
      setMsgs((list) => [...(list || []), m]); setText(''); last.current = m.at; markSeen(note.id, m.at);
      stick.current = true; requestAnimationFrame(scroll);
    } catch (err) { notify(err.message); } finally { setSending(false); input.current?.focus(); }
  };
  const remove = async (m) => {
    try { await api.del(`/notes/${note.id}/messages/${m.id}`); setMsgs((list) => list.filter((x) => x.id !== m.id)); } catch (err) { notify(err.message); }
  };
  const owner = note.role === 'owner' || !note.role;

  return (
    <aside className="nai pchat" aria-label="Page chat">
      <header className="nai-head">
        <span className="pchat-mark" aria-hidden="true"><Icon name="chat" size={16} /></span>
        <b>Page chat</b>
        <span className="nai-head-tools">
          <button className="icon-btn" type="button" title="Close (Esc)" aria-label="Close" onClick={onClose}><Icon name="close" size={17} /></button>
        </span>
      </header>
      <div className="gchat-list pchat-list" ref={box} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60; }}>
        {msgs === null ? <div className="chat-loading"><span className="thinking"><i /><i /><i /></span></div>
          : msgs.length === 0 ? (
            <div className="pchat-empty">
              <Icon name="chat" size={28} />
              <b>Talk about this page</b>
              <p className="muted">Everyone who can open <span data-no-translate>{note.icon} {note.title || t('Untitled')}</span> sees this chat. Ask a question, split the work, or say what you changed.</p>
            </div>
          ) : msgs.map((m, i) => {
            const prev = msgs[i - 1];
            const showDay = !prev || dayOf(prev.at) !== dayOf(m.at);
            const grouped = prev && !showDay && prev.user.id === m.user.id && new Date(m.at) - new Date(prev.at) < 5 * 60_000;
            return (
              <div key={m.id}>
                {showDay && <p className="gchat-day">{dayOf(m.at)}</p>}
                <div className={`gchat-msg ${m.me ? 'me' : ''} ${grouped ? 'grouped' : ''}`}>
                  {!m.me && !grouped && <Face person={m.user} size={28} />}
                  <div className="gchat-bubble-wrap">
                    {!m.me && !grouped && <span className="gchat-name" data-no-translate>{m.user.name}</span>}
                    <div className="gchat-bubble" data-no-translate>{m.text}</div>
                    <span className="gchat-time">{timeOf(m.at)}
                      {m.me || owner ? <button type="button" onClick={() => remove(m)} aria-label="Delete message" title="Delete"><Icon name="trash" size={11} /></button> : null}
                      {!m.me && <button type="button" onClick={() => setReporting(m)} aria-label="Report this message" title="Report"><Icon name="flag" size={11} /></button>}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
      </div>
      <form className="gchat-compose pchat-compose" onSubmit={send}>
        <textarea ref={input} rows={1} value={text} onChange={(e) => setText(e.target.value)} placeholder="Message everyone on this page…" maxLength={2000} aria-label="Message"
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} />
        <button className="btn primary" type="submit" disabled={!text.trim() || sending} aria-label="Send"><Icon name="send" size={16} /></button>
      </form>
      {reporting && <ReportDialog kind="note_message" id={reporting.id} name={`${reporting.user.name}: ${reporting.text.slice(0, 80)}`} onClose={() => setReporting(null)} />}
    </aside>
  );
}
