import assert from 'node:assert/strict';
import test from 'node:test';
import {
  chunkAround,
  createCheckRequest,
  createTextDocument,
  mergeChunkResult,
  normalizeCheckResult,
  rebaseCheckResult,
  rebaseResultAfterEdit,
  rangeEnd,
  isSafeRange,
  textEditBetween,
} from '../src/index.ts';

// Three paragraphs, each with one finding, so a check of the middle one has to
// leave the outer two alone.
// Long enough that a narrow chunk window centred in one paragraph cannot reach
// its neighbours, which is what makes the retention assertions mean something.
const FIRST = 'Teh opening paragraph stands alone and carries on for long enough that a narrow window cannot reach past its own blank line.';
const MIDDLE = 'The middle paragraph has recieve in it, and it also runs on for a while so a chunk centred here stays where it was put.';
const LAST = 'A last paragraph mentions teh end and keeps going with more words so nothing else can wander into this one either.';
const TEXT = `${FIRST}\n\n${MIDDLE}\n\n${LAST}`;
const PRONOUN = TEXT.indexOf(' it,') + 1;

const spelling = (offset, length, word) => ({
  offset, length, message: `Check the spelling of ${word}.`,
  replacements: [{ value: word }], rule: { id: 'SPELL', category: { id: 'TYPOS' }, issueType: 'misspelling' },
});

function documentAt(text = TEXT, revision = 1) {
  return createTextDocument({ id: 'draft', text, revision });
}

function wholeResult(document, matches, checkedAt = 1000) {
  return normalizeCheckResult(createCheckRequest(document), { matches }, checkedAt);
}

function issueTexts(result, text) {
  return result.matches.map((issue) => text.slice(issue.offset, issue.offset + issue.length));
}

test('a result checked over part of a document lands on the right words', () => {
  const document = documentAt();
  const range = { offset: TEXT.indexOf(MIDDLE), length: MIDDLE.length };
  const chunk = normalizeCheckResult(createCheckRequest(document, range), {
    matches: [spelling(MIDDLE.indexOf('recieve'), 7, 'receive')],
  }, 2000);
  assert.equal(chunk.matches[0].matchedText, 'recieve');

  const rebased = rebaseCheckResult(chunk, range.offset);
  assert.equal(TEXT.slice(rebased.matches[0].offset, rangeEnd({ offset: rebased.matches[0].offset, length: rebased.matches[0].length })), 'recieve');
  assert.equal(rebaseCheckResult(chunk, 0), chunk, 'a chunk at the start of the document is returned untouched');
});

test('a reword candidate moves with the finding it belongs to', () => {
  const document = documentAt();
  const result = normalizeCheckResult(createCheckRequest(document), {
    matches: [{
      offset: 0, length: 3, message: 'Consider rewording.',
      rewordCandidates: [{
        id: 'r1', replacementText: 'The', rationale: 'clarity',
        edits: [{ range: { offset: 0, length: 3 }, replacementText: 'The' }],
      }],
    }],
  }, 1000);
  assert.ok(result.matches[0].rewordCandidates?.length, 'fixture must carry a candidate');

  const rebased = rebaseCheckResult(result, 40);
  const candidate = rebased.matches[0].rewordCandidates[0];
  // Applying an edit at a stale offset would rewrite whatever text now sits
  // there instead of the flagged phrase.
  assert.equal(candidate.edits[0].range.offset, 40);
});

test('findings after an edit move by what the edit added or removed', () => {
  const document = documentAt();
  const result = wholeResult(document, [
    spelling(0, 3, 'The'),
    spelling(TEXT.indexOf('recieve'), 7, 'receive'),
    spelling(TEXT.indexOf('teh end'), 3, 'the'),
  ]);
  assert.deepEqual(issueTexts(result, TEXT), ['Teh', 'recieve', 'teh']);

  // Insert a sentence into the middle paragraph, after the first finding and
  // before the last two.
  const insertAt = TEXT.indexOf(MIDDLE);
  const addition = 'A brand new sentence. ';
  const edited = `${TEXT.slice(0, insertAt)}${addition}${TEXT.slice(insertAt)}`;
  const carried = rebaseResultAfterEdit(result, { offset: insertAt, length: 0 }, addition.length);

  assert.deepEqual(issueTexts(carried, edited), ['Teh', 'recieve', 'teh'], 'every retained finding still covers its own word');
  assert.equal(carried.matches[0].offset, 0, 'a finding before the edit does not move');
});

