/**
 * Host-neutral writing contracts and deterministic transformations.
 *
 * This module deliberately has no host, network, filesystem, or platform
 * imports. Hosts own transport and text replacement; this package owns the
 * meaning of a document, check result, issue, relationship, and focus mode.
 */

export type DocumentSource =
  | 'desktop'
  | 'browser-extension'
  | 'office'
  | 'vscode'
  | 'unknown';

export type LanguageOverrideScope = 'selection' | 'site' | 'host' | 'global';

export interface LanguagePreference {
  requested: string;
  automatic: boolean;
  variant?: string;
  overrideScope?: LanguageOverrideScope;
}

export interface DetectedLanguage {
  code: string;
  confidence?: number;
  uncertain?: boolean;
  dominant?: boolean;
  mixed?: boolean;
}

export interface TextRange {
  offset: number;
  length: number;
}

export interface TextStatistics {
  words: number;
  characters: number;
}

export interface TextDocument {
  id: string;
  text: string;
  revision: number;
  language: LanguagePreference;
  source: DocumentSource;
}

export interface CheckRequest {
  documentId: string;
  revision: number;
  text: string;
  language: LanguagePreference;
  selection?: TextRange;
  languageHint?: string;
}

export type IssueCategory =
  | 'spelling'
  | 'grammar'
  | 'structure'
  | 'missing-word'
  | 'homophone'
  | 'style'
  | 'clarity'
  | 'repetition'
  | 'word-family'
  | 'passive-voice'
  | 'wordiness'
  | 'plain-english'
  | 'conciseness'
  | 'relationship'
  | 'quality'
  | 'languagetool'
  | 'other';

export type IssueKind = 'correction' | 'rewording' | 'guidance' | 'relationship';
export type IssueActionability = 'safe-apply' | 'review-first' | 'explanation-only';
export type IssueSeverity = 'low' | 'medium' | 'high';
export type IssueSource =
  | 'LanguageTool'
  | 'quality-sidecar'
  | 'style-guide'
  | 'transformer'
  | 'relationship'
  | string;

export interface Replacement {
  value: string;
}

export interface TextEdit {
  range: TextRange;
  replacementText: string;
}

export interface RewordCandidate {
  id: string;
  replacementText: string;
  edits: TextEdit[];
  rationale: string;
  source: IssueSource;
  confidence: number;
  meaningRisk: 'low' | 'medium' | 'high';
  scope: 'phrase' | 'sentence' | 'selection';
  diff?: unknown;
  actionability?: IssueActionability;
}

export interface RuleInfo {
  id: string;
  description?: string;
  issueType?: string;
}

export interface RelationshipGroup {
  id: string;
  kind: 'related' | 'antecedent';
  ranges: TextRange[];
  labels?: string[];
  confidence?: number;
  source: IssueSource;
}

export interface Issue {
  id: string;
  offset: number;
  length: number;
  message: string;
  matchedText: string;
  kind: IssueKind;
  actionability: IssueActionability;
  replacements: Replacement[];
  rewordCandidates?: RewordCandidate[];
  category: IssueCategory;
  severity: IssueSeverity;
  source: IssueSource;
  rule?: RuleInfo;
  confidence?: number;
  relatedRanges?: TextRange[];
  relationshipId?: string;
}

export interface RawCheckResult {
  matches?: RawMatch[];
  detectedLanguage?: DetectedLanguage;
  language?: string;
  ikmalAntecedents?: RawAntecedent[];
  [key: string]: unknown;
}

export interface RawReplacement {
  value?: unknown;
}

export interface RawMatch {
  offset?: unknown;
  length?: unknown;
  start?: unknown;
  end?: unknown;
  message?: unknown;
  replacements?: RawReplacement[];
  rule?: Record<string, any>;
  ikmalSource?: unknown;
  ikmalConfidence?: unknown;
  confidence?: unknown;
  ikmalRelatedOccurrences?: unknown[];
  ikmalAntecedent?: RawAntecedent;
  kind?: unknown;
  actionability?: unknown;
  category?: unknown;
  severity?: unknown;
  rewordCandidates?: unknown[];
  [key: string]: unknown;
}

export interface RawAntecedent {
  pronoun?: unknown;
  start?: unknown;
  end?: unknown;
  antecedent?: unknown;
  antecedentStart?: unknown;
  antecedentEnd?: unknown;
  confidence?: unknown;
  agreement?: unknown;
  [key: string]: unknown;
}

export interface FocusState {
  mode: 'active' | 'paused' | 'zen';
  until: number | null;
}

export type IndicatorStatus = 'checking' | 'clean' | 'issues' | 'paused' | 'zen' | 'unavailable';

export interface IndicatorState {
  status: IndicatorStatus;
  issueCount: number;
  mode: FocusState['mode'];
  label: string;
}

export interface WritingPreferences {
  categories?: Partial<Record<IssueCategory, boolean>>;
  sensitivity?: number;
  dictionaryWords?: Iterable<string>;
  ignoredRuleIds?: Iterable<string>;
}

export type LanguageResolutionStatus = 'automatic' | 'explicit' | 'detected' | 'uncertain' | 'mixed';

export interface LanguageResolution {
  requested: LanguagePreference;
  detected?: DetectedLanguage;
  effective: LanguagePreference;
  status: LanguageResolutionStatus;
  explanation?: string;
}

export interface CheckResult {
  documentId: string;
  revision: number;
  requestedLanguage: LanguagePreference;
  language: LanguageResolution;
  detectedLanguage?: DetectedLanguage;
  matches: Issue[];
  relationships: RelationshipGroup[];
  statistics: TextStatistics;
  focus: FocusState;
  checkedAt: number;
}

export interface RewordRequest {
  documentId: string;
  revision: number;
  text: string;
  language: LanguagePreference;
  scope: 'phrase' | 'sentence' | 'selection';
  range: TextRange;
  intent?: string;
  reason: string;
}

export interface RawRewordResult {
  candidates: RewordCandidate[];
  revision: number;
}

export type CorrectionKind = 'correction' | 'rewording';

