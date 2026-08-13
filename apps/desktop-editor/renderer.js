import * as core from './writing-core.js';
import { createDesktopSliceController } from './desktop_slice.js';
import { INDICATOR_CSS, mountIndicator, renderIndicator } from './indicator.js';
import { ISSUE_POPOVER_CSS, renderIssuePopover } from './issue_popover.js';
import { applyAnnotationPreferences, attachMarkSurface, MARKS_CSS, renderRelationshipCard } from './marks.js';
import { renderSettingsPage, SETTINGS_PAGE_CSS } from './settings_page.js';

const input = document.querySelector('#editor-input');
const checkButton = document.querySelector('#check');
const counts = document.querySelector('#counts');
const revision = document.querySelector('#revision');
const status = document.querySelector('#service-status');
const indicatorAnchor = document.querySelector('#indicator-anchor');
const issuePopover = document.querySelector('#issue-popover');
const surface = document.querySelector('#editor-surface');
const marksLayer = document.querySelector('#editor-marks');
const marksStyle = document.createElement('style');
marksStyle.textContent = MARKS_CSS;
document.head.append(marksStyle);
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

let issueIndex = 0;

// What the writer is actually being shown. Ignoring a finding has to remove it
// from the marks, the count and the card's "3 of 7" together, or the three
// disagree about how much is left to look at.
function visibleIssues() {
  return (controller?.state().result?.matches || []).filter((issue) => !ignored.has(issue.id));
}

// Findings the writer has dismissed. Session-scoped and keyed by the core's
// issue id, which is derived from the finding's text and offset — so an ignore
// survives a recheck of untouched prose, and is correctly forgotten once an
// edit earlier in the draft moves the words it referred to.
const ignored = new Set();

function markFor(issueId) {
  if (!issueId) return null;
  return Array.from(marksLayer.querySelectorAll('.writing-underline'))
    .find((mark) => mark.dataset.issueId === issueId) || null;
}

// The card points at the words it is about. Clamped to the surface so a finding
// near the right edge or the last line does not open the card off-screen.
function anchorCard(mark) {
  const surfaceRect = surface.getBoundingClientRect();
  const width = issuePopover.offsetWidth;
  const height = issuePopover.offsetHeight;
  // Whether the card is attached to a mark decides whether leaving the marks
  // should close it. One opened from the indicator is not the pointer's to
  // dismiss.
  issuePopover.dataset.anchored = mark ? 'mark' : 'surface';
  if (!mark) {
    issuePopover.style.left = `${Math.max(0, (surface.clientWidth - width) / 2)}px`;
    issuePopover.style.top = `${Math.max(0, surface.clientHeight - height - 8)}px`;
    return;
  }
  const markRect = mark.getBoundingClientRect();
  const left = Math.min(Math.max(0, markRect.left - surfaceRect.left), Math.max(0, surface.clientWidth - width));
  // The card may hang past the surface — nothing clips it — so what it has to
  // stay inside is the window. Clamping it to the surface instead put a card
  // for a first-line finding on top of that finding, which is the one thing it
  // must never cover. Below the mark unless the window has no room for it
  // there and does have room above.
  const roomBelow = window.innerHeight - markRect.bottom >= height + 16;
  const roomAbove = markRect.top >= height + 16;
  const top = roomBelow || !roomAbove
    ? markRect.bottom - surfaceRect.top + 8
    : markRect.top - surfaceRect.top - height - 8;
  issuePopover.style.left = `${left}px`;
  issuePopover.style.top = `${top}px`;
}

function showIssue(index = issueIndex) {
  const issues = visibleIssues();
  // Clamped rather than wrapped: a recheck can shorten the list under an open
  // card, and wrapping would move the writer somewhere they did not ask to go.
  const requested = Number.isFinite(index) ? index : issueIndex;
  issueIndex = Math.min(Math.max(0, requested), Math.max(0, issues.length - 1));
  const issue = issues[issueIndex];
  if (!issue) { hideCard(); return; }
  issuePopover.innerHTML = `<style>${ISSUE_POPOVER_CSS}</style>${renderIssuePopover(issue, {
    canAddToDictionary: Boolean(window.ikmal.addDictionaryWord),
    index: issueIndex,
    total: issues.length,
  })}`;
  issuePopover.hidden = false;
  anchorCard(markFor(issue.id));
}

