import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// Imported from dist, the way writing-adapters tests its own modules: these
// composites import each other, and a cross-module import resolves only once
// compiled. It also means the test exercises the artifact hosts actually load.
import { renderModePicker, normalizeModePickerState, FOCUS_DURATIONS } from '../dist/mode_picker.js';
import { renderIndicatorPopover, normalizeIndicatorPopoverState, renderReviewRow } from '../dist/indicator_popover.js';
import { renderSettingsGroups, renderServiceHealth, renderStyleGuideCard } from '../dist/settings.js';
import { renderReviewWorkspace, renderUndoNotice } from '../dist/review.js';

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');

test('only a running timed mode offers a duration, and it offers every one', () => {
  // The ids are writing-core's. They were a parallel set, and `until-off`
  // against the core's `forever` only worked because the core treats an
  // unrecognised id as indefinite — the right answer for the wrong reason.
  assert.deepEqual(FOCUS_DURATIONS.map((d) => d.id), ['15m', '1h', '4h', 'forever']);

  const paused = renderModePicker({ mode: 'paused', duration: '1h', until: 'until 14:20' });
  for (const label of ['15 minutes', '1 hour', '4 hours', 'Until turned off']) assert.match(paused, new RegExp(label));
  assert.match(paused, /data-mode="paused"[^>]*data-selected="true"|data-selected="true" data-mode="paused"/);
  assert.match(paused, /<option value="1h" selected>/);
  assert.match(paused, /until 14:20/);
  // The running segment carries the control; the others stay plain buttons, so
  // there is exactly one duration control on screen and only while one is due.
  assert.equal((paused.match(/<select/g) || []).length, 1);
  assert.match(paused, /<button[^>]*data-mode="zen"/);

  // Automatic is the absence of a timed mode, so nothing about duration exists.
  const automatic = renderModePicker({ mode: 'active' });
  assert.doesNotMatch(automatic, /<select|15 minutes/);
  assert.equal((automatic.match(/<button/g) || []).length, 3);

  // A mode entered without a duration runs indefinitely, which is what the
  // shell does with an id it does not recognise.
  assert.equal(normalizeModePickerState({ mode: 'paused' }).duration, 'forever');
  assert.equal(normalizeModePickerState({ mode: 'paused', duration: 'nonsense' }).duration, 'forever');
  assert.equal(normalizeModePickerState({ mode: 'nonsense' }).mode, 'active');
});

test('the indicator popover never shows a count it cannot know', () => {
  const checking = renderIndicatorPopover({ status: 'checking', issueCount: 4, words: 10, characters: 50 });
  assert.doesNotMatch(checking, /Issues<\/span>/);
  const done = renderIndicatorPopover({ status: 'issues', issueCount: 4, words: 10, characters: 50 });
  assert.match(done, /Issues<\/span><span class="cnt-stat-value">4</);
  // An empty review section is collapsed rather than rendered as a bare list.
  assert.doesNotMatch(done, /writing-ip-review/);
  const withIssues = renderIndicatorPopover({ status: 'issues', issues: [{ id: 'a', message: 'Use "the"', matchedText: 'teh', source: 'LanguageTool' }] });
  assert.match(withIssues, /writing-ip-review/);
  assert.equal(normalizeIndicatorPopoverState({ issueCount: -3 }).issueCount, 0);
});

test('service health reports what is running and who started it', () => {
  const html = renderServiceHealth([
    { name: 'LanguageTool', state: 'ready', endpoint: '127.0.0.1:8097', managed: true },
    { name: 'Local model', state: 'stopped', managed: false },
  ]);
  assert.match(html, /data-intent="success">Ready/);
  assert.match(html, /data-intent="warning">Stopped/);
  // Whether the app owns the service decides what a restart can do.
  assert.match(html, /managed/);
  assert.match(html, /existing/);
  assert.match(renderServiceHealth([]), /No services reported/);
});

test('a style guide can be disabled without being deleted', () => {
  const empty = renderStyleGuideCard({ guides: [] });
  assert.match(empty, /No style guide imported/);
  const chosen = renderStyleGuideCard({ guides: [{ id: 'ap', name: 'AP', ruleCount: 42 }], selectedId: 'ap', enabled: false });
  assert.match(chosen, /value="ap" selected/);
  assert.match(chosen, /data-action="enable-guide"(?![^>]*checked)/);
  assert.match(chosen, /42 rules/);
});

test('the review workspace and the indicator popover share one issue row', () => {
  const issue = { id: 'x1', message: 'Passive voice', matchedText: 'was reviewed', source: 'quality-sidecar', category: 'style' };
  const row = renderReviewRow(issue);
  assert.ok(renderReviewWorkspace({ issues: [issue] }).includes(row.replace('<li class="cnt-card writing-review-row"', '<li class="cnt-card writing-review-row"')));
  assert.match(renderIndicatorPopover({ status: 'issues', issues: [issue] }), /was reviewed/);
  assert.match(renderReviewWorkspace({ issues: [] }), /Nothing to review/);
});

test('an applied correction is reversible, and says so when it is not', () => {
  assert.match(renderUndoNotice({ from: 'teh', to: 'the' }), /data-action="undo"/);
  assert.match(renderUndoNotice({ from: 'teh', to: 'the', expired: true }), /can no longer be undone/);
});

