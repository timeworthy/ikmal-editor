import type { BrowserFieldCapability } from './browser_field.js';

export interface BrowserCoreDocument {
  id: string;
  text: string;
  revision: number;
  language: unknown;
  source: string;
}

export interface BrowserCoreRequest {
  documentId: string;
  revision: number;
  text: string;
  language: unknown;
  selection?: { offset: number; length: number };
}

export interface BrowserCoreResult {
  documentId: string;
  revision: number;
  matches: Array<{ id: string; offset: number; length: number; source: string; [key: string]: unknown }>;
  statistics: { words: number; characters: number };
  [key: string]: unknown;
}

export interface BrowserAppliedCorrection {
  document: BrowserCoreDocument;
  record: { id: string; issueId?: string; revisionBefore: number; revisionAfter: number; [key: string]: unknown };
}

export interface BrowserCoreBridge {
  createTextDocument(input: { id: string; text: string; revision: number; language: string; source: 'browser-field' }): BrowserCoreDocument;
  createCheckRequest(document: BrowserCoreDocument, selection?: { offset: number; length: number }): BrowserCoreRequest;
  normalizeCheckResult(request: BrowserCoreRequest, raw: unknown, checkedAt: number, focus: { mode: 'active' | 'paused' | 'zen'; until: number | null }): BrowserCoreResult;
  rebaseCheckResult(result: BrowserCoreResult, offset: number): BrowserCoreResult;
  rebaseResultAfterEdit(result: BrowserCoreResult, edit: { offset: number; length: number }, replacementLength: number): BrowserCoreResult;
  mergeChunkResult(previous: BrowserCoreResult | null, chunk: BrowserCoreResult, range: { offset: number; length: number }, document: BrowserCoreDocument): BrowserCoreResult;
  chunkAround(text: string, caret: number, options?: { budget?: number; maxCharacters?: number }): { offset: number; length: number };
  textEditBetween(before: string, after: string): { range: { offset: number; length: number }; replacementLength: number } | null;
  resultIsCurrent(document: BrowserCoreDocument, result: Pick<BrowserCoreResult, 'documentId' | 'revision'>): boolean;
  applyCorrection(document: BrowserCoreDocument, range: { offset: number; length: number }, replacement: string, metadata: { issueId: string; source: string; kind: 'correction' }): BrowserAppliedCorrection;
  resolveIndicatorState(input: { checking?: boolean; issueCount?: number; available?: boolean; focus?: { mode: 'active' | 'paused' | 'zen'; until: number | null }}): { status: string; issueCount: number; mode: string; label: string };
}

export interface BrowserSliceState {
  document: BrowserCoreDocument;
  result: BrowserCoreResult | null;
  indicator: { status: string; issueCount: number; mode: string; label: string };
  checking: boolean;
  // True once a chunk check has answered for findings that a whole-document
  // check has not seen since. Cross-sentence findings — repetition, antecedent
  // links — cannot be derived from one chunk, so the host schedules a full pass
  // on idle while this is set.
  fullCheckPending: boolean;
}

export interface CheckOptions {
  // 'auto' checks a chunk around the caret once the document outgrows the
  // budget; 'document' always sends everything.
  scope?: 'auto' | 'document';
}

export interface BrowserSliceController {
  state(): BrowserSliceState;
  check(focus?: { mode: 'active' | 'paused' | 'zen'; until: number | null }, options?: CheckOptions): Promise<BrowserSliceState & { stale?: boolean }>;
  applyIssue(issueID: string, replacement: string): { applied: boolean; record?: BrowserAppliedCorrection['record'] };
}

