// Every action a host renders must be an action that host handles.
//
// A suggestion card that offers "Add to dictionary" or "Review alternatives"
// and then does nothing when clicked is indistinguishable from a broken app:
// there is no error, no state change, and no way for the user to tell that the
// control was never wired to anything. These checks tie the markup to the click
// handler, and — where the action needs the host process — to the preload
// surface and the main-process channel behind it.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function renderedActions(...sources) {
  return [...new Set(sources.flatMap((source) => [...source.matchAll(/data-action="([a-z-]+)"/g)].map((match) => match[1])))];
}

function assertHandled(actions, handler, label) {
  for (const action of actions) {
    assert.match(handler, new RegExp(`action === '${action}'`), `${label} renders data-action="${action}" but never handles it`);
  }
}

test('the desktop editor handles every action its suggestion cards render', () => {
  const renderer = read('desktop/editor-renderer.js');
  assertHandled(renderedActions(renderer), renderer, 'desktop/editor-renderer.js');

  // The dictionary action reaches the user's stored words through the preload
  // surface and a main-process channel; a break anywhere along that chain puts
  // the button back to doing nothing.
  assert.match(renderer, /data-action="dictionary"/);
  assert.match(renderer, /window\.ikmal\.addDictionaryWord\(/);
  assert.match(read('desktop/preload.cjs'), /addDictionaryWord: \(word\) => ipcRenderer\.invoke\('add-dictionary-word'/);
  assert.match(read('desktop/main.cjs'), /ipcMain\.handle\('add-dictionary-word'/);
  assert.match(read('packages/writing-adapters/src/desktop_ipc.ts'), /'add-dictionary-word'/);
});

test('the desktop slice handles every action its issue popover renders', () => {
  const renderer = read('apps/desktop-editor/renderer.js');
  assertHandled(renderedActions(read('apps/desktop-editor/issue_popover.js')), renderer, 'apps/desktop-editor');

  assert.match(renderer, /window\.ikmal\.addDictionaryWord\(/);
  assert.match(read('apps/desktop-editor/preload.cjs'), /addDictionaryWord: \(word\) => ipcRenderer\.invoke\('add-dictionary-word'/);
  // The popover only offers the action when the host exposes it, so a slice
  // built on a narrower preload surface renders one less control instead of one
  // dead one.
  assert.match(renderer, /canAddToDictionary: Boolean\(window\.ikmal\.addDictionaryWord\)/);
});

test('the browser slice handles every action its issue popover renders', () => {
  const controller = read('apps/browser-extension/content_module.js');
  // The slice stages the compiled popover at package time, so the compiled
  // module is the source of what it will render.
  const popover = read('packages/writing-ui/dist/issue_popover.js');
  const actions = renderedActions(popover).filter((action) => action !== 'dictionary');
  assertHandled(actions, controller, 'apps/browser-extension');

  // This host has no personal dictionary, so it must not ask for the control.
  assert.doesNotMatch(controller, /canAddToDictionary/);
});

// The scan above reads literals out of the compiled source, so an action
// assembled at runtime — data-action="${candidate.action}" — is invisible to it
// and every host check quietly stops covering that action. It stays a passing
// test while an Apply button ships wired to nothing. These two are the ones that
// change the writer's text, which makes them the two that must stay visible.
test('the actions that edit the text are visible to the scan', () => {
  const actions = renderedActions(read('packages/writing-ui/dist/issue_popover.js'));
  for (const action of ['apply', 'reword']) {
    assert.ok(actions.includes(action), `data-action="${action}" is not a literal in the compiled popover, so no host is checked for handling it`);
  }
});

test('applying a suggestion uses the candidate the user chose', () => {
  for (const file of ['apps/desktop-editor/renderer.js', 'apps/browser-extension/content_module.js']) {
    assert.match(read(file), /dataset\??\.value/, `${file} must read the replacement from the clicked control`);
  }
});

test('the browser extension checks around the caret and keeps the rest of the field', () => {
  const background = read('extension/background.js');
  const content = read('extension/content.js');

  // The worker owns the loop: the page never ships its findings back and forth,
  // and a worker restart falls back to a whole check rather than losing them.
  assert.match(background, /planChunkedCheck\(writingCore, text, fieldFindings\.get\(key\), \{ caret, scope \}\)/);
  assert.match(background, /mergeChunkedCheck\(result, plan\)/);
  assert.match(background, /fieldFindings\.set\(key, chunkedCheckState\(plan, result\)\)/);
  assert.match(background, /chrome\.tabs\.onRemoved/, 'a closed tab must not leave its findings behind');
  // The dictionary filters against the whole field, not the slice that was sent.
  assert.match(background, /filterDictionaryMatches\(result\.matches, text, settings\.dictionary\)/);
  // A selection check is already the user's own slice.
  assert.match(background, /selection\s*\n?\s*\? \{ text, sent: text, chunk: null, carried: null \}/);

  // The page supplies the caret and the field identity, and asks for the whole
  // field once typing stops.
  assert.match(content, /function caretOf\(field\)/);
  assert.match(content, /fieldID: state\.get\(field\)\?\.id/);
  assert.match(content, /scope === 'document' \? \{ scope \} : \{\}/);
  assert.match(content, /ikmalFullCheckPending/);
  assert.match(content, /runCheck\(field, 'document'\)/);
});

// A correction the controller refuses is a different outcome from one it
// applies, and a host that treats them the same reads as a broken button: the
// card closes, the text does not change, and nothing says why. The controllers
// already report it; these check that the hosts read the answer.
test('a refused correction is not presented as an applied one', () => {
  const cases = [
    ['apps/browser-extension/content_module.js', /if \(!state\.controller\.applyIssue\(issue\.id, value\)\?\.applied\)/],
    ['apps/desktop-editor/renderer.js', /if \(!controller\.applyIssue\(issue\.id, value\)\?\.applied\)/],
  ];
  for (const [file, guard] of cases) {
    assert.match(read(file), guard, `${file} discards whether the correction was applied`);
  }

  // The refusal is only meaningful if the controller actually reports it.
  assert.match(read('packages/writing-adapters/src/browser_slice.ts'), /return \{ applied: false \}/);
});
