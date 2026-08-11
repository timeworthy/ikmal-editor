import assert from 'node:assert/strict';
import test from 'node:test';
import * as core from '../../writing-core/src/index.ts';
import { planChunkedCheck, mergeChunkedCheck, chunkedCheckState } from '../dist/chunked_checks.js';

const OPENING = 'Teh opening paragraph runs on for long enough that a narrow chunk window cannot reach past its own blank line at all.';
const MIDDLE = 'The middle paragraph is where the writing happens and it also carries plenty of words so the window stays inside it.';
const CLOSING = 'A closing paragraph mentions teh end and continues with more words so that nothing wanders into it by accident.';
const TEXT = `${OPENING}\n\n${MIDDLE}\n\n${CLOSING}`;

const typo = (offset, length, message = 'Use the correct spelling.') => ({
  offset, length, message, replacements: [{ value: 'The' }],
  rule: { id: 'SPELL', category: { id: 'TYPOS' } }, ikmalSource: 'LanguageTool',
});

const state = (text, matches, antecedents = []) => ({ text, matches, antecedents });
// Centred, so a narrow window stays inside the paragraph it starts in.
const caretIn = (needle) => TEXT.indexOf(needle) + Math.floor(needle.length / 2);

test('a first check has nothing to merge into, so it checks everything', () => {
  // A chunk on its own would be a document where every finding outside the
  // window silently disappeared.
  const plan = planChunkedCheck(core, TEXT, null, { caret: caretIn(MIDDLE), budget: 40 });
  assert.equal(plan.chunk, null);
  assert.equal(plan.sent, TEXT);
  assert.equal(plan.carried, null);
});

test('a later check sends only the text around the caret', () => {
  const previous = state(TEXT, [typo(0, 3)]);
  const plan = planChunkedCheck(core, TEXT, previous, { caret: caretIn(MIDDLE), budget: 40 });
  assert.ok(plan.chunk, 'a long document with a caret is chunked');
  assert.equal(plan.sent, TEXT.slice(plan.chunk.offset, plan.chunk.offset + plan.chunk.length));
  assert.ok(plan.sent.length < TEXT.length);
  assert.equal(plan.sent.includes('teh end'), false, 'the chunk did not reach the closing paragraph');
});

test('the whole document is checked when it is short, asked for, or has no caret', () => {
  const previous = state(TEXT, [typo(0, 3)]);
  assert.equal(planChunkedCheck(core, TEXT, previous, { caret: 10, scope: 'document', budget: 40 }).chunk, null);
  assert.equal(planChunkedCheck(core, TEXT, previous, { budget: 40 }).chunk, null);
  assert.equal(planChunkedCheck(core, TEXT, previous, { caret: null, budget: 40 }).chunk, null);
  const short = 'A short draft.';
  assert.equal(planChunkedCheck(core, short, state(short, []), { caret: 2 }).chunk, null);
});

test('carried findings describe the text as it is now', () => {
  const previous = state(TEXT, [typo(0, 3), typo(TEXT.indexOf('teh end'), 3)]);
  const addition = 'One more sentence. ';
  const text = `${TEXT.slice(0, TEXT.indexOf(MIDDLE))}${addition}${TEXT.slice(TEXT.indexOf(MIDDLE))}`;
  const plan = planChunkedCheck(core, text, previous, { caret: caretIn(MIDDLE), budget: 40 });
  const words = plan.carried.matches.map((match) => text.slice(match.offset, match.offset + match.length));
  assert.deepEqual(words, ['Teh', 'teh'], 'both carried findings still cover their own words');
});

test('merging a chunk keeps the findings it never looked at', () => {
  const previous = state(TEXT, [typo(0, 3), typo(TEXT.indexOf('teh end'), 3)]);
  const plan = planChunkedCheck(core, TEXT, previous, { caret: caretIn(MIDDLE), budget: 40 });
  // The chunk found one thing, in its own coordinates.
  const merged = mergeChunkedCheck({ matches: [typo(4, 6, 'A new finding.')] }, plan);
  const words = merged.matches.map((match) => TEXT.slice(match.offset, match.offset + match.length));
  assert.equal(words[0], 'Teh');
  assert.equal(words.at(-1), 'teh');
  assert.equal(merged.matches.length, 3);
  assert.equal(merged.matches[1].message, 'A new finding.');
  assert.ok(merged.matches[1].offset > plan.chunk.offset, 'the new finding was moved into the document');
  assert.equal(merged.ikmalFullCheckPending, true, 'a chunked result still owes a whole pass');
});

test('a chunk that finds nothing still clears what was inside it', () => {
  const insideChunk = typo(TEXT.indexOf(MIDDLE) + 4, 6, 'Stale finding.');
  const previous = state(TEXT, [typo(0, 3), insideChunk, typo(TEXT.indexOf('teh end'), 3)]);
  const plan = planChunkedCheck(core, TEXT, previous, { caret: caretIn(MIDDLE), budget: 40 });
  const merged = mergeChunkedCheck({ matches: [] }, plan);
  assert.deepEqual(merged.matches.map((match) => match.message), ['Use the correct spelling.', 'Use the correct spelling.']);
});

test('a whole check replaces everything and owes nothing', () => {
  const previous = state(TEXT, [typo(0, 3)]);
  const plan = planChunkedCheck(core, TEXT, previous, { scope: 'document' });
  const merged = mergeChunkedCheck({ matches: [typo(9, 4)] }, plan);
  assert.equal(merged.matches.length, 1, 'a whole check is the whole answer');
  assert.equal(merged.ikmalFullCheckPending, undefined);
});

test('the state carried to the next check is the document, not the chunk', () => {
  const previous = state(TEXT, [typo(0, 3)]);
  const plan = planChunkedCheck(core, TEXT, previous, { caret: caretIn(MIDDLE), budget: 40 });
  const merged = mergeChunkedCheck({ matches: [] }, plan);
  const next = chunkedCheckState(plan, merged);
  assert.equal(next.text, TEXT);
  assert.deepEqual(next.matches, merged.matches);
  assert.deepEqual(next.antecedents, merged.ikmalAntecedents);
});

test('a relationship is carried only while both of its ends survive', () => {
  const pronoun = TEXT.indexOf(' it,') + 1;
  const link = { start: pronoun, end: pronoun + 2, antecedentStart: 0, antecedentEnd: 3 };
  const previous = state(TEXT, [], [link]);
  // A chunk containing one end of the pair re-decides it.
  const plan = planChunkedCheck(core, TEXT, previous, { caret: pronoun, budget: 40 });
  assert.ok(plan.chunk);
  const merged = mergeChunkedCheck({ matches: [], ikmalAntecedents: [] }, plan);
  assert.deepEqual(merged.ikmalAntecedents, [], 'half a pair is not a finding');
});
