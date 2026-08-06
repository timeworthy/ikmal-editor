'use strict';

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const { URL } = require('node:url');
const {
  buildCheckBody,
  normalizeCheckResponse,
} = require('./check_contract.cjs');

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 8765;
const DEFAULT_BACKEND = 'http://127.0.0.1:8096/v2/check';
const DEFAULT_MAX_BODY = 256 * 1024;
const DEFAULT_TIMEOUT_MS = 8_000;
const OFFICE_HOSTS = new Set(['word', 'excel', 'powerpoint', 'outlook', 'onenote', 'project']);

function isLoopbackHostname(hostname) {
  const normalized = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  return normalized === 'localhost'
    || normalized === '127.0.0.1'
    || normalized === '::1';
}

function validateBackendURL(value) {
  const parsed = new URL(value || DEFAULT_BACKEND);
  if (!['http:', 'https:'].includes(parsed.protocol) || !isLoopbackHostname(parsed.hostname)) {
    throw new Error('Office bridge backend must be an HTTP(S) loopback URL');
  }
  if (parsed.pathname !== '/v2/check') {
    throw new Error('Office bridge backend must point to /v2/check');
  }
  return parsed;
}

function makeConfig(options = {}) {
  const port = Number(options.port || process.env.IKMAL_OFFICE_BRIDGE_PORT || DEFAULT_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Office bridge port must be a valid TCP port');
  }
  const host = options.host || process.env.IKMAL_OFFICE_BRIDGE_HOST || DEFAULT_HOST;
  if (!isLoopbackHostname(host)) {
    throw new Error('Office bridge host must be loopback-only');
  }
  const allowedOrigins = options.allowedOrigins || [
    `https://localhost:${port}`,
  ];
  if (!Array.isArray(allowedOrigins) || allowedOrigins.length === 0
    || allowedOrigins.some((origin) => typeof origin !== 'string' || !/^https:\/\//.test(origin))) {
    throw new Error('Office bridge allowed origins must be explicit HTTPS origins');
  }
  return {
    host,
    port,
    allowedOrigins: new Set(allowedOrigins),
    backendURL: validateBackendURL(options.backendURL || process.env.IKMAL_OFFICE_BACKEND_URL),
    maxBodyBytes: options.maxBodyBytes || DEFAULT_MAX_BODY,
    timeoutMs: options.timeoutMs || DEFAULT_TIMEOUT_MS,
    staticRoot: path.resolve(options.staticRoot || path.join(__dirname, 'public', 'office')),
    fetchImpl: options.fetchImpl || globalThis.fetch,
  };
}

function sendJSON(response, status, body, headers = {}) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...headers,
  });
  response.end(payload);
}

function applySecurityHeaders(response, origin, config) {
  response.setHeader('cache-control', 'no-store');
  response.setHeader('x-content-type-options', 'nosniff');
  response.setHeader('referrer-policy', 'no-referrer');
  // script-src must admit Microsoft's office.js CDN. Office add-ins have no
  // supported way to load the host API locally, and every task pane calls
  // Office.onReady before it can do anything, so 'self' alone leaves the pane
  // stuck on its loading state forever. The exception is that one origin;
  // connect-src stays 'self' so the pane still cannot talk to anything but
  // this loopback bridge.
  response.setHeader('content-security-policy', "default-src 'self'; script-src 'self' https://appsforoffice.microsoft.com; connect-src 'self'; frame-ancestors https://*.officeapps.live.com https://*.office.com https://localhost:*/; base-uri 'none'");
  if (origin && config.allowedOrigins.has(origin)) {
    response.setHeader('access-control-allow-origin', origin);
    response.setHeader('access-control-allow-headers', 'content-type');
    response.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
    response.setHeader('vary', 'Origin');
  }
}

function readBody(request, maxBytes) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(Object.assign(new Error('request body is too large'), { code: 'BODY_TOO_LARGE' }));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

function contentTypeFor(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.svg')) return 'image/svg+xml';
  return 'application/octet-stream';
}

