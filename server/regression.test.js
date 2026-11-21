import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import jwt from 'jsonwebtoken';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';

const { app } = await import('./index.js');
const { default: pool } = await import('./db.js');
const {
  mergeOmittedFields,
  preserveExistingTimeIfDateOnly,
} = await import('./utils/patchMerge.js');

let server;
let baseUrl;

before(async () => {
  await new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
  await pool.end();
});

test('private API routes require authentication', async () => {
  const dashboard = await fetch(`${baseUrl}/api/dashboard-stats`);
  assert.equal(dashboard.status, 401);

  const exportRes = await fetch(`${baseUrl}/api/xuat-bao-gia-excel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bao_gia_id: 1, mau_key: 'default' }),
  });
  assert.equal(exportRes.status, 401);
});

test('public auth and Google callback routes stay reachable', async () => {
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(login.status, 400);

  const callback = await fetch(`${baseUrl}/api/google/callback`, { redirect: 'manual' });
  assert.equal(callback.status, 302);
  assert.match(callback.headers.get('location') || '', /drive_error=invalid_state/);
});

test('/api/tables is admin-only', async () => {
  const anonymous = await fetch(`${baseUrl}/api/tables`);
  assert.equal(anonymous.status, 401);

  const staffToken = jwt.sign({ id: 1, email: 'staff@example.com', role: 'staff' }, process.env.JWT_SECRET);
  const staff = await fetch(`${baseUrl}/api/tables`, {
    headers: { Authorization: `Bearer ${staffToken}` },
  });
  assert.equal(staff.status, 403);
});

test('mergeOmittedFields preserves omitted fields without blocking explicit clears', () => {
  const merged = mergeOmittedFields(
    { ghi_chu: null, so_tien: 125000 },
    {
      ghi_chu: 'old note',
      so_tien: 100000,
      ma_giao_dich_ngan_hang: 'BANK-123',
      so_du_sau_giao_dich: 500000,
    },
    ['ghi_chu', 'so_tien', 'ma_giao_dich_ngan_hang', 'so_du_sau_giao_dich'],
  );

  assert.equal(merged.ghi_chu, null);
  assert.equal(merged.so_tien, 125000);
  assert.equal(merged.ma_giao_dich_ngan_hang, 'BANK-123');
  assert.equal(merged.so_du_sau_giao_dich, 500000);
});

test('date-only edits keep the original transaction time', () => {
  assert.equal(
    preserveExistingTimeIfDateOnly(
      '2026-11-21 00:00:00',
      '2026-11-21',
      '2026-11-20 14:35:08',
    ),
    '2026-11-21 14:35:08',
  );

  assert.equal(
    preserveExistingTimeIfDateOnly(
      '2026-11-21 09:15:00',
      '2026-11-21 09:15:00',
      '2026-11-20 14:35:08',
    ),
    '2026-11-21 09:15:00',
  );
});
