// The selection popover: what the writer just highlighted.
//
// `renderSelectionSummary` in issue_popover.ts renders three numbers, which is
// not the feature. The legacy extension is the behavioural oracle here, and it
// reports states the stub had no way to express — Checking…, Paused, Off,
// Unavailable, and Too large — plus the singular/plural the counts need.
// Migrating without those would have quietly dropped them.
//
// Informational first. A short highlight must not produce a large panel: the
// issue card is opened by asking to review, not by selecting text.

export type SelectionStatus = 'checking' | 'ready' | 'paused' | 'off' | 'unavailable' | 'too-large';

export interface SelectionState {
  status: SelectionStatus;
  words: number;
  characters: number;
  /** Only meaningful once a check has answered. */
  issues?: number;
  /** The effective language, when the host knows it. */
  language?: string;
  /** A safe preview of the selection, truncated by this component. */
  text?: string;
}

/** Long enough to recognise the passage, short enough not to become a panel. */
export const SELECTION_PREVIEW_LIMIT = 90;

export const SELECTION_POPOVER_CSS = `
.writing-selection { display: grid; gap: var(--space-3); max-width: 320px; }
.writing-selection-source { color: var(--fg-4); font: 500 11px/1 var(--font-mono); letter-spacing: .04em; text-transform: uppercase; }
.writing-selection-preview { color: var(--fg-2); font: 400 13px/1.45 var(--font-sans); margin: 0; }
.writing-selection-stats { display: flex; gap: var(--space-4); }
.writing-selection-foot { align-items: center; display: flex; gap: var(--space-3); justify-content: space-between; }
`;

const STATUS_TEXT: Record<SelectionStatus, string> = {
  checking: 'Checking…',
  ready: '',
  paused: 'Paused',
  off: 'Off',
  unavailable: 'Unavailable',
  'too-large': 'Too large',
};

function escapeHTML(value: string): string {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] as string));
}

function count(value: unknown): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value as number)) : 0;
}

/** Truncated on a word boundary where one is near, so a preview never cuts mid-word. */
export function previewText(text: string, limit: number = SELECTION_PREVIEW_LIMIT): string {
  const value = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (value.length <= limit) return value;
  const clipped = value.slice(0, limit);
  const boundary = clipped.lastIndexOf(' ');
  return `${(boundary > limit * 0.6 ? clipped.slice(0, boundary) : clipped).trimEnd()}…`;
}

export function normalizeSelectionState(value: Partial<SelectionState> = {}): SelectionState {
  const statuses: SelectionStatus[] = ['checking', 'ready', 'paused', 'off', 'unavailable', 'too-large'];
  return {
    status: statuses.includes(value.status as SelectionStatus) ? value.status as SelectionStatus : 'checking',
    words: count(value.words),
    characters: count(value.characters),
    ...(value.issues === undefined ? {} : { issues: count(value.issues) }),
    ...(typeof value.language === 'string' && value.language.trim() ? { language: value.language.trim() } : {}),
    ...(typeof value.text === 'string' && value.text.trim() ? { text: value.text } : {}),
  };
}

export function renderSelectionPopover(state: Partial<SelectionState> = {}): string {
  const value = normalizeSelectionState(state);

  // The counts describe the selection and are always true, whatever the checker
  // is doing — so they are shown even when checking is paused or unavailable.
  const stat = (n: number, singular: string, plural: string) =>
    `<span><strong>${n}</strong> <small>${n === 1 ? singular : plural}</small></span>`;

  // An issue count is only reported once a check has answered for this
  // selection. Every other state says what is happening instead of showing a
  // number that would be untrue.
  const issueText = value.status === 'ready'
    ? `<strong>${value.issues ?? 0}</strong> <small>${(value.issues ?? 0) === 1 ? 'issue' : 'issues'}</small>`
    : `<strong>${STATUS_TEXT[value.status]}</strong>`;

  const preview = value.text
    ? `<p class="writing-selection-preview">${escapeHTML(previewText(value.text))}</p>`
    : '';
  const language = value.language ? `<span class="cnt-tag">${escapeHTML(value.language)}</span>` : '';

  // Offered only when there is something to review — a Review action on a clean
  // or paused selection leads nowhere.
  const review = value.status === 'ready' && (value.issues ?? 0) > 0
    ? '<button class="cnt-btn" type="button" data-action="review-selection">Review issues</button>'
    : '';

  return '<section class="cnt-popover writing-selection" role="status" aria-label="Selection">'
    + '<span class="writing-selection-source">Selected text</span>'
    + preview
    + `<div class="writing-selection-stats">${stat(value.words, 'word', 'words')}${stat(value.characters, 'character', 'characters')}<span>${issueText}</span></div>`
    + (language || review ? `<div class="writing-selection-foot">${language}${review}</div>` : '')
    + '</section>';
}
