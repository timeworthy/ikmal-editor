// Applying a suggestion inside a rich-text host, without a DOM dependency.
//
// A contenteditable field can belong to a model-backed editor (CKEditor,
// ProseMirror, Quill) that treats direct DOM edits as damage and restores its
// own model on the next render. execCommand routes the edit through the
// editor's native input pipeline instead, which those editors accept — but its
// return value only reports that the command was accepted, not that the text
// changed. An editor can accept the command and still restore its model, and an
// editor can change the text without forwarding the resulting input event to
// the page when the command came from an extension's isolated world.
//
// So the accepted flag alone cannot decide what happens next: only text that
// actually changed counts as applied.

(function installEditableReplacement(root) {
  // context.readText      - current text of the field
  // context.runCommand    - runs the host's native insert, returns its report
  // context.replaceRange  - writes the replacement straight into the DOM
  // context.emitInput     - dispatches the page-facing input event
  // Returns 'command' when the host applied the edit itself, 'fallback' when
  // the DOM edit had to stand in for it.
  function applyEditableReplacement(context) {
    const before = context.readText();
    let accepted = false;
    try {
      accepted = Boolean(context.runCommand());
    } catch {
      accepted = false;
    }
    if (accepted && context.readText() !== before) {
      // The host already holds the new text; the event only tells the page.
      context.emitInput();
      return 'command';
    }
    // Either the host refused the command or it accepted and then reverted.
    // Both leave the user looking at unchanged text after clicking a
    // suggestion, so both need the DOM edit.
    context.replaceRange();
    context.emitInput();
    return 'fallback';
  }

  const api = { applyEditableReplacement };
  root.IkmalEditableReplacement = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
