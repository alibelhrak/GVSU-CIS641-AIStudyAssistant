const API = 'http://localhost:5000/api';
let token = '';
const today = new Date().toISOString().slice(0, 10);
const inDays = (n) => { const d = new Date(today); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

async function call(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = res.status === 204 ? {} : await res.json();
  if (!res.ok) console.log(res.status, method, path, '->', data.error);
  return data;
}

token = (await call('POST', '/auth/register', { name: 'Ali', email: `r${Date.now()}@example.com`, password: 'password123' })).token;
const ml = await call('POST', '/courses', { code: 'CIS 678', name: 'Machine Learning', weeklyGoalHours: 8 });
const uml = await call('POST', '/courses', { code: 'CIS 641', name: 'System Analysis and Design', weeklyGoalHours: 6 });
await call('POST', '/tasks', { course: ml.id, title: 'Midterm exam', type: 'Exam', dueDate: inDays(3), priority: 'high', hoursNeeded: 10 });
await call('POST', '/tasks', { course: uml.id, title: 'Term project', type: 'Project', dueDate: inDays(6), priority: 'med', hoursNeeded: 6 });
await call('POST', '/logs', { course: ml.id, date: inDays(-1), hours: 2 });

let recs = await call('POST', `/recommendations/generate?today=${today}`);
console.log(`\n${recs.length} recommendation(s):`);
for (const r of recs) {
  console.log(`- ${r.message}\n  ${r.reason}\n  gap ${r.gapHours} h | plan ${r.plan.map((p) => `${p.date} ${p.hours}h`).join(', ')} | text by: ${r.source}`);
}

const acc = await call('POST', `/recommendations/${recs[0].id}/accept`);
console.log(`\nAccepted the first one: ${acc.sessions.length} session(s) added to the schedule`);
await call('POST', `/recommendations/${recs[1].id}/dismiss`);
recs = await call('POST', `/recommendations/generate?today=${today}`);
console.log(`After accept + dismiss: ${recs.length} pending recommendation(s)`);

await call('DELETE', `/courses/${ml.id}`);
await call('DELETE', `/courses/${uml.id}`);