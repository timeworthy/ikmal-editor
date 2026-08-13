// The indicator popover: "what is happening right now?", and immediate control.
//
// Order follows the plan's taxonomy — state, counts, modes, inline review, the
// route to full review, then settings. It is deliberately not a settings panel:
// the indicator answers the current state and offers the controls a writer needs
// without leaving the field.
//
// Composed from primitives: `.cnt-popover`, `.cnt-stat`, `.cnt-btn`,
// `.cnt-status-dot`, plus the mode picker.

import { categoryLabel } from './categories.js';
import { renderModePicker, MODE_PICKER_CSS, type ModePickerState } from './mode_picker.js';

export type IndicatorStatus = 'checking' | 'clean' | 'issues' | 'paused' | 'zen' | 'unavailable';

export interface ReviewRow {
  id: string;
  message: string;
  matchedText: string;
  category?: string;
  /**
   * Where the finding came from. Carried because hosts and diagnostics use it,
   * and deliberately not rendered: see `categories.ts`.
   */
  source?: string;
  /** The style guide's name, when the host knows the finding came from one. */
  guide?: string;
}

export interface IndicatorPopoverState {
  status: IndicatorStatus;
  issueCount: number;
  words: number;
  characters: number;
  /** Rendered when findings exist. Collapsed to nothing when they do not. */
  issues: ReviewRow[];
  modes: Partial<ModePickerState>;
  /** Set when the host cannot reach the checker, so the surface can say so. */
  unavailableReason?: string;
}

export const INDICATOR_POPOVER_CSS = `${MODE_PICKER_CSS}
.writing-indicator-popover { display: grid; gap: var(--space-4); min-width: 280px; }
.writing-ip-state { align-items: center; display: flex; gap: var(--space-2); }
.writing-ip-state-label { color: var(--fg-1); font: 600 13px/1.2 var(--font-sans); }
.writing-ip-counts { display: flex; gap: var(--space-5); }
.writing-ip-review { display: grid; gap: var(--space-2); margin: 0; padding: 0; }
.writing-ip-actions { display: flex; gap: var(--space-2); }
.writing-ip-privacy { color: var(--fg-4); font: 400 11px/1.4 var(--font-sans); }
`;

const STATUS_LABELS: Record<IndicatorStatus, string> = {
  checking: 'Checking',
  clean: 'No issues',
  issues: 'Issues found',
  paused: 'Paused',
  zen: 'Zen',
  unavailable: 'Checker unavailable',
};

function escapeHTML(value: string): string {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] as string));
}

function count(value: unknown): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value as number)) : 0;
}

export function normalizeIndicatorPopoverState(value: Partial<IndicatorPopoverState> = {}): IndicatorPopoverState {
  const statuses: IndicatorStatus[] = ['checking', 'clean', 'issues', 'paused', 'zen', 'unavailable'];
  return {
    status: statuses.includes(value.status as IndicatorStatus) ? value.status as IndicatorStatus : 'clean',
    issueCount: count(value.issueCount),
    words: count(value.words),
    characters: count(value.characters),
    issues: Array.isArray(value.issues) ? value.issues.filter((issue) => issue && typeof issue.id === 'string') : [],
    modes: value.modes && typeof value.modes === 'object' ? value.modes : {},
    ...(typeof value.unavailableReason === 'string' && value.unavailableReason ? { unavailableReason: value.unavailableReason } : {}),
  };
}

/** One compact issue row, shared with the full review workspace. */
export function renderReviewRow(row: ReviewRow): string {
  const guide = row.guide ? `<span class="cnt-tag">${escapeHTML(row.guide)}</span>` : '';
  return `<li class="cnt-card writing-review-row" data-issue-id="${escapeHTML(row.id)}">`
    + `<div class="writing-review-meta"><span class="cnt-tag">${escapeHTML(categoryLabel(row.category))}</span>${guide}</div>`
    + `<p class="writing-review-message">${escapeHTML(row.message)}</p>`
    + `<code class="writing-review-match">${escapeHTML(row.matchedText)}</code>`
    + '</li>';
}

export function renderIndicatorPopover(state: Partial<IndicatorPopoverState> = {}): string {
  const value = normalizeIndicatorPopoverState(state);

  // A checking or unavailable surface must not present a count as if the check
  // had finished; the count is only meaningful once a result exists.
  const showCount = value.status !== 'checking' && value.status !== 'unavailable';
  const counts = `<div class="writing-ip-counts">`
    + `<span class="cnt-stat"><span class="cnt-stat-label">Words</span><span class="cnt-stat-value">${value.words}</span></span>`
    + `<span class="cnt-stat"><span class="cnt-stat-label">Characters</span><span class="cnt-stat-value">${value.characters}</span></span>`
    + (showCount ? `<span class="cnt-stat"><span class="cnt-stat-label">Issues</span><span class="cnt-stat-value">${value.issueCount}</span></span>` : '')
    + '</div>';

  // Collapsed to nothing when there is nothing to review, rather than an empty
  // list that looks like a failure.
  const review = value.issues.length
    ? `<ul class="writing-ip-review">${value.issues.map(renderReviewRow).join('')}</ul>`
    : '';

  const unavailable = value.unavailableReason
    ? `<div class="cnt-alert" data-intent="warning"><div class="cnt-alert-text">${escapeHTML(value.unavailableReason)}</div></div>`
    : '';

  return '<section class="cnt-popover writing-indicator-popover" role="dialog" aria-label="Writing status">'
    + `<div class="writing-ip-state"><span class="cnt-status-dot" data-status="${value.status}"></span>`
    + `<span class="writing-ip-state-label">${STATUS_LABELS[value.status]}</span></div>`
    + counts
    + unavailable
    + renderModePicker(value.modes)
    + review
    + '<div class="writing-ip-actions">'
    + '<button class="cnt-btn" type="button" data-action="open-review">Open full review</button>'
    + '<button class="cnt-btn" type="button" data-action="open-settings">Settings</button>'
    + '</div>'
    + '<p class="writing-ip-privacy">Checked on this machine. Nothing is sent anywhere.</p>'
    + '</section>';
}
