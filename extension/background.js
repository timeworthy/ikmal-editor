// Service worker. Owns every network call so content scripts never touch the
// network directly, and so the single place that can make a request is one
// file you can audit in a minute.
//
// The only hosts this extension is permitted to reach are 127.0.0.1 and
// localhost, declared in the manifest. There is no analytics call, no update
// ping, and no remote fallback.

import { readSettings, writeSettings, checkURL, healthURL, hostIsDisabled } from './config.js';
import { buildCheckBody, normalizeCheckResponse } from './core/check_contract.js';

async function checkText({ text, language, host }) {
  const settings = await readSettings();

  if (!settings.enabled) return { skipped: 'disabled' };
  if (hostIsDisabled(settings, host)) return { skipped: 'host-disabled' };
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
  return normalizeCheckResponse(await response.json());
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Every branch resolves or rejects so the content script is never left
  // waiting on a promise that silently disappears with the worker.
  const handlers = {
    check: () => checkText({ ...message, host: hostOf(sender) }),
    health: () => readHealth(),
    settings: () => readSettings(),
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
