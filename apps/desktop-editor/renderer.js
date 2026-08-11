import * as core from './writing-core.js';
import { createDesktopSliceController } from './desktop_slice.js';
import { INDICATOR_CSS, mountIndicator, renderIndicator } from './indicator.js';
import { ISSUE_POPOVER_CSS, renderIssuePopover } from './issue_popover.js';

const input = document.querySelector('#editor-input');
const checkButton = document.querySelector('#check');
const counts = document.querySelector('#counts');
const revision = document.querySelector('#revision');
const status = document.querySelector('#service-status');
const indicatorAnchor = document.querySelector('#indicator-anchor');
const issuePopover = document.querySelector('#issue-popover');
const DESIGN_ATTRIBUTES = ['theme', 'palette', 'density', 'contrast'];
function syncDesignAttributes() {
  for (const attribute of DESIGN_ATTRIBUTES) {
    const value = document.documentElement.dataset[attribute];
    if (value) indicatorAnchor.dataset[attribute] = value;
    else delete indicatorAnchor.dataset[attribute];
  }
}
syncDesignAttributes();
const designObserver = new MutationObserver(syncDesignAttributes);
designObserver.observe(document.documentElement, { attributes: true, attributeFilter: DESIGN_ATTRIBUTES.map((attribute) => `data-${attribute}`) });
const indicatorShadow = mountIndicator(indicatorAnchor, { status: 'clean', issueCount: 0, label: 'No issues' });
let controller;
let timer;
let fullCheckTimer;

function renderIndicatorView(view) {
  indicatorShadow.innerHTML = `<style>${INDICATOR_CSS}</style>${renderIndicator(view.indicator)}`;
  counts.textContent = `${view.document.text ? view.result?.statistics.words || 0 : 0} words · ${view.result?.statistics.characters || 0} characters`;
  revision.textContent = `Revision ${view.document.revision}`;
  status.textContent = view.indicator.status === 'unavailable' ? 'Local checker unavailable' : 'Local checker';
}

function showIssue() {
  const issue = controller?.state().result?.matches?.[0];
  if (!issue) { issuePopover.hidden = true; issuePopover.innerHTML = ''; return; }
  issuePopover.innerHTML = `<style>${ISSUE_POPOVER_CSS}</style>${renderIssuePopover(issue, { canAddToDictionary: Boolean(window.ikmal.addDictionaryWord) })}`;
  issuePopover.hidden = false;
}

// The host owns the dictionary and applies it while filtering a check result,
// so the finding leaves on the next check rather than being spliced out here.
async function addToDictionary(word) {
  if (!word || !window.ikmal.addDictionaryWord) return;
  try {
    await window.ikmal.addDictionaryWord(word);
    issuePopover.hidden = true;
    await checkDraft();
  } catch (error) {
    status.textContent = error?.message || 'That word could not be added to your dictionary.';
  }
}

// A long draft is checked around the caret, so findings that span sentences —
// repetition, an antecedent paragraphs away — can only come from a pass over
// the whole document. One runs when the writer pauses.
function scheduleFullCheck(view) {
  window.clearTimeout(fullCheckTimer);
  if (!view?.fullCheckPending) return;
  fullCheckTimer = window.setTimeout(() => void checkDraft('document'), 1500);
}

async function checkDraft(scope) {
  if (!controller) return;
  checkButton.disabled = true;
  try {
    const view = await controller.check(undefined, scope ? { scope } : {});
    renderIndicatorView(view);
    scheduleFullCheck(view);
    showIssue();
  } catch (error) {
    status.textContent = error.message || 'Local checker unavailable';
    renderIndicatorView({ ...controller.state(), indicator: core.resolveIndicatorState({ available: false }) });
  } finally {
    checkButton.disabled = false;
  }
}

controller = createDesktopSliceController({
  core,
  field: input,
  service: { checkText: (text) => window.ikmal.checkText(text) },
});
renderIndicatorView(controller.state());
indicatorShadow.addEventListener('click', showIssue);
checkButton.addEventListener('click', () => void checkDraft());
window.ikmal.onEditorText?.((text) => {
  input.value = String(text || '');
  input.setSelectionRange(input.value.length, input.value.length);
  void checkDraft();
});
input.addEventListener('input', () => {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => void checkDraft(), 350);
});
issuePopover.addEventListener('click', (event) => {
  // The chooser renders one button per candidate, so the clicked control
  // carries the replacement rather than the popover assuming the first one.
  const control = event.target.closest?.('[data-action]');
  const action = control?.dataset.action;
  const issue = controller.state().result?.matches?.[0];
  const value = control?.dataset.value || issue?.replacements?.[0]?.value || '';
  if (action === 'apply' && issue && value) {
    controller.applyIssue(issue.id, value);
    issuePopover.hidden = true;
    void checkDraft();
  }
  if (action === 'dictionary' && issue) void addToDictionary(String(issue.matchedText || '').trim());
  if (action === 'ignore') issuePopover.hidden = true;
});
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || issuePopover.hidden) return;
  issuePopover.hidden = true;
  issuePopover.innerHTML = '';
  indicatorShadow.querySelector('.indicator')?.focus();
}, true);
