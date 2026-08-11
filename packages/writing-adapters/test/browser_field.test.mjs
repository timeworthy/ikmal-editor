import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createBrowserFieldCapability,
  isEditableField,
  readFieldSelection,
  readFieldText,
  replaceFieldText,
} from '../dist/browser_field.js';

function textarea(value, start = 0, end = start) {
  return {
    tagName: 'TEXTAREA', value, selectionStart: start, selectionEnd: end,
    setSelectionRange(nextStart, nextEnd) { this.selectionStart = nextStart; this.selectionEnd = nextEnd; },
  };
}

test('browser field capability reads bounded text and selection and applies safe replacements', () => {
  const field = textarea('Write teh draft', 6, 9);
  assert.equal(isEditableField(field), true);
  assert.equal(readFieldText(field), 'Write teh draft');
  assert.deepEqual(readFieldSelection(field), { offset: 6, length: 3 });
  assert.equal(replaceFieldText(field, { offset: 6, length: 3 }, 'the'), true);
  assert.equal(field.value, 'Write the draft');
  assert.deepEqual(readFieldSelection(field), { offset: 9, length: 0 });
  assert.equal(replaceFieldText(field, { offset: 99, length: 0 }, 'x'), false);
});

test('browser field capability exposes one host surface without Chrome or Electron imports', () => {
  const field = textarea('hello');
  const capability = createBrowserFieldCapability(field);
  assert.deepEqual(capability.snapshot(), { text: 'hello', selection: { offset: 0, length: 0 } });
  assert.equal(capability.replace({ offset: 0, length: 5 }, 'world'), true);
  assert.equal(capability.read(), 'world');
  assert.equal(isEditableField({ tagName: 'DIV', isContentEditable: false }), false);
});

// A contenteditable host, with enough of a DOM to apply a replacement: one
// text node, a range over it, and an optional native insert command whose
// behavior each test decides.
function editable(text, { execCommand } = {}) {
  const node = { nodeType: 3, nodeValue: text, childNodes: [] };
  const range = {
    start: null, end: null,
    setStart(target, offset) { this.start = { target, offset }; },
    setEnd(target, offset) { this.end = { target, offset }; },
    deleteContents() {
      const value = this.start.target.nodeValue;
      this.start.target.nodeValue = value.slice(0, this.start.offset) + value.slice(this.end.offset);
    },
    insertNode(inserted) {
      const value = this.start.target.nodeValue;
      this.start.target.nodeValue = value.slice(0, this.start.offset) + inserted.nodeValue + value.slice(this.start.offset);
    },
  };
  const selection = { ranges: [], removeAllRanges() { this.ranges = []; }, addRange(value) { this.ranges.push(value); } };
  const document = {
    createRange: () => range,
    createTextNode: (value) => ({ nodeType: 3, nodeValue: value, childNodes: [] }),
    getSelection: () => selection,
  };
  if (execCommand) document.execCommand = (command, _ui, value) => execCommand(command, value, node);
  const field = {
    tagName: 'DIV', isContentEditable: true, childNodes: [node], ownerDocument: document,
    focused: false, focus() { this.focused = true; },
    get innerText() { return this.childNodes.map((child) => child.nodeValue).join(''); },
  };
  return { field, node, selection };
}

test('a contenteditable host applies the replacement through its own insert command', () => {
  const { field, selection } = editable('Write teh draft', {
    execCommand: (command, value, node) => {
      if (command !== 'insertText') return false;
      node.nodeValue = node.nodeValue.replace('teh', value);
      return true;
    },
  });
  assert.equal(replaceFieldText(field, { offset: 6, length: 3 }, 'the'), true);
  assert.equal(readFieldText(field), 'Write the draft');
  assert.equal(field.focused, true, 'the host command needs the field focused and the range selected');
  assert.equal(selection.ranges.length, 1);
});

test('a model-backed host that accepts the command and restores its text still gets the replacement', () => {
  // CKEditor-style: insertText returns true, the editor re-renders from its own
  // model, and the text is unchanged. Trusting the report would leave the user
  // clicking a suggestion that does nothing.
  const { field } = editable('Write teh draft', { execCommand: () => true });
  assert.equal(replaceFieldText(field, { offset: 6, length: 3 }, 'the'), true);
  assert.equal(readFieldText(field), 'Write the draft');
});

test('a plain contenteditable host without a native insert command is edited directly', () => {
  const { field } = editable('Write teh draft');
  assert.equal(replaceFieldText(field, { offset: 6, length: 3 }, 'the'), true);
  assert.equal(readFieldText(field), 'Write the draft');
  assert.equal(replaceFieldText(field, { offset: 40, length: 1 }, 'x'), false, 'out-of-range edits are still refused');
});
