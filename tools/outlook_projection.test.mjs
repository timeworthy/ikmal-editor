import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  applyHTMLMatch,
  decorateHTMLMatches,
  projectHTML,
  removeHTMLMarks,
} = require('../office-bridge/outlook_projection.cjs');

test('Outlook projection preserves markup while mapping text nodes', () => {
  const html = '<p>A &amp; clear sentence.</p><p>Review this.</p>';
  const projection = projectHTML(html);
  assert.equal(projection.text, 'A & clear sentence.\nReview this.\n');
  const offset = projection.text.indexOf('clear');
  const match = { offset, length: 5 };
  const decorated = decorateHTMLMatches(projection, [match], 'dotted');
  assert.match(decorated, /data-ikmal-finding="1"/);
  assert.match(decorated, /text-decoration-style:dotted/);
  assert.equal(removeHTMLMarks(decorated), html);
  assert.equal(applyHTMLMatch(projection, match, 'concise'), '<p>A &amp; concise sentence.</p><p>Review this.</p>');
});

test('Outlook refuses findings that cross HTML text nodes', () => {
  const projection = projectHTML('<p>First</p><p>Second</p>');
  assert.equal(applyHTMLMatch(projection, { offset: 3, length: 6 }, 'x'), null);
});