// A pronoun link has nothing to apply or ignore, so it gets the card that
// explains it rather than the one built for corrections.
function showRelationship(relationshipId, mark) {
  const group = (controller?.state().result?.relationships || []).find((candidate) => candidate.id === relationshipId);
  if (!group) return;
  const text = controller.state().document.text;
  const read = (range) => (range ? text.slice(range.offset, range.offset + range.length) : '');
  issuePopover.innerHTML = `<style>${MARKS_CSS}${ISSUE_POPOVER_CSS}</style>${renderRelationshipCard({
    pronoun: group.labels?.[0] || read(group.ranges[0]),
    antecedent: group.labels?.[1] || read(group.ranges[1]),
    note: 'This connection shows what the pronoun is pointing to.',
  })}`;
  issuePopover.hidden = false;
  anchorCard(mark);
}

function hideCard() {
  issuePopover.hidden = true;
  issuePopover.innerHTML = '';
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

// Drawn from the text the result describes, not from the field, so a draft
// edited while a check was in flight cannot have the previous result's offsets
// painted onto it.
function paintMarks() {
  const state = controller?.state();
  if (!state?.result) { marks.clear(); return; }
  marks.render(state.document.text, {
    issues: state.result.matches,
    relationships: state.result.relationships,
    ignored,
  });
}

async function checkDraft(scope) {
  if (!controller) return;
  checkButton.disabled = true;
  try {
    const view = await controller.check(undefined, scope ? { scope } : {});
    renderIndicatorView(view);
    scheduleFullCheck(view);
    paintMarks();
    // Refreshed if it is open, never opened. A check runs 350ms after every
    // keystroke, and the card is anchored over the draft now — so opening it
    // here would drop a panel on top of the sentence being written, several
    // times a paragraph. The marks are the ambient signal; the card is what
    // the writer asks for by pointing at one.
    if (!issuePopover.hidden) showIssue();
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

const marks = attachMarkSurface({
  input,
  layer: marksLayer,
  onActivate({ mark, issueId, relationshipId }) {
    if (issueId) {
      const index = visibleIssues().findIndex((issue) => issue.id === issueId);
      if (index >= 0) showIssue(index);
      return;
    }
    if (relationshipId) showRelationship(relationshipId, mark);
  },
  // Only what the marks opened is taken away again. The writer may have opened
  // this card from the indicator and moved the pointer across the text on the
  // way to its buttons, and closing it under them would be its own bug.
  onDismiss() { if (cardCameFromAMark()) hideCard(); },
  onInvalidate() { hideCard(); },
});

// The card is inside the surface, so the pointer crossing from a mark to the
// card leaves the marks. Holding while it is inside is what lets the writer
// reach Apply.
issuePopover.addEventListener('mouseenter', () => marks.hold());
issuePopover.addEventListener('mouseleave', () => marks.release());
function cardCameFromAMark() {
  return !issuePopover.hidden && issuePopover.dataset.anchored === 'mark';
}

renderIndicatorView(controller.state());
// Applied before the first paint so marks are never drawn in the default
// palette and then corrected to the writer's, which reads as a flicker on
// every launch.
void window.ikmal.getAnnotationPreferences?.()
  .then((preferences) => applyAnnotationPreferences(document.documentElement, preferences))
  .catch(() => {});
// Wrapped, not passed directly: showIssue takes an index now, and a listener
// would hand it the click event as one.
indicatorShadow.addEventListener('click', () => showIssue());
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
  const issue = visibleIssues()[issueIndex];
  const value = control?.dataset.value || issue?.replacements?.[0]?.value || '';
  if (action === 'apply' && issue && value) {
    // Refusing a correction whose finding no longer describes the draft is
    // right; hiding the popover as though it had been applied is not. The
    // writer would see the card close with the text unchanged and no reason
    // given. Re-check and leave the card up on the current finding instead.
    if (!controller.applyIssue(issue.id, value)?.applied) {
      void checkDraft();
      return;
    }
    hideCard();
    void checkDraft();
  }
  if (action === 'dictionary' && issue) void addToDictionary(String(issue.matchedText || '').trim());
  // Ignoring takes the mark away too. A finding the writer has dismissed that
  // goes on underlining its words has not been dismissed in any sense they
  // would recognise.
  if (action === 'ignore' && issue) { ignored.add(issue.id); hideCard(); paintMarks(); }
  if (action === 'close') hideCard();
  // Re-rendered at the neighbouring finding rather than mutated in place, so
  // the card cannot drift from the result it describes.
  if (action === 'previous') showIssue(issueIndex - 1);
  if (action === 'next') showIssue(issueIndex + 1);
});
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || issuePopover.hidden) return;
  hideCard();
  indicatorShadow.querySelector('.indicator')?.focus();
}, true);

// ---------------------------------------------------------------------------
// Settings. One implementation, in this window, rendered from the shared
// composites. The launcher opens the editor to reach it.
// ---------------------------------------------------------------------------

