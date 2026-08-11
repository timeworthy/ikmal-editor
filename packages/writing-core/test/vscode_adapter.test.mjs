import assert from 'node:assert/strict';
import test from 'node:test';
import * as core from '../dist/index.js';
import { createTextDocument } from '../dist/index.js';
import { applyIssueCorrection, normalizeDocumentResult } from '../../../vscode-extension/core_adapter.cjs';
import { documentFixture, rawCheckFixture } from './fixtures.mjs';

const coreRequest = {
  documentId: documentFixture.id,
  text: documentFixture.text,
  revision: documentFixture.revision,
  language: documentFixture.language,
  languageHint: 'en-US',
  response: rawCheckFixture,
  checkedAt: 1234,
};

test('VS Code bridge returns normalized diagnostics from the shared core', () => {
  const normalized = normalizeDocumentResult(core, coreRequest);
  assert.equal(normalized.current, true);
  assert.deepEqual(normalized.matches.map((issue) => ({ offset: issue.offset, category: issue.category })), [
    { offset: 4, category: 'grammar' },
    { offset: 31, category: 'repetition' },
    { offset: 52, category: 'relationship' },
  ]);
});

test('VS Code Apply uses a current revision and returns an undo record', () => {
  const normalized = normalizeDocumentResult(core, coreRequest);
  const issue = normalized.matches[0];
  const applied = applyIssueCorrection(core, {
    document: normalized.document,
    result: normalized.result,
    issueId: issue.id,
  });
  assert.equal(applied.document.text, 'The result is ready. The draft draft is concise. It are useful.');
  assert.equal(applied.record.issueId, issue.id);

  const newer = createTextDocument({ ...documentFixture, revision: documentFixture.revision + 1 });
  assert.equal(applyIssueCorrection(core, { document: newer, result: normalized.result, issueId: issue.id }), null);
});
