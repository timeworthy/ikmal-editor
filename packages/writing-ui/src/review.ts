// The full review workspace and the undo notice.
//
// The workspace is a fourth review surface, not a replacement for the indicator
// popover: it exists for long documents and detailed passes. It consumes the
// same rows the indicator popover shows, so the two can never drift into
// separate issue models.
//
// The undo notice is what makes Apply reversible in the writer's eyes. Every
// applied correction produces a record; this is how the record surfaces.

import { categoryLabel } from './categories.js';
import { renderReviewRow, type ReviewRow } from './indicator_popover.js';

export interface ReviewWorkspaceState {
  /** What is being reviewed: a document name, or a selection. */
  label: string;
  issues: ReviewRow[];
  words: number;
  characters: number;
  /** Category filters offered. The active one is `filter`. */
  filters: string[];
  filter?: string;
  selectedId?: string;
}

export type ReviewLayout = 'sidebar' | 'panel';

export const REVIEW_LAYOUTS: readonly ReviewLayout[] = ['sidebar', 'panel'];

/**
 * Which shape the findings take. Two real choices rather than one with a
 * fallback: a list beside the draft is the better way to work through a
 * document, and a card opened from the indicator is what someone writing in a
 * narrow window — or wanting the text by itself — reaches for.
 */
export function normalizeReviewLayout(value: unknown): ReviewLayout {
  return REVIEW_LAYOUTS.includes(value as ReviewLayout) ? value as ReviewLayout : 'sidebar';
}

/** A row in the sidebar, with what the selected one needs to be acted on. */
export interface ReviewSidebarIssue extends ReviewRow {
  replacements?: Array<{ value: string }>;
  /**
   * Alternative wordings — a rewrite rather than a correction. Kept apart from
   * `replacements` because they are not the same offer: a replacement fixes
   * something wrong, and a candidate proposes a different way of saying
   * something that is not.
   */
  rewordCandidates?: Array<{ id?: string; replacementText: string; rationale?: string }>;
  /** Offered only where the host has somewhere to keep a personal dictionary. */
  canAddToDictionary?: boolean;
}

export interface ReviewSidebarState {
  issues: ReviewSidebarIssue[];
  selectedId?: string;
  /** Said plainly when the checker cannot be reached, rather than as "0 issues". */
  unavailableReason?: string;
}

export interface UndoNoticeState {
  /** What changed, in the writer's words: "teh" → "the". */
  from: string;
  to: string;
  /** Present when the correction can no longer be undone. */
  expired?: boolean;
}

export const REVIEW_CSS = `
.writing-review { display: grid; gap: var(--space-4); }
.writing-review-head { align-items: baseline; display: flex; gap: var(--space-3); justify-content: space-between; }
.writing-review-label { color: var(--fg-1); font: 600 15px/1.2 var(--font-sans); }
.writing-review-summary { display: flex; gap: var(--space-5); }
.writing-review-list { display: grid; gap: var(--space-3); list-style: none; margin: 0; padding: 0; }
.writing-review-row { display: grid; gap: var(--space-2); }
.writing-review-row[aria-current="true"] { border-color: var(--accent); }
.writing-review-meta { display: flex; gap: var(--space-2); }
.writing-review-message { color: var(--fg-1); font: 400 13px/1.45 var(--font-sans); margin: 0; }
.writing-review-match { color: var(--fg-3); font: 400 12px/1.3 var(--font-mono); }
/* The sidebar: findings beside the draft rather than a view that replaces it.
   It scrolls on its own so a long list never grows the page the writing is on,
   and it is the host's job to decide it has the width for one. */
.writing-review-side { display: grid; gap: var(--space-3); grid-template-rows: auto minmax(0, 1fr); min-height: 0; }
.writing-review-side-head { align-items: baseline; color: var(--fg-3); display: flex; font: 600 11px/1 var(--font-mono); gap: var(--space-2); justify-content: space-between; text-transform: uppercase; }
.writing-review-side-list { display: grid; gap: var(--space-2); list-style: none; margin: 0; min-height: 0; overflow-y: auto; padding: 0; scrollbar-gutter: stable; }
/* Only the selected row carries controls. Every row showing Apply would be a
   column of buttons inviting an edit nobody has looked at yet, and the point of
   the list is to read the findings before acting on any of them. */
.writing-review-side .writing-review-row { cursor: pointer; padding: var(--space-3); }
.writing-review-side .writing-review-row[aria-current="true"] { border-color: var(--accent); box-shadow: var(--shadow-focus); }
.writing-review-side .writing-review-row:focus-visible { border-color: var(--accent); box-shadow: var(--shadow-focus); outline: 2px solid transparent; }
.writing-review-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-1); }
.writing-review-actions .cnt-btn { min-height: 30px; }
.writing-review-change { align-items: center; color: var(--fg-2); display: flex; flex-wrap: wrap; font: 400 12px/1.4 var(--font-mono); gap: var(--space-2); }
.writing-review-change ins { background: var(--accent-soft); border-radius: var(--radius-1); color: var(--fg-1); padding: 0 var(--space-1); text-decoration: none; }
.writing-review-change del { color: var(--fg-4); }
/* An alternative wording, shown in full before it is offered. */
.writing-review-rewrite { display: grid; gap: var(--space-2); justify-items: start; margin-top: var(--space-2); }
.writing-review-rationale { color: var(--fg-3); font: 500 11px/1.3 var(--font-sans); }
.writing-review-proposed { line-height: 1.45; white-space: normal; }
.writing-undo { align-items: center; display: flex; gap: var(--space-3); justify-content: space-between; }
.writing-undo-change { color: var(--fg-2); font: 400 13px/1.3 var(--font-sans); }
.writing-undo-change b { color: var(--fg-1); font-weight: 600; }
`;

