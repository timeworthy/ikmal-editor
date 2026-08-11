import assert from 'node:assert/strict';
import test from 'node:test';
import * as core from '../../writing-core/src/index.ts';
import { createBrowserFieldCapability } from '../dist/browser_field.js';
import { createBrowserSliceController } from '../dist/browser_slice.js';

test('browser slice feeds a field snapshot through core and rejects stale responses', async () => {
  const field = { tagName: 'TEXTAREA', value: 'Write teh draft', selectionStart: 0, selectionEnd: 0, setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; } };
  const capability = createBrowserFieldCapability(field);
  let release;
  const controller = createBrowserSliceController({
    core,
    field: capability,
    check: () => new Promise((resolve) => { release = resolve; }),
  });
  const pending = controller.check();
  field.value = 'Write the draft';
  release({ matches: [] });
  const stale = await pending;
  assert.equal(stale.stale, true);
  assert.equal(stale.checking, false);
  assert.equal(controller.state().document.text, 'Write teh draft');
});

test('browser slice applies only a current normalized issue through the field capability', async () => {
  const field = { tagName: 'TEXTAREA', value: 'Write teh draft', selectionStart: 0, selectionEnd: 0, setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; } };
  const controller = createBrowserSliceController({
    core,
    field: createBrowserFieldCapability(field),
    check: async () => ({ matches: [{ offset: 6, length: 3, message: 'Use the correct spelling.', replacements: [{ value: 'the' }], rule: { id: 'SPELL' }, ikmalSource: 'quality-sidecar' }] }),
  });
  await controller.check();
  const issue = controller.state().result.matches[0];
  const applied = controller.applyIssue(issue.id, 'the');
  assert.equal(applied.applied, true);
  assert.equal(field.value, 'Write the draft');
  assert.equal(controller.state().result, null);
  assert.equal(controller.applyIssue(issue.id, 'other').applied, false);
});

test('browser slice rebases selected-check offsets before applying a correction', async () => {
  const field = { tagName: 'TEXTAREA', value: 'Write teh draft', selectionStart: 6, selectionEnd: 9, setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; } };
  const controller = createBrowserSliceController({
    core,
    field: createBrowserFieldCapability(field),
    check: async (request) => {
      assert.deepEqual(request.selection, { offset: 6, length: 3 });
      assert.equal(request.text, 'teh');
      return { matches: [{ offset: 0, length: 3, message: 'Use the correct spelling.', replacements: [{ value: 'the' }], rule: { id: 'SPELL' } }] };
    },
  });
  await controller.check();
  const issue = controller.state().result.matches[0];
  assert.equal(issue.offset, 6);
  assert.equal(controller.applyIssue(issue.id, 'the').applied, true);
  assert.equal(field.value, 'Write the draft');
});

test('browser slice keeps the newest response during rapid consecutive checks', async () => {
  const field = { tagName: 'TEXTAREA', value: 'Write teh draft', selectionStart: 0, selectionEnd: 0, setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; } };
  const pending = [];
  const controller = createBrowserSliceController({
    core,
    field: createBrowserFieldCapability(field),
    check: (request) => new Promise((resolve) => pending.push({ request, resolve })),
  });
  const first = controller.check();
  field.value = 'Write the draft';
  const second = controller.check();
  assert.equal(pending.length, 2);
  pending[1].resolve({ matches: [] });
  const newest = await second;
  assert.equal(newest.stale, undefined);
  assert.equal(newest.document.text, 'Write the draft');
  assert.equal(newest.result.matches.length, 0);
  pending[0].resolve({ matches: [{ offset: 6, length: 3, message: 'stale', replacements: [{ value: 'the' }], rule: { id: 'STALE' } }] });
  const stale = await first;
  assert.equal(stale.stale, true);
  assert.equal(controller.state().document.text, 'Write the draft');
  assert.equal(controller.state().result.matches.length, 0);
  assert.equal(controller.state().checking, false);
});

