/**
 * Databases (like Notion's): a page whose rows are pages. The database page keeps `db`:
 *   props: [{ id, name, type, options? }]  (the "Name" column is the row's title, id 'title')
 *   views: [{ id, name, type: table|board|calendar|gallery, group?, date?, sorts, filters, hidden, widths }]
 * Each row is a Note with `inDb` (and `parent`) = the database, and `props` = { propId: value }.
 */
import mongoose from 'mongoose';
import { HttpError } from '../middleware/error.js';

export const PROP_TYPES = ['text', 'number', 'select', 'multi', 'status', 'date', 'checkbox', 'url', 'person'];
export const VIEW_TYPES = ['table', 'board', 'calendar', 'gallery'];
export const COLORS = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'];
const OPS = ['is', 'not', 'contains', 'empty', 'filled', 'before', 'after', 'on'];
export const MAX_ROWS = 2000;
const ID = /^[a-z0-9]{1,12}$/;
const str = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Checks and cleans the properties and views a browser sends */
export function cleanSchema(db) {
  if (!db || typeof db !== 'object') throw new HttpError(400, 'Invalid database');
  const seen = new Set(['title']);
  const props = (Array.isArray(db.props) ? db.props : []).slice(0, 40).map((p) => {
    if (!p || !ID.test(p.id) || seen.has(p.id) || !PROP_TYPES.includes(p.type)) throw new HttpError(400, 'Invalid database property');
    seen.add(p.id);
    const out = { id: p.id, name: str(p.name, 60) || 'Property', type: p.type };
    if (['select', 'multi', 'status'].includes(p.type)) {
      const ids = new Set();
      out.options = (Array.isArray(p.options) ? p.options : []).slice(0, 100)
        .filter((o) => o && ID.test(o.id) && !ids.has(o.id) && ids.add(o.id))
        .map((o) => ({ id: o.id, name: str(o.name, 60) || 'Option', color: COLORS.includes(o.color) ? o.color : 'gray' }));
    }
    if (p.type === 'number' && ['plain', 'percent', 'dollar', 'euro'].includes(p.format)) out.format = p.format;
    return out;
  });
  const known = (id) => seen.has(id);
  const viewIds = new Set();
  const views = (Array.isArray(db.views) ? db.views : []).slice(0, 12).filter((v) => v && ID.test(v.id) && !viewIds.has(v.id) && viewIds.add(v.id) && VIEW_TYPES.includes(v.type)).map((v) => {
    const out = { id: v.id, name: str(v.name, 40) || 'View', type: v.type };
    if (known(v.group)) out.group = v.group;
    if (known(v.date)) out.date = v.date;
    out.sorts = (Array.isArray(v.sorts) ? v.sorts : []).filter((s) => s && known(s.prop)).slice(0, 3).map((s) => ({ prop: s.prop, dir: s.dir === 'desc' ? 'desc' : 'asc' }));
    out.filters = (Array.isArray(v.filters) ? v.filters : []).filter((f) => f && known(f.prop) && OPS.includes(f.op)).slice(0, 10)
      .map((f) => ({ prop: f.prop, op: f.op, value: typeof f.value === 'boolean' || typeof f.value === 'number' ? f.value : str(f.value, 200) }));
    out.hidden = (Array.isArray(v.hidden) ? v.hidden : []).filter((id) => known(id) && id !== 'title').slice(0, 40);
    out.widths = {};
    if (v.widths && typeof v.widths === 'object') for (const [k, w] of Object.entries(v.widths)) if (known(k) && Number.isFinite(w)) out.widths[k] = Math.min(800, Math.max(60, Math.round(w)));
    if (Array.isArray(v.order)) out.order = v.order.filter(known).slice(0, 41);   // column order in tables
    return out;
  });
  if (!views.length) views.push({ id: 'v1', name: 'Table', type: 'table', sorts: [], filters: [], hidden: [], widths: {} });
  return { props, views };
}

/** Checks the values of one row against the database's properties. `null` clears a value. */
export function cleanValues(schema, values) {
  if (!values || typeof values !== 'object' || Array.isArray(values)) throw new HttpError(400, 'Invalid properties');
  const set = {}; const unset = [];
  for (const [id, raw] of Object.entries(values).slice(0, 50)) {
    const p = (schema?.props || []).find((x) => x.id === id);
    if (!p) continue;   // a property that was just deleted: ignore
    if (raw === null || raw === '' || (Array.isArray(raw) && !raw.length)) { unset.push(id); continue; }
    const opts = new Set((p.options || []).map((o) => o.id));
    let v;
    switch (p.type) {
      case 'text': v = str(raw, 2000); break;
      case 'number': v = Number(raw); if (!Number.isFinite(v)) throw new HttpError(400, `${p.name} must be a number`); break;
      case 'select': case 'status': v = opts.has(raw) ? raw : undefined; break;
      case 'multi': v = (Array.isArray(raw) ? raw : [raw]).filter((x) => opts.has(x)).slice(0, 30); v = [...new Set(v)]; break;
      case 'date': v = DATE.test(raw) ? raw : undefined; break;
      case 'checkbox': v = raw === true; break;
      case 'url': v = str(raw, 2000); if (!/^(https?:\/\/|mailto:)/i.test(v)) v = `https://${v}`; break;
      case 'person': v = [...new Set((Array.isArray(raw) ? raw : [raw]).filter((x) => mongoose.isValidObjectId(x)).map(String))].slice(0, 10); break;
      default: v = undefined;
    }
    if (v === undefined || v === false || (Array.isArray(v) && !v.length)) unset.push(id);
    else set[id] = v;
  }
  return { set, unset };
}

