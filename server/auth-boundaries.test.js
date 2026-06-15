import assert from 'node:assert/strict';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import { requireApiAuth, isPublicApiRequest } from './middleware/apiAuth.js';
import { DEFAULT_JWT_SECRET, getJwtSecret } from './utils/jwtSecret.js';

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test('API auth middleware only allows explicit public routes without a token', () => {
  assert.equal(isPublicApiRequest({ method: 'POST', path: '/auth/login' }), true);
  assert.equal(isPublicApiRequest({ method: 'GET', path: '/google-drive/callback' }), true);
  assert.equal(isPublicApiRequest({ method: 'GET', path: '/khach-hang' }), false);

  let nextCalled = false;
  requireApiAuth(
    { method: 'POST', path: '/auth/login', headers: {} },
    makeRes(),
    () => { nextCalled = true; },
  );
  assert.equal(nextCalled, true);

  nextCalled = false;
  const res = makeRes();
  requireApiAuth(
    { method: 'GET', path: '/khach-hang', headers: {} },
    res,
    () => { nextCalled = true; },
  );
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
});

test('API auth middleware accepts valid bearer tokens on protected routes', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalJwtSecret = process.env.JWT_SECRET;
  process.env.NODE_ENV = 'test';
  delete process.env.JWT_SECRET;

  try {
    const token = jwt.sign(
      { id: 123, email: 'staff@example.test', role: 'staff' },
      DEFAULT_JWT_SECRET,
      { expiresIn: '1h' },
    );
    const req = {
      method: 'GET',
      path: '/khach-hang',
      headers: { authorization: `Bearer ${token}` },
    };
    let nextCalled = false;

    requireApiAuth(req, makeRes(), () => { nextCalled = true; });

    assert.equal(nextCalled, true);
    assert.deepEqual(req.user, { id: 123, email: 'staff@example.test', role: 'staff' });
  } finally {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalJwtSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalJwtSecret;
    }
  }
});

test('JWT secret must be non-default in production', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalJwtSecret = process.env.JWT_SECRET;

  try {
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;
    assert.throws(() => getJwtSecret(), /JWT_SECRET/);

    process.env.JWT_SECRET = DEFAULT_JWT_SECRET;
    assert.throws(() => getJwtSecret(), /JWT_SECRET/);

    process.env.JWT_SECRET = 'strong-production-secret';
    assert.equal(getJwtSecret(), 'strong-production-secret');
  } finally {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalJwtSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalJwtSecret;
    }
  }
});
