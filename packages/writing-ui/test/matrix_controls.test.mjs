import assert from 'node:assert/strict';
import test from 'node:test';
import {
  renderSelectionPopover,
  normalizeSelectionState,
} from '../dist/selection_popover.js';
import {
  renderWritingRulesCard,
  renderStyleGuideCard,
  renderSettingsGroup,
  renderSettingsGroups,
  renderServiceHealth,
} from '../dist/settings.js';
import {
  renderModePicker,
  normalizeModePickerState,
  FOCUS_DURATIONS,
} from '../dist/mode_picker.js';
import {
  renderIndicatorPopover,
  normalizeIndicatorPopoverState,
} from '../dist/indicator_popover.js';

// ---------------------------------------------------------------------------
// Matrix 1: Selection Popover Combinations
// ---------------------------------------------------------------------------
test('Matrix Test 1: Selection Popover handles all status, count, and synonym variations', () => {
  const statuses = ['checking', 'ready', 'paused', 'off', 'unavailable', 'too-large', 'bogus-status'];
  const wordsList = [0, 1, 42, -5, NaN, Infinity];
  const charsList = [0, 1, 250, -10, NaN, Infinity];
  const issuesList = [undefined, 0, 1, 15, -2];
  const textList = [undefined, '', '  ', 'Short selection', 'Very long selection text '.repeat(10), '<script>alert("xss")</script>', 'Emoji 🚀'];
  const synonymsList = [
    undefined,
    [],
    ['crucial', 'vital'],
    ['<b-tag>', 'word2', 'word3', 'word4', 'word5', 'word6', 'word7'],
  ];

  let combinationsTested = 0;
  for (const status of statuses) {
    for (const words of wordsList) {
      for (const characters of charsList) {
        for (const issues of issuesList) {
          for (const text of textList) {
            for (const synonyms of synonymsList) {
              combinationsTested++;

              const rawState = { status, words, characters, issues, text, synonyms };
              const normalized = normalizeSelectionState(rawState);

              // Assert normalization guarantees
              assert.ok(['checking', 'ready', 'paused', 'off', 'unavailable', 'too-large'].includes(normalized.status));
              assert.ok(Number.isFinite(normalized.words) && normalized.words >= 0);
              assert.ok(Number.isFinite(normalized.characters) && normalized.characters >= 0);
              if (normalized.issues !== undefined) {
                assert.ok(Number.isFinite(normalized.issues) && normalized.issues >= 0);
              }

              const html = renderSelectionPopover(rawState);
              assert.equal(typeof html, 'string');
              assert.ok(html.startsWith('<section'));
              assert.ok(html.endsWith('</section>'));

              // XSS protection assertion: raw script tag should never be unescaped
              assert.ok(!html.includes('<script>'));

              if (Array.isArray(synonyms) && synonyms.length > 0) {
                if (synonyms.includes('<b-tag>')) {
                  assert.ok(html.includes('&lt;b-tag&gt;'));
                }
              }
            }
          }
        }
      }
    }
  }

  assert.ok(combinationsTested > 1000, `Tested ${combinationsTested} selection popover combinations`);
});

// ---------------------------------------------------------------------------
// Matrix 2: Writing Rules Card Combinations
// ---------------------------------------------------------------------------
function escapeHTML(value) {
  return String(value).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]);
}

test('Matrix Test 2: Writing Rules Card handles arbitrary rule lists, categories, and toggles', () => {
  const ruleInputs = [
    [],
    null,
    undefined,
    [
      { id: 'oxford-comma', name: 'Oxford Comma', description: 'Enforce Oxford comma', category: 'Punctuation', enabled: true },
    ],
    [
      { id: 'oxford-comma', name: 'Oxford Comma', description: 'Enforce Oxford comma', category: 'Punctuation', enabled: false },
      { id: 'passive-voice', name: 'Passive Voice', description: 'Flag passive voice', category: 'Style', enabled: true },
      { id: 'cliches-jargon', name: 'Cliches', description: 'Flag cliches', category: 'Style', enabled: false },
    ],
    [
      { id: '<xss-id>', name: '<script>name</script>', description: 'Desc & more', category: '<b>Category</b>', enabled: true },
    ],
  ];

  for (const rules of ruleInputs) {
    const html = renderWritingRulesCard(rules);
    assert.equal(typeof html, 'string');

    if (!rules || rules.length === 0) {
      assert.match(html, /No rules configured/);
    } else {
      assert.ok(html.includes('writing-rules'));
      for (const rule of rules) {
        assert.ok(!html.includes('<script>name</script>'));
        if (rule.enabled) {
          assert.match(html, new RegExp(`data-rule-id="${escapeHTML(rule.id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*checked`));
        }
      }
    }
  }
});

