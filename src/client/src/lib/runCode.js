/**
 * "Run" for code blocks in Notes. Everything runs in the student's own browser, never on the server:
 *   Python (Pyodide), JavaScript (a separate worker), SQL (SQLite), HTML (a sandboxed preview).
 * Each run is stopped after a time limit, so an endless loop can't freeze the page.
 */
import { t } from './i18n.jsx';

const KIND = { python: 'python', py: 'python', javascript: 'js', js: 'js', sql: 'sql', html: 'html' };
export const runKind = (language) => KIND[language] || null;
export const canRun = (language) => Boolean(runKind(language));
const MAX_OUT = 20000;

// ---- Workers ----
let pyWorker = null;
let sqlWorker = null;
const newPy = () => new Worker(new URL('../run/pyWorker.js', import.meta.url), { type: 'module' });
const newSql = () => new Worker(new URL('../run/sqlWorker.js', import.meta.url), { type: 'module' });

// JavaScript: a throwaway worker per run, with console.* captured
const JS_WORKER = `
const out = [];
// Values like Node prints them: short ones on one line ([1, 2, 3]), longer ones spread out
const flat = (x, seen) => {
  if (x === null || typeof x !== 'object') return typeof x === 'string' ? JSON.stringify(x) : typeof x === 'bigint' ? x + 'n' : String(x);
  if (seen.has(x)) return '[Circular]';
  seen.add(x);
  const r = Array.isArray(x) ? '[' + x.map((v) => flat(v, seen)).join(', ') + ']'
    : x instanceof Map ? 'Map(' + x.size + ')'
    : x instanceof Set ? 'Set(' + x.size + ') [' + [...x].map((v) => flat(v, seen)).join(', ') + ']'
    : '{ ' + Object.entries(x).map(([k, v]) => k + ': ' + flat(v, seen)).join(', ') + ' }';
  seen.delete(x);
  return r === '{  }' ? '{}' : r;
};
const show = (x) => {
  if (typeof x === 'string') return x;
  if (typeof x === 'function') return '[Function ' + (x.name || 'anonymous') + ']';
  if (x instanceof Error) return x.name + ': ' + x.message;
  try {
    const one = flat(x, new Set());
    return one.length <= 72 ? one : (JSON.stringify(x, null, 2) ?? one);
  } catch { return String(x); }
};
for (const k of ['log', 'info', 'debug', 'warn', 'error', 'table']) {
  console[k] = (...a) => out.push((k === 'error' ? 'Error: ' : k === 'warn' ? 'Warning: ' : '') + a.map(show).join(' '));
}
self.onmessage = async (e) => {
  try {
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    await new AsyncFunction(e.data.code)();
    self.postMessage({ id: e.data.id, output: out.join('\\n') });
  } catch (err) {
    self.postMessage({ id: e.data.id, output: out.join('\\n'), error: (err && err.name ? err.name + ': ' : '') + (err && err.message ? err.message : String(err)) });
  }
};`;

let seq = 0;
function ask(worker, code, limitMs, onStatus) {
  const id = ++seq;
  return new Promise((resolve) => {
    const done = (res) => { clearTimeout(timer); worker.removeEventListener('message', got); worker.removeEventListener('error', crash); resolve(res); };
    const crash = (e) => done({ error: `Error: ${e.message || 'the runner crashed'}` });
    const got = (e) => {
      if (e.data.id !== id) return;
      if (e.data.status) { onStatus?.(e.data.status); return; }
      done(e.data);
    };
    const timer = setTimeout(() => done({ timeout: true }), limitMs);
    worker.addEventListener('message', got);
    worker.addEventListener('error', crash);
    worker.postMessage({ id, code });
  });
}

/**
 * Run code. Returns { text } for the Output block, or { html } for an HTML preview.
 * onStatus('loading') is called while Python downloads the first time.
 */
export async function runCode(language, code, { onStatus } = {}) {
  const kind = runKind(language);
  const started = performance.now();
  let res;
  if (kind === 'html') return { html: code };
  if (kind === 'js') {
    const url = URL.createObjectURL(new Blob([JS_WORKER], { type: 'text/javascript' }));
    const w = new Worker(url);
    res = await ask(w, code, 10000);
    w.terminate(); URL.revokeObjectURL(url);
    if (res.timeout) res = { error: t('Stopped after {n} s. Is there an endless loop?', { n: 10 }) };
  } else if (kind === 'sql') {
    sqlWorker ??= newSql();
    res = await ask(sqlWorker, code, 10000);
    if (res.timeout) { sqlWorker.terminate(); sqlWorker = null; res = { error: t('Stopped after {n} s.', { n: 10 }) }; }
  } else if (kind === 'python') {
    const first = !pyWorker;
    pyWorker ??= newPy();
    res = await ask(pyWorker, code, first ? 90000 : 20000, onStatus);
    if (res.timeout) {
      pyWorker.terminate(); pyWorker = null;
      res = { error: first ? t('Python could not start. Check your internet connection and try again.') : t('Stopped after {n} s. Is there an endless loop?', { n: 20 }) };
    }
  } else {
    return { text: t('This language cannot run here yet.') };
  }
  const ms = performance.now() - started;
  let text = [res.output?.replace(/\n+$/, ''), res.error].filter(Boolean).join('\n') || t('(no output)');
  if (text.length > MAX_OUT) text = `${text.slice(0, MAX_OUT)}\n… ${t('(output cut at {n} characters)', { n: MAX_OUT })}`;
  return { text, error: Boolean(res.error), ms };
}
