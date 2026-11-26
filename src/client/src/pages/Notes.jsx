import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { filterSuggestionItems } from '@blocknote/core';
import { en } from '@blocknote/core/locales';
import {
  useCreateBlockNote, SuggestionMenuController, getDefaultReactSlashMenuItems,
  FormattingToolbarController, FormattingToolbar, getFormattingToolbarItems, useComponentsContext,
} from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import '@blocknote/mantine/style.css';
import { api } from '../lib/api.js';
import { useData } from '../lib/store.jsx';
import { useTheme } from '../lib/theme.jsx';
import { Icon } from '../icons.jsx';
import { NoteAI, WRITE_ACTIONS, aiContext } from './NoteAI.jsx';
import '../notes.css';

/*
 * Notes: Notion-style pages.
 * The editor (BlockNote) gives "/" commands, headings, lists, to-dos, quotes, code, tables, pictures,
 * drag handles and a formatting toolbar. Pages can hold sub-pages, have an emoji and a course tag,
 * and save by themselves while you type.
 * AI works inside the page too (see NoteAI.jsx): select text, type /ai, or press Ctrl+J.
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

const CHAT_ACTIONS = [
  { label: 'Summarize this note', prompt: 'Summarize my note in a few bullet points, then list the 3 most important things to remember.' },
  { label: 'Quiz me on it', prompt: 'Quiz me on my note. Ask 5 questions one at a time and tell me if my answer is right.' },
  { label: 'Explain it simply', prompt: 'Explain the ideas in my note simply, with an example for each.' },
  { label: 'Make a study plan', prompt: 'Using my note and my deadlines, plan study sessions to learn this material. Add them to my schedule.' },
];

const wide = () => typeof window !== 'undefined' && window.innerWidth > 900;
const titleOf = (n) => n?.title?.trim() || 'Untitled';
const ago = (d) => {
  const s = (Date.now() - new Date(d)) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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
      ...i, badge: undefined, title: RENAME[i.key] || i.title, hint: HINT[i.key], aliases: [...(i.aliases || []), i.title, ...(MORE_ALIASES[i.key] || [])],
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

const DICTIONARY = {
  ...en,
  placeholders: { ...en.placeholders, default: "Write something, or press '/' for commands and Ctrl+J for AI…", heading: 'Heading', bulletListItem: 'List', numberedListItem: 'List', checkListItem: 'To-do' },
};

function NoteEditor({ note, dark, onChange, onReady, onAi }) {
  const editor = useCreateBlockNote({
    initialContent: note.content?.length ? note.content : undefined,
    uploadFile,
    dictionary: DICTIONARY,
  });
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
    <BlockNoteView editor={editor} theme={dark ? { dark: EDITOR_THEME, light: EDITOR_THEME } : EDITOR_THEME}
      data-color-scheme={dark ? 'dark' : 'light'} onChange={() => onChange(editor.document)}
      slashMenu={false} formattingToolbar={false}>
      <SuggestionMenuController triggerCharacter="/" getItems={getItems} suggestionMenuComponent={SlashMenu} />
      <FormattingToolbarController formattingToolbar={() => (
        <FormattingToolbar>
          <AiToolbarButton key="ai" onAi={() => onAi({ selection: true })} />
          {getFormattingToolbarItems()}
        </FormattingToolbar>
      )} />
    </BlockNoteView>
  );
}

function TreeItem({ note, depth, byParent, currentId, expanded, toggle, onOpen, onAdd, confirmDel, setConfirmDel, onDelete, courseColor }) {
  const kids = byParent.get(note.id) || [];
  const open = expanded.has(note.id);
  return (
    <div>
      <div className={`tree-item ${note.id === currentId ? 'active' : ''}`} style={{ paddingLeft: 6 + depth * 14 }}>
        {confirmDel === note.id ? (
          <div className="history-confirm">
            <span>Delete "{titleOf(note)}"{kids.length ? ' and its sub-pages' : ''}?</span>
            <button className="btn danger sm" type="button" onClick={() => onDelete(note.id)}>Delete</button>
            <button className="btn sm" type="button" onClick={() => setConfirmDel(null)}>Cancel</button>
          </div>
        ) : (
          <>
            <button type="button" className={`tree-caret ${kids.length ? '' : 'empty'} ${open ? 'open' : ''}`} onClick={() => toggle(note.id)}
              aria-label={open ? 'Collapse' : 'Expand'} tabIndex={kids.length ? 0 : -1}>
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M3 2l4 3-4 3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <button type="button" className="tree-open" onClick={() => onOpen(note.id)} title={titleOf(note)}>
              <span className="tree-icon">{note.icon || <Icon name="file" size={15} />}</span>
              <span className="ellipsis">{titleOf(note)}</span>
              {note.course && courseColor(note.course) && <span className="dot" style={{ background: courseColor(note.course) }} />}
            </button>
            <span className="tree-actions">
              <button type="button" onClick={() => onAdd(note.id)} title="Add a sub-page" aria-label="Add a sub-page"><Icon name="plus" size={14} /></button>
              <button type="button" onClick={() => setConfirmDel(note.id)} title="Delete" aria-label={`Delete ${titleOf(note)}`}><Icon name="trash" size={13} /></button>
            </span>
          </>
        )}
      </div>
      {open && <div className="tree-kids">{kids.map((k) => (
        <TreeItem key={k.id} note={k} depth={depth + 1} byParent={byParent} currentId={currentId} expanded={expanded} toggle={toggle}
          onOpen={onOpen} onAdd={onAdd} confirmDel={confirmDel} setConfirmDel={setConfirmDel} onDelete={onDelete} courseColor={courseColor} />
      ))}</div>}
    </div>
  );
}

export default function Notes() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { courses, notify } = useData();
  const { resolved } = useTheme();
  const dark = resolved === 'dark' || resolved === 'midnight';

  const [notes, setNotes] = useState(null);           // list without content; null while loading
  const [current, setCurrent] = useState(null);       // the open note, with content
  const [loadingNote, setLoadingNote] = useState(false);
  const [status, setStatus] = useState('');           // '', 'saving', 'saved', 'error'
  const [panel, setPanel] = useState(wide);
  const [expanded, setExpanded] = useState(() => new Set());
  const [confirmDel, setConfirmDel] = useState(null);
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [ai, setAi] = useState(null);
  const [coverOpen, setCoverOpen] = useState(false);
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
  useEffect(() => { api.get('/notes').then(setNotes).catch((err) => { setNotes([]); notify(err.message); }); }, [notify]);

  useEffect(() => {
    flush();
    setEmojiOpen(false); setAiOpen(false); setDelOpen(false); setStatus(''); setAi(null); setCoverOpen(false);
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
  const create = async (parent = null, template = TEMPLATES[0]) => {
    await flush();
    try {
      const n = await api.post('/notes', { title: template.title, icon: template.icon === '📄' ? '' : template.icon, parent, content: template.blocks });
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
      await api.del(`/notes/${nid}`);
      // remove the page and everything under it from the list
      const gone = new Set([nid]);
      let grew = true;
      while (grew) { grew = false; for (const n of notes) if (n.parent && gone.has(n.parent) && !gone.has(n.id)) { gone.add(n.id); grew = true; } }
      setNotes((ns) => ns.filter((n) => !gone.has(n.id)));
      if (id && gone.has(id)) {
        const parent = byId.get(nid)?.parent;
        navigate(parent && !gone.has(parent) ? `/notes/${parent}` : '/notes', { replace: true });
      }
      notify(gone.size > 1 ? `Deleted ${gone.size} pages` : 'Page deleted');
    } catch (err) {
      notify(err.message);
    }
  };

  const setMeta = (patch, now = false) => {
    setCurrent((c) => ({ ...c, ...patch }));
    setNotes((ns) => ns.map((n) => (n.id === current.id ? { ...n, ...patch } : n)));
    queue(current.id, patch, now);
  };

  const askAi = (prompt) => {
    setAiOpen(false);
    const editor = editorRef.current;
    const markdown = editor ? editor.blocksToMarkdownLossy(editor.document) : '';
    flush();
    navigate('/chat', { state: { note: { name: `${titleOf(current)}.md`, text: `# ${titleOf(current)}\n\n${markdown}`.slice(0, 16000), prompt } } });
  };

  /** Opens the AI writer. selection: use the selected text; start: run an action straight away */
  const openAi = ({ selection = false, start = null, end = false } = {}) => {
    const editor = editorRef.current;
    if (!editor) return;
    setAiOpen(false);
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

  // Grow the title box with the text
  useEffect(() => {
    const el = titleRef.current;
    if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; }
  }, [current?.title, current?.id]);

  const crumbs = [];
  for (let p = current?.parent; p && byId.has(p); p = byId.get(p).parent) crumbs.unshift(byId.get(p));
  const children = current ? byParent.get(current.id) || [] : [];
  const favorites = (notes || []).filter((n) => n.favorite);
  const roots = byParent.get('root') || [];
  const treeProps = { byParent, currentId: id, expanded, toggle, onOpen: open, onAdd: (p) => create(p), confirmDel, setConfirmDel, onDelete: remove, courseColor };

  return (
    <div className={`notes ${panel ? 'panel-open' : ''}`}>
      <aside className="notes-side" aria-label="Your pages">
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
        <div className="history-list">
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
              <p className="history-group">Pages</p>
              {roots.length === 0 && <p className="history-empty">No pages yet. Click + to write your first note.</p>}
              {roots.map((n) => <TreeItem key={n.id} note={n} depth={0} {...treeProps} />)}
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
              <div className="pop-wrap">
                <button className="btn sm ai-btn" type="button" onClick={() => setAiOpen((v) => !v)} aria-expanded={aiOpen}>
                  <img src="/logo.png" alt="" width={16} height={16} /> Ask AI
                </button>
                {aiOpen && (
                  <div className="pop-menu" role="menu">
                    <p className="pop-label">Write in this page</p>
                    <button type="button" role="menuitem" onClick={() => openAi({ end: true })}>✨ Ask AI to write… <kbd>Ctrl J</kbd></button>
                    {WRITE_ACTIONS.slice(1, 5).map((a) => (
                      <button key={a.id} type="button" role="menuitem" onClick={() => openAi({ end: true, start: { action: a.id } })}>{a.icon} {a.label}</button>
                    ))}
                    <p className="pop-label">Chat about this note</p>
                    {CHAT_ACTIONS.map((a) => <button key={a.label} type="button" role="menuitem" onClick={() => askAi(a.prompt)}>{a.label}</button>)}
                    <button type="button" role="menuitem" onClick={() => askAi('')}>Ask anything about it…</button>
                  </div>
                )}
              </div>
              <div className="pop-wrap">
                <button className="icon-btn" type="button" onClick={() => setDelOpen((v) => !v)} aria-label="Delete page" title="Delete page"><Icon name="trash" size={16} /></button>
                {delOpen && (
                  <div className="pop-menu confirm" role="dialog">
                    <span>Delete this page{children.length ? ' and its sub-pages' : ''}?</span>
                    <div><button className="btn danger sm" type="button" onClick={() => remove(current.id)}>Delete</button>
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
            {COVERS[current.cover] && (
              <div className={`note-cover ${COVERS[current.cover].moving ? 'moving' : ''}`} style={{ background: COVERS[current.cover].bg }}>
                <div className="cover-tools">
                  <div className="pop-wrap">
                    <button type="button" onClick={() => setCoverOpen((v) => !v)}>Change cover</button>
                    {coverOpen && <div className="pop-menu cover-grid" role="menu">
                      {Object.entries(COVERS).map(([k, c]) => (
                        <button key={k} type="button" title={c.label} className={`${c.moving ? 'moving' : ''} ${current.cover === k ? 'on' : ''}`} style={{ background: c.bg }}
                          onClick={() => { setMeta({ cover: k }, true); setCoverOpen(false); }}><span>{c.label}</span></button>
                      ))}
                    </div>}
                  </div>
                  <button type="button" onClick={() => setMeta({ cover: '' }, true)}>Remove</button>
                </div>
              </div>
            )}
            <article className={`note-page ${COVERS[current.cover] ? 'has-cover' : ''} ${entering ? 'entering' : ''}`}>
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
                {!COVERS[current.cover] && (
                  <div className="pop-wrap">
                    <button type="button" className="add-icon" onClick={() => setCoverOpen((v) => !v)}><Icon name="image" size={15} /> Add cover</button>
                    {coverOpen && <div className="pop-menu cover-grid" role="menu">
                      {Object.entries(COVERS).map(([k, c]) => (
                        <button key={k} type="button" title={c.label} className={`${c.moving ? 'moving' : ''} ${current.cover === k ? 'on' : ''}`} style={{ background: c.bg }}
                          onClick={() => { setMeta({ cover: k }, true); setCoverOpen(false); }}><span>{c.label}</span></button>
                      ))}
                    </div>}
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
    </div>
  );
}
