import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import * as core from '../packages/writing-core/dist/index.js';
import lt from '../integrations/common/languagetool.cjs';
const { normalizeSettings, checkText, applyMatch } = lt;

// ---------------------------------------------------------------------------
// 1. Malformed JSON and Corrupted Configuration Resilience
// ---------------------------------------------------------------------------
test('Resilience: Malformed JSON configs and corrupted storage are handled gracefully', () => {
  const malformedJSONs = [
    '',
    '{',
    '{"rules": [}',
    '{"rules": {"oxford-comma": "not-a-boolean"}}',
    '{"endpoint": 12345}',
    '{"settings": null}',
    '[\u0000\u0001\u0002 malformed bytes]',
    '{"endpoint": "http://127.0.0.1:8096", "minLength": "invalid-number"}',
    '{"endpoint": "http://127.0.0.1:8096", "maxLength": -100}',
  ];

  for (const raw of malformedJSONs) {
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // JSON parse error expected for malformed strings
      parsed = null;
    }

    let settings;
    try {
      settings = normalizeSettings(parsed || {});
    } catch (err) {
      assert.match(err.message, /loopback/i);
      // Fall back to default when input has invalid endpoint
      settings = normalizeSettings({ ...(parsed || {}), endpoint: 'http://127.0.0.1:8096' });
    }
    assert.equal(typeof settings.endpoint, 'string');
    assert.ok(settings.endpoint.startsWith('http'));
    assert.ok(Number.isFinite(settings.minLength) && settings.minLength >= 1);
    assert.ok(Number.isFinite(settings.maxLength) && settings.maxLength >= settings.minLength);
    assert.ok(Array.isArray(settings.dictionary));
    assert.ok(Array.isArray(settings.ignoredRules));
  }
});

// ---------------------------------------------------------------------------
// 2. Corrupted and Malformed Document / Input Buffers
// ---------------------------------------------------------------------------
test('Resilience: Malformed document inputs, binary data, and extreme lengths', () => {
  const corruptedInputs = [
    '\u0000\u0001\u0002\u0003\u0004\u0005', // Null and control bytes
    '\uD83D', // Unpaired UTF-16 high surrogate
    '\uDE00', // Unpaired UTF-16 low surrogate
    '\uD83D\uDE00'.repeat(500), // Valid surrogate pairs
    'A'.repeat(500000), // 500KB giant string
    '<a href="javascript:alert(1)">Click</a>',
    '{"nested": {"json": "payload"}}',
  ];

  for (const input of corruptedInputs) {
    const stats = core.textStatistics(input);
    assert.ok(Number.isFinite(stats.words) && stats.words >= 0);
    assert.ok(Number.isFinite(stats.characters) && stats.characters >= 0);

    const doc = core.createTextDocument({ text: input, source: 'desktop' });
    assert.equal(doc.text, input);

    // Apply valid and invalid text ranges
    const safeEdit = core.applyTextEdit(doc, { offset: 0, length: 0 }, 'clean-prefix: ');
    assert.equal(safeEdit.text, 'clean-prefix: ' + input);

    // Out of bounds range must throw a RangeError rather than corrupting memory
    assert.throws(() => {
      core.applyTextEdit(doc, { offset: input.length + 10, length: 5 }, 'overflow');
    }, /RangeError/);
  }
});

// ---------------------------------------------------------------------------
// 3. Stale Response & In-Flight Revision Guard
// ---------------------------------------------------------------------------
test('Resilience: In-flight race conditions and stale response rejection', () => {
  // Scenario: Client submits rev 0. While check is running, user types and doc advances to rev 1.
  const docRev0 = core.createTextDocument({ id: 'doc-1', text: 'Please review teh draft.', revision: 0 });
  const docRev1 = core.applyTextEdit(docRev0, { offset: docRev0.text.length, length: 0 }, ' More text.');
  assert.equal(docRev1.revision, 1);

  // Response for rev 0 arrives:
  const checkResultRev0 = {
    documentId: 'doc-1',
    revision: 0,
    matches: [
      {
        id: 'spell-teh',
        offset: 14,
        length: 3,
        message: 'Spelling error',
        matchedText: 'teh',
        replacements: [{ value: 'the' }],
        category: 'spelling',
      },
    ],
    relationships: [],
    statistics: { words: 4, characters: 24 },
  };

  // 1. Result currency check
  assert.equal(core.resultIsCurrent(docRev0, checkResultRev0), true);
  assert.equal(core.resultIsCurrent(docRev1, checkResultRev0), false, 'Rev 0 result is stale for Rev 1 document');

  // 2. Acceptance check
  assert.equal(core.acceptCurrentResult(docRev1, checkResultRev0), null, 'Stale result must be discarded');
});

// ---------------------------------------------------------------------------
// 4. Upstream Server Failure Modes (500, 502, 504, 413, Timeout)
// ---------------------------------------------------------------------------
test('Resilience: Upstream checker HTTP failure codes and oversized payloads', async () => {
  const errorCodes = [400, 403, 404, 413, 500, 502, 503, 504];

  for (const status of errorCodes) {
    const errorFetch = async () => ({
      ok: false,
      status,
      json: async () => ({ error: `HTTP ${status}` }),
    });

    await assert.rejects(
      async () => {
        await checkText('Valid draft for error testing.', { endpoint: 'http://127.0.0.1:8096' }, errorFetch);
      },
      new RegExp(`HTTP ${status}`, 'i'),
      `Rejected with expected error for status ${status}`,
    );
  }

  // Oversized document length check
  const maxSettings = { endpoint: 'http://127.0.0.1:8096', maxLength: 100 };
  const hugeText = 'X'.repeat(500);
  const oversizedResult = await checkText(hugeText, maxSettings, async () => {
    throw new Error('Should not have called fetch for oversized text');
  });
  assert.equal(oversizedResult.skipped, 'too-long');
  assert.deepEqual(oversizedResult.matches, []);
});

// ---------------------------------------------------------------------------
// 5. Stale / Corrupted Match Application Safeguards
// ---------------------------------------------------------------------------
test('Resilience: applyMatch refuses out-of-bounds, negative, or invalid offsets', () => {
  const baseText = 'The quick brown fox jumps over the lazy dog.';

  const invalidMatches = [
    null,
    undefined,
    {},
    { offset: -1, length: 5 },
    { offset: 0, length: 0 },
    { offset: 0, length: -5 },
    { offset: baseText.length + 5, length: 10 },
    { offset: 10, length: 500 }, // beyond text length
    { offset: NaN, length: 3 },
    { offset: 5, length: NaN },
    { offset: 0, length: 3, replacements: [] }, // no replacement value
    { offset: 0, length: 3, replacements: [{ value: 123 }] }, // non-string replacement
  ];

  for (const match of invalidMatches) {
    const result = applyMatch(baseText, match);
    assert.equal(result, null, `Invalid match rejected safely: ${JSON.stringify(match)}`);
  }

  // Valid match replacement
  const validMatch = { offset: 4, length: 5, replacements: [{ value: 'slow' }] };
  const applied = applyMatch(baseText, validMatch);
  assert.equal(applied, 'The slow brown fox jumps over the lazy dog.');
});
