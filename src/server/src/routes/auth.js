import crypto from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { User, Course, Task, StudySession, StudyLog, Material, Recommendation, Conversation, Note, Feedback, PushSub, ReminderLog } from '../models/index.js';
import { config } from '../config.js';
import { h, HttpError } from '../middleware/error.js';
import { requireAuth, signToken } from '../middleware/auth.js';
import { sendMail } from '../services/mailer.js';
import { tr, langOf, isLang, dirOf } from '../i18n.js';

const r = Router();
const RESET_MINUTES = 30;
// Only a fingerprint (SHA-256) of the reset code is saved, so a database leak can't be used to reset passwords
const fingerprint = (token) => crypto.createHash('sha256').update(token).digest('hex');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- Email verification ----------
// A new account must enter a 6-digit code sent to its email before it can be used,
// so nobody can sign up with someone else's address.
const CODE_MINUTES = 15;
const MAX_TRIES = 5;          // wrong codes before a new one is needed
const RESEND_SECONDS = 60;    // wait between two codes
const MAX_SENDS_HOUR = 5;     // codes per hour per account
const codePrint = (userId, code) => crypto.createHash('sha256').update(`${userId}:${code}`).digest('hex');
const isVerified = (u) => u.emailVerified !== false;   // older accounts have no value: verified
const cleanEmail = (e) => (typeof e === 'string' ? e.toLowerCase().trim() : '');
const needsCode = (email, ticket) => new HttpError(403, 'Enter the code we sent to your email to finish creating your account.', { needsVerification: true, email, ticket });
// The device that signed up (or proved the password) gets a private ticket. A code only works together
// with the newest ticket, so someone who re-registers the same email can't take over the owner's sign-up.
function newTicket(user) {
  const ticket = crypto.randomBytes(24).toString('hex');
  user.verifyTicketHash = fingerprint(ticket);
  return ticket;
}
const ticketOk = (user, ticket) => typeof ticket === 'string' && /^[a-f0-9]{48}$/.test(ticket)
  && !!user.verifyTicketHash && crypto.timingSafeEqual(Buffer.from(fingerprint(ticket)), Buffer.from(user.verifyTicketHash));

/** Seconds until another code may be sent (0 = now) */
function waitFor(user, now = Date.now()) {
  const last = user.verifySentAt ? user.verifySentAt.getTime() : 0;
  const cool = Math.ceil((last + RESEND_SECONDS * 1000 - now) / 1000);
  const recent = (user.verifySends || []).filter((d) => now - d.getTime() < 3600000);
  const hourly = recent.length >= MAX_SENDS_HOUR ? Math.ceil((recent[0].getTime() + 3600000 - now) / 1000) : 0;
  return Math.max(0, cool, hourly);
}

/** Make a new code, save its fingerprint, and email it. Returns false when it is too soon to send again. */
async function sendCode(user, lang) {
  if (waitFor(user) > 0) return false;
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const now = new Date();
  user.verifyCodeHash = codePrint(user.id, code);
  user.verifyExpires = new Date(now.getTime() + CODE_MINUTES * 60000);
  user.verifyAttempts = 0;
  user.verifySentAt = now;
  user.verifySends = [...(user.verifySends || []).filter((d) => now - d.getTime() < 3600000), now];
  await user.save();
  const L = (key, values) => tr(key, lang, values);
  const first = user.name.split(' ')[0];
  try {
    await sendMail({
      to: user.email,
      toName: user.name,
      subject: L('verifySubject', { code }),
      text: `${L('hi', { name: first })}\n\n${L('verifyBody', { minutes: CODE_MINUTES })}\n\n${code}\n\n${L('verifyIgnore')}`,
      html: `<div dir="${dirOf(lang)}" style="font-family:Arial,sans-serif;max-width:480px;margin:auto;color:#222">
  <h2 style="margin:0 0 12px">${esc(L('verifyTitle'))}</h2>
  <p>${esc(L('hi', { name: first }))}</p>
  <p>${esc(L('verifyBody', { minutes: CODE_MINUTES }))}</p>
  <p dir="ltr" style="margin:24px 0;font-size:34px;font-weight:bold;letter-spacing:10px;font-family:Consolas,Menlo,monospace;background:#f2f5fc;border-radius:10px;padding:14px 0;text-align:center;color:#14204a">${code}</p>
  <p style="font-size:13px;color:#666">${esc(L('verifyIgnore'))}</p>
</div>`,
    });
  } catch (err) {
    console.error('Verification email failed:', err.message);
  }
  return true;
}

