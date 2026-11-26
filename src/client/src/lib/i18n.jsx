/**
 * Languages: English, French, Spanish, Arabic (right to left), Chinese and Hindi.
 *
 * The app is written in English. A translator watches the page and swaps each English text it knows
 * (buttons, menus, messages, placeholders, tooltips) for the chosen language, using the dictionaries in
 * src/locales/. Numbers inside a text are kept, so "in 3 days" uses the dictionary entry "in {n} days".
 * Things the student wrote (notes, AI answers, typed text) are never changed.
 *
 * The choice is saved in this browser and on the account, so emails and the AI use it too.
 */
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../icons.jsx';

export const LANGS = [
  { code: 'en', native: 'English', locale: 'en-US' },
  { code: 'fr', native: 'Français', locale: 'fr-FR' },
  { code: 'es', native: 'Español', locale: 'es-ES' },
  { code: 'ar', native: 'العربية', locale: 'ar', dir: 'rtl' },
  { code: 'zh', native: '中文', locale: 'zh-CN' },
  { code: 'hi', native: 'हिन्दी', locale: 'hi-IN' },
];
const KEY = 'sa-lang';
const LOADERS = {
  fr: () => import('../locales/fr.json'),
  es: () => import('../locales/es.json'),
  ar: () => import('../locales/ar.json'),
  zh: () => import('../locales/zh.json'),
  hi: () => import('../locales/hi.json'),
};

let lang = 'en';
let dict = null;                // English text (normalized) -> translation
const listeners = new Set();

const supported = (c) => LANGS.some((l) => l.code === c);
function detect() {
  try { const saved = localStorage.getItem(KEY); if (supported(saved)) return saved; } catch { /* private mode */ }
  for (const l of navigator.languages || [navigator.language || 'en']) {
    const c = String(l).slice(0, 2).toLowerCase();
    if (supported(c)) return c;
  }
  return 'en';
}

export const getLang = () => lang;
export const langInfo = (c = lang) => LANGS.find((l) => l.code === c) || LANGS[0];
/** The locale for dates and numbers, for example "fr-FR" */
export const locale = () => langInfo().locale;
/** Was a language chosen in this browser (not just detected)? */
export const chosenHere = () => { try { return supported(localStorage.getItem(KEY)); } catch { return false; } };

/* ---------- Looking up a text ---------- */
const NUM = /\d+(?:[.,:]\d+)*/g;
const norm = (s) => s.replace(/\s+/g, ' ').trim();

/** Translates one English text; returns null when there is no translation */
export function lookup(text) {
  if (!dict || !text) return null;
  const clean = norm(text);
  if (!clean || !/[A-Za-z]/.test(clean)) return null;
  let out = dict[clean];
  if (out == null) {
    const nums = clean.match(NUM);
    if (!nums) return null;
    const pattern = dict[clean.replace(NUM, '{n}')];
    if (pattern == null) return null;
    let k = 0;
    out = pattern.replace(/\{n\}/g, () => nums[k++] ?? '');
  }
  // keep the spaces around the text (they separate words from numbers next to them)
  const lead = text.match(/^\s*/)[0];
  const trail = text.match(/\s*$/)[0];
  return lead + out + trail;
}

/** For text made in code (document title, speech, confirm boxes...). Supports {name} values. */
export function t(text, values) {
  let out = lookup(text) ?? text;
  if (values) for (const [k, v] of Object.entries(values)) out = out.replaceAll(`{${k}}`, v);
  return out;
}

/* ---------- Translating the page ---------- */
const SKIP = '[contenteditable="true"], .bn-editor, .md, textarea, code, pre, script, style, [data-no-translate], .note-title, .nai-bubble, .bubble.me, .msg.me, .sc-answer';
const ATTRS = ['placeholder', 'title', 'aria-label'];
const original = new WeakMap();   // text node -> its English text
const shown = new WeakMap();      // text node -> the text we put there

function doText(node) {
  const parent = node.parentElement;
  if (!parent || parent.closest(SKIP)) return;
  const now = node.nodeValue;
  if (shown.get(node) !== now) original.set(node, now);     // new text from React
  const src = original.get(node);
  const out = (dict && lookup(src)) ?? src;
  shown.set(node, out);
  if (out !== now) node.nodeValue = out;
}

const ATTR_SKIP = SKIP.replace(', textarea', '').replace(', .note-title', '');
function doAttrs(el) {
  if (!el.getAttribute || el.closest(ATTR_SKIP)) return;
  for (const a of ATTRS) {
    const now = el.getAttribute(a);
    if (now == null) continue;
    const store = (el.__i18n ||= {});
    if (!store[a] || store[a].out !== now) store[a] = { src: now };
    const out = (dict && lookup(store[a].src)) ?? store[a].src;
    store[a].out = out;
    if (out !== now) el.setAttribute(a, out);
  }
}

