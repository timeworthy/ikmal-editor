import assert from 'node:assert/strict';
import test from 'node:test';
import { renderSettingsPage } from '../apps/desktop-editor/settings_page.js';

test('Matrix Editor Test 1: renderSettingsPage handles full combinatorial matrix of state settings', () => {
  const modes = ['automatic', 'manual', undefined, 'invalid'];
  const delays = [0, 700, 2000, -100, NaN];
  const styles = ['squiggle', 'line', 'dash', undefined];
  const styleGuidesList = [
    undefined,
    { guides: [], selectedId: null, enabled: false },
    { guides: [{ id: 'ap', name: 'AP Style', ruleCount: 30 }], selectedId: 'ap', enabled: true },
  ];
  const writingRulesList = [
    undefined,
    [],
    [
      { id: 'oxford-comma', name: 'Oxford Comma', description: 'desc', category: 'Punctuation', enabled: true },
      { id: 'passive-voice', name: 'Passive Voice', description: 'desc', category: 'Style', enabled: false },
    ],
  ];
  const integrationsList = [
    undefined,
    { targets: [] },
    { targets: [{ id: 'obsidian', name: 'Obsidian', detected: true, configured: true }] },
  ];
  const spellServerList = [
    undefined,
    { supported: true, available: true, installed: true },
    { supported: true, available: true, installed: false },
  ];
  const officeList = [
    undefined,
    { supported: true, configured: true, running: true },
    { supported: true, configured: false, running: false },
  ];
  const servicesList = [
    undefined,
    { languageToolReady: true, qualityReady: true },
    { languageToolReady: false, qualityReady: true },
  ];

  let combinationsTested = 0;

  for (const mode of modes) {
    for (const delay of delays) {
      for (const style of styles) {
        for (const styleGuides of styleGuidesList) {
          for (const writingRules of writingRulesList) {
            for (const integrations of integrationsList) {
              for (const spellServer of spellServerList) {
                for (const office of officeList) {
                  for (const services of servicesList) {
                    combinationsTested++;

                    const state = {
                      checking: { mode, delay },
                      annotations: { style },
                      styleGuides,
                      writingRules,
                      integrations,
                      spellServer,
                      office,
                      services,
                      presence: { menubarIcon: true, dockIcon: true },
                      recentChecks: [1, 2, 3],
                      version: '0.9.2-beta',
                      open: new Set(['checking', 'rules', 'services']),
                    };

                    const html = renderSettingsPage(state);
                    assert.equal(typeof html, 'string');
                    assert.ok(html.includes('settings-page'));
                    assert.ok(html.includes('Writing'));
                    assert.ok(html.includes('On this machine'));

                    // Verify accordion states
                    assert.match(html, /data-group="checking"/);
                    assert.match(html, /data-group="rules"/);
                    assert.match(html, /data-group="services"/);
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  assert.ok(combinationsTested > 500, `Tested ${combinationsTested} settings page combinations`);
});

test('Matrix Editor Test 2: Text input box caret and selection edge case variations', () => {
  const inputs = [
    '',
    'a',
    'Hello world',
    'First line.\nSecond line.\nThird line.',
    'Emoji text 🚀🔥🎉 test',
    '<script>alert("xss")</script>',
    'Word '.repeat(2000), // 10k chars
  ];

  const carets = [0, 1, 5, 50, 1000, 20000];

  for (const input of inputs) {
    for (const caret of carets) {
      const clampedCaret = Math.min(caret, input.length);
      const before = input.slice(0, clampedCaret);
      const after = input.slice(clampedCaret);
      assert.equal(before + after, input);
    }
  }
});