export interface CorrectionRecord {
  id: string;
  documentId: string;
  revisionBefore: number;
  revisionAfter: number;
  range: TextRange;
  appliedRange: TextRange;
  originalText: string;
  replacementText: string;
  issueId?: string;
  source: IssueSource;
  kind: CorrectionKind;
  timestamp: number;
}

export interface CorrectionMetadata {
  issueId?: string;
  source?: IssueSource;
  kind?: CorrectionKind;
  timestamp?: number;
}

export interface AppliedCorrection {
  document: TextDocument;
  record: CorrectionRecord;
}

export interface RewordSafetyOptions {
  protectedTokens?: Iterable<string>;
  unresolvedRanges?: TextRange[];
  allowCombined?: boolean;
  allowHighRisk?: boolean;
  confirmed?: boolean;
}

export interface RewordSafetyResult {
  safe: boolean;
  requiresConfirmation: boolean;
  reasons: string[];
}

export interface ReviewContext {
  documentId: string;
  revision: number;
  issueID?: string;
  selection?: TextRange;
}

export type NoticeKind = 'info' | 'success' | 'warning' | 'error';

/** Capabilities supplied by a host; no implementation belongs in the core. */
export interface WritingHost {
  check(request: CheckRequest): Promise<RawCheckResult>;
  reword(request: RewordRequest): Promise<RawRewordResult>;
  replace(range: TextRange, replacement: string): Promise<void>;
  readPreferences(): Promise<WritingPreferences>;
  writePreferences(patch: Partial<WritingPreferences>): Promise<void>;
  addDictionaryWord(word: string): Promise<void>;
  openIssueReview(context: ReviewContext): Promise<void>;
  announce(message: string, kind?: NoticeKind): void;
}

export const FOCUS_DURATIONS = [
  { id: '15m', label: '15 minutes', ms: 15 * 60 * 1000 },
  { id: '1h', label: '1 hour', ms: 60 * 60 * 1000 },
  { id: '4h', label: '4 hours', ms: 4 * 60 * 60 * 1000 },
  { id: 'forever', label: 'Until turned off', ms: null },
] as const;