function assetPathFor(pathname, staticRoot) {
  let relative = pathname.replace(/^\/office\//, '');
  if (relative.endsWith('/')) relative += 'index.html';
  const host = relative.split('/')[0];
  if (!OFFICE_HOSTS.has(host)) return null;
  const candidate = path.resolve(staticRoot, relative);
  if (candidate !== staticRoot && !candidate.startsWith(`${staticRoot}${path.sep}`)) return null;
  return candidate;
}

async function handleCheck(request, response, config) {
  const origin = request.headers.origin;
  if (!origin || !config.allowedOrigins.has(origin)) {
    sendJSON(response, 403, { error: 'Office origin is not allowed' });
    return;
  }
  if (request.headers['content-type']?.split(';')[0].trim() !== 'application/json') {
    sendJSON(response, 415, { error: 'application/json is required' });
    return;
  }
  let body;
  try {
    body = JSON.parse((await readBody(request, config.maxBodyBytes)).toString('utf8'));
  } catch (error) {
    sendJSON(response, error.code === 'BODY_TOO_LARGE' ? 413 : 400, { error: 'invalid JSON request' });
    return;
  }
  if (typeof body.text !== 'string' || body.text.trim() === '') {
    sendJSON(response, 400, { error: 'text is required' });
    return;
  }
  if (body.text.length > config.maxBodyBytes) {
    sendJSON(response, 413, { error: 'text is too large' });
    return;
  }
  const fetchImpl = config.fetchImpl;
  if (typeof fetchImpl !== 'function') {
    sendJSON(response, 503, { error: 'fetch is unavailable' });
    return;
  }
  try {
    const upstream = await fetchImpl(config.backendURL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: buildCheckBody(body),
      signal: AbortSignal.timeout(config.timeoutMs),
    });
    if (!upstream.ok) {
      sendJSON(response, 502, { error: `checker returned HTTP ${upstream.status}` });
      return;
    }
    const result = normalizeCheckResponse(await upstream.json());
    result.text = body.text;
    sendJSON(response, 200, result, {
      'access-control-allow-origin': origin,
      'vary': 'Origin',
    });
  } catch (error) {
    sendJSON(response, 502, { error: 'local checker is unavailable' });
  }
}

function createOfficeBridgeHandler(options = {}) {
  const config = makeConfig(options);
  return async (request, response) => {
    const origin = request.headers.origin;
    applySecurityHeaders(response, origin, config);
    const requestURL = new URL(request.url, `https://${config.host}:${config.port}`);

    if (requestURL.pathname === '/health') {
      if (request.method !== 'GET') {
        sendJSON(response, 405, { error: 'method not allowed' });
        return;
      }
      sendJSON(response, 200, { status: 'ok', backend: 'loopback', contract: 'ikmal-check-v1' });
      return;
    }

    if (requestURL.pathname === '/office/api/check') {
      if (request.method === 'OPTIONS') {
        if (!origin || !config.allowedOrigins.has(origin)) {
          sendJSON(response, 403, { error: 'Office origin is not allowed' });
          return;
        }
        response.writeHead(204);
        response.end();
        return;
      }
      if (request.method !== 'POST') {
        sendJSON(response, 405, { error: 'method not allowed' });
        return;
      }
      await handleCheck(request, response, config);
      return;
    }

    if (request.method !== 'GET' || !requestURL.pathname.startsWith('/office/')) {
      sendJSON(response, 404, { error: 'not found' });
      return;
    }
    let decodedPath;
    try {
      decodedPath = decodeURIComponent(requestURL.pathname);
    } catch (error) {
      sendJSON(response, 400, { error: 'invalid path' });
      return;
    }
    const filePath = assetPathFor(decodedPath, config.staticRoot);
    if (!filePath) {
      sendJSON(response, 404, { error: 'not found' });
      return;
    }
    try {
      const content = await fs.promises.readFile(filePath);
      response.writeHead(200, { 'content-type': contentTypeFor(filePath) });
      response.end(content);
    } catch (error) {
      sendJSON(response, error.code === 'ENOENT' ? 404 : 500, { error: 'asset not found' });
    }
  };
}

// The handler is async, so anything it throws becomes a rejected promise rather
// than an exception the http server can see. Unhandled, that terminates the
// process this bridge is embedded in (the Electron main process). Catch it here
// and answer the request instead.
function guardedHandler(handler) {
  return (request, response) => {
    Promise.resolve()
      .then(() => handler(request, response))
      .catch((error) => {
        if (response.headersSent || response.writableEnded) {
          response.destroy();
          return;
        }
        sendJSON(response, 500, { error: 'office bridge failed to handle the request' });
        console.error(`Office bridge handler error: ${error && error.message}`);
      });
  };
}

function createOfficeBridgeServer(options = {}) {
  if (!options.key || !options.cert) {
    throw new Error('Office bridge requires an explicit TLS key and certificate');
  }
  const server = https.createServer(
    { key: options.key, cert: options.cert },
    guardedHandler(createOfficeBridgeHandler(options)),
  );
  return server;
}

module.exports = {
  DEFAULT_BACKEND,
  DEFAULT_HOST,
  DEFAULT_PORT,
  OFFICE_HOSTS,
  assetPathFor,
  createOfficeBridgeHandler,
  createOfficeBridgeServer,
  isLoopbackHostname,
  makeConfig,
  validateBackendURL,
};
