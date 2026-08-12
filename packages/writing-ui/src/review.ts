// The full review workspace and the undo notice.
//
// The workspace is a fourth review surface, not a replacement for the indicator
// popover: it exists for long documents and detailed passes. It consumes the
// same rows the indicator popover shows, so the two can never drift into
// separate issue models.
//
// The undo notice is what makes Apply reversible in the writer's eyes. Every
// applied correction produces a record; this is how the record surfaces.

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
