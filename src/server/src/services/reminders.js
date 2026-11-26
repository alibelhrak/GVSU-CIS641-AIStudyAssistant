/**
 * Reminders: a morning summary, deadline alerts, "your study session starts soon" and a Sunday progress email.
 *
 * runReminders() is called every 15 minutes by a scheduler (see .github/workflows/reminders.yml), because Render's
 * free server sleeps and cannot keep its own timer. Each run looks at every student who turned reminders on,
 * works out their local time, and sends what is due. ReminderLog remembers what was sent, so a late or repeated
 * run never sends the same reminder twice.
 */
import crypto from 'node:crypto';
import webpush from 'web-push';
import { config, mailEnabled, pushEnabled } from '../config.js';
import { User, Course, Task, StudySession, StudyLog, PushSub, ReminderLog } from '../models/index.js';
import { buildCandidates, addDays, daysBetween } from './recommendationEngine.js';
import { sendMail } from './mailer.js';

if (pushEnabled()) webpush.setVapidDetails(config.push.subject, config.push.publicKey, config.push.privateKey);

/* ---------- Small helpers ---------- */
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hours = (h) => `${Math.round(h * 4) / 4} h`;
const prettyDate = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

export function validTimezone(tz) {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}

/** The student's local date, hour, minute and weekday */
export function localNow(timezone, now = new Date()) {
  const tz = validTimezone(timezone) ? timezone : 'America/Detroit';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
  }).formatToParts(now).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), minute: Number(parts.minute), weekday: parts.weekday };
}

/** One-click unsubscribe links: a signature so nobody can turn off someone else's emails */
export const unsubscribeToken = (userId) => crypto.createHmac('sha256', config.jwtSecret).update(`unsub:${userId}`).digest('hex').slice(0, 32);
const unsubscribeUrl = (userId) => `${config.appUrl}/api/reminders/unsubscribe?u=${userId}&t=${unsubscribeToken(userId)}`;

/** Records that a reminder was sent. Returns false when it was already sent before. */
async function claim(userId, key) {
  try {
    await ReminderLog.create({ user: userId, key });
    return true;
  } catch (err) {
    if (err?.code === 11000) return false;
    if (await ReminderLog.exists({ user: userId, key })) return false;   // databases without unique indexes
    throw err;
  }
}

/* ---------- Sending ---------- */
export async function sendPush(userId, payload) {
  if (!pushEnabled()) return 0;
  const subs = await PushSub.find({ user: userId });
  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(payload), { TTL: 6 * 3600, urgency: 'normal' });
      sent += 1;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) await PushSub.deleteOne({ _id: s._id });   // that device unsubscribed
      else console.warn('Push failed:', err.statusCode || '', err.body || err.message);
    }
  }
  return sent;
}

function emailLayout({ user, title, intro, sections, button = 'Open Study Assistant', path = '/' }) {
  const body = sections.filter((s) => s.items.length).map((s) => `
    <h3 style="margin:22px 0 8px;font-size:15px;color:#37352f">${esc(s.title)}</h3>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse">
      ${s.items.map((it) => `<tr><td style="padding:9px 12px;border:1px solid #e9e9e7;border-radius:8px;background:#fbfbfa;font-size:14px;line-height:1.45;color:#37352f">
        ${it.color ? `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${esc(it.color)};margin-right:6px"></span>` : ''}${it.html}</td></tr>
        <tr><td style="height:6px"></td></tr>`).join('')}
    </table>`).join('');
  const html = `<!doctype html><html><body style="margin:0;background:#f7f7f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:28px 12px">
  <table role="presentation" width="100%" style="max-width:560px;background:#fff;border:1px solid #e9e9e7;border-radius:14px" cellspacing="0" cellpadding="0"><tr><td style="padding:28px">
    <img src="${config.appUrl}/logo.png" width="40" height="40" alt="" style="display:block;border-radius:10px">
    <h2 style="margin:16px 0 6px;font-size:21px;color:#37352f">${esc(title)}</h2>
    <p style="margin:0;color:#787774;font-size:14px;line-height:1.5">${intro}</p>
    ${body}
    <p style="margin:26px 0 4px"><a href="${config.appUrl}${path}" style="display:inline-block;background:#2383e2;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 18px;border-radius:9px">${esc(button)}</a></p>
  </td></tr></table>
  <p style="max-width:560px;margin:14px auto 0;color:#9b9a97;font-size:12px;line-height:1.5">You get this because you turned on reminders in AI Study Assistant.
    Change them under <b>Reminders</b> in the app, or <a href="${unsubscribeUrl(user._id)}" style="color:#9b9a97">turn off reminder emails</a>.</p>
  </td></tr></table></body></html>`;
  const text = [title, '', intro.replace(/<[^>]+>/g, ''), ...sections.filter((s) => s.items.length).flatMap((s) => ['', `${s.title}:`, ...s.items.map((it) => `- ${it.text}`)]),
    '', `Open: ${config.appUrl}${path}`, '', `Turn off reminder emails: ${unsubscribeUrl(user._id)}`].join('\n');
  return { html, text };
}

