/**
 * Extra Notes blocks, like Notion's: callout, equation (block and inline), table of contents,
 * embed, web bookmark and columns. Each one also has an HTML form (toExternalHTML), so copying,
 * Markdown export and the Notes AI keep their content.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createReactBlockSpec, createReactInlineContentSpec } from '@blocknote/react';
import { defaultProps, insertOrUpdateBlockForSlashMenu } from '@blocknote/core';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { api } from '../lib/api.js';
import { t } from '../lib/i18n.jsx';
import { Icon } from '../icons.jsx';
import EmojiPicker from './EmojiPicker.jsx';

/** After finishing a block that has no text of its own (equation, link...), put the cursor on the line under it */
function cursorAfter(editor, block) {
  try {
    let next = editor.getNextBlock(block);
    if (!next) { editor.insertBlocks([{ type: 'paragraph' }], block, 'after'); next = editor.getNextBlock(block); }
    if (next) { editor.setTextCursorPosition(next, 'start'); editor.focus(); }
  } catch { /* the block was removed meanwhile */ }
}

const tex = (latex, display) => {
  try { return { html: katex.renderToString(latex || '', { displayMode: display, throwOnError: true, strict: 'ignore', trust: false }) }; } catch (err) { return { error: err.message.replace(/^KaTeX parse error: /, '') }; }
};

// ---------- Callout ----------
function Callout({ block, editor, contentRef }) {
  const [pick, setPick] = useState(false);
  return (
    <div className="nb-callout" data-tone={block.props.backgroundColor === 'default' ? 'gray' : block.props.backgroundColor}>
      <span className="pop-wrap nb-callout-icon" contentEditable={false}>
        <button type="button" onClick={() => editor.isEditable && setPick((v) => !v)} aria-label="Change the callout icon">{block.props.emoji}</button>
        {pick && <EmojiPicker onPick={(e) => { editor.updateBlock(block, { props: { emoji: e } }); setPick(false); }} onClose={() => setPick(false)} />}
      </span>
      <div className="nb-callout-text" ref={contentRef} />
    </div>
  );
}
export const calloutSpec = createReactBlockSpec(
  { type: 'callout', propSchema: { ...defaultProps, emoji: { default: '💡' } }, content: 'inline' },
  {
    render: Callout,
    toExternalHTML: ({ block, contentRef }) => <blockquote><span>{block.props.emoji} </span><span ref={contentRef} /></blockquote>,
  },
);

// ---------- Equation (a block of its own) ----------
function MathBlock({ block, editor }) {
  const [editing, setEditing] = useState(!block.props.latex);
  const [value, setValue] = useState(block.props.latex);
  const area = useRef(null);
  useEffect(() => setValue(block.props.latex), [block.props.latex]);
  useEffect(() => { if (editing) area.current?.focus(); }, [editing]);
  const shown = useMemo(() => tex(value || '\\text{Empty equation}', true), [value]);
  const save = () => { editor.updateBlock(block, { props: { latex: value.trim() } }); setEditing(false); cursorAfter(editor, block); };
  return (
    <div className={`nb-math ${editing ? 'editing' : ''}`} contentEditable={false}>
      <div className="nb-math-view" role="button" tabIndex={0} onClick={() => editor.isEditable && setEditing(true)} onKeyDown={(e) => { if (e.key === 'Enter' && editor.isEditable) setEditing(true); }}
        title={editor.isEditable ? t('Click to edit the equation') : undefined}>
        {shown.error ? <span className="nb-math-error">{shown.error}</span> : <span dangerouslySetInnerHTML={{ __html: shown.html }} />}
      </div>
      {editing && (
        <div className="nb-math-edit">
          <textarea ref={area} value={value} rows={Math.min(6, Math.max(2, value.split('\n').length))} spellCheck={false} placeholder={"E = mc^2   \\frac{a}{b}   \\sum_{i=1}^{n} x_i"}
            onChange={(e) => setValue(e.target.value)} aria-label="LaTeX"
            onKeyDown={(e) => { if ((e.key === 'Enter' && (e.ctrlKey || e.metaKey)) || e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); save(); } }} />
          <div className="nb-math-bar">
            <span className="muted">{t('LaTeX. Ctrl+Enter to finish.')} <a href="https://katex.org/docs/supported.html" target="_blank" rel="noopener noreferrer">{t('What can I type?')}</a></span>
            <button type="button" className="nl-btn primary" onClick={save}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
}
export const mathSpec = createReactBlockSpec(
  { type: 'math', propSchema: { latex: { default: '' } }, content: 'none' },
  { render: MathBlock, toExternalHTML: ({ block }) => <p>{`$$${block.props.latex}$$`}</p> },
);

// ---------- Equation inside a line of text ----------
function MathInline({ inlineContent, updateInlineContent, editor }) {
  const [open, setOpen] = useState(!inlineContent.props.latex);
  const [value, setValue] = useState(inlineContent.props.latex);
  const shown = useMemo(() => tex(inlineContent.props.latex || '?', false), [inlineContent.props.latex]);
  const save = () => { updateInlineContent({ type: 'inlineMath', props: { latex: value.trim() || 'x' } }); setOpen(false); };
  return (
    <span className="nb-imath pop-wrap" contentEditable={false}>
      <span className="nb-imath-view" onClick={() => editor.isEditable && setOpen(true)} role="button" tabIndex={-1}>
        {shown.error ? <span className="nb-math-error">{inlineContent.props.latex}</span> : <span dangerouslySetInnerHTML={{ __html: shown.html }} />}
      </span>
      {open && (
        <span className="nb-imath-pop">
          <input value={value} autoFocus spellCheck={false} placeholder="x^2 + y^2" aria-label="LaTeX" onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); save(); } }} onBlur={save} />
        </span>
      )}
    </span>
  );
}
export const inlineMathSpec = createReactInlineContentSpec(
  { type: 'inlineMath', propSchema: { latex: { default: '' } }, content: 'none' },
  { render: MathInline, toExternalHTML: ({ inlineContent }) => <span>{`$${inlineContent.props.latex}$`}</span> },
);

