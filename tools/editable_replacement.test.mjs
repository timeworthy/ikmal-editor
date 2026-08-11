import assert from 'node:assert/strict';
import test from 'node:test';
import replacement from '../extension/core/editable_replacement.js';

// Builds a host whose native insert command behaves the way a given editor
// family does, and records what the replacement did to it.
function host({ accepts = true, keepsText = true, throws = false } = {}) {
  const record = { text: 'teh cat', inputEvents: 0, rangeWrites: 0 };
  return {
    record,
    context: {
      readText: () => record.text,
      runCommand: () => {
        if (throws) throw new Error('command unavailable');
        if (accepts && keepsText) record.text = 'the cat';
        return accepts;
      },
      replaceRange: () => { record.rangeWrites += 1; record.text = 'the cat'; },
      emitInput: () => { record.inputEvents += 1; },
    },
  };
}

test('a host that applies the command keeps its own edit', () => {
  const { record, context } = host();
  assert.equal(replacement.applyEditableReplacement(context), 'command');
  assert.equal(record.text, 'the cat');
  assert.equal(record.rangeWrites, 0, 'a working native command must not be followed by a second DOM edit');
  assert.equal(record.inputEvents, 1, 'the page still needs one input event');
});

test('a host that accepts the command and then restores its model still gets the replacement', () => {
  // CKEditor-style: insertText returns true, then the editor re-renders from
  // its own model and the text is back to what it was. Reported success alone
  // would leave the user clicking a suggestion that does nothing.
  const { record, context } = host({ accepts: true, keepsText: false });
  assert.equal(replacement.applyEditableReplacement(context), 'fallback');
  assert.equal(record.text, 'the cat');
  assert.equal(record.rangeWrites, 1);
  assert.equal(record.inputEvents, 1);
});

test('a host that refuses or cannot run the command falls back to the DOM edit', () => {
  for (const options of [{ accepts: false }, { throws: true }]) {
    const { record, context } = host(options);
    assert.equal(replacement.applyEditableReplacement(context), 'fallback');
    assert.equal(record.text, 'the cat');
    assert.equal(record.rangeWrites, 1);
    assert.equal(record.inputEvents, 1);
  }
});

test('the replacement never emits an input event without changing the text', () => {
  const { record, context } = host({ accepts: true, keepsText: false });
  replacement.applyEditableReplacement(context);
  assert.notEqual(record.text, 'teh cat');
  assert.equal(record.inputEvents, 1, 'exactly one event, so a host cannot see the edit twice');
});
