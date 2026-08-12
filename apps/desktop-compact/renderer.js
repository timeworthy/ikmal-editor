import * as core from './writing-core.js';
import { createDesktopSliceController } from './desktop_slice.js';
import { mountIndicator, renderIndicator, INDICATOR_CSS } from './indicator.js';
import { renderIssuePopover, ISSUE_POPOVER_CSS } from './issue_popover.js';
import { renderModePicker, MODE_PICKER_CSS } from './mode_picker.js';
import { renderServiceHealth, SETTINGS_CSS } from './settings.js';

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

const indicatorShadow = mountIndicator(indicatorAnchor, { status: 'clean', label: 'No issues' });
const composedCSS = `${MODE_PICKER_CSS}${SETTINGS_CSS}`;
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
  if (!issue) { issuePopover.hidden = true; issuePopover.innerHTML = ''; return; }
  issuePopover.innerHTML = `<style>${ISSUE_POPOVER_CSS}</style>${renderIssuePopover(issue, {
    index: issueIndex,
    total: issues.length,
  })}`;
  issuePopover.hidden = false;
}

function paintModes() {
  modes.innerHTML = renderModePicker({
    mode: focusState.mode,
    ...(focusState.label ? { until: focusState.label } : {}),
  });
}

function paintServices(state) {
  // Reports what is answering, not what is installed. Whether the app started a
  // service decides what restarting it can do, so that is stated rather than
  // left for the reader to work out.
  const managed = state?.managerRunning === true;
  services.innerHTML = renderServiceHealth([
    { name: 'LanguageTool', state: state?.languageToolReady ? 'ready' : 'stopped', managed },
    { name: 'Quality checks', state: state?.qualityReady ? 'ready' : 'stopped', managed },
  ]) + (state?.languageToolReady && state?.qualityReady
    ? ''
    : '<button class="cnt-btn" type="button" data-action="start-services">Start services</button>');
}

async function check() {
  paintStats();
  const view = await controller.check();
  if (view.stale) return;
  paintIndicator(view);
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
  if (action === 'ignore' || action === 'close') issuePopover.hidden = true;
  if (action === 'previous') showIssue(issueIndex - 1);
  if (action === 'next') showIssue(issueIndex + 1);
});

modes.addEventListener('click', (event) => {
  const control = event.target.closest?.('[data-mode]');
  if (!control) return;
  const mode = control.dataset.mode;
  const duration = control.dataset.duration;
  // Automatic is the absence of a timed mode, so it applies immediately.
  // The others need a duration, which the picker asks for on the next click.
  if (mode === 'active' || duration) {
    void window.ikmal.setFocusMode(mode, duration).then((state) => { focusState = state || focusState; paintModes(); });
    return;
  }
  modes.innerHTML = renderModePicker({ mode: focusState.mode, open: mode });
});

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

window.ikmal.onServiceState((state) => paintServices(state));
window.ikmal.onFocusMode((state) => { focusState = state || focusState; paintModes(); });

void (async () => {
  paintStats();
  paintModes();
  paintServices(await window.ikmal.getServiceState());
  focusState = (await window.ikmal.getFocusMode()) || focusState;
  paintModes();
})();
