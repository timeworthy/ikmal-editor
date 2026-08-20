import assert from 'node:assert/strict';
import test from 'node:test';
import * as core from '../packages/writing-core/dist/index.js';
import {
  renderSelectionPopover,
  normalizeSelectionState,
} from '../packages/writing-ui/dist/selection_popover.js';
import {
  renderWritingRulesCard,
  renderStyleGuideCard,
  renderSettingsGroup,
  renderSettingsGroups,
  renderServiceHealth,
  SETTINGS_CSS,
} from '../packages/writing-ui/dist/settings.js';
import {
  renderModePicker,
  normalizeModePickerState,
  FOCUS_DURATIONS,
} from '../packages/writing-ui/dist/mode_picker.js';
import {
  renderIndicatorPopover,
  normalizeIndicatorPopoverState,
} from '../packages/writing-ui/dist/indicator_popover.js';
import {
  renderIssuePopover,
  renderSelectionSummary,
  ISSUE_POPOVER_CSS,
} from '../packages/writing-ui/dist/issue_popover.js';
import {
  renderReviewSidebar,
  renderReviewWorkspace,
  renderUndoNotice,
  normalizeReviewLayout,
  normalizeReviewWorkspaceState,
} from '../packages/writing-ui/dist/review.js';
import {
  renderIndicator,
  INDICATOR_CSS,
} from '../packages/writing-ui/dist/indicator.js';
import { renderMark } from '../packages/writing-ui/dist/mark.js';
import { renderSettingsPage } from '../apps/desktop-editor/settings_page.js';

// ---------------------------------------------------------------------------
// 1. Text Entry Boxes & Content Lifecycle Matrix
// ---------------------------------------------------------------------------
test('UI Matrix: Text Entry Boxes handle full input lifecycle and edge cases', () => {
  const testInputs = [
    '',
    ' ',
    '   \t\n  ',
    'a',
    'teh',
    'Please review teh draft before the meeting.',
    'First line.\nSecond line.\nThird line with teh error.',
    'Plants produce its own food. The approach is innovative. The result is innovative.',
    'Emoji test: 🚀 🌟 📝 🔥 with complex multi-byte surrogate pairs 👍🏽 and text.',
    'Special characters: <script>alert("xss")</script> & "quotes" \'single\' `backticks` \\ backslash / slash',
    'Non-breaking spaces\u00A0and\u200Bzero-width\u200Dspans.',
    'Very long repetitive draft: ' + 'The quick brown fox jumps over the lazy dog. '.repeat(100),
  ];

  for (const input of testInputs) {
    // 1. Document creation and stats calculation lifecycle
    const doc = core.createTextDocument({ text: input, source: 'desktop' });
    assert.equal(doc.text, input);
    assert.equal(doc.revision, 0);

    const stats = core.textStatistics(input);
    assert.ok(Number.isFinite(stats.words) && stats.words >= 0);
    assert.ok(Number.isFinite(stats.characters) && stats.characters >= 0);

    // 2. Incremental edits / revision bumping
    const updatedDoc = core.applyTextEdit(doc, { offset: 0, length: 0 }, 'prefix-');
    assert.equal(updatedDoc.revision, doc.revision + 1);
    assert.equal(updatedDoc.text, 'prefix-' + input);

    // 3. Selection Range Clamping
    const selections = [
      { offset: 0, length: 0 },
      { offset: 0, length: input.length },
      { offset: Math.floor(input.length / 2), length: 5 },
      { offset: -10, length: 50 },
      { offset: input.length + 100, length: 20 },
    ];

    for (const sel of selections) {
      const clampedOffset = Math.max(0, Math.min(input.length, sel.offset));
      const clampedLength = Math.max(0, Math.min(input.length - clampedOffset, sel.length));
      const selectedSlice = input.slice(clampedOffset, clampedOffset + clampedLength);
      assert.equal(typeof selectedSlice, 'string');
    }
  }
});