const settingsView = document.querySelector('#settings-view');
const settingsStyle = document.createElement('style');
settingsStyle.textContent = SETTINGS_PAGE_CSS;
document.head.append(settingsStyle);

let settingsState = {};
// Which sections the reader has open. Held here rather than read back off the
// DOM so a repaint restores it instead of destroying it.
const openSections = new Set(['checking']);

// Read once, then re-read only what a change invalidates. A settings page that
// refetches everything on every keystroke makes the shell do work the user did
// not ask for.
async function loadSettings() {
  const [checking, annotations, presence, launchAtLogin, services, recentChecks] = await Promise.all([
    window.ikmal.getCheckingPreferences(),
    window.ikmal.getAnnotationPreferences(),
    window.ikmal.getDesktopPresence(),
    window.ikmal.getLaunchAtLogin().catch(() => false),
    window.ikmal.getServiceState(),
    window.ikmal.getRecentChecks().catch(() => []),
  ]);
  // Read once and kept: the version cannot change while the window is open.
  if (!settingsState.version) settingsState.version = await window.ikmal.getAppVersion().catch(() => '');
  // The style-guide service may not be running; a settings page that fails to
  // open because an optional feature is down would be worse than one that says
  // the feature has nothing to show.
  const styleGuides = await window.ikmal.getStyleGuideState().catch(() => ({ guides: [] }));
  // Each of these can legitimately fail — the integration scan shells out, the
  // spell service is macOS only, the Office bridge may be absent from a build.
  // A settings page that refuses to open because an optional feature is
  // unavailable would be worse than one that says the feature has nothing to
  // show, so each falls back to an empty state rather than rejecting.
  const [integrations, spellServer, office, quality] = await Promise.all([
    window.ikmal.getIntegrationStatus().catch(() => ({ targets: [] })),
    window.ikmal.getSpellServerState().catch(() => ({ supported: false })),
    window.ikmal.getOfficeBridgeState().catch(() => ({ supported: false })),
    window.ikmal.getQualityStatus().catch(() => ({ components: [] })),
  ]);
  settingsState = { checking, annotations, presence, launchAtLogin, services, recentChecks, styleGuides, integrations, spellServer, office, quality, version: settingsState.version };
  paintSettings();
}

function paintSettings() {
  settingsView.innerHTML = renderSettingsPage({ ...settingsState, open: openSections });
}

function showSettings(show) {
  settingsView.hidden = !show;
  document.querySelector('.slice-editor').hidden = show;
  document.querySelector('#indicator-anchor').hidden = show;
  // The issue card floats above the workspace, so it would otherwise sit on top
  // of the settings page it has nothing to do with.
  if (show) { issuePopover.hidden = true; issuePopover.innerHTML = ''; }
  if (show) void loadSettings();
}

document.querySelector('#open-settings').addEventListener('click', () => showSettings(settingsView.hidden));

// One accordion open/close handler for the whole page: the group composite
// renders a button per section and owns its own aria-expanded.
settingsView.addEventListener('click', async (event) => {
  const head = event.target.closest?.('.cnt-acc-head');
  if (head) {
    const group = head.closest('.cnt-acc-item')?.dataset.group;
    const open = head.getAttribute('aria-expanded') === 'true';
    if (open) openSections.delete(group); else openSections.add(group);
    head.setAttribute('aria-expanded', String(!open));
    const body = head.nextElementSibling;
    if (body) body.hidden = open;
    return;
  }
  const action = event.target.closest?.('[data-action]')?.dataset.action;
  if (!action) return;
  if (action === 'start-services') { await window.ikmal.startServices(); await loadSettings(); }
  if (action === 'stop-services') { await window.ikmal.stopServices(); await loadSettings(); }
  if (action === 'clear-history') { await window.ikmal.clearRecentChecks(); await loadSettings(); }
  if (action === 'open-notices') await window.ikmal.openThirdPartyNotices();
  if (action === 'import-guide') { await window.ikmal.importStyleGuide(); await loadSettings(); }
  if (action === 'configure-integrations') {
    // Only the plugins already detected are touched; nothing is installed.
    const detected = (settingsState.integrations?.targets || []).filter((target) => target.detected).map((target) => target.id);
    await window.ikmal.configureIntegrations(detected);
    await loadSettings();
  }
  if (action === 'install-quality') {
    // The licence acknowledgement is passed through explicitly: the CLI would
    // otherwise prompt, and no window can answer a prompt.
    await window.ikmal.installQualityStack(true);
    await loadSettings();
  }
  if (action === 'reveal-extension') await window.ikmal.revealExtension();
  if (action === 'install-spell-server') { await window.ikmal.installSpellServer(); await loadSettings(); }
  if (action === 'remove-spell-server') { await window.ikmal.removeSpellServer(); await loadSettings(); }
  if (action === 'generate-office-certificate') { await window.ikmal.generateOfficeCertificate(); await loadSettings(); }
  if (action === 'remove-office-certificate') { await window.ikmal.removeOfficeCertificate(); await loadSettings(); }
  if (action === 'start-office-bridge') { await window.ikmal.startOfficeBridge(); await loadSettings(); }
  if (action === 'stop-office-bridge') { await window.ikmal.stopOfficeBridge(); await loadSettings(); }
  if (action === 'reveal-manifest') {
    await window.ikmal.revealOfficeManifest(event.target.closest('[data-host]')?.dataset.host || 'word');
  }
});

