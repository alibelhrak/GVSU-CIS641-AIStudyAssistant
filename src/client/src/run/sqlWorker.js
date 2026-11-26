/* Runs SQL in the browser with SQLite (sql.js). Every run starts with an empty database. */
import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

let SQL = null;
const cell = (v) => (v === null ? 'NULL' : v instanceof Uint8Array ? `<${v.length} bytes>` : String(v));

/** A plain-text table, like the sqlite3 command line */
function table({ columns, values }) {
  const rows = values.map((r) => r.map(cell));
  const widths = columns.map((c, i) => Math.min(40, Math.max(c.length, ...rows.map((r) => r[i].length))));
  const line = (cells) => cells.map((c, i) => c.slice(0, 40).padEnd(widths[i])).join(' | ').trimEnd();
  const sep = widths.map((w) => '-'.repeat(w)).join('-+-');
  return [line(columns), sep, ...rows.map(line), `(${rows.length} row${rows.length === 1 ? '' : 's'})`].join('\n');
}

self.onmessage = async (event) => {
  const { id, code } = event.data;
  try {
    SQL ??= await initSqlJs({ locateFile: () => wasmUrl });
    const db = new SQL.Database();
    try {
      const results = db.exec(code);
      const changed = db.getRowsModified();
      const parts = results.map(table);
      if (!parts.length) parts.push(changed ? `Done. ${changed} row${changed === 1 ? '' : 's'} changed.` : 'Done.');
      self.postMessage({ id, output: parts.join('\n\n') });
    } finally {
      db.close();
    }
  } catch (err) {
    self.postMessage({ id, output: '', error: `Error: ${err?.message || err}` });
  }
};
