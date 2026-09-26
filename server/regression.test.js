import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import jwt from 'jsonwebtoken';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-for-regressions';

const { default: app } = await import('./index.js');
const { getJwtSecret } = await import('./utils/jwtSecret.js');

function listen() {
  const server = http.createServer(app);
  return new Promise((resolve) => {
    server.listen(0, () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

const { server, baseUrl } = await listen();

test.after(() => {
  server.close();
});

function staffToken() {
  return jwt.sign({ id: 123, email: 'staff@example.com', role: 'staff' }, getJwtSecret(), {
    expiresIn: '1h',
  });
}

test('public auth and OAuth callback endpoints stay reachable without JWT', async () => {
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(loginRes.status, 400);

  const callbackRes = await fetch(`${baseUrl}/api/google-drive/callback?state=bad`, {
    redirect: 'manual',
  });
  assert.equal(callbackRes.status, 302);
});

test('sensitive API routes reject unauthenticated requests before handlers run', async () => {
  const checks = [
    fetch(`${baseUrl}/api/dashboard-stats`),
    fetch(`${baseUrl}/api/khach-hang`),
    fetch(`${baseUrl}/api/tables`),
    fetch(`${baseUrl}/api/xuat-bao-gia-excel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bao_gia_id: 1, mau_key: 'default' }),
    }),
  ];

  for (const response of await Promise.all(checks)) {
    assert.equal(response.status, 401);
  }
});

test('table metadata endpoint requires admin role', async () => {
  const response = await fetch(`${baseUrl}/api/tables`, {
    headers: { Authorization: `Bearer ${staffToken()}` },
  });

  assert.equal(response.status, 403);
});

test('production refuses to run with the default JWT secret', () => {
  const previousEnv = process.env.NODE_ENV;
  const previousSecret = process.env.JWT_SECRET;
  process.env.NODE_ENV = 'production';
  delete process.env.JWT_SECRET;

  try {
    assert.throws(() => getJwtSecret(), /JWT_SECRET must be set in production/);
  } finally {
    process.env.NODE_ENV = previousEnv;
    process.env.JWT_SECRET = previousSecret;
  }
});

