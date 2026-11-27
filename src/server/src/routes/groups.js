/**
 * Study groups: a few students who share deadlines, note pages and a chat.
 * Only people who already have an account can be added (by email).
 * The owner can rename or delete the group and remove members; any member can invite and leave.
 */
import { Router } from 'express';
import mongoose from 'mongoose';
import { Group, GroupMeeting, GroupMessage, GroupTask, Note, User, TASK_TYPES } from '../models/index.js';
import { notifyGroupAdded, notifyMeeting, notifyMeetingCancelled } from '../services/invites.js';
import { calendarLinks, meetingIcs } from '../services/calendar.js';
import { zoomApi } from '../services/zoom.js';
import { zoomEnabled } from '../config.js';
import { h, HttpError } from '../middleware/error.js';

const r = Router();
const MAX_GROUPS = 20;
const MAX_MEMBERS = 50;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const COLOR = /^#[0-9a-f]{6}$/i;

const cleanName = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, 60) : '');

/** The group, if this student is a member (404 otherwise) */
async function memberOf(req) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Group not found');
  const group = await Group.findOne({ _id: req.params.id, 'members.user': req.userId });
  if (!group) throw new HttpError(404, 'Group not found');
  return group;
}
const isOwner = (group, userId) => String(group.owner) === String(userId);

async function view(group, userId) {
  const people = await User.find({ _id: { $in: group.members.map((m) => m.user) } }).select('name email avatar').lean();
  const byId = new Map(people.map((u) => [String(u._id), u]));
  return {
    id: String(group._id), name: group.name, description: group.description, color: group.color,
    mine: isOwner(group, userId), createdAt: group.createdAt,
    members: group.members.filter((m) => byId.has(String(m.user))).map((m) => {
      const u = byId.get(String(m.user));
      return { id: String(u._id), name: u.name, email: u.email, avatar: u.avatar || '', role: m.role, me: String(u._id) === String(userId) };
    }),
  };
}

async function findUser(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new HttpError(400, 'Enter an email address');
  const user = await User.findOne({ email: e }).select('_id emailVerified').lean();
  if (!user || user.emailVerified === false) throw new HttpError(404, `No account uses ${e} yet. Ask them to sign up first, then add them.`);
  return user;
}

// ---------- Groups ----------
r.get('/', h(async (req, res) => {
  const groups = await Group.find({ 'members.user': req.userId }).sort({ updatedAt: -1 }).lean();
  const ids = groups.map((g) => g._id);
  // plain queries (no aggregation), so it works on every MongoDB-compatible database
  const [tasks, pages, last] = await Promise.all([
    GroupTask.find({ group: { $in: ids }, done: false }).select('group dueDate').lean(),
    Note.find({ groups: { $in: ids } }).select('groups').lean(),
    Promise.all(ids.map((id) => GroupMessage.findOne({ group: id }).sort({ createdAt: -1 }).select('group text createdAt').lean())),
  ]);
  const t = new Map(); const p = new Map(); const l = new Map();
  for (const x of tasks) {
    const k = String(x.group); const cur = t.get(k) || { n: 0, next: null };
    t.set(k, { n: cur.n + 1, next: !cur.next || x.dueDate < cur.next ? x.dueDate : cur.next });
  }
  for (const n of pages) for (const g of n.groups) p.set(String(g), { n: (p.get(String(g))?.n || 0) + 1 });
  for (const m of last) if (m) l.set(String(m.group), { at: m.createdAt, text: m.text });
  res.json(groups.map((g) => ({
    id: String(g._id), name: g.name, description: g.description, color: g.color, mine: isOwner(g, req.userId),
    members: g.members.length, openTasks: t.get(String(g._id))?.n || 0, nextDue: t.get(String(g._id))?.next || null,
    pages: p.get(String(g._id))?.n || 0, lastMessage: l.get(String(g._id)) ? { at: l.get(String(g._id)).at, text: l.get(String(g._id)).text.slice(0, 120) } : null,
  })));
}));

