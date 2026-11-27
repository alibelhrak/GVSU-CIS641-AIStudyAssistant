import mongoose from 'mongoose';
import crypto from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { User, Course, Task, StudySession, StudyLog, Material, Recommendation, Conversation, Note, Folder, Feedback, PushSub, ReminderLog, Group, GroupMessage, Report, GroupMeeting, NoteVersion, NoteMessage, NoteComment, NoteSuggestion, Notification } from '../models/index.js';
import { unlink as unlinkZoom } from '../services/zoom.js';
import { deleteGroups } from './groups.js';
import { deleteForever } from '../services/trash.js';
import { config } from '../config.js';
import { h, HttpError } from '../middleware/error.js';
import { requireAuth, signToken, forgetSessions } from '../middleware/auth.js';
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
async function sendCode(user, lang, { to = user.email, change = false } = {}) {
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
      to,
      toName: user.name,
      subject: L('verifySubject', { code }),
      text: `${L('hi', { name: first })}\n\n${L(change ? 'verifyBodyChange' : 'verifyBody', { minutes: CODE_MINUTES })}\n\n${code}\n\n${L(change ? 'verifyIgnoreChange' : 'verifyIgnore')}`,
      html: `<div dir="${dirOf(lang)}" style="font-family:Arial,sans-serif;max-width:480px;margin:auto;color:#222">
  <h2 style="margin:0 0 12px">${esc(L('verifyTitle'))}</h2>
  <p>${esc(L('hi', { name: first }))}</p>
  <p>${esc(L(change ? 'verifyBodyChange' : 'verifyBody', { minutes: CODE_MINUTES }))}</p>
  <p dir="ltr" style="margin:24px 0;font-size:34px;font-weight:bold;letter-spacing:10px;font-family:Consolas,Menlo,monospace;background:#f2f5fc;border-radius:10px;padding:14px 0;text-align:center;color:#14204a">${code}</p>
  <p style="font-size:13px;color:#666">${esc(L(change ? 'verifyIgnoreChange' : 'verifyIgnore'))}</p>
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
  if (req.body?.acceptTerms !== true) throw new HttpError(400, 'Confirm that you are 13 or older and agree to the Terms of Service');
  let user = await User.findOne({ email });
  if (user && isVerified(user)) throw new HttpError(409, 'An account with that email already exists');
  const passwordHash = await bcrypt.hash(password, 10);
  if (user) {
    // Someone started signing up with this email but never confirmed it: the person who
    // can read the inbox may start again, so a stranger can't block their address.
    user.name = name;
    user.passwordHash = passwordHash;
    user.language = langOf(req);
    user.termsAcceptedAt = new Date();
  } else {
    user = new User({ name, email, passwordHash, language: langOf(req), emailVerified: false, termsAcceptedAt: new Date() });
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
  res.json({ token: signToken(user.id, user.tokenVersion || 0), user });
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
  res.json({ token: signToken(user.id, user.tokenVersion || 0), user });
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
  user.tokenVersion = (user.tokenVersion || 0) + 1;   // a new password signs out every other device
  await user.save();
  forgetSessions(user.id);
  res.json({ token: signToken(user.id, user.tokenVersion || 0), user });
}));

// Who am I? (needs a token)
r.get('/me', requireAuth, h(async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) throw new HttpError(401, 'Account not found');
  res.json({ user });
}));

// Save account settings: name, app language, and look-and-feel preferences
const PREF_VALUES = {
  theme: ['system', 'light', 'dark', 'paper', 'midnight'],
  accent: ['blue', 'purple', 'green', 'orange', 'pink'],
  font: ['default', 'serif', 'mono', 'readable'],
  size: ['s', 'm', 'l', 'xl'],
  motion: ['system', 'reduce'],
  weekStart: ['mon', 'sun'],
  startPage: ['dashboard', 'chat', 'notes', 'schedule', 'tasks'],
  codeAI: ['on', 'off'],
  codeTheme: ['auto', 'github-dark', 'github-light', 'dracula', 'monokai', 'one-dark-pro', 'one-light', 'tokyo-night', 'nord', 'catppuccin-mocha', 'catppuccin-latte', 'night-owl', 'solarized-dark', 'solarized-light', 'rose-pine', 'ayu-dark'],
};
r.patch('/me', requireAuth, h(async (req, res) => {
  const { language, name, prefs, avatar } = req.body || {};
  const set = {};
  if (language !== undefined) {
    if (!isLang(language)) throw new HttpError(400, 'Unknown language');
    set.language = language;
  }
  if (name !== undefined) {
    const clean = typeof name === 'string' ? name.replace(/\s+/g, ' ').trim() : '';
    if (!clean || clean.length > 80) throw new HttpError(400, 'Enter a name (up to 80 characters)');
    set.name = clean;
  }
  if (avatar !== undefined) {
    // A small square picture made in the browser (about 256 px), or '' to remove it
    const ok = avatar === '' || (typeof avatar === 'string' && avatar.length <= 120_000
      && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(avatar));
    if (!ok) throw new HttpError(400, 'That picture is too big or not a picture. Try a JPG or PNG.');
    set.avatar = avatar;
  }
  if (prefs !== undefined) {
    if (!prefs || typeof prefs !== 'object') throw new HttpError(400, 'Invalid preferences');
    for (const [k, v] of Object.entries(prefs)) {
      if (PREF_VALUES[k]?.includes(v)) set[`prefs.${k}`] = v;
    }
  }
  const user = await User.findByIdAndUpdate(req.userId, { $set: set }, { returnDocument: 'after', runValidators: true });
  if (!user) throw new HttpError(401, 'Account not found');
  res.json({ user });
}));

const checkPassword = async (user, password) => {
  if (typeof password !== 'string' || !(await bcrypt.compare(password, user.passwordHash))) throw new HttpError(401, 'Password is incorrect');
};

// Change the password. Other devices are signed out; this one gets a fresh token.
r.post('/password', requireAuth, h(async (req, res) => {
  const { current, next } = req.body || {};
  const user = await User.findById(req.userId);
  if (!user) throw new HttpError(401, 'Account not found');
  await checkPassword(user, current);
  if (typeof next !== 'string' || next.length < 8) throw new HttpError(400, 'Password must be at least 8 characters');
  if (await bcrypt.compare(next, user.passwordHash)) throw new HttpError(400, 'Choose a password you have not used here before');
  user.passwordHash = await bcrypt.hash(next, 10);
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  await user.save();
  forgetSessions(user.id);
  res.json({ token: signToken(user.id, user.tokenVersion), user });
}));

// Sign out of every other device (this one stays signed in)
r.post('/logout-all', requireAuth, h(async (req, res) => {
  const user = await User.findByIdAndUpdate(req.userId, { $inc: { tokenVersion: 1 } }, { returnDocument: 'after' });
  if (!user) throw new HttpError(401, 'Account not found');
  forgetSessions(user.id);
  res.json({ token: signToken(user.id, user.tokenVersion), user });
}));

// Change email, step 1: password + new address; a code goes to the new address
r.post('/email/start', requireAuth, h(async (req, res) => {
  const email = cleanEmail(req.body?.email);
  const user = await User.findById(req.userId);
  if (!user) throw new HttpError(401, 'Account not found');
  await checkPassword(user, req.body?.password);
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, 'Enter a valid email address');
  if (email === user.email) throw new HttpError(400, 'This is already your email');
  const other = await User.findOne({ email });
  if (other && isVerified(other)) throw new HttpError(409, 'An account with that email already exists');
  user.pendingEmail = email;
  user.verifySentAt = undefined;   // a new address may get a code right away (the hourly limit still applies)
  const sent = await sendCode(user, langOf(req), { to: email, change: true });
  if (!sent) {
    await user.save();
    throw new HttpError(429, `Please wait ${waitFor(user)} seconds before asking for another code.`, { wait: waitFor(user) });
  }
  res.json({ ok: true, email, wait: waitFor(user) });
}));

// Change email, step 2: the code from the new inbox
r.post('/email/confirm', requireAuth, h(async (req, res) => {
  const code = String(req.body?.code || '').replace(/\D/g, '');
  const user = await User.findById(req.userId);
  if (!user) throw new HttpError(401, 'Account not found');
  if (!user.pendingEmail || !user.verifyCodeHash || !user.verifyExpires || user.verifyExpires < new Date()) {
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
  const oldEmail = user.email;
  const taken = await User.findOne({ email: user.pendingEmail, _id: { $ne: user._id } });
  if (taken && isVerified(taken)) throw new HttpError(409, 'An account with that email already exists');
  if (taken) await User.deleteOne({ _id: taken._id });   // an unconfirmed sign-up with that address
  user.email = user.pendingEmail;
  for (const k of ['pendingEmail', 'verifyCodeHash', 'verifyExpires', 'verifySentAt', 'verifySends']) user[k] = undefined;
  user.verifyAttempts = 0;
  await user.save();
  // Tell the old address, in case this was not the owner
  const lang = user.language || 'en';
  const L = (key, values) => tr(key, lang, values);
  sendMail({
    to: oldEmail, toName: user.name, subject: L('emailChangedSubject'),
    text: `${L('hi', { name: user.name.split(' ')[0] })}\n\n${L('emailChangedBody', { email: user.email })}`,
    html: `<div dir="${dirOf(lang)}" style="font-family:Arial,sans-serif;max-width:480px;margin:auto;color:#222"><p>${esc(L('hi', { name: user.name.split(' ')[0] }))}</p><p>${esc(L('emailChangedBody', { email: user.email }))}</p></div>`,
  }).catch((err) => console.error('Email-changed notice failed:', err.message));
  res.json({ user });
}));

// Download everything the account holds, as one JSON file
r.get('/me/export', requireAuth, h(async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) throw new HttpError(401, 'Account not found');
  const mine = { user: user._id };
  const [courses, tasks, sessions, logs, materials, notes, folders, conversations, recommendations] = await Promise.all(
    [Course, Task, StudySession, StudyLog, Material, Note, Folder, Conversation, Recommendation].map((M) => M.find(mine)),
  );
  const data = {
    exportedAt: new Date().toISOString(),
    app: 'StudyPilot (AI Study Assistant)',
    account: { name: user.name, email: user.email, language: user.language, createdAt: user.createdAt, reminders: user.reminders, prefs: user.prefs },
    courses, tasks, sessions, studyLogs: logs, materials, notes, folders, conversations, recommendations,
  };
  const day = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Disposition', `attachment; filename="studypilot-export-${day}.json"`);
  res.type('application/json').send(JSON.stringify(data, null, 2));
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
  await deleteForever(mine);   // the Trash and its files
  // Collaboration: groups they own go away; they leave the others and every page shared with them
  await deleteGroups((await Group.find({ owner: req.userId }).select('_id').lean()).map((g) => g._id));
  const me = new mongoose.Types.ObjectId(String(req.userId));
  await Group.updateMany({ 'members.user': me }, { $pull: { members: { user: me } } });
  await Group.updateMany({ 'invites.user': me }, { $pull: { invites: { user: me } } }).catch(() => {});   // invitations they never answered
  await GroupMessage.deleteMany({ user: me });
  await NoteMessage.deleteMany({ user: me });
  const myNotes = (await Note.find(mine).select('_id').lean()).map((n) => n._id);
  await NoteVersion.deleteMany({ note: { $in: myNotes } });
  await NoteMessage.deleteMany({ note: { $in: myNotes } });
  await NoteComment.deleteMany({ note: { $in: myNotes } });
  await NoteSuggestion.deleteMany({ $or: [{ note: { $in: myNotes } }, { user: me }] });
  await NoteComment.updateMany({ 'messages.user': me }, { $pull: { messages: { user: me } } }).catch(() => {});   // their comments on other people's pages
  await NoteComment.deleteMany({ messages: { $size: 0 } }).catch(() => {});
  await Notification.deleteMany({ $or: [{ user: me }, { actor: me }] });
  await GroupMeeting.deleteMany({ createdBy: me });
  await unlinkZoom(me).catch(() => {});   // revoke StudyPilot's access to their Zoom account
  await Report.updateMany({ reporter: me }, { $set: { reporter: null } });   // reports stay for review, without the name of who sent them
  await Note.updateMany({ 'shares.user': me }, { $pull: { shares: { user: me } } });
  await Promise.all([Course, Task, StudySession, StudyLog, Material, Recommendation, Conversation, Note, Folder, Feedback, PushSub, ReminderLog]
    .map((M) => M.deleteMany(mine)));
  await User.deleteOne({ _id: user._id });
  forgetSessions(user.id);
  res.json({ ok: true });
}));

export default r;