// ---------- Table of contents ----------
function Toc({ editor }) {
  const [heads, setHeads] = useState([]);
  useEffect(() => {
    const read = () => {
      const out = [];
      const walk = (list) => list.forEach((b) => {
        if (b.type === 'heading' && b.props.level <= 3) {
          const text = (b.content || []).map((c) => c.text || (c.content || []).map((x) => x.text || '').join('')).join('').trim();
          if (text) out.push({ id: b.id, level: b.props.level, text });
        }
        if (b.children?.length) walk(b.children);
      });
      walk(editor.document);
      setHeads(out);
    };
    read();
    return editor.onChange(read);
  }, [editor]);
  const go = (id) => document.querySelector(`.bn-block-outer[data-id="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return (
    <nav className="nb-toc" contentEditable={false} aria-label="Table of contents">
      {heads.length ? heads.map((h) => (
        <button key={h.id} type="button" className={`nb-toc-${h.level}`} onClick={() => go(h.id)}>{h.text}</button>
      )) : <p className="muted">{t('Add headings to this page and they appear here.')}</p>}
    </nav>
  );
}
export const tocSpec = createReactBlockSpec(
  { type: 'toc', propSchema: {}, content: 'none' },
  { render: Toc, toExternalHTML: () => <p /> },
);

// ---------- Embed (YouTube, Google Drive, Docs, Figma, PDF ...) ----------
export function embedUrl(raw) {
  let u;
  try { u = new URL(String(raw).trim()); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  const h = u.hostname.replace(/^www\.|^m\./, '');
  const id = (re) => (u.href.match(re) || [])[1];
  if (h === 'youtube.com' || h === 'youtu.be' || h === 'youtube-nocookie.com') {
    const v = h === 'youtu.be' ? u.pathname.slice(1) : u.searchParams.get('v') || id(/\/(?:embed|shorts|live)\/([\w-]{6,})/);
    return v ? { src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(v)}`, ratio: '16/9', name: 'YouTube' } : null;
  }
  if (h === 'vimeo.com') { const v = id(/vimeo\.com\/(\d+)/); return v ? { src: `https://player.vimeo.com/video/${v}`, ratio: '16/9', name: 'Vimeo' } : null; }
  if (h === 'loom.com') { const v = id(/\/share\/([\w-]+)/); return v ? { src: `https://www.loom.com/embed/${v}`, ratio: '16/9', name: 'Loom' } : null; }
  if (h === 'drive.google.com') { const v = id(/\/file\/d\/([\w-]+)/) || u.searchParams.get('id'); return v ? { src: `https://drive.google.com/file/d/${v}/preview`, ratio: '4/3', name: 'Google Drive' } : null; }
  if (h === 'docs.google.com') {
    const m = u.pathname.match(/^\/(document|spreadsheets|presentation|forms)\/d\/([\w-]+)/);
    if (!m) return null;
    const tail = m[1] === 'presentation' ? 'embed' : m[1] === 'forms' ? 'viewform?embedded=true' : 'preview';
    return { src: `https://docs.google.com/${m[1]}/d/${m[2]}/${tail}`, ratio: m[1] === 'presentation' ? '16/9' : '4/3', name: 'Google' };
  }
  if (h === 'figma.com') return { src: `https://www.figma.com/embed?embed_host=studypilot&url=${encodeURIComponent(u.href)}`, ratio: '16/10', name: 'Figma' };
  if (h === 'open.spotify.com') return { src: `https://open.spotify.com/embed${u.pathname}`, ratio: null, height: 152, name: 'Spotify' };
  if (h === 'codepen.io') { const m = u.pathname.match(/^\/([\w-]+)\/pen\/([\w-]+)/); return m ? { src: `https://codepen.io/${m[1]}/embed/${m[2]}?default-tab=result`, ratio: '16/10', name: 'CodePen' } : null; }
  if (h === 'desmos.com' && u.pathname.startsWith('/calculator')) return { src: `https://www.desmos.com/calculator${u.pathname.replace('/calculator', '')}?embed`, ratio: '16/10', name: 'Desmos' };
  if (/\.pdf$/i.test(u.pathname)) return { src: u.href, ratio: '3/4', name: 'PDF' };
  return { src: u.href, ratio: '16/10', name: h, generic: true };
}