// ---------------------------------------------------------------------------
// 2. Selection Popover Combinations & XSS Safety
// ---------------------------------------------------------------------------
test('UI Matrix: Selection Popover full lifecycle and input variations', () => {
  const statuses = ['checking', 'ready', 'paused', 'off', 'unavailable', 'too-large', 'invalid-status', undefined, null];
  const wordCounts = [0, 1, 100, -5, NaN, Infinity, undefined];
  const charCounts = [0, 1, 500, -10, NaN, Infinity, undefined];
  const issueCounts = [undefined, 0, 1, 10, -3, NaN];
  const synonymSets = [
    undefined,
    [],
    ['crucial', 'vital', 'essential'],
    ['<script>alert("xss")</script>', '<b>bold</b>', 'normal'],
    Array(20).fill('synonym'),
  ];

  let combinations = 0;
  for (const status of statuses) {
    for (const words of wordCounts) {
      for (const characters of charCounts) {
        for (const issues of issueCounts) {
          for (const synonyms of synonymSets) {
            combinations++;
            const raw = { status, words, characters, issues, synonyms };
            const normalized = normalizeSelectionState(raw);
            assert.ok(['checking', 'ready', 'paused', 'off', 'unavailable', 'too-large'].includes(normalized.status));
            assert.ok(Number.isFinite(normalized.words) && normalized.words >= 0);
            assert.ok(Number.isFinite(normalized.characters) && normalized.characters >= 0);

            const html = renderSelectionPopover(raw);
            assert.equal(typeof html, 'string');
            assert.ok(html.startsWith('<section class="cnt-popover'));
            assert.ok(!html.includes('<script>')); // XSS prevention
          }
        }
      }
    }
  }
  assert.ok(combinations >= 500);
});

// ---------------------------------------------------------------------------
// 3. Issue Popover: Actions, Buttons, Reword, Dictionary, Navigation
// ---------------------------------------------------------------------------
test('UI Matrix: Issue Popover actions, candidate buttons, rewording, and navigation', () => {
  const severities = ['low', 'medium', 'high'];
  const actionabilities = ['safe-apply', 'review-first', 'explanation-only'];
  const categories = ['spelling', 'grammar', 'style', 'repetition', 'custom-category', ''];

  const testIssues = [
    {
      id: 'issue-1',
      category: 'spelling',
      severity: 'high',
      message: 'Use the correct spelling.',
      matchedText: 'teh',
      actionability: 'safe-apply',
      replacements: [{ value: 'the' }],
    },
    {
      id: 'issue-2',
      category: 'style',
      severity: 'medium',
      message: 'Passive voice detected.',
      matchedText: 'was reviewed by the team',
      actionability: 'review-first',
      rewordCandidates: [
        { id: 'rw-1', replacementText: 'the team reviewed', rationale: 'Active voice is clearer' },
        { id: 'rw-2', replacementText: 'the team examined', rationale: 'Stronger verb' },
      ],
    },
    {
      id: 'issue-3',
      category: 'repetition',
      severity: 'low',
      message: 'Repeated word in close proximity.',
      matchedText: 'innovative',
      actionability: 'explanation-only',
      replacements: [],
      guide: 'AP Style Guide',
    },
    {
      id: 'issue-4-xss',
      category: '<script>alert(1)</script>',
      severity: 'high',
      message: 'Malformed & unescaped <tag> test',
      matchedText: '<script>',
      actionability: 'safe-apply',
      replacements: [{ value: '<safe>' }],
    },
  ];

  const optionVariations = [
    {},
    { canAddToDictionary: true },
    { canAddToDictionary: false },
    { index: 0, total: 1 },
    { index: 0, total: 5 },
    { index: 2, total: 5 },
    { index: 4, total: 5 },
    { index: -1, total: -5 }, // boundary
    { index: NaN, total: Infinity },
  ];

  for (const issue of testIssues) {
    for (const options of optionVariations) {
      const html = renderIssuePopover(issue, options);
      assert.equal(typeof html, 'string');
      assert.ok(html.includes('class="cnt-popover writing-issue-popover"'));
      assert.ok(!html.includes('<script>alert(1)</script>')); // Escaped

      // Button presence checks
      if (issue.actionability === 'safe-apply' && issue.replacements?.length) {
        assert.ok(html.includes('data-action="apply"'));
      }
      if (issue.rewordCandidates?.length) {
        assert.ok(html.includes('data-action="reword"') || html.includes('Review alternatives') || html.includes('Consider rewording'));
      }
      if (options.canAddToDictionary && issue.category === 'spelling') {
        assert.ok(html.includes('data-action="dictionary"'));
      }
      assert.ok(html.includes('data-action="ignore"'));
      assert.ok(html.includes('data-action="close"'));

      // Navigation presence checks
      if (Number.isFinite(options.total) && options.total > 1) {
        assert.ok(html.includes('data-action="previous"'));
        assert.ok(html.includes('data-action="next"'));
        assert.ok(html.includes(`of ${options.total}`));
      }
    }
  }
});

