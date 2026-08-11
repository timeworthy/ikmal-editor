import assert from 'node:assert/strict';
import test from 'node:test';
import {
  matchRanges,
  rebaseMatchesAfterEdit,
  rebaseAntecedentsAfterEdit,
  mergeChunkMatches,
  mergeChunkAntecedents,
  rebaseChunkMatches,
  rebaseChunkAntecedents,
} from '../dist/raw_matches.js';

const spelling = (offset, length, message = 'Check the spelling.') => ({
  offset, length, message, replacements: [{ value: 'the' }],
  rule: { id: 'SPELL', category: { id: 'TYPOS' } }, ikmalSource: 'LanguageTool',
});

test('a match reports every position it carries, not only its own', () => {
  const repetition = {
    offset: 100, length: 6, message: 'This word repeats nearby.',
    ikmalRelatedOccurrences: [{ start: 300, end: 306 }],
    ikmalAntecedent: { start: 400, end: 402, antecedentStart: 20, antecedentEnd: 26 },
    ikmalRelated: [{ source: 'quality-sidecar', offset: 500, length: 4, occurrences: [{ start: 600, end: 604 }] }],
  };
  assert.deepEqual(matchRanges(repetition), [
    { offset: 100, length: 6 },
    { offset: 300, length: 6 },
    { offset: 500, length: 4 },
    { offset: 600, length: 4 },
    { offset: 400, length: 2 },
    { offset: 20, length: 6 },
  ]);
  assert.deepEqual(matchRanges(null), []);
});

test('findings after an edit move by what it added, and earlier ones do not move', () => {
  const matches = [spelling(0, 3), spelling(100, 7), spelling(200, 3)];
  const moved = rebaseMatchesAfterEdit(matches, { offset: 50, length: 0 }, 10);
  assert.deepEqual(moved.map((match) => match.offset), [0, 110, 210]);

  const deleted = rebaseMatchesAfterEdit(matches, { offset: 50, length: 20 }, 0);
  assert.deepEqual(deleted.map((match) => match.offset), [0, 80, 180]);
});

test('an edit inside a finding drops it, including through a related position', () => {
  const matches = [
    spelling(0, 3),
    { ...spelling(100, 6), ikmalRelatedOccurrences: [{ start: 300, end: 306 }] },
  ];
  // Typing inside the related occurrence invalidates the repetition even though
  // the match's own range is untouched.
  const edited = rebaseMatchesAfterEdit(matches, { offset: 302, length: 0 }, 1);
  assert.deepEqual(edited.map((match) => match.offset), [0]);

  // Typing between them keeps both, with the later one moved.
  const between = rebaseMatchesAfterEdit(matches, { offset: 50, length: 0 }, 5);
  assert.deepEqual(between.map((match) => match.offset), [0, 105]);
  assert.deepEqual(between[1].ikmalRelatedOccurrences, [{ start: 305, end: 311 }]);

  // A finding touching the edit boundary from outside survives unmoved.
  const adjacent = rebaseMatchesAfterEdit([spelling(0, 3)], { offset: 3, length: 0 }, 4);
  assert.deepEqual(adjacent.map((match) => match.offset), [0]);
});

test('every nested position moves with its match', () => {
  const match = {
    ...spelling(100, 6),
    ikmalRelatedOccurrences: [{ start: 300, end: 306 }],
    ikmalAntecedent: { start: 400, end: 402, antecedentStart: 350, antecedentEnd: 356 },
    ikmalRelated: [{ source: 'quality-sidecar', offset: 500, length: 4, occurrences: [{ start: 600, end: 604 }] }],
  };
  const [moved] = rebaseMatchesAfterEdit([match], { offset: 10, length: 0 }, 5);
  assert.equal(moved.offset, 105);
  assert.deepEqual(moved.ikmalRelatedOccurrences, [{ start: 305, end: 311 }]);
  assert.deepEqual(moved.ikmalAntecedent, { start: 405, end: 407, antecedentStart: 355, antecedentEnd: 361 });
  assert.equal(moved.ikmalRelated[0].offset, 505);
  assert.deepEqual(moved.ikmalRelated[0].occurrences, [{ start: 605, end: 609 }]);
  // The original is untouched: the renderer may still be drawing it.
  assert.equal(match.offset, 100);
});

test('an antecedent link is carried or dropped as a pair', () => {
  const links = [{ start: 400, end: 402, antecedentStart: 10, antecedentEnd: 16 }];
  const [moved] = rebaseAntecedentsAfterEdit(links, { offset: 100, length: 0 }, 5);
  assert.deepEqual(moved, { start: 405, end: 407, antecedentStart: 10, antecedentEnd: 16 });
  // Editing the antecedent end breaks the link even though the pronoun is fine.
  assert.deepEqual(rebaseAntecedentsAfterEdit(links, { offset: 12, length: 0 }, 1), []);
});

test('a rechecked chunk replaces only the findings inside it', () => {
  const chunk = { offset: 100, length: 100 };
  const previous = [spelling(0, 3), spelling(150, 7), spelling(300, 3)];
  const merged = mergeChunkMatches(previous, [spelling(120, 5, 'A new finding.')], chunk);
  assert.deepEqual(merged.map((match) => match.offset), [0, 120, 300]);
  assert.equal(merged[1].message, 'A new finding.');

  // A chunk that found nothing still clears what was inside it.
  assert.deepEqual(mergeChunkMatches(previous, [], chunk).map((match) => match.offset), [0, 300]);
  // A finding reaching into the chunk from outside is re-decided by the check.
  const reaching = [{ ...spelling(0, 3), ikmalRelatedOccurrences: [{ start: 150, end: 156 }] }];
  assert.deepEqual(mergeChunkMatches(reaching, [], chunk), []);
});

test('relationships survive a chunk recheck only when both ends are outside it', () => {
  const chunk = { offset: 100, length: 100 };
  const outside = { start: 10, end: 12, antecedentStart: 300, antecedentEnd: 306 };
  const crossing = { start: 150, end: 152, antecedentStart: 10, antecedentEnd: 16 };
  assert.deepEqual(mergeChunkAntecedents([outside, crossing], [], chunk), [outside]);
  assert.deepEqual(mergeChunkAntecedents([], [crossing], chunk), [crossing]);
});

test('a chunk result is moved into document coordinates, positions and all', () => {
  const [match] = rebaseChunkMatches([{
    ...spelling(10, 3),
    ikmalRelatedOccurrences: [{ start: 20, end: 26 }],
    ikmalAntecedent: { start: 30, end: 32, antecedentStart: 5, antecedentEnd: 11 },
    ikmalRelated: [{ source: 'quality-sidecar', offset: 40, length: 4, occurrences: [{ start: 50, end: 54 }] }],
  }], 1000);
  assert.equal(match.offset, 1010);
  assert.deepEqual(match.ikmalRelatedOccurrences, [{ start: 1020, end: 1026 }]);
  assert.deepEqual(match.ikmalAntecedent, { start: 1030, end: 1032, antecedentStart: 1005, antecedentEnd: 1011 });
  assert.equal(match.ikmalRelated[0].offset, 1040);
  assert.deepEqual(match.ikmalRelated[0].occurrences, [{ start: 1050, end: 1054 }]);

  assert.deepEqual(rebaseChunkAntecedents([{ start: 1, end: 3, antecedentStart: 5, antecedentEnd: 9 }], 100),
    [{ start: 101, end: 103, antecedentStart: 105, antecedentEnd: 109 }]);
  assert.deepEqual(rebaseChunkMatches([spelling(10, 3)], 0)[0].offset, 10);
});
