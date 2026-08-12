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
  /** Which mode's duration list is open, if any. */
  open?: FocusMode | null;
}

// The four durations are product behaviour, not a suggestion: every host offers
// the same set, and a host that offers fewer is reporting a reduced capability.
export const FOCUS_DURATIONS: FocusDuration[] = [
  { id: '15m', label: '15 minutes' },
  { id: '1h', label: '1 hour' },
  { id: '4h', label: '4 hours' },
  { id: 'until-off', label: 'Until turned off' },
];

export const MODE_PICKER_CSS = `
.writing-modes { display: grid; gap: var(--space-2); }
.writing-modes-row { align-items: center; display: flex; gap: var(--space-3); justify-content: space-between; }
.writing-modes-until { color: var(--fg-4); font: 400 12px/1.3 var(--font-sans); }
.writing-modes-durations { margin: 0; }
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
  const open = modes.includes(value.open as FocusMode) ? value.open as FocusMode : null;
  return { mode, durations, open, ...(typeof value.until === 'string' && value.until ? { until: value.until } : {}) };
}

export function renderModePicker(state: Partial<ModePickerState> = {}): string {
  const value = normalizeModePickerState(state);
  const buttons = (['active', 'paused', 'zen'] as FocusMode[]).map((mode) => {
    const selected = value.mode === mode;
    // Automatic has no duration: it is the absence of a timed mode, so it opens
    // no list and is applied directly.
    const expands = mode === 'active' ? '' : ` aria-haspopup="menu" aria-expanded="${value.open === mode}"`;
    return `<button class="cnt-tab" type="button" role="tab" aria-selected="${selected}" data-mode="${mode}"${expands}>${MODE_LABELS[mode]}</button>`;
  }).join('');

  const durations = value.open
    ? `<ul class="cnt-menu writing-modes-durations" role="menu" aria-label="${escapeHTML(MODE_LABELS[value.open])} for how long">${
      value.durations.map((duration) => `<li role="menuitem" tabindex="0" data-mode="${value.open}" data-duration="${escapeHTML(duration.id)}">${escapeHTML(duration.label)}</li>`).join('')
    }</ul>`
    : '';

  const until = value.until ? `<span class="writing-modes-until">${escapeHTML(value.until)}</span>` : '';
  return `<div class="writing-modes"><div class="writing-modes-row"><div class="cnt-segmented" role="tablist" aria-label="Checking mode">${buttons}</div>${until}</div>${durations}</div>`;
}
