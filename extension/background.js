// Service worker. Owns every network call so content scripts never touch the
// network directly, and so the single place that can make a request is one
// file you can audit in a minute.
//
// The only hosts this extension is permitted to reach are 127.0.0.1 and
// localhost, declared in the manifest. There is no analytics call, no update
// ping, and no remote fallback.

import { readSettings, writeSettings, checkURL, healthURL, hostIsDisabled } from './config.js';
import { buildCheckBody, normalizeCheckResponse } from './core/check_contract.js';
import * as writingCore from './core/writing_core.js';
import { planChunkedCheck, mergeChunkedCheck, chunkedCheckState } from './adapters/chunked_checks.js';
import { resolveFocusState, applyFocusState, filterMatches, describeFocusState, startFocusState, FOCUS_DURATIONS } from './core/focus_mode.js';
import { parseExtensionMessage } from './adapters/extension_messages.js';

// The browser adapter has no sensitivity slider of its own, so a mode is
// applied to these canonical defaults. Active therefore changes nothing, which
// is what it should do.
const BASE_PREFERENCES = {
  mode: 'automatic',
  sensitivity: 55,
  categories: { grammar: true, repetition: true, style: true, languagetool: true },
};

// What the last check found for a field, so the next one can keep the findings
// it did not look at. Held here rather than in the content script so the page
// never has to ship its findings back and forth. A service worker restart
// simply empties this, and an empty entry means the next check is a whole one —
// slower, and correct.
const fieldFindings = new Map();

function fieldKey(sender, fieldID) {
  return `${sender?.tab?.id ?? 'no-tab'}:${sender?.frameId ?? 0}:${fieldID || 'field'}`;
}

async function checkText({ text, language, languageHint, host, caret, fieldID, scope, selection = false }, sender) {
  const settings = await readSettings();

  if (!settings.enabled) return { skipped: 'disabled' };
  if (hostIsDisabled(settings, host)) return { skipped: 'host-disabled' };

  // Pause is answered here rather than in the content script so no request is
  // made at all, and so every caller gets the same answer.
  const focus = resolveFocusState(settings.focusMode);
  if (focus.mode === 'paused') return { skipped: 'paused', focus };

  // Selection summaries are useful for a phrase as well as a passage. The
  // normal typing path still avoids noisy requests for a nearly empty field.
  if (!selection && (!text || text.trim().length < settings.minLength)) {
    return { skipped: 'too-short' };
  }

  // A selection check is already a slice of the field chosen by the user, so it
  // is never chunked further.
  const key = fieldKey(sender, fieldID);
  const plan = selection
    ? { text, sent: text, chunk: null, carried: null }
    : planChunkedCheck(writingCore, text, fieldFindings.get(key), { caret, scope });
  const sent = plan.sent;

  const requestedLanguage = language || settings.language || 'en-US';
  let result = await requestCheck(settings, sent, requestedLanguage);
  const hint = normalizeLanguageHint(languageHint);
  const detected = result.language?.detectedLanguage;
  // LanguageTool's automatic detector is good with sentences and poor with
  // short, typo-heavy fragments. If it is uncertain and the browser has a
  // language hint, retry once in that language instead of surfacing a wholly
  // different-language message (for example Tagalog for a short English note).
  if (requestedLanguage === 'auto' && hint && shouldUseLanguageHint(sent, detected, hint)) {
    try {
      result = await requestCheck(settings, sent, hint);
    } catch {
      // Keep the original automatic result if the conservative retry fails.
    }
  }
  result = mergeChunkedCheck(result, plan);
  // The dictionary filters against the text the offsets belong to, which is the
  // whole field once a chunk result has been merged back into it.
  result.matches = filterDictionaryMatches(result.matches, text, settings.dictionary);
  if (!selection) fieldFindings.set(key, chunkedCheckState(plan, result));
  // Zen keeps checking and narrows what comes back, using the same rules the
  // desktop applies to the same findings.
  const effective = applyFocusState(BASE_PREFERENCES, focus);
  return { ...result, matches: filterMatches(result.matches, effective), focus };
}

function filterDictionaryMatches(matches, text, dictionary) {
  const words = new Set((Array.isArray(dictionary) ? dictionary : [])
    .map((word) => String(word || '').trim().toLocaleLowerCase())
    .filter(Boolean));
  if (!words.size) return matches;
  return (Array.isArray(matches) ? matches : []).filter((match) => {
    const issueType = String(match?.rule?.issueType || '').toLowerCase();
    const category = String(match?.rule?.category?.id || '').toLowerCase();
    const rule = String(match?.rule?.id || '').toLowerCase();
    const spelling = issueType.includes('misspell') || category.includes('spell')
      || category.includes('typo') || rule.includes('morfologik');
    if (!spelling) return true;
    const word = String(text || '').slice(Number(match.offset), Number(match.offset) + Number(match.length))
      .trim().toLocaleLowerCase();
    return !words.has(word);
  });
}

