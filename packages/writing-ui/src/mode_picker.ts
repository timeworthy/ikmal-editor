// Automatic, Pause, and Zen, with the durations the product has always offered.
//
// Composed from design-system primitives rather than restyled: the segmented
// control is `.cnt-segmented`, the duration list is `.cnt-menu`. A host that
// renders this inside a Shadow DOM must include tokens.css and primitives.css
// there, which is the pattern the browser extension already uses.
//
// The mode is semantic state owned by writing-core. This renders it and names
// the actions; it decides nothing.

export type FocusMode = 'active' | 'paused' | 'zen';

export interface FocusDuration {
  id: string;
  label: string;
}

export interface ModePickerState {
  mode: FocusMode;
  /** Human-readable expiry, when the mode has one. */
  until?: string;
  durations: FocusDuration[];
  /**
   * Which duration the running timed mode is under. Required on the normalized
   * state and optional only on the input, because normalizing always resolves
   * one — a mode with no duration is running indefinitely, which is a duration.
   */
  duration: string;
}

// The four durations are product behaviour, not a suggestion: every host offers
// the same set, and a host that offers fewer is reporting a reduced capability.
//
// The ids are writing-core's own. They were a parallel set here, and
// `until-off` against the core's `forever` only behaved correctly by accident:
// the core falls back to an indefinite mode for any id it does not recognise,
// which is what `forever` means, so the mismatch produced the right answer for
// the wrong reason and would not have for any other duration.
export const FOCUS_DURATIONS: FocusDuration[] = [
  { id: '15m', label: '15 minutes' },
  { id: '1h', label: '1 hour' },
  { id: '4h', label: '4 hours' },
  { id: 'forever', label: 'Until turned off' },
];

export const MODE_PICKER_CSS = `
.writing-modes { display: grid; gap: var(--space-2); }
.writing-modes-row { align-items: center; display: flex; gap: var(--space-3); justify-content: space-between; }
.writing-modes-until { color: var(--fg-4); font: 400 12px/1.3 var(--font-sans); }
/* The running timed mode carries its own duration control, so the segment it
   already occupies grows one rather than a second row appearing below. Nothing
   about duration exists while no timed mode is running. */
.writing-mode-timed { align-items: center; display: inline-flex; gap: var(--space-2); }
.writing-mode-picker { align-items: center; display: inline-flex; gap: 1px; }
.writing-mode-caret { font-size: 9px; opacity: 0.8; pointer-events: none; }
.writing-mode-duration {
  appearance: none;
  background: transparent;
  border: 0;
  border-radius: var(--radius-1);
  color: inherit;
  cursor: pointer;
  font: 500 12px/1 var(--font-sans);
  opacity: 0.85;
  padding: 2px var(--space-1);
}
/* The menu itself is painted by the platform, which does not inherit the
   segment's accent — so its own options need a readable surface of their own. */
.writing-mode-duration option { background: var(--bg-1); color: var(--fg-1); }
.writing-mode-duration:focus-visible { box-shadow: var(--shadow-focus); outline: 2px solid transparent; }
`;

const MODE_LABELS: Record<FocusMode, string> = { active: 'Automatic', paused: 'Pause', zen: 'Zen' };

function escapeHTML(value: string): string {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] as string));
}

export function normalizeModePickerState(value: Partial<ModePickerState> = {}): ModePickerState {
  const modes: FocusMode[] = ['active', 'paused', 'zen'];
  const mode = modes.includes(value.mode as FocusMode) ? value.mode as FocusMode : 'active';
  const durations = Array.isArray(value.durations) && value.durations.length
    ? value.durations.filter((duration) => duration && typeof duration.id === 'string' && typeof duration.label === 'string')
    : FOCUS_DURATIONS;
  // A mode entered without one runs indefinitely, which is what the shell does
  // with a duration it does not recognise — so the control shows what is
  // actually in force rather than a default it invented.
  const duration = durations.some((entry) => entry.id === value.duration) ? value.duration as string : 'forever';
  return { mode, durations, duration, ...(typeof value.until === 'string' && value.until ? { until: value.until } : {}) };
}

/**
 * Automatic, Pause, and Zen — and, only while a timed mode is running, how long
 * for.
 *
 * The duration used to be a list that dropped below the row on the way into a
 * mode, so choosing Pause took two clicks and the second one was the one that
 * paused anything. Here the first click pauses, and the segment it lands on
 * becomes the duration control. Nothing about duration is on screen while
 * nothing is timed.
 *
 * The container is a group of toggle buttons rather than a tablist: these
 * select a mode, not a panel, and a tab may not contain the select that the
 * running segment now carries.
 */
export function renderModePicker(state: Partial<ModePickerState> = {}): string {
  const value = normalizeModePickerState(state);
  const segments = (['active', 'paused', 'zen'] as FocusMode[]).map((mode) => {
    const selected = value.mode === mode;
    // Automatic is the absence of a timed mode, so it never carries a duration.
    if (!selected || mode === 'active') {
      return `<button class="cnt-tab" type="button" aria-pressed="${selected}" data-mode="${mode}">${MODE_LABELS[mode]}</button>`;
    }
    const options = value.durations.map((duration) =>
      `<option value="${escapeHTML(duration.id)}"${duration.id === value.duration ? ' selected' : ''}>${escapeHTML(duration.label)}</option>`).join('');
    // The caret is the affordance. `appearance: none` is what lets the control
    // sit inside the segment without the platform painting a second surface
    // there, and it takes the native arrow with it — leaving a duration that
    // reads as a label rather than something that can be changed.
    return `<span class="cnt-tab writing-mode-timed" data-selected="true" data-mode="${mode}">${MODE_LABELS[mode]}`
      + `<span class="writing-mode-picker"><select class="writing-mode-duration" data-mode="${mode}" data-duration-for="${mode}"`
      + ` aria-label="${escapeHTML(MODE_LABELS[mode])} for how long">${options}</select>`
      + '<span class="writing-mode-caret" aria-hidden="true">▾</span></span></span>';
  }).join('');

  const until = value.until ? `<span class="writing-modes-until">${escapeHTML(value.until)}</span>` : '';
  return `<div class="writing-modes"><div class="writing-modes-row"><div class="cnt-segmented" role="group" aria-label="Checking mode">${segments}</div>${until}</div></div>`;
}
