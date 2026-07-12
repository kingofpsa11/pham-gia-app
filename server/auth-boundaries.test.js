import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import jwt from 'jsonwebtoken';
import { apiAuthGate } from './middleware/apiAuthGate.js';
import { DEFAULT_JWT_SECRET, getJwtSecret } from './middleware/auth.js';

function runGate({ path, method = 'GET', authorization = '' }) {
  return new Promise((resolve, reject) => {
    const req = {
      method,
      path,
      headers: authorization ? { authorization } : {},
    };
    const res = {
      statusCode: 200,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        resolve({ nextCalled: false, statusCode: this.statusCode, body: payload, req });
        return this;
      },
    };

    try {
      apiAuthGate(req, res, (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve({ nextCalled: true, statusCode: res.statusCode, body: res.body, req });
      });
    } catch (err) {
      reject(err);
    }
  });
}

describe('apiAuthGate', () => {
  it('allows public API endpoints without a token', async () => {
    for (const path of ['/health', '/auth/login', '/google-drive/callback']) {
      const result = await runGate({ path });
      assert.equal(result.nextCalled, true);
    }
  });

  it('rejects protected API endpoints without a token', async () => {
    const result = await runGate({ path: '/khach-hang' });

    assert.equal(result.nextCalled, false);
    assert.equal(result.statusCode, 401);
    assert.equal(result.body.error, 'Unauthorized');
  });

  it('allows protected API endpoints with a valid token and attaches the user', async () => {
    const token = jwt.sign(
      { id: 'user-1', email: 'admin@example.com', role: 'admin' },
      getJwtSecret(),
    );
    const result = await runGate({
      path: '/khach-hang',
      authorization: `Bearer ${token}`,
    });

    assert.equal(result.nextCalled, true);
    assert.deepEqual(result.req.user, {
      id: 'user-1',
      email: 'admin@example.com',
      role: 'admin',
    });
  });
});

describe('getJwtSecret', () => {
  it('rejects the default secret in production', () => {
    const oldNodeEnv = process.env.NODE_ENV;
    const oldJwtSecret = process.env.JWT_SECRET;
    try {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = DEFAULT_JWT_SECRET;

      assert.throws(() => getJwtSecret(), /JWT_SECRET must be configured/);
    } finally {
      if (oldNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = oldNodeEnv;
      if (oldJwtSecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = oldJwtSecret;
    }
  });
});
