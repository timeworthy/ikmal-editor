// Focus modes are presets over settings that already exist, so the risk is not
// that the arithmetic is wrong — it is that the three copies drift, and a mode
// starts meaning something different in the browser than in the app. Every
// assertion below runs against all three implementations.

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import * as browser from '../extension/core/focus_mode.js';

const require = createRequire(import.meta.url);
const shared = require('../extension/core/focus_mode.cjs');
const vscode = require('../vscode-extension/focus_mode.cjs');

const implementations = [['browser', browser], ['shared cjs', shared], ['vscode', vscode]];

function forEachImplementation(assertion) {
  for (const [name, api] of implementations) {
    try {
      assertion(api);
    } catch (error) {
      error.message = `[${name}] ${error.message}`;
      throw error;
    }
  }
}

const NOW = 1_700_000_000_000;
const PREFERENCES = {
  mode: 'automatic',
  delay: 700,
  sensitivity: 55,
  categories: { grammar: true, repetition: true, style: true, languagetool: true },
};

test('active leaves the user settings exactly as they are', () => {
  forEachImplementation((api) => {
    const applied = api.applyFocusState(PREFERENCES, { mode: 'active' }, NOW);
    assert.deepEqual(applied, PREFERENCES);
  });
});

test('paused means manual, and changes nothing else', () => {
  forEachImplementation((api) => {
    const applied = api.applyFocusState(PREFERENCES, { mode: 'paused', until: null }, NOW);
    assert.equal(applied.mode, 'manual');
    assert.equal(applied.sensitivity, PREFERENCES.sensitivity);
    assert.deepEqual(applied.categories, PREFERENCES.categories);
  });
});

// Zen must not stop checking. The point is fewer, more confident findings —
// if it silently turned checking off it would be a second Pause.
test('zen keeps checking but drops to the strictest sensitivity', () => {
  forEachImplementation((api) => {
    const applied = api.applyFocusState(PREFERENCES, { mode: 'zen', until: null }, NOW);
    assert.equal(applied.mode, 'automatic', 'zen must not stop automatic checking');
    assert.equal(applied.sensitivity, api.ZEN_SENSITIVITY);
    assert.equal(applied.sensitivity, 0);
    assert.equal(applied.categories.style, false);
    assert.equal(applied.categories.repetition, false);
    assert.equal(applied.categories.grammar, true, 'zen must not silence grammar');
  });
});

test('applying a mode never mutates the caller preferences', () => {
  forEachImplementation((api) => {
    const original = structuredClone(PREFERENCES);
    api.applyFocusState(PREFERENCES, { mode: 'zen', until: null }, NOW);
    assert.deepEqual(PREFERENCES, original);
  });
});

test('an expired timer reads as active without anything having to fire', () => {
  forEachImplementation((api) => {
    const expired = { mode: 'paused', until: NOW - 1 };
    assert.equal(api.resolveFocusState(expired, NOW).mode, 'active');
    assert.equal(api.applyFocusState(PREFERENCES, expired, NOW).mode, 'automatic');
    assert.equal(api.focusRemaining(expired, NOW), null);
  });
});

test('a live timer keeps the mode until its deadline', () => {
  forEachImplementation((api) => {
    const live = { mode: 'zen', until: NOW + 60_000 };
    assert.equal(api.resolveFocusState(live, NOW).mode, 'zen');
    assert.equal(api.focusRemaining(live, NOW), 60_000);
    // The boundary belongs to active: at the deadline the mode is over.
    assert.equal(api.resolveFocusState(live, NOW + 60_000).mode, 'active');
  });
});

test('starting a mode records an absolute deadline, or none', () => {
  forEachImplementation((api) => {
    assert.deepEqual(api.startFocusState('paused', '15m', NOW), { mode: 'paused', until: NOW + 900_000 });
    assert.deepEqual(api.startFocusState('zen', 'until-off', NOW), { mode: 'zen', until: null });
    assert.deepEqual(api.startFocusState('active', '15m', NOW), { mode: 'active', until: null });
    // An unknown duration must not become an immediate expiry.
    assert.equal(api.startFocusState('paused', 'nonsense', NOW).until, null);
  });
});

// Stored state is attacker-free but not shape-free: it survives upgrades and
// hand edits. Anything unrecognisable must read as checking, because a user who
// wanted silence can ask again, while one who silently stopped being checked
// has no way to notice.
test('unrecognisable stored state reads as active', () => {
  forEachImplementation((api) => {
    for (const value of [null, undefined, 'paused', 42, { mode: 'sleep' }, { mode: null }]) {
      assert.equal(api.normalizeFocusState(value).mode, 'active', `for ${JSON.stringify(value)}`);
    }
    assert.equal(api.normalizeFocusState({ mode: 'paused', until: 'soon' }).until, null);
    assert.equal(api.normalizeFocusState({ mode: 'paused', until: -5 }).until, null);
    // An expiry on active is meaningless and must not be carried.
    assert.equal(api.normalizeFocusState({ mode: 'active', until: NOW + 1000 }).until, null);
  });
});

