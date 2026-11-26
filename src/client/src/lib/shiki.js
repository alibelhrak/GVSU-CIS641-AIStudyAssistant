/**
 * Syntax highlighting for code blocks in Notes, with a choice of color themes.
 * Languages and themes are downloaded only when a note needs them.
 */
import { createBundledHighlighter } from '@shikijs/core';
import { createJavaScriptRegexEngine } from '@shikijs/engine-javascript';

// The same languages as BlockNote's code blocks (@blocknote/code-block)
const bundledLanguages = {
  c: () => import('@shikijs/langs-precompiled/c'),
  cpp: () => import('@shikijs/langs-precompiled/cpp'),
  'c++': () => import('@shikijs/langs-precompiled/cpp'),
  css: () => import('@shikijs/langs-precompiled/css'),
  glsl: () => import('@shikijs/langs-precompiled/glsl'),
  graphql: () => import('@shikijs/langs-precompiled/graphql'),
  gql: () => import('@shikijs/langs-precompiled/graphql'),
  haml: () => import('@shikijs/langs-precompiled/haml'),
  html: () => import('@shikijs/langs-precompiled/html'),
  java: () => import('@shikijs/langs-precompiled/java'),
  javascript: () => import('@shikijs/langs-precompiled/javascript'),
  js: () => import('@shikijs/langs-precompiled/javascript'),
  json: () => import('@shikijs/langs-precompiled/json'),
  jsonc: () => import('@shikijs/langs-precompiled/jsonc'),
  jsonl: () => import('@shikijs/langs-precompiled/jsonl'),
  jsx: () => import('@shikijs/langs-precompiled/jsx'),
  julia: () => import('@shikijs/langs-precompiled/julia'),
  jl: () => import('@shikijs/langs-precompiled/julia'),
  less: () => import('@shikijs/langs-precompiled/less'),
  markdown: () => import('@shikijs/langs-precompiled/markdown'),
  md: () => import('@shikijs/langs-precompiled/markdown'),
  mdx: () => import('@shikijs/langs-precompiled/mdx'),
  php: () => import('@shikijs/langs-precompiled/php'),
  postcss: () => import('@shikijs/langs-precompiled/postcss'),
  pug: () => import('@shikijs/langs-precompiled/pug'),
  jade: () => import('@shikijs/langs-precompiled/pug'),
  python: () => import('@shikijs/langs-precompiled/python'),
  py: () => import('@shikijs/langs-precompiled/python'),
  r: () => import('@shikijs/langs-precompiled/r'),
  regexp: () => import('@shikijs/langs-precompiled/regexp'),
  regex: () => import('@shikijs/langs-precompiled/regexp'),
  sass: () => import('@shikijs/langs-precompiled/sass'),
  scss: () => import('@shikijs/langs-precompiled/scss'),
  shellscript: () => import('@shikijs/langs-precompiled/shellscript'),
  bash: () => import('@shikijs/langs-precompiled/shellscript'),
  sh: () => import('@shikijs/langs-precompiled/shellscript'),
  shell: () => import('@shikijs/langs-precompiled/shellscript'),
  zsh: () => import('@shikijs/langs-precompiled/shellscript'),
  sql: () => import('@shikijs/langs-precompiled/sql'),
  svelte: () => import('@shikijs/langs-precompiled/svelte'),
  typescript: () => import('@shikijs/langs-precompiled/typescript'),
  ts: () => import('@shikijs/langs-precompiled/typescript'),
  vue: () => import('@shikijs/langs-precompiled/vue'),
  'vue-html': () => import('@shikijs/langs-precompiled/vue-html'),
  wasm: () => import('@shikijs/langs-precompiled/wasm'),
  wgsl: () => import('@shikijs/langs-precompiled/wgsl'),
  xml: () => import('@shikijs/langs-precompiled/xml'),
  yaml: () => import('@shikijs/langs-precompiled/yaml'),
  yml: () => import('@shikijs/langs-precompiled/yaml'),
  tsx: () => import('@shikijs/langs-precompiled/tsx'),
  typescriptreact: () => import('@shikijs/langs-precompiled/tsx'),
  haskell: () => import('@shikijs/langs-precompiled/haskell'),
  hs: () => import('@shikijs/langs-precompiled/haskell'),
  'c#': () => import('@shikijs/langs-precompiled/csharp'),
  csharp: () => import('@shikijs/langs-precompiled/csharp'),
  cs: () => import('@shikijs/langs-precompiled/csharp'),
  latex: () => import('@shikijs/langs-precompiled/latex'),
  lua: () => import('@shikijs/langs-precompiled/lua'),
  mermaid: () => import('@shikijs/langs-precompiled/mermaid'),
  mmd: () => import('@shikijs/langs-precompiled/mermaid'),
  ruby: () => import('@shikijs/langs-precompiled/ruby'),
  rb: () => import('@shikijs/langs-precompiled/ruby'),
  rust: () => import('@shikijs/langs-precompiled/rust'),
  rs: () => import('@shikijs/langs-precompiled/rust'),
  scala: () => import('@shikijs/langs-precompiled/scala'),
  swift: () => import('@shikijs/langs-precompiled/swift'),
  kotlin: () => import('@shikijs/langs-precompiled/kotlin'),
  kt: () => import('@shikijs/langs-precompiled/kotlin'),
  kts: () => import('@shikijs/langs-precompiled/kotlin'),
  'objective-c': () => import('@shikijs/langs-precompiled/objective-c'),
  objc: () => import('@shikijs/langs-precompiled/objective-c'),
};

