import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { extractPageHTML, projectHTML, decorateHTMLMatches } = require('../office-bridge/onenote_projection.cjs');

test('OneNote analyzer content can use the shared HTML projection', () => {
  const html = extractPageHTML(JSON.stringify({ nodeId: 'page', content: '<p>Keep this concise.</p>' }));
  assert.equal(html, '<p>Keep this concise.</p>');
  const projection = projectHTML(html);
  const decorated = decorateHTMLMatches(projection, [{ offset: 10, length: 7 }], 'wave');
  assert.match(decorated, /data-ikmal-finding="1"/);
});

test('OneNote rejects analyzer payloads without HTML content', () => {
  assert.equal(extractPageHTML(JSON.stringify({ nodeId: 'page', content: 'plain text' })), '');
});