// ---------------------------------------------------------------------------
// Matrix 3: Mode Picker Combinations
// ---------------------------------------------------------------------------
test('Matrix Test 3: Mode Picker handles all mode states, durations, and deadlines', () => {
  const modes = ['active', 'paused', 'zen', 'invalid-mode'];
  const durations = ['15m', '30m', '1h', '2h', 'today', 'forever', 'bogus-duration'];
  const untils = [undefined, '', 'until 15:30', '<script>alert(1)</script>'];

  for (const mode of modes) {
    for (const duration of durations) {
      for (const until of untils) {
        const state = { mode, duration, until };
        const normalized = normalizeModePickerState(state);

        assert.ok(['active', 'paused', 'zen'].includes(normalized.mode));
        assert.equal(typeof normalized.duration, 'string');

        const html = renderModePicker(state);
        assert.equal(typeof html, 'string');
        assert.ok(!html.includes('<script>'));

        if (until === 'until 15:30' && (mode === 'paused' || mode === 'zen')) {
          assert.match(html, /until 15:30/);
        }
      }
    }
  }
});

// ---------------------------------------------------------------------------
// Matrix 4: Indicator Popover Combinations
// ---------------------------------------------------------------------------
test('Matrix Test 4: Indicator Popover handles all indicator statuses and issue lists', () => {
  const statuses = ['checking', 'ready', 'issues', 'paused', 'off', 'unavailable', 'degraded'];
  const issueCounts = [0, 1, 5, -1, NaN];
  const wordCounts = [0, 10, 1000];
  const charCounts = [0, 50, 5000];
  const issueLists = [
    undefined,
    [],
    [
      { id: 'i1', message: 'Test message 1', matchedText: 'word1', source: 'quality-sidecar', category: 'style' },
      { id: 'i2', message: 'Test message 2', matchedText: 'word2', source: 'LanguageTool', category: 'grammar' },
    ],
    [
      { id: '<xss>', message: '<script>alert(1)</script>', matchedText: 'bad', source: 'src' },
    ],
  ];

  for (const status of statuses) {
    for (const issueCount of issueCounts) {
      for (const words of wordCounts) {
        for (const characters of charCounts) {
          for (const issues of issueLists) {
            const raw = { status, issueCount, words, characters, issues };
            const normalized = normalizeIndicatorPopoverState(raw);

            assert.ok(Number.isFinite(normalized.issueCount) && normalized.issueCount >= 0);
            assert.ok(Number.isFinite(normalized.words) && normalized.words >= 0);
            assert.ok(Number.isFinite(normalized.characters) && normalized.characters >= 0);

            const html = renderIndicatorPopover(raw);
            assert.equal(typeof html, 'string');
            assert.ok(!html.includes('<script>alert(1)</script>'));
          }
        }
      }
    }
  }
});

// ---------------------------------------------------------------------------
// Matrix 5: Settings Groups & Accordion Matrix
// ---------------------------------------------------------------------------
test('Matrix Test 5: Settings Groups and Accordions render reliably across edge states', () => {
  const groupStates = [
    { id: 's1', title: 'Checking', description: 'Desc 1', summary: 'Automatic', intent: 'success', open: true },
    { id: 's2', title: 'Appearance', description: 'Desc 2', summary: 'Squiggles', intent: 'info', open: false },
    { id: 's3', title: 'Rules', description: 'Desc 3', summary: '5 active', intent: 'warning', open: true, body: '<div class="custom-body">Body</div>' },
    { id: 's4', title: '<script>Title</script>', description: 'XSS desc', summary: '<xss>', intent: 'danger', open: false },
  ];

  for (const item of groupStates) {
    const html = renderSettingsGroup(item);
    assert.equal(typeof html, 'string');
    assert.match(html, new RegExp(`data-group="${item.id}"`));
    assert.ok(!html.includes('<script>Title</script>'));
    if (item.open) {
      assert.match(html, /aria-expanded="true"/);
    } else {
      assert.match(html, /aria-expanded="false"/);
    }
  }

  const groupsList = [
    { heading: 'Writing', description: 'Category 1' },
    groupStates[0],
    groupStates[1],
    { heading: 'Integrations', description: 'Category 2' },
    groupStates[2],
    groupStates[3],
  ];

  const fullHTML = renderSettingsGroups(groupsList);
  assert.equal(typeof fullHTML, 'string');
  assert.match(fullHTML, /Writing/);
  assert.match(fullHTML, /Integrations/);
});

// ---------------------------------------------------------------------------
// Matrix 6: Service Health State Combinations
// ---------------------------------------------------------------------------
test('Matrix Test 6: Service Health cards handle all health states and service configurations', () => {
  const states = ['ready', 'starting', 'stopped', 'unavailable', 'invalid-state'];
  const managedList = [true, false, undefined];
  const endpoints = ['http://127.0.0.1:8098', undefined, '<script>'];

  for (const state of states) {
    for (const managed of managedList) {
      for (const endpoint of endpoints) {
        const services = [
          { name: 'LanguageTool Engine', state, detail: 'Grammar checker', endpoint, managed },
        ];

        const html = renderServiceHealth(services);
        assert.equal(typeof html, 'string');
        assert.ok(!html.includes('<script>'));
        assert.match(html, /LanguageTool Engine/);
      }
    }
  }
});
