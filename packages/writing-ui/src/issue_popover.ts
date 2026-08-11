export type IssueActionability = 'safe-apply' | 'review-first' | 'explanation-only';

export interface IssuePopoverIssue {
  id: string;
  category: string;
  source: string;
  severity: 'low' | 'medium' | 'high';
  message: string;
  matchedText: string;
  actionability: IssueActionability;
  replacements?: Array<{ value: string }>;
  rewordCandidates?: Array<{ id: string; replacementText: string; rationale: string }>;
}

export interface IssuePopoverOptions {
  // A host that has nowhere to store a personal dictionary must not render the
  // action: the button is inert there, and a suggestion control that does
  // nothing when clicked is worse than an absent one.
  canAddToDictionary?: boolean;
}

export interface SelectionSummary {
  words: number;
  characters: number;
  issues: number;
}

export const ISSUE_POPOVER_CSS = `
.writing-issue-popover { color: var(--fg-1); display: grid; gap: var(--space-3); min-width: 280px; max-width: 360px; }
.writing-issue-meta { align-items: center; color: var(--fg-3); display: flex; font: 600 11px/1 var(--font-mono); gap: var(--space-2); text-transform: uppercase; }
.writing-issue-message { font: 500 14px/1.45 var(--font-sans); margin: 0; }
.writing-issue-match { background: var(--accent-soft); border-radius: var(--radius-1); color: var(--fg-1); font: 13px/1.4 var(--font-mono); padding: var(--space-2) var(--space-3); }
.writing-issue-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.writing-issue-actions .cnt-btn { min-height: 32px; }
.writing-issue-alternatives { display: grid; gap: var(--space-2); }
.writing-issue-alternatives summary { color: var(--fg-2); cursor: pointer; font: 500 13px/1.4 var(--font-sans); }
.writing-issue-alternatives .cnt-btn { min-height: 32px; width: 100%; }
.writing-selection-summary { align-items: baseline; display: flex; flex-wrap: wrap; gap: var(--space-3); }
.writing-selection-stat { color: var(--fg-2); font: 12px/1.3 var(--font-mono); }
.writing-selection-stat strong { color: var(--fg-1); font-size: 15px; }
`;

function escapeHTML(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] as string));
}

function candidatesFor(issue: IssuePopoverIssue): string[] {
  const values = [
    ...(issue.replacements || []).map((replacement) => replacement.value),
    ...(issue.rewordCandidates || []).map((candidate) => candidate.replacementText),
  ].map((value) => String(value ?? '')).filter(Boolean);
  return [...new Set(values)];
}

function applyButton(value: string, label: string): string {
  return `<button class="cnt-btn" type="button" data-action="apply" data-value="${escapeHTML(value)}">${escapeHTML(label)}</button>`;
}

// Every rendered control carries the action a host actually implements. A
// finding the user should read before accepting still gets its review step —
// the chooser is the review — rather than a button whose action no host
// handles, which reads as a click that did nothing.
function primaryActionFor(issue: IssuePopoverIssue): string {
  const candidates = candidatesFor(issue);
  if (!candidates.length) return '';
  if (issue.actionability === 'safe-apply') return applyButton(candidates[0], 'Apply');
  const label = issue.rewordCandidates?.length && !issue.replacements?.length ? 'Consider rewording' : 'Review alternatives';
  return `<details class="writing-issue-alternatives"><summary>${label}</summary>${candidates.map((value) => applyButton(value, value)).join('')}</details>`;
}

export function renderIssuePopover(issue: IssuePopoverIssue, options: IssuePopoverOptions = {}): string {
  const replacement = issue.replacements?.[0]?.value || issue.rewordCandidates?.[0]?.replacementText || '';
  const primaryButton = primaryActionFor(issue);
  const dictionary = options.canAddToDictionary && issue.category === 'spelling' ? '<button class="cnt-btn" type="button" data-action="dictionary">Add to dictionary</button>' : '';
  const preview = replacement ? `<div class="writing-issue-match" data-role="replacement-preview">${escapeHTML(issue.matchedText)} → ${escapeHTML(replacement)}</div>` : `<div class="writing-issue-match">${escapeHTML(issue.matchedText)}</div>`;
  return `<section class="cnt-popover writing-issue-popover" role="dialog" aria-label="Writing issue" data-issue-id="${escapeHTML(issue.id)}"><div class="writing-issue-meta"><span>${escapeHTML(issue.source)}</span><span>${escapeHTML(issue.category)}</span><span>${escapeHTML(issue.severity)}</span></div><p class="writing-issue-message">${escapeHTML(issue.message)}</p>${preview}<details><summary>Why?</summary><p>${escapeHTML(issue.message)}</p></details><div class="writing-issue-actions">${primaryButton}${dictionary}<button class="cnt-btn" type="button" data-action="ignore">Ignore</button></div></section>`;
}

export function renderSelectionSummary(summary: Partial<SelectionSummary> = {}): string {
  const value = {
    words: Number.isFinite(summary.words) ? Math.max(0, Math.floor(summary.words as number)) : 0,
    characters: Number.isFinite(summary.characters) ? Math.max(0, Math.floor(summary.characters as number)) : 0,
    issues: Number.isFinite(summary.issues) ? Math.max(0, Math.floor(summary.issues as number)) : 0,
  };
  return `<section class="cnt-popover writing-selection-summary" role="status" aria-label="Selection statistics"><span class="writing-selection-stat"><strong>${value.words}</strong> words</span><span class="writing-selection-stat"><strong>${value.characters}</strong> characters</span><span class="writing-selection-stat"><strong>${value.issues}</strong> issues</span></section>`;
}
