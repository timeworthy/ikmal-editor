import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeCheckResult } from '../dist/index.js';
import { documentFixture, rawCheckFixture } from './fixtures.mjs';

test('the emitted JavaScript package runs without TypeScript or host imports', () => {
  const result = normalizeCheckResult({
    documentId: documentFixture.id,
    revision: documentFixture.revision,
    text: documentFixture.text,
    language: documentFixture.language,
  }, rawCheckFixture, 1234);
  assert.equal(result.matches.length, 3);
  assert.equal(result.statistics.words, 12);
});
