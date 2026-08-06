// Shared settings contract for the service worker, popup, and options page.
//
// Every default here points at loopback. The extension has no remote endpoint
// to fall back to and no account to sign into: if your own server is not
// running, the extension reports that and does nothing else.

export const DEFAULT_SETTINGS = {
  // The ikmal quality proxy speaks the LanguageTool /v2/check protocol and
  // layers the local quality sidecar on top. Point this at a bare
  // LanguageTool server (port 8097) to skip the ikmal additions.
  endpoint: 'http://127.0.0.1:8096',
  language: 'auto',
  motherTongue: '',
  enabled: true,
  checkDelayMs: 900,
  minLength: 12,
  disabledHosts: [],
  // Pause and Zen. Shape and semantics live in core/focus_mode.js; this is only
  // where the browser adapter persists it.
  focusMode: { mode: 'active', until: null },
  // Support prompt state. The prompt is shown once, is dismissible forever,
  // and gates nothing. See SUPPORT.md for why it works this way.
  supportPromptSeen: false,
};

export async function readSettings() {
  const stored = await chrome.storage.local.get(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function writeSettings(patch) {
  await chrome.storage.local.set(patch);
  return readSettings();
}

export function hostIsDisabled(settings, host) {
  if (!host) return false;
  return (settings.disabledHosts || []).includes(host);
}

export function checkURL(endpoint) {
  return `${String(endpoint).replace(/\/+$/, '')}/v2/check`;
}

export function healthURL(endpoint) {
  return `${String(endpoint).replace(/\/+$/, '')}/health`;
}
