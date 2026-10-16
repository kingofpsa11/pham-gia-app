import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import jwt from 'jsonwebtoken';
import { requireAuth, requireAdmin } from './middleware/auth.js';
import { DEFAULT_JWT_SECRET, getJwtSecret } from './utils/jwtSecret.js';
import { patchNullable, patchNumber, patchText, patchValue } from './utils/patchMerge.js';

const originalEnv = {
  NODE_ENV: process.env.NODE_ENV,
  JWT_SECRET: process.env.JWT_SECRET,
};

function restoreEnv() {
  if (originalEnv.NODE_ENV === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalEnv.NODE_ENV;
  if (originalEnv.JWT_SECRET === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalEnv.JWT_SECRET;
}

function mockResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function runMiddleware(middleware, token = '') {
  const req = { headers: token ? { authorization: `Bearer ${token}` } : {} };
  const res = mockResponse();
  let nextCalled = false;
  middleware(req, res, () => {
    nextCalled = true;
  });
  return { req, res, nextCalled };
}

test.afterEach(restoreEnv);

test('production rejects missing or default JWT secret', () => {
  process.env.NODE_ENV = 'production';
  delete process.env.JWT_SECRET;
  assert.throws(() => getJwtSecret(), /JWT_SECRET must be set/);

  process.env.JWT_SECRET = DEFAULT_JWT_SECRET;
  assert.throws(() => getJwtSecret(), /JWT_SECRET must be set/);
});

test('auth middleware rejects tokens signed with the default secret in production', () => {
  process.env.NODE_ENV = 'production';
  delete process.env.JWT_SECRET;
  const token = jwt.sign({ id: 1, email: 'admin@example.com', role: 'admin' }, DEFAULT_JWT_SECRET);

  const { res, nextCalled } = runMiddleware(requireAuth, token);

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
});

test('auth middleware accepts a valid non-default production secret', () => {
  process.env.NODE_ENV = 'production';
  process.env.JWT_SECRET = 'a-production-secret-that-is-not-the-default';
  const token = jwt.sign({ id: 1, email: 'admin@example.com', role: 'admin' }, process.env.JWT_SECRET);

  const { req, nextCalled } = runMiddleware(requireAuth, token);

  assert.equal(nextCalled, true);
  assert.deepEqual(req.user, { id: 1, email: 'admin@example.com', role: 'admin' });
});

test('admin middleware rejects non-admin users', () => {
  process.env.JWT_SECRET = 'test-secret';
  const token = jwt.sign({ id: 2, email: 'staff@example.com', role: 'staff' }, process.env.JWT_SECRET);

  const { res, nextCalled } = runMiddleware(requireAdmin, token);

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
});

test('server mounts login before the global API auth gate', () => {
  const source = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
  const authMount = source.indexOf("app.use('/api/auth', authRouter);");
  const apiGate = source.indexOf("app.use('/api', (req, res, next) => {");
  const firstProtectedRouter = source.indexOf("app.use('/api', dashboardRouter);");

  assert.notEqual(authMount, -1);
  assert.notEqual(apiGate, -1);
  assert.notEqual(firstProtectedRouter, -1);
  assert.ok(authMount < apiGate);
  assert.ok(apiGate < firstProtectedRouter);
  assert.match(source, /app\.get\('\/api\/tables', requireAdmin,/);
  assert.match(source, /\/google-drive\/callback/);
  assert.match(source, /\/google\/callback/);
});

test('patch helpers preserve omitted fields and allow explicit clearing', () => {
  const existing = {
    so_du_sau_giao_dich: '1250000.50',
    ma_giao_dich_ngan_hang: 'BANK-123',
    nguoi_tao: 'Lan',
    so_tien: '500000',
  };

  assert.equal(patchValue({}, existing, 'so_du_sau_giao_dich'), '1250000.50');
  assert.equal(patchNullable({}, existing, 'ma_giao_dich_ngan_hang'), 'BANK-123');
  assert.equal(patchText({}, existing, 'nguoi_tao'), 'Lan');
  assert.equal(patchNumber({}, existing, 'so_tien'), 500000);

  assert.equal(patchNullable({ ma_giao_dich_ngan_hang: '' }, existing, 'ma_giao_dich_ngan_hang'), null);
  assert.equal(patchText({ nguoi_tao: '' }, existing, 'nguoi_tao'), '');
});