r.post('/', h(async (req, res) => {
  const name = cleanName(req.body?.name);
  if (!name) throw new HttpError(400, 'Name the group');
  if (await Group.countDocuments({ 'members.user': req.userId }) >= MAX_GROUPS) throw new HttpError(400, `You can be in up to ${MAX_GROUPS} groups`);
  const group = await Group.create({
    name, owner: req.userId,
    description: typeof req.body?.description === 'string' ? req.body.description.trim().slice(0, 300) : '',
    color: COLOR.test(req.body?.color || '') ? req.body.color : '#2383e2',
    members: [{ user: req.userId, role: 'owner' }],
  });
  res.status(201).json(await view(group, req.userId));
}));

r.get('/:id', h(async (req, res) => {
  const group = await memberOf(req);
  const [tasks, pages] = await Promise.all([
    GroupTask.find({ group: group._id }).sort({ done: 1, dueDate: 1 }).lean(),
    Note.find({ groups: group._id }).select('title icon updatedAt user').sort({ updatedAt: -1 }).lean(),
  ]);
  const names = new Map((await User.find({ _id: { $in: [...pages.map((n) => n.user), ...tasks.map((t) => t.createdBy)] } }).select('name').lean()).map((u) => [String(u._id), u.name]));
  res.json({
    ...(await view(group, req.userId)),
    tasks: tasks.map((t) => ({ id: String(t._id), title: t.title, type: t.type, dueDate: t.dueDate, done: t.done, by: names.get(String(t.createdBy)) || '' })),
    pages: pages.map((n) => ({ id: String(n._id), title: n.title, icon: n.icon, updatedAt: n.updatedAt, owner: names.get(String(n.user)) || '', mine: String(n.user) === String(req.userId) })),
  });
}));

r.patch('/:id', h(async (req, res) => {
  const group = await memberOf(req);
  if (!isOwner(group, req.userId)) throw new HttpError(403, 'Only the group owner can change it');
  if (req.body?.name !== undefined) {
    const name = cleanName(req.body.name);
    if (!name) throw new HttpError(400, 'Name the group');
    group.name = name;
  }
  if (typeof req.body?.description === 'string') group.description = req.body.description.trim().slice(0, 300);
  if (COLOR.test(req.body?.color || '')) group.color = req.body.color;
  await group.save();
  res.json(await view(group, req.userId));
}));

r.delete('/:id', h(async (req, res) => {
  const group = await memberOf(req);
  if (!isOwner(group, req.userId)) throw new HttpError(403, 'Only the group owner can delete it');
  await deleteGroups([group._id]);
  res.json({ ok: true });
}));

/** Removes groups with their chat and deadlines; shared pages stay with their owners */
export async function deleteGroups(ids) {
  if (!ids.length) return;
  await Promise.all([
    GroupMessage.deleteMany({ group: { $in: ids } }),
    GroupTask.deleteMany({ group: { $in: ids } }),
    GroupMeeting.deleteMany({ group: { $in: ids } }),
    (async () => {   // forget the groups on the pages shared with them
      const gone = new Set(ids.map(String));
      for (const n of await Note.find({ groups: { $in: ids } }).select('groups').lean()) {
        await Note.updateOne({ _id: n._id }, { $set: { groups: n.groups.filter((g) => !gone.has(String(g))) } });
      }
    })(),
    Group.deleteMany({ _id: { $in: ids } }),
  ]);
}

// ---------- Members ----------
r.post('/:id/members', h(async (req, res) => {
  const group = await memberOf(req);
  const user = await findUser(req.body?.email);
  if (group.members.some((m) => String(m.user) === String(user._id))) throw new HttpError(400, 'Already in this group');
  if (group.members.length >= MAX_MEMBERS) throw new HttpError(400, `A group can have up to ${MAX_MEMBERS} members`);
  if (await Group.countDocuments({ 'members.user': user._id }) >= MAX_GROUPS) throw new HttpError(400, 'They are already in too many groups');
  group.members.push({ user: user._id, role: 'member' });
  await group.save();
  notifyGroupAdded({ toId: user._id, fromId: req.userId, group });   // email + push, in the background
  res.json(await view(group, req.userId));
}));