test('every implementation offers the same durations', () => {
  const reference = browser.FOCUS_DURATIONS.map((entry) => `${entry.id}:${entry.label}:${entry.ms}`);
  forEachImplementation((api) => {
    assert.deepEqual(api.FOCUS_DURATIONS.map((entry) => `${entry.id}:${entry.label}:${entry.ms}`), reference);
    assert.deepEqual(api.FOCUS_MODES, ['active', 'paused', 'zen']);
  });
});

test('descriptions say which mode is on and how long is left', () => {
  forEachImplementation((api) => {
    assert.equal(api.describeFocusState({ mode: 'active' }, NOW), 'Checking');
    assert.equal(api.describeFocusState({ mode: 'paused', until: null }, NOW), 'Paused');
    assert.equal(api.describeFocusState({ mode: 'paused', until: NOW + 60_000 }, NOW), 'Paused 1m');
    assert.equal(api.describeFocusState({ mode: 'zen', until: NOW + 3_600_000 }, NOW), 'Zen 1h');
    assert.equal(api.describeFocusState({ mode: 'zen', until: NOW + 5_400_000 }, NOW), 'Zen 1h 30m');
    assert.equal(api.describeFocusState({ mode: 'paused', until: NOW - 1 }, NOW), 'Checking');
  });
});

// --- filtering results ---------------------------------------------------

const GRAMMAR = { message: 'Plural subject.', rule: { id: 'BE_PLURAL', category: { id: 'GRAMMAR' } }, ikmalConfidence: 0.98 };
const STYLE = { message: 'Wordy.', rule: { id: 'IKMAL_STYLE', category: { id: 'STYLE' } }, ikmalSource: 'style', ikmalConfidence: 0.75 };
const REPETITION = { message: 'Repeated.', rule: { id: 'IKMAL_REPETITION', category: { id: 'STYLE' } }, ikmalConfidence: 0.95 };
const UNSCORED = { message: 'From LanguageTool.', rule: { id: 'UPPERCASE_SENTENCE_START', category: { id: 'CASING' } } };

test('categories match the buckets the checking settings use', () => {
  forEachImplementation((api) => {
    assert.equal(api.matchCategory(GRAMMAR), 'grammar');
    assert.equal(api.matchCategory(STYLE), 'style');
    assert.equal(api.matchCategory(REPETITION), 'repetition');
    assert.equal(api.matchCategory(UNSCORED), 'languagetool');
    assert.equal(api.matchCategory(null), 'languagetool');
  });
});

test('zen narrows the findings the other modes let through', () => {
  forEachImplementation((api) => {
    const all = [GRAMMAR, STYLE, REPETITION, UNSCORED];
    const active = api.filterMatches(all, api.applyFocusState(PREFERENCES, { mode: 'active' }, NOW));
    const zen = api.filterMatches(all, api.applyFocusState(PREFERENCES, { mode: 'zen' }, NOW));
    assert.equal(active.length, 4, 'active must not drop anything at default sensitivity');
    assert.ok(zen.length < active.length, 'zen must narrow the results');
    assert.ok(zen.includes(GRAMMAR), 'zen keeps a confident grammar finding');
    assert.ok(!zen.includes(STYLE), 'zen silences style');
    assert.ok(!zen.includes(REPETITION), 'zen silences repetition');
  });
});

// A finding with no confidence score is not a weak finding — plain
// LanguageTool matches carry none, and dropping them in Zen would silence the
// grammar checking that Zen is supposed to keep.
test('an unscored finding survives even the strictest sensitivity', () => {
  forEachImplementation((api) => {
    const zen = api.filterMatches([UNSCORED], api.applyFocusState(PREFERENCES, { mode: 'zen' }, NOW));
    assert.deepEqual(zen, [UNSCORED]);
  });
});

test('the confidence curve matches the desktop threshold', () => {
  forEachImplementation((api) => {
    assert.equal(api.confidenceThreshold(0), 0.9);
    assert.ok(Math.abs(api.confidenceThreshold(55) - 0.68) < 1e-9);
    assert.ok(Math.abs(api.confidenceThreshold(100) - 0.5) < 1e-9);
    // Out-of-range and nonsense values fall back to the default, never to NaN.
    assert.equal(api.confidenceThreshold(-10), 0.9);
    assert.ok(Math.abs(api.confidenceThreshold('nope') - 0.68) < 1e-9);
  });
});

test('filtering tolerates anything that is not an array', () => {
  forEachImplementation((api) => {
    for (const value of [null, undefined, 'matches', 7, {}]) {
      assert.deepEqual(api.filterMatches(value, PREFERENCES), []);
    }
  });
});
