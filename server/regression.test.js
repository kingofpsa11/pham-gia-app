import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeDateKeepingExistingTime, mergePatchFields } from './utils/patchMerge.js';
import { getJwtSecret } from './utils/jwtSecret.js';

process.env.NODE_ENV = 'test';
const { default: app } = await import('./index.js');

async function withServer(run) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

test('global API auth gate blocks protected routes before database handlers', async () => {
  await withServer(async (baseUrl) => {
    const protectedRes = await fetch(`${baseUrl}/api/dong-tien-moi`);
    assert.equal(protectedRes.status, 401);

    const tablesRes = await fetch(`${baseUrl}/api/tables`);
    assert.equal(tablesRes.status, 401);

    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(loginRes.status, 400);

    const callbackRes = await fetch(`${baseUrl}/api/google-drive/callback`, {
      redirect: 'manual',
    });
    assert.equal(callbackRes.status, 302);
    assert.match(callbackRes.headers.get('location') || '', /drive_error=invalid_state/);
  });
});

test('patch merging preserves omitted fields and applies explicit clears', () => {
  const existing = {
    so_du_sau_giao_dich: '1250000.00',
    ma_giao_dich_ngan_hang: 'BANK-123',
    doi_tuong_id: 42,
  };

  const merged = mergePatchFields(existing, { ma_giao_dich_ngan_hang: null }, [
    'so_du_sau_giao_dich',
    'ma_giao_dich_ngan_hang',
    'doi_tuong_id',
  ]);

  assert.equal(merged.so_du_sau_giao_dich, existing.so_du_sau_giao_dich);
  assert.equal(merged.ma_giao_dich_ngan_hang, null);
  assert.equal(merged.doi_tuong_id, existing.doi_tuong_id);
});

test('date-only cashflow edits keep the existing transaction time', () => {
  assert.equal(
    mergeDateKeepingExistingTime('2026-09-20', '2026-09-19 14:35:22'),
    '2026-09-20 14:35:22',
  );
});

test('production requires an explicit JWT secret', () => {
  const originalEnv = process.env.NODE_ENV;
  const originalSecret = process.env.JWT_SECRET;

  try {
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;
    assert.throws(() => getJwtSecret(), /JWT_SECRET must be configured/);
  } finally {
    process.env.NODE_ENV = originalEnv;
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  }
});

