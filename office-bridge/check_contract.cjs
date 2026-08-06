'use strict';

const CHECK_CONTRACT_VERSION = 'ikmal-check-v1';

function buildCheckBody({ text, language = 'auto', motherTongue = '' } = {}) {
  const body = new URLSearchParams({
    text: String(text || ''),
    language: String(language || 'auto'),
  });
  if (motherTongue) body.set('motherTongue', String(motherTongue));
  return body.toString();
}

function normalizeCheckResponse(value) {
  const response = value && typeof value === 'object' ? value : {};
  return {
    ...response,
    matches: Array.isArray(response.matches) ? response.matches : [],
    ikmalAntecedents: Array.isArray(response.ikmalAntecedents) ? response.ikmalAntecedents : [],
  };
}

function resultIsCurrent(currentText, requestedText) {
  return String(currentText ?? '') === String(requestedText ?? '');
}

module.exports = {
  CHECK_CONTRACT_VERSION,
  buildCheckBody,
  normalizeCheckResponse,
  resultIsCurrent,
};
