import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { t } from '../lib/i18n.jsx';
import { Icon } from '../icons.jsx';

/** Bold the words that were searched for */
function Mark({ text, q }) {
  if (!q || !text) return text || null;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text;
  return <>{text.slice(0, i)}<mark>{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>;
}

/**
 * Quick Find (Ctrl+K or Cmd+K, from anywhere): search pages (yours and shared with you, titles and text),
 * courses, assignments and study groups, or jump to a part of the app. Arrow keys and Enter.
 */
export default function QuickFind({ pages, onClose }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [data, setData] = useState(null);
  const [sel, setSel] = useState(0);
  const list = useRef(null);

  useEffect(() => {
    let stop = false;
    const timer = setTimeout(() => api.get(`/search?q=${encodeURIComponent(q.trim())}`).then((d) => { if (!stop) { setData(d); setSel(0); } }).catch(() => {}), q ? 160 : 0);
    return () => { stop = true; clearTimeout(timer); };
  }, [q]);

  const items = useMemo(() => {
    const out = [];
    const query = q.trim().toLowerCase();
    const go = pages.filter((p) => query && t(p.label).toLowerCase().includes(query)).slice(0, 4);
    go.forEach((p) => out.push({ group: 'Go to', key: `go${p.to}`, icon: <Icon name={p.icon} size={16} />, title: t(p.label), to: p.to }));
    (data?.notes || []).forEach((n) => out.push({ group: query ? 'Pages' : 'Recent pages', key: `n${n.id}`, icon: <span className="qf-emoji">{n.icon || '📄'}</span>,
      title: n.title || t('Untitled'), sub: n.snippet, meta: [n.parent, n.owner && `${t('Shared by')} ${n.owner}`].filter(Boolean).join(' · '), to: `/notes/${n.id}` }));
    (data?.tasks || []).forEach((x) => out.push({ group: 'Assignments & Exams', key: `t${x.id}`, icon: <Icon name={x.done ? 'tick' : 'check'} size={16} />, title: x.title,
      meta: [x.course, t(x.type), x.dueDate].filter(Boolean).join(' · '), to: '/tasks' }));
    (data?.courses || []).forEach((c) => out.push({ group: 'Courses', key: `c${c.id}`, icon: <span className="qf-dot" style={{ background: c.color }} />, title: `${c.code} · ${c.name}`, to: '/courses' }));
    (data?.groups || []).forEach((g) => out.push({ group: 'Study groups', key: `g${g.id}`, icon: <Icon name="users" size={16} />, title: g.name, to: `/groups/${g.id}` }));
    return out;
  }, [data, q, pages]);

  useEffect(() => { list.current?.querySelector(`[data-i="${sel}"]`)?.scrollIntoView({ block: 'nearest' }); }, [sel]);
  const pick = (it) => { if (!it) return; onClose(); navigate(it.to); };
  const key = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(items.length - 1, s + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(items[sel]); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  let group = null;
  return createPortal(
    <div className="install-overlay qf-overlay" onMouseDown={onClose} role="presentation">
      <div className="qf" role="dialog" aria-modal="true" aria-label="Quick Find" onMouseDown={(e) => e.stopPropagation()}>
        <div className="qf-input">
          <Icon name="search" size={18} />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={key} placeholder={t('Search pages, assignments, courses, groups…')}
            aria-label="Search" role="combobox" aria-expanded="true" aria-controls="qf-list" aria-activedescendant={items[sel] ? `qf-${sel}` : undefined} />
          <kbd>Esc</kbd>
        </div>
        <div className="qf-list" id="qf-list" role="listbox" ref={list}>
          {data === null ? <div className="qf-empty"><span className="thinking"><i /><i /><i /></span></div>
            : !items.length ? <p className="qf-empty">{q.trim() ? t('Nothing found for “{q}”.', { q: q.trim() }) : t('Type to search everything in StudyPilot.')}</p>
              : items.map((it, i) => {
                const head = it.group !== group;
                group = it.group;
                return (
                  <Fragment key={it.key}>
                    {head && <p className="qf-group">{it.group}</p>}
                    <button type="button" id={`qf-${i}`} data-i={i} role="option" aria-selected={i === sel} className={`qf-item ${i === sel ? 'on' : ''}`}
                      onMouseMove={() => setSel(i)} onClick={() => pick(it)}>
                      <span className="qf-icon">{it.icon}</span>
                      <span className="qf-text">
                        <b data-no-translate><Mark text={it.title} q={q.trim()} /></b>
                        {it.sub && <span className="qf-sub" data-no-translate>…<Mark text={it.sub} q={q.trim()} />…</span>}
                        {it.meta && <span className="qf-meta" data-no-translate>{it.meta}</span>}
                      </span>
                      {i === sel && <kbd>↵</kbd>}
                    </button>
                  </Fragment>
                );
              })}
        </div>
        <div className="qf-foot"><span><kbd>↑</kbd><kbd>↓</kbd> {t('move')}</span><span><kbd>↵</kbd> {t('open')}</span><span><kbd>Ctrl</kbd><kbd>K</kbd> {t('anywhere')}</span></div>
      </div>
    </div>,
    document.body,
  );
}