const VALID_SOURCES = new Set(['desktop', 'browser-extension', 'office', 'vscode', 'unknown']);
const WORD_PATTERN = /[\p{L}\p{N}][\p{L}\p{M}\p{N}]*(?:['’][\p{L}\p{M}\p{N}]+)*/gu;

function finiteInteger(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(number) ? number : null;
}

function finiteNumber(value: unknown): number | undefined {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function textValue(value: unknown): string {
  return typeof value === 'string' ? value : String(value ?? '');
}

function clampConfidence(value: unknown): number | undefined {
  const confidence = finiteNumber(value);
  if (confidence === undefined) return undefined;
  return Math.max(0, Math.min(1, confidence));
}

export function normalizeLanguagePreference(value: unknown = 'auto'): LanguagePreference {
  const object = value && typeof value === 'object' ? value as Record<string, unknown> : null;
  const requested = textValue(object?.requested ?? object?.code ?? object?.language ?? value).trim() || 'auto';
  const automatic = object?.automatic === true || requested.toLowerCase() === 'auto';
  const variantValue = object?.variant ?? (requested.includes('-') ? requested : undefined);
  const variant = textValue(variantValue).trim() || undefined;
  const scope = textValue(object?.overrideScope).trim();
  const overrideScope = ['selection', 'site', 'host', 'global'].includes(scope)
    ? scope as LanguageOverrideScope
    : undefined;
  return { requested, automatic, ...(variant ? { variant } : {}), ...(overrideScope ? { overrideScope } : {}) };
}

function normalizeDetectedLanguage(value: unknown): DetectedLanguage | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const object = value as Record<string, unknown>;
  const code = textValue(object.code ?? object.language).trim();
  if (!code) return undefined;
  const confidence = clampConfidence(object.confidence);
  return {
    code,
    ...(confidence !== undefined ? { confidence } : {}),
    ...(object.uncertain === true ? { uncertain: true } : {}),
    ...(object.dominant === true ? { dominant: true } : {}),
    ...(object.mixed === true ? { mixed: true } : {}),
  };
}

export function resolveLanguageState(requestedValue: unknown, detectedValue?: unknown, languageHint = ''): LanguageResolution {
  const requested = normalizeLanguagePreference(requestedValue);
  const detected = normalizeDetectedLanguage(detectedValue);
  if (!requested.automatic) {
    return { requested, ...(detected ? { detected } : {}), effective: requested, status: 'explicit' };
  }
  if (detected?.mixed && detected.code) {
    return {
      requested,
      detected,
      effective: normalizeLanguagePreference(detected.code),
      status: 'mixed',
      explanation: 'Only the dominant language was checked; select text to check another language.',
    };
  }
  if (detected?.code && detected.confidence !== undefined && detected.confidence >= 0.8 && detected.uncertain !== true) {
    return { requested, detected, effective: normalizeLanguagePreference(detected.code), status: 'detected' };
  }
  const hint = normalizeLanguagePreference(languageHint);
  if (!hint.automatic) {
    return {
      requested,
      ...(detected ? { detected } : {}),
      effective: hint,
      status: 'uncertain',
      explanation: 'Language detection is uncertain, so the host language hint is being used.',
    };
  }
  return {
    requested,
    ...(detected ? { detected } : {}),
    effective: requested,
    status: 'uncertain',
    explanation: 'Choose a language when the text is too short for confident detection.',
  };
}

export function createTextDocument({
  id,
  text = '',
  revision = 0,
  language = 'auto',
  source = 'unknown',
}: {
  id: string;
  text?: string;
  revision?: number;
  language?: unknown;
  source?: DocumentSource;
}): TextDocument {
  if (!text || typeof text !== 'string') text = textValue(text);
  if (!Number.isSafeInteger(revision) || revision < 0) throw new TypeError('Document revision must be a non-negative integer.');
  return {
    id: textValue(id),
    text,
    revision,
    language: normalizeLanguagePreference(language),
    source: VALID_SOURCES.has(source) ? source : 'unknown',
  };
}

export function createCheckRequest(document: TextDocument, selection?: TextRange): CheckRequest {
  if (selection !== undefined && (!isSafeRange(document.text, selection) || selection.length === 0)) {
    throw new RangeError('A check selection must be a non-empty range in the current document.');
  }
  return {
    documentId: document.id,
    revision: document.revision,
    text: selection ? document.text.slice(selection.offset, rangeEnd(selection)) : document.text,
    language: document.language,
    ...(selection ? { selection } : {}),
  };
}

export function selectedText(document: TextDocument, selection: TextRange): string {
  if (!isSafeRange(document.text, selection)) throw new RangeError('Selection is outside the current document.');
  return document.text.slice(selection.offset, rangeEnd(selection));
}

export function selectionStatistics(document: TextDocument, selection: TextRange): TextStatistics {
  return textStatistics(selectedText(document, selection));
}

export function rangeEnd(range: TextRange): number {
  return range.offset + range.length;
}

export function isSafeRange(text: string, range: unknown): range is TextRange {
  if (!range || typeof range !== 'object') return false;
  const value = range as Record<string, unknown>;
  const offset = finiteInteger(value.offset);
  const length = finiteInteger(value.length);
  if (offset === null || length === null || offset < 0 || length < 0 || offset + length > text.length) return false;
  // Checker offsets use UTF-16 units, but a range that cuts a surrogate pair
  // cannot be safely rendered or replaced as user-visible text.
  const splitsSurrogate = (boundary: number) => boundary > 0 && boundary < text.length
    && text.charCodeAt(boundary - 1) >= 0xd800 && text.charCodeAt(boundary - 1) <= 0xdbff
    && text.charCodeAt(boundary) >= 0xdc00 && text.charCodeAt(boundary) <= 0xdfff;
  return !splitsSurrogate(offset) && !splitsSurrogate(offset + length);
}

export function rangesOverlap(a: TextRange, b: TextRange): boolean {
  return a.offset < rangeEnd(b) && b.offset < rangeEnd(a);
}

export interface ChunkOptions {
  // Characters the chunk aims for. The result can be smaller (a short document)
  // or larger (one paragraph exceeds it, up to maxCharacters).
  budget?: number;
  // Hard ceiling. Past this, whole paragraphs are given up for sentences, and
  // past that, for the plain window.
  maxCharacters?: number;
}

const CHUNK_BUDGET = 4000;
const CHUNK_MAX_CHARACTERS = 12000;
// A blank line: any whitespace run holding two newlines, so CRLF and indented
// blank lines separate paragraphs the way a writer sees them.
const PARAGRAPH_BREAK = /\r?\n[^\S\n]*\r?\n/g;
// The terminating punctuation belongs to the sentence it ends, so only the
// whitespace after it separates one sentence from the next.
const SENTENCE_BREAK = /[.!?…]["'”’)\]]*\s+/g;

function lastBreakBefore(text: string, pattern: RegExp, boundary: number): number {
  let start = 0;
  pattern.lastIndex = 0;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    const end = match.index + match[0].length;
    if (end > boundary) break;
    start = end;
    // A zero-length match would loop forever; every pattern here consumes at
    // least one character, but the guard keeps that a local property.
    if (pattern.lastIndex === match.index) pattern.lastIndex += 1;
  }
  return start;
}

// keepTerminator decides how much of the break the chunk keeps: a blank line
// belongs to neither paragraph, while a full stop belongs to the sentence it
// closes and would read as a fragment without it.
function firstBreakAfter(text: string, pattern: RegExp, boundary: number, keepTerminator = false): number {
  pattern.lastIndex = 0;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    const cut = keepTerminator ? match.index + match[0].trimEnd().length : match.index;
    if (cut >= boundary) return cut;
    if (pattern.lastIndex === match.index) pattern.lastIndex += 1;
  }
  return text.length;
}

/**
 * The span of text worth rechecking around the caret.
 *
 * Checking a whole document on every keystroke is what makes long documents
 * slow and what runs into a checker's length limit. Checking a fixed window of
 * characters instead hands the checker a fragment: a sentence cut in half reads
 * as an error that is not there, and a rule that spans the cut is never seen.
 * So the budget is spent around the caret and then rounded outward to whole
 * paragraphs.
 *
 * The budget is an aggregate, not a radius. A caret at the top of a document
 * has nothing above it, so the whole budget is spent downward — the alternative
 * would check half as much text exactly where someone starts writing.
 *
 * Callers should compare the result against the whole document before treating
 * it as a selection: a document that fits in the budget is returned entire.
 */
export function chunkAround(text: string, caret: number, options: ChunkOptions = {}): TextRange {
  const value = textValue(text);
  const budget = Math.max(1, finiteInteger(options.budget) ?? CHUNK_BUDGET);
  const maxCharacters = Math.max(budget, finiteInteger(options.maxCharacters) ?? CHUNK_MAX_CHARACTERS);
  const position = Math.min(Math.max(finiteInteger(caret) ?? 0, 0), value.length);
  if (value.length <= budget) return { offset: 0, length: value.length };

  // Center the budget on the caret, then hand whatever one side cannot use to
  // the other.
  let start = position - Math.floor(budget / 2);
  let end = start + budget;
  if (start < 0) {
    end -= start;
    start = 0;
  }
  if (end > value.length) {
    start = Math.max(0, start - (end - value.length));
    end = value.length;
  }

  const paragraphs = {
    offset: lastBreakBefore(value, PARAGRAPH_BREAK, start),
    end: firstBreakAfter(value, PARAGRAPH_BREAK, end),
  };
  if (paragraphs.end - paragraphs.offset <= maxCharacters) return safeChunk(value, paragraphs, position);

  // One paragraph is longer than the ceiling — a pasted wall of text, or prose
  // with no blank lines at all. Whole sentences still keep the checker honest.
  const sentences = {
    offset: lastBreakBefore(value, SENTENCE_BREAK, start),
    end: firstBreakAfter(value, SENTENCE_BREAK, end, true),
  };
  if (sentences.end - sentences.offset <= maxCharacters) return safeChunk(value, sentences, position);

  // Nothing to round to: minified or unpunctuated text. The plain window is
  // worse for the checker than a sentence boundary, and better than sending a
  // document that will be refused for its length.
  return safeChunk(value, { offset: start, end }, position);
}

// Keeps the chunk inside the text, containing the caret, and off a surrogate
// pair, so the result is always usable as a check selection.
function safeChunk(text: string, bounds: { offset: number; end: number }, caret: number): TextRange {
  let offset = Math.min(Math.max(bounds.offset, 0), caret);
  let end = Math.max(Math.min(bounds.end, text.length), caret);
  const lowSurrogate = (boundary: number) => boundary > 0 && boundary < text.length
    && text.charCodeAt(boundary - 1) >= 0xd800 && text.charCodeAt(boundary - 1) <= 0xdbff
    && text.charCodeAt(boundary) >= 0xdc00 && text.charCodeAt(boundary) <= 0xdfff;
  if (lowSurrogate(offset)) offset -= 1;
  if (lowSurrogate(end)) end += 1;
  return { offset, length: end - offset };
}

function rawRange(text: string, value: Record<string, unknown>): TextRange | null {
  const offset = finiteInteger(value.offset ?? value.start);
  let length = finiteInteger(value.length);
  if (length === null) {
    const end = finiteInteger(value.end);
    if (offset !== null && end !== null) length = end - offset;
  }
  if (offset === null || length === null) return null;
  const range = { offset, length };
  return isSafeRange(text, range) ? range : null;
}

export function textStatistics(text: string): TextStatistics {
  const value = textValue(text);
  WORD_PATTERN.lastIndex = 0;
  return {
    words: value.match(WORD_PATTERN)?.length ?? 0,
    characters: Array.from(value).length,
  };
}

function normalizeSource(match: RawMatch): IssueSource {
  const explicit = textValue(match.ikmalSource).trim();
  if (explicit) return explicit;
  const ruleID = textValue(match.rule?.id);
  return ruleID.startsWith('IKMAL_') ? 'quality-sidecar' : 'LanguageTool';
}

export function normalizeCategory(match: RawMatch): IssueCategory {
  const rule = match.rule ?? {};
  const value = textValue(match.category || rule.issueType || rule.category?.id || rule.id).toLowerCase();
  if (value.includes('spell') || value.includes('typo')) return 'spelling';
  if (value.includes('homophone')) return 'homophone';
  if (value.includes('missing')) return 'missing-word';
  if (value.includes('passive')) return 'passive-voice';
  if (value.includes('repetition') || value.includes('repeat')) return 'repetition';
  if (value.includes('word-family') || value.includes('wordfamily')) return 'word-family';
  if (value.includes('wordiness') || value.includes('verbose')) return 'wordiness';
  if (value.includes('concise')) return 'conciseness';
  if (value.includes('plain')) return 'plain-english';
  if (value.includes('clar')) return 'clarity';
  if (value.includes('structure') || value.includes('sentence')) return 'structure';
  if (value.includes('style')) return 'style';
  if (value.includes('antecedent') || value.includes('relationship') || value.includes('pronoun')) return 'relationship';
  if (value.includes('grammar')) return 'grammar';
  if (value.includes('quality')) return 'quality';
  return value ? 'languagetool' : 'other';
}

function normalizeSeverity(value: unknown): IssueSeverity {
  const severity = textValue(value).toLowerCase();
  if (severity === 'high' || severity === 'error' || severity === 'critical') return 'high';
  if (severity === 'low' || severity === 'info' || severity === 'hint') return 'low';
  return 'medium';
}

function normalizeRule(match: RawMatch): RuleInfo | undefined {
  const rule = match.rule;
  const id = textValue(rule?.id).trim();
  if (!id) return undefined;
  const description = textValue(rule?.description).trim() || undefined;
  const issueType = textValue(rule?.issueType).trim() || undefined;
  return { id, ...(description ? { description } : {}), ...(issueType ? { issueType } : {}) };
}

function normalizeRewordCandidate(text: string, value: unknown, fallbackRange: TextRange, issueMessage: string): RewordCandidate | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  const rawEdits = Array.isArray(candidate.edits) ? candidate.edits : [];
  const edits = rawEdits
    .filter((edit): edit is Record<string, unknown> => Boolean(edit && typeof edit === 'object'))
    .map((edit) => {
      const rangeValue = edit.range && typeof edit.range === 'object' ? edit.range as Record<string, unknown> : edit;
      const range = rawRange(text, rangeValue);
      const replacementText = textValue(edit.replacementText ?? edit.replacement ?? edit.text);
      return range && replacementText.length >= 0 ? { range, replacementText } : null;
    })
    .filter((edit): edit is TextEdit => Boolean(edit));
  const replacementText = textValue(candidate.replacementText ?? candidate.text)
    || (edits.length === 1 ? edits[0].replacementText : '');
  if (!replacementText && edits.length === 0) return null;
  const source = textValue(candidate.source).trim() || 'transformer';
  const confidence = clampConfidence(candidate.confidence) ?? 0;
  const rawRisk = textValue(candidate.meaningRisk).toLowerCase();
  const meaningRisk = ['low', 'medium', 'high'].includes(rawRisk) ? rawRisk as RewordCandidate['meaningRisk'] : 'high';
  const rawScope = textValue(candidate.scope).toLowerCase();
  const scope = ['phrase', 'sentence', 'selection'].includes(rawScope) ? rawScope as RewordCandidate['scope'] : 'sentence';
  const rationale = textValue(candidate.rationale).trim() || issueMessage;
  const identity = textValue(candidate.id).trim() || stableHash([source, fallbackRange.offset, fallbackRange.length, replacementText, rationale].join('\u001e'));
  const normalizedEdits = edits.length ? edits : [{ range: fallbackRange, replacementText }];
  return {
    id: identity.startsWith('reword-') ? identity : `reword-${identity}`,
    replacementText,
    edits: normalizedEdits,
    rationale,
    source,
    confidence,
    meaningRisk,
    scope,
    ...(candidate.diff !== undefined ? { diff: candidate.diff } : {}),
    actionability: 'review-first',
  };
}

