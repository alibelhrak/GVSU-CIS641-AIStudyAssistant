const API = 'http://localhost:5000/api';
let token = '';

async function call(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = res.status === 204 ? {} : await res.json();
  console.log(res.status, method, path, '->', data.error || 'ok');
  return data;
}

// Two students
const a = await call('POST', '/auth/register', { name: 'Ali', email: `a${Date.now()}@example.com`, password: 'password123' });
const b = await call('POST', '/auth/register', { name: 'Sam', email: `b${Date.now()}@example.com`, password: 'password123' });

token = a.token;
const course = await call('POST', '/courses', { code: 'CIS 641', name: 'System Analysis and Design', weeklyGoalHours: 6 });
const task = await call('POST', '/tasks', { course: course.id, title: 'Midterm', type: 'Exam', dueDate: '2026-12-05', priority: 'high', hoursNeeded: 10 });
await call('POST', '/sessions', { course: course.id, date: '2026-11-26', startTime: '18:00', hours: 2, note: 'Review UML' });
await call('POST', '/logs', { course: course.id, date: '2026-11-24', hours: 1.5 });
await call('PATCH', `/tasks/${task.id}`, { done: true });
await call('POST', '/tasks', { course: course.id, title: 'Bad date', dueDate: '12/05/2026' });        // 400
console.log('Ali has', (await call('GET', '/tasks')).length, 'task(s)');

token = b.token;
console.log('Sam sees', (await call('GET', '/tasks')).length, 'task(s)');                           // 0: can't see Ali's
await call('POST', '/tasks', { course: course.id, title: 'Sneaky', dueDate: '2026-12-05' });         // 400: not his course
await call('DELETE', `/courses/${course.id}`);                                                       // 404: not his course

token = a.token;
await call('DELETE', `/courses/${course.id}`);                                                       // 204
console.log('After deleting the course, Ali has', (await call('GET', '/tasks')).length, 'task(s)');  // 0