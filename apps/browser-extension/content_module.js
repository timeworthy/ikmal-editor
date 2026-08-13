import * as core from './writing-core.js';
import { createBrowserFieldCapability, isEditableField } from './browser_field.js';
import { createBrowserSliceController } from './browser_slice.js';
import { INDICATOR_CSS, mountIndicator, renderIndicator } from './indicator.js';
import { ISSUE_POPOVER_CSS, renderIssuePopover } from './issue_popover.js';

const state = { active: null, controller: null, indicator: null, popover: null, timer: 0, fullCheckTimer: 0, tokenCSS: '', primitiveCSS: '' };
const DESIGN_ATTRIBUTES = ['theme', 'palette', 'density', 'contrast'];

function resolveTheme() {
  const pageTheme = document.documentElement.dataset.theme;
  return pageTheme === 'light' || pageTheme === 'dark' ? pageTheme : 'dark';
}

function syncDesignAttributes(host) {
  host.dataset.theme = resolveTheme();
  for (const attribute of DESIGN_ATTRIBUTES.slice(1)) {
    const value = document.documentElement.dataset[attribute];
    if (value) host.dataset[attribute] = value;
    else delete host.dataset[attribute];
  }
}

async function loadCSS(file) {
  try {
    const response = await fetch(chrome.runtime.getURL(file));
    return response.ok ? await response.text() : '';
  } catch {
    return '';
  }
}

function activeField() {
  const field = document.activeElement;
  return isEditableField(field) ? field : null;
}

function ensureIndicator() {
  if (state.indicator?.isConnected) return state.indicator;
  const host = document.createElement('div');
  host.id = 'ikmal-rewrite-indicator';
  syncDesignAttributes(host);
  host.style.cssText = 'position:fixed;z-index:2147483646;';
  document.documentElement.append(host);
  const shadow = mountIndicator(host, { status: 'clean', issueCount: 0, label: 'No issues' });
  state.indicator = host;
  shadow.addEventListener('click', () => openPopover());
  positionIndicator();
  return host;
}

/**
 * In the corner of the field it describes.
 *
 * It was pinned to the corner of the viewport, which says nothing about which
 * field it belongs to — and on a page with several, or with the field scrolled
 * away entirely, it was a badge floating over unrelated content. Fixed
 * positioning is kept because a page's own overflow and stacking cannot be
 * trusted, so the coordinates are computed from the field's viewport rect
 * instead and refreshed when the page moves under it.
 */
function positionIndicator() {
  const host = state.indicator;
  const field = state.active;
  if (!host?.isConnected || !field?.isConnected) return;
  const box = field.getBoundingClientRect();
  // Off-screen fields take the badge with them rather than leaving it pointing
  // at nothing.
  const offscreen = box.bottom < 0 || box.top > window.innerHeight || box.right < 0 || box.left > window.innerWidth;
  host.style.display = offscreen ? 'none' : '';
  if (offscreen) return;
  const size = host.getBoundingClientRect();
  const inset = 8;
  const left = Math.max(inset, Math.min(box.right - size.width - inset, window.innerWidth - size.width - inset));
  const top = Math.max(inset, Math.min(box.bottom - size.height - inset, window.innerHeight - size.height - inset));
  host.style.left = `${Math.round(left)}px`;
  host.style.top = `${Math.round(top)}px`;
}

function updateIndicator(view) {
  const host = ensureIndicator();
  const shadow = host.shadowRoot;
  if (!shadow) return;
  shadow.innerHTML = `<style>${state.tokenCSS}${state.primitiveCSS}${INDICATOR_CSS}</style>${renderIndicator(view.indicator)}`;
  // The label changes width with the count, and the badge is anchored by its
  // right edge, so it has to be placed again after it is drawn.
  positionIndicator();
}

function closePopover() {
  state.popover?.remove();
  state.popover = null;
}