// Create an account. It stays locked until the emailed code is entered.
r.post('/register', h(async (req, res) => {
  const { name, password } = req.body || {};
  const email = cleanEmail(req.body?.email);
  if (typeof password !== 'string' || password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters');
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, 'Enter a valid email address');
  let user = await User.findOne({ email });
  if (user && isVerified(user)) throw new HttpError(409, 'An account with that email already exists');
  const passwordHash = await bcrypt.hash(password, 10);
  if (user) {
    // Someone started signing up with this email but never confirmed it: the person who
    // can read the inbox may start again, so a stranger can't block their address.
    user.name = name;
    user.passwordHash = passwordHash;
    user.language = langOf(req);
  } else {
    user = new User({ name, email, passwordHash, language: langOf(req), emailVerified: false });
  }
  const ticket = newTicket(user);
  // A new sign-up gets a new code, so a code sent to an earlier attempt stops working
  user.verifyCodeHash = undefined;
  user.verifySentAt = undefined;
  await user.validate();
  const sent = await sendCode(user, langOf(req));
  if (!sent) await user.save();
  res.status(201).json({ needsVerification: true, email, ticket, wait: waitFor(user) });
}));

// Check the 6-digit code; on success the account is unlocked and signed in
r.post('/verify', h(async (req, res) => {
  const email = cleanEmail(req.body?.email);
  const code = String(req.body?.code || '').replace(/\D/g, '');
  const user = email ? await User.findOne({ email }) : null;
  if (!user || isVerified(user) || !ticketOk(user, req.body?.ticket)) {
    throw new HttpError(400, 'This sign-up has expired. Sign up or sign in again to get a new code.', { restart: true });
  }
  if (!user.verifyCodeHash || !user.verifyExpires || user.verifyExpires < new Date()) {
    throw new HttpError(400, 'This code has expired. Send a new code.', { expired: true });
  }
  const good = code.length === 6 && crypto.timingSafeEqual(Buffer.from(codePrint(user.id, code)), Buffer.from(user.verifyCodeHash));
  if (!good) {
    user.verifyAttempts = (user.verifyAttempts || 0) + 1;
    const left = MAX_TRIES - user.verifyAttempts;
    if (left <= 0) { user.verifyCodeHash = undefined; user.verifyExpires = undefined; }
    await user.save();
    throw left <= 0
      ? new HttpError(400, 'Too many wrong codes. Send a new code.', { expired: true })
      : new HttpError(400, `That code is not right. ${left} ${left === 1 ? 'try' : 'tries'} left.`, { left });
  }
  user.emailVerified = true;
  for (const k of ['verifyCodeHash', 'verifyTicketHash', 'verifyExpires', 'verifySentAt', 'verifySends']) user[k] = undefined;
  user.verifyAttempts = 0;
  await user.save();
  res.json({ token: signToken(user.id), user });
}));

// Send a new code (only for the device holding the sign-up ticket)
r.post('/resend-code', h(async (req, res) => {
  const email = cleanEmail(req.body?.email);
  const user = email ? await User.findOne({ email }) : null;
  if (!user || isVerified(user) || !ticketOk(user, req.body?.ticket)) {
    throw new HttpError(400, 'This sign-up has expired. Sign up or sign in again to get a new code.', { restart: true });
  }
  {
    const sent = await sendCode(user, req.get('x-lang') ? langOf(req) : (user.language || 'en'));
    if (!sent) {
      const wait = waitFor(user);
      throw new HttpError(429, `Please wait ${wait} seconds before asking for another code.`, { wait });
    }
    return res.json({ ok: true, wait: waitFor(user) });
  }
}));

// Log in
r.post('/login', h(async (req, res) => {
  const { password } = req.body || {};
  const email = cleanEmail(req.body?.email);
  const user = email ? await User.findOne({ email }) : null;
  const ok = user && typeof password === 'string' && (await bcrypt.compare(password, user.passwordHash));
  if (!ok) throw new HttpError(401, 'Email or password is incorrect');
  if (!isVerified(user)) {
    // Right password but the email was never confirmed: send a fresh code (if allowed) and ask for it
    const ticket = newTicket(user);
    if (!user.verifyExpires || user.verifyExpires < new Date()) await sendCode(user, langOf(req));
    await user.save();
    throw needsCode(user.email, ticket);
  }
  res.json({ token: signToken(user.id), user });
}));

