// Host-neutral contract helpers shared by browser adapters and future host
// adapters. Network ownership stays with the host's background/runtime layer;
// this module only defines the request and response shape.

export const CHECK_CONTRACT_VERSION = 'ikmal-check-v1';

export function buildCheckBody({ text, language = 'auto', motherTongue = '' } = {}) {
  const body = new URLSearchParams({
    text: String(text || ''),
    language: String(language || 'auto'),
  });
  if (motherTongue) body.set('motherTongue', String(motherTongue));
  return body.toString();
}

export function normalizeCheckResponse(payload) {
  const response = payload && typeof payload === 'object' ? payload : {};
  return {
    ...response,
    matches: Array.isArray(response.matches) ? response.matches : [],
    ikmalAntecedents: Array.isArray(response.ikmalAntecedents) ? response.ikmalAntecedents : [],
  };
}

export function resultIsCurrent(currentText, requestedText) {
  return String(currentText ?? '') === String(requestedText ?? '');
}
