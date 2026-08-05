const fields = {
  endpoint: document.querySelector('#endpoint'),
  language: document.querySelector('#language'),
  motherTongue: document.querySelector('#mother-tongue'),
  checkDelayMs: document.querySelector('#delay'),
  minLength: document.querySelector('#min-length'),
};
const hostList = document.querySelector('#host-list');
const statusEl = document.querySelector('#status');
const statusLabel = document.querySelector('#status-label');
const testResult = document.querySelector('#test-result');
const saveState = document.querySelector('#save-state');

let settings = null;

function send(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => resolve(response || { ok: false }));
  });
}

function renderHealth(health) {
  statusEl.className = health.ready ? 'status is-ready' : 'status is-down';
  statusLabel.textContent = health.ready ? 'Connected' : 'Not running';
}

function renderHosts() {
  const hosts = settings.disabledHosts || [];
  hostList.textContent = '';
  if (!hosts.length) {
    const empty = document.createElement('small');
    empty.textContent = 'No sites are turned off.';
    hostList.appendChild(empty);
    return;
  }
  hosts.forEach((host) => {
    const row = document.createElement('div');
    row.className = 'host-row';
    const name = document.createElement('span');
    name.textContent = host;
    const remove = document.createElement('button');
    remove.className = 'button button-quiet';
    remove.type = 'button';
    remove.textContent = 'Turn back on';
    remove.addEventListener('click', () => {
      patch({ disabledHosts: hosts.filter((entry) => entry !== host) });
    });
    row.append(name, remove);
    hostList.appendChild(row);
  });
}

function render() {
  fields.endpoint.value = settings.endpoint;
  fields.language.value = settings.language;
  fields.motherTongue.value = settings.motherTongue || '';
  fields.checkDelayMs.value = settings.checkDelayMs;
  fields.minLength.value = settings.minLength;
  renderHosts();
}

async function patch(update) {
  const response = await send({ type: 'updateSettings', patch: update });
  if (!response.ok) {
    saveState.textContent = `Could not save: ${response.error || 'unknown error'}`;
    return;
  }
  settings = response.data;
  render();
  saveState.textContent = 'Saved.';
  setTimeout(() => { saveState.textContent = 'Changes save as you make them.'; }, 1600);
}

fields.endpoint.addEventListener('change', () => {
  const value = fields.endpoint.value.trim();
  if (!value) return;
  patch({ endpoint: value.replace(/\/+$/, '') });
});
fields.language.addEventListener('change', () => patch({ language: fields.language.value }));
fields.motherTongue.addEventListener('change', () => patch({ motherTongue: fields.motherTongue.value.trim() }));
fields.checkDelayMs.addEventListener('change', () => {
  patch({ checkDelayMs: clamp(Number(fields.checkDelayMs.value), 200, 5000, 900) });
});
fields.minLength.addEventListener('change', () => {
  patch({ minLength: clamp(Number(fields.minLength.value), 1, 200, 12) });
});

document.querySelector('#test').addEventListener('click', async () => {
  testResult.className = '';
  testResult.textContent = 'Testing…';
  const response = await send({ type: 'health' });
  const health = response.data || { ready: false, reason: 'no response' };
  renderHealth(health);
  testResult.className = health.ready ? 'is-ready' : 'is-down';
  testResult.textContent = health.ready
    ? 'Reachable.'
    : `Not reachable (${health.reason || 'unavailable'}). Start it with: ikmal-editor --integrated`;
});

function clamp(value, min, max, fallback) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

(async () => {
  const [settingsResponse, healthResponse] = await Promise.all([
    send({ type: 'settings' }),
    send({ type: 'health' }),
  ]);
  if (settingsResponse.ok) {
    settings = settingsResponse.data;
    render();
  }
  if (healthResponse.ok) renderHealth(healthResponse.data);
})();