// A textarea long enough to be chunked, with a typo in the first paragraph and
// another in the last, so an edit in the middle must leave both alone.
const OPENING = 'Teh opening paragraph runs on for long enough that a narrow chunk window cannot reach past its own blank line at all.';
const MIDDLE = 'The middle paragraph is where the writing happens and it also carries plenty of words so the window stays inside it.';
const CLOSING = 'A closing paragraph mentions teh end and continues with more words so that nothing wanders into it by accident.';
const LONG_TEXT = `${OPENING}\n\n${MIDDLE}\n\n${CLOSING}`;

function textareaAt(value, caret = 0) {
  return {
    tagName: 'TEXTAREA', value, selectionStart: caret, selectionEnd: caret,
    setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; },
  };
}

const typo = (offset, length) => ({
  offset, length, message: 'Use the correct spelling.', replacements: [{ value: 'The' }],
  rule: { id: 'SPELL', category: { id: 'TYPOS' }, issueType: 'misspelling' },
});

test('browser slice checks a chunk around the caret and keeps the findings outside it', async () => {
  const field = textareaAt(LONG_TEXT);
  const requests = [];
  const controller = createBrowserSliceController({
    core,
    field: createBrowserFieldCapability(field),
    chunkBudget: 40,
    check: async (request) => {
      requests.push(request);
      // The first check sees the whole document; later chunk checks answer for
      // the middle paragraph only, which has no findings.
      return request.selection
        ? { matches: [] }
        : { matches: [typo(0, 3), typo(LONG_TEXT.indexOf('teh end'), 3)] };
    },
  });

  await controller.check({ mode: 'active', until: null }, { scope: 'document' });
  assert.equal(requests[0].selection, undefined);
  assert.equal(controller.state().result.matches.length, 2);
  assert.equal(controller.state().fullCheckPending, false);

  // Type inside the middle paragraph.
  const insertAt = LONG_TEXT.indexOf('and it also');
  const addition = 'while the draft grows, ';
  field.value = `${LONG_TEXT.slice(0, insertAt)}${addition}${LONG_TEXT.slice(insertAt)}`;
  field.selectionStart = field.selectionEnd = insertAt + addition.length;
  const state = await controller.check();

  const chunk = requests[1];
  assert.ok(chunk.selection, 'a document past the budget is checked in a chunk');
  assert.ok(chunk.text.length < field.value.length, 'the chunk is smaller than the document');
  assert.equal(chunk.text.includes('teh end'), false, 'the chunk did not reach the closing paragraph');
  assert.equal(state.fullCheckPending, true, 'cross-sentence findings still owe a full pass');

  const words = state.result.matches.map((issue) => field.value.slice(issue.offset, issue.offset + issue.length));
  assert.deepEqual(words, ['Teh', 'teh'], 'both retained findings still cover their own words');
  assert.deepEqual(state.result.statistics, core.textStatistics(field.value), 'counters describe the document, not the chunk');
});

test('browser slice can be told to check the whole document again', async () => {
  const field = textareaAt(LONG_TEXT, LONG_TEXT.length);
  const requests = [];
  const controller = createBrowserSliceController({
    core,
    field: createBrowserFieldCapability(field),
    chunkBudget: 40,
    check: async (request) => { requests.push(request); return { matches: [] }; },
  });

  // The first check is whole however long the document is: there are no
  // findings to merge a slice into yet. Only once there are does an edit get
  // answered with a chunk, and that is the state this test needs.
  await controller.check();
  assert.equal(requests[0].selection, undefined, 'the first check has nothing to carry, so it is whole');
  assert.equal(controller.state().fullCheckPending, false);

  field.value = `${LONG_TEXT} More.`;
  field.selectionStart = field.value.length;
  field.selectionEnd = field.value.length;
  await controller.check();
  assert.ok(requests[1].selection, 'an edit with findings to carry is answered with a chunk');
  assert.equal(controller.state().fullCheckPending, true);

  await controller.check({ mode: 'active', until: null }, { scope: 'document' });
  assert.equal(requests[2].selection, undefined);
  assert.equal(requests[2].text, field.value);
  assert.equal(controller.state().fullCheckPending, false, 'the idle full pass settles the debt');
});

