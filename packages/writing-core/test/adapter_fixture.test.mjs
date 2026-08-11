import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { normalizeCheckResult } from '../src/index.ts';
import { documentFixture, rawCheckFixture } from './fixtures.mjs';
import {
  normalizeCheckResponse as browserNormalize,
} from '../../../extension/core/check_contract.js';

const require = createRequire(import.meta.url);
const vscodeContract = require('../../../vscode-extension/check_contract.cjs');
const officeContract = require('../../../office-bridge/check_contract.cjs');

const request = {
  documentId: documentFixture.id,
  revision: documentFixture.revision,
  text: documentFixture.text,
  language: documentFixture.language,
  languageHint: 'en-US',
};

test('browser, VS Code, and Office transport normalizers feed one core result', () => {
  const contracts = [browserNormalize, vscodeContract.normalizeCheckResponse, officeContract.normalizeCheckResponse];
  const snapshots = contracts.map((normalize) => {
    const transportResult = normalize(rawCheckFixture);
    const result = normalizeCheckResult(request, transportResult, 1234);
    return {
      ids: result.matches.map((issue) => issue.id),
      categories: result.matches.map((issue) => issue.category),
      relationships: result.relationships,
      language: result.language,
    };
  });
  assert.deepEqual(snapshots[1], snapshots[0]);
  assert.deepEqual(snapshots[2], snapshots[0]);
});
