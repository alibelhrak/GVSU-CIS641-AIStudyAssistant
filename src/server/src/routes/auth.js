import crypto from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { User } from '../models/index.js';
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

// Create an account
r.post('/register', h(async (req, res) => {
  const { name, email, password } = req.body || {};
  if (typeof password !== 'string' || password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters');
  if (typeof email !== 'string' || !/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, 'Enter a valid email address');
  if (await User.exists({ email: email.toLowerCase().trim() })) throw new HttpError(409, 'An account with that email already exists');
  const user = await User.create({ name, email, passwordHash: await bcrypt.hash(password, 10), language: langOf(req) });
  res.status(201).json({ token: signToken(user.id), user });
}));

// Log in
r.post('/login', h(async (req, res) => {
  const { email, password } = req.body || {};
  const user = typeof email === 'string' ? await User.findOne({ email: email.toLowerCase().trim() }) : null;
  const ok = user && typeof password === 'string' && (await bcrypt.compare(password, user.passwordHash));
  if (!ok) throw new HttpError(401, 'Email or password is incorrect');
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

export default r;
