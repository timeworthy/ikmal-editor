import { SUPPORT_URL } from './support.js';

const statusEl = document.querySelector('#status');
const statusLabel = document.querySelector('#status-label');
const serverNote = document.querySelector('#server-note');
const endpointLabel = document.querySelector('#endpoint-label');
const enabledToggle = document.querySelector('#enabled-toggle');
const siteToggle = document.querySelector('#site-toggle');
const siteLabel = document.querySelector('#site-label');
const siteNote = document.querySelector('#site-note');
const support = document.querySelector('#support');

let settings = null;
let host = '';

function send(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => resolve(response || { ok: false }));
  });
}

async function currentHost() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    return new URL(tab.url).host;
  } catch {
    return '';
  }
}

function renderHealth(health) {
  if (health.ready) {
    statusEl.className = 'status is-ready';
    statusLabel.textContent = 'Connected';
    serverNote.classList.remove('is-visible');
    return;
  }
  statusEl.className = 'status is-down';
  statusLabel.textContent = 'Not running';
  serverNote.innerHTML = `The local server is not answering at <code>${escapeHTML(health.endpoint)}</code> (${escapeHTML(health.reason || 'unavailable')}). Start it with <code>ikmal-editor --integrated</code>, or change the address in Settings.`;
  serverNote.classList.add('is-visible');
}

function renderSettings() {
  enabledToggle.checked = settings.enabled;
  endpointLabel.textContent = settings.endpoint.replace(/^https?:\/\//, '');

  const disabled = (settings.disabledHosts || []).includes(host);
  siteLabel.textContent = host || 'This site';
  siteToggle.checked = !disabled;
  siteNote.textContent = disabled
    ? 'Checking is off for this site.'
    : 'Checking is on for this site.';
}

// The support panel is shown once, on its own, and never again after it is
// dismissed. It gates nothing: every feature works identically whether or not
// anyone ever presses the button.
function maybeShowSupport() {
  if (!settings.supportPromptSeen) support.classList.remove('is-hidden');
}

async function refresh() {
  host = await currentHost();
  const [settingsResponse, healthResponse] = await Promise.all([
    send({ type: 'settings' }),
    send({ type: 'health' }),
  ]);
  if (settingsResponse.ok) {
    settings = settingsResponse.data;
    renderSettings();
    maybeShowSupport();
  }
  if (healthResponse.ok) renderHealth(healthResponse.data);
}

async function patch(update) {
  const response = await send({ type: 'updateSettings', patch: update });
  if (response.ok) {
    settings = response.data;
    renderSettings();
  }
}

enabledToggle.addEventListener('change', () => patch({ enabled: enabledToggle.checked }));

siteToggle.addEventListener('change', () => {
  if (!host) return;
  const disabled = new Set(settings.disabledHosts || []);
  if (siteToggle.checked) disabled.delete(host);
  else disabled.add(host);
  patch({ disabledHosts: [...disabled] });
});

document.querySelector('#open-options').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

document.querySelector('#open-support').addEventListener('click', () => {
  support.classList.remove('is-hidden');
});

document.querySelector('#support-link').addEventListener('click', () => {
  chrome.tabs.create({ url: SUPPORT_URL });
  patch({ supportPromptSeen: true });
});

document.querySelector('#support-dismiss').addEventListener('click', () => {
  support.classList.add('is-hidden');
  patch({ supportPromptSeen: true });
});

function escapeHTML(value) {
  return String(value).replace(/[&<>'"]/g, (character) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]
  ));
}

const focusLabel = document.querySelector('#focus-label');
const focusDuration = document.querySelector('#focus-duration');
const focusButtons = [...document.querySelectorAll('.focus-mode-button')];

function renderFocus(state) {
  if (!state) return;
  focusLabel.textContent = state.label || 'Checking';
  focusButtons.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.mode === state.mode);
    button.setAttribute('aria-pressed', String(button.dataset.mode === state.mode));
  });
}

async function loadFocus() {
  const [focus, durations] = await Promise.all([
    send({ type: 'focus' }),
    send({ type: 'focusDurations' }),
  ]);
  if (durations?.ok && focusDuration.options.length === 0) {
    durations.data.forEach((duration) => {
      const option = document.createElement('option');
      option.value = duration.id;
      option.textContent = duration.label;
      focusDuration.appendChild(option);
    });
  }
  if (focus?.ok) renderFocus(focus.data);
}

focusButtons.forEach((button) => button.addEventListener('click', async () => {
  const response = await send({ type: 'setFocus', mode: button.dataset.mode, duration: focusDuration.value });
  if (response?.ok) renderFocus(response.data);
}));

loadFocus();
refresh();
