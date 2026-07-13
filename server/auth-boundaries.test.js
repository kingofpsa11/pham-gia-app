import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-for-auth-boundaries';

const { createApp } = await import('./index.js');
const { DEFAULT_JWT_SECRET, getJwtSecret } = await import('./middleware/auth.js');

async function withServer(run) {
  const server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  try {
    return await run(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

test('blocks unauthenticated access to business and schema APIs before database handlers run', async () => {
  await withServer(async (baseUrl) => {
    const cases = [
      ['GET', '/api/tables'],
      ['GET', '/api/dashboard-stats'],
      ['GET', '/api/khach-hang'],
      ['DELETE', '/api/khach-hang/1'],
      ['POST', '/api/dong-tien-moi'],
    ];

    for (const [method, path] of cases) {
      const response = await fetch(`${baseUrl}${path}`, { method });
      assert.equal(response.status, 401, `${method} ${path}`);
      assert.equal((await response.json()).error, 'Unauthorized');
    }
  });
});

test('keeps login and Google OAuth callback public', async () => {
  await withServer(async (baseUrl) => {
    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(loginResponse.status, 400);

    const callbackResponse = await fetch(`${baseUrl}/api/google-drive/callback`, {
      redirect: 'manual',
    });
    assert.equal(callbackResponse.status, 302);
    assert.notEqual(callbackResponse.status, 401);
  });
});

test('rejects missing or default JWT secrets', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalJwtSecret = process.env.JWT_SECRET;

  try {
    process.env.NODE_ENV = 'development';
    delete process.env.JWT_SECRET;
    assert.throws(() => getJwtSecret(), /JWT_SECRET must be set/);

    process.env.JWT_SECRET = DEFAULT_JWT_SECRET;
    assert.throws(() => getJwtSecret(), /JWT_SECRET must be set/);

    process.env.JWT_SECRET = 'production-secret-with-entropy';
    assert.equal(getJwtSecret(), 'production-secret-with-entropy');
  } finally {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.JWT_SECRET = originalJwtSecret;
  }
});