test('an edit inside a finding drops it rather than moving it', () => {
  const document = documentAt();
  const result = wholeResult(document, [spelling(0, 3, 'The'), spelling(TEXT.indexOf('recieve'), 7, 'receive')]);

  // Typing in the middle of "recieve" changes the word the finding describes.
  const caret = TEXT.indexOf('recieve') + 3;
  const carried = rebaseResultAfterEdit(result, { offset: caret, length: 0 }, 1);
  assert.deepEqual(carried.matches.map((issue) => issue.matchedText), ['Teh']);

  // A deletion covering the finding drops it too, and a finding touching the
  // edit boundary from outside survives.
  const covering = rebaseResultAfterEdit(result, { offset: 0, length: 3 }, 5);
  assert.deepEqual(covering.matches.map((issue) => issue.matchedText), ['recieve']);
  const adjacent = rebaseResultAfterEdit(result, { offset: 3, length: 0 }, 4);
  assert.equal(adjacent.matches[0].matchedText, 'Teh');
  assert.equal(adjacent.matches[0].offset, 0);
});

test('a relationship loses its group when either end is edited', () => {
  const document = documentAt();
  const result = normalizeCheckResult(createCheckRequest(document), {
    matches: [],
    ikmalAntecedents: [{
      id: 'a1', start: PRONOUN, end: PRONOUN + 2,
      antecedentStart: 0, antecedentEnd: 3, pronoun: 'it', antecedent: 'Teh', confidence: 0.8,
    }],
  }, 1000);
  assert.equal(result.relationships.length, 1, 'fixture must carry a relationship');

  const untouched = rebaseResultAfterEdit(result, { offset: TEXT.length, length: 0 }, 5);
  assert.equal(untouched.relationships.length, 1);
  // Editing the antecedent end of the pair invalidates the link even though the
  // pronoun is untouched.
  const broken = rebaseResultAfterEdit(result, { offset: 0, length: 3 }, 3);
  assert.equal(broken.relationships.length, 0);
});

test('rechecking a chunk keeps the findings outside it', () => {
  const document = documentAt();
  const previous = wholeResult(document, [
    spelling(0, 3, 'The'),
    spelling(TEXT.indexOf('recieve'), 7, 'receive'),
    spelling(TEXT.indexOf('teh end'), 3, 'the'),
  ]);
  assert.equal(previous.matches.length, 3);

  // The middle paragraph is rechecked and its finding is gone; the first and
  // last paragraphs were never sent and must survive.
  const range = { offset: TEXT.indexOf(MIDDLE), length: MIDDLE.length };
  const chunk = normalizeCheckResult(createCheckRequest(document, range), { matches: [] }, 3000);
  const merged = mergeChunkResult(previous, chunk, range, document);

  assert.deepEqual(issueTexts(merged, TEXT), ['Teh', 'teh']);
  assert.equal(merged.revision, document.revision);
  assert.equal(merged.documentId, 'draft');
  // Counters describe the document, not the slice that was checked.
  assert.deepEqual(merged.statistics, previous.statistics);
});

test('a chunk recheck replaces only the findings inside it', () => {
  const document = documentAt();
  const previous = wholeResult(document, [spelling(0, 3, 'The'), spelling(TEXT.indexOf('recieve'), 7, 'receive')]);
  const range = { offset: TEXT.indexOf(MIDDLE), length: MIDDLE.length };
  const chunk = normalizeCheckResult(createCheckRequest(document, range), {
    matches: [spelling(MIDDLE.indexOf('middle'), 6, 'centre')],
  }, 3000);

  const merged = mergeChunkResult(previous, chunk, range, document);
  assert.deepEqual(issueTexts(merged, TEXT), ['Teh', 'middle'], 'the stale finding inside the chunk is gone, the new one is placed');
  assert.ok(merged.matches[0].offset < merged.matches[1].offset, 'merged findings stay in document order');
});