// The owner removes a member, or a member leaves ("me")
r.delete('/:id/members/:userId', h(async (req, res) => {
  const group = await memberOf(req);
  const target = req.params.userId === 'me' ? String(req.userId) : req.params.userId;
  if (target === String(group.owner)) throw new HttpError(400, 'The owner cannot leave. Delete the group instead.');
  if (target !== String(req.userId) && !isOwner(group, req.userId)) throw new HttpError(403, 'Only the group owner can remove members');
  group.members = group.members.filter((m) => String(m.user) !== target);
  await group.save();
  res.json(target === String(req.userId) ? { ok: true, left: true } : await view(group, req.userId));
}));

// ---------- Chat ----------
r.get('/:id/messages', h(async (req, res) => {
  const group = await memberOf(req);
  const q = { group: group._id };
  const after = req.query.after ? new Date(String(req.query.after)) : null;
  if (after && !Number.isNaN(after.getTime())) q.createdAt = { $gt: after };
  const list = await GroupMessage.find(q).sort({ createdAt: -1 }).limit(after ? 200 : 80).lean();
  const people = new Map((await User.find({ _id: { $in: [...new Set(list.map((m) => String(m.user)))] } }).select('name avatar').lean()).map((u) => [String(u._id), u]));
  res.json(list.reverse().map((m) => {
    const u = people.get(String(m.user));
    return { id: String(m._id), text: m.text, at: m.createdAt, user: { id: String(m.user), name: u?.name || 'Former member', avatar: u?.avatar || '' }, me: String(m.user) === String(req.userId) };
  }));
}));

r.post('/:id/messages', h(async (req, res) => {
  const group = await memberOf(req);
  const text = typeof req.body?.text === 'string' ? req.body.text.trim().slice(0, 2000) : '';
  if (!text) throw new HttpError(400, 'Write a message');
  const m = await GroupMessage.create({ group: group._id, user: req.userId, text });
  await Group.updateOne({ _id: group._id }, { $currentDate: { updatedAt: true } });
  const me = await User.findById(req.userId).select('name avatar').lean();
  res.status(201).json({ id: String(m._id), text: m.text, at: m.createdAt, user: { id: String(req.userId), name: me.name, avatar: me.avatar || '' }, me: true });
}));

r.delete('/:id/messages/:mid', h(async (req, res) => {
  const group = await memberOf(req);
  if (!mongoose.isValidObjectId(req.params.mid)) throw new HttpError(404, 'Message not found');
  const del = await GroupMessage.deleteOne({ _id: req.params.mid, group: group._id, ...(isOwner(group, req.userId) ? {} : { user: req.userId }) });
  if (!del.deletedCount) throw new HttpError(404, 'Message not found');
  res.json({ ok: true });
}));

// ---------- Shared deadlines ----------
function taskFields(body = {}, partial = false) {
  const out = {};
  if (body.title !== undefined || !partial) {
    out.title = typeof body.title === 'string' ? body.title.trim().slice(0, 200) : '';
    if (!out.title) throw new HttpError(400, 'Title is required');
  }
  if (body.dueDate !== undefined || !partial) {
    if (!ISO.test(body.dueDate || '')) throw new HttpError(400, 'Choose a due date');
    out.dueDate = body.dueDate;
  }
  if (TASK_TYPES.includes(body.type)) out.type = body.type;
  if (typeof body.done === 'boolean') out.done = body.done;
  return out;
}

r.post('/:id/tasks', h(async (req, res) => {
  const group = await memberOf(req);
  if (await GroupTask.countDocuments({ group: group._id }) >= 300) throw new HttpError(400, 'This group has too many deadlines. Delete old ones first.');
  const t = await GroupTask.create({ ...taskFields(req.body), group: group._id, createdBy: req.userId });
  res.status(201).json({ id: String(t._id), title: t.title, type: t.type, dueDate: t.dueDate, done: t.done });
}));

