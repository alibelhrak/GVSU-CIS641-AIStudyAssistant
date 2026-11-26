import { createContext, useCallback, useContext, useEffect, useState } from 'react';

/** Themes the student can pick. `bg`, `side` and `fg` are only used to draw the preview tiles. */
export const THEMES = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light', bg: '#ffffff', side: '#f7f7f5', fg: '#37352f' },
  { id: 'dark', label: 'Dark', bg: '#191919', side: '#202020', fg: '#d4d4d4' },
  { id: 'paper', label: 'Paper', bg: '#fbf8f1', side: '#f2ecdf', fg: '#3f3426' },
  { id: 'midnight', label: 'Midnight', bg: '#0e1322', side: '#131a2e', fg: '#dfe5f5' },
];

export const ACCENTS = [
  { id: 'blue', label: 'Blue', color: '#2383e2' },
  { id: 'purple', label: 'Purple', color: '#9a6dd7' },
  { id: 'green', label: 'Green', color: '#2f9e6f' },
  { id: 'orange', label: 'Orange', color: '#e0782e' },
  { id: 'pink', label: 'Pink', color: '#d6588f' },
];

export const FONTS = [
  { id: 'default', label: 'Default', family: '"Inter", ui-sans-serif, system-ui, sans-serif' },
  { id: 'serif', label: 'Serif', family: '"Lora", Georgia, "Times New Roman", serif', css: 'Lora:ital,wght@0,400;0,500;0,600;0,700;1,400' },
  { id: 'mono', label: 'Mono', family: '"JetBrains Mono", ui-monospace, Menlo, monospace', css: 'JetBrains+Mono:wght@400;500;700' },
  { id: 'readable', label: 'Easy to read', family: '"Atkinson Hyperlegible", ui-sans-serif, system-ui, sans-serif', css: 'Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400' },
];
export const SIZES = [
  { id: 's', label: 'Small' },
  { id: 'm', label: 'Default' },
  { id: 'l', label: 'Large' },
  { id: 'xl', label: 'Extra large' },
];
/** Other preferences, with their defaults */
const PREF_DEFAULTS = { font: 'default', size: 'm', motion: 'system', weekStart: 'mon', startPage: 'dashboard', codeTheme: 'auto', codeAI: 'on' };

/** Load a font from Google Fonts the first time it is picked */
export function loadFont(id) {
  const f = FONTS.find((x) => x.id === id);
  if (!f?.css || document.getElementById(`font-${id}`)) return;
  const link = Object.assign(document.createElement('link'), { id: `font-${id}`, rel: 'stylesheet', href: `https://fonts.googleapis.com/css2?family=${f.css}&display=swap` });
  document.head.append(link);
}

const KEY_THEME = 'sa-theme';
const KEY_ACCENT = 'sa-accent';
const read = (key, fallback) => { try { return localStorage.getItem(key) || fallback; } catch { return fallback; } };
const save = (key, value) => { try { localStorage.setItem(key, value); } catch { /* private mode: keep it for this visit only */ } };

const systemDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;
const resolve = (theme) => (theme === 'system' ? (systemDark() ? 'dark' : 'light') : theme);

const ThemeContext = createContext(null);
export const useTheme = () => useContext(ThemeContext);

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => read(KEY_THEME, 'system'));
  const [accent, setAccentState] = useState(() => read(KEY_ACCENT, 'blue'));
  const [prefs, setPrefsState] = useState(() => Object.fromEntries(
    Object.entries(PREF_DEFAULTS).map(([k, d]) => [k, read(`sa-${k}`, d)]),
  ));

  // Apply the theme to <html data-theme="..."> and follow the OS when "System" is chosen
  useEffect(() => {
    const apply = () => { document.documentElement.dataset.theme = resolve(theme); };
    apply();
    if (theme !== 'system') return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);

  useEffect(() => { document.documentElement.dataset.accent = accent; }, [accent]);

  // Font, text size and motion go on <html> as data-font / data-size / data-motion
  useEffect(() => {
    const html = document.documentElement;
    loadFont(prefs.font);
    html.dataset.font = prefs.font;
    html.dataset.size = prefs.size;
    html.dataset.motion = prefs.motion;
  }, [prefs.font, prefs.size, prefs.motion]);

  // Fade colors smoothly only while switching, so normal hovers stay snappy
  const fade = () => {
    const html = document.documentElement;
    html.classList.add('theming');
    clearTimeout(fade.t);
    fade.t = setTimeout(() => html.classList.remove('theming'), 450);
  };

  const setTheme = useCallback((t) => { fade(); setThemeState(t); save(KEY_THEME, t); }, []);
  const setAccent = useCallback((a) => { fade(); setAccentState(a); save(KEY_ACCENT, a); }, []);
  const setPref = useCallback((key, value) => {
    if (!(key in PREF_DEFAULTS)) return;
    setPrefsState((p) => ({ ...p, [key]: value }));
    save(`sa-${key}`, value);
  }, []);
  /** Take the preferences saved on the account (after signing in on a new device) */
  const applyPrefs = useCallback((saved = {}) => {
    if (saved.theme) { setThemeState(saved.theme); save(KEY_THEME, saved.theme); }
    if (saved.accent) { setAccentState(saved.accent); save(KEY_ACCENT, saved.accent); }
    const next = {};
    for (const k of Object.keys(PREF_DEFAULTS)) if (saved[k]) { next[k] = saved[k]; save(`sa-${k}`, saved[k]); }
    setPrefsState((p) => ({ ...p, ...next }));
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, accent, setTheme, setAccent, prefs, setPref, applyPrefs, resolved: resolve(theme) }}>
      {children}
    </ThemeContext.Provider>
  );}