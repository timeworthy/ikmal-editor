const endpoint = document.querySelector('#endpoint');
const language = document.querySelector('#language');
const includeQuotedText = document.querySelector('#includeQuotedText');
const status = document.querySelector('#status');
const matches = document.querySelector('#matches');
let tabId;
let result;

function render() {
  matches.textContent = '';
  (result?.matches || []).forEach((match, index) => {
    const item = document.createElement('li');
    const message = document.createElement('span');
    message.textContent = match.message || 'Review this passage.';
    const apply = document.createElement('button');
    apply.textContent = `Apply “${match.replacements?.[0]?.value || 'suggestion'}”`;
    apply.addEventListener('click', async () => {
      const response = await browser.runtime.sendMessage({ type: 'apply-compose', tabId, match });
      if (!response?.ok) status.textContent = response?.error || 'Could not apply the suggestion.';
      else { status.textContent = 'Applied.'; result = null; render(); }
    });
    item.append(message, apply);
    matches.append(item);
  });
}

async function load() {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  tabId = tabs[0]?.id;
  if (!tabId) { status.textContent = 'No compose window is active.'; return; }
  const stored = await browser.storage.local.get({ endpoint: 'http://127.0.0.1:8096', language: 'auto', includeQuotedText: false });
  endpoint.value = stored.endpoint;
  language.value = stored.language;
  includeQuotedText.checked = Boolean(stored.includeQuotedText);
}

document.querySelector('#check').addEventListener('click', async () => {
  await browser.storage.local.set({ endpoint: endpoint.value, language: language.value, includeQuotedText: includeQuotedText.checked });
  status.textContent = 'Checking…';
  result = await browser.runtime.sendMessage({ type: 'check-compose', tabId });
  status.textContent = result?.skipped ? `Skipped: ${result.skipped}` : `Found ${result?.matches?.length || 0} suggestion${result?.matches?.length === 1 ? '' : 's'}.`;
  render();
});
load();
