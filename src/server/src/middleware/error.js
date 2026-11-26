export class HttpError extends Error {
  /** extra: more fields for the browser, e.g. { needsVerification: true } */
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

/** Wrap an async route so errors reach the error handler. */
export const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export const notFound = (_req, _res, next) => next(new HttpError(404, 'Not found'));

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  if (err.name === 'ValidationError') {
    const first = Object.values(err.errors)[0];
    return res.status(400).json({ error: first?.message || 'Invalid data' });
  }
  if (err.name === 'CastError') return res.status(400).json({ error: 'Invalid id or value' });
  if (err.code === 11000) return res.status(409).json({ error: 'That already exists' });
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File is larger than 20 MB' });
  const status = err.status || 500;
  const ours = err instanceof HttpError;   // our own messages are safe to show, even 502/503
  if (status >= 500 && !ours) console.error(err);
  res.status(status).json({ error: ours || status < 500 ? err.message : 'Server error', ...(ours ? err.extra : {}) });
}