function walk(root) {
  if (root.nodeType === 3) { doText(root); return; }
  if (root.nodeType !== 1) return;
  if (root.matches?.(SKIP)) { doAttrs(root); return; }
  doAttrs(root);
  const it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: (n) => {
      if (n.nodeType === 1 && n.matches(SKIP)) { doAttrs(n); return NodeFilter.FILTER_REJECT; }   // placeholders still translate
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  for (let n = it.nextNode(); n; n = it.nextNode()) {
    if (n.nodeType === 3) doText(n); else doAttrs(n);
  }
}

let observer = null;
function startObserver() {
  if (observer || typeof MutationObserver === 'undefined') return;
  observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'characterData') doText(r.target);
      else if (r.type === 'attributes') doAttrs(r.target);
      else r.addedNodes.forEach(walk);
    }
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  walk(document.body);
}

function applyDocument() {
  const info = langInfo();
  document.documentElement.lang = info.code;
  document.documentElement.dir = info.dir || 'ltr';
}

/** Called once before the app starts */
export async function initI18n() {
  lang = detect();
  if (lang !== 'en') {
    try { dict = (await LOADERS[lang]()).default; } catch { lang = 'en'; dict = null; }
  }
  applyDocument();
  if (document.body) startObserver();
  else window.addEventListener('DOMContentLoaded', startObserver, { once: true });
}

/** Switches language: saves it, tells the server, and reloads the page in that language */
export async function setLang(code, { save = true, reload = true } = {}) {
  if (!supported(code)) return;
  try { localStorage.setItem(KEY, code); } catch { /* private mode */ }
  if (save) {
    try {
      const { api, getToken } = await import('./api.js');
      if (getToken()) await api.patch('/auth/me', { language: code });
    } catch { /* not signed in or offline */ }
  }
  if (reload && code !== lang) window.location.reload();
}

export function useLang() {
  const [, render] = useState(0);
  useEffect(() => {
    const fn = () => render((n) => n + 1);
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, []);
  return { lang, setLang, locale: locale(), rtl: langInfo().dir === 'rtl' };
}

/** Each language's name in the language the app is shown in ("French", "Französisch"...) */
function localName(code) {
  try { return new Intl.DisplayNames([locale()], { type: 'language' }).of(code); } catch { return ''; }
}

/**
 * The language picker: a button that opens a small menu of the six languages.
 *   variant="pill"  globe + current language, for the welcome and sign-in pages
 *   variant="side"  a sidebar row "Language · English" that opens upward
 */
export function LanguageSelect({ variant = 'pill' }) {
  const { lang: current } = useLang();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(null);
  const box = useRef(null);
  const trigger = useRef(null);
  const items = useRef([]);
  const info = LANGS.find((l) => l.code === current) || LANGS[0];

  useEffect(() => {
    if (!open) return undefined;
    const outside = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    const keys = (e) => {
      if (e.key === 'Escape') { setOpen(false); trigger.current?.focus(); return; }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
      e.preventDefault();
      const list = items.current.filter(Boolean);
      const at = list.indexOf(document.activeElement);
      const next = e.key === 'Home' ? 0 : e.key === 'End' ? list.length - 1
        : (at + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length;
      list[next]?.focus();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', keys);
    // Focus the current language when the menu opens
    requestAnimationFrame(() => items.current[LANGS.findIndex((l) => l.code === current)]?.focus());
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', keys); };
  }, [open, current]);

  const choose = async (code) => {
    if (code === current) { setOpen(false); return; }
    setBusy(code);
    await setLang(code);
  };

  return (
    <div className={`lang-menu lang-${variant} ${open ? 'open' : ''}`} ref={box}>
      {variant === 'side' ? (
        <button ref={trigger} type="button" className="side-link" onClick={() => setOpen((o) => !o)}
          aria-haspopup="menu" aria-expanded={open}>
          <Icon name="globe" /><span>Language</span>
          <span className="lang-current" data-no-translate>{info.native}</span>
        </button>
      ) : (
        <button ref={trigger} type="button" className="lang-btn" onClick={() => setOpen((o) => !o)}
          aria-haspopup="menu" aria-expanded={open} aria-label={`${t('Language')}: ${info.native}`} title={t('Language')}>
          <Icon name="globe" size={16} />
          <span className="lang-name" data-no-translate>{info.native}</span>
          <Icon name="chevronDown" size={14} className="lang-caret" />
        </button>
      )}
      {open && (
        <div className="lang-pop" role="menu" aria-label={t('Language')} data-no-translate>
          <p className="lang-pop-title">{t('Language')}</p>
          {LANGS.map((l, i) => {
            const sub = localName(l.code);
            const on = l.code === current;
            return (
              <button key={l.code} ref={(el) => { items.current[i] = el; }} type="button" role="menuitemradio" aria-checked={on}
                className={`lang-item ${on ? 'on' : ''}`} onClick={() => choose(l.code)} disabled={Boolean(busy)}
                style={{ '--i': i }}>
                <span className="lang-code">{l.code.toUpperCase()}</span>
                <span className="lang-text">
                  <b lang={l.code} dir={l.dir || 'ltr'}>{l.native}</b>
                  {sub && sub.toLowerCase() !== l.native.toLowerCase() && <small>{sub}</small>}
                </span>
                {busy === l.code ? <span className="lang-spin" aria-hidden="true" />
                  : on && <Icon name="tick" size={16} className="lang-tick" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