// ---------- Ready-made databases for students ----------
const opt = (id, name, color) => ({ id, name, color });
const view = (id, name, type, extra = {}) => ({ id, name, type, sorts: [], filters: [], hidden: [], widths: {}, ...extra });
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

export const DB_TEMPLATES = {
  blank: () => ({
    title: '', icon: '🗃️',
    db: {
      props: [
        { id: 'tags', name: 'Tags', type: 'multi', options: [] },
        { id: 'status', name: 'Status', type: 'status', options: [opt('todo', 'Not started', 'gray'), opt('doing', 'In progress', 'blue'), opt('done', 'Done', 'green')] },
        { id: 'date', name: 'Date', type: 'date' },
      ],
      views: [view('v1', 'Table', 'table'), view('v2', 'Board', 'board', { group: 'status' })],
    },
    rows: [{ title: '' }, { title: '' }, { title: '' }],
  }),
  assignments: () => ({
    title: 'Assignment tracker', icon: '📚',
    db: {
      props: [
        { id: 'status', name: 'Status', type: 'status', options: [opt('todo', 'Not started', 'gray'), opt('doing', 'In progress', 'blue'), opt('done', 'Done', 'green')] },
        { id: 'due', name: 'Due', type: 'date' },
        { id: 'course', name: 'Course', type: 'select', options: [opt('c1', 'CIS 641', 'blue'), opt('c2', 'CIS 678', 'orange'), opt('c3', 'STA 610', 'purple')] },
        { id: 'type', name: 'Type', type: 'select', options: [opt('hw', 'Homework', 'yellow'), opt('ex', 'Exam', 'red'), opt('pr', 'Project', 'green'), opt('rd', 'Reading', 'brown')] },
        { id: 'pri', name: 'Priority', type: 'select', options: [opt('hi', 'High', 'red'), opt('md', 'Medium', 'yellow'), opt('lo', 'Low', 'gray')] },
        { id: 'grade', name: 'Grade', type: 'number', format: 'percent' },
      ],
      views: [
        view('v1', 'All assignments', 'table', { sorts: [{ prop: 'due', dir: 'asc' }] }),
        view('v2', 'By status', 'board', { group: 'status' }),
        view('v3', 'Calendar', 'calendar', { date: 'due' }),
      ],
    },
    rows: [
      { title: 'Use case diagram', props: { status: 'doing', due: day(3), course: 'c1', type: 'pr', pri: 'hi' } },
      { title: 'Problem set 4', props: { status: 'todo', due: day(6), course: 'c3', type: 'hw', pri: 'md' } },
      { title: 'Midterm', props: { status: 'todo', due: day(12), course: 'c2', type: 'ex', pri: 'hi' } },
      { title: 'Read chapter 7', props: { status: 'done', due: day(-2), course: 'c2', type: 'rd', pri: 'lo' } },
    ],
  }),
  reading: () => ({
    title: 'Reading list', icon: '📖',
    db: {
      props: [
        { id: 'status', name: 'Status', type: 'status', options: [opt('todo', 'To read', 'gray'), opt('doing', 'Reading', 'blue'), opt('done', 'Read', 'green')] },
        { id: 'author', name: 'Author', type: 'text' },
        { id: 'kind', name: 'Type', type: 'select', options: [opt('pa', 'Paper', 'purple'), opt('bk', 'Book', 'brown'), opt('ar', 'Article', 'blue')] },
        { id: 'tags', name: 'Topics', type: 'multi', options: [] },
        { id: 'link', name: 'Link', type: 'url' },
        { id: 'stars', name: 'Rating', type: 'select', options: [opt('s5', '★★★★★', 'yellow'), opt('s4', '★★★★', 'yellow'), opt('s3', '★★★', 'yellow')] },
      ],
      views: [view('v1', 'All', 'table'), view('v2', 'Gallery', 'gallery'), view('v3', 'By status', 'board', { group: 'status' })],
    },
    rows: [{ title: 'Attention Is All You Need', props: { status: 'done', author: 'Vaswani et al.', kind: 'pa' } }, { title: '', props: { status: 'todo' } }],
  }),
  exams: () => ({
    title: 'Exam prep', icon: '🎯',
    db: {
      props: [
        { id: 'conf', name: 'Confidence', type: 'select', options: [opt('lo', 'Shaky', 'red'), opt('md', 'Okay', 'yellow'), opt('hi', 'Solid', 'green')] },
        { id: 'exam', name: 'Exam', type: 'select', options: [] },
        { id: 'review', name: 'Review on', type: 'date' },
        { id: 'done', name: 'Reviewed', type: 'checkbox' },
      ],
      views: [view('v1', 'Topics', 'table'), view('v2', 'By confidence', 'board', { group: 'conf' }), view('v3', 'Review plan', 'calendar', { date: 'review' })],
    },
    rows: [{ title: 'Topic 1', props: { conf: 'lo', review: day(1) } }, { title: 'Topic 2', props: { conf: 'md', review: day(2) } }],
  }),
};