test('a finding reaching into the chunk from outside it is dropped', () => {
  const document = documentAt();
  const previous = normalizeCheckResult(createCheckRequest(document), {
    matches: [],
    ikmalAntecedents: [{
      id: 'a1', start: PRONOUN, end: PRONOUN + 2,
      antecedentStart: 0, antecedentEnd: 3, pronoun: 'it', antecedent: 'Teh', confidence: 0.8,
    }],
  }, 1000);
  assert.equal(previous.relationships.length, 1);

  // The pronoun sits inside the rechecked chunk while its antecedent sits
  // outside: half a pair is not a finding, and the next full pass restores it.
  const range = { offset: TEXT.indexOf(MIDDLE), length: MIDDLE.length };
  const chunk = normalizeCheckResult(createCheckRequest(document, range), { matches: [] }, 3000);
  const merged = mergeChunkResult(previous, chunk, range, document);
  assert.equal(merged.relationships.length, 0);
  assert.equal(merged.matches.length, 0);
});

test('a merge ignores a result belonging to another document', () => {
  const document = documentAt();
  const other = wholeResult(createTextDocument({ id: 'somewhere-else', text: TEXT, revision: 9 }), [spelling(0, 3, 'The')]);
  const range = { offset: TEXT.indexOf(MIDDLE), length: MIDDLE.length };
  const chunk = normalizeCheckResult(createCheckRequest(document, range), { matches: [] }, 3000);
  assert.deepEqual(mergeChunkResult(other, chunk, range, document).matches, []);
  assert.deepEqual(mergeChunkResult(null, chunk, range, document).matches, []);
});

test('the edit, chunk, and merge steps compose over a real edit', () => {
  const document = documentAt();
  const previous = wholeResult(document, [
    spelling(0, 3, 'The'),
    spelling(TEXT.indexOf('recieve'), 7, 'receive'),
    spelling(TEXT.indexOf('teh end'), 3, 'the'),
  ]);

  // The user types a sentence into the middle of the middle paragraph.
  const insertAt = TEXT.indexOf('and it also');
  const addition = 'It continues for a while. ';
  const text = `${TEXT.slice(0, insertAt)}${addition}${TEXT.slice(insertAt)}`;
  const edited = createTextDocument({ id: 'draft', text, revision: 2 });
  const carried = rebaseResultAfterEdit(previous, { offset: insertAt, length: 0 }, addition.length);
  const caret = insertAt + addition.length;

  // Only the paragraph around the caret is rechecked, and it comes back clean.
  const range = chunkAround(text, caret, { budget: 40 });
  assert.equal(text.slice(range.offset, rangeEnd(range)).includes('teh end'), false, 'the chunk must not have reached the last paragraph');
  const chunk = normalizeCheckResult(createCheckRequest(edited, range), { matches: [] }, 4000);
  const merged = mergeChunkResult(carried, chunk, range, edited);

  assert.deepEqual(issueTexts(merged, text), ['Teh', 'teh'], 'the untouched paragraphs keep their findings, on their own words');
  assert.equal(merged.revision, 2);
  assert.deepEqual(merged.statistics, wholeResult(edited, []).statistics, 'counters describe the whole edited document');
});

test('the edit between two snapshots is recovered from the text alone', () => {
  const edit = (before, after) => {
    const delta = textEditBetween(before, after);
    if (delta === null) return null;
    // Whatever it reports must actually rebuild the later text.
    const rebuilt = `${before.slice(0, delta.range.offset)}${after.slice(delta.range.offset, delta.range.offset + delta.replacementLength)}${before.slice(delta.range.offset + delta.range.length)}`;
    assert.equal(rebuilt, after, `the reported edit must reproduce the later text for ${JSON.stringify([before, after])}`);
    return delta;
  };

  assert.equal(edit('same text', 'same text'), null);
  assert.deepEqual(edit('the draft', 'the long draft'), { range: { offset: 4, length: 0 }, replacementLength: 5 });
  assert.deepEqual(edit('the long draft', 'the draft'), { range: { offset: 4, length: 5 }, replacementLength: 0 });
  assert.deepEqual(edit('teh draft', 'the draft'), { range: { offset: 1, length: 2 }, replacementLength: 2 });
  assert.deepEqual(edit('draft', 'draft '), { range: { offset: 5, length: 0 }, replacementLength: 1 });
  assert.deepEqual(edit('draft', 'a draft'), { range: { offset: 0, length: 0 }, replacementLength: 2 });
  assert.deepEqual(edit('', 'new'), { range: { offset: 0, length: 0 }, replacementLength: 3 });
  assert.deepEqual(edit('gone', ''), { range: { offset: 0, length: 4 }, replacementLength: 0 });
  // Repeated characters must not let the prefix and suffix scans overlap.
  edit('aaa', 'aaaa');
  edit('aaaa', 'aaa');
  // Two separate changes collapse into the span that covers both, so
  // everything between them is treated as edited rather than moved.
  const wide = edit('one two three', 'ONE two THREE');
  assert.equal(wide.range.offset, 0);
  assert.equal(wide.range.length, 13);
});

