importScripts('../common/languagetool.cjs', './compose_projection.js');
const { checkText: checkLanguageToolText, normalizeSettings: normalizeLanguageToolSettings } = globalThis.IkmalLanguageTool;
const { applyComposeMatch: applyProjectedMatch, projectComposeBody: projectComposeText } = globalThis.IkmalComposeProjection;

const DEFAULTS = {
  endpoint: 'http://127.0.0.1:8096',
  language: 'auto',
  minLength: 12,
  maxLength: 20000,
  dictionary: [],
  ignoredRules: [],
  includeQuotedText: false,
};

async function settings() {
  return normalizeLanguageToolSettings({ ...DEFAULTS, ...(await browser.storage.local.get(DEFAULTS)) });
}

async function composeDetails(tabId) {
  return browser.compose.getComposeDetails(tabId);
}

async function checkCompose(tabId) {
  const current = await settings();
  const details = await composeDetails(tabId);
  const projection = projectComposeText(details.body || '', current);
  const result = await checkLanguageToolText(projection.text, current);
  return { ...result, tabId, body: details.body || '', projection };
}

browser.runtime.onMessage.addListener(async (message) => {
  if (!message || typeof message !== 'object') return undefined;
  if (message.type === 'check-compose') return checkCompose(message.tabId);
  if (message.type === 'apply-compose') {
    const current = await settings();
    const details = await composeDetails(message.tabId);
    const applied = applyProjectedMatch(details.body || '', message.match, undefined, current);
    if (!applied) return { ok: false, error: 'That compose suggestion is stale.' };
    await browser.compose.setComposeDetails(message.tabId, { body: applied.html, isPlainText: false });
    return { ok: true, body: applied.html };
  }
  return undefined;
});
