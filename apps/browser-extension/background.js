import { parseExtensionMessage } from './extension_messages.js';
import { buildCheckBody, normalizeCheckResponse } from './check_contract.js';

const CHECK_ENDPOINT = 'http://127.0.0.1:8096/v2/check';

async function checkText(message) {
  const response = await fetch(CHECK_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: buildCheckBody({ text: message.text, language: message.language || 'auto' }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Local checker answered with HTTP ${response.status}.`);
  return normalizeCheckResponse(await response.json());
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const parsed = parseExtensionMessage(message);
  if (!parsed || parsed.type !== 'check') {
    sendResponse({ ok: false, error: 'Rejected browser-slice message.' });
    return false;
  }
  checkText(parsed)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error) => sendResponse({ ok: false, error: error.message || 'Local checker unavailable.' }));
  return true;
});
