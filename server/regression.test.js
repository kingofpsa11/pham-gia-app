import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import app from './index.js';
import pool from './db.js';
import { getJwtSecret } from './utils/jwtSecret.js';
import { mergeOmittedFields, preserveTimeForDateOnly } from './utils/patchMerge.js';
import { findReusableContractFolder } from './utils/hopDongDrive.js';

let httpServer;
let baseUrl;

before(async () => {
  httpServer = await new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
  baseUrl = `http://127.0.0.1:${httpServer.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    httpServer.close((err) => (err ? reject(err) : resolve()));
  });
  await pool.end();
});

async function request(path, options = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
}

test('global API auth rejects protected routes before handlers can touch data', async () => {
  const stats = await request('/api/dashboard-stats');
  assert.equal(stats.status, 401);

  const exportResp = await request('/api/xuat-bao-gia-excel', {
    method: 'POST',
    body: JSON.stringify({ bao_gia_id: 1, mau_key: 'default' }),
  });
  assert.equal(exportResp.status, 401);

  const login = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({}),
  });
  assert.equal(login.status, 400);
});

test('/api/tables requires admin role', async () => {
  const staffToken = jwt.sign(
    { id: 1, email: 'staff@example.com', role: 'staff' },
    getJwtSecret(),
    { expiresIn: '1h' },
  );

  const resp = await request('/api/tables', {
    headers: { Authorization: `Bearer ${staffToken}` },
  });
  assert.equal(resp.status, 403);
});

test('default JWT secret is refused in production', () => {
  const oldEnv = process.env.NODE_ENV;
  const oldSecret = process.env.JWT_SECRET;
  process.env.NODE_ENV = 'production';
  delete process.env.JWT_SECRET;
  try {
    assert.throws(() => getJwtSecret(), /JWT_SECRET must be set/);
  } finally {
    if (oldEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = oldEnv;
    if (oldSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = oldSecret;
  }
});

test('sparse update merge preserves persisted financial metadata', () => {
  const merged = mergeOmittedFields(
    { so_tien: 200000 },
    {
      so_tien: 100000,
      ma_giao_dich_ngan_hang: 'BANK-123',
      so_du_sau_giao_dich: 900000,
      chieu_tien: 'thu',
    },
    ['so_tien', 'ma_giao_dich_ngan_hang', 'so_du_sau_giao_dich', 'chieu_tien'],
  );

  assert.equal(merged.so_tien, 200000);
  assert.equal(merged.ma_giao_dich_ngan_hang, 'BANK-123');
  assert.equal(merged.so_du_sau_giao_dich, 900000);
  assert.equal(merged.chieu_tien, 'thu');
  assert.equal(
    preserveTimeForDateOnly('2026-11-28', '2026-11-27 14:30:05'),
    '2026-11-28 14:30:05',
  );
});

test('contract Drive folder reuse requires the full expected folder name', () => {
  const folders = [
    { id: 'wrong-folder', name: '01 Other Customer - Different Project' },
    { id: 'right-folder', name: '01 ACME - New Factory' },
  ];

  assert.equal(findReusableContractFolder(folders, '01 ACME - New Factory')?.id, 'right-folder');
  assert.equal(findReusableContractFolder(folders, '01 ACME - Changed Scope'), null);
});
