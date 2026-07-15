import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import http from 'node:http';
import { after, before, describe, it } from 'node:test';
import jwt from 'jsonwebtoken';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_secret_for_auth_boundary_regressions';

const { app } = await import('./index.js');
const { default: pool } = await import('./db.js');

let server;
let baseUrl;

function makeToken(payload) {
  return jwt.sign(
    { id: 'user-1', email: 'user@example.com', role: 'staff', ...payload },
    process.env.JWT_SECRET,
    { expiresIn: '5m' },
  );
}

async function request(path, options = {}) {
  return fetch(`${baseUrl}${path}`, {
    redirect: 'manual',
    ...options,
    headers: {
      ...(options.headers || {}),
    },
  });
}

before(async () => {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
  await pool.end();
});

describe('API auth boundaries', () => {
  it('keeps login public', async () => {
    const res = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    assert.equal(res.status, 400);
  });

  it('keeps the Google OAuth callback public', async () => {
    const res = await request('/api/google-drive/callback');

    assert.equal(res.status, 302);
    assert.match(res.headers.get('location') || '', /drive_error=invalid_state/);
  });

  it('rejects unauthenticated business API access', async () => {
    const res = await request('/api/khach-hang');

    assert.equal(res.status, 401);
  });

  it('rejects unauthenticated quote exports', async () => {
    const res = await request('/api/xuat-bao-gia-excel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bao_gia_id: 1, mau_key: 'default' }),
    });

    assert.equal(res.status, 401);
  });

  it('requires admin access for table introspection', async () => {
    const unauthenticated = await request('/api/tables');
    assert.equal(unauthenticated.status, 401);

    const staff = await request('/api/tables', {
      headers: { Authorization: `Bearer ${makeToken({ role: 'staff' })}` },
    });
    assert.equal(staff.status, 403);
  });
});

describe('JWT secret policy', () => {
  it('rejects the shipped fallback secret in production', () => {
    const script = "import('./server/middleware/auth.js').then(() => process.exit(0)).catch(() => process.exit(1));";
    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: 'production',
        JWT_SECRET: 'phamgia_jwt_secret_change_this_2026',
      },
      encoding: 'utf8',
    });

    assert.notEqual(result.status, 0, result.stdout || result.stderr);
  });
});