test('an edit next to an astral character is described in whole characters', () => {
  for (const [before, after] of [['a😀b', 'a😀xb'], ['a😀b', 'ab'], ['a😀b', 'a😁b']]) {
    const delta = textEditBetween(before, after);
    assert.ok(isSafeRange(before, delta.range), `${before} → ${after} must not split a surrogate pair`);
    const rebuilt = `${before.slice(0, delta.range.offset)}${after.slice(delta.range.offset, delta.range.offset + delta.replacementLength)}${before.slice(delta.range.offset + delta.range.length)}`;
    assert.equal(rebuilt, after);
  }
});

test('a retained finding survives a real edit computed from the text', () => {
  const document = documentAt();
  const previous = wholeResult(document, [spelling(0, 3, 'The'), spelling(TEXT.indexOf('teh end'), 3, 'the')]);
  const text = TEXT.replace('recieve', 'receive and more words besides');
  const delta = textEditBetween(TEXT, text);
  const carried = rebaseResultAfterEdit(previous, delta.range, delta.replacementLength);
  assert.deepEqual(issueTexts(carried, text), ['Teh', 'teh']);
});

test('an issue with positions on both sides of an edit moves each of them correctly', () => {
  const document = documentAt();
  // A repetition pair: one occurrence in the first paragraph, one in the last.
  const first = TEXT.indexOf('paragraph');
  const last = TEXT.lastIndexOf('paragraph');
  const result = normalizeCheckResult(createCheckRequest(document), {
    matches: [{
      offset: last, length: 9, message: 'This word repeats nearby.',
      ikmalRelatedOccurrences: [{ start: first, end: first + 9 }],
    }],
  }, 1000);
  const issue = result.matches[0];
  assert.ok(issue.relatedRanges?.length, 'fixture must carry a related range');

  // Insert between the two occurrences. The later one moves, the earlier one
  // must not: a single delta applied to the whole issue would drag the first
  // occurrence off its word.
  const insertAt = TEXT.indexOf(MIDDLE);
  const addition = 'A new sentence. ';
  const text = `${TEXT.slice(0, insertAt)}${addition}${TEXT.slice(insertAt)}`;
  const carried = rebaseResultAfterEdit(result, { offset: insertAt, length: 0 }, addition.length);
  const moved = carried.matches[0];

  assert.equal(text.slice(moved.offset, moved.offset + moved.length), 'paragraph');
  const related = moved.relatedRanges[0];
  assert.equal(text.slice(related.offset, related.offset + related.length), 'paragraph');
  assert.equal(related.offset, first, 'a position before the edit does not move');
  assert.equal(moved.offset, last + addition.length);
});

test('an edit inside a reword candidate drops the finding it belongs to', () => {
  const document = documentAt();
  const result = normalizeCheckResult(createCheckRequest(document), {
    matches: [{
      offset: 0, length: 3, message: 'Consider rewording.',
      rewordCandidates: [{
        id: 'r1', replacementText: 'The', rationale: 'clarity',
        edits: [{ range: { offset: 40, length: 9 }, replacementText: 'sentence' }],
      }],
    }],
  }, 1000);
  assert.ok(result.matches[0].rewordCandidates?.length);

  // The issue's own range is untouched, but the text the candidate would
  // rewrite has changed, so applying it would edit something else entirely.
  const carried = rebaseResultAfterEdit(result, { offset: 44, length: 0 }, 3);
  assert.deepEqual(carried.matches, []);
});