function escapeHTML(value: string): string {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] as string));
}

function count(value: unknown): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value as number)) : 0;
}

export function normalizeReviewWorkspaceState(value: Partial<ReviewWorkspaceState> = {}): ReviewWorkspaceState {
  return {
    label: typeof value.label === 'string' && value.label.trim() ? value.label.trim() : 'This document',
    issues: Array.isArray(value.issues) ? value.issues.filter((issue) => issue && typeof issue.id === 'string') : [],
    words: count(value.words),
    characters: count(value.characters),
    filters: Array.isArray(value.filters) && value.filters.length ? value.filters : ['All', 'Spelling', 'Grammar', 'Style', 'Quality'],
    ...(typeof value.filter === 'string' ? { filter: value.filter } : {}),
    ...(typeof value.selectedId === 'string' ? { selectedId: value.selectedId } : {}),
  };
}

export function renderReviewWorkspace(state: Partial<ReviewWorkspaceState> = {}): string {
  const value = normalizeReviewWorkspaceState(state);
  const active = value.filter || value.filters[0];
  const filters = value.filters.map((filter) => (
    `<button class="cnt-tab" type="button" role="tab" aria-selected="${filter === active}" data-filter="${escapeHTML(filter)}">${escapeHTML(filter)}</button>`
  )).join('');

  // Ordered by document position by the caller; this surface does not reorder,
  // because a review list that jumps around while you work through it is worse
  // than one that is merely long.
  const rows = value.issues.length
    ? `<ul class="writing-review-list">${value.issues.map((issue) => {
      const row = renderReviewRow(issue);
      return value.selectedId === issue.id ? row.replace('<li class="cnt-card writing-review-row"', '<li class="cnt-card writing-review-row" aria-current="true"') : row;
    }).join('')}</ul>`
    : '<div class="cnt-empty"><div class="cnt-empty-title">Nothing to review</div><div class="cnt-empty-text">Findings appear here as you write.</div></div>';

  return '<section class="writing-review" aria-label="Review">'
    + `<div class="writing-review-head"><span class="writing-review-label">${escapeHTML(value.label)}</span>`
    + '<button class="cnt-btn" type="button" data-action="close-review">Back</button></div>'
    + '<div class="writing-review-summary">'
    + `<span class="cnt-stat"><span class="cnt-stat-label">Words</span><span class="cnt-stat-value">${value.words}</span></span>`
    + `<span class="cnt-stat"><span class="cnt-stat-label">Characters</span><span class="cnt-stat-value">${value.characters}</span></span>`
    + `<span class="cnt-stat"><span class="cnt-stat-label">Issues</span><span class="cnt-stat-value">${value.issues.length}</span></span>`
    + '</div>'
    + `<div class="cnt-tabs" role="tablist" aria-label="Filter findings">${filters}</div>`
    + rows
    + '</section>';
}

/**
 * Findings beside the draft, in document order.
 *
 * The selected row is the only one that carries controls, and it uses the same
 * `data-action` names the issue card does — so a host wires Apply, Ignore and
 * the dictionary once and both layouts reach the same code. Rendering a button
 * per row instead would put a column of Apply beside text nobody has read yet.
 */