export function createBrowserSliceController({
  core,
  field,
  check,
  documentID = 'browser-field',
  language = 'auto',
  chunkBudget,
}: {
  core: BrowserCoreBridge;
  field: BrowserFieldCapability;
  check: (request: BrowserCoreRequest) => Promise<unknown>;
  documentID?: string;
  language?: string;
  chunkBudget?: number;
}): BrowserSliceController {
  let document = core.createTextDocument({ id: documentID, text: field.read(), revision: 0, language, source: 'browser-field' });
  let result: BrowserCoreResult | null = null;
  let checking = false;
  let fullCheckPending = false;
  let caret = 0;
  let focus: { mode: 'active' | 'paused' | 'zen'; until: number | null } = { mode: 'active', until: null };

  function indicator() {
    return core.resolveIndicatorState({ checking, issueCount: result?.matches.length || 0, available: true, focus });
  }

  function state(): BrowserSliceState {
    return { document, result, indicator: indicator(), checking, fullCheckPending };
  }

  async function runCheck(nextFocus = focus, options: CheckOptions = {}): Promise<BrowserSliceState & { stale?: boolean }> {
    focus = nextFocus;
    const snapshot = field.snapshot();
    if (snapshot.selection) caret = snapshot.selection.offset + snapshot.selection.length;
    if (snapshot.text !== document.text) {
      const edit = core.textEditBetween(document.text, snapshot.text);
      document = core.createTextDocument({ id: document.id, text: snapshot.text, revision: document.revision + 1, language, source: 'browser-field' });
      // Findings the user is not editing stay on screen and keep their words
      // while the next check runs. They carry the new revision because the
      // rebase already dropped everything the edit touched, so what is left is
      // still safe to apply.
      result = result && edit
        ? { ...core.rebaseResultAfterEdit(result, edit.range, edit.replacementLength), revision: document.revision }
        : null;
      // Where the text changed is a better anchor than a selection the host may
      // report only on focus.
      if (edit) caret = edit.range.offset + edit.replacementLength;
    }

    const selected = snapshot.selection && snapshot.selection.length > 0 ? snapshot.selection : undefined;
    // Nothing to merge a chunk into means the check has to be a whole one. A
    // chunk here would answer for a slice and leave the rest of the document
    // with no findings at all: not a shorter list, but a long draft that reads
    // as clean until the full pass arrives, with an issue count to match. The
    // hosts may differ in how they anchor a mark; they must not differ in what
    // the document is said to contain. chunked_checks.ts makes the same choice.
    const chunk = !selected && options.scope !== 'document' && result
      ? core.chunkAround(snapshot.text, caret, chunkBudget ? { budget: chunkBudget } : {})
      : undefined;
    // A document inside the budget comes back whole, and checking it as a
    // selection would only cost a merge.
    const partial = chunk && !(chunk.offset === 0 && chunk.length === snapshot.text.length) ? chunk : undefined;
    const request = core.createCheckRequest(document, selected ?? partial);
    checking = true;
    const pendingDocument = document;
    const previous = result;
    try {
      const raw = await check(request);
      const latestText = field.read();
      if (latestText !== pendingDocument.text || !core.resultIsCurrent(pendingDocument, { documentId: pendingDocument.id, revision: pendingDocument.revision })) {
        checking = false;
        return { ...state(), stale: true };
      }
      // A selected or chunked check is answered in the coordinates of the text
      // that was sent. Core owns that translation so every host moves reword
      // edits and relationship ranges along with the findings.
      const checked = core.normalizeCheckResult(request, raw, Date.now(), focus);
      if (partial) {
        result = core.mergeChunkResult(previous, checked, partial, pendingDocument);
        fullCheckPending = true;
      } else {
        result = selected ? core.rebaseCheckResult(checked, selected.offset) : checked;
        // Only a whole-document check can see the findings that span sentences.
        fullCheckPending = Boolean(selected);
      }
      checking = false;
      return state();
    } finally {
      checking = false;
    }
  }

  function applyIssue(issueID: string, replacement: string) {
    if (!result || !core.resultIsCurrent(document, result) || field.read() !== document.text) return { applied: false };
    const issue = result.matches.find((candidate) => candidate.id === issueID);
    if (!issue) return { applied: false };
    const applied = core.applyCorrection(document, { offset: issue.offset, length: issue.length }, replacement, {
      issueId: issue.id, source: issue.source, kind: 'correction',
    });
    if (!field.replace({ offset: issue.offset, length: issue.length }, replacement)) return { applied: false };
    document = applied.document;
    result = null;
    return { applied: true, record: applied.record };
  }

  return { state, check: runCheck, applyIssue };
}
