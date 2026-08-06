// CommonJS host copy of the versioned check contract. VS Code extensions run
// in a Node host, while the browser adapter is packaged as an ES module; both
// implementations are covered by the same contract smoke test.

const CHECK_CONTRACT_VERSION = 'ikmal-check-v1';

function buildCheckBody({ text, language = 'auto', motherTongue = '' } = {}) {
  const body = new URLSearchParams({
    text: String(text || ''),
    language: String(language || 'auto'),
  });
  if (motherTongue) body.set('motherTongue', String(motherTongue));
  return body.toString();
}

function normalizeCheckResponse(payload) {
  const response = payload && typeof payload === 'object' ? payload : {};
  return {
    ...response,
    matches: Array.isArray(response.matches) ? response.matches : [],
    ikmalAntecedents: Array.isArray(response.ikmalAntecedents) ? response.ikmalAntecedents : [],
  };
}

function resultIsCurrent(currentText, requestedText) {
  return String(currentText ?? '') === String(requestedText ?? '');
}

module.exports = { CHECK_CONTRACT_VERSION, buildCheckBody, normalizeCheckResponse, resultIsCurrent };