export function renderReviewSidebar(state: Partial<ReviewSidebarState> = {}): string {
  const issues = Array.isArray(state.issues) ? state.issues.filter((issue) => issue && typeof issue.id === 'string') : [];
  const selectedId = typeof state.selectedId === 'string' ? state.selectedId : '';

  if (state.unavailableReason) {
    return '<section class="writing-review-side" aria-label="Findings">'
      + '<div class="writing-review-side-head"><span>Findings</span></div>'
      + `<div class="cnt-empty"><div class="cnt-empty-title">Checker unavailable</div>`
      + `<div class="cnt-empty-text">${escapeHTML(state.unavailableReason)}</div></div></section>`;
  }

  const rows = issues.map((issue) => {
    const selected = issue.id === selectedId;
    const replacement = issue.replacements?.[0]?.value || '';
    // The change is spelled out before it is offered, because Apply edits the
    // writer's own words and "Apply" alone does not say to what.
    const change = selected && replacement
      ? `<div class="writing-review-change"><del>${escapeHTML(issue.matchedText)}</del><span>&rarr;</span><ins>${escapeHTML(replacement)}</ins></div>`
      : '';
    // A rewrite is shown in full and applied by its own button, because it
    // replaces a clause rather than a word: "Apply" with no visible text would
    // be asking someone to accept a sentence they have not read. The card in the
    // other layout puts these behind a disclosure; here the row is already the
    // reader's focus, so it says what it would write.
    const rewrites = selected
      ? (issue.rewordCandidates || []).map((candidate) => '<div class="writing-review-rewrite">'
        + `<span class="writing-review-rationale">${escapeHTML(candidate.rationale || 'Another way to say this')}</span>`
        + `<span class="settings-sample writing-review-proposed">${escapeHTML(candidate.replacementText)}</span>`
        + `<button class="cnt-btn" data-size="sm" type="button" data-action="reword" data-value="${escapeHTML(candidate.replacementText)}">Use this</button>`
        + '</div>').join('')
      : '';
    const actions = selected
      ? '<div class="writing-review-actions">'
        + (replacement ? '<button class="cnt-btn" type="button" data-action="apply">Apply</button>' : '')
        + (issue.canAddToDictionary ? '<button class="cnt-btn" type="button" data-action="dictionary">Add to dictionary</button>' : '')
        + '<button class="cnt-btn" type="button" data-action="ignore">Ignore</button></div>'
      : '';
    // What kind of finding this is, not which of our services noticed it. The
    // style guide is the exception: the writer chose that document and can turn
    // it off, so it is named.
    const guide = issue.guide ? `<span class="cnt-tag">${escapeHTML(issue.guide)}</span>` : '';
    // The matched words, except where the change line is already showing them
    // on its left-hand side. Both together printed the same text twice, one
    // line apart, in the row the reader is being asked to act on.
    const match = change ? '' : `<code class="writing-review-match">${escapeHTML(issue.matchedText)}</code>`;
    // Focusable and named. The rows are the only way to reach a finding in this
    // layout — there is no card to open — so a list of plain list items would
    // have left keyboard and screen-reader users with no path to any of them.
    // The accessible name leads with the category and the words, because that
    // is what distinguishes one row from the next when they are read aloud.
    const label = `${categoryLabel(issue.category)}: ${issue.matchedText}. ${issue.message}`;
    return `<li class="cnt-card writing-review-row" data-issue-id="${escapeHTML(issue.id)}"`
      + ` role="option" tabindex="0" aria-selected="${selected}" aria-label="${escapeHTML(label)}"`
      + `${selected ? ' aria-current="true"' : ''}>`
      + `<div class="writing-review-meta"><span class="cnt-tag">${escapeHTML(categoryLabel(issue.category))}</span>${guide}</div>`
      + `<p class="writing-review-message">${escapeHTML(issue.message)}</p>`
      + match + change + rewrites + actions + '</li>';
  }).join('');

  const body = issues.length
    ? `<ul class="writing-review-side-list" role="listbox" aria-label="Findings">${rows}</ul>`
    : '<div class="cnt-empty"><div class="cnt-empty-title">Nothing to review</div>'
      + '<div class="cnt-empty-text">Findings appear here as you write.</div></div>';

  return '<section class="writing-review-side" aria-label="Findings">'
    + `<div class="writing-review-side-head"><span>Findings</span>`
    + `<span>${issues.length}</span></div>${body}</section>`;
}

/**
 * Shown after Apply. An applied correction that cannot be reversed is a silent
 * edit to the user's text, which is the one thing this product must never do.
 */
export function renderUndoNotice(state: Partial<UndoNoticeState> = {}): string {
  const from = escapeHTML(typeof state.from === 'string' ? state.from : '');
  const to = escapeHTML(typeof state.to === 'string' ? state.to : '');
  const action = state.expired
    ? '<span class="writing-setting-description">The text has moved on; this can no longer be undone.</span>'
    : '<button class="cnt-btn" type="button" data-action="undo">Undo</button>';
  return '<div class="cnt-toast writing-undo" role="status">'
    + `<span class="writing-undo-change"><b>${from}</b> → <b>${to}</b></span>${action}`
    + '</div>';
}
