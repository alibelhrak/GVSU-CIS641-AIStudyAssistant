import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { loadFrimousseData, searchEmojis } from '@blocknote/core/emoji-data';
import { getLang, t } from '../lib/i18n.jsx';
import { Icon } from '../icons.jsx';

/** A few icons that suit study notes, shown first (like Notion's suggestions) */
export const SUGGESTED = ['📘', '📗', '📕', '📙', '📓', '📒', '📝', '📄', '📚', '🧠', '💡', '🎯', '✅', '⭐', '🔥', '📌',
  '🧪', '🧮', '📊', '📈', '🧬', '🔬', '📐', '💻', '🤖', '⚙️', '🌍', '🗣️', '🎨', '🎵', '🗓️', '❓'];
const RECENT_KEY = 'sa-emoji-recent';
const TONE_KEY = 'sa-emoji-tone';
const TONES = [['', '✋'], ['light', '✋🏻'], ['medium-light', '✋🏼'], ['medium', '✋🏽'], ['medium-dark', '✋🏾'], ['dark', '✋🏿']];
const DATA_LANGS = ['en', 'fr', 'es', 'ar', 'zh'];   // emoji names come in these languages (others use English)

const readList = (key) => { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; } };
const write = (key, v) => { try { localStorage.setItem(key, typeof v === 'string' ? v : JSON.stringify(v)); } catch { /* private mode */ } };
// Emoji typed or pasted from the keyboard's emoji panel (Win + . on Windows, Ctrl + Cmd + Space on a Mac)
const typedEmoji = (s) => {
  const seg = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s.trim())].map((x) => x.segment);
  return seg.length === 1 && /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(seg[0]) ? seg[0] : '';
};

let cache = null;   // the emoji list, loaded once per language
async function load(lang) {
  const l = DATA_LANGS.includes(lang) ? lang : 'en';
  if (cache?.lang !== l) cache = { lang: l, data: await loadFrimousseData(l) };
  return cache.data;
}

/**
 * The page icon picker, like Notion's: search every emoji (in the app's language), recent ones,
 * categories, skin tone, random, and any emoji typed with the keyboard's emoji panel.
 */
