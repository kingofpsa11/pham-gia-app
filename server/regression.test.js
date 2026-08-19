import assert from 'node:assert/strict';
import http from 'node:http';
import { test } from 'node:test';
import jwt from 'jsonwebtoken';
import { app } from './index.js';
import { DEFAULT_JWT_SECRET, getJwtSecret } from './utils/jwtSecret.js';
import { mergeMissingFields } from './utils/patchMerge.js';

async function request(path, options = {}) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    return await fetch(`http://127.0.0.1:${port}${path}`, {
      redirect: 'manual',
      ...options,
    });
  } finally {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

test('global API auth blocks unauthenticated business routes before DB work', async () => {
  const response = await request('/api/bao-gia');
  assert.equal(response.status, 401);
});

test('/api/tables requires authentication', async () => {
  const response = await request('/api/tables');
  assert.equal(response.status, 401);
});

test('login and Google OAuth callback remain public', async () => {
  const loginResponse = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(loginResponse.status, 400);

  const callbackResponse = await request('/api/google-drive/callback');
  assert.equal(callbackResponse.status, 302);
  assert.match(callbackResponse.headers.get('location') || '', /drive_error=invalid_state/);
});

test('production requires an explicit JWT secret', () => {
  const oldEnv = process.env.NODE_ENV;
  const oldSecret = process.env.JWT_SECRET;
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;
    assert.throws(() => getJwtSecret(), /JWT_SECRET must be set/);

    process.env.JWT_SECRET = 'prod-secret';
    assert.equal(getJwtSecret(), 'prod-secret');
  } finally {
    if (oldEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = oldEnv;
    if (oldSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = oldSecret;
  }
});

test('tokens signed with the configured secret are accepted by protected routes', async () => {
  const oldSecret = process.env.JWT_SECRET;
  try {
    process.env.JWT_SECRET = 'test-secret';
    const token = jwt.sign({ id: 'u1', email: 'admin@example.com', role: 'admin' }, 'test-secret');
    const response = await request('/api/not-a-real-route', {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(response.status, 404);
  } finally {
    if (oldSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = oldSecret;
  }
});

test('patch merge preserves omitted persisted fields only', () => {
  const merged = mergeMissingFields(
    {
      so_phieu: 'PGH-001',
      nguoi_tao: 'Alice',
      gia_tri_ghi_no: 125000,
    },
    {
      nguoi_tao: '',
    },
    ['so_phieu', 'nguoi_tao', 'gia_tri_ghi_no'],
  );

  assert.equal(merged.so_phieu, 'PGH-001');
  assert.equal(merged.nguoi_tao, '');
  assert.equal(merged.gia_tri_ghi_no, 125000);
  assert.equal(getJwtSecret(), process.env.JWT_SECRET || DEFAULT_JWT_SECRET);
});