function normalizeRelatedRanges(text: string, match: RawMatch, primary: TextRange): TextRange[] {
  const values = Array.isArray(match.ikmalRelatedOccurrences) ? match.ikmalRelatedOccurrences : [];
  const ranges = values
    .filter((value): value is Record<string, unknown> => Boolean(value && typeof value === 'object'))
    .map((value) => rawRange(text, value))
    .filter((range): range is TextRange => Boolean(range))
    .filter((range) => range.offset !== primary.offset || range.length !== primary.length);
  const seen = new Set<string>();
  return ranges.filter((range) => {
    const key = `${range.offset}:${range.length}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function relationshipFromAntecedent(text: string, value: RawAntecedent): RelationshipGroup | null {
  const pronounOffset = finiteInteger(value.start);
  const pronounEnd = finiteInteger(value.end);
  const antecedentOffset = finiteInteger(value.antecedentStart);
  const antecedentEnd = finiteInteger(value.antecedentEnd);
  if (pronounOffset === null || pronounEnd === null || antecedentOffset === null || antecedentEnd === null) return null;
  const ranges = [
    { offset: pronounOffset, length: pronounEnd - pronounOffset },
    { offset: antecedentOffset, length: antecedentEnd - antecedentOffset },
  ];
  if (!ranges.every((range) => isSafeRange(text, range)) || ranges[0].length === 0 || ranges[1].length === 0) return null;
  const labels = [textValue(value.pronoun), textValue(value.antecedent)].filter(Boolean);
  const key = `antecedent|${ranges.map((range) => `${range.offset}:${range.length}`).join('|')}`;
  return {
    id: `relationship-${stableHash(key)}`,
    kind: 'antecedent',
    ranges,
    ...(labels.length ? { labels } : {}),
    ...(clampConfidence(value.confidence) !== undefined ? { confidence: clampConfidence(value.confidence) } : {}),
    source: 'relationship',
  };
}

export function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function issueIdentity(text: string, match: RawMatch, range = rawRange(text, match)): string | null {
  if (!range) return null;
  const ruleID = textValue(match.rule?.id).trim();
  const source = normalizeSource(match);
  const replacements = Array.isArray(match.replacements)
    ? match.replacements.map((replacement) => textValue(replacement?.value)).join('\u001f')
    : '';
  const identity = [source, ruleID, range.offset, range.length, text.slice(range.offset, range.offset + range.length), textValue(match.message), replacements].join('\u001e');
  return `issue-${stableHash(identity)}`;
}

export function normalizeIssue(text: string, match: RawMatch): Issue | null {
  const range = rawRange(text, match);
  const id = issueIdentity(text, match, range);
  if (!range || !id) return null;
  const category = normalizeCategory(match);
  const source = normalizeSource(match);
  const explicitKind = textValue(match.kind).toLowerCase();
  const kind: IssueKind = ['correction', 'rewording', 'guidance', 'relationship'].includes(explicitKind)
    ? explicitKind as IssueKind
    : category === 'relationship' ? 'relationship' : source === 'transformer' ? 'rewording' : 'correction';
  const replacements = (Array.isArray(match.replacements) ? match.replacements : [])
    .filter((replacement) => replacement && typeof replacement === 'object' && typeof replacement.value === 'string')
    .map((replacement) => ({ value: replacement.value as string }));
  const message = textValue(match.message).trim() || 'Review this text.';
  const candidates = (Array.isArray(match.rewordCandidates) ? match.rewordCandidates : [])
    .map((candidate) => normalizeRewordCandidate(text, candidate, range, message))
    .filter((candidate): candidate is RewordCandidate => Boolean(candidate));
  const explicitAction = textValue(match.actionability).toLowerCase();
  const actionability: IssueActionability = ['safe-apply', 'review-first', 'explanation-only'].includes(explicitAction)
    ? explicitAction as IssueActionability
    : replacements.length === 1 && kind === 'correction' ? 'safe-apply'
      : replacements.length > 0 || candidates.length > 0 ? 'review-first' : 'explanation-only';
  const relationship = match.ikmalAntecedent ? relationshipFromAntecedent(text, match.ikmalAntecedent) : null;
  const confidence = clampConfidence(match.ikmalConfidence ?? match.confidence);
  return {
    id,
    offset: range.offset,
    length: range.length,
    message,
    matchedText: text.slice(range.offset, rangeEnd(range)),
    kind,
    actionability,
    replacements,
    ...(candidates.length ? { rewordCandidates: candidates } : {}),
    category,
    severity: normalizeSeverity(match.severity),
    source,
    ...(normalizeRule(match) ? { rule: normalizeRule(match) } : {}),
    ...(confidence !== undefined ? { confidence } : {}),
    ...(normalizeRelatedRanges(text, match, range).length ? { relatedRanges: normalizeRelatedRanges(text, match, range) } : {}),
    ...(relationship ? { relationshipId: relationship.id, relatedRanges: relationship.ranges.slice(1) } : {}),
  };
}

function issueComparator(a: Issue, b: Issue): number {
  return a.offset - b.offset || b.length - a.length || ({ high: 0, medium: 1, low: 2 }[a.severity] - { high: 0, medium: 1, low: 2 }[b.severity]) || a.id.localeCompare(b.id);
}

function normalizeRelationships(text: string, raw: RawCheckResult, issues: Issue[]): RelationshipGroup[] {
  const values = Array.isArray(raw.ikmalAntecedents) ? raw.ikmalAntecedents : [];
  const groups = values
    .filter((value): value is RawAntecedent => Boolean(value && typeof value === 'object'))
    .map((value) => relationshipFromAntecedent(text, value))
    .filter((group): group is RelationshipGroup => Boolean(group));
  for (const issue of issues) {
    if (!issue.relationshipId) continue;
    const group = issue.relatedRanges?.length ? {
      id: issue.relationshipId,
      kind: 'antecedent' as const,
      ranges: [{ offset: issue.offset, length: issue.length }, ...issue.relatedRanges],
      source: 'relationship' as const,
    } : null;
    if (group) groups.push(group);
  }
  return dedupeRelationships(groups);
}

export function normalizeCheckResult(request: CheckRequest, raw: RawCheckResult, checkedAt = Date.now(), focus: FocusState = { mode: 'active', until: null }): CheckResult {
  const payload = raw && typeof raw === 'object' ? raw : {};
  const detectedLanguage = normalizeDetectedLanguage(payload.detectedLanguage);
  const byID = new Map<string, Issue>();
  for (const match of Array.isArray(payload.matches) ? payload.matches : []) {
    if (!match || typeof match !== 'object') continue;
    const issue = normalizeIssue(request.text, match);
    if (issue) byID.set(issue.id, issue);
  }
  const matches = [...byID.values()].sort(issueComparator);
  return {
    documentId: request.documentId,
    revision: request.revision,
    requestedLanguage: request.language,
    language: resolveLanguageState(request.language, detectedLanguage, request.languageHint),
    ...(detectedLanguage ? { detectedLanguage } : {}),
    matches,
    relationships: normalizeRelationships(request.text, payload, matches),
    statistics: textStatistics(request.text),
    focus: resolveFocusState(focus, checkedAt),
    checkedAt,
  };
}

export function resultIsCurrent(document: TextDocument, result: Pick<CheckResult, 'documentId' | 'revision'>): boolean {
  return document.id === result.documentId && document.revision === result.revision;
}

export function acceptCurrentResult(document: TextDocument, result: CheckResult): CheckResult | null {
  return resultIsCurrent(document, result) ? result : null;
}

function shiftRange(range: TextRange, delta: number): TextRange {
  return { ...range, offset: range.offset + delta };
}

// Every position an issue carries. A reword candidate's edit ranges belong here
// too: an edit that changed the text a candidate would rewrite makes the
// candidate stale, however untouched the issue's own range is.
function issueRanges(issue: Issue): TextRange[] {
  return [
    { offset: issue.offset, length: issue.length },
    ...(issue.relatedRanges ?? []),
    ...(issue.rewordCandidates ?? []).flatMap((candidate) => candidate.edits.map((edit) => edit.range)),
  ];
}

// Moves an issue with a per-range decision. One issue can hold positions on
// both sides of an edit — a pronoun after it, its antecedent before it — so a
// single delta applied to the whole issue would drag the earlier positions off
// their words. A reword candidate carries its own edit ranges for the same
// reason: leaving those behind would apply the right replacement to the wrong
// span of text.
function carryIssue(issue: Issue, move: (range: TextRange) => TextRange): Issue {
  return {
    ...issue,
    offset: move({ offset: issue.offset, length: issue.length }).offset,
    ...(issue.relatedRanges ? { relatedRanges: issue.relatedRanges.map(move) } : {}),
    ...(issue.rewordCandidates ? {
      rewordCandidates: issue.rewordCandidates.map((candidate) => ({
        ...candidate,
        edits: candidate.edits.map((edit) => ({ ...edit, range: move(edit.range) })),
      })),
    } : {}),
  };
}

function dedupeRelationships(groups: RelationshipGroup[]): RelationshipGroup[] {
  const seen = new Set<string>();
  return groups.filter((group) => {
    if (seen.has(group.id)) return false;
    seen.add(group.id);
    return true;
  });
}

/**
 * Moves a result checked over part of a document into document coordinates.
 *
 * A chunk or selection check is answered in the coordinates of the text that
 * was sent, which are not the coordinates of anything the user can see.
 */
export function rebaseCheckResult(result: CheckResult, offset: number): CheckResult {
  const delta = finiteInteger(offset) ?? 0;
  if (delta === 0) return result;
  return {
    ...result,
    matches: result.matches.map((issue) => carryIssue(issue, (range) => shiftRange(range, delta))),
    relationships: result.relationships.map((group) => ({ ...group, ranges: group.ranges.map((range) => shiftRange(range, delta)) })),
  };
}

export interface TextEditDelta {
  // The span of the earlier text that the later text replaced.
  range: TextRange;
  replacementLength: number;
}

/**
 * The edit between two snapshots of the same field.
 *
 * Hosts report text, not edits: a field capability can say what the text is now
 * and what it was, and nothing about how it got there. Matching the common
 * prefix and suffix recovers the one contiguous change that describes any
 * ordinary keystroke, paste, or deletion. Several separate changes between two
 * snapshots collapse into the span that covers them all, which keeps the result
 * conservative — everything in that span is treated as edited.
 */
export function textEditBetween(before: string, after: string): TextEditDelta | null {
  const start = textValue(before);
  const end = textValue(after);
  if (start === end) return null;
  const shortest = Math.min(start.length, end.length);
  let prefix = 0;
  while (prefix < shortest && start.charCodeAt(prefix) === end.charCodeAt(prefix)) prefix += 1;
  let suffix = 0;
  while (suffix < shortest - prefix
    && start.charCodeAt(start.length - 1 - suffix) === end.charCodeAt(end.length - 1 - suffix)) suffix += 1;
  // A boundary that lands between a surrogate pair would describe an edit to
  // half a character, which no range in this module is allowed to be.
  const isHigh = (code: number) => code >= 0xd800 && code <= 0xdbff;
  const isLow = (code: number) => code >= 0xdc00 && code <= 0xdfff;
  if (prefix > 0 && isHigh(start.charCodeAt(prefix - 1)) && (isLow(start.charCodeAt(prefix)) || isLow(end.charCodeAt(prefix)))) prefix -= 1;
  if (suffix > 0 && isLow(start.charCodeAt(start.length - suffix)) && isHigh(start.charCodeAt(start.length - suffix - 1))) suffix -= 1;
  return {
    range: { offset: prefix, length: start.length - prefix - suffix },
    replacementLength: end.length - prefix - suffix,
  };
}

/**
 * Carries findings across an edit so the ones the user is not editing stay put.
 *
 * Everything after the edit moves by the length the edit added or removed;
 * without that, retained underlines drift off their words as soon as someone
 * types above them. Anything the edit touched is dropped rather than guessed
 * at, including a finding whose related range was touched: half of a repetition
 * or antecedent pair is not a finding, and the next full check restores it.
 */
export function rebaseResultAfterEdit(result: CheckResult, edit: TextRange, replacementLength: number): CheckResult {
  const added = finiteInteger(replacementLength) ?? 0;
  const delta = added - edit.length;
  const editEnd = rangeEnd(edit);
  // An insertion is a zero-length edit, so "touched" cannot be an overlap test:
  // a caret inside a word changes that word without overlapping anything.
  const moved = (range: TextRange): TextRange | null => {
    if (rangeEnd(range) <= edit.offset) return range;
    if (range.offset >= editEnd) return shiftRange(range, delta);
    return null;
  };
  const survives = (ranges: TextRange[]) => ranges.every((range) => moved(range) !== null);
  return {
    ...result,
    matches: result.matches
      .filter((issue) => survives(issueRanges(issue)))
      .map((issue) => carryIssue(issue, (range) => moved(range) as TextRange)),
    relationships: result.relationships
      .filter((group) => survives(group.ranges))
      .map((group) => ({ ...group, ranges: group.ranges.map((range) => moved(range) as TextRange) })),
  };
}

/**
 * Combines the findings kept from the last check with a freshly checked chunk.
 *
 * Rechecking one chunk must not blank the rest of the document: a finding
 * outside the chunk is still true, and the user is still looking at it. Only
 * findings inside the chunk are replaced, and a finding reaching into the
 * chunk from outside it is dropped, because the chunk check has just re-decided
 * that text.
 *
 * `chunk` is the result as `normalizeCheckResult` returns it for the chunk
 * request, in chunk coordinates; `range` is where that chunk sits.
 */
export function mergeChunkResult(previous: CheckResult | null, chunk: CheckResult, range: TextRange, document: TextDocument): CheckResult {
  const rebased = rebaseCheckResult(chunk, range.offset);
  const chunkEnd = rangeEnd(range);
  const outside = (value: TextRange) => rangeEnd(value) <= range.offset || value.offset >= chunkEnd;
  const carried = previous && previous.documentId === document.id ? previous : null;
  const retained = (carried?.matches ?? []).filter((issue) => issueRanges(issue).every(outside)
    // A caller that skipped the edit rebase must not be able to paint an
    // underline past the end of the text.
    && issueRanges(issue).every((value) => isSafeRange(document.text, value)));
  const byID = new Map<string, Issue>();
  for (const issue of [...retained, ...rebased.matches]) byID.set(issue.id, issue);
  return {
    ...rebased,
    documentId: document.id,
    revision: document.revision,
    matches: [...byID.values()].sort(issueComparator),
    relationships: dedupeRelationships([
      ...(carried?.relationships ?? []).filter((group) => group.ranges.every(outside)),
      ...rebased.relationships,
    ]),
    // Counters describe the document the user is writing, not the slice of it
    // that was sent to the checker.
    statistics: textStatistics(document.text),
  };
}

export function applyTextEdit(document: TextDocument, range: TextRange, replacement: string): TextDocument {
  if (!isSafeRange(document.text, range)) throw new RangeError('Replacement range is outside the current document revision.');
  return {
    ...document,
    text: `${document.text.slice(0, range.offset)}${replacement}${document.text.slice(rangeEnd(range))}`,
    revision: document.revision + 1,
  };
}

function candidateEdits(candidate: RewordCandidate, request: RewordRequest): TextEdit[] {
  return candidate.edits.length ? candidate.edits : [{ range: request.range, replacementText: candidate.replacementText }];
}

function applyEdits(text: string, edits: TextEdit[]): string {
  return [...edits]
    .sort((a, b) => b.range.offset - a.range.offset || b.range.length - a.range.length)
    .reduce((value, edit) => `${value.slice(0, edit.range.offset)}${edit.replacementText}${value.slice(rangeEnd(edit.range))}`, text);
}

function candidateReplacementText(document: TextDocument, request: RewordRequest, edits: TextEdit[]): string {
  const edited = applyEdits(document.text, edits);
  return edited.slice(request.range.offset, request.range.offset + (request.range.length + edited.length - document.text.length));
}

export function validateRewordCandidate(document: TextDocument, request: RewordRequest, candidate: RewordCandidate, options: RewordSafetyOptions = {}): RewordSafetyResult {
  const reasons: string[] = [];
  const current = document.id === request.documentId && document.revision === request.revision && document.text === request.text;
  if (!current) reasons.push('stale-revision');
  if (!isSafeRange(document.text, request.range) || request.range.length === 0 || request.range.length > 4000) reasons.push('scope-out-of-bounds');
  if (!candidate.rationale.trim()) reasons.push('missing-rationale');
  if (candidate.edits.length === 0) reasons.push('missing-diff');
  const edits = candidateEdits(candidate, request);
  const ordered = [...edits].sort((a, b) => a.range.offset - b.range.offset || a.range.length - b.range.length);
  for (let index = 0; index < ordered.length; index += 1) {
    const edit = ordered[index];
    if (!isSafeRange(document.text, edit.range) || edit.range.offset < request.range.offset || rangeEnd(edit.range) > rangeEnd(request.range)) {
      reasons.push('edit-out-of-bounds');
      break;
    }
    if (index > 0 && rangesOverlap(ordered[index - 1].range, edit.range)) {
      reasons.push('overlapping-edits');
      break;
    }
  }
  const unresolvedRanges = Array.isArray(options.unresolvedRanges) ? options.unresolvedRanges : [];
  if (!options.allowCombined && unresolvedRanges.some((range) => edits.some((edit) => rangesOverlap(range, edit.range)))) {
    reasons.push('overlaps-unresolved-correction');
  }
  const replacementText = isSafeRange(document.text, request.range) ? candidateReplacementText(document, request, edits) : '';
  if (candidate.replacementText !== replacementText) reasons.push('diff-does-not-match-edits');
  if (replacementText === document.text.slice(request.range.offset, rangeEnd(request.range))) reasons.push('no-op');
  for (const token of options.protectedTokens ?? []) {
    const protectedToken = textValue(token);
    if (protectedToken && !replacementText.includes(protectedToken)) reasons.push(`protected-token:${protectedToken}`);
  }
  const requiresConfirmation = candidate.meaningRisk === 'high';
  if (requiresConfirmation && !options.allowHighRisk) reasons.push('high-meaning-risk');
  return { safe: reasons.length === 0, requiresConfirmation, reasons };
}

export function applyCorrection(document: TextDocument, range: TextRange, replacement: string, metadata: CorrectionMetadata = {}): AppliedCorrection {
  const nextDocument = applyTextEdit(document, range, replacement);
  const record: CorrectionRecord = {
    id: `correction-${stableHash([document.id, document.revision, range.offset, range.length, replacement, metadata.timestamp ?? Date.now()].join('\u001e'))}`,
    documentId: document.id,
    revisionBefore: document.revision,
    revisionAfter: nextDocument.revision,
    range,
    appliedRange: { offset: range.offset, length: Array.from(replacement).reduce((length, character) => length + character.length, 0) },
    originalText: document.text.slice(range.offset, rangeEnd(range)),
    replacementText: replacement,
    ...(metadata.issueId ? { issueId: metadata.issueId } : {}),
    source: metadata.source ?? 'quality-sidecar',
    kind: metadata.kind ?? 'correction',
    timestamp: metadata.timestamp ?? Date.now(),
  };
  return { document: nextDocument, record };
}

export function applyRewordCandidate(document: TextDocument, request: RewordRequest, candidate: RewordCandidate, options: RewordSafetyOptions = {}): AppliedCorrection {
  const safety = validateRewordCandidate(document, request, candidate, options);
  if (!options.confirmed || !safety.safe) {
    throw new Error(`Reword candidate is not safe to apply: ${safety.reasons.join(', ') || 'explicit confirmation required'}`);
  }
  const replacementText = candidateReplacementText(document, request, candidateEdits(candidate, request));
  return applyCorrection(document, request.range, replacementText, {
    source: candidate.source,
    kind: 'rewording',
  });
}

export function undoCorrection(document: TextDocument, record: CorrectionRecord): TextDocument | null {
  if (document.id !== record.documentId || document.revision !== record.revisionAfter) return null;
  if (!isSafeRange(document.text, record.appliedRange)) return null;
  if (document.text.slice(record.appliedRange.offset, rangeEnd(record.appliedRange)) !== record.replacementText) return null;
  return applyTextEdit(document, record.appliedRange, record.originalText);
}

export function normalizeFocusState(value: unknown): FocusState {
  const object = value && typeof value === 'object' ? value as Record<string, unknown> : null;
  const mode = object?.mode;
  if (mode !== 'paused' && mode !== 'zen') return { mode: 'active', until: null };
  const until = object?.until === null || object?.until === undefined ? null : finiteNumber(object.until);
  return { mode, until: until && until > 0 ? until : null };
}

export function resolveFocusState(value: unknown, now = Date.now()): FocusState {
  const state = normalizeFocusState(value);
  return state.until !== null && state.until <= now ? { mode: 'active', until: null } : state;
}

export function startFocusState(mode: FocusState['mode'], durationID: string, now = Date.now()): FocusState {
  if (mode === 'active') return { mode: 'active', until: null };
  const duration = FOCUS_DURATIONS.find((entry) => entry.id === durationID);
  return { mode, until: duration?.ms === null || !duration ? null : now + duration.ms };
}

export function describeFocusState(value: unknown, now = Date.now()): string {
  const state = resolveFocusState(value, now);
  if (state.mode === 'active') return 'Checking';
  if (state.until === null) return state.mode === 'paused' ? 'Paused' : 'Zen';
  const remaining = Math.max(0, state.until - now);
  const minutes = Math.floor(remaining / 60_000);
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  const duration = hours > 0 ? `${hours}h${remainder ? ` ${remainder}m` : ''}` : `${Math.max(1, minutes)}m`;
  return `${state.mode === 'paused' ? 'Paused' : 'Zen'} ${duration}`;
}

export function resolveIndicatorState({
  checking = false,
  issueCount = 0,
  available = true,
  focus = { mode: 'active', until: null },
}: {
  checking?: boolean;
  issueCount?: number;
  available?: boolean;
  focus?: FocusState;
} = {}): IndicatorState {
  const count = Number.isFinite(issueCount) ? Math.max(0, Math.floor(issueCount)) : 0;
  const mode = normalizeFocusState(focus).mode;
  const status: IndicatorStatus = !available ? 'unavailable'
    : checking ? 'checking'
      : mode === 'paused' ? 'paused'
        : mode === 'zen' ? 'zen'
          : count > 0 ? 'issues' : 'clean';
  const label = status === 'checking' ? 'Checking'
    : status === 'unavailable' ? 'Checking unavailable'
      : status === 'paused' ? 'Checking paused'
        : status === 'zen' ? `Zen mode${count ? `, ${count} issue${count === 1 ? '' : 's'}` : ''}`
          : status === 'issues' ? `${count} issue${count === 1 ? '' : 's'}` : 'No issues';
  return { status, issueCount: count, mode, label };
}

export function focusConfidenceThreshold(sensitivity = 55): number {
  const value = Number(sensitivity);
  if (!Number.isFinite(value)) return 0.68;
  const normalized = Math.max(0, Math.min(100, value));
  return 0.9 - (0.4 * normalized / 100);
}

export function filterIssues(issues: Issue[], preferences: WritingPreferences = {}, focusValue: unknown = { mode: 'active', until: null }, now = Date.now()): Issue[] {
  const focus = resolveFocusState(focusValue, now);
  if (focus.mode === 'paused') return [];
  const categories = preferences.categories ?? {};
  const dictionary = new Set([...preferences.dictionaryWords ?? []].map((word) => textValue(word).trim().toLocaleLowerCase()).filter(Boolean));
  const ignoredRuleIds = new Set([...preferences.ignoredRuleIds ?? []].map((ruleId) => textValue(ruleId).trim().toLocaleLowerCase()).filter(Boolean));
  const threshold = focus.mode === 'zen' ? Math.max(0.8, focusConfidenceThreshold(preferences.sensitivity)) : 0;
  return (Array.isArray(issues) ? issues : []).filter((issue) => {
    if (categories[issue.category] === false) return false;
    if (issue.category === 'spelling' && dictionary.has(issue.matchedText.toLocaleLowerCase())) return false;
    if (issue.rule?.id && ignoredRuleIds.has(issue.rule.id.toLocaleLowerCase())) return false;
    if (threshold > 0 && issue.confidence !== undefined && issue.confidence < threshold) return false;
    if (focus.mode === 'zen' && ['style', 'repetition', 'word-family', 'wordiness', 'plain-english', 'conciseness'].includes(issue.category)) return false;
    return true;
  });
}
