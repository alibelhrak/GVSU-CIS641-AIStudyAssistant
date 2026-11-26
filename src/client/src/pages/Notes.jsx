import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import { BlockNoteSchema, createCodeBlockSpec, defaultBlockSpecs, filterSuggestionItems } from '@blocknote/core';
import { SyntaxHighlightingExtension } from '@blocknote/core/extensions';
import { codeBlockOptions } from '@blocknote/code-block';
import { CODE_THEMES, codeThemeInfo, highlighterFor } from '../lib/shiki.js';
import { en, fr, es, ar, zh } from '@blocknote/core/locales';
import { getLang, locale, t } from '../lib/i18n.jsx';
import {
  useCreateBlockNote, SuggestionMenuController, getDefaultReactSlashMenuItems,
  FormattingToolbarController, FormattingToolbar, getFormattingToolbarItems, useComponentsContext,
} from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import '@blocknote/mantine/style.css';
import { api, getToken } from '../lib/api.js';
import { canRun, runCode } from '../lib/runCode.js';
import { codeGhostExtension, handleCodeKey, hideGhost, showGhost, suggestionRequest } from '../lib/codeEditing.js';
import { useData } from '../lib/store.jsx';
import { useTheme } from '../lib/theme.jsx';
import { useResizable } from '../lib/resize.jsx';
import { Icon } from '../icons.jsx';
import { NoteAI, WRITE_ACTIONS, aiContext } from './NoteAI.jsx';
import { NotesChat } from './NotesChat.jsx';
import '../notes.css';

/*
 * Notes: Notion-style pages.
 * The editor (BlockNote) gives "/" commands, headings, lists, to-dos, quotes, code, tables, pictures,
 * drag handles and a formatting toolbar. Pages can hold sub-pages, have an emoji and a course tag,
 * and save by themselves while you type.
 * AI works inside the page too (see NoteAI.jsx): select text, type /ai, or press Ctrl+J.
 * "Ask AI" opens a chat panel next to the page that can read and edit it (see NotesChat.jsx).
 */

const EMOJIS = ['📘', '📗', '📕', '📙', '📓', '📒', '📝', '📄', '📚', '🧠', '💡', '🎯', '✅', '⭐', '🔥', '📌',
  '🧪', '🧮', '📊', '📈', '🧬', '🔬', '📐', '💻', '🤖', '⚙️', '🌍', '🗣️', '🎨', '🎵', '🗓️', '❓'];

const TEMPLATES = [
  { id: 'blank', icon: '📄', title: '', label: 'Empty page', text: 'Start from nothing', blocks: [] },
  {
    id: 'lecture', icon: '📘', title: 'Lecture notes', label: 'Lecture notes', text: 'Key ideas, examples and questions',
    blocks: [
      { type: 'paragraph', content: 'Course · Date · Lecture topic' },
      { type: 'heading', props: { level: 2 }, content: 'Key ideas' },
      { type: 'bulletListItem', content: '' },
      { type: 'heading', props: { level: 2 }, content: 'Examples' },
      { type: 'bulletListItem', content: '' },
      { type: 'heading', props: { level: 2 }, content: 'Questions to ask' },
      { type: 'bulletListItem', content: '' },
      { type: 'heading', props: { level: 2 }, content: 'Review before the exam' },
      { type: 'checkListItem', props: { checked: false }, content: '' },
    ],
  },
  {
    id: 'guide', icon: '🧠', title: 'Study guide', label: 'Study guide', text: 'Topics, definitions and practice',
    blocks: [
      { type: 'heading', props: { level: 2 }, content: 'Topics' },
      { type: 'numberedListItem', content: '' },
      { type: 'heading', props: { level: 2 }, content: 'Definitions and formulas' },
      { type: 'table', content: { type: 'tableContent', rows: [{ cells: ['Term', 'Meaning'] }, { cells: ['', ''] }, { cells: ['', ''] }] } },
      { type: 'heading', props: { level: 2 }, content: 'Practice questions' },
      { type: 'numberedListItem', content: '' },
      { type: 'heading', props: { level: 2 }, content: 'Still to review' },
      { type: 'checkListItem', props: { checked: false }, content: '' },
    ],
  },
  {
    id: 'project', icon: '🎯', title: 'Assignment plan', label: 'Assignment plan', text: 'Steps, deadlines and links',
    blocks: [
      { type: 'paragraph', content: 'Due date: ' },
      { type: 'heading', props: { level: 2 }, content: 'Goal' },
      { type: 'paragraph', content: '' },
      { type: 'heading', props: { level: 2 }, content: 'Steps' },
      { type: 'checkListItem', props: { checked: false }, content: 'Read the instructions' },
      { type: 'checkListItem', props: { checked: false }, content: 'First draft' },
      { type: 'checkListItem', props: { checked: false }, content: 'Review and submit' },
      { type: 'heading', props: { level: 2 }, content: 'Links and resources' },
      { type: 'bulletListItem', content: '' },
    ],
  },
];

/** Page covers: gradients (some move slowly) */
const COVERS = {
  aurora: { label: 'Aurora', bg: 'linear-gradient(120deg,#84fab0,#8fd3f4,#a6c1ee,#fbc2eb,#84fab0)', moving: true },
  sunset: { label: 'Sunset', bg: 'linear-gradient(120deg,#f6d365,#fda085,#f093fb,#f6d365)', moving: true },
  ocean: { label: 'Ocean', bg: 'linear-gradient(135deg,#2193b0,#6dd5ed)' },
  laker: { label: 'Laker blue', bg: 'linear-gradient(135deg,#0032a0,#00a3e0)' },
  grape: { label: 'Grape', bg: 'linear-gradient(135deg,#a18cd1,#fbc2eb)' },
  mint: { label: 'Mint', bg: 'linear-gradient(135deg,#d4fc79,#96e6a1)' },
  peach: { label: 'Peach', bg: 'linear-gradient(135deg,#ffecd2,#fcb69f)' },
  forest: { label: 'Forest', bg: 'linear-gradient(135deg,#134e5e,#71b280)' },
  night: { label: 'Night sky', bg: 'radial-gradient(circle at 20% 30%,rgba(255,255,255,.35) 0 1px,transparent 2px),radial-gradient(circle at 70% 60%,rgba(255,255,255,.25) 0 1px,transparent 2px),linear-gradient(135deg,#0f2027,#203a43,#2c5364)' },
  paper: { label: 'Paper', bg: 'radial-gradient(rgba(120,100,70,.18) 1px,transparent 1.5px) 0 0/14px 14px,linear-gradient(#f4efe4,#efe7d6)' },
  rose: { label: 'Rose', bg: 'linear-gradient(135deg,#ee9ca7,#ffdde1)' },
  graphite: { label: 'Graphite', bg: 'linear-gradient(135deg,#232526,#414345)' },
};


const wide = () => typeof window !== 'undefined' && window.innerWidth > 900;
const titleOf = (n) => n?.title?.trim() || 'Untitled';
const ago = (d) => {
  const s = (Date.now() - new Date(d)) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(d).toLocaleDateString(locale(), { month: 'short', day: 'numeric' });
};

/** Pictures dropped into a note are made smaller and kept inside the note */
async function uploadFile(file) {
  if (!file.type.startsWith('image/')) throw new Error('Only pictures can be added to notes. Put other files in Materials.');
  if (file.size > 15 * 1048576) throw new Error('That picture is larger than 15 MB');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.85);
}

/** Editor colors follow the app's theme */
const EDITOR_THEME = {
  colors: {
    editor: { text: 'var(--fg)', background: 'var(--bg)' },
    menu: { text: 'var(--fg)', background: 'var(--surface)' },
    tooltip: { text: 'var(--bg)', background: 'var(--fg)' },
    hovered: { text: 'var(--fg)', background: 'var(--hover)' },
    selected: { text: 'var(--accent-ink)', background: 'var(--accent)' },
    disabled: { text: 'var(--faint)', background: 'var(--surface-2)' },
    shadow: 'var(--line)',
    border: 'var(--line)',
    sideMenu: 'var(--faint)',
  },
  borderRadius: 8,
  fontFamily: 'var(--font)',
};

const AiLogo = () => <img src="/logo.png" alt="" width={18} height={18} style={{ display: 'block' }} />;

