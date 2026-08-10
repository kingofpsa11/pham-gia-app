import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { hasOwnValue, patchValue } from './utils/patchMerge.js';

async function source(relativePath) {
  return readFile(new URL(relativePath, import.meta.url), 'utf8');
}

test('patchValue preserves omitted fields while allowing explicit empty values', () => {
  const existing = {
    so_du_sau_giao_dich: '1500000.00',
    ma_giao_dich_ngan_hang: 'BANK-123',
    ghi_chu: 'keep me',
  };

  assert.equal(patchValue({}, existing, 'so_du_sau_giao_dich'), '1500000.00');
  assert.equal(patchValue({ ma_giao_dich_ngan_hang: '' }, existing, 'ma_giao_dich_ngan_hang'), '');
  assert.equal(patchValue({ ghi_chu: null }, existing, 'ghi_chu'), null);
  assert.equal(hasOwnValue({}, 'ghi_chu'), false);
  assert.equal(hasOwnValue({ ghi_chu: null }, 'ghi_chu'), true);
});

test('business API routes are mounted behind auth while public callbacks stay public', async () => {
  const index = await source('./index.js');

  assert.match(index, /import \{ requireAuth, requireAdmin \} from '\.\/middleware\/auth\.js';/);
  assert.match(index, /app\.get\('\/api\/tables', requireAdmin,/);

  const healthRoute = index.indexOf("app.get('/api/health'");
  const authRouter = index.indexOf("app.use('/api/auth', authRouter);");
  const googleRouter = index.indexOf("app.use('/api', googleDriveRouter);");
  const authGate = index.indexOf("app.use('/api', requireAuth);");
  const dashboardRouter = index.indexOf("app.use('/api', dashboardRouter);");
  const usersRouter = index.indexOf("app.use('/api', usersRouter);");

  assert.ok(healthRoute >= 0 && healthRoute < authGate, 'health check must remain public');
  assert.ok(authRouter >= 0 && authRouter < authGate, 'login route must remain public');
  assert.ok(googleRouter >= 0 && googleRouter < authGate, 'OAuth callback must remain public');
  assert.ok(dashboardRouter > authGate, 'business routers must be after the auth gate');
  assert.ok(usersRouter > authGate, 'admin/user routers must be after the auth gate');
});

test('JWT handling is shared and production rejects the default secret', async () => {
  const middleware = await source('./middleware/auth.js');
  const authRoute = await source('./routes/auth.js');
  const googleRoute = await source('./routes/google-drive.js');
  const jwtSecret = await source('./utils/jwtSecret.js');

  assert.match(middleware, /const JWT_SECRET = getJwtSecret\(\);/);
  assert.match(authRoute, /import \{ findUserTable, getUserColumns, pickColumn \} from '\.\.\/utils\/userTable\.js';/);
  assert.match(authRoute, /const JWT_SECRET = getJwtSecret\(\);/);
  assert.match(googleRoute, /const JWT_SECRET = getJwtSecret\(\);/);
  assert.match(jwtSecret, /NODE_ENV === 'production'/);
  assert.match(jwtSecret, /throw new Error\('JWT_SECRET must be set in production'\);/);
});

test('quote Excel export requires an authenticated user', async () => {
  const exportRoute = await source('./routes/xuat-bao-gia-excel.js');

  assert.match(exportRoute, /import \{ requireAuth \} from '\.\.\/middleware\/auth\.js';/);
  assert.match(exportRoute, /router\.post\('\/xuat-bao-gia-excel', requireAuth,/);
  assert.doesNotMatch(exportRoute, /optionalAuth/);
});

test('delivery note updates preserve omitted persisted fields and details', async () => {
  const route = await source('./routes/phieu-giao-hang.js');

  assert.match(route, /SELECT \* FROM phieu_giao_hang WHERE id = \?/);
  assert.match(route, /const hopDongId = patchValue\(body, existing, 'hop_dong_id'\);/);
  assert.match(route, /patchValue\(body, existing, 'so_phieu'\)/);
  assert.match(route, /patchValue\(body, existing, 'nguoi_tao'\)/);
  assert.match(route, /hasOwnValue\(body, 'chi_tiet'\)/);
  assert.match(route, /: existing\.gia_tri_ghi_no;/);
});

test('cashflow updates preserve omitted accounting metadata', async () => {
  const route = await source('./routes/dong-tien-moi.js');

  assert.match(route, /SELECT \* FROM dong_tien_moi WHERE id = \?/);
  assert.match(route, /const value = \(key\) => patchValue\(body, existing, key\);/);
  assert.match(route, /const value = \(key\) => patchValue\(item, existing, key\);/);
  assert.match(route, /value\('so_du_sau_giao_dich'\) \?\? null/);
  assert.match(route, /value\('ma_giao_dich_ngan_hang'\) \|\| null/);
  assert.match(route, /value\('chieu_tien'\) \|\| null/);
});
