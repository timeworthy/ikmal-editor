'use strict';

// Host-neutral LanguageTool transport used by the thin Obsidian, Joplin, and
// Thunderbird adapters. The host still owns document projection and Apply;
// this file only owns the bounded local request and result filtering.

const DEFAULT_SETTINGS = Object.freeze({
  endpoint: 'http://127.0.0.1:8096',
  language: 'auto',
  motherTongue: '',
  checkDelayMs: 900,
  minLength: 12,
  maxLength: 20000,
  enabled: true,
  dictionary: [],
  ignoredRules: [],
  includeQuotedText: false,
});

function isLoopbackHostname(hostname) {
  const value = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  return value === 'localhost' || value === '127.0.0.1' || value === '::1';
}

function normalizeSettings(value = {}) {
  const settings = { ...DEFAULT_SETTINGS, ...(value && typeof value === 'object' ? value : {}) };
  let endpoint;
  try {
    endpoint = new URL(String(settings.endpoint || DEFAULT_SETTINGS.endpoint));
  } catch {
    throw new Error('ikmal only connects to a loopback endpoint.');
  }
  if (!['http:', 'https:'].includes(endpoint.protocol) || !isLoopbackHostname(endpoint.hostname)) {
    throw new Error('ikmal only connects to a loopback endpoint.');
  }
  endpoint.pathname = endpoint.pathname.replace(/\/+$/, '').replace(/\/v2(\/check)?$/i, '');
  settings.endpoint = endpoint.toString().replace(/\/$/, '');
  settings.language = String(settings.language || 'auto');
  settings.motherTongue = String(settings.motherTongue || '');
  settings.checkDelayMs = Math.max(200, Math.min(2000, Number(settings.checkDelayMs) || 900));
  settings.minLength = Math.max(1, Math.min(1000, Number(settings.minLength) || 12));
  settings.maxLength = Math.max(settings.minLength, Math.min(100000, Number(settings.maxLength) || 20000));
  settings.dictionary = Array.isArray(settings.dictionary) ? settings.dictionary.map(String) : [];
  settings.ignoredRules = Array.isArray(settings.ignoredRules) ? settings.ignoredRules.map(String) : [];
  settings.includeQuotedText = Boolean(settings.includeQuotedText);
  return settings;
}

function buildCheckBody(text, settings) {
  const body = new URLSearchParams({
    text: String(text || ''),
    language: String(settings.language || 'auto'),
  });
  if (settings.motherTongue) body.set('motherTongue', settings.motherTongue);
  return body.toString();
}

function normalizeMatches(response) {
  const payload = response && typeof response === 'object' ? response : {};
  return Array.isArray(payload.matches) ? payload.matches.filter((match) => (
    match && Number.isFinite(Number(match.offset)) && Number(match.offset) >= 0
    && Number.isFinite(Number(match.length)) && Number(match.length) > 0
  )) : [];
}

function filterMatches(matches, text, settings) {
  const dictionary = new Set(settings.dictionary.map((word) => word.trim().toLocaleLowerCase()).filter(Boolean));
  const ignored = new Set(settings.ignoredRules.map((rule) => rule.toLocaleLowerCase()));
  return matches.filter((match) => {
    const rule = String(match.rule?.id || '').toLocaleLowerCase();
    if (ignored.has(rule)) return false;
    const issueType = String(match.rule?.issueType || '').toLocaleLowerCase();
    const category = String(match.rule?.category?.id || '').toLocaleLowerCase();
    const spelling = issueType.includes('misspell') || category.includes('spell') || category.includes('typo') || rule.includes('morfologik');
    if (!spelling || !dictionary.size) return true;
    const word = String(text).slice(Number(match.offset), Number(match.offset) + Number(match.length)).trim().toLocaleLowerCase();
    return !dictionary.has(word);
  });
}

async function checkText(text, value, fetchImpl = globalThis.fetch) {
  const settings = normalizeSettings(value);
  const source = String(text || '');
  if (!settings.enabled || source.trim().length < settings.minLength) return { skipped: 'disabled-or-too-short', matches: [], settings };
  if (source.length > settings.maxLength) return { skipped: 'too-long', matches: [], settings };
  if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required.');
  const response = await fetchImpl(`${settings.endpoint}/v2/check`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: buildCheckBody(source, settings),
  });
  if (!response.ok) throw new Error(`The local checker answered with HTTP ${response.status}.`);
  const payload = await response.json();
  const matches = filterMatches(normalizeMatches(payload), source, settings);
  return { ...payload, matches, settings };
}

function applyMatch(text, match, replacement) {
  const source = String(text || '');
  const offset = Number(match?.offset);
  const length = Number(match?.length);
  if (!Number.isInteger(offset) || !Number.isInteger(length) || offset < 0 || length <= 0 || offset + length > source.length) return null;
  const value = replacement ?? match?.replacements?.[0]?.value;
  if (typeof value !== 'string') return null;
  return `${source.slice(0, offset)}${value}${source.slice(offset + length)}`;
}

const LanguageToolAPI = {
  DEFAULT_SETTINGS,
  applyMatch,
  buildCheckBody,
  checkText,
  filterMatches,
  isLoopbackHostname,
  normalizeMatches,
  normalizeSettings,
};

if (typeof module !== 'undefined' && module.exports) module.exports = LanguageToolAPI;
else globalThis.IkmalLanguageTool = LanguageToolAPI;
