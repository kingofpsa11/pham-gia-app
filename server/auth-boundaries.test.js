import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import jwt from 'jsonwebtoken';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_secret_for_auth_boundaries';

const { default: app } = await import('./index.js');

async function request(method, path, options = {}) {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  try {
    const headers = { ...(options.headers || {}) };
    let body;
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.body);
    }
    if (options.token) headers.Authorization = `Bearer ${options.token}`;
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers,
      body,
      redirect: options.redirect || 'follow',
    });
    const text = await res.text();
    let json = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }
    return { status: res.status, headers: res.headers, json, text };
  } finally {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

test('public login remains outside the global API auth gate', async () => {
  const res = await request('POST', '/api/auth/login', { body: {} });
  assert.equal(res.status, 400);
  assert.match(res.json.error, /Email/);
});

test('Google Drive OAuth callback remains public for provider redirects', async () => {
  const res = await request('GET', '/api/google-drive/callback', { redirect: 'manual' });
  assert.equal(res.status, 302);
  assert.match(res.headers.get('location'), /drive_error=invalid_state/);
});

test('business APIs reject unauthenticated requests before route handlers run', async () => {
  const cases = [
    ['GET', '/api/dashboard-stats'],
    ['GET', '/api/tables'],
    ['POST', '/api/xuat-bao-gia-excel'],
    ['GET', '/api/phieu-giao-hang'],
    ['GET', '/api/dong-tien-moi'],
  ];

  for (const [method, path] of cases) {
    const res = await request(method, path, { body: method === 'POST' ? {} : undefined });
    assert.equal(res.status, 401, path);
  }
});

test('/api/tables requires admin, not just any authenticated user', async () => {
  const staffToken = jwt.sign(
    { id: 123, email: 'staff@example.com', role: 'staff' },
    process.env.JWT_SECRET,
  );
  const res = await request('GET', '/api/tables', { token: staffToken });
  assert.equal(res.status, 403);
});

test('production rejects the default JWT secret', async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousJwtSecret = process.env.JWT_SECRET;
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;
    const moduleUrl = new URL(`./middleware/auth.js?prod-default=${Date.now()}`, import.meta.url);
    const { getJwtSecret } = await import(moduleUrl.href);
    assert.throws(() => getJwtSecret(), /JWT_SECRET must be set/);
  } finally {
    process.env.NODE_ENV = previousNodeEnv;
    process.env.JWT_SECRET = previousJwtSecret;
  }
});
