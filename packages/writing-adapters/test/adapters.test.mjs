import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EXTENSION_CONTRACT_VERSION,
  errorResponse,
  okResponse,
  parseExtensionMessage,
} from '../dist/extension_messages.js';
import {
  DESKTOP_EVENT_CHANNELS,
  DESKTOP_INVOKE_CHANNELS,
  DESKTOP_IPC_CONTRACT_VERSION,
  isDesktopEventChannel,
  isDesktopInvokeChannel,
  parseDesktopInvoke,
} from '../dist/desktop_ipc.js';

test('extension messages accept bounded known shapes and reject malformed or unknown input', () => {
  assert.equal(EXTENSION_CONTRACT_VERSION, 'ikmal-extension-v1');
  assert.deepEqual(parseExtensionMessage({ type: 'check', text: 'A sentence.', language: 'en-US' }), {
    type: 'check', text: 'A sentence.', language: 'en-US',
  });
  assert.deepEqual(parseExtensionMessage({ type: 'applyWorkspaceIssue', tabID: 3, index: 1, offset: 4, length: 7, replacement: 'result' }), {
    type: 'applyWorkspaceIssue', tabID: 3, index: 1, offset: 4, length: 7, replacement: 'result',
  });
  for (const value of [null, {}, { type: 'unknown' }, { type: 'check' }, { type: 'applyIssue', index: -1, offset: 0, length: 1, replacement: 'x' }]) {
    assert.equal(parseExtensionMessage(value), null);
  }
  assert.deepEqual(okResponse({ state: 'clean' }), { ok: true, data: { state: 'clean' } });
  assert.deepEqual(errorResponse(new Error('bad message')), { ok: false, error: 'bad message' });
});

test('desktop IPC exposes only the versioned preload allowlist and validates arguments', () => {
  assert.equal(DESKTOP_IPC_CONTRACT_VERSION, 'ikmal-desktop-ipc-v1');
  assert.ok(DESKTOP_INVOKE_CHANNELS.length > 30);
  assert.ok(DESKTOP_EVENT_CHANNELS.includes('focus-mode'));
  assert.equal(isDesktopInvokeChannel('check-text'), true);
  assert.equal(isDesktopInvokeChannel('shell-exec'), false);
  assert.equal(isDesktopEventChannel('editor-text'), true);
  assert.equal(isDesktopEventChannel('ipc-message'), false);
  assert.deepEqual(parseDesktopInvoke('check-text', ['A sentence.']), { channel: 'check-text', args: ['A sentence.'] });
  assert.deepEqual(parseDesktopInvoke('set-focus-mode', [{ mode: 'zen', duration: '1h' }]), {
    channel: 'set-focus-mode', args: [{ mode: 'zen', duration: '1h' }],
  });
  assert.equal(parseDesktopInvoke('check-text', [{ text: 'not a string' }]), null);
  assert.equal(parseDesktopInvoke('service-state', ['unexpected']), null);
  assert.equal(parseDesktopInvoke('set-focus-mode', [{ mode: 'shell-exec' }]), null);
});
