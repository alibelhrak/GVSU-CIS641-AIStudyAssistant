/**
 * Shared by the study group chat and the shared-page chat: loading and polling messages
 * (new ones, and older ones that changed), reactions, and "Seen by …".
 */
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { t } from '../lib/i18n.jsx';
import { Icon } from '../icons.jsx';
import { Face } from './NoteShare.jsx';

export const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🎉', '✅'];

/**
 * Messages of one chat (`base` = '/groups/:id/messages' or '/notes/:id/messages'), refreshed every 4 s
 * while the page is visible. Polling also tells the server this person has seen the chat.
 */
export function useChatFeed(base, { onNew, onError } = {}) {
  const [msgs, setMsgs] = useState(null);
  const [reads, setReads] = useState([]);
  const since = useRef(null);
  const list = useRef([]);
  const cb = useRef({ onNew, onError }); cb.current = { onNew, onError };
  const put = (next) => { list.current = next; setMsgs(next); };

  useEffect(() => {
    let stop = false;
    since.current = null; list.current = []; setMsgs(null); setReads([]);
    const load = async (first) => {
      const visible = document.visibilityState === 'visible';
      if (!first && !visible) return;
      const q = `?v=2&seen=${visible ? 1 : 0}${since.current ? `&since=${encodeURIComponent(since.current)}` : ''}`;
      let d;
      try { d = await api.get(base + q); } catch (err) { if (first && !stop) { cb.current.onError?.(err); put([]); } return; }
      if (stop || !d || !Array.isArray(d.messages)) return;
      since.current = d.now;
      setReads(d.reads || []);
      if (first) { put(d.messages); cb.current.onNew?.(); return; }
      if (!d.messages.length) return;
      const byId = new Map(list.current.map((m) => [m.id, m]));
      let added = false;
      for (const m of d.messages) { if (!byId.has(m.id)) added = true; byId.set(m.id, m); }
      put([...byId.values()].sort((a, b) => new Date(a.at) - new Date(b.at)));
      if (added) cb.current.onNew?.();
    };
    load(true);
    const timer = setInterval(() => load(false), 4000);
    return () => { stop = true; clearInterval(timer); };
  }, [base]);

  return {
    msgs, reads,
    add: (m) => put([...list.current.filter((x) => x.id !== m.id), m]),
    remove: (id) => put(list.current.filter((x) => x.id !== id)),
    react: async (m, emoji) => {
      // show it at once, then take the server's answer
      const had = m.reactions?.find((r) => r.emoji === emoji)?.mine;
      const guess = { ...m, reactions: had
        ? m.reactions.map((r) => (r.emoji === emoji ? { ...r, count: r.count - 1, mine: false } : r)).filter((r) => r.count > 0)
        : (m.reactions?.some((r) => r.emoji === emoji) ? m.reactions.map((r) => (r.emoji === emoji ? { ...r, count: r.count + 1, mine: true } : r)) : [...(m.reactions || []), { emoji, count: 1, mine: true, names: [t('You')] }]) };
      put(list.current.map((x) => (x.id === m.id ? guess : x)));
      try {
        const up = await api.post(`${base}/${m.id}/react`, { emoji });
        put(list.current.map((x) => (x.id === m.id ? up : x)));
      } catch (err) { put(list.current.map((x) => (x.id === m.id ? m : x))); cb.current.onError?.(err); }
    },
  };
}

/** The reactions under a message: 👍 2. Click one to add or take back yours. */
export function Reactions({ m, onReact }) {
  if (!m.reactions?.length) return null;
  return (
    <div className="gchat-reacts">
      {m.reactions.map((r) => (
        <button key={r.emoji} type="button" className={r.mine ? 'on' : ''} onClick={() => onReact(m, r.emoji)}
          title={r.names?.map((n) => (n === 'You' ? t('You') : n)).join(', ')} aria-label={`${r.emoji} ${r.count}${r.mine ? `, ${t('including you')}` : ''}`} aria-pressed={r.mine}>
          <span>{r.emoji}</span>{r.count > 1 && <b>{r.count}</b>}
        </button>
      ))}
    </div>
  );
}

/** The small smiley next to a message's time: opens the reaction picker */
export function ReactButton({ m, onReact }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    document.addEventListener('mousedown', away); document.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc, true); };
  }, [open]);
  return (
    <span className="gchat-react" ref={ref}>
      <button type="button" className={open ? 'open' : ''} onClick={() => setOpen((v) => !v)} aria-label="React" title={t('React')} aria-expanded={open}><Icon name="smile" size={12} /></button>
      {open && (
        <span className="gchat-react-pick" role="menu">
          {REACTIONS.map((e) => {
            const mine = m.reactions?.some((r) => r.emoji === e && r.mine);
            return <button key={e} type="button" role="menuitem" className={mine ? 'on' : ''} onClick={() => { setOpen(false); onReact(m, e); }} aria-label={e}>{e}</button>;
          })}
        </span>
      )}
    </span>
  );
}

/** Under my latest message: who has seen it ("Seen by Sara and Omar"), or "Sent" */
export function SeenLine({ msgs, reads, m }) {
  const mineLast = [...msgs].reverse().find((x) => x.me);
  if (!mineLast || mineLast.id !== m.id) return null;
  const seen = reads.filter((r) => new Date(r.at) >= new Date(m.at));
  if (!seen.length) return <span className="gchat-seen"><Icon name="check" size={11} /> {t('Sent')}</span>;
  const names = seen.map((r) => r.user.name.split(' ')[0]);
  const label = names.length === 1 ? t('Seen by {a}', { a: names[0] })
    : names.length === 2 ? t('Seen by {a} and {b}', { a: names[0], b: names[1] })
      : t('Seen by {a}, {b} and {n} more', { a: names[0], b: names[1], n: names.length - 2 });
  return (
    <span className="gchat-seen on" title={seen.map((r) => r.user.name).join(', ')}>
      <span className="gchat-seen-faces">{seen.slice(0, 4).map((r) => <Face key={r.user.id} person={r.user} size={14} />)}</span>
      <span data-no-translate>{label}</span>
    </span>
  );
}
