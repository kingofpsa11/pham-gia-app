import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { getJwtSecret, DEFAULT_JWT_SECRET } from './utils/jwtSecret.js';
import { patchNullable, patchText, patchValue } from './utils/patchMerge.js';

test('production refuses to use the checked-in JWT fallback secret', () => {
  assert.throws(
    () => getJwtSecret({ NODE_ENV: 'production' }),
    /JWT_SECRET must be configured/,
  );
  assert.equal(getJwtSecret({ NODE_ENV: 'development' }), DEFAULT_JWT_SECRET);
  assert.equal(getJwtSecret({ NODE_ENV: 'production', JWT_SECRET: 'secret' }), 'secret');
});

test('patch merge helpers preserve omitted fields and apply explicit clears', () => {
  const existing = {
    so_du_sau_giao_dich: 123456,
    ma_giao_dich_ngan_hang: 'BANK-1',
    nguoi_tao: 'Admin',
  };

  assert.equal(patchValue({}, existing, 'so_du_sau_giao_dich'), 123456);
  assert.equal(patchValue({ so_du_sau_giao_dich: 0 }, existing, 'so_du_sau_giao_dich'), 0);
  assert.equal(patchNullable({}, existing, 'ma_giao_dich_ngan_hang'), 'BANK-1');
  assert.equal(patchNullable({ ma_giao_dich_ngan_hang: '' }, existing, 'ma_giao_dich_ngan_hang'), null);
  assert.equal(patchText({}, existing, 'nguoi_tao'), 'Admin');
});

test('API auth boundary is mounted before business routes while OAuth callback stays public', async () => {
  const indexSource = await readFile(new URL('./index.js', import.meta.url), 'utf8');

  assert.match(indexSource, /app\.get\('\/api\/tables', requireAdmin,/);

  const googleDriveMount = indexSource.indexOf("app.use('/api', googleDriveRouter);");
  const authBoundary = indexSource.indexOf("app.use('/api', requireAuth);");
  const businessMount = indexSource.indexOf("app.use('/api', dashboardRouter);");

  assert.ok(googleDriveMount > -1, 'google-drive router should be mounted');
  assert.ok(authBoundary > -1, 'global API auth boundary should be mounted');
  assert.ok(businessMount > -1, 'business routes should be mounted');
  assert.ok(googleDriveMount < authBoundary, 'Google OAuth callback must stay public');
  assert.ok(authBoundary < businessMount, 'business API routes must require auth');
});

test('contract Drive folder creation does not reuse a different project by STT only', async () => {
  const driveSource = await readFile(new URL('./utils/hopDongDrive.js', import.meta.url), 'utf8');

  assert.doesNotMatch(driveSource, /findFolderByStt\(siblings,\s*stt\)/);
  assert.doesNotMatch(driveSource, /existingByStt/);
  assert.match(driveSource, /const exact = \(siblings \|\| \[\]\)\.find\(\(f\) => f\.name === wantedName\);/);
});
