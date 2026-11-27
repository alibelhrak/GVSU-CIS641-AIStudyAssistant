/**
 * Zoom: a student links their Zoom account once (OAuth), then can start or schedule meetings
 * for their study groups. Only the person who starts a meeting needs Zoom linked; the others
 * join with the meeting's link.
 *
 * Tokens are encrypted with AES-256-GCM (key from ZOOM_TOKEN_KEY, or derived from JWT_SECRET),
 * refreshed automatically, and removed when the student unlinks Zoom, deletes their account,
 * or removes the app from their Zoom account (the deauthorization webhook).
 */
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config, zoomEnabled } from '../config.js';
import { ZoomLink } from '../models/index.js';
import { HttpError } from '../middleware/error.js';

export const ZOOM_SCOPES = ['meeting:write:meeting', 'meeting:read:meeting', 'meeting:delete:meeting', 'user:read:user'];
const KEY = crypto.createHash('sha256').update(process.env.ZOOM_TOKEN_KEY || `zoom-tokens:${config.jwtSecret}`).digest();

export function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const data = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString('base64url')).join('.');
}
export function decrypt(box) {
  const [iv, tag, data] = String(box).split('.').map((s) => Buffer.from(s, 'base64url'));
  const d = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString('utf8');
}

export const redirectUri = () => `${config.appUrl}/api/zoom/callback`;
const basic = () => `Basic ${Buffer.from(`${config.zoom.clientId}:${config.zoom.clientSecret}`).toString('base64')}`;

/** The Zoom page where the student allows StudyPilot. `state` is signed so the answer can't be forged. */
export function authorizeUrl(userId, back = '/') {
  if (!zoomEnabled()) throw new HttpError(503, 'Zoom is not set up on this server yet');
  const state = jwt.sign({ sub: String(userId), back, k: 'zoom' }, config.jwtSecret, { expiresIn: '15m' });
  const q = new URLSearchParams({ response_type: 'code', client_id: config.zoom.clientId, redirect_uri: redirectUri(), state });
  return `${config.zoom.oauthUrl}/oauth/authorize?${q}`;
}
export function readState(state) {
  const p = jwt.verify(String(state || ''), config.jwtSecret);
  if (p.k !== 'zoom') throw new Error('wrong state');
  return { userId: p.sub, back: typeof p.back === 'string' && p.back.startsWith('/') && !p.back.startsWith('//') ? p.back : '/' };
}

async function tokenRequest(params) {
  const res = await fetch(`${config.zoom.oauthUrl}/oauth/token`, {
    method: 'POST',
    headers: { Authorization: basic(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new HttpError(502, `Zoom did not accept the request${data.reason ? `: ${data.reason}` : ''}`);
  return data;
}

/** After the student allowed StudyPilot on Zoom: save their (encrypted) tokens */
export async function linkAccount(userId, code) {
  const t = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri() });
  const me = await fetch(`${config.zoom.apiUrl}/users/me`, { headers: { Authorization: `Bearer ${t.access_token}` }, signal: AbortSignal.timeout(15000) })
    .then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  await ZoomLink.findOneAndUpdate({ user: userId }, {
    user: userId, zoomUserId: me.id || 'me', email: me.email || '',
    access: encrypt(t.access_token), refresh: encrypt(t.refresh_token), expiresAt: new Date(Date.now() + (t.expires_in || 3600) * 1000),
  }, { upsert: true, new: true, setDefaultsOnInsert: true });
  return me.email || '';
}

/** A valid access token for the student (refreshed when it is about to expire), or null when Zoom is not linked */
async function accessToken(userId) {
  const link = await ZoomLink.findOne({ user: userId });
  if (!link) return null;
  if (link.expiresAt.getTime() - Date.now() > 60_000) return decrypt(link.access);
  try {
    const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: decrypt(link.refresh) });
    link.access = encrypt(t.access_token);
    if (t.refresh_token) link.refresh = encrypt(t.refresh_token);
    link.expiresAt = new Date(Date.now() + (t.expires_in || 3600) * 1000);
    await link.save();
    return t.access_token;
  } catch {
    await ZoomLink.deleteOne({ _id: link._id });   // the student removed the app on Zoom, or the token is too old: link again
    return null;
  }
}

/** Calls the Zoom API as the student */
export async function zoomApi(userId, method, path, body) {
  const token = await accessToken(userId);
  if (!token) throw new HttpError(409, 'Link your Zoom account first', { zoom: 'not_linked' });
  const res = await fetch(`${config.zoom.apiUrl}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) { await ZoomLink.deleteOne({ user: userId }); throw new HttpError(409, 'Link your Zoom account again', { zoom: 'not_linked' }); }
    throw new HttpError(res.status === 404 ? 404 : 502, data.message ? `Zoom: ${data.message}` : 'Zoom did not answer. Try again.');
  }
  return data;
}

/** Unlink: revoke the token on Zoom (best effort) and forget it */
export async function unlink(userId) {
  const link = await ZoomLink.findOne({ user: userId });
  if (!link) return;
  try {
    await fetch(`${config.zoom.oauthUrl}/oauth/revoke`, {
      method: 'POST',
      headers: { Authorization: basic(), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: decrypt(link.access) }),
      signal: AbortSignal.timeout(10000),
    });
  } catch { /* forget it anyway */ }
  await ZoomLink.deleteOne({ _id: link._id });
}

/** Zoom signs its webhooks: v0=HMAC-SHA256(secret, "v0:{timestamp}:{body}") */
export function validWebhook(req) {
  const secret = config.zoom.webhookSecret;
  const ts = String(req.headers['x-zm-request-timestamp'] || '');
  const sig = String(req.headers['x-zm-signature'] || '');
  if (!secret || !ts || !sig || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const want = `v0=${crypto.createHmac('sha256', secret).update(`v0:${ts}:${req.rawBody || ''}`).digest('hex')}`;
  return want.length === sig.length && crypto.timingSafeEqual(Buffer.from(want), Buffer.from(sig));
}
export const webhookChallenge = (plainToken) => ({
  plainToken, encryptedToken: crypto.createHmac('sha256', config.zoom.webhookSecret).update(String(plainToken)).digest('hex'),
});
