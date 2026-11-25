import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { User } from '../models/index.js';
import { h, HttpError } from '../middleware/error.js';
import { requireAuth, signToken } from '../middleware/auth.js';

const r = Router();

// Create an account
r.post('/register', h(async (req, res) => {
  const { name, email, password } = req.body || {};
  if (typeof password !== 'string' || password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters');
  if (typeof email !== 'string' || !/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, 'Enter a valid email address');
  if (await User.exists({ email: email.toLowerCase().trim() })) throw new HttpError(409, 'An account with that email already exists');
  const user = await User.create({ name, email, passwordHash: await bcrypt.hash(password, 10) });
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

// Who am I? (needs a token)
r.get('/me', requireAuth, h(async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) throw new HttpError(401, 'Account not found');
  res.json({ user });
}));

export default r;