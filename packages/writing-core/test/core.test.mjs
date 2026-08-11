import assert from 'node:assert/strict';
import test from 'node:test';
import {
  acceptCurrentResult,
  applyCorrection,
  applyRewordCandidate,
  applyTextEdit,
  createCheckRequest,
  createTextDocument,
  filterIssues,
  normalizeCheckResult,
  normalizeIssue,
  rangesOverlap,
  resultIsCurrent,
  resolveLanguageState,
  resolveIndicatorState,
  selectedText,
  selectionStatistics,
  startFocusState,
  textStatistics,
  undoCorrection,
  validateRewordCandidate,
} from '../src/index.ts';
import { documentFixture, rawCheckFixture, rawRewordMatch, rewordText } from './fixtures.mjs';

const request = {
  documentId: documentFixture.id,
  revision: documentFixture.revision,
  text: documentFixture.text,
  language: documentFixture.language,
};

test('normalizes deterministic findings, relationships, and Unicode-safe statistics', () => {
  const result = normalizeCheckResult(request, rawCheckFixture, 1234);
  assert.equal(result.matches.length, 3);
  assert.deepEqual(result.matches.map(({ category, offset }) => ({ category, offset })), [
    { category: 'grammar', offset: 4 },
    { category: 'repetition', offset: 31 },
    { category: 'relationship', offset: 52 },
  ]);
  assert.equal(result.statistics.words, 12);
  assert.equal(result.statistics.characters, Array.from(request.text).length);
  assert.equal(result.detectedLanguage.code, 'en-US');
  assert.equal(result.relationships.length, 1);
  assert.deepEqual(result.relationships[0].ranges, [
    { offset: 52, length: 2 },
    { offset: 26, length: 5 },
  ]);
  assert.deepEqual(result.matches[1].relatedRanges, [{ offset: 26, length: 5 }]);
});

test('issue identity is independent of response order and exact duplicates', () => {
  const first = normalizeCheckResult(request, rawCheckFixture, 1234);
  const reversed = normalizeCheckResult(request, {
    ...rawCheckFixture,
    matches: [...rawCheckFixture.matches].reverse().concat(rawCheckFixture.matches[0]),
  }, 1234);
  assert.deepEqual(reversed.matches.map((issue) => issue.id), first.matches.map((issue) => issue.id));
  assert.equal(normalizeIssue(request.text, rawCheckFixture.matches[0]).id, first.matches[0].id);
});

test('overlap and malformed ranges are deterministic and safe', () => {
  assert.equal(rangesOverlap({ offset: 0, length: 4 }, { offset: 3, length: 2 }), true);
  assert.equal(rangesOverlap({ offset: 0, length: 4 }, { offset: 4, length: 2 }), false);
  assert.equal(normalizeIssue('😀 word', { offset: 0, length: 1, message: 'bad' }), null);
  assert.equal(normalizeIssue('😀 word', { offset: 0, length: 2, message: 'bad' }).matchedText, '😀');
});

test('focus and dictionary filtering are semantic, not visual-only', () => {
  const result = normalizeCheckResult(request, rawCheckFixture, 1234);
  const dictionary = filterIssues(result.matches, { dictionaryWords: ['results'] });
  assert.equal(dictionary.length, 3, 'dictionary only suppresses spelling findings');
  const zen = filterIssues(result.matches, { sensitivity: 55 }, startFocusState('zen', '1h', 1000), 1234);
  assert.deepEqual(zen.map((issue) => issue.category), ['grammar', 'relationship']);
  assert.deepEqual(filterIssues(result.matches, {}, { mode: 'paused', until: null }, 1234), []);
});

test('indicator state is derived from availability, focus, and normalized issue count', () => {
  assert.deepEqual(resolveIndicatorState({ issueCount: 2 }), {
    status: 'issues', issueCount: 2, mode: 'active', label: '2 issues',
  });
  assert.deepEqual(resolveIndicatorState({ checking: true, issueCount: 2 }), {
    status: 'checking', issueCount: 2, mode: 'active', label: 'Checking',
  });
  assert.deepEqual(resolveIndicatorState({ issueCount: 1, focus: { mode: 'zen', until: null } }), {
    status: 'zen', issueCount: 1, mode: 'zen', label: 'Zen mode, 1 issue',
  });
  assert.equal(resolveIndicatorState({ available: false }).status, 'unavailable');
});