test('every composite escapes text it did not author', () => {
  const nasty = '<img src=x onerror=alert(1)>';
  const rendered = [
    renderModePicker({ open: 'paused', durations: [{ id: nasty, label: nasty }] }),
    renderIndicatorPopover({ status: 'issues', issues: [{ id: nasty, message: nasty, matchedText: nasty, source: nasty }] }),
    renderSettingsGroups([{ id: 'g', title: nasty, description: nasty, summary: nasty }]),
    renderServiceHealth([{ name: nasty, state: 'ready', endpoint: nasty }]),
    renderStyleGuideCard({ guides: [{ id: nasty, name: nasty }] }),
    renderReviewWorkspace({ label: nasty, issues: [{ id: 'a', message: nasty, matchedText: nasty, source: nasty }] }),
    renderUndoNotice({ from: nasty, to: nasty }),
  ].join('');
  assert.doesNotMatch(rendered, /<img src=x/);
  assert.match(rendered, /&lt;img/);
});

// Phase B's reason for existing: composites build on the primitive layer instead
// of restyling it. A composite that declares its own colour has started a second
// visual system inside the one this package exports.
test('composites compose primitives and declare no colour of their own', async () => {
  for (const file of ['mode_picker.ts', 'indicator_popover.ts', 'settings.ts', 'review.ts']) {
    const source = await readFile(path.join(src, file), 'utf8');
    const css = [...source.matchAll(/_CSS = `([\s\S]*?)`/g)].map((m) => m[1]).join('\n');
    assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i, `${file} hard-codes a colour`);
    assert.doesNotMatch(css, /\brgba?\(\s*\d/, `${file} hard-codes a colour`);
    assert.match(source, /cnt-/, `${file} does not compose any primitive`);
  }
});

// The selection popover was a three-number stub while the legacy extension —
// the behavioural oracle — reported Checking…, Paused, Off, Unavailable and
// Too large. Migrating on the stub would have dropped every one of them.
test('the selection popover reports the states the product actually has', async () => {
  const { renderSelectionPopover, normalizeSelectionState, previewText } = await import('../dist/selection_popover.js');
  const states = { checking: 'Checking…', paused: 'Paused', off: 'Off', unavailable: 'Unavailable', 'too-large': 'Too large' };
  for (const [status, label] of Object.entries(states)) {
    const html = renderSelectionPopover({ status, words: 12, characters: 63 });
    assert.match(html, new RegExp(label.replace('…', '…')), `${status} must say ${label}`);
    // A count would be untrue in these states, so it is not shown.
    assert.doesNotMatch(html, />\d+<\/strong> <small>issues?/);
    // The counts themselves are always true and always shown.
    assert.match(html, /<strong>12<\/strong> <small>words/);
  }
  const ready = renderSelectionPopover({ status: 'ready', words: 1, characters: 4, issues: 1, language: 'en-US' });
  assert.match(ready, /<strong>1<\/strong> <small>issue<\/small>/);
  assert.match(ready, /<strong>1<\/strong> <small>word<\/small>/, 'singular when there is one');
  assert.match(ready, /data-action="review-selection"/);
  assert.match(ready, /en-US/);
  // Nothing to review means no action that leads nowhere.
  assert.doesNotMatch(renderSelectionPopover({ status: 'ready', issues: 0 }), /review-selection/);
  assert.equal(normalizeSelectionState({ status: 'nonsense' }).status, 'checking');
});

test('a selection preview is truncated without cutting a word or trusting input', async () => {
  const { renderSelectionPopover, previewText, SELECTION_PREVIEW_LIMIT } = await import('../dist/selection_popover.js');
  const long = 'The quick brown fox jumps over the lazy dog and keeps running well past any reasonable limit for a preview line';
  const preview = previewText(long);
  assert.ok(preview.length <= SELECTION_PREVIEW_LIMIT + 1, `preview too long: ${preview.length}`);
  assert.match(preview, /…$/);
  assert.doesNotMatch(preview, /\s…$/, 'trailing space before the ellipsis');
  assert.equal(previewText('  spaced   out  '), 'spaced out');
  assert.doesNotMatch(renderSelectionPopover({ text: '<img src=x onerror=alert(1)>', status: 'ready' }), /<img src=x/);
});

// Plan §6.3 requires previous/next with "n of total", and a close control. The
// shared card had neither while the legacy extension did, so a host migrating
// onto it would have lost the ability to reach an adjacent finding at all.
test('the issue popover can navigate between findings and be closed', async () => {
  const { renderIssuePopover } = await import('../dist/issue_popover.js');
  const issue = { id: 'a', category: 'spelling', source: 'LanguageTool', severity: 'medium', message: 'Use "the"', matchedText: 'teh', actionability: 'safe-apply', replacements: [{ value: 'the' }] };
  const middle = renderIssuePopover(issue, { index: 1, total: 3 });
  assert.match(middle, /2 of 3/);
  assert.match(middle, /data-action="previous"(?![^>]*disabled)/);
  assert.match(middle, /data-action="next"(?![^>]*disabled)/);
  // The ends must not offer a step that goes nowhere.
  assert.match(renderIssuePopover(issue, { index: 0, total: 3 }), /data-action="previous"[^>]*disabled/);
  assert.match(renderIssuePopover(issue, { index: 2, total: 3 }), /data-action="next"[^>]*disabled/);
  // One finding needs no navigation, but always needs a way out.
  assert.doesNotMatch(renderIssuePopover(issue, { total: 1 }), /data-action="next"/);
  assert.match(renderIssuePopover(issue), /data-action="close"/);
});
