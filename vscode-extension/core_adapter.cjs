'use strict';

// This bridge is deliberately independent of the VS Code API. It translates
// a host document and transport payload into the shared core result, then
// provides the stale-safe correction operation used by native code actions.

const CORE_PREFERENCES = {
  sensitivity: 55,
  categories: { grammar: true, repetition: true, style: true, languagetool: true },
};

function normalizeDocumentResult(core, {
  documentId,
  text,
  revision,
  language,
  languageHint = '',
  response,
  focus = { mode: 'active', until: null },
  preferences = CORE_PREFERENCES,
  checkedAt = Date.now(),
} = {}) {
  const document = core.createTextDocument({ id: documentId, text, revision, language, source: 'vscode' });
  const request = core.createCheckRequest(document);
  const result = core.normalizeCheckResult({ ...request, languageHint }, response, checkedAt, focus);
  const current = core.resultIsCurrent(document, result);
  return {
    document,
    request,
    result,
    current,
    matches: current ? core.filterIssues(result.matches, preferences, focus, checkedAt) : [],
  };
}

function applyIssueCorrection(core, { document, result, issueId, replacement } = {}) {
  if (!document || !result || !core.resultIsCurrent(document, result)) return null;
  const issue = result.matches.find((candidate) => candidate.id === issueId);
  const value = replacement ?? issue?.replacements?.[0]?.value;
  if (!issue || typeof value !== 'string') return null;
  return core.applyCorrection(document, {
    offset: issue.offset,
    length: issue.length,
  }, value, {
    issueId: issue.id,
    source: issue.source,
    kind: 'correction',
  });
}

module.exports = { CORE_PREFERENCES, normalizeDocumentResult, applyIssueCorrection };
