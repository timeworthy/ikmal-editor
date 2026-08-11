import assert from 'node:assert/strict';
import test from 'node:test';
import {
  chunkAround,
  createCheckRequest,
  createTextDocument,
  isSafeRange,
  rangeEnd,
} from '../src/index.ts';

const paragraph = (label, size = 500) => `${label}. ${'word '.repeat(Math.max(1, Math.floor(size / 5)))}`.trim();
const document = (count, size) => Array.from({ length: count }, (_, index) => paragraph(`Paragraph ${index}`, size)).join('\n\n');

function chunkText(text, caret, options) {
  const range = chunkAround(text, caret, options);
  assert.ok(isSafeRange(text, range), 'a chunk must be a usable range in its own text');
  assert.ok(range.offset <= caret && rangeEnd(range) >= caret, 'a chunk must contain the caret it was built for');
  return text.slice(range.offset, rangeEnd(range));
}

test('a document within the budget is never chunked', () => {
  const text = 'One short draft. It fits.';
  assert.deepEqual(chunkAround(text, 4), { offset: 0, length: text.length });
  assert.deepEqual(chunkAround('', 0), { offset: 0, length: 0 });
  // The caller compares against the whole document to decide whether this is a
  // selection check at all.
  assert.deepEqual(chunkAround(text, 999), { offset: 0, length: text.length });
});

test('the budget is spent around the caret and rounded out to whole paragraphs', () => {
  const text = document(20, 500);
  const chunk = chunkText(text, Math.floor(text.length / 2), { budget: 1200 });
  assert.ok(chunk.length >= 1200, 'rounding outward may only grow the window');
  assert.match(chunk, /^Paragraph \d+\./, 'a chunk starts at a paragraph, not mid-sentence');
  assert.match(chunk, /word$/, 'a chunk ends at a paragraph, not mid-sentence');
  assert.ok(!chunk.includes('\n\n\n'));
});

test('the budget is an aggregate, so a caret at either end spends it all one way', () => {
  const text = document(20, 500);
  const budget = 2000;

  const top = chunkAround(text, 0, { budget });
  assert.equal(top.offset, 0);
  assert.ok(top.length >= budget, `a caret at the top spends the budget downward, got ${top.length}`);

  const bottom = chunkAround(text, text.length, { budget });
  assert.equal(rangeEnd(bottom), text.length);
  assert.ok(bottom.length >= budget, `a caret at the end spends the budget upward, got ${bottom.length}`);

  // Neither end may claim the whole document just because the caret sits there.
  assert.ok(top.length < text.length && bottom.length < text.length);
});

test('a paragraph past the ceiling falls back to whole sentences', () => {
  const wall = `${'A sentence about the draft. '.repeat(600)}`;
  const text = `Opening paragraph.\n\n${wall}\n\nClosing paragraph.`;
  const caret = Math.floor(text.length / 2);
  const chunk = chunkText(text, caret, { budget: 1000, maxCharacters: 4000 });
  assert.ok(chunk.length <= 4000, `the ceiling holds, got ${chunk.length}`);
  assert.match(chunk, /^A sentence/, 'the fallback still starts at a sentence');
  assert.match(chunk, /draft\.\s*$/, 'the fallback still ends at a sentence');
});

test('text with no paragraph or sentence breaks still yields a bounded chunk', () => {
  const text = 'word '.repeat(4000);
  const caret = Math.floor(text.length / 2);
  const range = chunkAround(text, caret, { budget: 1000, maxCharacters: 2000 });
  assert.ok(isSafeRange(text, range));
  assert.ok(range.length <= 2000, `an unpunctuated document is still bounded, got ${range.length}`);
  assert.ok(range.offset <= caret && rangeEnd(range) >= caret);
});

test('CRLF documents and indented blank lines break into the same paragraphs', () => {
  const unix = document(12, 400);
  const windows = unix.replace(/\n/g, '\r\n');
  const indented = unix.replace(/\n\n/g, '\n   \n');
  const caret = Math.floor(unix.length / 2);
  for (const [label, text] of [['CRLF', windows], ['indented', indented]]) {
    const chunk = chunkText(text, caret, { budget: 1200 });
    assert.match(chunk, /^Paragraph \d+\./, `${label} text must round out to a paragraph start`);
    assert.match(chunk, /word$/, `${label} text must round out to a paragraph end`);
  }
});

test('a caret outside the text is clamped rather than throwing', () => {
  const text = document(8, 400);
  for (const caret of [-50, Number.NaN, text.length + 500, '12']) {
    const range = chunkAround(text, caret, { budget: 800 });
    assert.ok(isSafeRange(text, range), `caret ${String(caret)} must still produce a usable range`);
  }
});

test('a chunk never splits an astral character', () => {
  const emoji = '😀';
  const text = `${'word '.repeat(400)}${emoji}${'word '.repeat(400)}`;
  const caret = text.indexOf(emoji) + 1;
  const range = chunkAround(text, caret, { budget: 200, maxCharacters: 400 });
  assert.ok(isSafeRange(text, range), 'a chunk boundary must not cut a surrogate pair');
});

test('a chunk feeds the existing selection-check path unchanged', () => {
  const text = document(20, 500);
  const draft = createTextDocument({ id: 'draft', text, revision: 3 });
  const range = chunkAround(text, Math.floor(text.length / 2), { budget: 1500 });
  const request = createCheckRequest(draft, range);
  assert.equal(request.revision, 3);
  assert.deepEqual(request.selection, range, 'the range travels with the request so offsets can be rebased');
  assert.equal(request.text, text.slice(range.offset, rangeEnd(range)));
  assert.ok(request.text.length < text.length);
});
