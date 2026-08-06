import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { cellAddress, cellForMatch, columnName, projectRange } = require('../office-bridge/excel_projection.cjs');

test('Excel projection preserves UTF-16 offsets and cell coordinates', () => {
  assert.equal(columnName(0), 'A');
  assert.equal(columnName(26), 'AA');
  assert.equal(cellAddress(4, 27), 'AB5');
  const projection = projectRange([
    ['A 😀 plant', 'is ready'],
    ['Review this.', ''],
  ], { rowIndex: 4, columnIndex: 2 });
  assert.equal(projection.text, 'A 😀 plant\tis ready\nReview this.\t');
  const match = { offset: projection.text.indexOf('😀'), length: '😀'.length };
  assert.equal(cellForMatch(projection, match).address, 'C5');
  assert.equal(cellForMatch(projection, { offset: 0, length: 12 }), null);
});
