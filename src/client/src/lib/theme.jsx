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

  // Fade colors smoothly only while switching, so normal hovers stay snappy
  const fade = () => {
    const html = document.documentElement;
    html.classList.add('theming');
    clearTimeout(fade.t);
    fade.t = setTimeout(() => html.classList.remove('theming'), 450);
  };

  const setTheme = useCallback((t) => { fade(); setThemeState(t); save(KEY_THEME, t); }, []);
  const setAccent = useCallback((a) => { fade(); setAccentState(a); save(KEY_ACCENT, a); }, []);

  return (
    <ThemeContext.Provider value={{ theme, accent, setTheme, setAccent, resolved: resolve(theme) }}>
      {children}
    </ThemeContext.Provider>
  );}