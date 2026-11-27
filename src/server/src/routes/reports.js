/**
 * Reports of harmful content (Microsoft Store policy 11.12, Google Play user-generated content policy).
 *
 * Anyone can report a page shared to the web; signed-in students can report a page shared with them
 * or a message in one of their study groups. Each report is saved and emailed to the moderator
 * (REPORT_EMAIL, or MAIL_FROM). The email has a signed link to a page where the moderator can take
 * the content down in one click: a page is unshared (it stays with its owner, but nobody else can open it),
 * a message is deleted.
 */
import crypto from 'node:crypto';
import express, { Router } from 'express';
import { config } from '../config.js';
import { Group, GroupMessage, Note, NoteMessage, Report, REPORT_REASONS, User } from '../models/index.js';
import { h, HttpError } from '../middleware/error.js';
import { userFromToken } from '../middleware/auth.js';
import { roleOn } from '../services/access.js';
import { sendMail } from '../services/mailer.js';
import { closeRoom } from '../services/collab.js';

const r = Router();
const MAX_PER_HOUR = 10;
const REASON_NAMES = {
  harassment: 'Harassment or bullying', hate: 'Hate speech', sexual: 'Sexual content', violence: 'Violence or threats',
  spam: 'Spam or scam', privacy: 'Someone\'s private information', cheating: 'Cheating (sharing exam answers)', other: 'Something else',
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const signature = (id) => crypto.createHmac('sha256', config.jwtSecret).update(`moderate:${id}`).digest('hex').slice(0, 32);
const sameSig = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

// At most 10 reports an hour from one account (or one address, without an account)
const recent = new Map();
function tooMany(key) {
  const now = Date.now();
  const list = (recent.get(key) || []).filter((t) => now - t < 3600_000);
  if (list.length >= MAX_PER_HOUR) return true;
  list.push(now); recent.set(key, list);
  if (recent.size > 5000) recent.clear();
  return false;
}

async function optionalUser(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? userFromToken(header.slice(7)) : null;
}

const who = (u) => (u ? `${u.name} <${u.email}>` : 'someone without an account (public link)');

async function emailModerator(report) {
  if (!config.reportEmail) { console.warn(`New report ${report._id} (no REPORT_EMAIL or MAIL_FROM set to email it)`); return; }
  const [author, reporter, group] = await Promise.all([
    report.author ? User.findById(report.author).select('name email').lean() : null,
    report.reporter ? User.findById(report.reporter).select('name email').lean() : null,
    report.group ? Group.findById(report.group).select('name').lean() : null,
  ]);
  const what = report.kind === 'page' ? 'a shared note page' : report.kind === 'note_message' ? 'a message in a shared page\'s chat' : `a message in the study group "${group?.name || '?'}"`;
  const link = `${config.appUrl}/api/reports/${report._id}/moderate?sig=${signature(report._id)}`;
  const rows = [
    ['Reported', what],
    ['Reason', REASON_NAMES[report.reason]],
    ['Details', report.details || '(none)'],
    ['Written by', who(author)],
    ['Reported by', who(reporter)],
    ['Report id', String(report._id)],
  ];
  const subject = `[StudyPilot report] ${REASON_NAMES[report.reason]}: ${what}`;
  const html = `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#37352f;background:#f7f7f5;padding:24px">
  <div style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #e9e9e7;border-radius:12px;padding:24px">
    <h2 style="margin:0 0 14px;font-size:19px">New report: ${esc(REASON_NAMES[report.reason])}</h2>
    <table style="border-collapse:collapse;font-size:14px;width:100%">${rows.map(([k, v]) => `<tr><td style="padding:6px 10px 6px 0;color:#787774;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:6px 0">${esc(v)}</td></tr>`).join('')}</table>
    <p style="margin:18px 0 6px;font-size:13px;color:#787774">What it said when it was reported:</p>
    <pre style="white-space:pre-wrap;font-family:inherit;font-size:14px;background:#fbfbfa;border:1px solid #e9e9e7;border-radius:8px;padding:12px;margin:0;max-height:none">${esc(report.snapshot || '(empty)')}</pre>
    <p style="margin:22px 0 6px"><a href="${link}" style="display:inline-block;background:#e03e3e;color:#fff;text-decoration:none;font-weight:600;padding:10px 16px;border-radius:8px">Review and take it down</a></p>
    <p style="font-size:12px;color:#9b9a97">The button opens a page where you confirm. Nothing is removed until you click there.</p>
  </div></body></html>`;
  const text = [subject, '', ...rows.map(([k, v]) => `${k}: ${v}`), '', 'What it said:', report.snapshot || '(empty)', '', `Review and take it down: ${link}`].join('\n');
  await sendMail({ to: config.reportEmail, subject, text, html });
}

// ---------- Send a report ----------
r.post('/', h(async (req, res) => {
  const userId = await optionalUser(req);
  const { kind, id } = req.body || {};
  const reason = REPORT_REASONS.includes(req.body?.reason) ? req.body.reason : null;
  if (!reason) throw new HttpError(400, 'Choose a reason');
  const details = typeof req.body?.details === 'string' ? req.body.details.trim().slice(0, 1000) : '';
  const target = String(id || '');
  const report = { reason, details, reporter: userId || null };

  if (kind === 'public') {
    if (!/^[A-Za-z0-9_-]{10,40}$/.test(target)) throw new HttpError(404, 'This page is not shared (anymore)');
    const note = await Note.findOne({ publicId: target }).select('title text markdown user').lean();
    if (!note) throw new HttpError(404, 'This page is not shared (anymore)');
    Object.assign(report, { kind: 'page', via: 'public', note: note._id, author: note.user, snapshot: `${note.title || 'Untitled'}\n\n${note.text || note.markdown || ''}` });
  } else if (kind === 'page' || kind === 'message' || kind === 'note_message') {
    if (!userId) throw new HttpError(401, 'Sign in required');
    if (!/^[a-f0-9]{24}$/.test(target)) throw new HttpError(404, 'Not found');
    if (kind === 'page') {
      const note = await Note.findById(target).select('title text markdown user shares groups');
      const role = await roleOn(note, userId);
      if (!role) throw new HttpError(404, 'Note not found');
      if (role === 'owner') throw new HttpError(400, 'This is your own page');
      Object.assign(report, { kind: 'page', note: note._id, author: note.user, snapshot: `${note.title || 'Untitled'}\n\n${note.text || note.markdown || ''}` });
    } else if (kind === 'note_message') {
      const msg = await NoteMessage.findById(target).lean();
      const note = msg && await Note.findById(msg.note).select('title user shares groups');
      if (!msg || !(await roleOn(note, userId))) throw new HttpError(404, 'Message not found');
      if (String(msg.user) === String(userId)) throw new HttpError(400, 'This is your own message');
      Object.assign(report, { kind: 'note_message', noteMessage: msg._id, note: note._id, author: msg.user, snapshot: msg.text });
    } else {
      const msg = await GroupMessage.findById(target).lean();
      if (!msg || !(await Group.exists({ _id: msg.group, 'members.user': userId }))) throw new HttpError(404, 'Message not found');
      if (String(msg.user) === String(userId)) throw new HttpError(400, 'This is your own message');
      Object.assign(report, { kind: 'message', message: msg._id, group: msg.group, author: msg.user, snapshot: msg.text });
    }
  } else {
    throw new HttpError(400, 'Unknown kind of report');
  }
  report.snapshot = report.snapshot.slice(0, 2500);

  // Render sits behind a proxy: without an account, count by the visitor's own address
  const ip = String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
  if (tooMany(userId || ip)) throw new HttpError(429, 'Too many reports. Try again later.');
  // The same person reporting the same thing again within a day: no second email
  const target2 = report.kind === 'page' ? { note: report.note } : report.kind === 'note_message' ? { noteMessage: report.noteMessage } : { message: report.message };
  const dup = userId && await Report.exists({ reporter: userId, ...target2, createdAt: { $gt: new Date(Date.now() - 86400_000) } });
  if (!dup) {
    const saved = await Report.create(report);
    emailModerator(saved).catch((err) => console.warn('Report email failed:', err.message));
  }
  res.status(201).json({ ok: true });
}));

// ---------- The moderator's page (from the signed link in the report email) ----------
const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title></head>
<body style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#37352f;background:#f7f7f5;margin:0;padding:24px 16px">
<div style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #e9e9e7;border-radius:12px;padding:24px">${body}</div></body></html>`;

async function loadSigned(req) {
  const id = String(req.params.id || '');
  const sig = String(req.query.sig || req.body?.sig || '');
  if (!/^[a-f0-9]{24}$/.test(id) || !sameSig(sig, signature(id))) throw new HttpError(403, 'This link is not valid');
  const report = await Report.findById(id);
  if (!report) throw new HttpError(404, 'Report not found');
  return { report, sig };
}

r.get('/:id/moderate', h(async (req, res) => {
  const { report, sig } = await loadSigned(req);
  const what = report.kind === 'page'
    ? 'Taking it down <b>unshares the page</b>: everyone it was shared with and its study groups lose access, and its public link stops working. The owner keeps their page.'
    : 'Taking it down <b>deletes the message</b> from the group chat.';
  const done = report.status === 'removed';
  res.set('Cache-Control', 'no-store').type('html').send(page('Review report', `
    <h2 style="margin:0 0 6px">Report: ${esc(REASON_NAMES[report.reason])}</h2>
    <p style="color:#787774;margin:0 0 14px">${esc(report.createdAt.toISOString().slice(0, 16).replace('T', ' '))} UTC · ${report.via === 'public' ? 'public link' : 'in the app'}</p>
    ${report.details ? `<p><b>Details:</b> ${esc(report.details)}</p>` : ''}
    <pre style="white-space:pre-wrap;font-family:inherit;background:#fbfbfa;border:1px solid #e9e9e7;border-radius:8px;padding:12px">${esc(report.snapshot || '(empty)')}</pre>
    ${done ? '<p style="color:#0f7b6c;font-weight:600">Already taken down.</p>' : `
    <p>${what}</p>
    <form method="post" action="/api/reports/${report._id}/moderate">
      <input type="hidden" name="sig" value="${sig}">
      <button type="submit" style="background:#e03e3e;color:#fff;border:0;border-radius:8px;padding:10px 16px;font-weight:600;font-size:15px;cursor:pointer">Take it down</button>
    </form>
    <p style="color:#9b9a97;font-size:13px">If it breaks no rule, just close this page.</p>`}`));
}));

r.post('/:id/moderate', express.urlencoded({ extended: false, limit: '2kb' }), h(async (req, res) => {
  const { report } = await loadSigned(req);
  if (report.status !== 'removed') {
    if (report.kind === 'page' && report.note) {
      await Note.updateOne({ _id: report.note }, { $set: { shares: [], groups: [] }, $unset: { publicId: 1 } });
      closeRoom(report.note);
    } else if (report.kind === 'message' && report.message) {
      await GroupMessage.deleteOne({ _id: report.message });
    } else if (report.kind === 'note_message' && report.noteMessage) {
      await NoteMessage.deleteOne({ _id: report.noteMessage });
    }
    report.status = 'removed';
    await report.save();
    // Close other open reports about the same thing
    await Report.updateMany({ status: 'open', ...(report.kind === 'note_message' ? { noteMessage: report.noteMessage } : report.note ? { note: report.note } : { message: report.message }) }, { $set: { status: 'removed' } });
  }
  res.type('html').send(page('Taken down', `<h2 style="margin:0 0 8px">Taken down</h2><p>${report.kind === 'page' ? 'The page is no longer shared with anyone, and its public link no longer works.' : 'The message was deleted.'}</p>`));
}));

export default r;
