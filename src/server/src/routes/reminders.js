/**
 * Reminders: the student's settings, the devices that get push notifications, a test button,
 * and two routes without login: the scheduler's /run and the email's one-click /unsubscribe.
 */
import crypto from 'node:crypto';
import { Router } from 'express';
import mongoose from 'mongoose';
import { config, mailEnabled, pushEnabled } from '../config.js';
import { User, PushSub } from '../models/index.js';
import { h, HttpError } from '../middleware/error.js';
import { tr, dirOf } from '../i18n.js';
import { runReminders, remindUser, sendPush, unsubscribeToken, validTimezone, pushWorks } from '../services/reminders.js';

const same = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

/* ---------- No login needed ---------- */
export const publicReminders = Router();

// The scheduler (GitHub Actions) calls this every 15 minutes with the CRON_SECRET
publicReminders.post('/run', h(async (req, res) => {
  const key = String(req.get('x-cron-secret') || '');
  if (!config.cronSecret || !same(key, config.cronSecret)) throw new HttpError(403, 'Wrong or missing cron secret');
  res.json({ ok: true, ...(await runReminders()) });
}));

// "Turn off reminder emails" link in every reminder email
publicReminders.get('/unsubscribe', h(async (req, res) => {
  const u = String(req.query.u || '');
  const t = String(req.query.t || '');
  const ok = mongoose.isValidObjectId(u) && t.length === 32 && same(t, unsubscribeToken(u));
  const user = ok ? await User.findByIdAndUpdate(u, { 'reminders.email': false }) : null;
  const lang = user?.language || 'en';
  const T = (k) => tr(k, lang);
  res.type('html').send(`<!doctype html><html lang="${lang}" dir="${dirOf(lang)}"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reminder emails</title>
  <body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f7f7f5;display:grid;place-items:center;min-height:100vh;margin:0">
  <div style="background:#fff;border:1px solid #e9e9e7;border-radius:14px;padding:28px;max-width:420px;text-align:center">
  <img src="/logo.png" width="48" height="48" alt=""><h2 style="color:#37352f">${ok ? T('unsubTitle') : T('badLink')}</h2>
  <p style="color:#787774">${ok ? T('unsubBody') : T('badLinkBody')}</p>
  <a href="${config.appUrl}/" style="display:inline-block;margin-top:8px;background:#2383e2;color:#fff;text-decoration:none;padding:10px 16px;border-radius:9px;font-weight:600">${T('open')}</a></div></body>`);
}));

/* ---------- Signed in ---------- */
const r = Router();
const KEYS = ['daily', 'deadlines', 'sessions', 'weekly', 'email', 'push'];

const settingsOf = async (user) => ({
  reminders: { ...KEYS.reduce((o, k) => ({ ...o, [k]: Boolean(user.reminders?.[k]) }), {}), hour: user.reminders?.hour ?? 7, timezone: user.reminders?.timezone || '' },
  mailReady: mailEnabled(),
  pushReady: pushWorks(),
  publicKey: config.push.publicKey,
  devices: await PushSub.countDocuments({ user: user._id }),
});

r.get('/settings', h(async (req, res) => {
  const user = await User.findById(req.userId);
  res.json(await settingsOf(user));
}));

r.put('/settings', h(async (req, res) => {
  const b = req.body || {};
  const set = {};
  for (const k of KEYS) if (typeof b[k] === 'boolean') set[`reminders.${k}`] = b[k];
  if (Number.isInteger(b.hour) && b.hour >= 0 && b.hour <= 23) set['reminders.hour'] = b.hour;
  if (typeof b.timezone === 'string' && validTimezone(b.timezone)) set['reminders.timezone'] = b.timezone.slice(0, 60);
  await User.updateOne({ _id: req.userId }, { $set: set });
  res.json(await settingsOf(await User.findById(req.userId)));
}));

// This browser or phone wants push notifications
r.post('/devices', h(async (req, res) => {
  const s = req.body?.subscription;
  if (!pushWorks()) throw new HttpError(503, 'Push notifications are not set up on the server yet (VAPID keys).');
  if (typeof s?.endpoint !== 'string' || !/^https:\/\//.test(s.endpoint) || !s.keys?.p256dh || !s.keys?.auth) throw new HttpError(400, 'Invalid push subscription');
  await PushSub.findOneAndUpdate({ endpoint: s.endpoint },
    { user: req.userId, endpoint: s.endpoint, keys: { p256dh: String(s.keys.p256dh), auth: String(s.keys.auth) }, device: String(req.body.device || '').slice(0, 120) },
    { upsert: true });
  res.status(201).json({ ok: true, devices: await PushSub.countDocuments({ user: req.userId }) });
}));

r.delete('/devices', h(async (req, res) => {
  await PushSub.deleteOne({ user: req.userId, endpoint: String(req.body?.endpoint || '') });
  res.json({ ok: true, devices: await PushSub.countDocuments({ user: req.userId }) });
}));

// "Send me a test": a morning summary email now, and a push to every device
r.post('/test', h(async (req, res) => {
  const user = await User.findById(req.userId);
  const out = { email: false, push: 0 };
  if (mailEnabled() && user.reminders?.email !== false) { await remindUser(user, new Date(), { force: 'daily' }); out.email = true; }
  out.push = await sendPush(user._id, { title: tr('testTitle', user.language), body: tr('testBody', user.language), url: '/', tag: 'test' });
  res.json(out);
}));

export default r;
