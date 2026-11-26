/**
 * VS Code-style editing inside code blocks of Notes:
 *   Tab / Shift+Tab, Ctrl+] / Ctrl+[   indent / outdent (one line or the selected lines)
 *   Ctrl+/                             comment / uncomment lines
 *   Alt+↑ / Alt+↓                      move lines up / down
 *   Shift+Alt+↑ / Shift+Alt+↓          copy lines up / down
 *   Ctrl+Shift+K                       delete line
 *   Ctrl+Enter                         new line below
 *   Enter                              keeps the indentation (and indents after : { ( [)
 *   ( [ { " ' `                        auto-close; typing the closing one steps over it; Backspace removes the pair
 *   Ctrl+A                             select the whole code block first
 * and AI suggestions shown as grey "ghost text": Tab accepts, Ctrl+→ accepts one word, Esc hides, Alt+\ asks now.
 * (On a Mac, Cmd works where Ctrl is written.)
 */
import { Plugin, PluginKey, TextSelection } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { createExtension } from '@blocknote/core';

// ---------------- Ghost text (AI suggestion) ----------------
export const ghostKey = new PluginKey('codeGhost');
const ghostPlugin = new Plugin({
  key: ghostKey,
  state: {
    init: () => null,
    apply(tr, value) {
      const meta = tr.getMeta(ghostKey);
      if (meta !== undefined) return meta;               // set or cleared on purpose
      if (!value || tr.docChanged || tr.selectionSet) return null;   // typing or moving hides it
      return value;
    },
  },
  props: {
    decorations(state) {
      const g = ghostKey.getState(state);
      if (!g) return null;
      return DecorationSet.create(state.doc, [Decoration.widget(g.pos, () => {
        const span = document.createElement('span');
        span.className = 'code-ghost';
        span.textContent = g.text;
        const hint = document.createElement('kbd');
        hint.className = 'code-ghost-hint';
        hint.textContent = 'Tab';
        span.append(hint);
        return span;
      }, { side: 1, key: `ghost-${g.pos}-${g.text}` })]);
    },
  },
});
export const codeGhostExtension = createExtension({ key: 'codeGhost', prosemirrorPlugins: [ghostPlugin] });
export const getGhost = (view) => ghostKey.getState(view.state);
export const showGhost = (view, pos, text) => view.dispatch(view.state.tr.setMeta(ghostKey, text ? { pos, text } : null));
export const hideGhost = (view) => { if (getGhost(view)) view.dispatch(view.state.tr.setMeta(ghostKey, null)); };

// ---------------- Helpers ----------------
const LINE_COMMENT = {
  python: '#', py: '#', r: '#', ruby: '#', julia: '#', shellscript: '#', yaml: '#', graphql: '#', perl: '#',
  sql: '--', lua: '--', haskell: '--', latex: '%', matlab: '%',
};
const BLOCK_COMMENT = { html: ['<!--', '-->'], xml: ['<!--', '-->'], markdown: ['<!--', '-->'], mdx: ['{/*', '*/}'], vue: ['<!--', '-->'], svelte: ['<!--', '-->'],
  css: ['/*', '*/'], scss: ['/*', '*/'], less: ['/*', '*/'], postcss: ['/*', '*/'] };
const FOUR = new Set(['python', 'java', 'c', 'cpp', 'csharp', 'kotlin', 'swift', 'rust', 'php', 'scala', 'haskell', 'julia', 'r', 'sql']);
const indentFor = (lang) => (FOUR.has(lang) ? '    ' : '  ');
const PAIRS = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`' };
const CLOSERS = new Set([')', ']', '}', '"', "'", '`']);

/** Where the cursor is, if it is inside a code block */
export function codeContext(view) {
  const { $from, $to } = view.state.selection;
  const node = $from.parent;
  if (node.type.name !== 'codeBlock' || $to.parent !== node) return null;
  const start = $from.start();
  return { node, start, text: node.textContent, from: $from.pos - start, to: $to.pos - start, language: node.attrs.language || 'text' };
}

/** Replace the whole code of the block and put the selection at [a, b] */
function write(view, ctx, text, a, b = a) {
  const { state } = view;
  const tr = state.tr;
  const end = ctx.start + ctx.node.content.size;
  if (text) tr.replaceWith(ctx.start, end, state.schema.text(text));
  else tr.delete(ctx.start, end);
  tr.setSelection(TextSelection.create(tr.doc, ctx.start + Math.min(a, text.length), ctx.start + Math.min(b, text.length)));
  view.dispatch(tr.scrollIntoView());
  return true;
}

/** The lines touched by the selection: [startOffset, endOffset) of the full lines */
function lineRange(text, from, to) {
  const s = text.lastIndexOf('\n', from - 1) + 1;
  let endFrom = to;
  if (to > from && text[to - 1] === '\n') endFrom = to - 1;      // a selection ending at a line start leaves that line out
  let e = text.indexOf('\n', endFrom);
  if (e === -1) e = text.length;
  return [s, e];
}

