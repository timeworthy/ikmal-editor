import { SUPPORT_URL } from './support.js';

const statusEl = document.querySelector('#status');
const statusLabel = document.querySelector('#status-label');
const serverNote = document.querySelector('#server-note');
const enabledToggle = document.querySelector('#enabled-toggle');
const siteToggle = document.querySelector('#site-toggle');
const siteLabel = document.querySelector('#site-label');
const siteNote = document.querySelector('#site-note');
const languageSelect = document.querySelector('#language-select');
const languageNote = document.querySelector('#language-note');
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
  serverNote.textContent = '';
  const endpoint = document.createElement('code');
  endpoint.textContent = health.endpoint;
  const command = document.createElement('code');
  command.textContent = 'ikmal-editor --integrated';
  serverNote.append(
    document.createTextNode('The local server is not answering at '),
    endpoint,
    document.createTextNode(` (${health.reason || 'unavailable'}). Start it with `),
    command,
    document.createTextNode(', or change the address in Settings.'),
  );
  serverNote.classList.add('is-visible');
}

function renderSettings() {
  enabledToggle.checked = settings.enabled;

  languageSelect.value = settings.language || 'en-US';
  const languageName = languageSelect.options[languageSelect.selectedIndex]?.textContent || 'English (US)';
  languageNote.textContent = languageSelect.value === 'auto'
    ? 'Automatic detection · short text uses your browser locale as a tie-break'
    : `Checking as ${languageName}`;

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

languageSelect.addEventListener('change', () => patch({ language: languageSelect.value }));

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

const focusLabel = document.querySelector('#focus-label');
const focusButton = document.querySelector('.focus-mode-button[data-mode="active"]');
const focusPickers = [
  { mode: 'paused', element: document.querySelector('.focus-picker[data-mode="paused"]') },
  { mode: 'zen', element: document.querySelector('.focus-picker[data-mode="zen"]') },
];

function renderFocus(state) {
  if (!state) return;
  focusLabel.textContent = state.mode === 'active' ? 'Automatic' : (state.label || 'Checking');
  focusButton.classList.toggle('is-active', state.mode === 'active');
  focusButton.setAttribute('aria-pressed', String(state.mode === 'active'));
  focusPickers.forEach(({ mode, element }) => {
    element.classList.toggle('is-active', mode === state.mode);
    if (mode !== state.mode) element.removeAttribute('open');
  });
}

async function loadFocus() {
  const [focus, durations] = await Promise.all([
    send({ type: 'focus' }),
    send({ type: 'focusDurations' }),
  ]);
  if (durations?.ok && Array.isArray(durations.data)) {
    focusPickers.forEach(({ mode, element }) => {
      const options = element.querySelector('.focus-picker-options');
      if (options.children.length) return;
      durations.data.forEach((duration) => {
        const option = document.createElement('button');
        option.type = 'button';
        option.className = 'focus-picker-option';
        option.textContent = duration.label;
        option.addEventListener('click', async (event) => {
          event.preventDefault();
          const response = await send({ type: 'setFocus', mode, duration: duration.id });
          if (response?.ok) {
            renderFocus(response.data);
            element.removeAttribute('open');
          }
        });
        options.appendChild(option);
      });
    });
  }
  if (focus?.ok) renderFocus(focus.data);
}

focusButton.addEventListener('click', async () => {
  const response = await send({ type: 'setFocus', mode: 'active' });
  if (response?.ok) renderFocus(response.data);
});

document.addEventListener('click', (event) => {
  const currentPicker = event.target instanceof Element
    ? event.target.closest('.focus-picker')
    : null;
  focusPickers.forEach(({ element }) => {
    if (element !== currentPicker) element.removeAttribute('open');
  });
});

loadFocus();
refresh();
