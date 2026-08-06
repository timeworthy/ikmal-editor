import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { projectShapes, shapeForMatch } = require('../office-bridge/powerpoint_projection.cjs');

test('PowerPoint projection preserves slide and shape boundaries', () => {
  const projection = projectShapes([
    { slideNumber: 1, shapeId: 'title', text: 'A 😀 title' },
    { slideNumber: 2, shapeId: 'body', text: 'Review this sentence.' },
  ]);
  assert.equal(projection.text, 'A 😀 title\n\nReview this sentence.');
  const match = { offset: projection.text.indexOf('😀'), length: '😀'.length };
  assert.equal(shapeForMatch(projection, match).shapeId, 'title');
  assert.equal(shapeForMatch(projection, { offset: 0, length: 12 }), null);
});