test('a retained finding can still be applied after an edit somewhere else', async () => {
  const field = textareaAt(LONG_TEXT);
  const controller = createBrowserSliceController({
    core,
    field: createBrowserFieldCapability(field),
    chunkBudget: 40,
    check: async (request) => (request.selection ? { matches: [] } : { matches: [typo(0, 3)] }),
  });
  await controller.check({ mode: 'active', until: null }, { scope: 'document' });
  const issue = controller.state().result.matches[0];

  // Typing in the closing paragraph moves the opening finding not at all, and
  // the retained finding must remain applicable rather than waiting for a check
  // that already happened.
  const insertAt = LONG_TEXT.indexOf('A closing');
  field.value = `${LONG_TEXT.slice(0, insertAt)}One more sentence. ${LONG_TEXT.slice(insertAt)}`;
  field.selectionStart = field.selectionEnd = insertAt + 19;
  await controller.check();

  const retained = controller.state().result.matches.find((candidate) => candidate.id === issue.id);
  assert.ok(retained, 'the untouched finding survived the edit');
  assert.equal(controller.applyIssue(retained.id, 'The').applied, true);
  assert.ok(field.value.startsWith('The opening paragraph'));
});

test('a short document is still checked whole', async () => {
  const field = textareaAt('Write teh draft');
  const requests = [];
  const controller = createBrowserSliceController({
    core,
    field: createBrowserFieldCapability(field),
    check: async (request) => { requests.push(request); return { matches: [] }; },
  });
  await controller.check();
  assert.equal(requests[0].selection, undefined, 'a document inside the budget is never chunked');
  assert.equal(requests[0].text, 'Write teh draft');
  assert.equal(controller.state().fullCheckPending, false);
});

// Chunking and retention only make sense together. Both implementations in
// this package now agree that a check with nothing to carry is a whole one;
// what this covers is the other half, which is that a chunk keeps the findings
// it never looked at.
test('a chunked recheck carries the findings it did not look at', async () => {
  const filler = Array.from({ length: 60 }, (_, index) =>
    `Middle paragraph ${index} carries enough words that a chunk window centred here cannot reach the ends of the draft.`);
  const text = ['Opening paragraph where the results is wrong.', ...filler, 'Closing paragraph.'].join('\n\n');
  const field = { tagName: 'TEXTAREA', value: text, selectionStart: text.length, selectionEnd: text.length, setSelectionRange() {} };
  const sent = [];
  const controller = createBrowserSliceController({
    core,
    field: createBrowserFieldCapability(field),
    check: async (request) => {
      sent.push(request.text);
      const offset = request.text.indexOf('results is');
      return { matches: offset < 0 ? [] : [{ offset, length: 10, message: 'A plural subject takes a plural verb.', replacements: [{ value: 'results are' }], rule: { id: 'PLURAL' }, ikmalSource: 'quality-sidecar' }] };
    },
  });

  // A whole pass first, so there is something to carry.
  const whole = await controller.check({ mode: 'active', until: null }, { scope: 'document' });
  assert.equal(sent[0], text);
  assert.equal(whole.result.matches.length, 1);

  field.value = `${text} A closing sentence.`;
  field.selectionStart = field.value.length;
  field.selectionEnd = field.value.length;
  const chunked = await controller.check();
  assert.ok(sent[1].length < field.value.length, `expected a chunk, got ${sent[1].length} of ${field.value.length}`);
  assert.ok(!sent[1].includes('results is'), 'the chunk should not have reached the opening paragraph');
  assert.equal(chunked.fullCheckPending, true, 'a chunked check owes a whole pass');
  assert.ok(
    chunked.result.matches.some((issue) => issue.message.includes('plural subject')),
    'the finding outside the rechecked chunk was dropped',
  );
});