function UrlForm({ placeholder, hint, onSubmit }) {
  const [v, setV] = useState('');
  return (
    <form className="nb-urlform" onSubmit={(e) => { e.preventDefault(); if (v.trim()) onSubmit(v.trim()); }} onKeyDown={(e) => e.stopPropagation()}>
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} aria-label="Link" spellCheck={false} />
      <button type="submit" className="nl-btn primary">{t('Add')}</button>
      <span className="muted">{hint}</span>
    </form>
  );
}

function Embed({ block, editor }) {
  const info = block.props.url ? embedUrl(block.props.url) : null;
  if (!block.props.url || !info) {
    return (
      <div className="nb-embed empty" contentEditable={false}>
        {editor.isEditable ? <UrlForm placeholder={t('Paste a YouTube, Google Drive / Docs / Slides, Figma, Loom, Desmos or PDF link…')} hint={block.props.url && !info ? t('That link cannot be embedded. Use https://') : ''}
          onSubmit={(url) => { editor.updateBlock(block, { props: { url } }); cursorAfter(editor, block); }} /> : <p className="muted">{t('Empty embed')}</p>}
      </div>
    );
  }
  return (
    <div className="nb-embed" contentEditable={false}>
      <div className="nb-embed-frame" style={info.ratio ? { aspectRatio: info.ratio } : { height: info.height }}>
        <iframe src={info.src} title={info.name} loading="lazy" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-popups allow-presentation allow-forms" allow="fullscreen; picture-in-picture; encrypted-media; clipboard-write" />
      </div>
      <div className="nb-embed-bar">
        <a href={block.props.url} target="_blank" rel="noopener noreferrer"><Icon name="external" size={12} /> {info.name}</a>
        {info.generic && <span className="muted">{t('If it stays blank, the site does not allow embedding: open it instead.')}</span>}
        {editor.isEditable && <button type="button" onClick={() => editor.updateBlock(block, { props: { url: '' } })}>{t('Change link')}</button>}
      </div>
    </div>
  );
}
export const embedSpec = createReactBlockSpec(
  { type: 'embed', propSchema: { url: { default: '' } }, content: 'none' },
  { render: Embed, toExternalHTML: ({ block }) => <p><a href={block.props.url}>{block.props.url}</a></p> },
);

