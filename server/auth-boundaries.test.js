import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_JWT_SECRET,
  assertJwtSecretConfigured,
  getJwtSecret,
} from './middleware/auth.js';
import { isPublicApiRequest } from './middleware/apiAuthGate.js';

function request(path, method = 'GET') {
  return { path, method };
}

function withEnv(values, fn) {
  const previous = {};
  for (const key of Object.keys(values)) {
    previous[key] = process.env[key];
    if (values[key] === undefined) delete process.env[key];
    else process.env[key] = values[key];
  }
  try {
    fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('API auth gate only leaves the Google OAuth callback public', () => {
  assert.equal(isPublicApiRequest(request('/google-drive/callback')), true);
  assert.equal(isPublicApiRequest(request('/google-drive/callback', 'POST')), false);
  assert.equal(isPublicApiRequest(request('/tables')), false);
  assert.equal(isPublicApiRequest(request('/dashboard-stats')), false);
  assert.equal(isPublicApiRequest(request('/hop-dong')), false);
  assert.equal(isPublicApiRequest(request('/xuat-bao-gia-excel', 'POST')), false);
});

test('JWT secret fallback is rejected in production', () => {
  withEnv({ JWT_SECRET: undefined, NODE_ENV: 'production' }, () => {
    assert.throws(() => getJwtSecret(), /JWT_SECRET must be set/);
    assert.throws(() => assertJwtSecretConfigured(), /JWT_SECRET must be set/);
  });
});

test('JWT secret fallback remains available outside production', () => {
  withEnv({ JWT_SECRET: undefined, NODE_ENV: 'development' }, () => {
    assert.equal(getJwtSecret(), DEFAULT_JWT_SECRET);
    assert.doesNotThrow(() => assertJwtSecretConfigured());
  });
});
