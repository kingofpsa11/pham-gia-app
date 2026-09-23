import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import jwt from 'jsonwebtoken';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';

const { createApp } = await import('./index.js');
const { getJwtSecret } = await import('./utils/jwtSecret.js');
const { mergeOmittedFields } = await import('./utils/patchMerge.js');
const { parseNgayGiaoDichForUpdate } = await import('./utils/dongTienDate.js');

async function withServer(fn) {
  const server = http.createServer(createApp());
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

test('business API routes reject unauthenticated requests before handlers run', async () => {
  await withServer(async (baseUrl) => {
    const listRes = await fetch(`${baseUrl}/api/khach-hang`);
    assert.equal(listRes.status, 401);

    const exportRes = await fetch(`${baseUrl}/api/xuat-bao-gia-excel`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ bao_gia_id: 1, mau_key: 'default' }),
    });
    assert.equal(exportRes.status, 401);

    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(loginRes.status, 400);

    const callbackRes = await fetch(`${baseUrl}/api/google-drive/callback`, {
      redirect: 'manual',
    });
    assert.equal(callbackRes.status, 302);
  });
});

test('/api/tables requires admin privileges', async () => {
  await withServer(async (baseUrl) => {
    const noAuthRes = await fetch(`${baseUrl}/api/tables`);
    assert.equal(noAuthRes.status, 401);

    const staffToken = jwt.sign(
      { id: 123, email: 'staff@example.com', role: 'staff' },
      getJwtSecret(),
    );
    const staffRes = await fetch(`${baseUrl}/api/tables`, {
      headers: { authorization: `Bearer ${staffToken}` },
    });
    assert.equal(staffRes.status, 403);
  });
});

test('production rejects the default JWT secret', () => {
  const oldNodeEnv = process.env.NODE_ENV;
  const oldSecret = process.env.JWT_SECRET;
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;
    assert.throws(() => getJwtSecret(), /JWT_SECRET must be set/);

    process.env.JWT_SECRET = 'custom-production-secret';
    assert.equal(getJwtSecret(), 'custom-production-secret');
  } finally {
    process.env.NODE_ENV = oldNodeEnv;
    if (oldSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = oldSecret;
  }
});

test('mergeOmittedFields preserves stored values but allows explicit nulls', () => {
  const merged = mergeOmittedFields(
    {
      so_du_sau_giao_dich: 5000,
      ma_giao_dich_ngan_hang: 'BANK-1',
      doi_tuong_id: 10,
    },
    {
      doi_tuong_id: null,
    },
    ['so_du_sau_giao_dich', 'ma_giao_dich_ngan_hang', 'doi_tuong_id'],
  );

  assert.deepEqual(merged, {
    so_du_sau_giao_dich: 5000,
    ma_giao_dich_ngan_hang: 'BANK-1',
    doi_tuong_id: null,
  });
});

test('date-only cashflow edits keep the stored transaction time', () => {
  assert.equal(
    parseNgayGiaoDichForUpdate('2026-09-23', '2026-09-20 14:35:12'),
    '2026-09-23 14:35:12',
  );
});
