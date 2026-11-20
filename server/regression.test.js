import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { mergeOmittedFields } from './utils/patchMerge.js';
import { getJwtSecret } from './utils/jwtSecret.js';

test('mergeOmittedFields preserves omitted values and keeps explicit clears', () => {
  const merged = mergeOmittedFields(
    {
      so_phieu: 'GH-001',
      nguoi_tao: 'Admin',
      so_du_sau_giao_dich: 1200000,
      ma_giao_dich_ngan_hang: 'BANK-123',
    },
    {
      nguoi_tao: '',
      ghi_chu: 'updated',
      ma_giao_dich_ngan_hang: null,
    },
    ['so_phieu', 'nguoi_tao', 'so_du_sau_giao_dich', 'ma_giao_dich_ngan_hang'],
  );

  assert.equal(merged.so_phieu, 'GH-001');
  assert.equal(merged.nguoi_tao, '');
  assert.equal(merged.so_du_sau_giao_dich, 1200000);
  assert.equal(merged.ma_giao_dich_ngan_hang, null);
});

test('production refuses the built-in JWT fallback secret', () => {
  const oldEnv = process.env.NODE_ENV;
  const oldSecret = process.env.JWT_SECRET;
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;
    assert.throws(() => getJwtSecret(), /JWT_SECRET must be set/);

    process.env.JWT_SECRET = 'production-secret';
    assert.equal(getJwtSecret(), 'production-secret');
  } finally {
    if (oldEnv == null) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = oldEnv;
    if (oldSecret == null) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = oldSecret;
  }
});

test('index mounts auth before protected API routers while leaving OAuth callback public', async () => {
  const source = await readFile(new URL('./index.js', import.meta.url), 'utf8');
  assert.match(source, /app\.get\('\/api\/tables', requireAdmin,/);

  const authRouter = source.indexOf("app.use('/api/auth', authRouter)");
  const googleRouter = source.indexOf("app.use('/api', googleDriveRouter)");
  const authGate = source.indexOf("app.use('/api', requireAuth)");
  const dashboardRouter = source.indexOf("app.use('/api', dashboardRouter)");

  assert.ok(authRouter > -1, 'auth router is mounted');
  assert.ok(googleRouter > authRouter, 'Google OAuth routes are mounted after login');
  assert.ok(authGate > googleRouter, 'global auth gate follows public OAuth callback routes');
  assert.ok(dashboardRouter > authGate, 'protected routers mount after global auth gate');
});

test('contract Drive folder lookup no longer reuses STT-only sibling matches', async () => {
  const source = await readFile(new URL('./utils/hopDongDrive.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /existingByStt|findFolderByStt/);
  assert.match(source, /const exact = \(siblings \|\| \[\]\)\.find\(\(f\) => f\.name === wantedName\)/);
});

test('cashflow edit form preserves stored internal-transfer direction', async () => {
  const source = await readFile(new URL('../src/pages/dong-tien/DongTienMoiList.tsx', import.meta.url), 'utf8');
  assert.match(source, /chieu_tien: row\.chieu_tien \|\| ''/);
  assert.match(source, /chieu_tien: loaiGd === 'chuyen_khoan_noi_bo' \? \(form\.chieu_tien \|\| 'chi'\) : null/);
});