async function requestCheck(settings, text, language) {
  const body = buildCheckBody({ text, language, motherTongue: settings.motherTongue });
  const response = await fetch(checkURL(settings.endpoint), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`The local server answered with HTTP ${response.status}.`);
  return normalizeCheckResponse(await response.json());
}

function normalizeLanguageHint(value) {
  const hint = String(value || '').trim();
  if (/^en-(GB|AU|CA|IE|NZ)$/i.test(hint)) return 'en-GB';
  if (/^en(?:-|$)/i.test(hint)) return 'en-US';
  if (/^de(?:-|$)/i.test(hint)) return 'de-DE';
  if (/^fr(?:-|$)/i.test(hint)) return 'fr';
  if (/^es(?:-|$)/i.test(hint)) return 'es';
  if (/^pt-BR$/i.test(hint)) return 'pt-BR';
  if (/^nl(?:-|$)/i.test(hint)) return 'nl';
  return '';
}

function shouldUseLanguageHint(text, detected, hint) {
  const confidence = Number(detected?.confidence);
  const detectedBase = String(detected?.code || '').split('-')[0].toLowerCase();
  const hintBase = hint.split('-')[0].toLowerCase();
  return String(text || '').trim().length <= 140
    && Number.isFinite(confidence)
    && confidence < 0.8
    && detectedBase
    && detectedBase !== hintBase;
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

const WORKSPACE_TOKEN_TTL_MS = 5 * 60 * 1000;

async function sweepWorkspaceTokens() {
  const stored = await chrome.storage.local.get(null);
  const cutoff = Date.now() - WORKSPACE_TOKEN_TTL_MS;
  const stale = Object.entries(stored)
    .filter(([key, value]) => key.startsWith('ikmal-workspace-') && Number(value?.createdAt) < cutoff)
    .map(([key]) => key);
  if (stale.length) await chrome.storage.local.remove(stale);
}

async function openIssueWorkspace(sender) {
  const tabID = sender?.tab?.id;
  if (!Number.isInteger(tabID)) throw new Error('There is no active editor to show.');
  const snapshot = await chrome.tabs.sendMessage(tabID, { type: 'getIssues' });
  if (!snapshot?.ok) throw new Error(snapshot?.error || 'Could not read the active editor.');
  const token = `ikmal-workspace-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  // workspace.js removes its own token once it has read it, so a leftover key
  // means that tab was closed before it loaded. Nothing will ever collect those,
  // so sweep them here rather than letting them accumulate in local storage.
  await sweepWorkspaceTokens();
  await chrome.storage.local.set({ [token]: { tabID, ...snapshot.data, createdAt: Date.now() } });
  const url = `${chrome.runtime.getURL('workspace.html')}?token=${encodeURIComponent(token)}`;
  await chrome.tabs.create({ url });
  return { opened: true };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const parsedMessage = parseExtensionMessage(message);
  if (!parsedMessage) {
    sendResponse({ ok: false, error: 'Rejected extension message.' });
    return false;
  }
  message = parsedMessage;
  // Every branch resolves or rejects so the content script is never left
  // waiting on a promise that silently disappears with the worker.
  const handlers = {
    check: () => checkText({ ...message, host: hostOf(sender) }, sender),
    health: () => readHealth(),
    settings: () => readSettings(),
    focus: () => readFocus(),
    focusDurations: async () => FOCUS_DURATIONS,
    setFocus: () => setFocus(message),
    openSettings: async () => chrome.runtime.openOptionsPage(),
    openWorkspace: () => openIssueWorkspace(sender),
    getWorkspaceIssues: async () => {
      const tabID = Number(message.tabID);
      if (!Number.isInteger(tabID)) throw new Error('The source editor is no longer available.');
      const response = await chrome.tabs.sendMessage(tabID, { type: 'getIssues' });
      if (!response?.ok) throw new Error(response?.error || 'Could not read the active editor.');
      return response.data;
    },
    applyWorkspaceIssue: async () => {
      const tabID = Number(message.tabID);
      if (!Number.isInteger(tabID)) throw new Error('The source editor is no longer available.');
      return chrome.tabs.sendMessage(tabID, {
        type: 'applyIssue',
        index: message.index,
        // Forwarded so the content script can reject a stale index rather than
        // rewriting whatever match now sits at that position.
        offset: message.offset,
        length: message.length,
        replacement: message.replacement,
      });
    },
    updateSettings: () => writeSettings(message.patch || {}),
    addDictionary: async () => {
      const word = String(message.word || '').trim();
      if (!word) throw new Error('There is no word to add.');
      const settings = await readSettings();
      const dictionary = [...new Set([...(settings.dictionary || []), word])];
      await writeSettings({ dictionary });
      return { word };
    },
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

  chrome.tabs.onRemoved.addListener((tabID) => {
    for (const key of fieldFindings.keys()) {
      if (key.startsWith(`${tabID}:`)) fieldFindings.delete(key);
    }
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
