/**
 * Databases, like Notion's: a page whose rows are pages, with typed properties
 * (text, number, select, multi-select, status, date, checkbox, link, person) and
 * views over the same rows: Table, Board (grouped by a select or status), Calendar
 * (by a date) and Gallery. Each view keeps its own filters, sorts and hidden properties.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../lib/api.js';
import { t } from '../lib/i18n.jsx';
import { Icon } from '../icons.jsx';
import { Face } from './NoteShare.jsx';
import { dateLabel, dayKey } from './blocks.jsx';

export const PROP_TYPES = [
  { type: 'text', label: 'Text', glyph: '≡' },
  { type: 'number', label: 'Number', glyph: '#' },
  { type: 'select', label: 'Select', glyph: '▾' },
  { type: 'multi', label: 'Multi-select', glyph: '☰' },
  { type: 'status', label: 'Status', glyph: '◉' },
  { type: 'date', label: 'Date', glyph: '▦' },
  { type: 'checkbox', label: 'Checkbox', glyph: '☑' },
  { type: 'url', label: 'Link', glyph: '↗' },
  { type: 'person', label: 'Person', glyph: '☺' },
];
const VIEW_TYPES = [
  { type: 'table', label: 'Table', glyph: '▤' },
  { type: 'board', label: 'Board', glyph: '▥' },
  { type: 'calendar', label: 'Calendar', glyph: '▦' },
  { type: 'gallery', label: 'Gallery', glyph: '▣' },
];
const COLORS = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'];
const CHOICE = ['select', 'multi', 'status'];
const TITLE = { id: 'title', name: 'Name', type: 'title' };
const glyph = (type) => (type === 'title' ? 'Aa' : PROP_TYPES.find((p) => p.type === type)?.glyph || '≡');
const rid = () => Math.random().toString(36).slice(2, 10);
const lang = () => document.documentElement.lang || 'en';
const untitled = (r) => r.title || t('Untitled');

// ---------- values ----------
/** A row with some changes applied ({ title } and/or { props }; an empty value removes it) */
const applyPatch = (r, patch) => {
  const next = { ...r };
  if (patch.title !== undefined) next.title = patch.title;
  if (patch.props) {
    next.props = { ...r.props };
    for (const [k, v] of Object.entries(patch.props)) { if (isEmpty(v)) delete next.props[k]; else next.props[k] = v; }
  }
  return next;
};
const isEmpty = (v) => v === undefined || v === null || v === '' || v === false || (Array.isArray(v) && !v.length);
const valueOf = (row, prop) => (prop.id === 'title' ? row.title : row.props?.[prop.id]);
function formatNumber(n, prop) {
  if (typeof n !== 'number') return '';
  const f = prop.format;
  if (f === 'percent') return `${n}%`;
  if (f === 'dollar' || f === 'euro') return new Intl.NumberFormat(lang(), { style: 'currency', currency: f === 'dollar' ? 'USD' : 'EUR' }).format(n);
  return new Intl.NumberFormat(lang()).format(n);
}
/** A value as plain text (search, sorting, CSV) */
export function textOf(row, prop, people = []) {
  const v = valueOf(row, prop);
  if (isEmpty(v)) return '';
  switch (prop.type) {
    case 'select': case 'status': return prop.options?.find((o) => o.id === v)?.name || '';
    case 'multi': return v.map((id) => prop.options?.find((o) => o.id === id)?.name).filter(Boolean).join(', ');
    case 'person': return v.map((id) => people.find((p) => p.id === id)?.name).filter(Boolean).join(', ');
    case 'checkbox': return v ? 'Yes' : '';
    case 'number': return String(v);
    default: return String(v);
  }
}

// ---------- filters and sorts ----------
const OPS = {
  title: ['contains', 'is', 'not', 'empty', 'filled'],
  text: ['contains', 'is', 'not', 'empty', 'filled'],
  url: ['contains', 'empty', 'filled'],
  number: ['is', 'not', 'before', 'after', 'empty', 'filled'],
  select: ['is', 'not', 'empty', 'filled'],
  status: ['is', 'not', 'empty', 'filled'],
  multi: ['is', 'not', 'empty', 'filled'],
  person: ['is', 'not', 'empty', 'filled'],
  date: ['on', 'before', 'after', 'empty', 'filled'],
  checkbox: ['is'],
};
const OP_LABEL = { contains: 'contains', is: 'is', not: 'is not', empty: 'is empty', filled: 'is not empty', on: 'is on', before: 'is before', after: 'is after' };
const opLabel = (op, type) => (type === 'number' ? { before: 'less than', after: 'more than', is: '=', not: '≠' }[op] || OP_LABEL[op] : type === 'multi' || type === 'person' ? { is: 'has', not: 'does not have' }[op] || OP_LABEL[op] : OP_LABEL[op]);

function passes(row, f, props, people) {
  const prop = f.prop === 'title' ? TITLE : props.find((p) => p.id === f.prop);
  if (!prop) return true;
  const v = valueOf(row, prop);
  if (f.op === 'empty') return isEmpty(v);
  if (f.op === 'filled') return !isEmpty(v);
  if (f.value === '' || f.value === undefined) return true;   // a filter still being set up
  const want = String(f.value).toLowerCase();
  switch (prop.type) {
    case 'checkbox': return Boolean(v) === (f.value === true || f.value === 'true');
    case 'number': {
      const a = Number(v); const b = Number(f.value);
      if (isEmpty(v) || !Number.isFinite(b)) return f.op === 'not';
      return f.op === 'is' ? a === b : f.op === 'not' ? a !== b : f.op === 'before' ? a < b : a > b;
    }
    case 'date': if (isEmpty(v)) return false; return f.op === 'on' ? v === f.value : f.op === 'before' ? v < f.value : v > f.value;
    case 'select': case 'status': return f.op === 'is' ? v === f.value : v !== f.value;
    case 'multi': case 'person': { const has = Array.isArray(v) && v.includes(f.value); return f.op === 'is' ? has : !has; }
    default: {
      const text = textOf(row, prop, people).toLowerCase();
      return f.op === 'contains' ? text.includes(want) : f.op === 'is' ? text === want : text !== want;
    }
  }
}
function compare(a, b, prop, people) {
  const va = valueOf(a, prop); const vb = valueOf(b, prop);
  if (isEmpty(va) && isEmpty(vb)) return 0;
  if (isEmpty(va)) return 1;   // empty values last
  if (isEmpty(vb)) return -1;
  if (prop.type === 'number') return va - vb;
  if (prop.type === 'select' || prop.type === 'status') {
    const idx = (v) => (prop.options || []).findIndex((o) => o.id === v);
    return idx(va) - idx(vb);
  }
  if (prop.type === 'checkbox') return (vb ? 1 : 0) - (va ? 1 : 0);
  return textOf(a, prop, people).localeCompare(textOf(b, prop, people), lang(), { numeric: true });
}
export function viewRows(rows, view, props, people, query) {
  let out = rows.filter((r) => (view.filters || []).every((f) => passes(r, f, props, people)));
  const q = query.trim().toLowerCase();
  if (q) out = out.filter((r) => [TITLE, ...props].some((p) => textOf(r, p, people).toLowerCase().includes(q)));
  const sorts = (view.sorts || []).map((s) => ({ ...s, prop: s.prop === 'title' ? TITLE : props.find((p) => p.id === s.prop) })).filter((s) => s.prop);
  return [...out].sort((a, b) => {
    for (const s of sorts) { const c = compare(a, b, s.prop, people); if (c) return s.dir === 'desc' ? -c : c; }
    return (a.rank - b.rank) || (new Date(a.createdAt) - new Date(b.createdAt));
  });
}

