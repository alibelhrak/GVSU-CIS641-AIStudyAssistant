/**
 * The rule-based part of the study assistant.
 *
 * For each open task due within `horizonDays`:
 *   studied = hours completed for that course in the 14 days before the deadline
 *             (finished sessions + manual logs)
 *   planned = hours of unfinished sessions for that course between today and the deadline
 *   gap     = hoursNeeded - studied - planned
 *   score   = gap x priority weight x task-type weight x urgency
 *
 * This file uses no database and no clock, so it can be unit-tested, and the
 * numbers shown to the student never depend on what an LLM writes.
 */
import { tr, kindName } from '../i18n.js';

const DAY_MS = 86400000;
const PRIORITY_WEIGHT = { high: 1.6, med: 1.0, low: 0.6 };
const TYPE_WEIGHT = { Exam: 1.3, Project: 1.15, Quiz: 1.0, Assignment: 1.0, Reading: 0.7 };

export const MIN_GAP_HOURS = 0.75;      // smaller gaps are not worth a recommendation
export const MAX_SESSION_HOURS = 2;     // longest single session the plan proposes
const LOOKBACK_DAYS = 14;

const toUtc = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d); };
export const addDays = (iso, n) => new Date(toUtc(iso) + n * DAY_MS).toISOString().slice(0, 10);
export const daysBetween = (from, to) => Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
const quarter = (h) => Math.round(h * 4) / 4;   // round to the nearest 15 minutes

export function buildCandidates({ tasks, sessions, logs, today, horizonDays = 14, max = 3 }) {
  const out = [];
  for (const task of tasks) {
    if (task.done) continue;
    const daysLeft = daysBetween(today, task.dueDate);
    if (daysLeft < 0 || daysLeft > horizonDays) continue;

    const courseId = String(task.course);
    const from = addDays(task.dueDate, -LOOKBACK_DAYS);
    let studied = 0;
    let planned = 0;
    for (const s of sessions) {
      if (String(s.course) !== courseId) continue;
      if (s.done && s.date >= from && s.date <= today) studied += s.hours;
      else if (!s.done && s.date >= today && s.date <= task.dueDate) planned += s.hours;
    }
    for (const l of logs) {
      if (String(l.course) === courseId && l.date >= from && l.date <= today) studied += l.hours;
    }

    const need = task.hoursNeeded || 0;
    const gap = quarter(need - studied - planned);
    if (gap < MIN_GAP_HOURS) continue;

    const urgency = 1 / Math.max(1, daysLeft);                 // 1 when due today or tomorrow
    const score = gap * (PRIORITY_WEIGHT[task.priority] ?? 1) * (TYPE_WEIGHT[task.type] ?? 1) * (0.4 + urgency);

    out.push({
      taskId: String(task._id ?? task.id),
      courseId,
      key: `${task._id ?? task.id}:${Math.ceil(gap * 2)}`,     // same task + same gap = same advice
      daysLeft,
      studiedHours: quarter(studied),
      plannedHours: quarter(planned),
      neededHours: need,
      gapHours: gap,
      score: Math.round(score * 100) / 100,
      plan: buildPlan(today, daysLeft, gap),
    });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, max);
}

/** Spread `gap` hours over the days before the deadline, at most MAX_SESSION_HOURS each where possible. */
export function buildPlan(today, daysLeft, gap) {
  const daysAvailable = Math.max(1, daysLeft);                 // today .. the day before the deadline
  const count = Math.min(daysAvailable, Math.max(1, Math.ceil(gap / MAX_SESSION_HOURS)));
  const step = Math.max(1, Math.floor(daysAvailable / count));
  const base = Math.floor((gap / count) * 4) / 4;
  let remainder = quarter(gap - base * count);
  const plan = [];
  for (let i = 0; i < count; i++) {
    const extra = remainder > 0 ? 0.25 : 0;                    // hand out leftover 15 minutes so the plan adds up to the gap
    remainder = quarter(remainder - extra);
    plan.push({ date: addDays(today, Math.min(i * step, daysAvailable - 1)), hours: base + extra });
  }
  return plan;
}

/** Rule-based wording, used when no LLM is set up or its answer is rejected. */
export function templateText(f, lang = 'en') {
  const kind = kindName(f.type, lang);
  const when = f.daysLeft === 0 ? tr('recToday', lang) : f.daysLeft === 1 ? tr('recTomorrow', lang) : tr('recInDays', lang, { n: f.daysLeft });
  const message = tr('recMessage', lang, { course: f.course, title: f.title, when });
  const reason = f.studiedHours === 0 && f.plannedHours === 0
    ? tr('recNotYet', lang, { course: f.course, kind, need: f.neededHours })
    : tr('recStudied', lang, { studied: f.studiedHours, planned: f.plannedHours ? tr('recPlanned', lang, { n: f.plannedHours }) : '', kind, need: f.neededHours });
  return { message, reason };
}