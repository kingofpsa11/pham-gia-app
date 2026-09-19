import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { createApp } from './index.js';
import { getJwtSecret } from './utils/jwtSecret.js';
import {
  mergeOmittedFields,
  preserveExistingTimeForDateOnly,
} from './utils/patchMerge.js';

async function startTestServer() {
  const server = createServer(createApp());
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    }),
  };
}

test('global API auth boundary protects private routes and leaves public callbacks reachable', async () => {
  const server = await startTestServer();
  try {
    const dashboard = await fetch(`${server.baseUrl}/api/dashboard-stats`);
    assert.equal(dashboard.status, 401);

    const tables = await fetch(`${server.baseUrl}/api/tables`);
    assert.equal(tables.status, 401);

    const exportExcel = await fetch(`${server.baseUrl}/api/xuat-bao-gia-excel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bao_gia_id: 1, mau_key: 'default' }),
    });
    assert.equal(exportExcel.status, 401);

    const login = await fetch(`${server.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(login.status, 400);

    const callback = await fetch(`${server.baseUrl}/api/google-drive/callback`, {
      redirect: 'manual',
    });
    assert.equal(callback.status, 302);
    assert.match(callback.headers.get('location') || '', /drive_error=invalid_state/);
  } finally {
    await server.close();
  }
});

test('mergeOmittedFields preserves stored values only when fields are omitted', () => {
  const existing = {
    so_phieu: 'GH001',
    nguoi_tao: 'Admin',
    ma_giao_dich_ngan_hang: 'BANK-123',
  };

  assert.deepEqual(
    mergeOmittedFields(existing, { nguoi_tao: '' }, ['so_phieu', 'nguoi_tao', 'ma_giao_dich_ngan_hang']),
    { so_phieu: 'GH001', nguoi_tao: '', ma_giao_dich_ngan_hang: 'BANK-123' },
  );
});

test('date-only edits keep the existing cashflow time component', () => {
  assert.equal(
    preserveExistingTimeForDateOnly('2026-09-19', '2026-09-18 14:35:22'),
    '2026-09-19 14:35:22',
  );
  assert.equal(
    preserveExistingTimeForDateOnly('2026-09-19 08:00:00', '2026-09-18 14:35:22'),
    '2026-09-19 08:00:00',
  );
});

test('production refuses the built-in JWT fallback secret', () => {
  const oldNodeEnv = process.env.NODE_ENV;
  const oldJwtSecret = process.env.JWT_SECRET;
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;
    assert.throws(() => getJwtSecret(), /JWT_SECRET must be configured/);
  } finally {
    if (oldNodeEnv == null) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = oldNodeEnv;
    if (oldJwtSecret == null) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = oldJwtSecret;
  }
});
