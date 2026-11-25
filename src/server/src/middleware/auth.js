import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { HttpError } from './error.js';

export const signToken = (userId) => jwt.sign({ sub: String(userId) }, config.jwtSecret, { expiresIn: '7d' });

/** Blocks the request unless it has a valid token. Sets req.userId. */
export function requireAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(new HttpError(401, 'Sign in required'));
  try {
    req.userId = jwt.verify(token, config.jwtSecret).sub;
    next();
  } catch {
    next(new HttpError(401, 'Session expired. Sign in again'));
  }
}
