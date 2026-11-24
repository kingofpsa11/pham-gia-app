import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_JWT_SECRET, getJwtSecret } from './utils/jwtSecret.js';
import { pickReusableHopDongFolder } from './utils/hopDongDrive.js';
import { dateInputWithExistingTime, mergePatchFields } from './utils/patchMerge.js';

async function withServer(app, fn) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

test('API routes require auth except login and Google OAuth callback', async () => {
  process.env.NODE_ENV = 'test';
  const { createApp } = await import('./index.js');
  const app = createApp();

  await withServer(app, async (baseUrl) => {
    const protectedUrls = [
      '/api/bao-gia',
      '/api/tables',
      '/api/xuat-bao-gia-excel',
      '/api/google-drive/status',
    ];

    for (const url of protectedUrls) {
      const response = await fetch(`${baseUrl}${url}`, {
        method: url.includes('xuat') ? 'POST' : 'GET',
        headers: { 'Content-Type': 'application/json' },
        body: url.includes('xuat') ? '{}' : undefined,
      });
      assert.equal(response.status, 401, `${url} should require a token`);
    }

    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.equal(loginResponse.status, 400);

    const callbackResponse = await fetch(`${baseUrl}/api/google/callback`, {
      redirect: 'manual',
    });
    assert.equal(callbackResponse.status, 302);
  });
});

test('production refuses the default JWT secret', () => {
  const oldEnv = process.env.NODE_ENV;
  const oldSecret = process.env.JWT_SECRET;
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;
    assert.throws(() => getJwtSecret(), /JWT_SECRET/);

    process.env.JWT_SECRET = DEFAULT_JWT_SECRET;
    assert.throws(() => getJwtSecret(), /JWT_SECRET/);

    process.env.JWT_SECRET = 'a-production-only-secret';
    assert.equal(getJwtSecret(), 'a-production-only-secret');
  } finally {
    process.env.NODE_ENV = oldEnv;
    if (oldSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = oldSecret;
  }
});

test('patch merging preserves omitted fields but honors explicit changes', () => {
  const existing = {
    so_du_sau_giao_dich: 123456,
    ma_giao_dich_ngan_hang: 'BANK-42',
    chieu_tien: 'ra',
  };
  const merged = mergePatchFields(existing, { chieu_tien: null }, [
    'so_du_sau_giao_dich',
    'ma_giao_dich_ngan_hang',
    'chieu_tien',
  ]);

  assert.equal(merged.so_du_sau_giao_dich, 123456);
  assert.equal(merged.ma_giao_dich_ngan_hang, 'BANK-42');
  assert.equal(merged.chieu_tien, null);
});

test('date-only cashflow edits retain the existing transaction time', () => {
  assert.equal(
    dateInputWithExistingTime('2026-11-24', '2026-11-20 14:35:12'),
    '2026-11-24 14:35:12',
  );
  assert.equal(
    dateInputWithExistingTime('24/11/2026', '2026-11-20 08:09:10'),
    '24/11/2026 08:09:10',
  );
});

test('contract Drive folders are reused only on exact folder names', () => {
  const folders = [
    { id: 'wrong-contract', name: '01 Existing Customer - Existing Project' },
    { id: 'exact-contract', name: '01 New Customer - New Project' },
  ];

  assert.equal(
    pickReusableHopDongFolder(folders, '01 New Customer - New Project')?.id,
    'exact-contract',
  );
  assert.equal(pickReusableHopDongFolder(folders, '01 Other Customer - Other Project'), null);
});