settingsView.addEventListener('change', async (event) => {
  const control = event.target.closest?.('[data-setting]');
  if (!control) return;
  const name = control.dataset.setting;
  const value = control.type === 'checkbox' ? control.checked : control.value;

  if (name.startsWith('category:')) {
    const categories = { ...(settingsState.checking?.categories || {}), [name.slice('category:'.length)]: value };
    settingsState.checking = await window.ikmal.setCheckingPreferences({ ...settingsState.checking, categories });
    return;
  }
  // The shell's preference keys are mode/delay/sensitivity; the controls name
  // them the same way so no translation layer can drift.
  if (['mode', 'delay', 'sensitivity'].includes(name)) {
    settingsState.checking = await window.ikmal.setCheckingPreferences({ ...settingsState.checking, [name]: value });
    // Only the mode restructures the section — it decides whether the typing
    // pause applies at all. The sliders update their own readout on `input`,
    // which is why neither repaints here: a repaint mid-drag would replace the
    // element under the pointer and end the drag.
    if (name === 'mode') paintSettings();
    return;
  }
  if (['annotationStyle', 'annotationPalette', 'annotationIntensity'].includes(name)) {
    const key = name.replace('annotation', '').toLowerCase();
    settingsState.annotations = await window.ikmal.setAnnotationPreferences({ ...settingsState.annotations, [key]: value });
    // Applied from what the shell stored rather than from the control, so the
    // marks show the preference that was actually saved. These three used to
    // write a preference nothing read: the rewrite had no mark layer at all,
    // and Appearance offered style, palette and intensity for a feature the
    // window could not perform.
    applyAnnotationPreferences(document.documentElement, settingsState.annotations);
    return;
  }
  if (['menubarIcon', 'dockIcon'].includes(name)) {
    settingsState.presence = await window.ikmal.setDesktopPresence({ ...settingsState.presence, [name]: value });
    return;
  }
  if (name === 'launchAtLogin') { await window.ikmal.setLaunchAtLogin(value); return; }
  // Acknowledgement gates the install button; it is renderer state until the
  // install is actually requested, so the page is repainted rather than saved.
  if (name === 'quality-notices') {
    settingsState.quality = { ...settingsState.quality, noticesAccepted: value };
    paintSettings();
    return;
  }
  if (control.dataset.action === 'select-guide') { await window.ikmal.selectStyleGuide(value); await loadSettings(); }
  if (control.dataset.action === 'enable-guide') { await window.ikmal.setStyleGuideEnabled(value); await loadSettings(); }
});

// A slider's readout follows the handle while it is being dragged. `change`
// only fires on release, so without this the number sits at the old value
// through the whole gesture — the one moment the reader is looking at it.
const SLIDER_UNITS = { delay: (value) => `${value} ms`, sensitivity: (value) => `${value}%`, annotationIntensity: (value) => `${value}%` };
settingsView.addEventListener('input', (event) => {
  const control = event.target.closest?.('input[type=range][data-setting]');
  const unit = control && SLIDER_UNITS[control.dataset.setting];
  if (!unit) return;
  const readout = control.closest('.cnt-field')?.querySelector('.settings-value');
  if (readout) readout.textContent = unit(control.value);
  // Intensity previews as the handle moves, without saving. A number on a
  // slider does not tell anyone how strong a squiggle looks, and persisting on
  // every pixel of a drag would write the preferences file a hundred times and
  // fight the pointer with each awaited reply.
  if (control.dataset.setting === 'annotationIntensity') {
    applyAnnotationPreferences(document.documentElement, { ...settingsState.annotations, intensity: control.value });
  }
});

window.ikmal.onServiceState?.((state) => {
  settingsState.services = state;
  if (!settingsView.hidden) paintSettings();
});
