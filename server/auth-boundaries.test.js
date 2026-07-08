import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';

const { app } = await import('./index.js');

let server;
let baseUrl;

before(() => {
  server = app.listen(0);
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

async function request(path, options = {}) {
  return fetch(`${baseUrl}${path}`, options);
}

test('business APIs require authentication before route handlers run', async () => {
  const routes = [
    ['/api/khach-hang', { method: 'GET' }],
    ['/api/dashboard-stats', { method: 'GET' }],
    ['/api/dong-tien-moi/123', { method: 'DELETE' }],
    ['/api/xuat-bao-gia-excel', { method: 'POST', body: JSON.stringify({ bao_gia_id: 1, mau_key: 'default' }) }],
    ['/api/tables', { method: 'GET' }],
  ];

  for (const [path, options] of routes) {
    const response = await request(path, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
    const body = await response.json();

    assert.equal(response.status, 401, `${options.method} ${path}`);
    assert.equal(body.error, 'Unauthorized');
  }
});

test('login validation remains public', async () => {
  const response = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });

  assert.equal(response.status, 400);
});

test('google drive oauth callback remains public', async () => {
  const response = await request('/api/google-drive/callback', { redirect: 'manual' });

  assert.equal(response.status, 302);
  assert.match(response.headers.get('location') || '', /drive_error=invalid_state/);
});