// Forgot password: email a link that works for 30 minutes.
// The answer is always the same, so nobody can use this to find out who has an account.
r.post('/forgot', h(async (req, res) => {
  const { email } = req.body || {};
  if (typeof email !== 'string' || !/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, 'Enter a valid email address');
  const user = await User.findOne({ email: email.toLowerCase().trim() });

  // At most one email a minute per account
  const recent = user?.resetExpires && user.resetExpires.getTime() - Date.now() > (RESET_MINUTES - 1) * 60000;
  if (user && !recent) {
    const token = crypto.randomBytes(32).toString('hex');
    user.resetTokenHash = fingerprint(token);
    user.resetExpires = new Date(Date.now() + RESET_MINUTES * 60000);
    await user.save();

    const link = `${config.appUrl}/reset-password?token=${token}`;
    const first = user.name.split(' ')[0];
    // The language of the page the request came from, else the account's language
    const lang = req.get('x-lang') ? langOf(req) : (user.language || 'en');
    const L = (key, values) => tr(key, lang, values);
    const body = L('resetBody', { minutes: RESET_MINUTES });
    try {
      await sendMail({
        to: user.email,
        toName: user.name,
        subject: L('resetSubject'),
        text: `${L('hi', { name: first })}\n\n${body}\n\n${link}\n\n${L('resetIgnore')}`,
        html: `<div dir="${dirOf(lang)}" style="font-family:Arial,sans-serif;max-width:480px;margin:auto;color:#222">
  <h2 style="margin:0 0 12px">${esc(L('resetTitle'))}</h2>
  <p>${esc(L('hi', { name: first }))}</p>
  <p>${esc(body)}</p>
  <p style="margin:24px 0"><a href="${esc(link)}" style="background:#2b4fd8;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">${esc(L('resetButton'))}</a></p>
  <p style="font-size:13px;color:#666">${esc(L('resetCopy'))}<br><span dir="ltr">${esc(link)}</span></p>
  <p style="font-size:13px;color:#666">${esc(L('resetIgnore'))}</p>
</div>`,
      });
    } catch (err) {
      console.error('Password reset email failed:', err.message);
    }
  }
  res.json({ ok: true, message: 'If an account uses that email, a reset link is on its way.' });
}));

// Reset password with the code from the email, then sign the student in
r.post('/reset', h(async (req, res) => {
  const { token, password } = req.body || {};
  if (typeof password !== 'string' || password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters');
  const user = typeof token === 'string' && /^[a-f0-9]{64}$/.test(token)
    ? await User.findOne({ resetTokenHash: fingerprint(token), resetExpires: { $gt: new Date() } })
    : null;
  if (!user) throw new HttpError(400, 'This reset link is invalid or has expired. Ask for a new one.');
  user.passwordHash = await bcrypt.hash(password, 10);
  user.resetTokenHash = undefined;   // the link works only once
  user.resetExpires = undefined;
  user.emailVerified = true;         // the link came from the inbox, so the email is confirmed
  await user.save();
  res.json({ token: signToken(user.id), user });
}));

// Who am I? (needs a token)
r.get('/me', requireAuth, h(async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) throw new HttpError(401, 'Account not found');
  res.json({ user });
}));

// Save settings that belong to the account (now: the app language)
r.patch('/me', requireAuth, h(async (req, res) => {
  const { language } = req.body || {};
  if (!isLang(language)) throw new HttpError(400, 'Unknown language');
  const user = await User.findByIdAndUpdate(req.userId, { language }, { returnDocument: 'after' });
  if (!user) throw new HttpError(401, 'Account not found');
  res.json({ user });
}));

// Delete the account and everything in it (needs the password again)
r.delete('/me', requireAuth, h(async (req, res) => {
  const { password } = req.body || {};
  const user = await User.findById(req.userId);
  if (!user) throw new HttpError(401, 'Account not found');
  if (typeof password !== 'string' || !(await bcrypt.compare(password, user.passwordHash))) throw new HttpError(401, 'Password is incorrect');
  const files = await Material.find({ user: user._id, kind: 'file' }).lean();
  await Promise.all(files.map((m) => fs.rm(path.join(config.uploadDir, m.storedName), { force: true })));
  const mine = { user: user._id };
  await Promise.all([Course, Task, StudySession, StudyLog, Material, Recommendation, Conversation, Note, Feedback, PushSub, ReminderLog]
    .map((M) => M.deleteMany(mine)));
  await User.deleteOne({ _id: user._id });
  res.json({ ok: true });
}));

export default r;