function openPopover(index = state.issueIndex || 0) {
  const view = state.controller?.state();
  const issues = view?.result?.matches || [];
  // Clamped rather than wrapped: a recheck can shorten the list under a card
  // that was already open, and wrapping would move the writer somewhere they
  // did not ask to go.
  const requested = Number.isFinite(index) ? index : (state.issueIndex || 0);
  const position = Math.min(Math.max(0, requested), Math.max(0, issues.length - 1));
  state.issueIndex = position;
  const issue = issues[position];
  if (!issue) return closePopover();
  closePopover();
  const host = document.createElement('div');
  host.id = 'ikmal-rewrite-popover';
  syncDesignAttributes(host);
  host.style.cssText = 'position:fixed;right:16px;bottom:56px;z-index:2147483647;';
  document.documentElement.append(host);
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `<style>${state.tokenCSS}${state.primitiveCSS}${ISSUE_POPOVER_CSS}</style>${renderIssuePopover(issue, { index: position, total: issues.length })}`;
  shadow.addEventListener('click', (event) => {
    // The chooser renders one button per candidate, so the clicked control
    // carries the replacement rather than the popover assuming the first one.
    const control = event.composedPath().find((node) => node?.dataset?.action);
    const action = control?.dataset?.action;
    const value = control?.dataset?.value || issue.replacements?.[0]?.value || '';
    if (action === 'apply' && value) {
      // A correction derived from a check the field has since moved past is
      // refused, which is right. Closing the card anyway is not: the writer
      // clicked Apply, the card went away, and the text did not change, which
      // is indistinguishable from a broken button. Re-check and put the card
      // back on the current finding so the next click is the one that works.
      if (!state.controller.applyIssue(issue.id, value)?.applied) {
        void runCheck().then(openPopover);
        return;
      }
      closePopover();
      void runCheck();
    }
    if (action === 'ignore') closePopover();
    if (action === 'close') closePopover();
    // The card is reopened at the neighbouring finding rather than mutated in
    // place, so its state cannot drift from the result it is describing.
    if (action === 'previous') openPopover(position - 1);
    if (action === 'next') openPopover(position + 1);
  });
  state.popover = host;
}

// Findings that span sentences cannot come from a chunk around the caret, so a
// whole-document pass follows once the writer pauses.
function scheduleFullCheck(view) {
  window.clearTimeout(state.fullCheckTimer);
  if (!view?.fullCheckPending) return;
  state.fullCheckTimer = window.setTimeout(() => void runCheck('document'), 1500);
}

async function runCheck(scope) {
  if (!state.controller) return;
  try {
    const view = await state.controller.check(undefined, scope ? { scope } : {});
    updateIndicator(view);
    scheduleFullCheck(view);
  } catch (error) {
    console.warn('ikmal browser rewrite check failed', error);
    updateIndicator({ indicator: core.resolveIndicatorState({ available: false }) });
  }
}

function activate(field) {
  if (state.active === field && state.controller) return;
  closePopover();
  state.active = field;
  positionIndicator();
  state.controller = createBrowserSliceController({
    core,
    field: createBrowserFieldCapability(field),
    check: (request) => new Promise((resolve, reject) => {
      let settled = false;
      const timeout = window.setTimeout(() => {
        settled = true;
        reject(new Error('Local checker unavailable.'));
      }, 5000);
      const finish = (callback) => (response) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        callback(response);
      };
      try {
        chrome.runtime.sendMessage({
          type: 'check',
          text: request.text,
          language: request.language?.requested || 'auto',
          selection: Boolean(request.selection && request.selection.length > 0),
        }, finish((response) => {
          if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
          if (!response?.ok) return reject(new Error(response?.error || 'Local checker unavailable.'));
          resolve(response.data);
        }));
      } catch (error) {
        finish(reject)(new Error(error?.message || 'Local checker unavailable.'));
      }
    }),
  });
  void runCheck();
}

document.addEventListener('focusin', () => {
  const field = activeField();
  if (field) activate(field);
}, true);
// A page that scrolls or reflows moves the field out from under its badge.
// Capture, because the scroll that matters is usually a container's rather than
// the document's.
window.addEventListener('scroll', positionIndicator, true);
window.addEventListener('resize', positionIndicator);
document.addEventListener('input', () => {
  const field = activeField();
  if (!field || field !== state.active) return;
  window.clearTimeout(state.timer);
  state.timer = window.setTimeout(() => void runCheck(), 350);
}, true);
document.addEventListener('pointerdown', (event) => {
  if (state.popover && !state.popover.contains(event.target)) closePopover();
}, true);
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || !state.popover) return;
  closePopover();
  state.indicator?.shadowRoot?.querySelector('.indicator')?.focus();
}, true);
state.tokenCSS = await loadCSS('tokens.css');
state.primitiveCSS = await loadCSS('primitives.css');
const designObserver = new MutationObserver(() => {
  if (state.indicator?.isConnected) syncDesignAttributes(state.indicator);
  if (state.popover?.isConnected) syncDesignAttributes(state.popover);
});
designObserver.observe(document.documentElement, { attributes: true, attributeFilter: DESIGN_ATTRIBUTES.map((attribute) => `data-${attribute}`) });
