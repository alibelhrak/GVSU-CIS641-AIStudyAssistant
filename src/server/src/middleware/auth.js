import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { HttpError } from './error.js';
import { User } from '../models/index.js';

/**
 * Tokens carry the account's "session version". Changing the password or choosing
 * "Sign out of all other devices" raises the version, so every older token stops working.
 */
export const signToken = (userId, version = 0) => jwt.sign({ sub: String(userId), v: version }, config.jwtSecret, { expiresIn: '7d' });

// The version of each account, remembered for 30 seconds so most requests don't need the database
const versions = new Map();
async function versionOf(id) {
  const hit = versions.get(id);
  if (hit && Date.now() - hit.at < 30000) return hit.v;
  const user = await User.findById(id, 'tokenVersion').lean().catch(() => null);
  const v = user ? (user.tokenVersion || 0) : null;
  versions.set(id, { v, at: Date.now() });
  if (versions.size > 5000) versions.delete(versions.keys().next().value);
  return v;
}
/** Call after changing an account's version (or deleting it) */
export const forgetSessions = (id) => versions.delete(String(id));

/** Blocks the request unless it has a valid, current token. Sets req.userId. */
export async function requireAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(new HttpError(401, 'Sign in required'));
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    return next(new HttpError(401, 'Session expired. Sign in again'));
  }
  try {
    const v = await versionOf(payload.sub);
    if (v === null) return next(new HttpError(401, 'Account not found'));
    if ((payload.v || 0) !== v) return next(new HttpError(401, 'You were signed out. Sign in again'));
    req.userId = payload.sub;
    next();
  } catch (err) {
    next(err);
  }
}
