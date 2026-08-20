'use strict';

const { checkText, applyMatch, normalizeSettings, isLoopbackHostname } = require('../common/languagetool.cjs');

const DEFAULT_NATIVE_SETTINGS = Object.freeze({
  endpoint: 'http://127.0.0.1:8097',
  language: 'auto',
  motherTongue: '',
  enabled: true,
  dictionary: [],
  ignoredRules: [],
});

function validateNativeEndpoint(value) {
  const parsed = new URL(String(value || DEFAULT_NATIVE_SETTINGS.endpoint));
  if (!['http:', 'https:'].includes(parsed.protocol) || !isLoopbackHostname(parsed.hostname)) {
    throw new Error('LibreOffice LanguageTool endpoint must be loopback-only.');
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, '').replace(/\/v2(\/check)?$/i, '');
  return parsed.toString().replace(/\/$/, '');
}

function nativeConfig(value = {}) {
  const settings = { ...DEFAULT_NATIVE_SETTINGS, ...(value && typeof value === 'object' ? value : {}) };
  settings.endpoint = validateNativeEndpoint(settings.endpoint);
  settings.language = String(settings.language || 'auto');
  settings.motherTongue = String(settings.motherTongue || '');
  settings.dictionary = Array.isArray(settings.dictionary) ? settings.dictionary : [];
  settings.ignoredRules = Array.isArray(settings.ignoredRules) ? settings.ignoredRules : [];
  return settings;
}

async function checkUnoText(text, value, fetchImpl) {
  const settings = nativeConfig(value);
  if (!settings.enabled) return { skipped: 'disabled', matches: [], settings };
  return checkText(text, normalizeSettings({ ...settings, minLength: 1 }), fetchImpl);
}

function applyUnoMatch(text, match, replacement) {
  const next = applyMatch(text, match, replacement);
  if (next == null) return null;
  return { text: next, range: { start: Number(match.offset), end: Number(match.offset) + Number(match.length) } };
}

module.exports = { DEFAULT_NATIVE_SETTINGS, applyUnoMatch, checkUnoText, nativeConfig, validateNativeEndpoint };