async function email(user, subject, content) {
  await sendMail({ to: user.email, toName: user.name, subject, ...emailLayout({ user, ...content }) });
}

/* ---------- What to send ---------- */
function taskItem(t, courses, today) {
  const c = courses.get(String(t.course));
  const d = daysBetween(today, t.dueDate);
  const when = d === 0 ? 'due today' : d === 1 ? 'due tomorrow' : `due ${prettyDate(t.dueDate)}`;
  const label = `${c?.code || 'Course'} · ${t.title} (${t.type}, ${when})`;
  return { text: label, html: `<b>${esc(c?.code || 'Course')}</b> · ${esc(t.title)} <span style="color:#787774">(${esc(t.type)}, ${when})</span>`, color: c?.color };
}
function sessionItem(s, courses) {
  const c = courses.get(String(s.course));
  const label = `${s.startTime} · ${c?.code || 'Course'} · ${hours(s.hours)}${s.note ? ` · ${s.note}` : ''}`;
  return { text: label, html: `<b>${esc(s.startTime)}</b> · ${esc(c?.code || 'Course')} · ${hours(s.hours)}${s.note ? ` · ${esc(s.note)}` : ''}`, color: c?.color };
}

/** Everything a reminder may need about one student */
async function loadData(userId, today) {
  const [courseList, tasks, sessions, logs] = await Promise.all([
    Course.find({ user: userId }).lean(),
    Task.find({ user: userId, done: false }).lean(),
    StudySession.find({ user: userId, date: { $gte: addDays(today, -14), $lte: addDays(today, 14) } }).lean(),
    StudyLog.find({ user: userId, date: { $gte: addDays(today, -14), $lte: today } }).lean(),
  ]);
  return { courses: new Map(courseList.map((c) => [String(c._id), c])), courseList, tasks, sessions, logs };
}