r.patch('/:id/tasks/:tid', h(async (req, res) => {
  const group = await memberOf(req);
  if (!mongoose.isValidObjectId(req.params.tid)) throw new HttpError(404, 'Deadline not found');
  const t = await GroupTask.findOneAndUpdate({ _id: req.params.tid, group: group._id }, taskFields(req.body, true), { new: true, runValidators: true });
  if (!t) throw new HttpError(404, 'Deadline not found');
  res.json({ id: String(t._id), title: t.title, type: t.type, dueDate: t.dueDate, done: t.done });
}));

r.delete('/:id/tasks/:tid', h(async (req, res) => {
  const group = await memberOf(req);
  if (!mongoose.isValidObjectId(req.params.tid)) throw new HttpError(404, 'Deadline not found');
  const del = await GroupTask.deleteOne({ _id: req.params.tid, group: group._id });
  if (!del.deletedCount) throw new HttpError(404, 'Deadline not found');
  res.json({ ok: true });
}));

// ---------- Video meetings (Zoom, or a pasted Zoom / Teams / Meet link) ----------
const MAX_MEETINGS = 30;
const meetingView = (m, names, userId, groupName = '') => {
  const end = m.start.getTime() + m.duration * 60_000;
  const now = Date.now();
  return {
    id: String(m._id), topic: m.topic, provider: m.provider, start: m.start, duration: m.duration,
    joinUrl: m.joinUrl, passcode: m.passcode,
    by: names.get(String(m.createdBy)) || '', mine: String(m.createdBy) === String(userId),
    status: now > end ? 'ended' : now >= m.start.getTime() - 10 * 60_000 ? 'live' : 'upcoming',
    calendar: calendarLinks(m, groupName),
  };
};

r.get('/:id/meetings', h(async (req, res) => {
  const group = await memberOf(req);
  const list = await GroupMeeting.find({ group: group._id, start: { $gt: new Date(Date.now() - 12 * 3600_000) } }).sort({ start: 1 }).limit(50).lean();
  const live = list.filter((m) => m.start.getTime() + m.duration * 60_000 > Date.now() - 30 * 60_000);
  const names = new Map((await User.find({ _id: { $in: live.map((m) => m.createdBy) } }).select('name').lean()).map((u) => [String(u._id), u.name]));
  res.json(live.map((m) => meetingView(m, names, req.userId, group.name)));
}));

r.post('/:id/meetings', h(async (req, res) => {
  const group = await memberOf(req);
  const topic = (typeof req.body?.topic === 'string' ? req.body.topic.replace(/\s+/g, ' ').trim() : '').slice(0, 120) || `${group.name} meeting`;
  const duration = Math.min(600, Math.max(5, Math.round(Number(req.body?.duration) || 60)));
  const now = !req.body?.start;
  const start = now ? new Date() : new Date(String(req.body.start));
  if (Number.isNaN(start.getTime())) throw new HttpError(400, 'Choose a date and time');
  if (!now && (start.getTime() < Date.now() - 3600_000 || start.getTime() > Date.now() + 366 * 86400_000)) throw new HttpError(400, 'Choose a time within the next year');
  if (await GroupMeeting.countDocuments({ group: group._id, start: { $gt: new Date() } }) >= MAX_MEETINGS) throw new HttpError(400, `A group can have up to ${MAX_MEETINGS} upcoming meetings`);

  const meeting = { group: group._id, createdBy: req.userId, topic, start, duration };
  if (req.body?.link) {
    let url;
    try { url = new URL(String(req.body.link).trim()); } catch { throw new HttpError(400, 'Paste the full meeting link, starting with https://'); }
    if (url.protocol !== 'https:') throw new HttpError(400, 'Paste the full meeting link, starting with https://');
    Object.assign(meeting, { provider: 'link', joinUrl: url.href.slice(0, 1000) });
  } else {
    if (!zoomEnabled()) throw new HttpError(400, 'Zoom is not set up on this server yet. Paste a meeting link instead.');
    const z = await zoomApi(req.userId, 'POST', '/users/me/meetings', {
      topic, type: now ? 1 : 2, duration, timezone: 'UTC',
      ...(now ? {} : { start_time: start.toISOString().replace(/\.\d{3}Z$/, 'Z') }),
      agenda: `StudyPilot study group: ${group.name}`,
      settings: { join_before_host: true, jbh_time: 0, waiting_room: false, mute_upon_entry: true },
    });
    if (!z?.join_url) throw new HttpError(502, 'Zoom did not create the meeting. Try again.');
    Object.assign(meeting, { provider: 'zoom', joinUrl: z.join_url, zoomId: String(z.id), passcode: z.password || '' });
  }
  const m = await GroupMeeting.create(meeting);
  await Group.updateOne({ _id: group._id }, { $currentDate: { updatedAt: true } });
  notifyMeeting({ group, meeting: m, fromId: req.userId, toIds: group.members.map((x) => x.user).filter((u) => String(u) !== String(req.userId)), now });
  const me = await User.findById(req.userId).select('name').lean();
  res.status(201).json(meetingView(m, new Map([[String(req.userId), me?.name || '']]), req.userId, group.name));
}));