/* ---------- The "/" menu: Notion-style, with AI first ---------- */
const BASIC = ['paragraph', 'heading', 'heading_2', 'heading_3', 'bullet_list', 'numbered_list', 'check_list', 'toggle_list', 'quote', 'divider', 'code_block'];
const MEDIA = ['image', 'video', 'audio', 'file'];
const GROUPS = ['AI', 'Basic blocks', 'Media', 'More'];
const HINT = { heading: '#', heading_2: '##', heading_3: '###', heading_4: '####', bullet_list: '-', numbered_list: '1.', check_list: '[]',
  toggle_list: '>', quote: '"', code_block: '```', divider: '---', emoji: ':' };
const MORE_ALIASES = { paragraph: ['text', 'plain'], check_list: ['todo', 'to-do', 'task', 'checkbox'], bullet_list: ['bulleted', 'bullet'],
  numbered_list: ['numbered', 'ordered'], code_block: ['code', 'snippet'], divider: ['line', 'hr', 'separator'], image: ['picture', 'photo'], table: ['grid'] };
const RENAME = { paragraph: 'Text', bullet_list: 'Bulleted list', numbered_list: 'Numbered list', check_list: 'To-do list', toggle_list: 'Toggle list',
  code_block: 'Code', divider: 'Divider', toggle_heading: 'Toggle heading 1', toggle_heading_2: 'Toggle heading 2', toggle_heading_3: 'Toggle heading 3' };

const slashQuery = { text: '' };                     // what was typed after "/", shown at the top of the menu

function slashItems(editor, onAi) {
  const blocks = getDefaultReactSlashMenuItems(editor)
    .filter((i) => !['heading_5', 'heading_6'].includes(i.key))
    .map((i) => ({
      ...i, badge: undefined, title: (englishEditor && RENAME[i.key]) || i.title, hint: HINT[i.key], aliases: [...(i.aliases || []), i.title, ...(MORE_ALIASES[i.key] || [])],
      group: BASIC.includes(i.key) ? 'Basic blocks' : MEDIA.includes(i.key) ? 'Media' : 'More',
    }))
    .sort((a, b) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group) || (BASIC.indexOf(a.key) - BASIC.indexOf(b.key)));
  return [
    { title: 'Ask AI', subtext: 'Write, edit or explain anything', aliases: ['ai', 'write', 'generate', 'gpt'], group: 'AI', icon: <AiLogo />,
      hint: 'Ctrl J', ai: true, onItemClick: () => onAi({}) },
    ...WRITE_ACTIONS.slice(0, 5).map((a) => ({
      title: a.label, aliases: ['ai', a.id], group: 'AI', ai: true, icon: <span className="slash-emoji">{a.icon}</span>,
      onItemClick: () => onAi({ start: { action: a.id } }),
    })),
    ...blocks,
  ];
}

function SlashMenu({ items, selectedIndex, onItemClick, loadingState }) {
  const listRef = useRef(null);
  const [hover, setHover] = useState(null);
  const [mark, setMark] = useState(null);           // where the sliding highlight sits
  const shown = hover ?? selectedIndex;
  useEffect(() => setHover(null), [selectedIndex]);
  useLayoutEffect(() => {
    const el = listRef.current?.querySelector(`[data-i="${shown}"]`);
    if (!el) { setMark(null); return; }
    setMark({ top: el.offsetTop, height: el.offsetHeight });
    if (hover == null) el.scrollIntoView({ block: 'nearest' });
  }, [shown, items]); // eslint-disable-line react-hooks/exhaustive-deps

  let group = null;
  return (
    <div className="slash-menu" role="listbox" aria-label="Insert a block" onMouseDown={(e) => e.preventDefault()}>
      <div className="slash-search">
        <Icon name="search" size={14} />
        {slashQuery.text ? <span>Results for <b>{slashQuery.text}</b></span> : <span>Type to search blocks and AI…</span>}
      </div>
      <div className="slash-list" ref={listRef} onMouseLeave={() => setHover(null)}>
        {mark && <span className="slash-mark" style={{ transform: `translateY(${mark.top}px)`, height: mark.height }} />}
        {!items.length && <p className="slash-empty">{loadingState === 'loaded' ? 'No results' : 'Searching…'}</p>}
        {items.map((it, i) => {
          const head = it.group !== group;
          group = it.group;
          return (
            <Fragment key={`${it.group}-${it.title}`}>
              {head && <p className="slash-group">{it.group === 'AI' ? <>✦ AI</> : it.group}</p>}
              <button type="button" data-i={i} role="option" aria-selected={i === selectedIndex}
                className={`slash-item ${i === shown ? 'active' : ''} ${it.ai ? 'ai' : ''}`}
                onMouseEnter={() => setHover(i)} onClick={() => onItemClick?.(it)}>
                <span className="slash-icon">{it.icon}</span>
                <span className="slash-title">{it.title}{it.subtext && i === shown && <small>{it.subtext}</small>}</span>
                {it.hint && <kbd>{it.hint}</kbd>}
              </button>
            </Fragment>
          );
        })}
      </div>
      <div className="slash-foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>↵</kbd> insert</span><span><kbd>esc</kbd> close</span></div>
    </div>
  );
}

/** "Ask AI" button at the start of the toolbar that shows over selected text */
function AiToolbarButton({ onAi }) {
  const Components = useComponentsContext();
  return (
    <Components.FormattingToolbar.Button className="bn-ai-button" mainTooltip="Edit or explain with AI (Ctrl+J)"
      icon={<AiLogo />} label="Ask AI" onClick={() => onAi()}>
      <AiLogo /><span>Ask AI</span>
    </Components.FormattingToolbar.Button>
  );
}

/** The editor's own menus come in the app's language (Hindi uses English menus, translated by the app) */
const EDITOR_LOCALES = { en, fr, es, ar, zh };
const base = EDITOR_LOCALES[getLang()] || en;
const DICTIONARY = {
  ...base,
  placeholders: { ...base.placeholders, default: t("Write something, or press '/' for commands and Ctrl+J for AI…"),
    ...(base === en ? { heading: 'Heading', bulletListItem: 'List', numberedListItem: 'List', checkListItem: 'To-do' } : {}) },
};
const englishEditor = base === en;

/** Code blocks like Notion: a language picker and syntax highlighting for about 45 languages */
// "output" holds what a Run printed (not in the language menu, no colors)
const codeSpec = createCodeBlockSpec({
  ...codeBlockOptions,
  supportedLanguages: { ...codeBlockOptions.supportedLanguages, output: { name: 'Output', aliases: [] } },
  defaultLanguage: 'text',
});
// No red spell-check lines under code
const drawCode = codeSpec.implementation.render;
codeSpec.implementation.render = function render(...args) {
  const out = drawCode.apply(this, args);
  out?.dom?.setAttribute?.('spellcheck', 'false');
  out?.contentDOM?.setAttribute?.('spellcheck', 'false');
  return out;
};
const SCHEMA = BlockNoteSchema.create({ blockSpecs: { ...defaultBlockSpecs, codeBlock: codeSpec } });

/** The color-theme menu of code blocks (one choice for all code, saved in Settings) */
function CodeThemeMenu({ value, onPick }) {
  return (
    <div className="code-lang-menu code-theme-menu" onMouseDown={(e) => e.stopPropagation()} role="listbox" aria-label="Code theme">
      <p className="code-menu-title">Code theme</p>
      <div className="code-lang-list">
        {CODE_THEMES.map((th) => (
          <button key={th.id} type="button" role="option" aria-selected={th.id === value} className={th.id === value ? 'on' : ''} onClick={() => onPick(th.id)}>
            <span className="code-swatch" style={{ background: th.bg, borderColor: th.id === 'auto' ? 'var(--line)' : th.bg }} aria-hidden="true">
              <i style={{ background: th.k }} /><i style={{ background: th.s }} /><i style={{ background: th.f }} />
            </span>
            <span className="code-theme-name" data-no-translate={th.id !== 'auto' ? '' : undefined}>{th.label}</span>
            {th.id === value && <Icon name="tick" size={14} />}
          </button>
        ))}
      </div>
    </div>
  );
}

const LANGUAGES = Object.entries(codeBlockOptions.supportedLanguages)
  .map(([id, l]) => ({ id, name: l.name, aliases: l.aliases || [] }))
  .sort((a, b) => (a.id === 'text' ? -1 : b.id === 'text' ? 1 : a.name.localeCompare(b.name)));
const langName = (id) => (id === 'output' ? 'Output' : LANGUAGES.find((l) => l.id === id)?.name || 'Plain Text');

