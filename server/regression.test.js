import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import jwt from 'jsonwebtoken';
import app from './index.js';
import { parseNgayGiaoDich, parseNgayHachToan, preserveDateOnlyTime } from './utils/dongTienDate.js';
import { DEFAULT_JWT_SECRET, getJwtSecret } from './utils/jwtSecret.js';
import { patchNullable, patchString, patchValue } from './utils/patchMerge.js';
import { findExistingContractFolder } from './utils/hopDongDrive.js';

let server;
let baseUrl;

function tokenFor(role) {
  return jwt.sign({ id: `${role}-user`, email: `${role}@example.com`, role }, getJwtSecret());
}

describe('API auth boundary', () => {
  before(async () => {
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const { port } = server.address();
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (!server) return;
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it('keeps login public', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    assert.equal(res.status, 400);
  });

  it('keeps Google OAuth callbacks public', async () => {
    const res = await fetch(`${baseUrl}/api/google-drive/callback`, { redirect: 'manual' });

    assert.equal(res.status, 302);
    assert.match(res.headers.get('location') || '', /drive_error=invalid_state/);
  });

  it('rejects unauthenticated business API requests before route handlers touch data', async () => {
    const res = await fetch(`${baseUrl}/api/khach-hang`);

    assert.equal(res.status, 401);
  });

  it('requires authentication before exporting quote Excel files', async () => {
    const res = await fetch(`${baseUrl}/api/xuat-bao-gia-excel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bao_gia_id: 1, mau_key: 'Hapulico' }),
    });

    assert.equal(res.status, 401);
  });

  it('keeps schema metadata admin-only', async () => {
    const unauthenticated = await fetch(`${baseUrl}/api/tables`);
    assert.equal(unauthenticated.status, 401);

    const staff = await fetch(`${baseUrl}/api/tables`, {
      headers: { Authorization: `Bearer ${tokenFor('staff')}` },
    });
    assert.equal(staff.status, 403);
  });
});

describe('JWT secret handling', () => {
  it('rejects the default JWT secret in production', () => {
    const oldEnv = process.env.NODE_ENV;
    const oldSecret = process.env.JWT_SECRET;
    try {
      process.env.NODE_ENV = 'production';
      delete process.env.JWT_SECRET;
      assert.throws(() => getJwtSecret(), /JWT_SECRET must be set in production/);
    } finally {
      process.env.NODE_ENV = oldEnv;
      if (oldSecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = oldSecret;
    }
  });

  it('allows the default JWT secret outside production', () => {
    const oldEnv = process.env.NODE_ENV;
    const oldSecret = process.env.JWT_SECRET;
    try {
      process.env.NODE_ENV = 'test';
      delete process.env.JWT_SECRET;
      assert.equal(getJwtSecret(), DEFAULT_JWT_SECRET);
    } finally {
      process.env.NODE_ENV = oldEnv;
      if (oldSecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = oldSecret;
    }
  });
});

describe('patch merge helpers', () => {
  it('preserves omitted values but allows explicit clearing', () => {
    const existing = {
      so_du_sau_giao_dich: 123_000,
      ma_giao_dich_ngan_hang: 'BANK-123',
      ghi_chu: 'old note',
    };

    assert.equal(patchValue({}, existing, 'so_du_sau_giao_dich'), 123_000);
    assert.equal(patchValue({ ma_giao_dich_ngan_hang: null }, existing, 'ma_giao_dich_ngan_hang'), null);
    assert.equal(patchNullable({ ghi_chu: '' }, existing, 'ghi_chu'), null);
    assert.equal(patchString({}, existing, 'ghi_chu'), 'old note');
  });
});

describe('cashflow date preservation', () => {
  it('keeps the existing transaction time for date-only edit payloads', () => {
    const merged = preserveDateOnlyTime('2026-08-05', '2026-08-01 09:30:00');

    assert.equal(merged, '2026-08-05 09:30:00');
    assert.equal(parseNgayGiaoDich(merged), '2026-08-05 09:30:00');
    assert.equal(parseNgayHachToan(merged), '2026-08-05');
  });

  it('leaves explicit transaction times unchanged', () => {
    assert.equal(
      preserveDateOnlyTime('2026-08-05 14:15:16', '2026-08-01 09:30:00'),
      '2026-08-05 14:15:16',
    );
  });
});

test('contract Drive folder lookup does not reuse STT-only matches', () => {
  const folders = [
    { id: 'old', name: '01 Old Customer - Old Project' },
    { id: 'exact', name: '01 New Customer - New Project' },
  ];

  assert.equal(findExistingContractFolder(folders, '01 Missing Customer - Missing Project'), null);
  assert.equal(findExistingContractFolder(folders, '01 New Customer - New Project')?.id, 'exact');
});
