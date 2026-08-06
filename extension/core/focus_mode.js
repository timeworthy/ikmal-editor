// Focus modes: Pause and Zen.
//
// These are presets over the checking preferences a user already has, not a
// second set of switches. Two ways to say "do not check this" that can disagree
// with each other is a bug waiting to happen, so nothing here holds state of
// its own beyond the mode and its expiry:
//
//   active   the user's own settings are authoritative, unchanged
//   paused   nothing is checked until asked
//   zen      only the most confident findings; style and repetition go quiet
//
// Zen sets sensitivity to its minimum rather than turning checking off. The
// desktop threshold is 0.9 - (sensitivity / 100) * 0.4, so 0 is the strictest
// setting: the fewest, most confident findings. That is what "lightest" means
// here, and it is why Zen is a sensitivity change rather than a category one.
//
// Expiry is resolved when the state is read, never by a timer. A machine that
// slept through the deadline must come back active, and a callback scheduled
// before the sleep will not have fired.

export const FOCUS_MODES = ['active', 'paused', 'zen'];

// Offered durations. `ms: null` means it stays until switched back by hand.
export const FOCUS_DURATIONS = [
  { id: '15m', label: '15 minutes', ms: 15 * 60 * 1000 },
  { id: '1h', label: '1 hour', ms: 60 * 60 * 1000 },
  { id: '4h', label: '4 hours', ms: 4 * 60 * 60 * 1000 },
  { id: 'until-off', label: 'Until I turn it off', ms: null },
];

export const ZEN_SENSITIVITY = 0;

export function focusDuration(id) {
  return FOCUS_DURATIONS.find((duration) => duration.id === id) || null;
}

// normalizeFocusState accepts anything that has been through storage and
// returns a well-formed state. An unknown mode or a nonsense expiry reads as
// active: the safe direction is checking, since a user who wanted silence can
// ask again, while one who silently stopped being checked cannot tell.
export function normalizeFocusState(value) {
  const raw = value && typeof value === 'object' ? value : {};
  const mode = FOCUS_MODES.includes(raw.mode) ? raw.mode : 'active';
  const until = Number(raw.until);
  return {
    mode,
    until: mode !== 'active' && Number.isFinite(until) && until > 0 ? until : null,
  };
}

// resolveFocusState collapses an expired timer back to active. Callers should
// use this rather than reading the stored state directly.
export function resolveFocusState(value, now = Date.now()) {
  const state = normalizeFocusState(value);
  if (state.mode === 'active') return state;
  if (state.until !== null && now >= state.until) return { mode: 'active', until: null };
  return state;
}

export function startFocusState(mode, durationID, now = Date.now()) {
  if (!FOCUS_MODES.includes(mode) || mode === 'active') return { mode: 'active', until: null };
  const duration = focusDuration(durationID);
  return { mode, until: duration && duration.ms ? now + duration.ms : null };
}

// Milliseconds left, or null when the mode has no expiry or is not running.
export function focusRemaining(value, now = Date.now()) {
  const state = resolveFocusState(value, now);
  if (state.mode === 'active' || state.until === null) return null;
  return Math.max(0, state.until - now);
}

// applyFocusState maps a mode onto the canonical checking preferences:
//   { mode: 'automatic' | 'manual', delay, sensitivity, categories }
// Each surface expresses its own settings in these terms, so the presets mean
// the same thing in the app, the browser, and the editor adapters.
export function applyFocusState(preferences, value, now = Date.now()) {
  const base = preferences && typeof preferences === 'object' ? preferences : {};
  const categories = { ...(base.categories || {}) };
  const state = resolveFocusState(value, now);

  if (state.mode === 'paused') {
    // Manual is exactly what Pause means, and it is a setting that already
    // exists — reusing it keeps one answer to "is this checking right now".
    return { ...base, categories, mode: 'manual' };
  }
  if (state.mode === 'zen') {
    return {
      ...base,
      categories: { ...categories, style: false, repetition: false },
      sensitivity: ZEN_SENSITIVITY,
    };
  }
  return { ...base, categories };
}

// A short human label for the indicator and menus.
export function describeFocusState(value, now = Date.now()) {
  const state = resolveFocusState(value, now);
  if (state.mode === 'active') return 'Checking';
  const name = state.mode === 'paused' ? 'Paused' : 'Zen';
  const remaining = focusRemaining(state, now);
  if (remaining === null) return name;
  const minutes = Math.ceil(remaining / 60000);
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `${name} ${hours}h ${rest}m` : `${name} ${hours}h`;
  }
  return `${name} ${minutes}m`;
}

// --- applying a mode to results ------------------------------------------

// matchCategory classifies a finding into the same four buckets the desktop
// checking preferences use, so "style is off in Zen" means the same thing
// wherever a mode is applied.
export function matchCategory(match) {
  const value = match && typeof match === 'object' ? match : {};
  const source = String(value.ikmalSource || '').toLowerCase();
  const rule = String(value.rule?.id || '').toLowerCase();
  const description = String(value.rule?.description || value.rule?.category?.id || value.category || '').toLowerCase();
  if (rule.includes('repetition') || rule.includes('word-family') || rule.includes('echo')
    || description.includes('repetition') || description.includes('echo')) return 'repetition';
  if (source.includes('style') || rule.includes('style-guide') || description.includes('style')) return 'style';
  if (source.includes('quality') || description.includes('grammar') || description.includes('agreement')
    || rule.includes('pronoun') || rule.includes('verb')) return 'grammar';
  return 'languagetool';
}

// The same confidence curve the desktop uses: sensitivity 0 is the strictest
// threshold and 100 the most permissive.
export function confidenceThreshold(sensitivity) {
  const value = Number(sensitivity);
  const clamped = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 55;
  return 0.9 - (clamped / 100) * 0.4;
}

// filterMatches drops what the effective preferences silence. A finding with no
// stated confidence is kept: absence of a score is not evidence of a weak one.
export function filterMatches(matches, preferences) {
  if (!Array.isArray(matches)) return [];
  const effective = preferences && typeof preferences === 'object' ? preferences : {};
  const categories = effective.categories || {};
  const threshold = confidenceThreshold(effective.sensitivity);
  return matches.filter((match) => {
    if (categories[matchCategory(match)] === false) return false;
    const confidence = Number(match?.ikmalConfidence ?? match?.confidence);
    return !Number.isFinite(confidence) || confidence >= threshold;
  });
}
