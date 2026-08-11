import assert from 'node:assert/strict';
import test from 'node:test';
import { renderIndicator, normalizeIndicatorSnapshot, INDICATOR_CSS, mountIndicator } from '../src/indicator.ts';
import { renderIssuePopover, renderSelectionSummary } from '../src/issue_popover.ts';

test('indicator rendering is accessible, bounded, and state-driven', () => {
  assert.deepEqual(normalizeIndicatorSnapshot({ status: 'issues', issueCount: 2, label: '2 issues' }), {
    status: 'issues', issueCount: 2, label: '2 issues',
  });
  const html = renderIndicator({ status: 'issues', issueCount: 2, label: '2 <issues>' });
  assert.match(html, /role|button/);
  assert.match(html, /aria-label="2 &lt;issues&gt;"/);
  assert.match(html, /data-status="issues"/);
  assert.match(html, />2<\/span>/);
  assert.doesNotMatch(html, /onclick|chrome|electron/i);
});

test('indicator mount requires and uses a Shadow DOM boundary', () => {
  const appended = [];
  const shadow = {
    append(...values) { appended.push(...values); },
  };
  const root = { attachShadow() { return shadow; } };
  const originalDocument = globalThis.document;
  globalThis.document = {
    createElement(name) {
      if (name === 'style') return { textContent: '' };
      if (name === 'template') return { innerHTML: '', content: { cloneNode: () => ({ kind: 'fragment' }) } };
      throw new Error(`unexpected element ${name}`);
    },
  };
  try {
    assert.equal(mountIndicator(root, { status: 'clean' }), shadow);
    assert.match(appended[0].textContent, /:host/);
    assert.equal(appended[1].kind, 'fragment');
  } finally {
    globalThis.document = originalDocument;
  }
  assert.match(INDICATOR_CSS, /contain:\s*layout style paint/);
  assert.match(INDICATOR_CSS, /prefers-reduced-motion/);
});

test('issue popover and selection summary expose canonical actions without changing text', () => {
  const popover = renderIssuePopover({
    id: 'issue-1', category: 'grammar', source: 'quality', severity: 'medium',
    message: 'Use the corrected form.', matchedText: 'teh', actionability: 'safe-apply',
    replacements: [{ value: 'the' }],
  });
  assert.match(popover, /data-action="apply"/);
  assert.match(popover, /data-action="ignore"/);
  assert.match(popover, /role="dialog"/);
  assert.match(popover, /aria-label="Writing issue"/);
  assert.match(popover, /teh → the/);
  assert.match(renderSelectionSummary({ words: 3, characters: 14, issues: 1 }), /3<\/strong> words/);
  assert.doesNotMatch(popover, /chrome|electron|innerHTML|language\s*tool/i);
});

const spellingIssue = {
  id: 'issue-2', category: 'spelling', source: 'quality', severity: 'medium',
  message: 'This word is not in the dictionary.', matchedText: 'wibbly', actionability: 'safe-apply',
  replacements: [{ value: 'wobbly' }],
};

test('add to dictionary is offered only by a host that can store one', () => {
  // A host with nowhere to keep a personal dictionary would render a button
  // whose click does nothing, which reads as a broken suggestion card.
  assert.doesNotMatch(renderIssuePopover(spellingIssue), /data-action="dictionary"/);
  assert.match(renderIssuePopover(spellingIssue, { canAddToDictionary: true }), /data-action="dictionary"/);
  assert.doesNotMatch(
    renderIssuePopover({ ...spellingIssue, category: 'grammar' }, { canAddToDictionary: true }),
    /data-action="dictionary"/,
    'the dictionary suppresses spelling findings only',
  );
});

test('a finding to review offers its candidates instead of an unhandled action', () => {
  const review = renderIssuePopover({
    id: 'issue-3', category: 'style', source: 'quality', severity: 'low',
    message: 'Consider a shorter phrase.', matchedText: 'at this point in time',
    actionability: 'review-first',
    replacements: [{ value: 'now' }, { value: 'currently' }],
  });
  assert.match(review, /<summary>Review alternatives<\/summary>/);
  assert.match(review, /data-action="apply" data-value="now"/);
  assert.match(review, /data-action="apply" data-value="currently"/);

  const reword = renderIssuePopover({
    id: 'issue-4', category: 'clarity', source: 'quality', severity: 'low',
    message: 'This sentence carries two ideas.', matchedText: 'a long sentence',
    actionability: 'review-first',
    rewordCandidates: [{ id: 'r1', replacementText: 'two shorter sentences', rationale: 'clarity' }],
  });
  assert.match(reword, /<summary>Consider rewording<\/summary>/);
  assert.match(reword, /data-value="two shorter sentences"/);

  // Every control the popover renders names an action a host implements, and
  // an action that carries a replacement carries the value with it.
  for (const html of [review, reword, renderIssuePopover(spellingIssue, { canAddToDictionary: true })]) {
    const actions = [...html.matchAll(/data-action="([^"]+)"/g)].map((match) => match[1]);
    assert.ok(actions.length > 0);
    for (const action of actions) assert.ok(['apply', 'ignore', 'dictionary'].includes(action), `unhandled action: ${action}`);
    for (const button of html.match(/<button[^>]*data-action="apply"[^>]*>/g) || []) {
      assert.match(button, /data-value="[^"]+"/, 'an apply control must name the replacement it applies');
    }
  }
});

test('an explanation-only finding renders no apply control at all', () => {
  const html = renderIssuePopover({
    id: 'issue-5', category: 'grammar', source: 'quality', severity: 'low',
    message: 'This passage may be unclear.', matchedText: 'it', actionability: 'explanation-only',
  });
  assert.doesNotMatch(html, /data-action="apply"/);
  assert.match(html, /data-action="ignore"/);
});