/** Code themes the student can pick. bg/fg/k/s/f draw the small preview in the menus. */
export const CODE_THEMES = [
  { id: 'auto', label: 'Match the app', bg: '#f6f8fa', fg: '#24292e', k: '#d73a49', s: '#032f62', f: '#6f42c1' },
  { id: 'github-dark', label: 'GitHub Dark', bg: '#24292e', fg: '#e1e4e8', k: '#f97583', s: '#9ecbff', f: '#b392f0' },
  { id: 'github-light', label: 'GitHub Light', bg: '#ffffff', fg: '#24292e', k: '#d73a49', s: '#032f62', f: '#6f42c1' },
  { id: 'dracula', label: 'Dracula', bg: '#282a36', fg: '#f8f8f2', k: '#ff79c6', s: '#f1fa8c', f: '#50fa7b' },
  { id: 'monokai', label: 'Monokai', bg: '#272822', fg: '#f8f8f2', k: '#f92672', s: '#e6db74', f: '#a6e22e' },
  { id: 'one-dark-pro', label: 'One Dark Pro', bg: '#282c34', fg: '#abb2bf', k: '#c678dd', s: '#98c379', f: '#61afef' },
  { id: 'one-light', label: 'One Light', bg: '#fafafa', fg: '#383a42', k: '#a626a4', s: '#50a14f', f: '#4078f2' },
  { id: 'tokyo-night', label: 'Tokyo Night', bg: '#1a1b26', fg: '#a9b1d6', k: '#bb9af7', s: '#9ece6a', f: '#7aa2f7' },
  { id: 'nord', label: 'Nord', bg: '#2e3440', fg: '#d8dee9', k: '#81a1c1', s: '#a3be8c', f: '#88c0d0' },
  { id: 'catppuccin-mocha', label: 'Catppuccin Mocha', bg: '#1e1e2e', fg: '#cdd6f4', k: '#cba6f7', s: '#a6e3a1', f: '#89b4fa' },
  { id: 'catppuccin-latte', label: 'Catppuccin Latte', bg: '#eff1f5', fg: '#4c4f69', k: '#8839ef', s: '#40a02b', f: '#1e66f5' },
  { id: 'night-owl', label: 'Night Owl', bg: '#011627', fg: '#d6deeb', k: '#c792ea', s: '#ecc48d', f: '#82aaff' },
  { id: 'solarized-dark', label: 'Solarized Dark', bg: '#002b36', fg: '#839496', k: '#859900', s: '#2aa198', f: '#268bd2' },
  { id: 'solarized-light', label: 'Solarized Light', bg: '#fdf6e3', fg: '#657b83', k: '#859900', s: '#2aa198', f: '#268bd2' },
  { id: 'rose-pine', label: 'Rosé Pine', bg: '#191724', fg: '#e0def4', k: '#31748f', s: '#f6c177', f: '#ebbcba' },
  { id: 'ayu-dark', label: 'Ayu Dark', bg: '#0b0e14', fg: '#bfbdb6', k: '#ff8f40', s: '#aad94c', f: '#ffb454' },
];
export const codeThemeInfo = (id) => CODE_THEMES.find((t) => t.id === id) || CODE_THEMES[0];

const bundledThemes = {
  'github-dark': () => import('@shikijs/themes/github-dark'),
  'github-light': () => import('@shikijs/themes/github-light'),
  'dracula': () => import('@shikijs/themes/dracula'),
  'monokai': () => import('@shikijs/themes/monokai'),
  'one-dark-pro': () => import('@shikijs/themes/one-dark-pro'),
  'one-light': () => import('@shikijs/themes/one-light'),
  'tokyo-night': () => import('@shikijs/themes/tokyo-night'),
  'nord': () => import('@shikijs/themes/nord'),
  'catppuccin-mocha': () => import('@shikijs/themes/catppuccin-mocha'),
  'catppuccin-latte': () => import('@shikijs/themes/catppuccin-latte'),
  'night-owl': () => import('@shikijs/themes/night-owl'),
  'solarized-dark': () => import('@shikijs/themes/solarized-dark'),
  'solarized-light': () => import('@shikijs/themes/solarized-light'),
  'rose-pine': () => import('@shikijs/themes/rose-pine'),
  'ayu-dark': () => import('@shikijs/themes/ayu-dark'),
};

const createHighlighter = createBundledHighlighter({
  langs: bundledLanguages,
  themes: bundledThemes,
  engine: () => createJavaScriptRegexEngine(),
});

/**
 * A highlighter for one code theme. "auto" loads GitHub light + dark and the colors follow the app theme;
 * any other theme is used on its own, with its own background.
 */
export function highlighterFor(theme) {
  const themes = theme === 'auto' || !bundledThemes[theme] ? ['github-light', 'github-dark'] : [theme];
  return createHighlighter({ themes, langs: [] });
}
