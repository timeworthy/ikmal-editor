/**
 * Deciding how much of a document to check, and putting the answer back
 * together.
 *
 * Checking a whole document on every pause is what makes a long draft slow, so
 * a check is sent for the text around the caret and the findings elsewhere are
 * carried from the previous check. Both halves are required: chunking without
 * carrying would delete every finding the check did not look at, which reads as
 * a document that just became clean.
 *
 * The desktop main process and the extension service worker both run this. They
 * differ only in where the previous findings are kept and how the request is
 * sent. Core arrives injected, as everywhere else in this package: an adapter
 * describes a host boundary and imports no engine of its own.
 */

import {
  mergeChunkAntecedents,
  mergeChunkMatches,
  rebaseAntecedentsAfterEdit,
  rebaseChunkAntecedents,
  rebaseChunkMatches,
  rebaseMatchesAfterEdit,
  type RawAntecedentLink,
  type RawMatch,
  type RawRange,
} from './raw_matches.js';

// Characters a chunk aims for. Large enough that a paragraph and its
// neighbours travel together, small enough that a long document stops being
// re-analysed from the top every time the writer pauses.
export const CHECK_CHUNK_BUDGET = 4000;

/** The two core functions this planner needs. */
export interface ChunkedCheckCore {
  chunkAround(text: string, caret: number, options?: { budget?: number }): RawRange;
  textEditBetween(before: string, after: string): { range: RawRange; replacementLength: number } | null;
}

export interface ChunkedCheckState {
  text: string;
  matches: RawMatch[];
  antecedents: RawAntecedentLink[];
}

export interface ChunkedCheckOptions {
  caret?: number | null;
  scope?: 'document' | 'auto';
  budget?: number;
}

export interface ChunkedCheckPlan {
  /** The full document this check describes. */
  text: string;
  /** The text to send. The whole document unless a chunk was chosen. */
  sent: string;
  /** Where the sent text sits, or null when the whole document was sent. */
  chunk: RawRange | null;
  /** The previous findings, already moved to describe the current text. */
  carried: ChunkedCheckState | null;
}

export interface ChunkedCheckResult {
  matches?: RawMatch[];
  ikmalAntecedents?: RawAntecedentLink[];
  ikmalFullCheckPending?: boolean;
  [key: string]: unknown;
}

/** The previous findings, moved to describe the text as it is now. */
function carryState(core: ChunkedCheckCore, previous: ChunkedCheckState | null | undefined, text: string): ChunkedCheckState | null {
  if (!previous) return null;
  if (previous.text === text) return previous;
  const edit = core.textEditBetween(previous.text, text);
  if (!edit) return previous;
  return {
    text,
    matches: rebaseMatchesAfterEdit(previous.matches, edit.range, edit.replacementLength),
    antecedents: rebaseAntecedentsAfterEdit(previous.antecedents, edit.range, edit.replacementLength),
  };
}

export function planChunkedCheck(
  core: ChunkedCheckCore,
  text: string,
  previous: ChunkedCheckState | null | undefined,
  options: ChunkedCheckOptions = {},
): ChunkedCheckPlan {
  const carried = carryState(core, previous, text);
  // Number(null) is 0, which would read as a caret at the start of the document
  // rather than as the absent caret the type describes.
  const caret = options.caret === null || options.caret === undefined ? Number.NaN : Number(options.caret);
  const budget = options.budget ?? CHECK_CHUNK_BUDGET;
  const whole: ChunkedCheckPlan = { text, sent: text, chunk: null, carried };
  // Nothing to merge into means a whole check: a chunk on its own would drop
  // every finding outside it. The same goes for the pass that exists to see
  // what a chunk cannot.
  if (!carried || options.scope === 'document' || !Number.isFinite(caret)) return whole;
  const chunk = core.chunkAround(text, caret, { budget });
  // A document inside the budget comes back whole, and sending it as a chunk
  // would only cost a merge.
  if (chunk.offset === 0 && chunk.length === text.length) return whole;
  return { text, sent: text.slice(chunk.offset, chunk.offset + chunk.length), chunk, carried };
}

/**
 * Puts a chunk's findings back into the document they came from: moved into
 * document coordinates, and merged with the findings the check never saw.
 */
export function mergeChunkedCheck<Result extends ChunkedCheckResult>(result: Result, plan: ChunkedCheckPlan): Result {
  if (!plan.chunk) return result;
  const matches = mergeChunkMatches(
    plan.carried?.matches,
    rebaseChunkMatches(result.matches ?? [], plan.chunk.offset),
    plan.chunk,
  );
  const antecedents = mergeChunkAntecedents(
    plan.carried?.antecedents,
    rebaseChunkAntecedents(result.ikmalAntecedents ?? [], plan.chunk.offset),
    plan.chunk,
  );
  return {
    ...result,
    matches,
    ikmalAntecedents: antecedents,
    // Findings that span sentences are only visible to a whole-document check,
    // so the caller is told one is still owed.
    ikmalFullCheckPending: true,
  };
}

/** What to remember for the next check, once the result is final. */
export function chunkedCheckState(plan: ChunkedCheckPlan, result: ChunkedCheckResult): ChunkedCheckState {
  return {
    text: plan.text,
    matches: result.matches ?? [],
    antecedents: result.ikmalAntecedents ?? [],
  };
}