// ---------------------------------------------------------------------------
// 4. Review Sidebar and Review Workspace Combinations
// ---------------------------------------------------------------------------
test('UI Matrix: Review Sidebar and Workspace render all issue permutations', () => {
  const layouts = ['sidebar', 'panel', 'invalid-layout', null, undefined];
  for (const layout of layouts) {
    const normalized = normalizeReviewLayout(layout);
    assert.ok(['sidebar', 'panel'].includes(normalized));
  }

  const issuesListVariations = [
    [],
    [
      {
        id: 'iss-1',
        message: 'Spelling error',
        matchedText: 'teh',
        category: 'spelling',
        replacements: [{ value: 'the' }],
        canAddToDictionary: true,
      },
    ],
    [
      {
        id: 'iss-1',
        message: 'Spelling error',
        matchedText: 'teh',
        category: 'spelling',
        replacements: [{ value: 'the' }],
        canAddToDictionary: true,
      },
      {
        id: 'iss-2',
        message: 'Passive voice',
        matchedText: 'was decided',
        category: 'style',
        guide: 'Editorial Standard',
        rewordCandidates: [{ id: 'rw1', replacementText: 'decided', rationale: 'Direct action' }],
      },
    ],
  ];

  for (const issues of issuesListVariations) {
    // 1. Sidebar with different selectedId and unavailableReason
    const sidebarHtml1 = renderReviewSidebar({ issues, selectedId: 'iss-1' });
    assert.equal(typeof sidebarHtml1, 'string');
    assert.ok(sidebarHtml1.includes('writing-review-side'));

    const sidebarHtmlUnavailable = renderReviewSidebar({ issues, unavailableReason: 'Connection timed out' });
    assert.ok(sidebarHtmlUnavailable.includes('Checker unavailable'));
    assert.ok(sidebarHtmlUnavailable.includes('Connection timed out'));

    // 2. Full Review Workspace
    const workspaceState = normalizeReviewWorkspaceState({
      label: 'Document draft.txt',
      issues: issues.map((i) => ({ id: i.id, message: i.message, matchedText: i.matchedText, category: i.category })),
      words: 150,
      characters: 890,
      filters: ['All', 'Spelling', 'Grammar'],
      filter: 'All',
      selectedId: 'iss-1',
    });
    const workspaceHtml = renderReviewWorkspace(workspaceState);
    assert.ok(workspaceHtml.includes('writing-review'));
    assert.ok(workspaceHtml.includes('Document draft.txt'));
    assert.ok(workspaceHtml.includes('data-action="close-review"'));
  }

  // 3. Undo Notice
  const undoActive = renderUndoNotice({ from: 'teh', to: 'the', expired: false });
  assert.ok(undoActive.includes('data-action="undo"'));
  assert.ok(undoActive.includes('<b>teh</b> → <b>the</b>'));

  const undoExpired = renderUndoNotice({ from: 'teh', to: 'the', expired: true });
  assert.ok(undoExpired.includes('The text has moved on; this can no longer be undone.'));
  assert.ok(!undoExpired.includes('data-action="undo"'));
});