// ---------------- Commands ----------------
function indent(view, ctx, out) {
  const { text, from, to, language } = ctx;
  const unit = indentFor(language);
  if (!out && from === to) return write(view, ctx, text.slice(0, from) + unit + text.slice(to), from + unit.length);
  const [s, e] = lineRange(text, from, to);
  const lines = text.slice(s, e).split('\n');
  let first = 0; let total = 0;
  const next = lines.map((l, i) => {
    if (!out) { if (i === 0) first = unit.length; total += unit.length; return unit + l; }
    const m = l.match(new RegExp(`^( {1,${unit.length}}|\\t)`));
    const n = m ? m[0].length : 0;
    if (i === 0) first = -n;
    total -= n;
    return l.slice(n);
  });
  const joined = next.join('\n');
  const a = from === to ? Math.max(s, from + first) : Math.max(s, from + first);
  return write(view, ctx, text.slice(0, s) + joined + text.slice(e), a, from === to ? a : to + total);
}

function toggleComment(view, ctx) {
  const { text, from, to, language } = ctx;
  const [s, e] = lineRange(text, from, to);
  const lines = text.slice(s, e).split('\n');
  const block = BLOCK_COMMENT[language];
  const open = block ? `${block[0]} ` : `${LINE_COMMENT[language] || '//'} `;
  const close = block ? ` ${block[1]}` : '';
  const filled = lines.filter((l) => l.trim());
  const commented = filled.length > 0 && filled.every((l) => l.trimStart().startsWith(open.trim()));
  const pad = Math.min(...filled.map((l) => l.match(/^\s*/)[0].length), Infinity);
  const next = lines.map((l) => {
    if (!l.trim()) return l;
    if (commented) {
      let x = l.replace(new RegExp(`^(\\s*)${escape(open.trim())} ?`), '$1');
      if (close) x = x.replace(new RegExp(` ?${escape(close.trim())}\\s*$`), '');
      return x;
    }
    return `${l.slice(0, pad)}${open}${l.slice(pad)}${close}`;
  });
  const joined = next.join('\n');
  const shift = (next[0].length - lines[0].length);
  return write(view, ctx, text.slice(0, s) + joined + text.slice(e), Math.max(s, from + shift), to + (joined.length - (e - s)));
}
const escape = (x) => x.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

function moveLines(view, ctx, down, copy) {
  const { text, from, to } = ctx;
  const [s, e] = lineRange(text, from, to);
  const chunk = text.slice(s, e);
  if (copy) {
    const next = `${text.slice(0, e)}\n${chunk}${text.slice(e)}`;
    const d = down ? chunk.length + 1 : 0;
    return write(view, ctx, next, from + d, to + d);
  }
  if (!down) {
    if (s === 0) return true;
    const ps = text.lastIndexOf('\n', s - 2) + 1;
    const prev = text.slice(ps, s - 1);
    const next = `${text.slice(0, ps)}${chunk}\n${prev}${text.slice(e)}`;
    const d = -(prev.length + 1);
    return write(view, ctx, next, from + d, to + d);
  }
  if (e >= text.length) return true;
  let ne = text.indexOf('\n', e + 1); if (ne === -1) ne = text.length;
  const below = text.slice(e + 1, ne);
  const next = `${text.slice(0, s)}${below}\n${chunk}${text.slice(ne)}`;
  const d = below.length + 1;
  return write(view, ctx, next, from + d, to + d);
}

function deleteLine(view, ctx) {
  const { text, from, to } = ctx;
  const [s, e] = lineRange(text, from, to);
  const a = s > 0 ? s - 1 : s;
  const b = e < text.length ? e + 1 : e;
  const next = s > 0 ? text.slice(0, s - 1) + text.slice(e) : text.slice(b);
  const pos = s > 0 ? text.lastIndexOf('\n', a - 1) + 1 : 0;
  return write(view, ctx, next, Math.min(pos + (from - s), next.length));
}