// The host link for a Zoom meeting (only for the person who made it; Zoom's start links expire, so it is fetched each time)
r.get('/:id/meetings/:mid/start', h(async (req, res) => {
  const group = await memberOf(req);
  if (!mongoose.isValidObjectId(req.params.mid)) throw new HttpError(404, 'Meeting not found');
  const m = await GroupMeeting.findOne({ _id: req.params.mid, group: group._id }).lean();
  if (!m) throw new HttpError(404, 'Meeting not found');
  if (String(m.createdBy) !== String(req.userId) || m.provider !== 'zoom') return res.json({ url: m.joinUrl });
  const z = await zoomApi(req.userId, 'GET', `/meetings/${encodeURIComponent(m.zoomId)}`);
  res.json({ url: z?.start_url || m.joinUrl });
}));

// "Download .ics": the meeting as a calendar file (Apple Calendar, the Outlook app, any calendar)
r.get('/:id/meetings/:mid/ics', h(async (req, res) => {
  const group = await memberOf(req);
  if (!mongoose.isValidObjectId(req.params.mid)) throw new HttpError(404, 'Meeting not found');
  const m = await GroupMeeting.findOne({ _id: req.params.mid, group: group._id }).lean();
  if (!m) throw new HttpError(404, 'Meeting not found');
  res.set('Content-Type', 'text/calendar; charset=utf-8');
  res.set('Content-Disposition', 'attachment; filename="meeting.ics"');
  res.send(meetingIcs(m, group.name));
}));

r.delete('/:id/meetings/:mid', h(async (req, res) => {
  const group = await memberOf(req);
  if (!mongoose.isValidObjectId(req.params.mid)) throw new HttpError(404, 'Meeting not found');
  const m = await GroupMeeting.findOne({ _id: req.params.mid, group: group._id });
  if (!m) throw new HttpError(404, 'Meeting not found');
  const mine = String(m.createdBy) === String(req.userId);
  if (!mine && !isOwner(group, req.userId)) throw new HttpError(403, 'Only the person who made the meeting, or the group owner, can cancel it');
  if (mine && m.provider === 'zoom' && m.zoomId) await zoomApi(req.userId, 'DELETE', `/meetings/${encodeURIComponent(m.zoomId)}`).catch(() => {});
  await m.deleteOne();
  // A meeting that has not happened yet: take it out of everyone's calendar
  if (m.start.getTime() > Date.now()) notifyMeetingCancelled({ group, meeting: m, fromId: req.userId, toIds: group.members.map((x) => x.user) });
  res.json({ ok: true });
}));

export default r;
