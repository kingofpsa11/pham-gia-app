import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { DEFAULT_JWT_SECRET, getJwtSecret } from './utils/jwtSecret.js';

async function source(path) {
  return readFile(new URL(path, import.meta.url), 'utf8');
}

test('production refuses the hardcoded JWT fallback secret', () => {
  const originalSecret = process.env.JWT_SECRET;
  const originalNodeEnv = process.env.NODE_ENV;

  try {
    delete process.env.JWT_SECRET;
    process.env.NODE_ENV = 'production';
    assert.throws(() => getJwtSecret(), /JWT_SECRET/);

    process.env.JWT_SECRET = 'configured-secret';
    assert.equal(getJwtSecret(), 'configured-secret');

    process.env.NODE_ENV = 'development';
    delete process.env.JWT_SECRET;
    assert.equal(getJwtSecret(), DEFAULT_JWT_SECRET);
  } finally {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;

    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  }
});

test('business API mounts behind auth while public callbacks remain before the gate', async () => {
  const index = await source('./index.js');

  const authMount = index.indexOf("app.use('/api/auth', authRouter)");
  const googleMount = index.indexOf("app.use('/api', googleDriveRouter)");
  const apiGate = index.indexOf("app.use('/api', requireAuth)");
  const dashboardMount = index.indexOf("app.use('/api', dashboardRouter)");

  assert.match(index, /app\.get\('\/api\/tables', requireAdmin,/);
  assert.ok(authMount >= 0 && authMount < apiGate, 'login must remain public');
  assert.ok(googleMount >= 0 && googleMount < apiGate, 'OAuth callback must remain public');
  assert.ok(apiGate >= 0 && apiGate < dashboardMount, 'business routers must be behind auth');
});

test('quote Excel export requires an authenticated user', async () => {
  const route = await source('./routes/xuat-bao-gia-excel.js');

  assert.match(route, /import \{ requireAuth \} from '\.\.\/middleware\/auth\.js';/);
  assert.match(route, /router\.post\('\/xuat-bao-gia-excel', requireAuth,/);
  assert.doesNotMatch(route, /optionalAuth/);
});

test('delivery-note updates preserve omitted persisted fields', async () => {
  const route = await source('./routes/phieu-giao-hang.js');

  assert.match(route, /SELECT \* FROM phieu_giao_hang WHERE id = \?/);
  assert.match(route, /hasOwn\(body, 'so_phieu'\) \? body\.so_phieu : existing\.so_phieu/);
  assert.match(route, /hasOwn\(body, 'nguoi_tao'\) \? body\.nguoi_tao \|\| '' : existing\.nguoi_tao \|\| ''/);
  assert.match(route, /Array\.isArray\(body\.chi_tiet\)[\s\S]+existing\.gia_tri_ghi_no \?\? 0/);
});

test('cashflow updates preserve bank metadata, direction, balance, and existing time', async () => {
  const route = await source('./routes/dong-tien-moi.js');

  assert.match(route, /function resolveNgayGiaoDich\(body, existing\)/);
  assert.match(route, /existingRaw\.startsWith\(raw\)[\s\S]+return existingRaw/);
  assert.match(route, /fieldOrExisting\(body, existing, 'chieu_tien'\)/);
  assert.match(route, /nullableFieldOrExisting\(body, existing, 'so_du_sau_giao_dich'\)/);
  assert.match(route, /nullableFieldOrExisting\(body, existing, 'ma_giao_dich_ngan_hang'\)/);
  assert.match(route, /SELECT \* FROM dong_tien_moi WHERE id = \?/);
  assert.match(route, /fieldOrExisting\(item, existing, 'chieu_tien'\)/);
  assert.match(route, /nullableFieldOrExisting\(item, existing, 'so_du_sau_giao_dich'\)/);
});
