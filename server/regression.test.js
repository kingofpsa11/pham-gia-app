import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getJwtSecret, DEFAULT_JWT_SECRET } from './utils/jwtSecret.js';
import { mergeDateWithExistingTime, mergeMissingFields } from './utils/patchMerge.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const originalEnv = { NODE_ENV: process.env.NODE_ENV, JWT_SECRET: process.env.JWT_SECRET };

afterEach(() => {
  process.env.NODE_ENV = originalEnv.NODE_ENV;
  if (originalEnv.JWT_SECRET === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalEnv.JWT_SECRET;
});

describe('critical auth and update regressions', () => {
  it('rejects the default JWT secret in production', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;

    assert.throws(() => getJwtSecret(), /JWT_SECRET must be set in production/);
  });

  it('allows explicit JWT secrets outside the unsafe default', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'a-real-production-secret';

    assert.equal(getJwtSecret(), 'a-real-production-secret');
    process.env.NODE_ENV = 'development';
    delete process.env.JWT_SECRET;
    assert.equal(getJwtSecret(), DEFAULT_JWT_SECRET);
  });

  it('preserves existing values only when fields are omitted', () => {
    const merged = mergeMissingFields(
      { so_phieu: null, noi_dung: 'updated' },
      { so_phieu: 'GH001', nguoi_tao: 'Admin', noi_dung: 'old' },
      ['so_phieu', 'nguoi_tao', 'noi_dung'],
    );

    assert.deepEqual(merged, {
      so_phieu: null,
      nguoi_tao: 'Admin',
      noi_dung: 'updated',
    });
  });

  it('keeps the existing cashflow time when a date-only edit is submitted', () => {
    assert.equal(
      mergeDateWithExistingTime('2026-09-24', '2026-09-22 13:45:17'),
      '2026-09-24 13:45:17',
    );
    assert.equal(
      mergeDateWithExistingTime('2026-09-24 08:00:00', '2026-09-22 13:45:17'),
      '2026-09-24 08:00:00',
    );
  });

  it('keeps private API routers behind requireAuth while login and Drive callbacks stay public', () => {
    const indexSource = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
    const authRoute = indexSource.indexOf("app.use('/api/auth', authRouter)");
    const driveRoute = indexSource.indexOf("app.use('/api', googleDriveRouter)");
    const authGate = indexSource.indexOf("app.use('/api', requireAuth)");
    const dashboardRoute = indexSource.indexOf("app.use('/api', dashboardRouter)");
    const tablesRoute = indexSource.indexOf("app.get('/api/tables', requireAdmin");

    assert.ok(authRoute !== -1, 'auth router is mounted');
    assert.ok(driveRoute !== -1, 'Google Drive router is mounted');
    assert.ok(authGate !== -1, 'global API auth gate is mounted');
    assert.ok(dashboardRoute !== -1, 'private routers are mounted');
    assert.ok(tablesRoute !== -1, '/api/tables is admin-only');
    assert.ok(authRoute < authGate, 'login stays public before global auth');
    assert.ok(driveRoute < authGate, 'Drive OAuth callbacks stay public before global auth');
    assert.ok(authGate < dashboardRoute, 'private routers mount after global auth');
  });
});