/** CSV of the rows in a view (for Excel or Google Sheets) */
export function exportCsv(title, rows, props, people) {
  const cols = [TITLE, ...props];
  const esc = (s) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = [cols.map((c) => esc(c.name)).join(','), ...rows.map((r) => cols.map((c) => esc(textOf(r, c, people))).join(','))];
  const blob = new Blob([`﻿${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${(title || 'Database').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Database'}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ---------- small pieces ----------
/** A floating panel next to the thing that opened it; closes on Escape or a click elsewhere */
function Pop({ anchor, onClose, children, width = 260, className = '' }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    const place = () => {
      if (!anchor?.isConnected || !ref.current) return;
      const r = anchor.getBoundingClientRect();
      const w = Math.min(width, window.innerWidth - 16);
      const h = ref.current.offsetHeight;
      let top = r.bottom + 4;
      if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 4 > 8 ? r.top - h - 4 : window.innerHeight - h - 8);
      setPos({ top, left: Math.max(8, Math.min(r.left, window.innerWidth - w - 8)), width: w });
    };
    place();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place);
    ro?.observe(ref.current);
    window.addEventListener('resize', place);
    return () => { ro?.disconnect(); window.removeEventListener('resize', place); };
  }, [anchor, width]);
  useEffect(() => {
    const down = (e) => { if (!ref.current?.contains(e.target) && !anchor?.contains(e.target) && !e.target.closest?.('.dbpop')) onClose(); };
    const esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', esc, true); };
  }, [anchor, onClose]);
  return createPortal(
    <div ref={ref} className={`dbpop ${className}`} role="dialog" style={pos ? { top: pos.top, left: pos.left, width: pos.width } : { top: 0, left: 0, width, visibility: 'hidden' }}>{children}</div>,
    document.body,
  );
}
/** Opens a Pop under the button that was clicked */
function usePop() {
  const [anchor, setAnchor] = useState(null);
  const open = useCallback((e) => setAnchor((a) => (a ? null : e.currentTarget)), []);
  const close = useCallback(() => setAnchor(null), []);
  return [anchor, open, close];
}

export function Tag({ option, onRemove }) {
  if (!option) return null;
  return (
    <span className={`dbtag c-${option.color || 'gray'}`} data-no-translate>
      {option.name}
      {onRemove && <button type="button" onClick={(e) => { e.stopPropagation(); onRemove(); }} aria-label={`Remove ${option.name}`}>×</button>}
    </span>
  );
}
function Status({ option }) {
  if (!option) return null;
  return <span className={`dbstatus c-${option.color || 'gray'}`} data-no-translate><i />{option.name}</span>;
}
function People({ ids, people }) {
  return (
    <span className="dbpeople">
      {ids.map((id) => {
        const p = people.find((x) => x.id === id) || { id, name: t('Former member') };
        return <span key={id} className="dbperson"><Face person={p} size={18} /><span data-no-translate>{p.name}</span></span>;
      })}
    </span>
  );
}
/** A value, read only (cards, board, calendar) */
export function ValueView({ prop, value, people = [], compact }) {
  if (isEmpty(value)) return null;
  switch (prop.type) {
    case 'select': return <Tag option={prop.options?.find((o) => o.id === value)} />;
    case 'status': return <Status option={prop.options?.find((o) => o.id === value)} />;
    case 'multi': return <span className="dbtags">{value.map((id) => <Tag key={id} option={prop.options?.find((o) => o.id === id)} />)}</span>;
    case 'person': return <People ids={value} people={people} />;
    case 'date': return <span className="dbdate">{dateLabel(value)}</span>;
    case 'checkbox': return <span className="dbcheck on" aria-label={prop.name}>✓{compact ? ` ${prop.name}` : ''}</span>;
    case 'number': return <span className="dbnum">{formatNumber(value, prop)}</span>;
    case 'url': return <a className="dburl" href={value} target="_blank" rel="noreferrer noopener" onClick={(e) => e.stopPropagation()} data-no-translate>{value.replace(/^https?:\/\/(www\.)?/, '').slice(0, 40)}</a>;
    default: return <span className="dbtext" data-no-translate>{value}</span>;
  }
}

/** Choose options of a Select / Multi-select / Status (and make new ones by typing) */
function OptionPicker({ prop, value, canEdit, onChange, onOptions }) {
  const [q, setQ] = useState('');
  const multi = prop.type === 'multi';
  const chosen = multi ? (value || []) : value ? [value] : [];
  const opts = prop.options || [];
  const shown = opts.filter((o) => o.name.toLowerCase().includes(q.trim().toLowerCase()));
  const exact = opts.some((o) => o.name.toLowerCase() === q.trim().toLowerCase());
  const pick = (id) => {
    if (multi) onChange(chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id]);
    else onChange(value === id ? null : id);
  };
  const create = () => {
    const name = q.trim().slice(0, 60);
    if (!name) return;
    const o = { id: rid(), name, color: COLORS[(opts.length + 1) % COLORS.length] };
    onOptions([...opts, o]);
    onChange(multi ? [...chosen, o.id] : o.id);
    setQ('');
  };
  return (
    <div className="dbpick">
      <div className="dbpick-in">
        {chosen.map((id) => <Tag key={id} option={opts.find((o) => o.id === id)} onRemove={canEdit ? () => pick(id) : undefined} />)}
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={canEdit ? t('Search or create…') : t('Search…')} aria-label="Search options"
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); if (shown.length && (exact || !canEdit)) pick(shown[0].id); else if (canEdit) create(); else if (shown[0]) pick(shown[0].id); }
          }} />
      </div>
      <p className="dbpop-label">{canEdit ? t('Pick an option or make one') : t('Options')}</p>
      <div className="dbpick-list">
        {shown.map((o) => (
          <button key={o.id} type="button" className={`dbpick-item ${chosen.includes(o.id) ? 'on' : ''}`} onClick={() => pick(o.id)} disabled={!canEdit}>
            {prop.type === 'status' ? <Status option={o} /> : <Tag option={o} />}
            {chosen.includes(o.id) && <Icon name="tick" size={14} />}
          </button>
        ))}
        {canEdit && q.trim() && !exact && (
          <button type="button" className="dbpick-item create" onClick={create}>{t('Create')} <Tag option={{ name: q.trim(), color: COLORS[(opts.length + 1) % COLORS.length] }} /></button>
        )}
        {!shown.length && !q.trim() && <p className="muted dbpop-empty">{t('No options yet. Type to make one.')}</p>}
      </div>
    </div>
  );
}

function PersonPicker({ value, people, onChange }) {
  const [q, setQ] = useState('');
  const chosen = value || [];
  const shown = people.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="dbpick">
      <div className="dbpick-in"><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search people…')} aria-label="Search people" /></div>
      <p className="dbpop-label">{t('People who can open this database')}</p>
      <div className="dbpick-list">
        {shown.map((p) => (
          <button key={p.id} type="button" className={`dbpick-item ${chosen.includes(p.id) ? 'on' : ''}`}
            onClick={() => onChange(chosen.includes(p.id) ? chosen.filter((x) => x !== p.id) : [...chosen, p.id])}>
            <span className="dbperson"><Face person={p} size={20} /><span data-no-translate>{p.name}</span></span>
            {chosen.includes(p.id) && <Icon name="tick" size={14} />}
          </button>
        ))}
      </div>
    </div>
  );
}

/** One editable value: in a table cell, or in a row page's property list */
export function Cell({ prop, value, people, canEdit, onChange, onOptions, autoFocus }) {
  const [anchor, openPop, closePop] = usePop();
  const [draft, setDraft] = useState(null);   // text being typed (saved on Enter or when leaving the box)
  const commit = () => {
    if (draft === null) return;
    const v = prop.type === 'number' ? (draft.trim() === '' ? null : Number(draft)) : draft.trim();
    setDraft(null);
    if (prop.type === 'number' && v !== null && !Number.isFinite(v)) return;
    if ((v ?? '') !== (value ?? '')) onChange(v === '' ? null : v);
  };
  const typing = { onBlur: commit, onKeyDown: (e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } else if (e.key === 'Escape') { setDraft(null); e.currentTarget.blur(); } } };

  if (prop.type === 'checkbox') {
    return <label className="dbcell dbcell-check"><input type="checkbox" checked={Boolean(value)} disabled={!canEdit} onChange={(e) => onChange(e.target.checked)} aria-label={prop.name} /></label>;
  }
  if (!canEdit) return <div className="dbcell ro"><ValueView prop={prop} value={value} people={people} /></div>;
  if (['text', 'title', 'number', 'url'].includes(prop.type)) {
    return (
      <div className={`dbcell dbcell-${prop.type}`}>
        <input className="dbcell-in" value={draft ?? (prop.type === 'number' && typeof value === 'number' ? String(value) : value || '')} autoFocus={autoFocus}
          inputMode={prop.type === 'number' ? 'decimal' : undefined} placeholder={prop.type === 'title' ? t('Untitled') : ''} aria-label={prop.name}
          onChange={(e) => setDraft(e.target.value)} {...typing} data-no-translate />
        {prop.type === 'number' && draft === null && typeof value === 'number' && prop.format && prop.format !== 'plain' && <span className="dbcell-fmt">{formatNumber(value, prop)}</span>}
        {prop.type === 'url' && value && <a className="dbcell-go" href={value} target="_blank" rel="noreferrer noopener" title={value} aria-label="Open link"><Icon name="external" size={13} /></a>}
      </div>
    );
  }
  if (prop.type === 'date') {
    return (
      <div className="dbcell dbcell-date">
        <input type="date" className="dbcell-in" value={value || ''} onChange={(e) => onChange(e.target.value || null)} aria-label={prop.name} />
        {value && <span className="dbcell-fmt">{dateLabel(value)}</span>}
      </div>
    );
  }
  return (
    <div className="dbcell">
      <button type="button" className="dbcell-btn" onClick={openPop} aria-label={prop.name} aria-expanded={Boolean(anchor)}>
        {isEmpty(value) ? <span className="dbcell-empty" /> : <ValueView prop={prop} value={value} people={people} />}
      </button>
      {anchor && (
        <Pop anchor={anchor} onClose={closePop} width={280}>
          {prop.type === 'person'
            ? <PersonPicker value={value} people={people} onChange={onChange} />
            : <OptionPicker prop={prop} value={value} canEdit={canEdit} onChange={(v) => { onChange(v); if (prop.type !== 'multi') closePop(); }} onOptions={onOptions} />}
        </Pop>
      )}
    </div>
  );
}

/** Edit a property: name, type, options, number format; sort, filter, hide or delete it */
function PropMenu({ prop, canEdit, onUpdate, onDelete, onSort, onFilter, onHide, onClose }) {
  const [name, setName] = useState(prop.name);
  const isTitle = prop.id === 'title';
  const setOption = (id, patch) => onUpdate({ options: prop.options.map((o) => (o.id === id ? { ...o, ...patch } : o)) });
  return (
    <div className="dbmenu">
      {canEdit && !isTitle && (
        <input className="dbmenu-name" value={name} autoFocus onChange={(e) => setName(e.target.value)} aria-label="Property name" maxLength={60}
          onBlur={() => name.trim() && name.trim() !== prop.name && onUpdate({ name: name.trim() })}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur(); onClose(); } }} />
      )}
      {canEdit && !isTitle && (
        <label className="dbmenu-row"><span>{t('Type')}</span>
          <select value={prop.type} onChange={(e) => {
            const type = e.target.value;
            onUpdate({ type, options: CHOICE.includes(type) ? prop.options || [] : undefined });
          }}>
            {PROP_TYPES.map((p) => <option key={p.type} value={p.type}>{p.glyph} {t(p.label)}</option>)}
          </select>
        </label>
      )}
      {canEdit && prop.type === 'number' && (
        <label className="dbmenu-row"><span>{t('Format')}</span>
          <select value={prop.format || 'plain'} onChange={(e) => onUpdate({ format: e.target.value })}>
            <option value="plain">{t('Number')}</option><option value="percent">%</option><option value="dollar">$</option><option value="euro">€</option>
          </select>
        </label>
      )}
      {canEdit && CHOICE.includes(prop.type) && (
        <div className="dbmenu-opts">
          <p className="dbpop-label">{t('Options')}</p>
          {(prop.options || []).map((o) => (
            <div key={o.id} className="dbmenu-opt">
              <button type="button" className={`dbdot c-${o.color}`} title={t('Change color')} aria-label={t('Change color')}
                onClick={() => setOption(o.id, { color: COLORS[(COLORS.indexOf(o.color) + 1) % COLORS.length] })} />
              <input defaultValue={o.name} maxLength={60} aria-label="Option name" data-no-translate
                onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== o.name && setOption(o.id, { name: e.target.value.trim() })}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
              <button type="button" className="icon-btn" aria-label={`Delete ${o.name}`} onClick={() => onUpdate({ options: prop.options.filter((x) => x.id !== o.id) })}><Icon name="close" size={13} /></button>
            </div>
          ))}
          <button type="button" className="dbmenu-item" onClick={() => onUpdate({ options: [...(prop.options || []), { id: rid(), name: t('Option {n}', { n: (prop.options?.length || 0) + 1 }), color: COLORS[((prop.options?.length || 0) + 1) % COLORS.length] }] })}>
            <Icon name="plus" size={14} /> {t('Add an option')}
          </button>
        </div>
      )}
      <div className="dbmenu-sep" />
      <button type="button" className="dbmenu-item" onClick={() => { onSort('asc'); onClose(); }}>↑ {t('Sort ascending')}</button>
      <button type="button" className="dbmenu-item" onClick={() => { onSort('desc'); onClose(); }}>↓ {t('Sort descending')}</button>
      <button type="button" className="dbmenu-item" onClick={() => { onFilter(); onClose(); }}><Icon name="search" size={14} /> {t('Filter')}</button>
      {!isTitle && <button type="button" className="dbmenu-item" onClick={() => { onHide(); onClose(); }}><Icon name="hideSide" size={14} /> {t('Hide in this view')}</button>}
      {canEdit && !isTitle && <button type="button" className="dbmenu-item danger" onClick={() => { onDelete(); onClose(); }}><Icon name="trash" size={14} /> {t('Delete property')}</button>}
    </div>
  );
}

function AddProp({ onAdd }) {
  return (
    <div className="dbmenu">
      <p className="dbpop-label">{t('New property')}</p>
      {PROP_TYPES.map((p) => (
        <button key={p.type} type="button" className="dbmenu-item" onClick={() => onAdd(p.type)}><span className="dbglyph">{p.glyph}</span> {t(p.label)}</button>
      ))}
    </div>
  );
}

// ---------- the views ----------
function TableView({ rows, props, view, people, canEdit, onRow, onAddRow, onDelete, onOpen, onPropMenu, onAddProp, onWidths, focusId }) {
  const cols = [TITLE, ...props.filter((p) => !(view.hidden || []).includes(p.id))];
  const width = (c) => view.widths?.[c.id] || (c.id === 'title' ? 260 : c.type === 'checkbox' ? 90 : 170);
  const [live, setLive] = useState(null);   // a column being resized: { id, w }
  const resize = (e, c) => {
    e.preventDefault(); e.stopPropagation();
    const x0 = e.clientX; const w0 = width(c);
    let w = w0;
    const move = (ev) => { w = Math.min(800, Math.max(70, w0 + ev.clientX - x0)); setLive({ id: c.id, w }); };
    const up = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); setLive(null); if (w !== w0) onWidths({ ...view.widths, [c.id]: w }); };
    document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
  };
  const w = (c) => (live?.id === c.id ? live.w : width(c));
  return (
    <div className="dbt-wrap">
      <table className="dbt" style={{ width: cols.reduce((s, c) => s + w(c), 0) + (canEdit ? 44 : 0) }}>
        <colgroup>{cols.map((c) => <col key={c.id} style={{ width: w(c) }} />)}{canEdit && <col style={{ width: 44 }} />}</colgroup>
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c.id}>
                <button type="button" className="dbt-head" onClick={(e) => onPropMenu(e, c)}><span className="dbglyph">{glyph(c.type)}</span><span className="ellipsis" data-no-translate={c.id !== 'title' || undefined}>{c.id === 'title' ? t('Name') : c.name}</span></button>
                <span className="dbt-resize" onPointerDown={(e) => resize(e, c)} aria-hidden="true" />
              </th>
            ))}
            {canEdit && <th className="dbt-plus"><button type="button" className="dbt-head" onClick={onAddProp} aria-label="Add a property" title={t('Add a property')}><Icon name="plus" size={15} /></button></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              {cols.map((c) => (
                <td key={c.id} className={c.id === 'title' ? 'dbt-title' : undefined}>
                  {c.id === 'title' ? (
                    <div className="dbt-titlecell">
                      <span className="dbt-icon">{r.icon || (r.hasText ? <Icon name="file" size={14} /> : <Icon name="note" size={14} />)}</span>
                      <Cell prop={TITLE} value={r.title} people={people} canEdit={canEdit} onChange={(v) => onRow(r, { title: v || '' })} autoFocus={focusId === r.id} />
                      <span className="dbt-rowtools">
                        <button type="button" className="dbt-open" onClick={() => onOpen(r.id)} title={t('Open as a page')}><Icon name="external" size={12} /> {t('Open')}</button>
                        {canEdit && <button type="button" className="icon-btn" onClick={() => onDelete([r.id])} aria-label={`Delete ${untitled(r)}`} title={t('Delete')}><Icon name="trash" size={13} /></button>}
                      </span>
                    </div>
                  ) : (
                    <Cell prop={c} value={r.props?.[c.id]} people={people} canEdit={canEdit} onChange={(v) => onRow(r, { props: { [c.id]: v } })}
                      onOptions={(options) => onPropMenu(null, c, { options })} />
                  )}
                </td>
              ))}
              {canEdit && <td />}
            </tr>
          ))}
        </tbody>
      </table>
      {canEdit && <button type="button" className="dbt-new" onClick={() => onAddRow()}><Icon name="plus" size={14} /> {t('New')}</button>}
    </div>
  );
}

function Card({ row, props, view, people, onOpen, draggable, onDragStart, skip }) {
  const shown = props.filter((p) => !(view.hidden || []).includes(p.id) && p.id !== skip && !isEmpty(row.props?.[p.id]));
  return (
    <div className={`dbcard ${view.type === 'gallery' ? 'big' : ''}`} draggable={draggable} onDragStart={onDragStart}
      role="button" tabIndex={0} onClick={() => onOpen(row.id)} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(row.id); }}>
      {view.type === 'gallery' && <div className="dbcard-cover">{row.icon || '📄'}</div>}
      <b className="dbcard-title" data-no-translate>{view.type !== 'gallery' && row.icon ? `${row.icon} ` : ''}{untitled(row)}</b>
      {shown.length > 0 && <div className="dbcard-props">{shown.map((p) => <ValueView key={p.id} prop={p} value={row.props[p.id]} people={people} compact />)}</div>}
    </div>
  );
}

function NeedProp({ type, onAdd, canEdit }) {
  const what = type === 'date' ? t('a Date property') : t('a Select or Status property');
  return (
    <div className="db-need">
      <p>{t('This view needs {what}.', { what })}</p>
      {canEdit && <button type="button" className="btn sm" onClick={onAdd}><Icon name="plus" size={14} /> {type === 'date' ? t('Add a Date property') : t('Add a Status property')}</button>}
    </div>
  );
}

function BoardView({ rows, props, view, people, canEdit, onRow, onAddRow, onOpen, onAddProp }) {
  const group = props.find((p) => p.id === view.group && CHOICE.includes(p.type) && p.type !== 'multi') || props.find((p) => p.type === 'status') || props.find((p) => p.type === 'select');
  const [over, setOver] = useState(null);
  if (!group) return <NeedProp type="choice" canEdit={canEdit} onAdd={() => onAddProp('status')} />;
  const cols = [{ id: null, name: t('No {name}', { name: group.name }), color: 'gray' }, ...(group.options || [])];
  const of = (id) => rows.filter((r) => (id === null ? !(group.options || []).some((o) => o.id === r.props?.[group.id]) : r.props?.[group.id] === id));
  const drop = (e, col) => {
    e.preventDefault(); setOver(null);
    const row = rows.find((r) => r.id === e.dataTransfer.getData('text/x-row'));
    if (row && row.props?.[group.id] !== (col.id ?? undefined)) onRow(row, { props: { [group.id]: col.id } });
  };
  return (
    <div className="dbboard">
      {cols.map((col) => {
        const list = of(col.id);
        if (col.id === null && !list.length) return null;
        return (
          <section key={col.id || 'none'} className={`dbcol ${over === (col.id || 'none') ? 'over' : ''}`}
            onDragOver={canEdit ? (e) => { e.preventDefault(); setOver(col.id || 'none'); } : undefined} onDragLeave={() => setOver(null)} onDrop={canEdit ? (e) => drop(e, col) : undefined}>
            <header className="dbcol-head">
              {col.id ? (group.type === 'status' ? <Status option={col} /> : <Tag option={col} />) : <span className="muted">{col.name}</span>}
              <span className="muted">{list.length}</span>
              {canEdit && <button type="button" className="icon-btn" aria-label={`New in ${col.name}`} onClick={() => onAddRow(col.id ? { [group.id]: col.id } : {})}><Icon name="plus" size={14} /></button>}
            </header>
            <div className="dbcol-cards">
              {list.map((r) => <Card key={r.id} row={r} props={props} view={view} people={people} onOpen={onOpen} skip={group.id}
                draggable={canEdit} onDragStart={(e) => { e.dataTransfer.setData('text/x-row', r.id); e.dataTransfer.effectAllowed = 'move'; }} />)}
              {canEdit && <button type="button" className="dbcol-new" onClick={() => onAddRow(col.id ? { [group.id]: col.id } : {})}><Icon name="plus" size={13} /> {t('New')}</button>}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function CalendarView({ rows, props, view, people, canEdit, onRow, onAddRow, onOpen, onAddProp }) {
  const prop = props.find((p) => p.id === view.date && p.type === 'date') || props.find((p) => p.type === 'date');
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [over, setOver] = useState(null);
  if (!prop) return <NeedProp type="date" canEdit={canEdit} onAdd={() => onAddProp('date')} />;
  const start = new Date(month); start.setDate(1 - start.getDay());   // weeks start on Sunday
  const days = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  const byDay = new Map();
  rows.forEach((r) => { const k = r.props?.[prop.id]; if (k) { if (!byDay.has(k)) byDay.set(k, []); byDay.get(k).push(r); } });
  const undated = rows.filter((r) => !r.props?.[prop.id]);
  const today = dayKey(new Date());
  const drop = (e, key) => {
    e.preventDefault(); setOver(null);
    const row = rows.find((r) => r.id === e.dataTransfer.getData('text/x-row'));
    if (row && row.props?.[prop.id] !== key) onRow(row, { props: { [prop.id]: key } });
  };
  const weekdays = Array.from({ length: 7 }, (_, i) => new Date(2026, 1, 1 + i).toLocaleDateString(lang(), { weekday: 'short' }));   // Feb 1 2026 is a Sunday
  return (
    <div className="dbcal">
      <div className="dbcal-bar">
        <b>{month.toLocaleDateString(lang(), { month: 'long', year: 'numeric' })}</b>
        <span className="dbcal-nav">
          <button type="button" className="icon-btn" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><Icon name="back" size={15} /></button>
          <button type="button" className="btn sm" onClick={() => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); }}>{t('Today')}</button>
          <button type="button" className="icon-btn flip" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><Icon name="back" size={15} /></button>
        </span>
      </div>
      <div className="dbcal-grid">
        {weekdays.map((w) => <div key={w} className="dbcal-wd">{w}</div>)}
        {days.map((d) => {
          const key = dayKey(d);
          return (
            <div key={key} className={`dbcal-day ${d.getMonth() !== month.getMonth() ? 'out' : ''} ${key === today ? 'today' : ''} ${over === key ? 'over' : ''}`}
              onDragOver={canEdit ? (e) => { e.preventDefault(); setOver(key); } : undefined} onDragLeave={() => setOver(null)} onDrop={canEdit ? (e) => drop(e, key) : undefined}>
              <div className="dbcal-num">
                <span>{d.getDate()}</span>
                {canEdit && <button type="button" className="icon-btn" aria-label={`New on ${key}`} onClick={() => onAddRow({ [prop.id]: key })}><Icon name="plus" size={12} /></button>}
              </div>
              {(byDay.get(key) || []).map((r) => (
                <button key={r.id} type="button" className="dbcal-item" draggable={canEdit} onClick={() => onOpen(r.id)}
                  onDragStart={(e) => { e.dataTransfer.setData('text/x-row', r.id); e.dataTransfer.effectAllowed = 'move'; }} data-no-translate>
                  {r.icon ? `${r.icon} ` : ''}{untitled(r)}
                </button>
              ))}
            </div>
          );
        })}
      </div>
      {undated.length > 0 && (
        <details className="dbcal-undated">
          <summary>{t('{n} without a date', { n: undated.length })}</summary>
          <div>{undated.map((r) => <button key={r.id} type="button" className="dbcal-item" draggable={canEdit} onClick={() => onOpen(r.id)}
            onDragStart={(e) => e.dataTransfer.setData('text/x-row', r.id)} data-no-translate>{untitled(r)}</button>)}</div>
        </details>
      )}
    </div>
  );
}

function GalleryView({ rows, props, view, people, canEdit, onAddRow, onOpen }) {
  return (
    <div className="dbgallery">
      {rows.map((r) => <Card key={r.id} row={r} props={props} view={view} people={people} onOpen={onOpen} />)}
      {canEdit && <button type="button" className="dbcard big new" onClick={() => onAddRow()}><Icon name="plus" size={18} /> {t('New')}</button>}
    </div>
  );
}

// ---------- toolbar panels ----------
function FilterPanel({ view, props, people, onChange }) {
  const all = [TITLE, ...props];
  const filters = view.filters || [];
  const set = (i, patch) => onChange(filters.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const valueBox = (f, i) => {
    const prop = all.find((p) => p.id === f.prop);
    if (!prop || f.op === 'empty' || f.op === 'filled') return null;
    if (prop.type === 'checkbox') return <select value={String(f.value === true || f.value === 'true')} onChange={(e) => set(i, { value: e.target.value === 'true' })}><option value="true">{t('Checked')}</option><option value="false">{t('Unchecked')}</option></select>;
    if (CHOICE.includes(prop.type)) return <select value={f.value || ''} onChange={(e) => set(i, { value: e.target.value })}><option value="">…</option>{(prop.options || []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>;
    if (prop.type === 'person') return <select value={f.value || ''} onChange={(e) => set(i, { value: e.target.value })}><option value="">…</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>;
    if (prop.type === 'date') return <input type="date" value={f.value || ''} onChange={(e) => set(i, { value: e.target.value })} />;
    return <input value={f.value ?? ''} inputMode={prop.type === 'number' ? 'decimal' : undefined} placeholder={t('Value')} onChange={(e) => set(i, { value: e.target.value })} />;
  };
  return (
    <div className="dbmenu dbfilters">
      {!filters.length && <p className="muted dbpop-empty">{t('No filters. Show only the rows you need.')}</p>}
      {filters.map((f, i) => {
        const prop = all.find((p) => p.id === f.prop) || TITLE;
        return (
          // eslint-disable-next-line react/no-array-index-key
          <div key={i} className="dbfilter">
            <select value={f.prop} onChange={(e) => { const p = all.find((x) => x.id === e.target.value); set(i, { prop: p.id, op: OPS[p.type][0], value: p.type === 'checkbox' ? true : '' }); }}>
              {all.map((p) => <option key={p.id} value={p.id}>{p.id === 'title' ? t('Name') : p.name}</option>)}
            </select>
            <select value={f.op} onChange={(e) => set(i, { op: e.target.value })}>{OPS[prop.type].map((op) => <option key={op} value={op}>{t(opLabel(op, prop.type))}</option>)}</select>
            {valueBox(f, i)}
            <button type="button" className="icon-btn" aria-label="Remove filter" onClick={() => onChange(filters.filter((_, j) => j !== i))}><Icon name="close" size={13} /></button>
          </div>
        );
      })}
      {filters.length < 10 && <button type="button" className="dbmenu-item" onClick={() => onChange([...filters, { prop: 'title', op: 'contains', value: '' }])}><Icon name="plus" size={14} /> {t('Add a filter')}</button>}
    </div>
  );
}
function SortPanel({ view, props, onChange }) {
  const all = [TITLE, ...props];
  const sorts = view.sorts || [];
  return (
    <div className="dbmenu dbfilters">
      {!sorts.length && <p className="muted dbpop-empty">{t('No sorts. Rows keep the order they were added in.')}</p>}
      {sorts.map((s, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <div key={i} className="dbfilter">
          <select value={s.prop} onChange={(e) => onChange(sorts.map((x, j) => (j === i ? { ...x, prop: e.target.value } : x)))}>
            {all.map((p) => <option key={p.id} value={p.id}>{p.id === 'title' ? t('Name') : p.name}</option>)}
          </select>
          <select value={s.dir} onChange={(e) => onChange(sorts.map((x, j) => (j === i ? { ...x, dir: e.target.value } : x)))}>
            <option value="asc">{t('Ascending')}</option><option value="desc">{t('Descending')}</option>
          </select>
          <button type="button" className="icon-btn" aria-label="Remove sort" onClick={() => onChange(sorts.filter((_, j) => j !== i))}><Icon name="close" size={13} /></button>
        </div>
      ))}
      {sorts.length < 3 && <button type="button" className="dbmenu-item" onClick={() => onChange([...sorts, { prop: 'title', dir: 'asc' }])}><Icon name="plus" size={14} /> {t('Add a sort')}</button>}
    </div>
  );
}
function PropsPanel({ view, props, onChange }) {
  const hidden = new Set(view.hidden || []);
  return (
    <div className="dbmenu">
      <p className="dbpop-label">{t('Shown in this view')}</p>
      <label className="dbmenu-check"><input type="checkbox" checked disabled /> {t('Name')}</label>
      {props.map((p) => (
        <label key={p.id} className="dbmenu-check">
          <input type="checkbox" checked={!hidden.has(p.id)} onChange={() => onChange(hidden.has(p.id) ? [...hidden].filter((x) => x !== p.id) : [...hidden, p.id])} />
          <span className="dbglyph">{glyph(p.type)}</span> <span data-no-translate>{p.name}</span>
        </label>
      ))}
    </div>
  );
}
function ViewPanel({ view, props, canDelete, onChange, onDuplicate, onDelete, onClose }) {
  const [name, setName] = useState(view.name);
  const choice = props.filter((p) => p.type === 'select' || p.type === 'status');
  const dates = props.filter((p) => p.type === 'date');
  return (
    <div className="dbmenu">
      <input className="dbmenu-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} aria-label="View name"
        onBlur={() => name.trim() && name.trim() !== view.name && onChange({ name: name.trim() })} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
      <p className="dbpop-label">{t('Layout')}</p>
      <div className="dbviews-pick">
        {VIEW_TYPES.map((v) => <button key={v.type} type="button" className={view.type === v.type ? 'on' : ''} onClick={() => onChange({ type: v.type })}><span className="dbglyph">{v.glyph}</span>{t(v.label)}</button>)}
      </div>
      {view.type === 'board' && choice.length > 0 && (
        <label className="dbmenu-row"><span>{t('Group by')}</span>
          <select value={view.group || ''} onChange={(e) => onChange({ group: e.target.value })}>{choice.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        </label>
      )}
      {view.type === 'calendar' && dates.length > 0 && (
        <label className="dbmenu-row"><span>{t('Show by')}</span>
          <select value={view.date || ''} onChange={(e) => onChange({ date: e.target.value })}>{dates.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        </label>
      )}
      <div className="dbmenu-sep" />
      <button type="button" className="dbmenu-item" onClick={() => { onDuplicate(); onClose(); }}><Icon name="copy" size={14} /> {t('Duplicate view')}</button>
      {canDelete && <button type="button" className="dbmenu-item danger" onClick={() => { onDelete(); onClose(); }}><Icon name="trash" size={14} /> {t('Delete view')}</button>}
    </div>
  );
}

// ---------- the database ----------
export default function DatabaseView({ note, canEdit, notify, onOpen, onReady }) {
  const [data, setData] = useState(null);           // { rows, people }
  const [db, setDb] = useState(note.db);
  const [viewId, setViewId] = useState(() => { try { return localStorage.getItem(`db-view-${note.id}`) || ''; } catch { return ''; } });
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [pop, setPop] = useState(null);             // { kind, anchor, prop? }
  const [focusId, setFocusId] = useState(null);
  const saveTimer = useRef(null);
  const schemaSaved = useRef(Promise.resolve());   // row changes wait for a new option to be saved first
  const latest = useRef(db); latest.current = db;

  const load = useCallback(() => api.get(`/notes/${note.id}/rows`).then((d) => {
    setData({ rows: d.rows, people: d.people });
    if (!saveTimer.current) setDb(d.db);   // someone else changed the properties (not while ours are being saved)
  }).catch((err) => { notify(err.message); setData((x) => x || { rows: [], people: [] }); }), [note.id, notify]);
  useEffect(() => {
    load();
    const tick = () => { if (document.visibilityState === 'visible' && !document.querySelector('.dbpop, .dbcell-in:focus')) load(); };
    const timer = setInterval(tick, 15000);
    window.addEventListener('focus', tick);
    return () => { clearInterval(timer); window.removeEventListener('focus', tick); };
  }, [load]);

  // Properties and views are saved half a second after the last change (people who can only view change them just for themselves)
  const saveDb = useCallback((next, now = false) => {
    setDb(next);
    if (!canEdit) return;
    clearTimeout(saveTimer.current);
    if (now) {
      saveTimer.current = 'now';
      schemaSaved.current = api.patch(`/notes/${note.id}`, { db: next }).catch((err) => notify(err.message)).finally(() => { saveTimer.current = null; });
      return;
    }
    saveTimer.current = setTimeout(() => {
      api.patch(`/notes/${note.id}`, { db: latest.current }).catch((err) => notify(err.message)).finally(() => { saveTimer.current = null; });
    }, 500);
  }, [canEdit, note.id, notify]);
  useEffect(() => () => {   // leaving the page: save what is waiting
    if (saveTimer.current) { clearTimeout(saveTimer.current); api.patch(`/notes/${note.id}`, { db: latest.current }).catch(() => {}); }
  }, [note.id]);

  const props = db?.props || [];
  const views = db?.views?.length ? db.views : [{ id: 'v1', name: 'Table', type: 'table', sorts: [], filters: [], hidden: [], widths: {} }];
  const view = views.find((v) => v.id === viewId) || views[0];
  const people = data?.people || [];
  const rows = useMemo(() => (data ? viewRows(data.rows, view, props, people, query) : []), [data, view, props, people, query]);
  useEffect(() => { onReady?.({ exportCsv: () => exportCsv(note.title, rows, props, people) }); }, [rows, props, people, note.title, onReady]);

  const chooseView = (id) => { setViewId(id); try { localStorage.setItem(`db-view-${note.id}`, id); } catch { /* private mode */ } };
  const updateView = (patch) => saveDb({ props, views: views.map((v) => (v.id === view.id ? { ...v, ...patch } : v)) });
  const updateProp = (pid, patch, now) => saveDb({ props: props.map((p) => (p.id === pid ? { ...p, ...patch } : p)), views }, now);
  const addProp = (type) => {
    const p = { id: rid(), name: t(PROP_TYPES.find((x) => x.type === type).label), type, ...(CHOICE.includes(type) ? { options: type === 'status' ? [
      { id: rid(), name: t('Not started'), color: 'gray' }, { id: rid(), name: t('In progress'), color: 'blue' }, { id: rid(), name: t('Done'), color: 'green' }] : [] } : {}) };
    saveDb({ props: [...props, p], views: views.map((v) => (v.id === view.id && v.type === 'board' && !v.group && CHOICE.includes(type) ? { ...v, group: p.id }
      : v.id === view.id && v.type === 'calendar' && !v.date && type === 'date' ? { ...v, date: p.id } : v)) });
    setPop(null);
    return p;
  };
  const deleteProp = (pid) => saveDb({
    props: props.filter((p) => p.id !== pid),
    views: views.map((v) => ({ ...v, sorts: (v.sorts || []).filter((s) => s.prop !== pid), filters: (v.filters || []).filter((f) => f.prop !== pid), hidden: (v.hidden || []).filter((h) => h !== pid) })),
  });
  const addView = (type) => {
    const v = { id: rid(), name: t(VIEW_TYPES.find((x) => x.type === type).label), type, sorts: [], filters: [], hidden: [], widths: {} };
    saveDb({ props, views: [...views, v] });
    chooseView(v.id); setPop(null);
  };

  const setRows = (fn) => setData((d) => ({ ...d, rows: fn(d.rows) }));
  const changeRow = async (row, patch) => {
    setRows((list) => list.map((r) => (r.id === row.id ? applyPatch(r, patch) : r)));
    try { await schemaSaved.current; await api.patch(`/notes/${row.id}`, patch); } catch (err) { notify(err.message); load(); }
  };
  const addRow = async (values = {}) => {
    // A new row matches the view's simple filters, so it does not vanish as soon as it is made
    const fromFilters = {};
    for (const f of view.filters || []) {
      const p = props.find((x) => x.id === f.prop);
      if (p && f.value !== '' && f.value !== undefined && ((f.op === 'is' && ['select', 'status', 'checkbox', 'text'].includes(p.type)) || (f.op === 'on' && p.type === 'date'))) fromFilters[p.id] = p.type === 'checkbox' ? f.value === true || f.value === 'true' : f.value;
      if (p && f.op === 'is' && (p.type === 'multi' || p.type === 'person') && f.value) fromFilters[p.id] = [f.value];
    }
    try {
      const row = await api.post(`/notes/${note.id}/rows`, { props: { ...fromFilters, ...values } });
      setRows((list) => [...list, row]);
      if (view.type === 'table') setFocusId(row.id); else onOpen(row.id);
    } catch (err) { notify(err.message); }
  };
  const deleteRows = async (ids) => {
    try {
      await api.post(`/notes/${note.id}/rows/delete`, { ids });
      setRows((list) => list.filter((r) => !ids.includes(r.id)));
      notify(t('Deleted. You can get it back from the Trash.'));
    } catch (err) { notify(err.message); }
  };

  const open = (kind, extra = {}) => (e) => { const anchor = e?.currentTarget; setPop((p) => (p?.kind === kind && p.anchor === anchor && !extra.prop ? null : { kind, anchor, ...extra })); };
  const closePop = useCallback(() => setPop(null), []);
  const nFilters = (view.filters || []).length; const nSorts = (view.sorts || []).length;
  const shared = { rows, props, view, people, canEdit, onRow: changeRow, onAddRow: addRow, onOpen, onAddProp: addProp };

  return (
    <div className={`db view-${view.type}`}>
      <div className="db-bar">
        <div className="db-tabs" role="tablist">
          {views.map((v) => (
            <button key={v.id} type="button" role="tab" aria-selected={v.id === view.id} className={`db-tab ${v.id === view.id ? 'on' : ''}`}
              onClick={(e) => (v.id === view.id ? open('view')(e) : chooseView(v.id))} title={v.id === view.id ? t('View settings') : undefined}>
              <span className="dbglyph">{VIEW_TYPES.find((x) => x.type === v.type)?.glyph}</span><span data-no-translate>{v.name}</span>
            </button>
          ))}
          {canEdit && views.length < 12 && <button type="button" className="db-tab add" onClick={open('addView')} aria-label="Add a view" title={t('Add a view')}><Icon name="plus" size={14} /></button>}
        </div>
        <div className="db-tools">
          <button type="button" className={`db-tool ${nFilters ? 'on' : ''}`} onClick={open('filter')}><Icon name="search" size={14} /> {t('Filter')}{nFilters ? ` ${nFilters}` : ''}</button>
          <button type="button" className={`db-tool ${nSorts ? 'on' : ''}`} onClick={open('sort')}>⇅ {t('Sort')}{nSorts ? ` ${nSorts}` : ''}</button>
          {searching || query ? (
            <input className="db-search" autoFocus value={query} onChange={(e) => setQuery(e.target.value)} onBlur={() => !query && setSearching(false)}
              onKeyDown={(e) => { if (e.key === 'Escape') { setQuery(''); setSearching(false); } }} placeholder={t('Search…')} aria-label="Search this database" />
          ) : <button type="button" className="db-tool" onClick={() => setSearching(true)} aria-label="Search this database"><Icon name="search" size={14} /></button>}
          <button type="button" className="db-tool" onClick={open('props')} aria-label="Properties" title={t('Properties shown in this view')}><Icon name="settings" size={14} /></button>
          {canEdit && <button type="button" className="btn primary sm db-newbtn" onClick={() => addRow()}><Icon name="plus" size={14} /> {t('New')}</button>}
        </div>
      </div>

      {data === null ? <div className="chat-loading"><span className="thinking"><i /><i /><i /></span></div> : (
        <>
          {view.type === 'table' && <TableView {...shared} onDelete={deleteRows} focusId={focusId}
            onPropMenu={(e, prop, patch) => (patch ? updateProp(prop.id, patch, true) : open('prop', { prop })(e))} onAddProp={open('addProp')}
            onWidths={(widths) => updateView({ widths })} />}
          {view.type === 'board' && <BoardView {...shared} />}
          {view.type === 'calendar' && <CalendarView {...shared} />}
          {view.type === 'gallery' && <GalleryView {...shared} />}
          <p className="db-count muted">
            {rows.length === data.rows.length ? (rows.length === 1 ? t('1 row') : t('{n} rows', { n: rows.length })) : t('{n} of {total} rows', { n: rows.length, total: data.rows.length })}
            {(nFilters > 0 || query) && <button type="button" className="linkish" onClick={() => { setQuery(''); setSearching(false); updateView({ filters: [] }); }}>{t('Show all')}</button>}
          </p>
        </>
      )}

      {pop?.kind === 'filter' && <Pop anchor={pop.anchor} onClose={closePop} width={460}><FilterPanel view={view} props={props} people={people} onChange={(filters) => updateView({ filters })} /></Pop>}
      {pop?.kind === 'sort' && <Pop anchor={pop.anchor} onClose={closePop} width={360}><SortPanel view={view} props={props} onChange={(sorts) => updateView({ sorts })} /></Pop>}
      {pop?.kind === 'props' && <Pop anchor={pop.anchor} onClose={closePop} width={260}><PropsPanel view={view} props={props} onChange={(hidden) => updateView({ hidden })} /></Pop>}
      {pop?.kind === 'addProp' && <Pop anchor={pop.anchor} onClose={closePop} width={220}><AddProp onAdd={addProp} /></Pop>}
      {pop?.kind === 'addView' && (
        <Pop anchor={pop.anchor} onClose={closePop} width={220}>
          <div className="dbmenu"><p className="dbpop-label">{t('New view')}</p>
            {VIEW_TYPES.map((v) => <button key={v.type} type="button" className="dbmenu-item" onClick={() => addView(v.type)}><span className="dbglyph">{v.glyph}</span> {t(v.label)}</button>)}</div>
        </Pop>
      )}
      {pop?.kind === 'view' && (
        <Pop anchor={pop.anchor} onClose={closePop} width={280}>
          <ViewPanel view={view} props={props} canDelete={canEdit && views.length > 1} onChange={updateView} onClose={closePop}
            onDuplicate={() => { const v = { ...JSON.parse(JSON.stringify(view)), id: rid(), name: `${view.name} 2`.slice(0, 40) }; saveDb({ props, views: [...views, v] }); chooseView(v.id); }}
            onDelete={() => { const rest = views.filter((v) => v.id !== view.id); saveDb({ props, views: rest }); chooseView(rest[0].id); }} />
        </Pop>
      )}
      {pop?.kind === 'prop' && pop.prop && (
        <Pop anchor={pop.anchor} onClose={closePop} width={280}>
          <PropMenu key={pop.prop.id} prop={pop.prop.id === 'title' ? TITLE : props.find((p) => p.id === pop.prop.id) || pop.prop} canEdit={canEdit} onClose={closePop}
            onUpdate={(patch) => { updateProp(pop.prop.id, patch); setPop((p) => p && { ...p, prop: { ...p.prop, ...patch } }); }}
            onDelete={() => deleteProp(pop.prop.id)} onSort={(dir) => updateView({ sorts: [{ prop: pop.prop.id, dir }] })}
            onFilter={() => { updateView({ filters: [...(view.filters || []), { prop: pop.prop.id, op: OPS[pop.prop.type]?.[0] || 'contains', value: pop.prop.type === 'checkbox' ? true : '' }] }); setTimeout(() => document.querySelector('.db-tool')?.click(), 0); }}
            onHide={() => updateView({ hidden: [...(view.hidden || []), pop.prop.id] })} />
        </Pop>
      )}
    </div>
  );
}

/** At the top of a row's page: its properties, editable (like Notion) */
export function RowProps({ note, canEdit, notify, onChange }) {
  const [dbInfo, setDbInfo] = useState(note.database);
  useEffect(() => { setDbInfo(note.database); }, [note.database]);
  const schemaSaved = useRef(Promise.resolve());
  const [people, setPeople] = useState([]);
  const [values, setValues] = useState(note.props || {});
  useEffect(() => { setValues(note.props || {}); }, [note.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { api.get(`/notes/${dbInfo.id}/people`).then(setPeople).catch(() => {}); }, [dbInfo.id]);
  const props = dbInfo.db?.props || [];
  if (!props.length) return null;
  const change = async (pid, v) => {
    const next = { ...values }; if (isEmpty(v)) delete next[pid]; else next[pid] = v;
    setValues(next); onChange?.(next);
    try { await schemaSaved.current; await api.patch(`/notes/${note.id}`, { props: { [pid]: v } }); } catch (err) { notify(err.message); }
  };
  // A new option typed in a row: saved in the database's properties first
  const newOptions = (pid, options) => {
    const db = { ...dbInfo.db, props: props.map((p) => (p.id === pid ? { ...p, options } : p)) };
    setDbInfo({ ...dbInfo, db });
    schemaSaved.current = api.patch(`/notes/${dbInfo.id}`, { db }).catch((err) => notify(err.message));
  };
  return (
    <div className="rowprops">
      {props.map((p) => (
        <div key={p.id} className="rowprop">
          <span className="rowprop-name"><span className="dbglyph">{glyph(p.type)}</span><span data-no-translate>{p.name}</span></span>
          <Cell prop={p} value={values[p.id]} people={people} canEdit={canEdit && !dbInfo.locked} onChange={(v) => change(p.id, v)}
            onOptions={(options) => newOptions(p.id, options)} />
        </div>
      ))}
    </div>
  );
}
