import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import app from './index.js';
import pool from './db.js';

after(async () => {
  await pool.end();
});

async function withServer(run) {
  const server = createServer(app);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const { port } = server.address();
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

test('business API routes reject unauthenticated requests before handlers run', async () => {
  await withServer(async (baseUrl) => {
    const endpoints = [
      { path: '/api/khach-hang', method: 'POST' },
      { path: '/api/bao-gia', method: 'POST' },
      { path: '/api/dong-tien-moi', method: 'POST' },
      { path: '/api/xuat-bao-gia-excel', method: 'POST' },
      { path: '/api/tables', method: 'GET' },
    ];

    for (const endpoint of endpoints) {
      const res = await fetch(`${baseUrl}${endpoint.path}`, {
        method: endpoint.method,
        headers: { 'Content-Type': 'application/json' },
        body: endpoint.method === 'GET' ? undefined : '{}',
      });
      const body = await res.json();

      assert.equal(res.status, 401, `${endpoint.method} ${endpoint.path}`);
      assert.equal(body.error, 'Unauthorized');
    }
  });
});

test('login validation remains public', async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const body = await res.json();

    assert.equal(res.status, 400);
    assert.equal(body.error, 'Email và mật khẩu là bắt buộc');
  });
});

test('google drive oauth callback remains public', async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/google-drive/callback`, {
      redirect: 'manual',
    });

    assert.equal(res.status, 302);
    assert.match(res.headers.get('location') || '', /drive_error=invalid_state/);
  });
});
