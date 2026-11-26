/* Runs Python in the browser with Pyodide (real CPython compiled to WebAssembly). Loaded once, then reused. */
// Set VITE_PYODIDE_URL to host the files yourself (the default is the public CDN)
const PYODIDE = import.meta.env.VITE_PYODIDE_URL || 'https://cdn.jsdelivr.net/pyodide/v0.28.3/full/';
let py = null;

// Keep only the student's part of a Python error (not Pyodide's own frames)
function tidy(message) {
  const lines = String(message).split('\n');
  const start = lines.findIndex((l) => l.includes('File "<exec>"'));
  const kept = start >= 0 ? ['Traceback (most recent call last):', ...lines.slice(start)] : lines;
  return kept.join('\n').replace(/File "<exec>"/g, 'File "your code"').trim();
}

self.onmessage = async (event) => {
  const { id, code } = event.data;
  let out = '';
  try {
    if (!py) {
      self.postMessage({ id, status: 'loading' });
      const { loadPyodide } = await import(/* @vite-ignore */ `${PYODIDE}pyodide.mjs`);
      py = await loadPyodide({ indexURL: PYODIDE });
    }
    py.setStdout({ batched: (s) => { out += `${s}\n`; } });
    py.setStderr({ batched: (s) => { out += `${s}\n`; } });
    py.setStdin({ stdin: () => null });           // input() gets an empty answer
    // numpy, pandas, ... are downloaded the first time a program imports them
    await py.loadPackagesFromImports(code, { messageCallback: () => {}, errorCallback: () => {} });
    const globals = py.toPy({});                  // a fresh namespace for every run
    const value = await py.runPythonAsync(code, { globals });
    // Like a notebook: show the value of a last line that is just an expression
    if (value !== undefined && value !== null) {
      out += `${typeof value.toString === 'function' ? value.toString() : String(value)}\n`;
      value.destroy?.();
    }
    globals.destroy();
    self.postMessage({ id, output: out });
  } catch (err) {
    self.postMessage({ id, output: out, error: tidy(err?.message || err) });
  }
};
