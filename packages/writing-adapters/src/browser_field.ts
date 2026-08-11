/** Browser DOM field capability. No Chrome/runtime or product semantics belong here. */

export interface BrowserTextRange {
  offset: number;
  length: number;
}

export interface BrowserFieldSnapshot {
  text: string;
  selection: BrowserTextRange | null;
}

export interface BrowserFieldCapability {
  readonly element: object;
  read(): string;
  selection(): BrowserTextRange | null;
  snapshot(): BrowserFieldSnapshot;
  replace(range: BrowserTextRange, replacement: string): boolean;
}

export type EditableElement = HTMLElement & {
  value?: string;
  selectionStart?: number | null;
  selectionEnd?: number | null;
  setSelectionRange?: (start: number, end: number) => void;
};

const TEXT_INPUT_TYPES = new Set(['text', 'search', 'email', 'url', 'tel', 'password', 'number']);

function tagName(value: unknown): string {
  return String((value as { tagName?: unknown } | null)?.tagName || '').toLowerCase();
}

export function isEditableField(value: unknown): value is EditableElement {
  if (!value || typeof value !== 'object') return false;
  const element = value as EditableElement;
  const tag = tagName(element);
  if (tag === 'textarea') return true;
  if (tag === 'input') return TEXT_INPUT_TYPES.has(String((element as HTMLInputElement).type || 'text').toLowerCase());
  return element.isContentEditable === true || element.getAttribute?.('contenteditable') === '' || element.getAttribute?.('contenteditable') === 'true';
}

export function readFieldText(field: EditableElement): string {
  if (tagName(field) === 'textarea' || tagName(field) === 'input') return typeof field.value === 'string' ? field.value : '';
  return String(field.innerText ?? field.textContent ?? '');
}

function selectionInside(field: EditableElement, node: Node | null): boolean {
  if (!node) return false;
  if (node === field) return true;
  return typeof field.contains === 'function' && field.contains(node);
}

function documentSelection(field: EditableElement): BrowserTextRange | null {
  const document = field.ownerDocument;
  const selection = document?.getSelection?.();
  if (!selection || selection.rangeCount === 0) return null;
  const selected = selection.getRangeAt(0);
  if (!selectionInside(field, selected.startContainer) || !selectionInside(field, selected.endContainer)) return null;
  const before = document.createRange();
  before.selectNodeContents(field);
  before.setEnd(selected.startContainer, selected.startOffset);
  return { offset: before.toString().length, length: selected.toString().length };
}

export function readFieldSelection(field: EditableElement): BrowserTextRange | null {
  if (tagName(field) === 'textarea' || tagName(field) === 'input') {
    const start = Number(field.selectionStart);
    const end = Number(field.selectionEnd);
    if (Number.isSafeInteger(start) && Number.isSafeInteger(end) && start >= 0 && end >= start) {
      return { offset: start, length: end - start };
    }
    return null;
  }
  return documentSelection(field);
}

function validRange(text: string, range: BrowserTextRange): boolean {
  return Number.isSafeInteger(range.offset) && Number.isSafeInteger(range.length)
    && range.offset >= 0 && range.length >= 0 && range.offset + range.length <= text.length;
}

function textNodes(root: Node): Text[] {
  const nodes: Text[] = [];
  const visit = (node: Node) => {
    if (node.nodeType === 3) nodes.push(node as Text);
    node.childNodes?.forEach(visit);
  };
  visit(root);
  return nodes;
}

function pointAt(root: EditableElement, offset: number): { node: Node; offset: number } | null {
  let remaining = offset;
  for (const node of textNodes(root)) {
    const length = node.nodeValue?.length || 0;
    if (remaining <= length) return { node, offset: remaining };
    remaining -= length;
  }
  return { node: root, offset: root.childNodes.length };
}

// A rich-text host may own a model that a direct DOM edit does not reach: the
// edit lands, the editor re-renders from its model, and the replacement is
// gone. Routing through the host's own insert command first goes through that
// model. The command reports only that it was accepted, though, so an
// acceptance that left the text unchanged still needs the DOM edit.
function insertThroughHost(field: EditableElement, edit: Range, replacement: string): boolean {
  const document = field.ownerDocument;
  const selection = document?.getSelection?.();
  if (!selection || typeof document.execCommand !== 'function') return false;
  const before = readFieldText(field);
  try {
    field.focus?.();
    selection.removeAllRanges?.();
    selection.addRange?.(edit);
    return document.execCommand('insertText', false, replacement) && readFieldText(field) !== before;
  } catch {
    return false;
  }
}

function replaceContentEditable(field: EditableElement, range: BrowserTextRange, replacement: string): boolean {
  const document = field.ownerDocument;
  if (!document?.createRange || !document.createTextNode) return false;
  const start = pointAt(field, range.offset);
  const end = pointAt(field, range.offset + range.length);
  if (!start || !end) return false;
  const edit = document.createRange();
  edit.setStart(start.node, start.offset);
  edit.setEnd(end.node, end.offset);
  if (insertThroughHost(field, edit, replacement)) return true;
  edit.deleteContents();
  if (replacement) edit.insertNode(document.createTextNode(replacement));
  return true;
}

export function replaceFieldText(field: EditableElement, range: BrowserTextRange, replacement: string): boolean {
  const text = readFieldText(field);
  if (!validRange(text, range)) return false;
  const tag = tagName(field);
  if (tag === 'textarea' || tag === 'input') {
    field.value = `${text.slice(0, range.offset)}${replacement}${text.slice(range.offset + range.length)}`;
    const caret = range.offset + replacement.length;
    field.setSelectionRange?.(caret, caret);
    return true;
  }
  return replaceContentEditable(field, range, replacement);
}

export function createBrowserFieldCapability(field: EditableElement): BrowserFieldCapability {
  if (!isEditableField(field)) throw new Error('The browser field capability requires an editable field.');
  return {
    element: field,
    read: () => readFieldText(field),
    selection: () => readFieldSelection(field),
    snapshot: () => ({ text: readFieldText(field), selection: readFieldSelection(field) }),
    replace: (range, replacement) => replaceFieldText(field, range, replacement),
  };
}
