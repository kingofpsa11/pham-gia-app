import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';

process.env.NODE_ENV = 'test';

const { createApp } = await import('./index.js');
const { getJwtSecret } = await import('./middleware/auth.js');

function request(app, { method = 'GET', path, headers = {}, body = '' }) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: address.port,
          path,
          method,
          headers,
        },
        (res) => {
          let responseBody = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => {
            responseBody += chunk;
          });
          res.on('end', () => {
            server.close(() => {
              resolve({
                status: res.statusCode,
                headers: res.headers,
                body: responseBody,
              });
            });
          });
        },
      );

      req.on('error', (err) => {
        server.close(() => reject(err));
      });
      if (body) req.write(body);
      req.end();
    });
  });
}

test('business API routes require a JWT before reaching handlers', async () => {
  const app = createApp();

  const res = await request(app, {
    method: 'DELETE',
    path: '/api/khach-hang/123',
  });

  assert.equal(res.status, 401);
  assert.match(res.body, /Unauthorized/);
});

test('schema introspection route requires a JWT', async () => {
  const app = createApp();

  const res = await request(app, {
    method: 'GET',
    path: '/api/tables',
  });

  assert.equal(res.status, 401);
});

test('login route remains public', async () => {
  const app = createApp();

  const res = await request(app, {
    method: 'POST',
    path: '/api/auth/login',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });

  assert.equal(res.status, 400);
});

test('Google Drive OAuth callback remains public', async () => {
  const app = createApp();

  const res = await request(app, {
    method: 'GET',
    path: '/api/google-drive/callback',
  });

  assert.equal(res.status, 302);
  assert.match(res.headers.location, /drive_error=invalid_state/);
});

test('production configuration must provide a unique JWT secret', () => {
  const oldNodeEnv = process.env.NODE_ENV;
  const oldJwtSecret = process.env.JWT_SECRET;

  process.env.NODE_ENV = 'production';
  delete process.env.JWT_SECRET;

  assert.throws(() => getJwtSecret(), /JWT_SECRET must be set in production/);

  process.env.NODE_ENV = oldNodeEnv;
  if (oldJwtSecret === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = oldJwtSecret;
  }
});
