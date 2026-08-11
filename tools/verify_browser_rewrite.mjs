import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = path.join(root, 'apps', 'browser-extension');
assert.ok(fs.existsSync(path.join(root, 'tools', 'browser_rewrite_smoke.mjs')), 'missing packaged browser smoke harness');
assert.ok(fs.existsSync(path.join(root, 'tools', 'browser_extension_injection_smoke.mjs')), 'missing MV3 injection smoke harness');
assert.ok(fs.existsSync(path.join(root, 'tools', 'browser_extension_unavailable_smoke.mjs')), 'missing MV3 unavailable-service smoke harness');
const manifest = JSON.parse(fs.readFileSync(path.join(app, 'manifest.json'), 'utf8'));
const required = ['manifest.json', 'background.js', 'bootstrap.js', 'content_module.js', 'README.md'];
for (const file of required) assert.ok(fs.existsSync(path.join(app, file)), `missing fresh browser source: ${file}`);
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.content_security_policy.extension_pages, "script-src 'self'; object-src 'self'");
assert.deepEqual(manifest.host_permissions, ['http://127.0.0.1/*', 'http://localhost/*']);
assert.equal(manifest.content_scripts[0].js[0], 'bootstrap.js');
for (const resource of ['content_module.js', 'writing-core.js', 'browser_field.js', 'browser_slice.js', 'indicator.js', 'issue_popover.js', 'tokens.css', 'primitives.css']) {
  assert.ok(manifest.web_accessible_resources[0].resources.includes(resource), `resource not web-accessible: ${resource}`);
}
const source = required.filter((file) => file.endsWith('.js')).map((file) => fs.readFileSync(path.join(app, file), 'utf8')).join('\n');
assert.match(source, /writing-core\.js/);
assert.match(source, /browser_slice\.js/);
assert.match(source, /renderIssuePopover/);
assert.doesNotMatch(source, /\/Users\/iansherr\/Projects\/ikmal|https?:\/\/(?!127\.0\.0\.1|localhost)/);
const productSurface = ['manifest.json', 'bootstrap.js', 'content_module.js', 'README.md']
  .map((file) => fs.readFileSync(path.join(app, file), 'utf8')).join('\n');
assert.doesNotMatch(productSurface, /language\s*tool/i, 'fresh browser product surface must not use legacy engine branding');
assert.doesNotMatch(source, /unsafe-eval|eval\s*\(/, 'fresh browser source must not enable dynamic code execution');
console.log('Fresh browser rewrite source verified: MV3 loopback-only slice and compiled-artifact imports present.');
