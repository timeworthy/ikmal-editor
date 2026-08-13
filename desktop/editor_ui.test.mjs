import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const desktop = path.dirname(fileURLToPath(import.meta.url));
const read = (name) => fs.readFileSync(path.join(desktop, name), 'utf8');

test('expanded editor keeps its renderer/preload contract', () => {
  const html = read('editor.html');
  const renderer = read('editor-renderer.js');
  const preload = read('preload.cjs');
  const main = read('main.cjs');
  const annotation = read('annotation_surface.js');
  const annotationPreferences = read('annotation_preferences.js');
  const notices = read('notice_surface.js');
  const editorStyles = read('editor-styles.css');

  for (const id of ['editor-input', 'editor-check', 'editor-copy', 'editor-suggestions', 'editor-style-guide', 'editor-writing-status', 'editor-writing-status-action', 'editor-menubar-toggle', 'editor-dock-toggle']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /class="writing-status-tooltip"/);
  assert.match(renderer, /window\.ikmal\.checkText/);
  assert.match(renderer, /window\.ikmal\.onEditorText/);
  assert.match(renderer, /setRangeText/);
  assert.match(renderer, /checkingPreferences\.delay/);
  assert.match(renderer, /getCheckingPreferences/);
  assert.match(html, /id="editor-checking-category-repetition"/);
  assert.match(html, /id="editor-checking-sensitivity"/);
  assert.match(renderer, /editorCheckingCategoryInputs/);
  assert.match(renderer, /checkGeneration/);
  assert.match(preload, /openEditor: \(text\) => ipcRenderer\.invoke\('open-editor'/);
  assert.match(preload, /onEditorText:/);
  assert.match(preload, /installSpellServer/);
  assert.match(preload, /onCompactInvoked:/);
  assert.match(main, /editor\.html/);
  assert.match(main, /ipcMain\.handle\('open-editor'/);
  assert.match(main, /spell-server-state/);
  assert.match(main, /execFileSync/);
  assert.match(main, /checkSensitivity: desktopPreferences\?\.checkSensitivity/);
  assert.match(annotation, /window\.IkmalAnnotationSurface/);
  assert.match(annotation, /suggestion-popover/);
  assert.match(annotation, /is-antecedent/);
  assert.match(annotation, /is-related-hover/);
  assert.match(annotation, /renderedSourceText/);
  assert.match(annotation, /onInvalidate/);
  assert.match(annotation, /isCurrent/);
  assert.match(annotationPreferences, /annotation-alpha/);
  assert.match(annotationPreferences, /\['line', 'dash'\]/);
  assert.match(html, /editor-annotation-indicator-style/);
  assert.match(html, /editor-annotation-palette/);
  assert.match(html, /editor-annotation-intensity/);
  assert.match(notices, /window\.IkmalNoticeSurface/);
  assert.match(renderer, /showFailureNotice/);
  assert.match(renderer, /cancelLabel: 'Keep editing'/);
  assert.match(html, /id="editor-menu-trigger"/);
  assert.match(html, /data-editor-menu="settings"/);
  assert.match(html, /id="editor-recent-sessions"/);
  assert.match(html, /id="editor-import-style-guide"/);
  assert.match(renderer, /window\.ikmal\.openCompact/);
  assert.match(renderer, /window\.ikmal\.importStyleGuide/);
  assert.match(html, /id="editor-count"/);
  assert.doesNotMatch(html, /drawer-button/);
  assert.match(renderer, /suggestions-open/);
  assert.match(renderer, /setEditorWritingStatus/);
  assert.match(renderer, /clearStaleSuggestions/);
  assert.match(renderer, /editorAnnotationSurface\.isCurrent/);
  assert.match(renderer, /editorWritingStatusAction.addEventListener/);
  assert.doesNotMatch(renderer, /editorWritingStatus\.offsetWidth/);
  assert.doesNotMatch(renderer, /editorWritingStatus\.title/);
  assert.match(renderer, /characters/);
  assert.match(renderer, /getDesktopPresence/);
  assert.match(editorStyles, /\.pro\.suggestions-open \.pro-rail/);
  assert.match(editorStyles, /grid-template-columns \.24s/);
});

test('compact shell offers the expanded editor entry point', () => {
  const html = read('index.html');
  const renderer = read('renderer.js');
  const styles = read('styles.css');
  assert.match(html, /id="enhancer-settings"/);
  // The quality-model group was deleted with the optional transformer and its
  // non-commercial weights. Nothing replaced it: the deterministic checks it
  // sat beside are reported under services, and are what this shell still
  // shows.
  assert.doesNotMatch(html, /id="quality-settings"/);
  assert.match(html, /id="advanced-settings"/);
  assert.match(html, /id="style-guide-settings"/);
  assert.match(html, /id="presence-settings"/);
  assert.match(html, /id="appearance-settings"/);
  assert.match(html, /id="annotation-indicator-style"/);
  assert.match(html, /id="annotation-palette"/);
  assert.match(html, /id="annotation-intensity"/);
  assert.match(html, /value="dash">Dashes/);
  assert.match(read('editor.html'), /value="dash">Dashes/);
  assert.match(html, /id="open-editor-button"/);
  assert.doesNotMatch(html, /id="sample-button"/);
  assert.doesNotMatch(html, /id="check-button"/);
  assert.doesNotMatch(html, /WRITING CHECK/);
  assert.doesNotMatch(html, /Try a passage/);
  assert.match(html, />Quick check</);
  assert.match(html, /id="writing-highlights"/);
  assert.match(html, /id="writing-status"/);
  assert.match(html, /id="writing-status-action"/);
  assert.match(html, /class="writing-status-tooltip"/);
  assert.match(html, /id="character-count"/);
  assert.doesNotMatch(html, /drawer-button/);
  assert.match(html, /ikmal_languagetool_mark\.svg/);
  assert.match(renderer, /openEditorButton\.addEventListener/);
  assert.match(renderer, /window\.ikmal\.openEditor\(input\.value\)/);
  assert.match(renderer, /checkingPreferences\.mode/);
  assert.match(renderer, /getCheckingPreferences/);
  assert.match(html, /id="checking-settings"/);
  assert.match(html, /id="checking-category-repetition"/);
  assert.match(html, /id="checking-sensitivity"/);
  assert.match(html, /id="native-spell-settings"/);
  assert.match(html, /id="office-settings"/);
  assert.match(html, /id="generate-office-certificate"/);
  assert.match(html, /id="start-office-bridge"/);
  // The six per-host manifest buttons collapsed into one picker, but every
  // host must still be reachable and still map to its own preload method.
  assert.match(html, /id="office-manifest-host"/);
  for (const host of ['word', 'excel', 'powerpoint', 'outlook', 'onenote', 'project']) {
    assert.match(html, new RegExp(`<option value="${host}"`), `manifest picker is missing ${host}`);
    assert.match(renderer, new RegExp(`${host}:\\s*\\(\\) =>`), `renderer does not map ${host} to a reveal call`);
  }
  for (const method of ['revealOfficeManifest', 'revealOfficeExcelManifest', 'revealOfficePowerPointManifest',
    'revealOfficeOutlookManifest', 'revealOfficeOneNoteManifest', 'revealOfficeProjectManifest']) {
    assert.match(renderer, new RegExp(`window\\.ikmal\\.${method}\\(\\)`), `renderer no longer calls ${method}`);
  }
  assert.match(html, /id="start-spell-services"/);
  assert.match(html, /id="setup-celebration"/);
  assert.match(renderer, /installSpellServerButton/);
  assert.match(renderer, /renderOfficeBridgeState/);
  assert.match(renderer, /window\.ikmal\.startOfficeBridge/);
  assert.match(renderer, /celebrateSpellServerInstall/);
  assert.match(renderer, /serviceState\.proxyReady/);
  assert.match(renderer, /checkingPreferences\.sensitivity/);
  // The inline underline markup belongs to the shared annotation surface. The
  // compact renderer used to carry a second, unreachable copy of it behind an
  // unconditional return; assert on the surface that actually draws it so this
  // cannot pass again on dead code.
  assert.match(read('annotation_surface.js'), /writing-underline/);
  assert.doesNotMatch(renderer, /writing-underline/);
  assert.match(renderer, /setCompactExpanded/);
  assert.match(renderer, /IkmalAnnotationSurface\.attach/);
  assert.match(renderer, /setWritingStatus/);
  assert.match(renderer, /clearStaleFindings/);
  assert.match(renderer, /annotationSurface\.isCurrent/);
  assert.match(renderer, /writingStatusAction\.addEventListener/);
  assert.match(renderer, /showFailureNotice/);
  assert.match(renderer, /cancelLabel = 'Cancel'/);
  assert.doesNotMatch(renderer, /writingStatus\.offsetWidth/);
  assert.doesNotMatch(renderer, /writingStatus\.title/);
  assert.match(renderer, /characterCount\.textContent/);
  assert.match(renderer, /allServicesReady/);
  assert.match(styles, /#writing-panel #results/);
  assert.match(styles, /#writing-panel\.suggestions-expanded #results/);
  assert.doesNotMatch(styles, /\.drawer-button/);
  assert.match(styles, /checking-ring/);
  assert.match(styles, /status-checkmark/);
  assert.match(styles, /writing-status-tooltip/);
  assert.match(styles, /result-enter/);
  assert.match(styles, /settings-group/);
  assert.match(styles, /data-annotation-style/);
  assert.match(styles, /is-related-hover/);
});

test('macOS shell has a native tray fallback and title-bar inset', () => {
  const main = read('main.cjs');
  const preload = read('preload.cjs');
  const styles = read('styles.css');
  assert.match(main, /ikmal_languagetool_tray\.png/);
  assert.match(main, /ikmal_languagetool_icon\.png/);
  assert.match(main, /mainWindow\.isVisible\(\) && mainWindow\.isFocused\(\)/);
  assert.match(main, /frame: process\.platform !== 'darwin'/);
  assert.match(main, /set-compact-expanded/);
  assert.match(main, /import-style-guide/);
  assert.match(main, /desktop-presence-state/);
  assert.doesNotMatch(main, /titleBarStyle: process\.platform === 'darwin'/);
  assert.match(preload, /platform: process\.platform/);
  assert.doesNotMatch(styles, /html\[data-platform="darwin"\] \.app-header/);
});

test('a login launch leaves the menubar popover closed', () => {
  const main = read('main.cjs');
  // The compact window positions itself at the pointer and takes focus, so
  // showing it on an automatic start interrupts whatever the login session is
  // opening with. The tray icon is still there when the user wants it.
  assert.match(main, /ready-to-show', \(\) => \{ if \(!openedAtLogin\(\)\) showWindow\(\); \}/);
  assert.match(main, /launchedAtLogin/);
  assert.match(main, /function openedAtLogin/);
});

test('a check that lost one engine says so instead of reading as clean', () => {
  const renderer = read('editor-renderer.js');
  // The proxy names the missing engines, so the renderer reports them rather
  // than deciding for itself which warning fields exist.
  assert.match(renderer, /ikmalDegradedChecks/);
  assert.match(renderer, /reportDegradedCheck\(rawResponse\)/);
  assert.match(renderer, /Findings may be incomplete/);
});

test('the expanded editor checks around the caret and keeps the rest of the draft', () => {
  const renderer = read('editor-renderer.js');
  const preload = read('preload.cjs');
  const main = read('main.cjs');

  // The renderer says where the writing is happening; the main process decides
  // how much to send, because that is where the compiled core is loadable.
  assert.match(renderer, /checkText\(text, \{ caret: editorInput\.selectionStart, scope \}\)/);
  assert.match(renderer, /scheduleFullCheck\(rawResponse\)/);
  assert.match(renderer, /ikmalFullCheckPending/);
  assert.match(renderer, /checkWriting\('document'\)/);
  assert.match(preload, /checkText: \(text, options\)/);

  // A chunked check must keep what it did not look at, and must still describe
  // the document rather than the slice that was sent.
  assert.match(main, /planChunkedCheck\(writingCoreAPI, text, checkStates\.get\(stateKey\), options\)/);
  assert.match(main, /mergeChunkedCheck\(await response\.json\(\), plan\)/);
  assert.match(main, /chunkedCheckState\(plan, merged\)/);
  assert.match(main, /filterDictionaryMatches\(merged\.matches, text/);
  assert.match(main, /recordRecentCheck\(text, merged\)/);
  // Two windows hold two documents; one shared cache would cross them.
  assert.match(main, /checkStates\.set\(stateKey/);
  assert.match(main, /event\.sender\.id/);
  // A build without the compiled core still checks whole documents.
  assert.match(main, /Chunked checking is off/);
});

test('every control the compact renderer binds to exists in its markup', () => {
  // A querySelector that misses returns null, and the addEventListener on the
  // next line throws — at load, in a classic script, so everything after it
  // never runs. Deleting the quality-model group took the third-party notices
  // button with it and the whole renderer stopped initialising: the window sat
  // on "Checking…" forever with no error anyone would see.
  const html = read('index.html');
  const renderer = read('renderer.js');
  const bound = [...renderer.matchAll(/document\.querySelector\('#([a-zA-Z0-9-]+)'\)/g)].map((match) => match[1]);
  const missing = [...new Set(bound)].filter((id) => !html.includes(`id="${id}"`));
  assert.deepEqual(missing, [], `the renderer binds controls the markup does not define: ${missing.join(', ')}`);
});
