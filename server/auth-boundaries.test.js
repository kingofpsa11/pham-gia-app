import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import jwt from 'jsonwebtoken';
import {
  DEFAULT_JWT_SECRET,
  getJwtSecret,
  requireAuth,
  verifyToken,
} from './middleware/auth.js';

function mockRes() {
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

test('business API routers are mounted behind JWT auth', () => {
  const source = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
  const publicLogin = source.indexOf("app.use('/api/auth', authRouter)");
  const googleCallback = source.indexOf("app.use('/api', googleDriveRouter)");
  const apiGate = source.indexOf("app.use('/api', requireAuth)");
  const businessRouter = source.indexOf("app.use('/api', dashboardRouter)");
  const tablesRoute = source.indexOf("app.get('/api/tables', requireAdmin");

  assert.ok(publicLogin >= 0, 'login router should be public before the API gate');
  assert.ok(googleCallback > publicLogin, 'Google OAuth callback router should stay before the API gate');
  assert.ok(apiGate > googleCallback, 'global API auth gate should follow public routes');
  assert.ok(tablesRoute > apiGate, '/api/tables should be behind the API gate');
  assert.ok(businessRouter > apiGate, 'business routers should be mounted after the API gate');
});

test('quote Excel export requires authentication', () => {
  const source = readFileSync(new URL('./routes/xuat-bao-gia-excel.js', import.meta.url), 'utf8');
  assert.match(source, /import \{ requireAuth \} from '\.\.\/middleware\/auth\.js';/);
  assert.match(source, /router\.post\('\/xuat-bao-gia-excel', requireAuth,/);
});

test('JWT secret rejects the checked-in fallback in production', () => {
  const previousEnv = process.env.NODE_ENV;
  const previousSecret = process.env.JWT_SECRET;
  try {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = DEFAULT_JWT_SECRET;
    assert.throws(() => getJwtSecret(), /JWT_SECRET must be set/);

    process.env.JWT_SECRET = 'real-secret-for-test';
    assert.equal(getJwtSecret(), 'real-secret-for-test');
  } finally {
    process.env.NODE_ENV = previousEnv;
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});

test('requireAuth accepts valid tokens and rejects missing tokens', () => {
  const previousEnv = process.env.NODE_ENV;
  const previousSecret = process.env.JWT_SECRET;
  try {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'auth-test-secret';

    const missingReq = { headers: {} };
    const missingRes = mockRes();
    let nextCalled = false;
    requireAuth(missingReq, missingRes, () => { nextCalled = true; });
    assert.equal(missingRes.statusCode, 401);
    assert.equal(nextCalled, false);

    const token = jwt.sign(
      { id: 'u1', email: 'owner@example.com', role: 'admin' },
      process.env.JWT_SECRET,
    );
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    requireAuth(req, res, () => { nextCalled = true; });
    assert.equal(res.statusCode, 200);
    assert.equal(nextCalled, true);
    assert.deepEqual(req.user, { id: 'u1', email: 'owner@example.com', role: 'admin' });
    assert.equal(verifyToken(token)?.id, 'u1');
  } finally {
    process.env.NODE_ENV = previousEnv;
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});
