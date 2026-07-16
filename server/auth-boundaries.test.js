import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import jwt from 'jsonwebtoken';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_secret_for_auth_boundary_tests';

const { app } = await import('./index.js');
const { default: pool } = await import('./db.js');
const { DEFAULT_JWT_SECRET, getJwtSecret } = await import('./middleware/auth.js');

test.after(async () => {
  await pool.end();
});

function listen(appInstance) {
  const server = createServer(appInstance);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, () => resolve(server));
  });
}

async function request(server, path, options = {}) {
  const { port } = server.address();
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    redirect: 'manual',
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  const contentType = res.headers.get('content-type') || '';
  const body = contentType.includes('application/json') ? await res.json() : await res.text();
  return { res, body };
}

test('public API surface is limited to health, login, and Google callback', async (t) => {
  const server = await listen(app);
  t.after(() => server.close());

  const protectedRequests = [
    ['GET', '/api/tables'],
    ['GET', '/api/dashboard-stats'],
    ['GET', '/api/khach-hang'],
    ['POST', '/api/xuat-bao-gia-excel'],
    ['DELETE', '/api/dong-tien-moi/123'],
  ];

  for (const [method, path] of protectedRequests) {
    const { res, body } = await request(server, path, {
      method,
      body: method === 'POST' ? JSON.stringify({ bao_gia_id: 1, mau_key: 'default' }) : undefined,
    });
    assert.equal(res.status, 401, `${method} ${path} should require auth`);
    assert.equal(body.error, 'Unauthorized');
  }

  const login = await request(server, '/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({}),
  });
  assert.equal(login.res.status, 400);

  const callback = await request(server, '/api/google-drive/callback');
  assert.equal(callback.res.status, 302);
  assert.match(callback.res.headers.get('location') || '', /drive_error=invalid_state/);
});

test('admin-only schema listing rejects non-admin tokens before database access', async (t) => {
  const server = await listen(app);
  t.after(() => server.close());

  const token = jwt.sign(
    { id: 'staff-1', email: 'staff@example.com', role: 'staff' },
    process.env.JWT_SECRET,
  );
  const { res, body } = await request(server, '/api/tables', {
    headers: { Authorization: `Bearer ${token}` },
  });

  assert.equal(res.status, 403);
  assert.equal(body.error, 'Forbidden');
});

test('production rejects the public default JWT secret', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalJwtSecret = process.env.JWT_SECRET;
  try {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = DEFAULT_JWT_SECRET;
    assert.throws(
      () => getJwtSecret(),
      /JWT_SECRET must be set to a unique non-default value in production/,
    );
  } finally {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.JWT_SECRET = originalJwtSecret;
  }
});
