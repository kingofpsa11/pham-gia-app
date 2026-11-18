import assert from 'node:assert/strict';
import test from 'node:test';
import { driveApi } from './utils/googleDrive.js';

test('driveApi sends query parameters supplied with the qs option', async (t) => {
  const originalFetch = globalThis.fetch;
  const requests = [];

  globalThis.fetch = async (url, options) => {
    requests.push({ url: new URL(String(url)), options });
    return {
      ok: true,
      text: async () => JSON.stringify({ ok: true }),
    };
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const body = { title: 'BV', mimeType: 'application/vnd.google-apps.folder' };
  const result = await driveApi('token-123', 'files', {
    method: 'POST',
    apiVersion: 'v2',
    qs: {
      q: "title = 'BV'",
      fields: 'items(id,title)',
      supportsAllDrives: 'true',
      ignoredEmpty: '',
      ignoredNull: null,
    },
    body,
  });

  assert.deepEqual(result, { ok: true });
  assert.equal(requests.length, 1);
  const [{ url, options }] = requests;
  assert.equal(url.pathname, '/drive/v2/files');
  assert.equal(url.searchParams.get('q'), "title = 'BV'");
  assert.equal(url.searchParams.get('fields'), 'items(id,title)');
  assert.equal(url.searchParams.get('supportsAllDrives'), 'true');
  assert.equal(url.searchParams.has('ignoredEmpty'), false);
  assert.equal(url.searchParams.has('ignoredNull'), false);
  assert.equal(options.method, 'POST');
  assert.equal(options.headers.Authorization, 'Bearer token-123');
  assert.equal(options.headers['Content-Type'], 'application/json');
  assert.equal(options.body, JSON.stringify(body));
});
