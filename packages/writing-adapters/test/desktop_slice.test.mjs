import assert from 'node:assert/strict';
import test from 'node:test';
import * as core from '../../writing-core/src/index.ts';
import { createDesktopSliceController } from '../dist/desktop_slice.js';

test('desktop renderer slice uses the preload-shaped service and shared correction semantics', async () => {
  const field = { tagName: 'TEXTAREA', value: 'Write teh draft', selectionStart: 0, selectionEnd: 0, setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; } };
  const calls = [];
  const controller = createDesktopSliceController({
    core,
    field,
    service: { checkText: async (text) => { calls.push(text); return { matches: [{ offset: 6, length: 3, message: 'Use the correct spelling.', replacements: [{ value: 'the' }], rule: { id: 'SPELL' }, ikmalSource: 'quality-sidecar' }] }; } },
  });
  await controller.check();
  assert.deepEqual(calls, ['Write teh draft']);
  const issue = controller.state().result.matches[0];
  assert.equal(controller.applyIssue(issue.id, 'the').applied, true);
  assert.equal(field.value, 'Write the draft');
});
