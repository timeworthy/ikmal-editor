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

// A check runs against more than one engine and the proxy answers with
// whatever replied, so a result can be missing a whole class of findings. That
// is not a shorter list, it is a different check: presenting it as complete
// would tell a writer their grammar is fine when grammar was never examined.
// Hosts name the engines that did not answer instead.
const DEGRADED_CHECK_LABELS = { ikmalLanguageToolWarning: 'grammar', ikmalQualityWarning: 'quality' };

function degradedCheckSources(payload) {
  const response = payload && typeof payload === 'object' ? payload : {};
  return Object.entries(DEGRADED_CHECK_LABELS)
    .filter(([field]) => response[field])
    .map(([, label]) => label);
}

function degradedCheckMessage(payload) {
  const sources = degradedCheckSources(payload);
  return sources.length ? `Some checks did not run: ${sources.join(' and ')}. Findings may be incomplete.` : '';
}

function normalizeCheckResponse(payload) {
  const response = payload && typeof payload === 'object' ? payload : {};
  return {
    ...response,
    matches: Array.isArray(response.matches) ? response.matches : [],
    ikmalAntecedents: Array.isArray(response.ikmalAntecedents) ? response.ikmalAntecedents : [],
    // Derived once here so every consumer reads one field instead of knowing
    // which engines exist and what each one calls its warning.
    ...(degradedCheckSources(response).length ? { ikmalDegradedChecks: degradedCheckSources(response) } : {}),
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
  degradedCheckSources,
  degradedCheckMessage,
};
