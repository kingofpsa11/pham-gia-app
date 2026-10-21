import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getJwtSecret, DEFAULT_JWT_SECRET } from './utils/jwtSecret.js';
import { patchValue } from './utils/patchMerge.js';

function source(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

test('production refuses the built-in JWT secret', () => {
  const oldEnv = process.env.NODE_ENV;
  const oldSecret = process.env.JWT_SECRET;
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;
    assert.throws(() => getJwtSecret(), /JWT_SECRET/);
    process.env.JWT_SECRET = DEFAULT_JWT_SECRET;
    assert.throws(() => getJwtSecret(), /JWT_SECRET/);
    process.env.JWT_SECRET = 'production-secret';
    assert.equal(getJwtSecret(), 'production-secret');
  } finally {
    if (oldEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = oldEnv;
    if (oldSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = oldSecret;
  }
});

test('patchValue preserves omitted persisted fields but applies explicit clears', () => {
  const existing = {
    so_du_sau_giao_dich: 123456,
    ma_giao_dich_ngan_hang: 'BANK-1',
  };
  assert.equal(patchValue({}, existing, 'so_du_sau_giao_dich'), 123456);
  assert.equal(
    patchValue({ ma_giao_dich_ngan_hang: null }, existing, 'ma_giao_dich_ngan_hang', (v) => v ?? null),
    null,
  );
});

test('API routes are protected after public health/auth/oauth callbacks', () => {
  const index = source('./index.js');
  const authMount = index.indexOf("app.use('/api/auth', authRouter)");
  const googleMount = index.indexOf("app.use('/api', googleDriveRouter)");
  const authGate = index.indexOf("app.use('/api', requireAuth)");
  const dataMount = index.indexOf("app.use('/api', dashboardRouter)");
  assert.ok(authMount >= 0 && authMount < authGate);
  assert.ok(googleMount >= 0 && googleMount < authGate);
  assert.ok(authGate >= 0 && authGate < dataMount);
  assert.match(index, /app\.get\('\/api\/tables', requireAdmin,/);
});

test('quote Excel export requires an authenticated user', () => {
  const route = source('./routes/xuat-bao-gia-excel.js');
  assert.match(route, /import \{ requireAuth \}/);
  assert.match(route, /router\.post\('\/xuat-bao-gia-excel', requireAuth,/);
});

test('financial and delivery updates merge omitted critical fields', () => {
  const dongTien = source('./routes/dong-tien-moi.js');
  assert.match(dongTien, /SELECT \* FROM dong_tien_moi WHERE id = \?/);
  for (const field of [
    'doi_tuong_id',
    'so_du_sau_giao_dich',
    'ma_giao_dich_ngan_hang',
    'chieu_tien',
  ]) {
    assert.match(dongTien, new RegExp(`patchValue\\(body, existing, '${field}'`));
  }

  const pgh = source('./routes/phieu-giao-hang.js');
  assert.match(pgh, /SELECT \* FROM phieu_giao_hang WHERE id = \?/);
  assert.match(pgh, /existing\.gia_tri_ghi_no/);
  assert.match(pgh, /patchValue\(body, existing, 'so_phieu'/);
  assert.match(pgh, /patchValue\(body, existing, 'nguoi_tao'/);
});

test('contract Drive folders are only reused from direct safe parents', () => {
  const drive = source('./utils/hopDongDrive.js');
  assert.doesNotMatch(drive, /moveToParent/);
  assert.doesNotMatch(drive, /findFolderByStt/);
  assert.match(drive, /const underRoot = named\.filter/);
  assert.match(drive, /contractFolder = exact;/);
});
