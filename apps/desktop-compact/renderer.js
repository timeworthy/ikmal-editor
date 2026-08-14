import * as core from './writing-core.js';
import { createDesktopSliceController } from './desktop_slice.js';
import { mountIndicator, renderIndicator, INDICATOR_CSS } from './indicator.js';
import { renderIssuePopover, ISSUE_POPOVER_CSS } from './issue_popover.js';
import { renderModePicker, MODE_PICKER_CSS } from './mode_picker.js';
import { renderMark } from './mark.js';
import { attachMarkSurface, MARKS_CSS } from './marks.js';
import { SETTINGS_CSS } from './settings.js';

// The launcher renderer.
//
// It owns placement and the shell conversation. Every semantic decision — what
// an issue is, whether a result is current, what a focus mode means — comes from
// the core, and every surface from the shared composites. If this file grows a
// rule about issues, the rule is in the wrong place.

const quickInput = document.querySelector('#quick-input');
const quickStats = document.querySelector('#quick-stats');
const indicatorAnchor = document.querySelector('#indicator-anchor');
const issuePopover = document.querySelector('#issue-popover');
const modes = document.querySelector('#modes');
const services = document.querySelector('#services');
const quickMarks = document.querySelector('#quick-marks');
// Inline rather than an <img>: the mark takes currentColor and var(--accent),
// and an external SVG cannot read either.
document.querySelector('#launcher-mark').innerHTML = renderMark(22);

const indicatorShadow = mountIndicator(indicatorAnchor, { status: 'clean', label: 'No issues' });
const composedCSS = `${MODE_PICKER_CSS}${SETTINGS_CSS}${MARKS_CSS}`;
const style = document.createElement('style');
style.textContent = composedCSS;
document.head.append(style);

// The controller takes the field element itself and a service that can check
// text; it owns reading, writing, and revisions from there.
const controller = createDesktopSliceController({
  core,
  field: quickInput,
  service: { checkText: (text) => window.ikmal.checkText(text) },
  documentID: 'desktop-compact',
});

let issueIndex = 0;
let focusState = { mode: 'active', until: null };

function paintIndicator(view) {
  indicatorShadow.replaceChildren();
  const shadowStyle = document.createElement('style');
  shadowStyle.textContent = INDICATOR_CSS;
  indicatorShadow.append(shadowStyle);
  const template = document.createElement('template');
  template.innerHTML = renderIndicator({
    status: view.indicator.status,
    issueCount: view.result?.matches?.length || 0,
    label: view.indicator.label || 'No issues',
  });
  indicatorShadow.append(template.content.cloneNode(true));
}

// Counts describe the field and are true whatever the checker is doing, so they
// are painted from the text rather than from a result.
function paintStats() {
  const statistics = core.textStatistics(quickInput.value);
  quickStats.textContent = `${statistics.words} words · ${statistics.characters} characters`;
}

function showIssue(index = issueIndex) {
  const issues = controller?.state().result?.matches || [];
  const requested = Number.isFinite(index) ? index : issueIndex;
  // Clamped rather than wrapped: a recheck can shorten the list under an open
  // card, and wrapping would move the writer somewhere they did not ask to go.
  issueIndex = Math.min(Math.max(0, requested), Math.max(0, issues.length - 1));
  const issue = issues[issueIndex];
  if (!issue) { issuePopover.hidden = true; issuePopover.innerHTML = ''; fitWindow(); return; }
  issuePopover.innerHTML = `<style>${ISSUE_POPOVER_CSS}</style>${renderIssuePopover(issue, {
    index: issueIndex,
    total: issues.length,
  })}`;
  issuePopover.hidden = false;
  fitWindow();
}

function paintModes() {
  modes.innerHTML = renderModePicker({
    mode: focusState.mode,
    ...(focusState.duration ? { duration: focusState.duration } : {}),
    ...(focusState.label ? { until: focusState.label } : {}),
  });
  fitWindow();
}

/**
 * Services, reported by exception.
 *
 * This window used to carry two permanent rows naming LanguageTool and the
 * quality checks and reporting both as ready — our architecture, on the surface
 * a writer looks at to check a sentence. Which of two local services answered
 * is not something they chose, can act on, or need to know while everything
 * works; the indicator above already says whether checking is working.
 *
 * So nothing is shown while both are up. When one is not, the window says what
 * that means for checking rather than which process is down, and offers the one
 * action that helps. The full per-service detail is in Settings, where someone
 * who wants to diagnose something goes looking for it.
 */
