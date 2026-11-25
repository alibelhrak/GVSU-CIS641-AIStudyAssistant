import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCandidates, buildPlan, templateText, addDays, daysBetween } from '../src/services/recommendationEngine.js';

const today = '2026-10-07';
const task = (over = {}) => ({ _id: 't1', course: 'c1', title: 'Midterm 1', type: 'Exam', dueDate: '2026-10-10', priority: 'high', hoursNeeded: 8, done: false, ...over });

test('date helpers cross month boundaries', () => {
  assert.equal(addDays('2026-10-30', 3), '2026-11-02');
  assert.equal(daysBetween('2026-10-30', '2026-11-02'), 3);
});

test('exam with no study time produces a recommendation covering the full gap', () => {
  const [c] = buildCandidates({ tasks: [task()], sessions: [], logs: [], today });
  assert.equal(c.daysLeft, 3);
  assert.equal(c.gapHours, 8);
  assert.equal(c.plan.reduce((s, p) => s + p.hours, 0), 8);
  assert.ok(c.plan.every((p) => p.date >= today && p.date < '2026-10-10'));
});

test('studied and planned hours reduce the gap', () => {
  const sessions = [
    { course: 'c1', date: '2026-10-05', hours: 2, done: true },    // studied
    { course: 'c1', date: '2026-10-08', hours: 1.5, done: false }, // planned
    { course: 'c2', date: '2026-10-05', hours: 5, done: true },    // other course: ignored
    { course: 'c1', date: '2026-10-12', hours: 3, done: false },   // after deadline: ignored
  ];
  const logs = [{ course: 'c1', date: '2026-10-06', hours: 1 }];
  const [c] = buildCandidates({ tasks: [task()], sessions, logs, today });
  assert.equal(c.studiedHours, 3);
  assert.equal(c.plannedHours, 1.5);
  assert.equal(c.gapHours, 3.5);
});

test('no recommendation when covered, done, overdue or beyond the horizon', () => {
  const run = (t, sessions = []) => buildCandidates({ tasks: [t], sessions, logs: [], today }).length;
  assert.equal(run(task(), [{ course: 'c1', date: '2026-10-08', hours: 8, done: false }]), 0);
  assert.equal(run(task({ done: true })), 0);
  assert.equal(run(task({ dueDate: '2026-10-06' })), 0);
  assert.equal(run(task({ dueDate: '2026-11-30' })), 0);
});

test('urgent high-priority exam outranks a distant low-priority reading', () => {
  const tasks = [
    task({ _id: 'far', type: 'Reading', priority: 'low', dueDate: '2026-10-19', hoursNeeded: 8 }),
    task({ _id: 'soon' }),
  ];
  const out = buildCandidates({ tasks, sessions: [], logs: [], today });
  assert.deepEqual(out.map((c) => c.taskId), ['soon', 'far']);
});

test('at most `max` candidates are returned', () => {
  const tasks = Array.from({ length: 6 }, (_, i) => task({ _id: `t${i}` }));
  assert.equal(buildCandidates({ tasks, sessions: [], logs: [], today, max: 3 }).length, 3);
});

test('plan for a task due today is one session today', () => {
  assert.deepEqual(buildPlan(today, 0, 1.5), [{ date: today, hours: 1.5 }]);
});

test('plan always sums to the gap', () => {
  for (const gap of [0.75, 1, 2.25, 3.5, 5, 7.75, 13]) {
    for (const days of [0, 1, 2, 5, 14]) {
      const total = buildPlan(today, days, gap).reduce((s, p) => s + p.hours, 0);
      assert.equal(total, gap, `gap ${gap}, days ${days}`);
    }
  }
});

test('template text names the course and task', () => {
  const t = templateText({ course: 'BIO 120', title: 'Midterm 1', type: 'Exam', daysLeft: 1, studiedHours: 0, plannedHours: 0, neededHours: 8 });
  assert.match(t.message, /BIO 120/);
  assert.match(t.message, /due tomorrow/);
  assert.match(t.reason, /not studied/);
});