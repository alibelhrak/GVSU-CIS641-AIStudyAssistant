const API = 'http://localhost:5000/api';
const email = `ali${Date.now()}@example.com`;

async function call(method, path, body, token) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  console.log(res.status, method, path, '->', data.error || 'ok');
  return data;
}

const reg = await call('POST', '/auth/register', { name: 'Ali Belhrak', email, password: 'password123' });
await call('POST', '/auth/register', { name: 'Ali', email, password: 'password123' });   // same email: 409
await call('POST', '/auth/register', { name: 'Ali', email: 'x@y.com', password: '123' }); // short password: 400
const login = await call('POST', '/auth/login', { email, password: 'password123' });
await call('POST', '/auth/login', { email, password: 'wrong-password' });                 // wrong password: 401
const me = await call('GET', '/auth/me', null, login.token);
console.log('Signed in as:', me.user.name, '| password hash hidden:', me.user.passwordHash === undefined);
await call('GET', '/auth/me');                                                            // no token: 401