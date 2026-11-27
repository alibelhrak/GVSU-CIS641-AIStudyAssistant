/**
 * Linking a Zoom account.
 *  - publicZoom (no login): the OAuth callback Zoom sends the student back to, and Zoom's webhook
 *  - default (login): status, start linking, unlink
 */
import { Router } from 'express';
import { zoomEnabled } from '../config.js';
import { ZoomLink } from '../models/index.js';
import { h, HttpError } from '../middleware/error.js';
import { authorizeUrl, linkAccount, readState, unlink, validWebhook, webhookChallenge } from '../services/zoom.js';

export const publicZoom = Router();

// Zoom sends the student back here after they allow (or refuse) StudyPilot
publicZoom.get('/callback', h(async (req, res) => {
  let back = '/';
  try {
    const st = readState(req.query.state);
    back = st.back;
    if (req.query.error || !req.query.code) throw new Error('refused');
    await linkAccount(st.userId, String(req.query.code));
    res.redirect(`${back}${back.includes('?') ? '&' : '?'}zoom=linked`);
  } catch (err) {
    if (!(err.message === 'refused')) console.warn('Zoom link failed:', err.message);
    res.redirect(`${back}${back.includes('?') ? '&' : '?'}zoom=failed`);
  }
}));

// Zoom's events: the endpoint check, and "app deauthorized" (the student removed StudyPilot in Zoom)
publicZoom.post('/webhook', h(async (req, res) => {
  if (!validWebhook(req)) throw new HttpError(401, 'Bad signature');
  const { event, payload } = req.body || {};
  if (event === 'endpoint.url_validation') return res.json(webhookChallenge(payload?.plainToken));
  if (event === 'app_deauthorized' && payload?.user_id) await ZoomLink.deleteMany({ zoomUserId: String(payload.user_id) });
  res.json({ ok: true });
}));

const r = Router();

r.get('/status', h(async (req, res) => {
  const link = await ZoomLink.findOne({ user: req.userId }).select('email createdAt').lean();
  res.json({ enabled: zoomEnabled(), linked: Boolean(link), email: link?.email || '', since: link?.createdAt || null });
}));

// Start linking: the browser goes to the returned Zoom address
r.post('/link', h(async (req, res) => {
  const back = typeof req.body?.back === 'string' ? req.body.back.slice(0, 200) : '/';
  res.json({ url: authorizeUrl(req.userId, back) });
}));

r.delete('/link', h(async (req, res) => {
  await unlink(req.userId);
  res.json({ ok: true });
}));

export default r;