function paintServices(state) {
  const ready = state?.languageToolReady && state?.qualityReady;
  if (ready) {
    services.hidden = true;
    services.innerHTML = '';
    fitWindow();
    return;
  }
  const none = !state?.languageToolReady && !state?.qualityReady;
  const message = state?.managerRunning
    ? 'Starting the checker…'
    : none
      ? 'The checker is not running, so nothing is being checked.'
      : 'Part of the checker is not running, so some findings will be missing.';
  services.hidden = false;
  services.innerHTML = `<div class="cnt-alert" data-intent="${state?.managerRunning ? 'info' : 'warning'}">`
    + `<div class="cnt-alert-text">${message}</div></div>`
    + (state?.managerRunning ? '' : '<button class="cnt-btn" type="button" data-action="start-services">Start services</button>');
  fitWindow();
}

// The same layer the editor draws, from the same composite. This window is a
// launcher rather than a writing surface, so the marks are the whole of the
// in-text feedback here: there is no room beside the field for a list.
const marks = attachMarkSurface({
  input: quickInput,
  layer: quickMarks,
  onActivate({ issueId }) {
    const index = (controller.state().result?.matches || []).findIndex((issue) => issue.id === issueId);
    if (index >= 0) showIssue(index);
  },
  onInvalidate() { issuePopover.hidden = true; fitWindow(); },
});

function paintMarks() {
  const state = controller.state();
  if (!state.result) { marks.clear(); return; }
  marks.render(state.document.text, { issues: state.result.matches, relationships: state.result.relationships });
}

async function check() {
  paintStats();
  const view = await controller.check();
  if (view.stale) return;
  paintIndicator(view);
  paintMarks();
  showIssue(0);
}

let timer;
quickInput.addEventListener('input', () => {
  paintStats();
  window.clearTimeout(timer);
  timer = window.setTimeout(() => void check(), 350);
});

// Wrapped, not passed directly: showIssue takes an index, and a listener would
// hand it the click event as one.
indicatorShadow.addEventListener('click', () => showIssue());

issuePopover.addEventListener('click', (event) => {
  const control = event.target.closest?.('[data-action]');
  const action = control?.dataset.action;
  const issues = controller.state().result?.matches || [];
  const issue = issues[issueIndex];
  const value = control?.dataset.value || issue?.replacements?.[0]?.value || '';
  if (action === 'apply' && issue && value) {
    // A correction refused for describing a draft that has moved on is right to
    // refuse; hiding the card as though it applied is not.
    if (!controller.applyIssue(issue.id, value)?.applied) { void check(); return; }
    issuePopover.hidden = true;
    void check();
  }
  if (action === 'ignore' || action === 'close') { issuePopover.hidden = true; fitWindow(); }
  if (action === 'previous') showIssue(issueIndex - 1);
  if (action === 'next') showIssue(issueIndex + 1);
});

// Choosing a mode applies it. Pause used to do nothing until a duration was
// picked from a list that dropped below the row, so the click that said "pause"
// was not the one that paused. A mode entered without a duration runs
// indefinitely — which is already what the shell does — and the segment it
// lands on becomes the control for changing that.
modes.addEventListener('click', (event) => {
  const control = event.target.closest?.('button[data-mode]');
  if (!control) return;
  void applyFocus(control.dataset.mode);
});

// The running mode's duration, changed in place without leaving the mode.
modes.addEventListener('change', (event) => {
  const control = event.target.closest?.('select[data-duration-for]');
  if (!control) return;
  void applyFocus(control.dataset.durationFor, control.value);
});

function applyFocus(mode, duration) {
  return window.ikmal.setFocusMode(mode, duration).then((state) => {
    focusState = state || focusState;
    paintModes();
  });
}

// The window fits what it is showing.
//
// It was a fixed 520px whatever was in it, and the middle row took up the
// slack — so with no issues to report there was 165px of nothing between the
// service list and the buttons, which reads as something failing to load
// rather than as space. The shell clamps the request, and beyond the clamp the
// body scrolls, so this only ever removes emptiness; it cannot hide anything.
/**
 * What a container's contents need, rather than what its box currently is.
 *
 * Measuring the box is what a first attempt did, and it does not converge: the
 * scrolling middle is a `1fr` row, so its height already includes the empty
 * space being measured away, and asking for that back grew the window on every
 * repaint.
 */
