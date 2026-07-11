import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import {
  DEFAULT_JWT_SECRET,
  JWT_SECRET,
  resolveJwtSecret,
} from './middleware/auth.js';
import { apiAuthGate } from './middleware/apiAuthGate.js';

function runGate({ method = 'GET', path = '/', headers = {} } = {}) {
  return new Promise((resolve) => {
    const req = { method, path, headers };
    const res = {
      statusCode: 200,
      body: undefined,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.body = body;
        resolve({
          nextCalled: false,
          statusCode: this.statusCode,
          body,
          user: req.user,
        });
      },
    };

    apiAuthGate(req, res, () => {
      resolve({
        nextCalled: true,
        statusCode: res.statusCode,
        body: res.body,
        user: req.user,
      });
    });
  });
}

test('api auth gate keeps login and OAuth callback public', async () => {
  assert.equal((await runGate({ method: 'POST', path: '/auth/login' })).nextCalled, true);
  assert.equal((await runGate({ method: 'GET', path: '/google-drive/callback' })).nextCalled, true);
});

test('api auth gate rejects protected API endpoints without a bearer token', async () => {
  for (const path of ['/tables', '/khach-hang', '/bao-gia/1']) {
    const result = await runGate({ method: 'GET', path });
    assert.equal(result.nextCalled, false);
    assert.equal(result.statusCode, 401);
    assert.equal(result.body?.error, 'Unauthorized');
  }
});

test('api auth gate accepts protected API endpoints with a valid bearer token', async () => {
  const token = jwt.sign(
    { id: 'user-1', email: 'user@example.com', role: 'staff' },
    JWT_SECRET,
  );

  const result = await runGate({
    method: 'POST',
    path: '/khach-hang',
    headers: { authorization: `Bearer ${token}` },
  });

  assert.equal(result.nextCalled, true);
  assert.deepEqual(result.user, {
    id: 'user-1',
    email: 'user@example.com',
    role: 'staff',
  });
});

test('production refuses to use the checked-in default JWT secret', () => {
  assert.throws(
    () => resolveJwtSecret({ NODE_ENV: 'production' }),
    /JWT_SECRET must be set/,
  );
  assert.throws(
    () => resolveJwtSecret({ NODE_ENV: 'production', JWT_SECRET: DEFAULT_JWT_SECRET }),
    /JWT_SECRET must be set/,
  );
  assert.equal(
    resolveJwtSecret({ NODE_ENV: 'production', JWT_SECRET: 'production-secret' }),
    'production-secret',
  );
});
