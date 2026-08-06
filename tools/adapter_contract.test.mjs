import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import {
  CHECK_CONTRACT_VERSION as browserVersion,
  buildCheckBody as browserBuild,
  normalizeCheckResponse as browserNormalize,
  resultIsCurrent as browserCurrent,
} from '../extension/core/check_contract.js';

const require = createRequire(import.meta.url);
const vscodeContract = require('../vscode-extension/check_contract.cjs');
const officeContract = require('../office-bridge/check_contract.cjs');

test('browser and VS Code adapters share the check contract', () => {
  const input = { text: 'The results is ready.', language: 'en-US', motherTongue: 'fr' };
  assert.equal(browserVersion, vscodeContract.CHECK_CONTRACT_VERSION);
  assert.equal(browserVersion, officeContract.CHECK_CONTRACT_VERSION);
  assert.equal(browserBuild(input), vscodeContract.buildCheckBody(input));
  assert.equal(browserBuild(input), officeContract.buildCheckBody(input));
  const payload = { matches: [{ offset: 4, length: 7, replacements: [{ value: 'result' }] }] };
  assert.deepEqual(browserNormalize(payload), vscodeContract.normalizeCheckResponse(payload));
  assert.deepEqual(browserNormalize(payload), officeContract.normalizeCheckResponse(payload));
  assert.equal(browserCurrent('same', 'same'), vscodeContract.resultIsCurrent('same', 'same'));
  assert.equal(browserCurrent('old', 'new'), vscodeContract.resultIsCurrent('old', 'new'));
  assert.equal(browserCurrent('same', 'same'), officeContract.resultIsCurrent('same', 'same'));
  assert.equal(browserCurrent('old', 'new'), officeContract.resultIsCurrent('old', 'new'));
});