export async function remindUser(user, now = new Date(), { force = null } = {}) {
  const r = user.reminders || {};
  const L = localNow(r.timezone, now);
  const today = L.date;
  const tomorrow = addDays(today, 1);
  const data = await loadData(user._id, today);
  const { courses, tasks, sessions } = data;
  const useEmail = r.email && mailEnabled();
  const usePush = r.push && pushEnabled();
  const done = [];
  const morning = L.hour >= (r.hour ?? 7);

  // 1. Morning summary
  if ((force === 'daily') || (r.daily && morning && await claim(user._id, `daily:${today}`))) {
    const priorities = buildCandidates({ tasks, sessions: data.sessions, logs: data.logs, today, max: 3 });
    const byId = new Map(tasks.map((t) => [String(t._id), t]));
    const due = tasks.filter((t) => t.dueDate === today || t.dueDate === tomorrow).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const todays = sessions.filter((s) => s.date === today && !s.done).sort((a, b) => a.startTime.localeCompare(b.startTime));
    const prio = priorities.map((p) => {
      const t = byId.get(p.taskId);
      const c = courses.get(p.courseId);
      return { text: `${c?.code} · ${t?.title}: about ${hours(p.gapHours)} still to study, ${p.daysLeft === 0 ? 'due today' : `${p.daysLeft} day${p.daysLeft > 1 ? 's' : ''} left`}`,
        html: `<b>${esc(c?.code)}</b> · ${esc(t?.title)} <span style="color:#787774">· about ${hours(p.gapHours)} still to study, ${p.daysLeft === 0 ? 'due today' : `${p.daysLeft} day${p.daysLeft > 1 ? 's' : ''} left`}</span>`, color: c?.color };
    });
    if (prio.length || due.length || todays.length || force) {
      const intro = prio.length ? `Here is what matters most today, ${esc(user.name.split(' ')[0])}.` : `Here is your day, ${esc(user.name.split(' ')[0])}.`;
      if (useEmail || force) {
        await email(user, prio.length ? `Today: ${prio.length} priorit${prio.length > 1 ? 'ies' : 'y'}${due.length ? `, ${due.length} due soon` : ''}` : 'Your study day',
          { title: 'Your study plan for today', intro, sections: [
            { title: 'Top priorities', items: prio },
            { title: 'Due today and tomorrow', items: due.map((t) => taskItem(t, courses, today)) },
            { title: "Today's study sessions", items: todays.map((s) => sessionItem(s, courses)) },
          ] });
      }
      if (usePush) {
        const first = prio[0]?.text || (due[0] && taskItem(due[0], courses, today).text) || (todays[0] && `Study session at ${todays[0].startTime}`);
        await sendPush(user._id, { title: 'Your study plan for today', body: first || 'Open the app to see your day.', url: '/', tag: `daily-${today}` });
      }
      done.push('daily');
    }
  }

  // 2. Deadline alerts: due today and due tomorrow
  if (!force && r.deadlines && morning) {
    const soon = [];
    for (const t of tasks.filter((x) => x.dueDate === today || x.dueDate === tomorrow)) {
      if (await claim(user._id, `deadline:${t._id}:${t.dueDate === today ? 'today' : 'tomorrow'}`)) soon.push(t);
    }
    if (soon.length) {
      if (usePush) {
        for (const t of soon) {
          const c = courses.get(String(t.course));
          await sendPush(user._id, { title: `${t.type} ${t.dueDate === today ? 'due today' : 'due tomorrow'}`, body: `${c?.code || ''} · ${t.title}`, url: '/tasks', tag: `deadline-${t._id}` });
        }
      }
      // The morning summary already lists deadlines, so only email them separately when it is off
      if (useEmail && !r.daily) {
        await email(user, soon.length === 1 ? `Due ${soon[0].dueDate === today ? 'today' : 'tomorrow'}: ${soon[0].title}` : `${soon.length} deadlines today and tomorrow`,
          { title: 'Deadlines coming up', intro: 'Here is what is due soon.', path: '/tasks', button: 'Open Assignments & Exams',
            sections: [{ title: 'Due today and tomorrow', items: soon.map((t) => taskItem(t, courses, today)) }] });
      }
      done.push(`deadlines:${soon.length}`);
    }
  }

  // 3. A study session starts within 30 minutes
  if (!force && r.sessions) {
    const minutesNow = L.hour * 60 + L.minute;
    for (const s of sessions.filter((x) => x.date === today && !x.done)) {
      const [h, m] = s.startTime.split(':').map(Number);
      const until = h * 60 + m - minutesNow;
      if (until <= 0 || until > 30 || !(await claim(user._id, `session:${s._id}`))) continue;
      const c = courses.get(String(s.course));
      const body = `${c?.code || 'Study'} at ${s.startTime} · ${hours(s.hours)}${s.note ? ` · ${s.note}` : ''}`;
      if (usePush) await sendPush(user._id, { title: `Study session in ${until} min`, body, url: '/schedule', tag: `session-${s._id}` });
      else if (useEmail) {
        await email(user, `Study session in ${until} minutes: ${c?.code || ''}`, { title: `Your study session starts at ${s.startTime}`, intro: 'Time to get ready.',
          path: '/schedule', button: 'Open Study Schedule', sections: [{ title: 'Session', items: [sessionItem(s, courses)] }] });
      }
      done.push('session');
    }
  }

  // 4. Sunday evening: the week in review and the week ahead
  if ((force === 'weekly') || (r.weekly && L.weekday === 'Sun' && L.hour >= 18 && await claim(user._id, `weekly:${today}`))) {
    const from = addDays(today, -6);
    const studied = (cid) => data.sessions.filter((s) => String(s.course) === cid && s.done && s.date >= from && s.date <= today).reduce((t, s) => t + s.hours, 0)
      + data.logs.filter((l) => String(l.course) === cid && l.date >= from && l.date <= today).reduce((t, l) => t + l.hours, 0);
    const progress = data.courseList.map((c) => {
      const h = studied(String(c._id));
      const goal = c.weeklyGoalHours || 0;
      const mark = goal && h >= goal ? '✅' : goal && h >= goal / 2 ? '🟡' : '🔴';
      return { text: `${c.code}: ${hours(h)} of ${hours(goal)} ${mark}`, html: `<b>${esc(c.code)}</b> · ${hours(h)} of ${hours(goal)} goal ${mark}`, color: c.color, h, goal };
    });
    const ahead = tasks.filter((t) => t.dueDate > today && t.dueDate <= addDays(today, 7)).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const total = progress.reduce((t, p) => t + p.h, 0);
    const goal = progress.reduce((t, p) => t + p.goal, 0);
    if (useEmail || force) {
      await email(user, `Your week: ${hours(total)} studied${goal ? ` of ${hours(goal)}` : ''}`, {
        title: 'Your study week', intro: `You studied <b>${hours(total)}</b> this week${goal ? ` out of your <b>${hours(goal)}</b> goal` : ''}.`,
        sections: [{ title: 'Hours per course (last 7 days)', items: progress }, { title: 'Due in the next 7 days', items: ahead.map((t) => taskItem(t, courses, today)) }] });
    }
    if (usePush) await sendPush(user._id, { title: 'Your study week', body: `${hours(total)} studied${goal ? ` of ${hours(goal)}` : ''}. ${ahead.length} deadline${ahead.length === 1 ? '' : 's'} next week.`, url: '/', tag: `weekly-${today}` });
    done.push('weekly');
  }
  return done;
}

/** Called by the scheduler: sends whatever is due for every student who turned reminders on */
export async function runReminders(now = new Date()) {
  const users = await User.find({ $or: [{ 'reminders.daily': true }, { 'reminders.deadlines': true }, { 'reminders.sessions': true }, { 'reminders.weekly': true }] });
  const report = { users: users.length, sent: 0, errors: 0 };
  for (const user of users) {
    try {
      const done = await remindUser(user, now);
      report.sent += done.length;
    } catch (err) {
      report.errors += 1;
      console.warn('Reminders failed for a user:', err.message);
    }
  }
  return report;
}
