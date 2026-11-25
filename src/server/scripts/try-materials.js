const API = 'http://localhost:5000/api';
let token = '';

async function call(method, path, body, isForm) {
  const res = await fetch(API + path, {
    method,
    headers: { ...(isForm || !body ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: isForm ? body : body ? JSON.stringify(body) : undefined,
  });
  const data = res.status === 204 ? {} : await res.json();
  console.log(res.status, method, path, '->', data.error || 'ok');
  return data;
}

const a = await call('POST', '/auth/register', { name: 'Ali', email: `m${Date.now()}@example.com`, password: 'password123' });
token = a.token;
const course = await call('POST', '/courses', { code: 'CIS 641', name: 'System Analysis and Design' });

// Upload a small text file
const form = new FormData();
form.append('course', course.id);
form.append('files', new Blob(['My UML notes'], { type: 'text/plain' }), 'uml-notes.txt');
const [file] = await call('POST', '/materials/upload', form, true);

// Save a link, and try a bad one
await call('POST', '/materials/link', { course: course.id, name: 'Team repo', url: 'https://github.com/alibelhrak/GVSU-CIS641-AIStudyAssistant' });
await call('POST', '/materials/link', { course: course.id, name: 'Bad', url: 'github.com' });   // 400

const list = await call('GET', '/materials');
console.log('Materials:', list.map((m) => `${m.kind}: ${m.name}`));

// Download the file and check its content
const dl = await fetch(`${API}/materials/${file.id}/file`, { headers: { Authorization: `Bearer ${token}` } });
console.log(dl.status, 'download ->', JSON.stringify(await dl.text()));

await call('DELETE', `/materials/${file.id}`);
console.log('After delete:', (await call('GET', '/materials')).length, 'material(s)');
await call('DELETE', `/courses/${course.id}`);