function newline(view, ctx, below) {
  const { text, from, to, language } = ctx;
  const ls = text.lastIndexOf('\n', from - 1) + 1;
  const line = text.slice(ls, from);
  let base = line.match(/^[ \t]*/)[0];
  if (below) {
    let le = text.indexOf('\n', to); if (le === -1) le = text.length;
    const full = text.slice(ls, le);
    const extra = /[:{([]\s*$/.test(full) ? indentFor(language) : '';
    const ins = `\n${base}${extra}`;
    return write(view, ctx, text.slice(0, le) + ins + text.slice(le), le + ins.length);
  }
  const before = text.slice(0, from).replace(/[ \t]+$/, '');
  const after = text.slice(to);
  const opens = /[:{([]$/.test(before);
  if (opens) {
    const inner = base + indentFor(language);
    // between a pair like {|} the closing one goes on its own line, as in VS Code
    if (/^[)\]}]/.test(after)) {
      const ins = `\n${inner}\n${base}`;
      return write(view, ctx, before + ins + after, before.length + 1 + inner.length);
    }
    base = inner;
  }
  const ins = `\n${base}`;
  return write(view, ctx, text.slice(0, from) + ins + after, from + ins.length);
}

function typePair(view, ctx, ch) {
  const { text, from, to } = ctx;
  const next = text[to] || '';
  // Step over a closing character that is already there
  if (from === to && CLOSERS.has(ch) && next === ch) return write(view, ctx, text, from + 1);
  if (!PAIRS[ch]) return false;
  if (from !== to) {   // wrap the selection
    const inside = text.slice(from, to);
    return write(view, ctx, text.slice(0, from) + ch + inside + PAIRS[ch] + text.slice(to), from + 1, to + 1);
  }
  const prev = text[from - 1] || '';
  // Quotes: don't pair inside a word (it's / don't), brackets: only before space, end or a closer
  if (ch === PAIRS[ch] && /\w/.test(prev)) return false;
  if (next && !/[\s)\]},;:]/.test(next)) return false;
  return write(view, ctx, text.slice(0, from) + ch + PAIRS[ch] + text.slice(to), from + 1);
}

function backspacePair(view, ctx) {
  const { text, from, to } = ctx;
  if (from !== to || from === 0) return false;
  const a = text[from - 1]; const b = text[from];
  if (PAIRS[a] && PAIRS[a] === b) return write(view, ctx, text.slice(0, from - 1) + text.slice(from + 1), from - 1);
  return false;
}

function acceptGhost(view, ghost, wordOnly) {
  let take = ghost.text;
  if (wordOnly) {
    const m = ghost.text.match(/^\s*[\w$]+|^\s*[^\w\s]+|^\s+/);
    take = m ? m[0] : ghost.text;
  }
  const tr = view.state.tr.insertText(take, ghost.pos);
  const rest = ghost.text.slice(take.length);
  tr.setMeta(ghostKey, rest ? { pos: ghost.pos + take.length, text: rest } : null);
  view.dispatch(tr.scrollIntoView());
  return true;
}

/**
 * Handle a key press inside a code block. Returns true when it was handled.
 * onAskAI() is called for Alt+\ (ask for a suggestion now).
 */
export function handleCodeKey(view, e, { onAskAI } = {}) {
  if (e.isComposing || !view) return false;
  const ctx = codeContext(view);
  if (!ctx) return false;
  const mod = e.ctrlKey || e.metaKey;
  const ghost = getGhost(view);
  const k = e.key;

  if (ghost) {
    if (k === 'Tab' && !e.shiftKey && !mod) return acceptGhost(view, ghost, false);
    if (k === 'ArrowRight' && mod) return acceptGhost(view, ghost, true);
    if (k === 'Escape') { hideGhost(view); return true; }
  }
  if (k === '\\' && e.altKey && !mod) { onAskAI?.(true); return true; }
  if (k === 'Tab') return indent(view, ctx, e.shiftKey);
  if (mod && !e.altKey && (k === ']' || k === '[')) return indent(view, ctx, k === '[');
  if (mod && !e.shiftKey && (k === '/' || e.code === 'Slash')) return toggleComment(view, ctx);
  if (e.altKey && !mod && (k === 'ArrowUp' || k === 'ArrowDown')) return moveLines(view, ctx, k === 'ArrowDown', e.shiftKey);
  if (mod && e.shiftKey && (k === 'K' || k === 'k')) return deleteLine(view, ctx);
  if (k === 'Enter' && mod && !e.shiftKey) return newline(view, ctx, true);
  if (k === 'Enter' && !mod && !e.shiftKey && !e.altKey) return newline(view, ctx, false);
  if (mod && !e.shiftKey && !e.altKey && (k === 'a' || k === 'A') && !(ctx.from === 0 && ctx.to === ctx.text.length)) {
    return write(view, ctx, ctx.text, 0, ctx.text.length);
  }
  if (k === 'Backspace' && !mod && !e.altKey) return backspacePair(view, ctx);
  if (k.length === 1 && !mod && !e.altKey) return typePair(view, ctx, k);
  return false;
}

/** What to send for an AI suggestion, or null when the cursor isn't at a good spot */
export function suggestionRequest(view) {
  const ctx = codeContext(view);
  if (!ctx || ctx.from !== ctx.to) return null;
  const { text, from } = ctx;
  let le = text.indexOf('\n', from); if (le === -1) le = text.length;
  // Like VS Code: suggest at the end of a line (or before closing brackets/quotes only)
  if (!/^[\s)\]}"'`;,]*$/.test(text.slice(from, le))) return null;
  const before = text.slice(0, from);
  if (before.replace(/\s/g, '').length < 3) return null;
  return { pos: ctx.start + from, language: ctx.language, before, after: text.slice(from) };
}