// Laid out, rather than merely not hidden. `<script>` is a child of `<body>`
// and carries no hidden attribute, but the user agent gives it display:none, so
// it never becomes a grid item — counting it added one row gap that the layout
// never draws, and the window came back 12px taller than its contents with the
// difference sitting between the modes and the buttons.
function laidOut(container) {
  return [...container.children].filter((child) => child.getClientRects().length > 0);
}

function contentHeight(container) {
  const children = laidOut(container);
  const style = getComputedStyle(container);
  const gap = parseFloat(style.rowGap) || 0;
  return children.reduce((total, child) => total + child.offsetHeight, 0)
    + gap * Math.max(0, children.length - 1)
    + (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
}

// Measured synchronously, not from a frame callback. This window spends most of
// its life hidden — it is a menubar popover and hides on blur — and a hidden
// page never runs requestAnimationFrame, so a resize scheduled that way is
// simply dropped and the window reopens at whatever size it last had. Reading
// offsetHeight forces the layout this needs anyway, and every caller has
// already written its markup.
let lastRequested = 0;
function fitWindow() {
  const visible = laidOut(document.body);
  const wanted = visible.reduce((total, child) =>
    total + (child.classList.contains('launcher-body') ? contentHeight(child) : child.offsetHeight), 0);
  const style = getComputedStyle(document.body);
  const chrome = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0)
    + (parseFloat(style.rowGap) || 0) * Math.max(0, visible.length - 1);
  const height = Math.ceil(wanted + chrome);
  // Only when what is being shown changes size. This saves an IPC round trip on
  // the several paints that land together on one check, and it is also what
  // keeps the window from fighting a resize the user made themselves: their
  // drag does not change the content, so nothing here asks for anything back.
  if (height === lastRequested) return;
  lastRequested = height;
  void window.ikmal.setCompactHeight?.(height);
}

services.addEventListener('click', (event) => {
  if (event.target.closest?.('[data-action="start-services"]')) void window.ikmal.startServices();
});

document.querySelector('#open-editor').addEventListener('click', () => {
  void window.ikmal.openEditor(quickInput.value);
});
// Settings live in the editor. The launcher routes there rather than carrying a
// second copy of them.
document.querySelector('#open-settings').addEventListener('click', () => {
  void window.ikmal.openEditor(quickInput.value);
});

// ---------------------------------------------------------------------------
// What the shell says. Every one of these was already being sent and had
// nobody listening: two of the six tray items did nothing at all, and service
// failures were silent.
// ---------------------------------------------------------------------------

const serviceError = document.querySelector('#service-error');
const serviceErrorText = document.querySelector('#service-error-text');

function showServiceError(message) {
  const text = String(message || '').trim();
  if (!text) return;
  serviceErrorText.textContent = text;
  serviceError.hidden = false;
  // The notice changes how tall the body is, so the window has to be told.
  fitWindow();
}

serviceError.addEventListener('click', (event) => {
  if (!event.target.closest?.('[data-action="dismiss-error"]')) return;
  serviceError.hidden = true;
  serviceErrorText.textContent = '';
  fitWindow();
});

window.ikmal.onServiceState((state) => paintServices(state));
window.ikmal.onFocusMode((state) => { focusState = state || focusState; paintModes(); });
window.ikmal.onServiceError?.((message) => showServiceError(message));

// The tray read the clipboard and asked this window to check it. Filling the
// field through the controller's own event is what makes the rest of the
// window — counts, indicator, issue card — agree with it.
window.ikmal.onQuickCheck?.((text) => {
  quickInput.value = String(text || '');
  quickInput.dispatchEvent(new Event('input', { bubbles: true }));
  quickInput.focus();
  // The field's own listener debounces by 350ms, which is right for typing and
  // wrong for a request that has already been made deliberately. Cancelling it
  // also keeps the same text from being checked twice.
  window.clearTimeout(timer);
  void check();
});

// Opened from the tray on purpose, so it is ready to type into.
window.ikmal.onCompactInvoked?.(() => quickInput.focus());

// Recent checks live in the editor's Privacy section. Routing there rather than
// growing a second copy of them here is the same rule the gear follows.
window.ikmal.onShowHistory?.(() => { void window.ikmal.openEditor(quickInput.value); });

void (async () => {
  paintStats();
  paintModes();
  paintServices(await window.ikmal.getServiceState());
  focusState = (await window.ikmal.getFocusMode()) || focusState;
  paintModes();
  fitWindow();
})();