/** The language menu of a code block: search, arrow keys, Enter */
function LanguageMenu({ value, onPick, onClose }) {
  const [q, setQ] = useState('');
  const [at, setAt] = useState(0);
  const list = useRef(null);
  const query = q.trim().toLowerCase();
  const shown = LANGUAGES.filter((l) => !query || l.name.toLowerCase().includes(query) || l.id.includes(query) || l.aliases.some((a) => a.startsWith(query)));
  useEffect(() => { setAt(0); }, [q]);
  useEffect(() => { list.current?.children[at]?.scrollIntoView({ block: 'nearest' }); }, [at]);
  const key = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setAt((i) => Math.min(i + 1, shown.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAt((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (shown[at]) onPick(shown[at].id); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };
  return (
    <div className="code-lang-menu" onMouseDown={(e) => e.stopPropagation()}>
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={key} placeholder="Search for a language…" aria-label="Search for a language" />
      <div className="code-lang-list" ref={list} role="listbox" data-no-translate>
        {shown.length === 0 && <p className="code-lang-empty">No match</p>}
        {shown.map((l, i) => (
          <button key={l.id} type="button" role="option" aria-selected={l.id === value} className={`${i === at ? 'at' : ''} ${l.id === value ? 'on' : ''}`}
            onMouseEnter={() => setAt(i)} onClick={() => onPick(l.id)}>
            <span>{l.name}</span>{l.id === value && <Icon name="tick" size={14} />}
          </button>
        ))}
      </div>
    </div>
  );
}

/** On the code block under the mouse: the language button (top left) and Copy (top right) */
function CodeTools({ wrap, editor, onRun }) {
  const [box, setBox] = useState(null);     // { id, top, left, right }
  const [open, setOpen] = useState(false);  // false, 'lang' or 'theme'
  const { prefs, setPref } = useTheme();
  const [copied, setCopied] = useState(false);
  const openRef = useRef(false);
  openRef.current = open;
  useEffect(() => {
    const root = wrap.current;
    if (!root) return undefined;
    const move = (e) => {
      if (openRef.current || e.target.closest?.('.code-tools, .code-lang-menu')) return;
      const el = e.target.closest?.('[data-content-type="codeBlock"]');
      if (!el) { setBox(null); return; }
      const id = el.closest('[data-id]')?.getAttribute('data-id');
      const r = el.getBoundingClientRect(); const w = root.getBoundingClientRect();
      setBox((b) => (b?.id === id ? b : { id, top: r.top - w.top + 6, left: r.left - w.left + 8, right: w.right - r.right + 8 }));
      setCopied(false);
    };
    const leave = () => { if (!openRef.current) setBox(null); };
    root.addEventListener('mousemove', move);
    root.addEventListener('mouseleave', leave);
    return () => { root.removeEventListener('mousemove', move); root.removeEventListener('mouseleave', leave); };
  }, [wrap]);
  // Close the menu when clicking elsewhere
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!e.target.closest?.('.code-lang-menu, .code-lang-btn, .code-theme-btn')) { setOpen(false); setBox(null); } };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);
  if (!box) return null;
  const block = editor.getBlock(box.id);
  if (!block || block.type !== 'codeBlock') return null;
  const language = block.props?.language || 'text';
  const copy = async () => {
    // read the code from the editor itself (the screen copy is redrawn while it is highlighted)
    const text = Array.isArray(block.content) ? block.content.map((c) => c.text || '').join('') : '';
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  };
  const pick = (id) => {
    editor.updateBlock(box.id, { props: { language: id } });
    setOpen(false);
  };
  return (
    <>
      {language === 'output' ? <span className="code-tools code-out-label" style={{ top: box.top, left: box.left }}>Output</span> : (
      <button type="button" className={`code-tools code-lang-btn ${open ? 'open' : ''}`} style={{ top: box.top, left: box.left }}
        onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen((o) => (o === 'lang' ? false : 'lang'))} aria-haspopup="listbox" aria-expanded={open === 'lang'}>
        <span data-no-translate>{langName(language)}</span><Icon name="chevronDown" size={13} />
      </button>
      )}
      {open === 'lang' && (
        <div className="code-lang-pop" style={{ top: box.top + 32, left: box.left }}>
          <LanguageMenu value={language} onPick={pick} onClose={() => setOpen(false)} />
        </div>
      )}
      <div className="code-tools code-tools-right" style={{ top: box.top, right: box.right }}>
        {canRun(language) && (
          <button type="button" className="code-run-btn" onMouseDown={(e) => e.preventDefault()} onClick={() => onRun(box.id)}
            title={`${t('Run')} (${/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'}+Enter)`}>
            <Icon name="play" size={13} /> {language === 'html' ? 'Preview' : 'Run'}
          </button>
        )}
        {language !== 'output' && (
          <button type="button" className={`code-theme-btn ${open === 'theme' ? 'open' : ''}`}
            onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen((o) => (o === 'theme' ? false : 'theme'))}
            aria-label="Code theme" title={`Code theme: ${codeThemeInfo(prefs.codeTheme).label}`}>
            <Icon name="palette" size={14} />
          </button>
        )}
        <button type="button" className={`code-copy ${copied ? 'done' : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={copy}>
          <Icon name={copied ? 'tick' : 'copy'} size={14} /> {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {open === 'theme' && (
        <div className="code-lang-pop" style={{ top: box.top + 32, right: box.right }}>
          <CodeThemeMenu value={prefs.codeTheme} onPick={(id) => { setPref('codeTheme', id); setOpen(false); setBox(null); }} />
        </div>
      )}
    </>
  );
}

// BlockNote keeps one highlighter for the whole page (in a global cache); a new code theme needs a fresh one
let cachedCodeTheme = null;
function useCodeTheme(theme) {
  if (cachedCodeTheme !== theme) {
    delete globalThis[Symbol.for('blocknote.shikiHighlighterPromise')];
    delete globalThis[Symbol.for('blocknote.shikiParser')];
    cachedCodeTheme = theme;
  }
}

function NoteEditor({ note, dark, onChange, onReady, onAi }) {
  const wrap = useRef(null);
  const { prefs: { codeTheme, codeAI } } = useTheme();
  const latest = useRef(null);   // the page as last typed, so switching code theme keeps everything
  useCodeTheme(codeTheme);
  // A new code theme needs a new highlighter, so the editor is rebuilt (with the same content)
  const editor = useCreateBlockNote({
    schema: SCHEMA,
    extensions: [SyntaxHighlightingExtension({ createHighlighter: () => highlighterFor(codeTheme) }), codeGhostExtension],
    initialContent: latest.current?.length ? latest.current : note.content?.length ? note.content : undefined,
    uploadFile,
    dictionary: DICTIONARY,
  }, [codeTheme]);
  const theme = codeThemeInfo(codeTheme);

  // ---- AI code suggestions (grey ghost text after a short pause, like VS Code) ----
  const ai = useRef({ timer: 0, ctrl: null, last: 0 });
  const titleRef = useRef(note.title);
  titleRef.current = note.title;
  const askAI = async (now = false) => {
    const view = editor.prosemirrorView;
    if (!view || (!now && codeAI === 'off')) return;
    const req = suggestionRequest(view);
    if (!req) return;
    ai.current.ctrl?.abort();
    const ctrl = new AbortController();
    ai.current.ctrl = ctrl;
    ai.current.last = Date.now();
    const doc = view.state.doc;
    try {
      const res = await fetch('/api/notes/complete', {
        method: 'POST', signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ language: req.language, before: req.before, after: req.after, title: titleRef.current }),
      });
      const { text } = await res.json();
      // Show it only if nothing moved while the AI was thinking
      if (!ctrl.signal.aborted && text && view.state.doc === doc && view.state.selection.empty && view.state.selection.from === req.pos) showGhost(view, req.pos, text);
    } catch { /* cancelled or offline: no suggestion */ }
  };
  const scheduleAI = () => {
    clearTimeout(ai.current.timer);
    ai.current.ctrl?.abort();
    if (codeAI === 'off') return;
    const wait = Math.max(700, 1500 - (Date.now() - ai.current.last));   // at most about one request every 1.5 s
    ai.current.timer = setTimeout(() => askAI(false), wait);
  };
  useEffect(() => () => { clearTimeout(ai.current.timer); ai.current.ctrl?.abort(); }, []);

  // ---- Run: the result goes in an "Output" block right under the code (kept in the note) ----
  const [preview, setPreview] = useState(null);   // HTML preview window
  useEffect(() => {
    if (preview === null) return undefined;
    const close = (e) => { if (e.key === 'Escape') setPreview(null); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [preview]);
  const running = useRef(new Set());
  const runBlock = async (id) => {
    const block = editor.getBlock(id);
    if (!block || block.type !== 'codeBlock' || !canRun(block.props.language) || running.current.has(id)) return;
    const code = (block.content || []).map((c) => c.text || '').join('');
    const writeOut = (text) => {
      const b = editor.getBlock(id);
      if (!b) return;
      const next = editor.getNextBlock(b);
      if (next?.type === 'codeBlock' && next.props.language === 'output') editor.updateBlock(next, { content: text });
      else editor.insertBlocks([{ type: 'codeBlock', props: { language: 'output' }, content: text }], b, 'after');
    };
    running.current.add(id);
    try {
      if (block.props.language === 'html') { setPreview(code); return; }
      writeOut(t('Running…'));
      const res = await runCode(block.props.language, code.trim() ? code : '', {
        onStatus: () => writeOut(t('Starting Python… (only the first run takes a few seconds)')),
      });
      writeOut(res.text);
    } catch (err) {
      writeOut(`Error: ${err.message}`);
    } finally {
      running.current.delete(id);
    }
  };
  const runHere = () => { const b = editor.getTextCursorPosition().block; if (b) runBlock(b.id); };

  // ---- VS Code shortcuts inside code blocks (caught before the editor's own keys) ----
  useEffect(() => {
    const root = wrap.current;
    if (!root) return undefined;
    const key = (e) => {
      const view = editor.prosemirrorView;
      if (!view || !root.contains(e.target)) return;
      // Shift+Enter leaves the code block (a new paragraph below it)
      if (e.key === 'Enter' && e.shiftKey && !e.ctrlKey && !e.metaKey) {
        const block = editor.getTextCursorPosition().block;
        if (block?.type === 'codeBlock') {
          e.preventDefault(); e.stopPropagation();
          const [made] = editor.insertBlocks([{ type: 'paragraph' }], block, 'after');
          editor.setTextCursorPosition(made, 'start');
          return;
        }
      }
      if (handleCodeKey(view, e, { onAskAI: () => askAI(true), onRun: runHere })) { e.preventDefault(); e.stopPropagation(); }
    };
    root.addEventListener('keydown', key, true);
    const blur = () => { const v = editor.prosemirrorView; if (v) hideGhost(v); };
    root.addEventListener('focusout', blur);
    return () => { root.removeEventListener('keydown', key, true); root.removeEventListener('focusout', blur); };
  }, [editor, codeAI]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    onReady(editor);
    // Markdown written by Ask AI in the chat: turn it into real blocks once.
    // A new note gets it as its content; an existing note gets it at the end.
    if (note.markdown) {
      const blocks = editor.tryParseMarkdownToBlocks(note.markdown);
      if (blocks.length) {
        if (!note.content?.length) editor.replaceBlocks(editor.document, blocks);
        else editor.insertBlocks(blocks, editor.document.at(-1), 'after');
      }
      onChange(editor.document, { markdown: '' });
    }
  }, [editor]); // eslint-disable-line react-hooks/exhaustive-deps

  const getItems = async (query) => { slashQuery.text = query; return filterSuggestionItems(slashItems(editor, onAi), query); };

  return (
    <div className="note-editor-wrap" ref={wrap} data-code-theme={codeTheme} style={{ '--code-bg': theme.bg, '--code-fg': theme.fg }}>
    <CodeTools wrap={wrap} editor={editor} onRun={runBlock} />
    {preview !== null && createPortal(
      <div className="install-overlay" onClick={() => setPreview(null)} role="presentation">
        <div className="html-preview" role="dialog" aria-label="HTML preview" onClick={(e) => e.stopPropagation()}>
          <div className="html-preview-head">
            <b>HTML preview</b>
            <button type="button" className="icon-btn" onClick={() => setPreview(null)} aria-label="Close"><Icon name="close" /></button>
          </div>
          {/* sandboxed: the page can run its scripts but can't reach the app or your account */}
          <iframe title="HTML preview" sandbox="allow-scripts allow-modals allow-forms" srcDoc={preview} />
        </div>
      </div>,
      document.body,   // outside the notes pane, so it is centered on the screen
    )}
    <BlockNoteView editor={editor} theme={dark ? { dark: EDITOR_THEME, light: EDITOR_THEME } : EDITOR_THEME}
      data-color-scheme={dark ? 'dark' : 'light'} onChange={() => { latest.current = editor.document; onChange(editor.document); scheduleAI(); }}
      slashMenu={false} formattingToolbar={false}>
      <SuggestionMenuController triggerCharacter="/" getItems={getItems} suggestionMenuComponent={SlashMenu} />
      <FormattingToolbarController formattingToolbar={() => (
        <FormattingToolbar>
          <AiToolbarButton key="ai" onAi={() => onAi({ selection: true })} />
          {getFormattingToolbarItems()}
        </FormattingToolbar>
      )} />
    </BlockNoteView>
    </div>
  );
}

/* ---------- Covers: a gradient, or a picture from the computer or phone ---------- */
const isPicture = (c) => typeof c === 'string' && c.startsWith('data:image/');
function coverStyle(note) {
  if (isPicture(note?.cover)) return { backgroundImage: `url("${note.cover}")`, backgroundPosition: `center ${note.coverY ?? 50}%`, backgroundSize: 'cover' };
  const preset = COVERS[note?.cover];
  return preset ? { background: preset.bg } : null;
}

/** Makes a cover picture smaller (wide side 1800px) so it saves fast */
async function readCover(file) {
  if (!file?.type?.startsWith('image/')) throw new Error('Choose a picture (JPG, PNG, HEIC or WebP)');
  if (file.size > 25 * 1048576) throw new Error('That picture is larger than 25 MB');
  let bitmap;
  try { bitmap = await createImageBitmap(file); } catch { throw new Error('This picture type cannot be read here. Try a JPG or PNG.'); }
  const scale = Math.min(1, 1800 / bitmap.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  for (const q of [0.82, 0.7, 0.55, 0.4]) {
    const url = canvas.toDataURL('image/jpeg', q);
    if (url.length < 1_400_000) return url;
  }
  throw new Error('That picture is too detailed. Try a smaller one.');
}

function CoverPicker({ note, setMeta, close, notify }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      setMeta({ cover: await readCover(file), coverY: 50 }, true);
      close();
    } catch (err) {
      notify(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="pop-menu cover-grid" role="menu">
      <button type="button" className="cover-upload" onClick={() => fileRef.current?.click()} disabled={busy}>
        <Icon name="image" size={16} />
        <span><b>{busy ? 'Adding your picture…' : 'Upload your own picture'}</b><small>From your computer or phone · or drop it on the cover</small></span>
      </button>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ''; }} />
      {Object.entries(COVERS).map(([k, c]) => (
        <button key={k} type="button" title={c.label} className={`${c.moving ? 'moving' : ''} ${note.cover === k ? 'on' : ''}`} style={{ background: c.bg }}
          onClick={() => { setMeta({ cover: k }, true); close(); }}><span>{c.label}</span></button>
      ))}
    </div>
  );
}

function Cover({ note, setMeta, open, setOpen, notify }) {
  const [moving, setMoving] = useState(null);         // the position while repositioning
  const [drop, setDrop] = useState(false);
  const drag = useRef(null);
  const ref = useRef(null);
  const picture = isPicture(note.cover);
  const style = coverStyle(moving == null ? note : { ...note, coverY: moving });

  const down = (e) => {
    if (moving == null) return;
    e.preventDefault();
    drag.current = { y: e.clientY, start: moving };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const move = (e) => {
    if (!drag.current) return;
    const h = ref.current?.offsetHeight || 200;
    setMoving(Math.min(100, Math.max(0, drag.current.start - ((e.clientY - drag.current.y) / h) * 100)));
  };
  const onDrop = async (e) => {
    e.preventDefault();
    setDrop(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    try { setMeta({ cover: await readCover(file), coverY: 50 }, true); } catch (err) { notify(err.message); }
  };

  return (
    <div ref={ref} style={style}
      className={`note-cover ${COVERS[note.cover]?.moving ? 'moving' : ''} ${moving != null ? 'repositioning' : ''} ${drop ? 'dropping' : ''}`}
      onPointerDown={down} onPointerMove={move} onPointerUp={() => { drag.current = null; }}
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDrop(true); } }}
      onDragLeave={() => setDrop(false)} onDrop={onDrop}>
      {moving != null && <span className="cover-hint">Drag the picture to reposition</span>}
      {drop && <span className="cover-hint">Drop to use this picture</span>}
      <div className="cover-tools">
        {moving != null ? (
          <>
            <button type="button" onClick={() => { setMeta({ coverY: Math.round(moving) }, true); setMoving(null); }}>Save position</button>
            <button type="button" onClick={() => setMoving(null)}>Cancel</button>
          </>
        ) : (
          <>
            <div className="pop-wrap">
              <button type="button" onClick={() => setOpen((v) => !v)}>Change cover</button>
              {open && <CoverPicker note={note} setMeta={setMeta} close={() => setOpen(false)} notify={notify} />}
            </div>
            {picture && <button type="button" onClick={() => { setOpen(false); setMoving(note.coverY ?? 50); }}>Reposition</button>}
            <button type="button" onClick={() => setMeta({ cover: '' }, true)}>Remove</button>
          </>
        )}
      </div>
    </div>
  );
}

/** "Move to" menu of a page in the list: folders, or out of its folder */
function MoveMenu({ note, folders, onMove, onNewFolder, close }) {
  useEffect(() => {
    const away = (e) => { if (!e.target.closest?.('.move-menu')) close(); };
    const esc = (e) => { if (e.key === 'Escape') close(); };
    setTimeout(() => document.addEventListener('mousedown', away), 0);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [close]);
  return (
    <div className="pop-menu move-menu" role="menu">
      <p className="code-menu-title">Move to folder</p>
      {folders.map((f) => (
        <button key={f.id} type="button" role="menuitem" className={note.folder === f.id ? 'on' : ''} onClick={() => { close(); onMove(note.id, { folder: f.id }); }}>
          <Icon name="folder" size={15} style={f.color ? { color: f.color } : undefined} /><span className="ellipsis" data-no-translate>{f.name}</span>
          {note.folder === f.id && <Icon name="tick" size={14} />}
        </button>
      ))}
      {note.folder && <button type="button" role="menuitem" onClick={() => { close(); onMove(note.id, { folder: null }); }}><Icon name="close" size={15} /><span>Take out of the folder</span></button>}
      <button type="button" role="menuitem" onClick={() => { close(); onNewFolder(note.id); }}><Icon name="folderPlus" size={15} /><span>New folder…</span></button>
    </div>
  );
}

function TreeItem({ note, depth, byParent, currentId, expanded, toggle, onOpen, onAdd, confirmDel, setConfirmDel, onDelete, courseColor, moveOpen, setMoveOpen, folders, onMove, onNewFolder }) {
  const kids = byParent.get(note.id) || [];
  const open = expanded.has(note.id);
  return (
    <div>
      <div className={`tree-item ${note.id === currentId ? 'active' : ''}`} style={{ paddingLeft: 6 + depth * 14 }}>
        {confirmDel === note.id ? (
          <div className="history-confirm">
            <span>{kids.length ? 'Move this page and its sub-pages to the Trash?' : 'Move this page to the Trash?'}</span>
            <button className="btn danger sm" type="button" onClick={() => onDelete(note.id)}>Move</button>
            <button className="btn sm" type="button" onClick={() => setConfirmDel(null)}>Cancel</button>
          </div>
        ) : (
          <>
            <button type="button" className={`tree-caret ${kids.length ? '' : 'empty'} ${open ? 'open' : ''}`} onClick={() => toggle(note.id)}
              aria-label={open ? 'Collapse' : 'Expand'} tabIndex={kids.length ? 0 : -1}>
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M3 2l4 3-4 3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <button type="button" className="tree-open" onClick={() => onOpen(note.id)} title={titleOf(note)} draggable
              onDragStart={(e) => { e.dataTransfer.setData('text/x-sa-note', note.id); e.dataTransfer.effectAllowed = 'move'; document.documentElement.classList.add('dragging-note'); }}
              onDragEnd={() => document.documentElement.classList.remove('dragging-note')}>
              <span className="tree-icon">{note.icon || <Icon name="file" size={15} />}</span>
              <span className="ellipsis">{titleOf(note)}</span>
              {note.course && courseColor(note.course) && <span className="dot" style={{ background: courseColor(note.course) }} />}
            </button>
            <span className="tree-actions">
              <button type="button" onClick={() => onAdd(note.id)} title="Add a sub-page" aria-label="Add a sub-page"><Icon name="plus" size={14} /></button>
              {depth === 0 && <button type="button" onClick={() => setMoveOpen(moveOpen === note.id ? null : note.id)} title="Move to folder" aria-label="Move to folder" aria-expanded={moveOpen === note.id}><Icon name="folder" size={14} /></button>}
              <button type="button" onClick={() => setConfirmDel(note.id)} title="Move to Trash" aria-label={`Move ${titleOf(note)} to the Trash`}><Icon name="trash" size={13} /></button>
            </span>
            {moveOpen === note.id && <MoveMenu note={note} folders={folders} onMove={onMove} onNewFolder={onNewFolder} close={() => setMoveOpen(null)} />}
          </>
        )}
      </div>
      {open && <div className="tree-kids">{kids.map((k) => (
        <TreeItem key={k.id} note={k} depth={depth + 1} byParent={byParent} currentId={currentId} expanded={expanded} toggle={toggle}
          onOpen={onOpen} onAdd={onAdd} confirmDel={confirmDel} setConfirmDel={setConfirmDel} onDelete={onDelete} courseColor={courseColor}
          moveOpen={moveOpen} setMoveOpen={setMoveOpen} folders={folders} onMove={onMove} onNewFolder={onNewFolder} />
      ))}</div>}
    </div>
  );
}

/** A group in the notes list (a folder, a course, or "Other pages"): opens and closes, and pages can be dropped on it */
function GroupHead({ label, lead, count, collapsed, onToggle, onDropNote, onAdd, addTitle, children, editing }) {
  const [over, setOver] = useState(false);
  return (
    <div className={`group-head ${over ? 'drop' : ''}`}
      onDragOver={onDropNote ? (e) => { if (e.dataTransfer.types.includes('text/x-sa-note')) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOver(true); } } : undefined}
      onDragLeave={() => setOver(false)}
      onDrop={onDropNote ? (e) => { e.preventDefault(); setOver(false); const nid = e.dataTransfer.getData('text/x-sa-note'); if (nid) onDropNote(nid); } : undefined}>
      {editing || (
        <button type="button" className="group-toggle" onClick={onToggle} aria-expanded={!collapsed}>
          <svg className={`group-caret ${collapsed ? '' : 'open'}`} width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M3 2l4 3-4 3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          {lead}
          <span className="ellipsis">{label}</span>
          {count > 0 && <span className="group-count">{count}</span>}
        </button>
      )}
      {!editing && (
        <span className="tree-actions">
          {children}
          {onAdd && <button type="button" onClick={onAdd} title={addTitle} aria-label={addTitle}><Icon name="plus" size={14} /></button>}
        </span>
      )}
    </div>
  );
}

/** Name box for a new folder or a renamed one */
function FolderName({ value = '', onDone, onCancel }) {
  const [name, setName] = useState(value);
  const done = () => { const v = name.trim(); if (v && v !== value) onDone(v); else onCancel(); };
  return (
    <form className="folder-name" onSubmit={(e) => { e.preventDefault(); done(); }}>
      <Icon name="folder" size={15} />
      <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Folder name" aria-label="Folder name" autoFocus
        onBlur={done} onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); onCancel(); } }} />
    </form>
  );
}

/** Which groups are closed in the notes list (remembered on this device) */
function useCollapsed() {
  const [set, setSet] = useState(() => { try { return new Set(JSON.parse(localStorage.getItem('sa-notes-closed') || '[]')); } catch { return new Set(); } });
  const toggle = (key) => setSet((old) => {
    const next = new Set(old);
    if (next.has(key)) next.delete(key); else next.add(key);
    try { localStorage.setItem('sa-notes-closed', JSON.stringify([...next])); } catch { /* ignore */ }
    return next;
  });
  return [set, toggle];
}

const TEXT_SIZES = [{ id: 's', label: 'Small' }, { id: 'm', label: 'Default' }, { id: 'l', label: 'Large' }];

/** Page options: text size and full width (saved with the page) */
function PageLook({ note, setMeta }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!e.target.closest?.('.look-wrap')) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  const size = note.textSize || 'm';
  return (
    <div className="pop-wrap look-wrap">
      <button className={`icon-btn ${open ? 'on' : ''}`} type="button" onClick={() => setOpen((v) => !v)} aria-label="Page style" title="Text size and page width" aria-expanded={open}>
        <Icon name="type" size={17} />
      </button>
      {open && (
        <div className="pop-menu look-menu" role="dialog" aria-label="Page style">
          <p className="code-menu-title">Text size</p>
          <div className="look-sizes" role="radiogroup" aria-label="Text size">
            {TEXT_SIZES.map((o) => (
              <button key={o.id} type="button" role="radio" aria-checked={size === o.id} className={size === o.id ? 'on' : ''} onClick={() => setMeta({ textSize: o.id }, true)}>
                <span className={`look-aa s-${o.id}`} aria-hidden="true">Aa</span>{o.label}
              </button>
            ))}
          </div>
          <button type="button" role="switch" aria-checked={Boolean(note.wide)} className="look-row" onClick={() => setMeta({ wide: !note.wide }, true)}>
            <Icon name="width" size={16} /><span>Full width</span>
            <span className={`toggle ${note.wide ? 'on' : ''}`} aria-hidden="true"><span /></span>
          </button>
        </div>
      )}
    </div>
  );
}

export default function Notes() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { courses, notify, trashed } = useData();
  const { resolved } = useTheme();
  const dark = resolved === 'dark' || resolved === 'midnight';

  const [notes, setNotes] = useState(null);           // list without content; null while loading
  const [folders, setFolders] = useState([]);         // the student's own folders
  const [newFolder, setNewFolder] = useState(null);   // null, or { note } (a page to put in it) while naming a new folder
  const [renaming, setRenaming] = useState(null);     // folder id
  const [folderDel, setFolderDel] = useState(null);   // folder id waiting for "Delete?"
  const [moveOpen, setMoveOpen] = useState(null);     // page whose "Move to" menu is open
  const [closed, toggleGroup] = useCollapsed();
  const listW = useResizable('sa-notes-w', { initial: 260, min: 200, max: 480 });
  const [current, setCurrent] = useState(null);       // the open note, with content
  const [loadingNote, setLoadingNote] = useState(false);
  const [status, setStatus] = useState('');           // '', 'saving', 'saved', 'error'
  const [panel, setPanel] = useState(wide);
  const [expanded, setExpanded] = useState(() => new Set());
  const [confirmDel, setConfirmDel] = useState(null);
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [ai, setAi] = useState(null);
  const [coverOpen, setCoverOpen] = useState(false);
  const [chatOpen, setChatOpenState] = useState(() => { try { return localStorage.getItem('notes-ai-open') === '1' && wide(); } catch { return false; } });
  const setChatOpen = (fn) => setChatOpenState((v) => {
    const next = typeof fn === 'function' ? fn(v) : fn;
    try { localStorage.setItem('notes-ai-open', next ? '1' : '0'); } catch { /* ignore */ }
    return next;
  });
  const [entering, setEntering] = useState(false);    // blocks fade in one after another when a page opens                 // the AI writer: { ctx, start, key }

  const editorRef = useRef(null);
  const titleRef = useRef(null);
  const pending = useRef({ id: null, body: {} });
  const timer = useRef();

  // ---------- Saving (a short moment after you stop typing) ----------
  const flush = async () => {
    clearTimeout(timer.current);
    const { id: noteId, body } = pending.current;
    if (!noteId || !Object.keys(body).length) return;
    pending.current = { id: noteId, body: {} };
    try {
      const meta = await api.patch(`/notes/${noteId}`, body);
      setNotes((ns) => ns && ns.map((n) => (n.id === noteId ? { ...n, ...meta } : n)));
      setStatus('saved');
    } catch (err) {
      setStatus('error');
      notify(err.message);
    }
  };
  const queue = (noteId, patch, now = false) => {
    if (pending.current.id && pending.current.id !== noteId) flush();
    pending.current = { id: noteId, body: { ...pending.current.body, ...patch } };
    setStatus('saving');
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, now ? 0 : 700);
  };
  useEffect(() => {
    const away = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', away);
    window.addEventListener('beforeunload', flush);
    return () => { document.removeEventListener('visibilitychange', away); window.removeEventListener('beforeunload', flush); flush(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- Loading ----------
  const loadList = useCallback(() => Promise.all([
    api.get('/notes').then(setNotes).catch((err) => { setNotes((n) => n || []); notify(err.message); }),
    api.get('/folders').then(setFolders).catch(() => {}),
  ]), [notify]);
  useEffect(() => { loadList(); }, [loadList]);
  // a page restored from the Trash comes back in the list
  useEffect(() => {
    window.addEventListener('sa-restored', loadList);
    return () => window.removeEventListener('sa-restored', loadList);
  }, [loadList]);

  useEffect(() => {
    flush();
    setEmojiOpen(false); setDelOpen(false); setStatus(''); setAi(null); setCoverOpen(false);
    editorRef.current = null;
    if (!id) { setCurrent(null); return; }
    setLoadingNote(true);
    api.get(`/notes/${id}`)
      .then((n) => setCurrent(n))
      .catch(() => { notify('That page was not found'); navigate('/notes', { replace: true }); })
      .finally(() => setLoadingNote(false));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const byId = useMemo(() => new Map((notes || []).map((n) => [n.id, n])), [notes]);
  const byParent = useMemo(() => {
    const m = new Map();
    for (const n of notes || []) {
      const key = n.parent && byId.has(n.parent) ? n.parent : 'root';
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(n);
    }
    for (const list of m.values()) list.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    return m;
  }, [notes, byId]);

  // Open the folders above the current page
  useEffect(() => {
    if (!id || !notes) return;
    setExpanded((set) => {
      const next = new Set(set);
      for (let p = byId.get(id)?.parent; p && byId.has(p); p = byId.get(p).parent) next.add(p);
      return next;
    });
  }, [id, notes, byId]);

  // Search, a moment after typing stops
  useEffect(() => {
    if (!q.trim()) { setResults(null); return undefined; }
    const t = setTimeout(() => api.get(`/notes/search?q=${encodeURIComponent(q.trim())}`).then(setResults).catch(() => setResults([])), 250);
    return () => clearTimeout(t);
  }, [q]);

  const courseColor = (cid) => courses.find((c) => c.id === cid)?.color;
  const toggle = (nid) => setExpanded((set) => { const next = new Set(set); if (next.has(nid)) next.delete(nid); else next.add(nid); return next; });
  const open = (nid) => { navigate(`/notes/${nid}`); if (!wide()) setPanel(false); };

  // ---------- Changing pages ----------
  const create = async (parent = null, template = TEMPLATES[0], extra = {}) => {
    await flush();
    try {
      const n = await api.post('/notes', { title: template.title, icon: template.icon === '📄' ? '' : template.icon, parent, content: template.blocks, ...extra });
      setNotes((ns) => [n, ...(ns || [])]);
      if (parent) setExpanded((set) => new Set(set).add(parent));
      navigate(`/notes/${n.id}`);
      if (!wide()) setPanel(false);
      setTimeout(() => titleRef.current?.focus(), 150);
    } catch (err) {
      notify(err.message);
    }
  };

  const remove = async (nid) => {
    setConfirmDel(null);
    setDelOpen(false);
    try {
      if (pending.current.id === nid) pending.current = { id: null, body: {} };
      const res = await api.del(`/notes/${nid}`);
      // remove the page and everything under it from the list
      const gone = new Set([nid]);
      let grew = true;
      while (grew) { grew = false; for (const n of notes) if (n.parent && gone.has(n.parent) && !gone.has(n.id)) { gone.add(n.id); grew = true; } }
      setNotes((ns) => ns.filter((n) => !gone.has(n.id)));
      if (id && gone.has(id)) {
        const parent = byId.get(nid)?.parent;
        navigate(parent && !gone.has(parent) ? `/notes/${parent}` : '/notes', { replace: true });
      }
      trashed(res);
    } catch (err) {
      notify(err.message);
    }
  };

  // ---------- Folders and groups ----------
  /** Put a page in a folder, a course group or "Other pages" (it becomes a top-level page) */
  const move = async (nid, change) => {
    if (pending.current.id === nid) await flush();
    const patch = { ...change };
    if (patch.folder || patch.course !== undefined) patch.parent = null;
    try {
      const meta = await api.patch(`/notes/${nid}`, patch);
      setNotes((ns) => ns.map((n) => (n.id === nid ? { ...n, ...meta } : n)));
      if (current?.id === nid) setCurrent((c) => ({ ...c, ...meta }));
      if (patch.folder) { const f = folders.find((x) => x.id === patch.folder); if (f) notify(t('Moved to {name}').replace('{name}', f.name)); }
    } catch (err) {
      notify(err.message);
    }
  };
  const addFolder = async (name, noteId) => {
    setNewFolder(null);
    try {
      const f = await api.post('/folders', { name });
      setFolders((list) => [...list, f]);
      if (noteId) await move(noteId, { folder: f.id });
    } catch (err) { notify(err.message); }
  };
  const renameFolder = async (fid, name) => {
    setRenaming(null);
    try {
      const f = await api.patch(`/folders/${fid}`, { name });
      setFolders((list) => list.map((x) => (x.id === fid ? f : x)));
    } catch (err) { notify(err.message); }
  };
  const deleteFolder = async (fid) => {
    setFolderDel(null);
    try {
      await api.del(`/folders/${fid}`);
      setFolders((list) => list.filter((x) => x.id !== fid));
      setNotes((ns) => ns.map((n) => (n.folder === fid ? { ...n, folder: null } : n)));
      notify(t('Folder deleted. Its pages were kept.'));
    } catch (err) { notify(err.message); }
  };

  const setMeta = (patch, now = false) => {
    setCurrent((c) => ({ ...c, ...patch }));
    setNotes((ns) => ns.map((n) => (n.id === current.id ? { ...n, ...patch } : n)));
    queue(current.id, patch, now);
  };


  /** Opens the AI writer. selection: use the selected text; start: run an action straight away */
  const openAi = ({ selection = false, start = null, end = false } = {}) => {
    const editor = editorRef.current;
    if (!editor) return;

    const ctx = end ? { blocks: [], selection: '', anchor: null } : aiContext(editor, { useSelection: selection || !start });
    setAi({ ctx, start, key: Date.now() });
  };
  const closeAi = (inserted) => {
    setAi(null);
    if (inserted) notify('Added by AI. Press Ctrl+Z to undo.');
    setTimeout(() => editorRef.current?.focus(), 0);
  };
  useEffect(() => {
    const key = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'j' && editorRef.current) {
        e.preventDefault();
        openAi({ selection: true });
      }
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!current?.id) return undefined;
    setEntering(true);
    const t = setTimeout(() => setEntering(false), 900);
    return () => clearTimeout(t);
  }, [current?.id]);

  // Grow the title box with the text (and again when the page gets narrower or wider, e.g. a panel is resized)
  useEffect(() => {
    const el = titleRef.current;
    if (!el) return undefined;
    const fit = () => { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; };
    fit();
    let width = el.clientWidth;
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => { if (el.clientWidth !== width) { width = el.clientWidth; fit(); } });
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [current?.title, current?.id, current?.textSize]);

  const crumbs = [];
  for (let p = current?.parent; p && byId.has(p); p = byId.get(p).parent) crumbs.unshift(byId.get(p));
  const children = current ? byParent.get(current.id) || [] : [];
  const favorites = (notes || []).filter((n) => n.favorite);
  const roots = byParent.get('root') || [];
  const treeProps = { byParent, currentId: id, expanded, toggle, onOpen: open, onAdd: (p) => create(p), confirmDel, setConfirmDel, onDelete: remove, courseColor,
    moveOpen, setMoveOpen, folders, onMove: move, onNewFolder: (nid) => setNewFolder({ note: nid }) };
  // Top-level pages, grouped: the student's folders first, then one group per course, then the rest
  const folderIds = new Set(folders.map((f) => f.id));
  const courseIds = new Set(courses.map((c) => c.id));
  const inFolder = (fid) => roots.filter((n) => n.folder === fid);
  const inCourse = (cid) => roots.filter((n) => !folderIds.has(n.folder) && n.course === cid);
  const others = roots.filter((n) => !folderIds.has(n.folder) && !courseIds.has(n.course));
  const courseGroups = courses.map((c) => ({ c, list: inCourse(c.id) })).filter((g) => g.list.length);
  const grouped = folders.length > 0 || courseGroups.length > 0;
  const sorted = (list) => [...list].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  return (
    <div className={`notes ${panel ? 'panel-open' : ''}`} style={{ '--notes-side-w': `${listW.width}px` }}>
      <aside className="notes-side" aria-label="Your pages">
        <div className={`notes-resize ${listW.dragging ? 'on' : ''}`} {...listW.handleProps} aria-label="Resize the list of pages" />
        <div className="history-head">
          <b>Notes</b>
          <span>
            <button className="icon-btn" type="button" onClick={() => create()} aria-label="New page" title="New page"><Icon name="plus" size={17} /></button>
            <button className="icon-btn" type="button" onClick={() => setPanel(false)} aria-label="Hide pages" title="Hide"><Icon name="sidebar" size={17} /></button>
          </span>
        </div>
        <label className="notes-search">
          <Icon name="search" size={15} />
          <input type="search" placeholder="Search notes" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search notes" />
        </label>
        <div className="history-list fade-scroll">
          {notes === null && <div className="chat-loading"><span className="thinking"><i /><i /><i /></span></div>}
          {results ? (
            <>
              <p className="history-group">{results.length ? 'Results' : 'No pages match'}</p>
              {results.map((n) => (
                <button key={n.id} type="button" className={`search-hit ${n.id === id ? 'active' : ''}`} onClick={() => open(n.id)}>
                  <b className="ellipsis">{n.icon} {titleOf(n)}</b>
                  {n.snippet && <span>{n.snippet}</span>}
                </button>
              ))}
            </>
          ) : notes && (
            <>
              {favorites.length > 0 && (
                <>
                  <p className="history-group">Favorites</p>
                  {favorites.map((n) => (
                    <div key={n.id} className={`tree-item ${n.id === id ? 'active' : ''}`} style={{ paddingLeft: 6 }}>
                      <span className="tree-caret empty" />
                      <button type="button" className="tree-open" onClick={() => open(n.id)}>
                        <span className="tree-icon">{n.icon || <Icon name="file" size={15} />}</span><span className="ellipsis">{titleOf(n)}</span>
                      </button>
                    </div>
                  ))}
                </>
              )}
              <div className="history-group group-label">
                <span>Folders</span>
                <button type="button" className="group-add" onClick={() => setNewFolder({})} title="New folder" aria-label="New folder"><Icon name="folderPlus" size={15} /></button>
              </div>
              {newFolder && <FolderName onDone={(name) => addFolder(name, newFolder.note)} onCancel={() => setNewFolder(null)} />}
              {folders.length === 0 && !newFolder && <p className="history-empty small">Make folders to group pages your way. Drag a page onto a folder to move it.</p>}
              {folders.map((f) => {
                const list = sorted(inFolder(f.id));
                const isClosed = closed.has(`f:${f.id}`);
                return (
                  <div key={f.id} className="note-group">
                    {folderDel === f.id ? (
                      <div className="history-confirm">
                        <span>Delete this folder? Its pages are kept.</span>
                        <button className="btn danger sm" type="button" onClick={() => deleteFolder(f.id)}>Delete</button>
                        <button className="btn sm" type="button" onClick={() => setFolderDel(null)}>Cancel</button>
                      </div>
                    ) : (
                      <GroupHead label={<span data-no-translate>{f.name}</span>} count={list.length} collapsed={isClosed} onToggle={() => toggleGroup(`f:${f.id}`)}
                        lead={<Icon name="folder" size={15} className="group-icon" />}
                        editing={renaming === f.id && <FolderName value={f.name} onDone={(name) => renameFolder(f.id, name)} onCancel={() => setRenaming(null)} />}
                        onDropNote={(nid) => move(nid, { folder: f.id })}
                        onAdd={() => create(null, TEMPLATES[0], { folder: f.id })} addTitle="New page in this folder">
                        <button type="button" onClick={() => setRenaming(f.id)} title="Rename" aria-label="Rename folder"><Icon name="pencil" size={13} /></button>
                        <button type="button" className="danger-hover" onClick={() => setFolderDel(f.id)} title="Delete folder" aria-label="Delete folder"><Icon name="trash" size={13} /></button>
                      </GroupHead>
                    )}
                    {!isClosed && (
                      <div className="group-body">
                        {list.length === 0 && <p className="history-empty small">Empty. Drag pages here.</p>}
                        {list.map((n) => <TreeItem key={n.id} note={n} depth={0} {...treeProps} />)}
                      </div>
                    )}
                  </div>
                );
              })}

              {courseGroups.length > 0 && <p className="history-group">Courses</p>}
              {courseGroups.map(({ c, list }) => {
                const isClosed = closed.has(`c:${c.id}`);
                return (
                  <div key={c.id} className="note-group">
                    <GroupHead label={<span data-no-translate>{c.code}</span>} count={list.length} collapsed={isClosed} onToggle={() => toggleGroup(`c:${c.id}`)}
                      lead={<span className="dot" style={{ background: c.color }} />}
                      onDropNote={(nid) => move(nid, { course: c.id, folder: null })}
                      onAdd={() => create(null, TEMPLATES[0], { course: c.id })} addTitle="New page for this course" />
                    {!isClosed && <div className="group-body">{sorted(list).map((n) => <TreeItem key={n.id} note={n} depth={0} {...treeProps} />)}</div>}
                  </div>
                );
              })}

              {grouped ? (
                <div className="note-group">
                  <GroupHead label={courseGroups.length ? 'Other pages' : 'Pages'} count={others.length} collapsed={closed.has('other')} onToggle={() => toggleGroup('other')}
                    onDropNote={(nid) => move(nid, { course: null, folder: null })}
                    onAdd={() => create()} addTitle="New page" />
                  {!closed.has('other') && <div className="group-body">{sorted(others).map((n) => <TreeItem key={n.id} note={n} depth={0} {...treeProps} />)}</div>}
                </div>
              ) : (
                <>
                  <p className="history-group">Pages</p>
                  {roots.map((n) => <TreeItem key={n.id} note={n} depth={0} {...treeProps} />)}
                </>
              )}
              {roots.length === 0 && <p className="history-empty">No pages yet. Click + to write your first note.</p>}
            </>
          )}
        </div>
        <button className="side-link notes-new" type="button" onClick={() => create()}><Icon name="plus" /><span>New page</span></button>
      </aside>
      {panel && <div className="history-scrim" onClick={() => setPanel(false)} aria-hidden="true" />}

      <div className="notes-main">
        <div className="notes-top">
          {!panel && (
            <button className="icon-btn" type="button" onClick={() => setPanel(true)} aria-label="Show pages" title="Pages"><Icon name="sidebar" size={17} /></button>
          )}
          <nav className="crumbs" aria-label="Page path">
            {current ? (
              <>
                {crumbs.map((c) => (
                  <span key={c.id}><button type="button" onClick={() => open(c.id)}>{c.icon} {titleOf(c)}</button><i>/</i></span>
                ))}
                <span className="crumb-now ellipsis">{current.icon} {titleOf(current)}</span>
              </>
            ) : <span className="crumb-now">Notes</span>}
          </nav>
          {current && (
            <div className="notes-tools">
              <span className={`save-state ${status}`} key={status}>
                {status === 'saving' ? <><i className="save-dot" />Saving…</> : status === 'saved' ? <><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path className="save-check" d="M2.5 6.5l2.2 2.2L9.5 3.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>Saved</>
                  : status === 'error' ? 'Not saved' : `Edited ${ago(current.updatedAt)}`}
              </span>
              <select className="course-tag" value={current.course || ''} onChange={(e) => setMeta({ course: e.target.value || null }, true)} aria-label="Course">
                <option value="">No course</option>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
              </select>
              <button className={`icon-btn ${current.favorite ? 'fav' : ''}`} key={current.favorite ? 'on' : 'off'} type="button" onClick={() => setMeta({ favorite: !current.favorite }, true)}
                aria-label={current.favorite ? 'Remove from favorites' : 'Add to favorites'} title={current.favorite ? 'Remove from favorites' : 'Add to favorites'}>
                <Icon name="star" size={17} />
              </button>
              <button className={`btn sm ai-btn ${chatOpen ? 'on' : ''}`} type="button" onClick={() => setChatOpen((v) => !v)} aria-pressed={chatOpen}
                title="Chat with AI about this page. It can edit the page for you.">
                <img src="/logo.png" alt="" width={16} height={16} /> Ask AI
              </button>
              <PageLook note={current} setMeta={setMeta} />
              <div className="pop-wrap">
                <button className="icon-btn" type="button" onClick={() => setDelOpen((v) => !v)} aria-label="Move page to Trash" title="Move to Trash"><Icon name="trash" size={16} /></button>
                {delOpen && (
                  <div className="pop-menu confirm" role="dialog">
                    <span>{children.length ? 'Move this page and its sub-pages to the Trash? You can restore it for 30 days.' : 'Move this page to the Trash? You can restore it for 30 days.'}</span>
                    <div><button className="btn danger sm" type="button" onClick={() => remove(current.id)}>Move to Trash</button>
                      <button className="btn sm" type="button" onClick={() => setDelOpen(false)}>Cancel</button></div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="notes-scroll">
          {loadingNote ? (
            <div className="chat-loading"><span className="thinking"><i /><i /><i /></span></div>
          ) : current ? (
            <Fragment key={current.id}>
            {coverStyle(current) && (
              <Cover note={current} setMeta={setMeta} open={coverOpen} setOpen={setCoverOpen} notify={notify} />
            )}
            <article className={`note-page ${coverStyle(current) ? 'has-cover' : ''} ${entering ? 'entering' : ''} ${current.wide ? 'wide' : ''} text-${current.textSize || 'm'}`}>
              {current.icon && (
                <div className="note-icon-row">
                  <div className="pop-wrap">
                    <button type="button" className="note-icon" onClick={() => setEmojiOpen((v) => !v)} aria-label="Change icon">{current.icon}</button>
                    {emojiOpen && (
                      <div className="pop-menu emoji-grid">
                        {EMOJIS.map((e) => <button key={e} type="button" onClick={() => { setMeta({ icon: e }, true); setEmojiOpen(false); }}>{e}</button>)}
                        <button type="button" className="emoji-remove" onClick={() => { setMeta({ icon: '' }, true); setEmojiOpen(false); }}>Remove</button>
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div className="note-actions">
                {!current.icon && (
                  <div className="pop-wrap">
                    <button type="button" className="add-icon" onClick={() => setEmojiOpen((v) => !v)}><Icon name="smile" size={15} /> Add icon</button>
                    {emojiOpen && (
                      <div className="pop-menu emoji-grid">
                        {EMOJIS.map((e) => <button key={e} type="button" onClick={() => { setMeta({ icon: e }, true); setEmojiOpen(false); }}>{e}</button>)}
                      </div>
                    )}
                  </div>
                )}
                {!coverStyle(current) && (
                  <div className="pop-wrap">
                    <button type="button" className="add-icon" onClick={() => setCoverOpen((v) => !v)}><Icon name="image" size={15} /> Add cover</button>
                    {coverOpen && <CoverPicker note={current} setMeta={setMeta} close={() => setCoverOpen(false)} notify={notify} />}
                  </div>
                )}
              </div>
              <textarea ref={titleRef} className="note-title" rows={1} value={current.title} placeholder="Untitled" maxLength={200}
                onChange={(e) => setMeta({ title: e.target.value.replace(/\n/g, '') })}
                onKeyDown={(e) => { if (e.key === 'Enter' || (e.key === 'ArrowDown')) { e.preventDefault(); editorRef.current?.focus(); } }} />
              <NoteEditor note={current} dark={dark} onAi={openAi}
                onReady={(ed) => { editorRef.current = ed; }}
                onChange={(content, extra = {}) => queue(current.id, { content, ...extra })} />
              {children.length > 0 && (
                <section className="subpages">
                  <p className="history-group">Sub-pages</p>
                  {children.map((c) => (
                    <button key={c.id} type="button" onClick={() => open(c.id)}>
                      <span className="tree-icon">{c.icon || <Icon name="file" size={15} />}</span>{titleOf(c)}
                    </button>
                  ))}
                </section>
              )}
              <button className="add-sub" type="button" onClick={() => create(current.id)}><Icon name="plus" size={14} /> Add a sub-page</button>
              {ai && editorRef.current && (
                <NoteAI key={ai.key} editor={editorRef.current} ctx={ai.ctx} start={ai.start} title={titleOf(current)}
                  onClose={closeAi} notify={notify} />
              )}
            </article>
            </Fragment>
          ) : (
            <div className="notes-empty">
              <span className="notes-empty-icon">🗒️</span>
              <h2>{notes?.length ? 'Pick a page, or start a new one' : 'Your notes, all in one place'}</h2>
              <p className="muted">Write lecture notes, study guides and plans. Type <kbd>/</kbd> for headings, lists, to-dos, tables, code and pictures.
                Select text or press <kbd>Ctrl</kbd> <kbd>J</kbd> to write and edit with AI, right in the page.</p>
              <div className="templates">
                {TEMPLATES.map((t) => (
                  <button key={t.id} type="button" className="suggest-card" onClick={() => create(null, t)}>
                    <b>{t.icon} {t.label}</b><span>{t.text}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      {chatOpen && current && (
        <NotesChat note={current} getEditor={() => editorRef.current} notify={notify} onClose={() => setChatOpen(false)} />
      )}
    </div>
  );
}
