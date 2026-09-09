import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_JWT_SECRET, getJwtSecret } from './utils/jwtSecret.js';
import { mergeOmittedFields, preserveExistingTimeForDateOnly } from './utils/patchMerge.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const originalNodeEnv = process.env.NODE_ENV;
const originalJwtSecret = process.env.JWT_SECRET;

afterEach(() => {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;

  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalJwtSecret;
});

describe('auth boundary regressions', () => {
  it('keeps business API routes behind auth while leaving login and Google callbacks public', () => {
    const indexSource = readFileSync(path.join(__dirname, 'index.js'), 'utf8');

    const authRouter = indexSource.indexOf("app.use('/api/auth', authRouter)");
    const googleRouter = indexSource.indexOf("app.use('/api', googleDriveRouter)");
    const authBoundary = indexSource.indexOf("app.use('/api', requireAuth)");
    const businessRouter = indexSource.indexOf("app.use('/api', dashboardRouter)");

    assert.ok(authRouter !== -1, 'login route must be mounted');
    assert.ok(googleRouter !== -1, 'Google OAuth callback router must be mounted');
    assert.ok(authBoundary !== -1, 'global /api auth boundary must be mounted');
    assert.ok(businessRouter !== -1, 'business routers must still be mounted');
    assert.ok(authRouter < authBoundary, 'login must remain public');
    assert.ok(googleRouter < authBoundary, 'Google OAuth callbacks must remain public');
    assert.ok(authBoundary < businessRouter, 'business routers must be protected');
    assert.match(indexSource, /app\.get\('\/api\/tables', requireAdmin,/);
  });

  it('requires a non-default JWT secret in production', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;
    assert.throws(() => getJwtSecret(), /JWT_SECRET must be configured/);

    process.env.JWT_SECRET = DEFAULT_JWT_SECRET;
    assert.throws(() => getJwtSecret(), /JWT_SECRET must be configured/);

    process.env.JWT_SECRET = 'a-real-production-secret';
    assert.equal(getJwtSecret(), 'a-real-production-secret');
  });

  it('requires authentication for quote Excel exports', () => {
    const exportSource = readFileSync(path.join(__dirname, 'routes/xuat-bao-gia-excel.js'), 'utf8');
    assert.match(exportSource, /router\.post\('\/xuat-bao-gia-excel', requireAuth,/);
    assert.doesNotMatch(exportSource, /optionalAuth/);
  });
});

describe('omitted update field regressions', () => {
  it('preserves omitted fields while respecting explicit nulls', () => {
    const existing = {
      so_du_sau_giao_dich: 1200000,
      doi_tuong_id: 9,
      ma_giao_dich_ngan_hang: 'FT123',
      ghi_chu: 'old note',
    };
    const patch = { ghi_chu: null };

    assert.deepEqual(
      mergeOmittedFields(patch, existing, [
        'so_du_sau_giao_dich',
        'doi_tuong_id',
        'ma_giao_dich_ngan_hang',
        'ghi_chu',
      ]),
      {
        so_du_sau_giao_dich: 1200000,
        doi_tuong_id: 9,
        ma_giao_dich_ngan_hang: 'FT123',
        ghi_chu: null,
      },
    );
  });

  it('keeps the existing time when an edit submits the same date without time', () => {
    assert.equal(
      preserveExistingTimeForDateOnly('2026-09-05', '2026-09-05 14:23:45'),
      '2026-09-05 14:23:45',
    );
    assert.equal(
      preserveExistingTimeForDateOnly('2026-09-06', '2026-09-05 14:23:45'),
      '2026-09-06',
    );
  });
});