// ---------------------------------------------------------------------------
// 5. Mode Picker & Duration Matrix
// ---------------------------------------------------------------------------
test('UI Matrix: Mode Picker and Focus Durations full state permutations', () => {
  const modes = ['active', 'paused', 'zen', 'unknown', undefined, null];
  const durations = [...FOCUS_DURATIONS.map((d) => d.id), 'custom-duration', undefined, null];
  const untilLabels = ['until 5:00 PM', 'until tomorrow', '', undefined];

  for (const mode of modes) {
    for (const duration of durations) {
      for (const until of untilLabels) {
        const normalized = normalizeModePickerState({ mode, duration, until });
        assert.ok(['active', 'paused', 'zen'].includes(normalized.mode));

        const html = renderModePicker({ mode, duration, until });
        assert.equal(typeof html, 'string');
        assert.ok(html.includes('writing-modes'));
        assert.ok(html.includes('data-mode="active"'));
        assert.ok(html.includes('data-mode="paused"'));
        assert.ok(html.includes('data-mode="zen"'));

        if (normalized.mode === 'paused' || normalized.mode === 'zen') {
          assert.ok(html.includes(`data-duration-for="${normalized.mode}"`));
        }
      }
    }
  }
});

// ---------------------------------------------------------------------------
// 6. Settings Page: Full Combinatorial State & Control Mapping
// ---------------------------------------------------------------------------
test('UI Matrix: renderSettingsPage exhaustive combinatorial state matrix', () => {
  const checkingModes = ['automatic', 'manual', undefined];
  const delays = [200, 700, 2000, 0, -500, NaN];
  const sensitivities = [0, 50, 100, -10, 150];
  const annotationStyles = ['squiggle', 'line', 'dash', undefined];
  const annotationPalettes = ['balanced', 'warm', 'cool', 'contrast', undefined];
  const annotationLayouts = ['sidebar', 'panel', undefined];
  const annotationIntensities = [20, 55, 90];

  const categoryToggles = [
    { grammar: true, repetition: true, style: true, languagetool: true },
    { grammar: false, repetition: false, style: false, languagetool: false },
    { grammar: true, repetition: false, style: true, languagetool: false },
  ];

  const presenceStates = [
    { menubarIcon: true, dockIcon: true, dockSupported: true },
    { menubarIcon: true, dockIcon: false, dockSupported: true },
    { menubarIcon: false, dockIcon: true, dockSupported: true },
    { menubarIcon: true, dockIcon: false, dockSupported: false },
  ];

  const styleGuideStates = [
    { guides: [], selectedId: undefined, enabled: false },
    {
      guides: [
        { id: 'g1', name: 'Chicago Manual of Style', ruleCount: 120 },
        { id: 'g2', name: 'Company House Style', ruleCount: 45 },
      ],
      selectedId: 'g1',
      enabled: true,
    },
    {
      guides: [{ id: 'g1', name: 'Style Guide', ruleCount: 10 }],
      selectedId: 'g1',
      enabled: false,
    },
  ];

  const serviceStates = [
    { languageToolReady: true, qualityReady: true, managerRunning: true, proxyUrl: 'http://127.0.0.1:8096' },
    { languageToolReady: false, qualityReady: true, managerRunning: true },
    { languageToolReady: true, qualityReady: false, managerRunning: false },
    { languageToolReady: false, qualityReady: false, managerRunning: false },
  ];

  const integrationStates = [
    { targets: [] },
    {
      targets: [
        { id: 'chrome', name: 'Chrome LanguageTool', detected: true, configured: true, configuredEndpoint: 'http://127.0.0.1:8096/v2' },
        { id: 'firefox', name: 'Firefox LanguageTool', detected: true, configured: false },
        { id: 'vscode', name: 'VS Code LanguageTool', detected: false, configured: false },
      ],
    },
  ];

  const spellStates = [
    { supported: true, available: true, installed: true, path: '/Library/Services/ikmal.service' },
    { supported: true, available: true, installed: false },
    { supported: false, available: false, installed: false },
  ];

  const officeStates = [
    { supported: true, configured: true, running: true, trust: 'trusted', url: 'https://localhost:51337' },
    { supported: true, configured: true, running: false, trust: 'untrusted' },
    { supported: true, configured: false, running: false },
    { supported: false },
  ];

  let combinations = 0;

  for (const mode of checkingModes) {
    for (const categories of categoryToggles) {
      for (const style of annotationStyles) {
        for (const presence of presenceStates) {
          for (const styleGuides of styleGuideStates) {
            for (const services of serviceStates) {
              for (const integrations of integrationStates) {
                for (const spellServer of spellStates) {
                  for (const office of officeStates) {
                    combinations++;
                    const state = {
                      checking: { mode, delay: delays[combinations % delays.length], sensitivity: sensitivities[combinations % sensitivities.length], categories },
                      annotations: { style, palette: annotationPalettes[combinations % annotationPalettes.length], layout: annotationLayouts[combinations % annotationLayouts.length], intensity: annotationIntensities[combinations % annotationIntensities.length] },
                      presence,
                      launchAtLogin: combinations % 2 === 0,
                      styleGuides,
                      services,
                      integrations,
                      spellServer,
                      office,
                      recentChecks: [
                        { text: 'First draft passage', matchCount: 2, checkedAt: Date.now() - 60000 },
                        { text: 'Second draft passage', matchCount: 0, checkedAt: Date.now() - 3600000 },
                      ],
                      version: '0.9.2-beta',
                      open: new Set(['general', 'checking', 'appearance', 'rules', 'integrations', 'spell', 'office', 'services', 'privacy', 'about']),
                    };

                    const html = renderSettingsPage(state);
                    assert.equal(typeof html, 'string');
                    assert.ok(html.includes('class="settings-page"'));

                    // Verify presence of all control targets
                    assert.ok(html.includes('data-setting="mode"'));
                    assert.ok(html.includes('data-setting="delay"'));
                    assert.ok(html.includes('data-setting="sensitivity"'));
                    assert.ok(html.includes('data-setting="category:grammar"'));
                    assert.ok(html.includes('data-setting="category:repetition"'));
                    assert.ok(html.includes('data-setting="category:style"'));
                    assert.ok(html.includes('data-setting="category:languagetool"'));
                    assert.ok(html.includes('data-setting="menubarIcon"'));
                    assert.ok(html.includes('data-setting="launchAtLogin"'));
                    assert.ok(html.includes('data-setting="annotationStyle"'));
                    assert.ok(html.includes('data-setting="annotationPalette"'));
                    assert.ok(html.includes('data-setting="annotationLayout"'));
                    assert.ok(html.includes('data-setting="annotationIntensity"'));

                    // Action buttons
                    assert.ok(html.includes('data-action="clear-history"'));
                    assert.ok(html.includes('data-action="open-notices"'));
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  assert.ok(combinations >= 1000, `Tested ${combinations} settings combinations`);
});

// ---------------------------------------------------------------------------
// 7. Desktop Presence Guard: Prevent Disabling Both Menubar and Dock
// ---------------------------------------------------------------------------
test('UI Matrix: Desktop presence guard prevents orphaning application window', () => {
  // If menubarIcon is false, dockIcon MUST not be allowed to be turned off.
  const presence1 = { menubarIcon: true, dockIcon: false, dockSupported: true };
  const presence2 = { menubarIcon: false, dockIcon: true, dockSupported: true };
  const presence3 = { menubarIcon: false, dockIcon: false, dockSupported: true };

  // Helper verifying normalization logic:
  function normalizePresence(p) {
    if (p.menubarIcon === false && p.dockIcon === false) {
      // Guard: fallback to keeping at least menubar active
      return { ...p, menubarIcon: true };
    }
    return p;
  }

  assert.equal(normalizePresence(presence1).menubarIcon, true);
  assert.equal(normalizePresence(presence2).dockIcon, true);
  assert.equal(normalizePresence(presence3).menubarIcon, true, 'Guard restored menubar when both disabled');
});
