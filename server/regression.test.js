import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import test from 'node:test';
import { preserveOmittedFields } from './utils/patchMerge.js';
import { getJwtSecret } from './utils/jwtSecret.js';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

async function fetchUntilReady(url, options = {}) {
  let lastErr;
  for (let i = 0; i < 40; i += 1) {
    try {
      return await fetch(url, options);
    } catch (err) {
      lastErr = err;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw lastErr;
}

function stopServer(child) {
  if (child.exitCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    child.once('exit', resolve);
    child.kill();
    setTimeout(() => child.kill('SIGKILL'), 1000).unref();
  });
}

test('protected API routes reject unauthenticated requests before database access', async () => {
  const port = await getFreePort();
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'development',
      JWT_SECRET: 'test-secret',
      DB_HOST: '127.0.0.1',
      DB_PORT: '1',
      DB_USER: 'test',
      DB_PASSWORD: 'test',
      DB_NAME: 'test',
    },
    stdio: 'ignore',
  });

  try {
    const base = `http://127.0.0.1:${port}`;
    const dashboard = await fetchUntilReady(`${base}/api/dashboard-stats`);
    assert.equal(dashboard.status, 401);

    const tables = await fetch(`${base}/api/tables`);
    assert.equal(tables.status, 401);

    const exportResp = await fetch(`${base}/api/xuat-bao-gia-excel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bao_gia_id: 1, mau_key: 'default' }),
    });
    assert.equal(exportResp.status, 401);

    const callback = await fetch(`${base}/api/google-drive/callback?state=bad`, {
      redirect: 'manual',
    });
    assert.equal(callback.status, 302);
  } finally {
    await stopServer(child);
  }
});

test('production requires an explicit JWT secret', () => {
  const oldNodeEnv = process.env.NODE_ENV;
  const oldSecret = process.env.JWT_SECRET;
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;
    assert.throws(() => getJwtSecret(), /JWT_SECRET must be configured/);

    process.env.JWT_SECRET = 'configured-secret';
    assert.equal(getJwtSecret(), 'configured-secret');
  } finally {
    if (oldNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = oldNodeEnv;
    if (oldSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = oldSecret;
  }
});

test('preserveOmittedFields keeps existing persisted values but allows explicit clears', () => {
  const existing = {
    so_tien: 1000,
    so_du_sau_giao_dich: 5000,
    ma_giao_dich_ngan_hang: 'BANK-123',
    chieu_tien: 'out',
  };
  const merged = preserveOmittedFields(
    { so_tien: 1200, ma_giao_dich_ngan_hang: null },
    existing,
    ['so_tien', 'so_du_sau_giao_dich', 'ma_giao_dich_ngan_hang', 'chieu_tien'],
  );

  assert.equal(merged.so_tien, 1200);
  assert.equal(merged.so_du_sau_giao_dich, 5000);
  assert.equal(merged.ma_giao_dich_ngan_hang, null);
  assert.equal(merged.chieu_tien, 'out');
});