export default function EmojiPicker({ onPick, onRemove, onClose }) {
  const [data, setData] = useState(null);
  const [q, setQ] = useState('');
  const [tone, setTone] = useState(() => { try { return localStorage.getItem(TONE_KEY) || ''; } catch { return ''; } });
  const [toneOpen, setToneOpen] = useState(false);
  const [recent, setRecent] = useState(() => readList(RECENT_KEY));
  const box = useRef(null);
  const body = useRef(null);
  const hoverEl = useRef(null);   // the name under the grid (updated directly, so 1,900 buttons don't re-render on hover)
  const lang = getLang();
  // On phones it opens as a panel at the bottom of the screen, above everything
  const [sheet] = useState(() => window.matchMedia?.('(max-width: 560px)').matches);

  useEffect(() => { load(lang).then(setData).catch(() => setData({ emojis: [], categories: [] })); }, [lang]);
  useEffect(() => {
    // a click outside closes it (but not on the button that opened it: that button toggles it)
    const out = (e) => {
      if (sheet) { if (box.current && !box.current.contains(e.target)) onClose(); return; }
      const wrap = box.current?.parentElement; if (wrap && !wrap.contains(e.target)) onClose();
    };
    const esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('mousedown', out);
    document.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('mousedown', out); document.removeEventListener('keydown', esc, true); };
  }, [onClose, sheet]);

  const skin = (e) => (tone && e.skins?.[tone]) || e.emoji;
  const byEmoji = useMemo(() => new Map((data?.emojis || []).map((e) => [e.emoji, e])), [data]);
  const sections = useMemo(() => {
    if (!data) return [];
    const cats = data.categories.map((c) => ({ ...c, items: data.emojis.filter((e) => e.category === c.index) })).filter((c) => c.items.length);
    return cats;
  }, [data]);
  const results = useMemo(() => (data && q.trim() ? searchEmojis(data.emojis, q, data.locale) : null), [data, q]);
  const typed = typedEmoji(q);

  const pick = (emoji) => {
    const next = [emoji, ...recent.filter((x) => x !== emoji)].slice(0, 16);
    setRecent(next); write(RECENT_KEY, next);
    onPick(emoji);
  };
  const random = () => { const list = data?.emojis || []; if (list.length) pick(skin(list[Math.floor(Math.random() * list.length)])); };
  const jump = (i) => { const el = body.current?.querySelector(`[data-cat="${i}"]`); if (el) body.current.scrollTo({ top: el.offsetTop - 4, behavior: 'smooth' }); };
  const nameOf = (emoji) => byEmoji.get(emoji)?.label || '';

  const showName = (emoji, label) => { if (hoverEl.current) hoverEl.current.textContent = label ? `${emoji}  ${label}` : emoji; };
  const cell = (e, value) => {
    const shown = value || skin(e);
    const label = e?.label || nameOf(shown);
    return (
      <button key={shown} type="button" className="ep-cell" onClick={() => pick(shown)} onMouseEnter={() => showName(shown, label)} onFocus={() => showName(shown, label)} title={label} aria-label={label || shown}>
        {shown}
      </button>
    );
  };

  const picker = (
    <div className={`emoji-picker ${sheet ? 'sheet' : ''}`} ref={box} role="dialog" aria-label="Choose an icon">
      <div className="ep-top">
        <div className="ep-search">
          <Icon name="search" size={14} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search emoji, or type one…')} aria-label="Search emoji" autoFocus
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              if (typed) pick(typed); else if (results?.[0]) pick(skin(results[0]));
            }} />
        </div>
        <button type="button" className="ep-tool" onClick={random} title="Random" aria-label="Random emoji"><Icon name="shuffle" size={15} /></button>
        <div className="ep-tone-wrap">
          <button type="button" className="ep-tool" onClick={() => setToneOpen((v) => !v)} title="Skin tone" aria-label="Skin tone" aria-expanded={toneOpen}>{TONES.find(([k]) => k === tone)?.[1] || '✋'}</button>
          {toneOpen && (
            <div className="ep-tones">
              {TONES.map(([k, hand]) => <button key={k || 'none'} type="button" className={k === tone ? 'on' : ''} onClick={() => { setTone(k); write(TONE_KEY, k); setToneOpen(false); }}>{hand}</button>)}
            </div>
          )}
        </div>
        {onRemove && <button type="button" className="ep-remove" onClick={onRemove}>Remove</button>}
      </div>

      <div className="ep-body" ref={body}>
        {!data ? <div className="ep-loading"><span className="thinking"><i /><i /><i /></span></div>
          : results ? (
            <>
              {typed && (
                <section><p className="ep-title">From your keyboard</p><div className="ep-grid">{cell(null, typed)}</div></section>
              )}
              {results.length ? (
                <section><p className="ep-title">Results</p><div className="ep-grid">{results.slice(0, 400).map((e) => cell(e))}</div></section>
              ) : !typed && <p className="ep-empty">{t('No emoji found. Tip: press Win + . (Windows) or Ctrl + Cmd + Space (Mac) to type any emoji here.')}</p>}
            </>
          ) : (
            <>
              {recent.length > 0 && (
                <section><p className="ep-title">Recent</p><div className="ep-grid">{recent.map((x) => cell(byEmoji.get(x), x))}</div></section>
              )}
              <section><p className="ep-title">Suggested</p><div className="ep-grid">{SUGGESTED.map((x) => cell(byEmoji.get(x), x))}</div></section>
              {sections.map((c) => (
                <section key={c.index} data-cat={c.index}>
                  <p className="ep-title" data-no-translate>{c.label}</p>
                  <div className="ep-grid">{c.items.map((e) => cell(e))}</div>
                </section>
              ))}
            </>
          )}
      </div>

      <div className="ep-foot">
        {!results && sections.length > 0 ? (
          <nav className="ep-cats" aria-label="Categories">
            {sections.map((c) => <button key={c.index} type="button" onClick={() => jump(c.index)} title={c.label} aria-label={c.label}>{c.items[0].emoji}</button>)}
          </nav>
        ) : <span />}
        <span className="ep-hover" data-no-translate ref={hoverEl} />
      </div>
    </div>
  );
  return sheet ? createPortal(<div className="ep-backdrop">{picker}</div>, document.body) : picker;
}
