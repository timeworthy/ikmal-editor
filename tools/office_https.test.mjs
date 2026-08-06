import assert from 'node:assert/strict';
import fs from 'node:fs';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { certificatePaths, generateOfficeCertificate } = require('../office-bridge/certificate.cjs');
const { createOfficeBridgeServer } = require('../office-bridge/office_bridge.cjs');

function requestHealth(port, certificatePath) {
  return new Promise((resolve, reject) => {
    const request = https.request({
      hostname: 'localhost',
      port,
      path: '/health',
      method: 'GET',
      rejectUnauthorized: false,
      ca: fs.readFileSync(certificatePath),
    }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body }));
    });
    request.on('error', reject);
    request.end();
  });
}

test('real local certificate can serve the HTTPS Office bridge', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ikmal-office-https-'));
  let server;
  try {
    try {
      generateOfficeCertificate({ directory });
    } catch (error) {
      if (error.code === 'ENOENT' || /Could not generate/.test(error.message)) {
        t.skip(`openssl unavailable in this environment: ${error.message}`);
        return;
      }
      throw error;
    }
    const paths = certificatePaths(directory);
    server = createOfficeBridgeServer({
      key: fs.readFileSync(paths.keyPath),
      cert: fs.readFileSync(paths.certificatePath),
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const response = await requestHealth(server.address().port, paths.certificatePath);
    assert.equal(response.status, 200);
    assert.match(response.body, /"status":"ok"/);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