// ---------- Web bookmark (a card with the page's title, description and picture) ----------
function Bookmark({ block, editor }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const p = block.props;
  const load = async (url) => {
    setBusy(true); setError('');
    try {
      const d = await api.get(`/links/preview?url=${encodeURIComponent(url)}`);
      editor.updateBlock(block, { props: { url: d.url, title: d.title || '', description: d.description || '', image: d.image || '', site: d.site || '' } });
      cursorAfter(editor, block);
    } catch (err) {
      editor.updateBlock(block, { props: { url, title: url, site: (() => { try { return new URL(url).hostname; } catch { return ''; } })() } });
      setError(err.message);
    } finally { setBusy(false); }
  };
  if (!p.url) {
    return (
      <div className="nb-bookmark empty" contentEditable={false}>
        {busy ? <span className="thinking"><i /><i /><i /></span>
          : editor.isEditable ? <UrlForm placeholder={t('Paste a link to make a bookmark…')} hint={error} onSubmit={(url) => load(/^https?:\/\//i.test(url) ? url : `https://${url}`)} />
            : <p className="muted">{t('Empty bookmark')}</p>}
      </div>
    );
  }
  return (
    <a className="nb-bookmark" href={p.url} target="_blank" rel="noopener noreferrer" contentEditable={false}>
      <span className="nb-bm-text">
        <b>{p.title || p.url}</b>
        {p.description && <span className="nb-bm-desc">{p.description}</span>}
        <span className="nb-bm-site"><Icon name="globe" size={12} /> {p.site || p.url}</span>
      </span>
      {p.image && <img src={p.image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
    </a>
  );
}
export const bookmarkSpec = createReactBlockSpec(
  { type: 'bookmark', propSchema: { url: { default: '' }, title: { default: '' }, description: { default: '' }, image: { default: '' }, site: { default: '' } }, content: 'none' },
  { render: Bookmark, toExternalHTML: ({ block }) => <p><a href={block.props.url}>{block.props.title || block.props.url}</a></p> },
);

// ---------- Columns (2 or 3 side by side; each column is simple text with line breaks) ----------
const parseCols = (s, n) => { let a; try { a = JSON.parse(s); } catch { a = []; } return Array.from({ length: n }, (_, i) => (typeof a[i] === 'string' ? a[i] : '')); };
function Columns({ block, editor }) {
  const n = Math.min(3, Math.max(2, Number(block.props.count) || 2));
  const [cols, setCols] = useState(() => parseCols(block.props.cols, n));
  const timer = useRef(null);
  useEffect(() => { if (!timer.current) setCols(parseCols(block.props.cols, n)); }, [block.props.cols, n]);
  const change = (i, v) => {
    const next = cols.map((c, k) => (k === i ? v : c));
    setCols(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; editor.updateBlock(block, { props: { cols: JSON.stringify(next) } }); }, 400);
  };
  return (
    <div className="nb-cols" style={{ '--n': n }} contentEditable={false}>
      {cols.map((c, i) => (
        <textarea key={i} className="nb-col" value={c} readOnly={!editor.isEditable} placeholder={editor.isEditable ? t('Column {n}', { n: i + 1 }) : ''}
          onChange={(e) => change(i, e.target.value)} onKeyDown={(e) => e.stopPropagation()} aria-label={t('Column {n}', { n: i + 1 })}
          rows={Math.max(3, c.split('\n').length + 1)} />
      ))}
    </div>
  );
}
export const columnsSpec = createReactBlockSpec(
  { type: 'columns', propSchema: { count: { default: 2 }, cols: { default: '[]' } }, content: 'none' },
  { render: Columns, toExternalHTML: ({ block }) => <div>{parseCols(block.props.cols, Number(block.props.count) || 2).map((c, i) => <p key={i}>{c}</p>)}</div> },
);

/** The new blocks in the "/" menu */
export function extraSlashItems(editor) {
  const insert = (block) => () => insertOrUpdateBlockForSlashMenu(editor, block);
  return [
    { key: 'callout', title: 'Callout', subtext: 'Make a note stand out', aliases: ['callout', 'note', 'tip', 'info', 'box', 'warning'], group: 'Basic blocks', icon: <span className="slash-emoji">💡</span>, onItemClick: insert({ type: 'callout' }) },
    { key: 'math', title: 'Equation', subtext: 'A math formula (LaTeX)', aliases: ['math', 'equation', 'latex', 'formula', 'tex', 'katex'], group: 'Advanced', icon: <span className="slash-emoji">∑</span>, onItemClick: insert({ type: 'math' }) },
    { key: 'imath', title: 'Inline equation', subtext: 'A formula inside the text', aliases: ['inline math', 'inline equation', 'math', 'latex'], group: 'Advanced', icon: <span className="slash-emoji">𝑥²</span>,
      onItemClick: () => editor.insertInlineContent([{ type: 'inlineMath', props: { latex: '' } }, ' ']) },
    { key: 'toc', title: 'Table of contents', subtext: 'Links to every heading', aliases: ['toc', 'contents', 'outline', 'table of contents'], group: 'Advanced', icon: <span className="slash-emoji">📑</span>, onItemClick: insert({ type: 'toc' }) },
    { key: 'cols2', title: '2 columns', subtext: 'Text side by side', aliases: ['columns', 'column', 'side by side', 'split'], group: 'Advanced', icon: <span className="slash-emoji">◫</span>, onItemClick: insert({ type: 'columns', props: { count: 2 } }) },
    { key: 'cols3', title: '3 columns', subtext: 'Three columns of text', aliases: ['columns', 'column', 'three'], group: 'Advanced', icon: <span className="slash-emoji">▥</span>, onItemClick: insert({ type: 'columns', props: { count: 3 } }) },
    { key: 'embed', title: 'Embed', subtext: 'YouTube, Google Docs, Figma, PDF…', aliases: ['embed', 'youtube', 'drive', 'google docs', 'slides', 'figma', 'iframe', 'loom', 'pdf', 'desmos'], group: 'Media', icon: <span className="slash-emoji">🎬</span>, onItemClick: insert({ type: 'embed' }) },
    { key: 'bookmark', title: 'Web bookmark', subtext: 'A link as a card with a preview', aliases: ['bookmark', 'link', 'url', 'preview', 'web'], group: 'Media', icon: <span className="slash-emoji">🔖</span>, onItemClick: insert({ type: 'bookmark' }) },
  ];
}
