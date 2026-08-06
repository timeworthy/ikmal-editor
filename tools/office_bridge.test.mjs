import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const {
  createOfficeBridgeHandler,
  validateBackendURL,
} = require('../office-bridge/office_bridge.cjs');

function startServer(options = {}) {
  const server = http.createServer(createOfficeBridgeHandler({
    port: 8765,
    staticRoot: path.join(root, 'office-bridge', 'public', 'office'),
    ...options,
  }));
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function stopServer(server) {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

test('Office bridge serves local Word assets and health state', async () => {
  const server = await startServer();
  try {
    const address = server.address();
    const health = await fetch(`http://${address.address}:${address.port}/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).contract, 'ikmal-check-v1');
    const asset = await fetch(`http://${address.address}:${address.port}/office/word/`);
    assert.equal(asset.status, 200);
    assert.match(await asset.text(), /ikmal editor for Word/);
  } finally {
    await stopServer(server);
  }
});

test('Office bridge forwards only an exact-origin JSON check', async () => {
  let requestBody = '';
  const server = await startServer({
    fetchImpl: async (_url, request) => {
      requestBody = String(request.body);
      return new Response(JSON.stringify({ matches: [] }), { status: 200 });
    },
  });
  try {
    const address = server.address();
    const response = await fetch(`http://${address.address}:${address.port}/office/api/check`, {
      method: 'POST',
      headers: {
        Origin: 'https://localhost:8765',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ text: 'A sentence.', language: 'en-US' }),
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).text, 'A sentence.');
    assert.match(requestBody, /text=A\+sentence\./);
    assert.equal((await fetch(`http://${address.address}:${address.port}/office/api/check`, {
      method: 'POST',
      headers: { Origin: 'https://evil.example', 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'nope' }),
    })).status, 403);
  } finally {
    await stopServer(server);
  }
});

test('Office bridge rejects non-loopback checker targets', () => {
  assert.throws(() => validateBackendURL('https://example.com/v2/check'), /loopback/);
  assert.throws(() => validateBackendURL('http://127.0.0.1:8096/other'), /\/v2\/check/);
});

test('Office bridge CSP admits office.js but nothing else off-machine', async () => {
  const server = await startServer();
  try {
    const address = server.address();
    const response = await fetch(`http://${address.address}:${address.port}/office/word/`);
    const csp = response.headers.get('content-security-policy');

    // Every task pane loads office.js from Microsoft's CDN and cannot
    // initialize without it. A CSP that blocks it leaves the pane stuck.
    const scriptSrc = csp.split(';').map((part) => part.trim()).find((part) => part.startsWith('script-src'));
    assert.ok(scriptSrc, 'CSP must declare script-src rather than falling back to default-src');
    assert.match(scriptSrc, /https:\/\/appsforoffice\.microsoft\.com/);

    // The exception is that one origin. The pane must still be unable to
    // send document text anywhere but this loopback bridge.
    assert.match(csp, /connect-src 'self'/);
    assert.doesNotMatch(scriptSrc, /\*/);
  } finally {
    await stopServer(server);
  }
});
