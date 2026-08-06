// Service worker. Owns every network call so content scripts never touch the
// network directly, and so the single place that can make a request is one
// file you can audit in a minute.
//
// The only hosts this extension is permitted to reach are 127.0.0.1 and
// localhost, declared in the manifest. There is no analytics call, no update
// ping, and no remote fallback.

import { readSettings, writeSettings, checkURL, healthURL, hostIsDisabled } from './config.js';
import { buildCheckBody, normalizeCheckResponse } from './core/check_contract.js';
import { resolveFocusState, applyFocusState, filterMatches, describeFocusState, startFocusState, FOCUS_DURATIONS } from './core/focus_mode.js';

// The browser adapter has no sensitivity slider of its own, so a mode is
// applied to these canonical defaults. Active therefore changes nothing, which
// is what it should do.
const BASE_PREFERENCES = {
  mode: 'automatic',
  sensitivity: 55,
  categories: { grammar: true, repetition: true, style: true, languagetool: true },
};

async function checkText({ text, language, host }) {
  const settings = await readSettings();

  if (!settings.enabled) return { skipped: 'disabled' };
  if (hostIsDisabled(settings, host)) return { skipped: 'host-disabled' };

  // Pause is answered here rather than in the content script so no request is
  // made at all, and so every caller gets the same answer.
  const focus = resolveFocusState(settings.focusMode);
  if (focus.mode === 'paused') return { skipped: 'paused', focus };

  if (!text || text.trim().length < settings.minLength) return { skipped: 'too-short' };

  const body = buildCheckBody({
    text,
    language: language || settings.language || 'auto',
    motherTongue: settings.motherTongue,
  });

  const response = await fetch(checkURL(settings.endpoint), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`The local server answered with HTTP ${response.status}.`);
  }
  const result = normalizeCheckResponse(await response.json());
  // Zen keeps checking and narrows what comes back, using the same rules the
  // desktop applies to the same findings.
  const effective = applyFocusState(BASE_PREFERENCES, focus);
  return { ...result, matches: filterMatches(result.matches, effective), focus };
}

async function readHealth() {
  const settings = await readSettings();
  try {
    const response = await fetch(healthURL(settings.endpoint), {
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) {
      return { ready: false, endpoint: settings.endpoint, reason: `HTTP ${response.status}` };
    }
    return { ready: true, endpoint: settings.endpoint };
  } catch (error) {
    return {
      ready: false,
      endpoint: settings.endpoint,
      reason: error.name === 'TimeoutError' ? 'No response' : 'Not reachable',
    };
  }
}

async function readFocus() {
  const settings = await readSettings();
  const state = resolveFocusState(settings.focusMode);
  return { ...state, label: describeFocusState(state) };
}

async function setFocus({ mode, duration }) {
  const state = mode === 'active' ? { mode: 'active', until: null } : startFocusState(mode, duration);
  await writeSettings({ focusMode: state });
  // Open tabs pick this up through chrome.storage.onChanged, which content
  // scripts receive directly. Broadcasting over chrome.tabs instead would mean
  // asking for the "tabs" permission, and verify_extension.mjs refuses it —
  // rightly, since a checker has no business enumerating the user's tabs.
  return { ...state, label: describeFocusState(state) };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Every branch resolves or rejects so the content script is never left
  // waiting on a promise that silently disappears with the worker.
  const handlers = {
    check: () => checkText({ ...message, host: hostOf(sender) }),
    health: () => readHealth(),
    settings: () => readSettings(),
    focus: () => readFocus(),
    focusDurations: async () => FOCUS_DURATIONS,
    setFocus: () => setFocus(message),
    updateSettings: () => writeSettings(message.patch || {}),
  };

  const handler = handlers[message.type];
  if (!handler) {
    sendResponse({ ok: false, error: `Unknown message type: ${message.type}` });
    return false;
  }

  handler()
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error) => sendResponse({ ok: false, error: error.message || 'Unknown error' }));
  return true;
});

function hostOf(sender) {
  try {
    return new URL(sender?.tab?.url || sender?.url || '').host;
  } catch {
    return '';
  }
}

// The context menu is a convenience, not the feature. Registering it at the top
// level means a runtime without chrome.contextMenus throws here and takes the
// whole service worker with it — and with it every check, because the content
// script talks to nothing else. Guarded so a missing optional API costs only
// the menu.
if (chrome.contextMenus) {
  chrome.runtime.onInstalled.addListener(async () => {
    chrome.contextMenus.create({
      id: 'ikmal-toggle-site',
      title: 'Turn ikmal off for this site',
      contexts: ['editable'],
    });
  });

  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId !== 'ikmal-toggle-site') return;
    const host = hostOf({ tab });
    if (!host) return;

    const settings = await readSettings();
    const disabled = new Set(settings.disabledHosts || []);
    if (disabled.has(host)) disabled.delete(host);
    else disabled.add(host);

    await writeSettings({ disabledHosts: [...disabled] });
    chrome.tabs.sendMessage(tab.id, { type: 'settings-changed' }).catch(() => {});
  });
}