test('stale results cannot apply to a newer document revision', () => {
  const document = createTextDocument(documentFixture);
  const result = normalizeCheckResult(request, rawCheckFixture, 1234);
  assert.equal(resultIsCurrent(document, result), true);
  const newer = applyTextEdit(document, { offset: 4, length: 7 }, 'result');
  assert.equal(newer.revision, 4);
  assert.equal(resultIsCurrent(newer, result), false);
  assert.equal(acceptCurrentResult(newer, result), null);
  assert.equal(newer.text, 'The result is ready. The draft draft is concise. It are useful.');
});

test('statistics count Unicode code points and apostrophe words', () => {
  assert.deepEqual(textStatistics("Café’s 😀 draft"), { words: 2, characters: 14 });
});

test('language state stays conservative for short uncertain text', () => {
  const uncertain = resolveLanguageState('auto', { code: 'de-DE', confidence: 0.42 }, 'en-US');
  assert.equal(uncertain.status, 'uncertain');
  assert.equal(uncertain.effective.requested, 'en-US');
  const explicit = resolveLanguageState('fr-FR', { code: 'de-DE', confidence: 0.99 }, 'en-US');
  assert.equal(explicit.status, 'explicit');
  assert.equal(explicit.effective.requested, 'fr-FR');
  const mixed = resolveLanguageState('auto', { code: 'en-US', confidence: 0.94, mixed: true }, 'en-US');
  assert.equal(mixed.status, 'mixed');
});

test('selection requests and statistics stay inside the active document', () => {
  const document = createTextDocument({ ...documentFixture, text: 'Review 😀 this sentence.' });
  const selection = { offset: 7, length: 2 };
  const request = createCheckRequest(document, selection);
  assert.deepEqual(request.selection, selection);
  assert.equal(request.text, '😀');
  assert.equal(selectedText(document, selection), '😀');
  assert.deepEqual(selectionStatistics(document, selection), { words: 0, characters: 1 });
  assert.throws(() => createCheckRequest(document, { offset: 7, length: 1 }), /non-empty range/);
});

test('reword candidates require a current revision, bounded edits, rationale, and protected tokens', () => {
  const document = createTextDocument({ id: 'reword-1', text: rewordText, revision: 2, language: 'en-US', source: 'desktop' });
  const issue = normalizeIssue(rewordText, rawRewordMatch);
  const candidate = issue.rewordCandidates[0];
  const request = { documentId: document.id, revision: document.revision, text: document.text, language: document.language, scope: 'sentence', range: { offset: 0, length: rewordText.length }, reason: 'wordiness' };
  assert.equal(validateRewordCandidate(document, request, candidate, { protectedTokens: ['https://ikmal.example.'] }).safe, true);
  assert.equal(validateRewordCandidate(document, request, candidate, { protectedTokens: ['https://other.example/'] }).safe, false);
  assert.equal(validateRewordCandidate(document, request, candidate, { unresolvedRanges: [candidate.edits[0].range] }).safe, false);
  assert.equal(validateRewordCandidate({ ...document, revision: 3 }, request, candidate).reasons[0], 'stale-revision');
});

test('reword apply and correction undo are explicit and stale-safe', () => {
  const document = createTextDocument({ id: 'reword-2', text: rewordText, revision: 2, language: 'en-US', source: 'desktop' });
  const issue = normalizeIssue(rewordText, rawRewordMatch);
  const candidate = issue.rewordCandidates[0];
  const request = { documentId: document.id, revision: document.revision, text: document.text, language: document.language, scope: 'sentence', range: { offset: 0, length: rewordText.length }, reason: 'wordiness' };
  assert.throws(() => applyRewordCandidate(document, request, candidate), /not safe to apply/);
  const applied = applyRewordCandidate(document, request, candidate, { confirmed: true, protectedTokens: ['https://ikmal.example.'] });
  assert.equal(applied.document.text, 'The report is long at https://ikmal.example.');
  assert.equal(applied.record.kind, 'rewording');
  assert.equal(undoCorrection(applied.document, applied.record).text, document.text);
  const manuallyApplied = applyCorrection(document, { offset: 4, length: 6 }, 'summary', { issueId: 'issue-1', timestamp: 500 });
  assert.equal(undoCorrection(manuallyApplied.document, manuallyApplied.record).text, document.text);
  assert.equal(undoCorrection(applyTextEdit(manuallyApplied.document, { offset: 0, length: 0 }, 'x'), manuallyApplied.record), null);
});
