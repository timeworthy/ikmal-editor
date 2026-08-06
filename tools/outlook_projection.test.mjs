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

test('Outlook decoration survives overlapping findings without breaking markup', () => {
  // Checkers routinely report overlapping ranges on the same phrase. Splicing
  // both would interleave the <span> tags and write mismatched markup into the
  // user's draft, which removeHTMLMarks could then never undo.
  const html = '<p>The results is ready today.</p>';
  const projection = projectHTML(html);
  const decorated = decorateHTMLMatches(projection, [
    { offset: 4, length: 10 },
    { offset: 8, length: 9 },
    { offset: 4, length: 10 },
  ], 'wave');
  assert.equal(decorated.match(/<span\b/g).length, 1);
  assert.equal(decorated.match(/<\/span>/g).length, 1);
  assert.equal(removeHTMLMarks(decorated), html);
});

test('Outlook decorates every finding that does not overlap another', () => {
  const html = '<p>The results is ready today.</p>';
  const projection = projectHTML(html);
  const decorated = decorateHTMLMatches(projection, [
    { offset: 4, length: 7 },
    { offset: 21, length: 5 },
  ], 'wave');
  assert.equal(decorated.match(/<span\b/g).length, 2);
  assert.equal(removeHTMLMarks(decorated), html);
});
