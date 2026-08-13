const { app, BrowserWindow, Menu, Tray, nativeImage, ipcMain, screen, clipboard, dialog, shell } = require('electron');
const { spawn, execFile, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createLaunchAtLoginController, launchedAtLogin } = require('./launch_at_login.cjs');

const QUALITY_PROXY_URL = process.env.IKMAL_DESKTOP_PROXY_URL || 'http://127.0.0.1:8096';
const STYLE_GUIDE_URL = `${QUALITY_PROXY_URL}/v1/style-guides`;
const QUALITY_HEALTH_URL = process.env.IKMAL_DESKTOP_QUALITY_URL || 'http://127.0.0.1:8098/health';
const LANGUAGE_TOOL_URL = process.env.IKMAL_DESKTOP_LANGUAGETOOL_URL || 'http://127.0.0.1:8097';
const INTEGRATION_ENDPOINT = `${QUALITY_PROXY_URL}/v2`;
const SERVICE_POLL_MS = 3000;
const RECENT_CHECK_LIMIT = 10;
const ANNOTATION_DEFAULTS = { style: 'squiggle', palette: 'balanced', intensity: 55 };
const ANNOTATION_PALETTES = new Set(['balanced', 'warm', 'cool', 'contrast']);
const CHECKING_DEFAULTS = {
  mode: 'automatic',
  delay: 700,
  sensitivity: 55,
  categories: { grammar: true, repetition: true, style: true, languagetool: true },
};

let tray;
let mainWindow;
let editorWindow;
let backendProcess;
let pollTimer;
let quitting = false;
let launchAtLogin;
let desktopPreferences;
let editorPendingText = '';
// True once the editor page has finished loading and its IPC listeners exist.
let editorReady = false;
// Set while a native dialog owned by the compact window is open, so its
// hide-on-blur behaviour does not close the window out from under the dialog.
let suppressAutoHide = false;
let officeBridgeServer;
let focusModeAPI;
let desktopIPCAPI;
let writingCoreAPI;
let chunkedChecksAPI;
// Findings the editor is currently showing, per renderer, so a chunk check can
// keep everything it did not look at. Keyed by WebContents id because the
// compact window and the expanded editor hold different documents.
const checkStates = new Map();

async function loadDesktopIPCContract() {
  const packaged = process.env.IKMAL_DESKTOP_PACKAGED === '1' || app.isPackaged;
  const modulePath = packaged
    ? path.join(process.resourcesPath, 'dist', 'desktop_ipc.js')
    : path.resolve(__dirname, '..', 'packages', 'writing-adapters', 'dist', 'desktop_ipc.js');
  // The contract is compiled output, not a checked-in file, so a fresh clone
  // running `npm run dev:electron` has nothing here. Name the build step rather
  // than letting an ENOENT from import() describe it.
  if (!fs.existsSync(modulePath)) {
    throw new Error(packaged
      ? `The compiled desktop IPC contract is missing from this bundle (${modulePath}).`
      : `The compiled desktop IPC contract is missing at ${modulePath}. Build it with: npm run build --prefix packages/writing-adapters`);
  }
  desktopIPCAPI = await import(pathToFileURL(modulePath).href);
  return desktopIPCAPI;
}

// The compiled core is staged beside the rewrite renderer, which the bundle
// already ships, so chunking needs no new packaged resource.
async function loadWritingCore() {
  const packaged = process.env.IKMAL_DESKTOP_PACKAGED === '1' || app.isPackaged;
  const corePath = packaged
    ? path.join(process.resourcesPath, 'desktop-editor', 'writing-core.js')
    : path.resolve(__dirname, '..', 'packages', 'writing-core', 'dist', 'index.js');
  // How much to check and how to put the answer back together lives beside the
  // IPC contract, so the browser extension and this app share one
  // implementation of both.
  const plannerPath = packaged
    ? path.join(process.resourcesPath, 'dist', 'chunked_checks.js')
    : path.resolve(__dirname, '..', 'packages', 'writing-adapters', 'dist', 'chunked_checks.js');
  // Chunking is an optimisation, not a feature: a build without the compiled
  // modules still checks whole documents rather than refusing to check at all.
  if (!fs.existsSync(corePath) || !fs.existsSync(plannerPath)) {
    console.warn(`Chunked checking is off: the compiled writing core is missing at ${corePath}.`);
    return undefined;
  }
  writingCoreAPI = await import(pathToFileURL(corePath).href);
  chunkedChecksAPI = await import(pathToFileURL(plannerPath).href);
  return writingCoreAPI;
}

// The launcher slice, behind the same flag as the editor slice. Off, the legacy
// compact renderer loads exactly as before.
function desktopCompactPagePath() {
  if (process.env.IKMAL_DESKTOP_REWRITE_SLICE !== '1') return path.join(__dirname, 'index.html');
  const base = process.env.IKMAL_DESKTOP_PACKAGED === '1' || app.isPackaged
    ? path.join(process.resourcesPath, 'desktop-compact')
    : path.resolve(__dirname, '..', 'apps', 'desktop-compact');
  return path.join(base, 'index.html');
}

function desktopCompactPreloadPath() {
  if (process.env.IKMAL_DESKTOP_REWRITE_SLICE !== '1') return path.join(__dirname, 'preload.cjs');
  const base = process.env.IKMAL_DESKTOP_PACKAGED === '1' || app.isPackaged
    ? path.join(process.resourcesPath, 'desktop-compact')
    : path.resolve(__dirname, '..', 'apps', 'desktop-compact');
  return path.join(base, 'preload.cjs');
}

function desktopEditorPagePath() {
  if (process.env.IKMAL_DESKTOP_REWRITE_SLICE !== '1') return path.join(__dirname, 'editor.html');
  const base = process.env.IKMAL_DESKTOP_PACKAGED === '1' || app.isPackaged
    ? path.join(process.resourcesPath, 'desktop-editor')
    : path.resolve(__dirname, '..', 'apps', 'desktop-editor');
  return path.join(base, 'index.html');
}

function desktopEditorPreloadPath() {
  if (process.env.IKMAL_DESKTOP_REWRITE_SLICE !== '1') return path.join(__dirname, 'preload.cjs');
  const base = process.env.IKMAL_DESKTOP_PACKAGED === '1' || app.isPackaged
    ? path.join(process.resourcesPath, 'desktop-editor')
    : path.resolve(__dirname, '..', 'apps', 'desktop-editor');
  return path.join(base, 'preload.cjs');
}

function desktopPreferencesPath() {
  return path.join(app.getPath('userData'), 'desktop-preferences.json');
}

function readDesktopPreferences() {
  try {
    const saved = JSON.parse(fs.readFileSync(desktopPreferencesPath(), 'utf8'));
    return {
      menubarIcon: saved.menubarIcon !== false,
      dockIcon: saved.dockIcon === true,
      annotationStyle: ['line', 'dash'].includes(saved.annotationStyle) ? saved.annotationStyle : ANNOTATION_DEFAULTS.style,
      annotationPalette: ANNOTATION_PALETTES.has(saved.annotationPalette) ? saved.annotationPalette : ANNOTATION_DEFAULTS.palette,
      annotationIntensity: normalizeAnnotationIntensity(saved.annotationIntensity),
      dictionary: Array.isArray(saved.dictionary) ? saved.dictionary.filter((word) => String(word).trim()) : [],
      focusMode: saved.focusMode,
      ...normalizeCheckingPreferences(saved),
    };
  } catch (_) {
    return { menubarIcon: true, dockIcon: false, annotationStyle: ANNOTATION_DEFAULTS.style, annotationPalette: ANNOTATION_DEFAULTS.palette, annotationIntensity: ANNOTATION_DEFAULTS.intensity, dictionary: [], ...normalizeCheckingPreferences() };
  }
}

function normalizeCheckingPreferences(saved = {}) {
  const categories = saved.checkCategories && typeof saved.checkCategories === 'object'
    ? saved.checkCategories
    : saved.categories && typeof saved.categories === 'object' ? saved.categories : {};
  const delay = Number(saved.checkDelay ?? saved.delay);
  const sensitivity = Number(saved.checkSensitivity ?? saved.sensitivity);
  return {
    checkMode: saved.checkMode === 'manual' ? 'manual' : CHECKING_DEFAULTS.mode,
    checkDelay: Number.isFinite(delay) ? Math.max(200, Math.min(2000, Math.round(delay / 50) * 50)) : CHECKING_DEFAULTS.delay,
    checkSensitivity: Number.isFinite(sensitivity) ? Math.max(0, Math.min(100, Math.round(sensitivity / 5) * 5)) : CHECKING_DEFAULTS.sensitivity,
    checkCategories: {
      grammar: categories.grammar !== false,
      repetition: categories.repetition !== false,
      style: categories.style !== false,
      languagetool: categories.languagetool !== false,
    },
  };
}

function checkingPreferencesState() {
  const normalized = normalizeCheckingPreferences({
    checkMode: desktopPreferences?.checkMode,
    checkDelay: desktopPreferences?.checkDelay,
    checkSensitivity: desktopPreferences?.checkSensitivity,
    categories: desktopPreferences?.checkCategories,
  });
  return { mode: normalized.checkMode, delay: normalized.checkDelay, sensitivity: normalized.checkSensitivity, categories: normalized.checkCategories };
}

// The focus-mode presets live with the browser adapter and are resolved the
// same way the office-bridge modules are, so the desktop shell and the
// extension share one copy rather than two that can drift.
function focusModeModule() {
  if (!focusModeAPI) {
    const base = process.env.IKMAL_DESKTOP_PACKAGED === '1' || app.isPackaged
      ? path.join(process.resourcesPath, 'extension', 'core')
      : path.resolve(__dirname, '..', 'extension', 'core');
    focusModeAPI = require(path.join(base, 'focus_mode.cjs'));
  }
  return focusModeAPI;
}

// The stored state is returned already resolved, so an expiry that passed while
// the app was closed or the machine asleep reads as active without anything
// having had to fire.
//
// `effective` is the user's own preferences with the mode applied on top. It is
// computed here rather than in the renderer so the presets keep one
// implementation: the renderer has no Node access, and a browser-global copy
// would be a fourth version of rules that must not diverge.
function focusModeState() {
  const focus = focusModeModule();
  const state = focus.resolveFocusState(desktopPreferences?.focusMode);
  return {
    ...state,
    // Which duration is running, so a control for changing it can show what it
    // is changing. The core's focus state is a deadline — it deliberately does
    // not carry the choice that produced it — and a deadline cannot be read
    // backwards into one, because the time remaining shrinks away from it. So
    // the choice is kept here beside the deadline, and dropped with it: a mode
    // that has expired is Automatic, and Automatic has no duration.
    ...(state.mode === 'active' ? {} : { duration: desktopPreferences?.focusMode?.duration || 'forever' }),
    label: focus.describeFocusState(state),
    durations: focus.FOCUS_DURATIONS,
    effective: focus.applyFocusState(checkingPreferencesState(), state),
  };
}

function normalizeAnnotationIntensity(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, Math.round(parsed / 5) * 5)) : ANNOTATION_DEFAULTS.intensity;
}

function annotationPreferencesState() {
  return {
    style: desktopPreferences?.annotationStyle || ANNOTATION_DEFAULTS.style,
    palette: desktopPreferences?.annotationPalette || ANNOTATION_DEFAULTS.palette,
    intensity: desktopPreferences?.annotationIntensity ?? ANNOTATION_DEFAULTS.intensity,
  };
}

function saveDesktopPreferences() {
  fs.mkdirSync(path.dirname(desktopPreferencesPath()), { recursive: true });
  fs.writeFileSync(desktopPreferencesPath(), `${JSON.stringify(desktopPreferences, null, 2)}\n`);
}

function applyDockVisibility() {
  if (process.platform !== 'darwin' || !app.dock) return;
  if (desktopPreferences.dockIcon) {
    app.dock.show();
    const iconPath = assetPath('ikmal_languagetool_icon.png');
    if (fs.existsSync(iconPath)) app.dock.setIcon(iconPath);
  } else {
    app.dock.hide();
  }
}

function findManagerBinary() {
  if (process.env.IKMAL_MANAGER_BINARY) {
    return process.env.IKMAL_MANAGER_BINARY;
  }
  const candidates = process.env.IKMAL_DESKTOP_PACKAGED === '1' || app.isPackaged
    ? [path.join(process.resourcesPath, 'ikmal-editor'), path.join(process.resourcesPath, 'ikmal-editor.exe')]
    : [path.resolve(__dirname, '..', 'ikmal-editor'), path.resolve(process.cwd(), 'ikmal-editor')];
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}

function assetPath(name) {
  return process.env.IKMAL_DESKTOP_PACKAGED === '1' || app.isPackaged
    ? path.join(process.resourcesPath, 'assets', name)
    : path.resolve(__dirname, '..', 'assets', name);
}

function spellServerBundleName() {
  return 'ikmal editor spell server.service';
}

function spellServerSourcePath() {
  return process.env.IKMAL_DESKTOP_PACKAGED === '1' || app.isPackaged
    ? path.join(process.resourcesPath, spellServerBundleName())
    : path.join(__dirname, '..', 'bin', 'macos', spellServerBundleName());
}

function spellServerInstallPath() {
  return path.join(app.getPath('home'), 'Library', 'Services', spellServerBundleName());
}

function officeBridgeResourcePath() {
  return process.env.IKMAL_DESKTOP_PACKAGED === '1' || app.isPackaged
    ? path.join(process.resourcesPath, 'office-bridge')
    : path.resolve(__dirname, '..', 'office-bridge');
}

function officeBridgeModule(name) {
  return require(path.join(officeBridgeResourcePath(), name));
}

// One source for the port. office_bridge.cjs derives its allowed origins from
// the same env var, so a hardcoded listen port meant the pane loaded on 8765
// while the allow-list named a different one, and every check came back 403
// with nothing to indicate why.
function officeBridgePort() {
  const port = Number(process.env.IKMAL_OFFICE_BRIDGE_PORT || 8765);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : 8765;
}

function officeCertificateDirectory() {
  return path.join(app.getPath('userData'), 'office-bridge-certificate');
}

function officeBridgeState() {
  const certificate = officeBridgeModule('certificate.cjs').certificateState(officeCertificateDirectory());
  return {
    supported: true,
    running: Boolean(officeBridgeServer),
    url: `https://localhost:${officeBridgePort()}/office/word/`,
    manifestPath: path.join(officeBridgeResourcePath(), 'manifest-word.xml'),
    ...certificate,
  };
}

function generateOfficeCertificate() {
  return officeBridgeModule('certificate.cjs').generateOfficeCertificate({ directory: officeCertificateDirectory() });
}

async function startOfficeBridge() {
  if (officeBridgeServer) return officeBridgeState();
  const state = officeBridgeState();
  if (!state.configured) {
    throw new Error('Generate the local Office certificate before starting the bridge.');
  }
  const bridge = officeBridgeModule('office_bridge.cjs');
  const server = bridge.createOfficeBridgeServer({
    port: officeBridgePort(),
    key: fs.readFileSync(state.keyPath),
    cert: fs.readFileSync(state.certificatePath),
  });
  // A permanent listener, installed before listen(). 'error' on an EventEmitter
  // with no listener is rethrown, and on a long-lived server that means a later
  // accept failure (EMFILE, a dropped TLS handshake) would take down the whole
  // main process. The start-up listeners below only decide the outcome of this
  // call; this one has to outlive them.
  server.on('error', (error) => {
    console.error(`Office bridge error: ${error.message}`);
    if (officeBridgeServer === server) {
      officeBridgeServer = undefined;
      server.close(() => {});
    }
  });
  // tlsClientError is emitted per connection (an untrusted certificate, a probe
  // on the port). It must not tear the server down.
  server.on('tlsClientError', (error) => {
    console.error(`Office bridge TLS handshake failed: ${error.message}`);
  });
  await new Promise((resolve, reject) => {
    const onError = (error) => {
      server.removeListener('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.removeListener('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(officeBridgePort(), '127.0.0.1');
  }).catch((error) => {
    server.close(() => {});
    throw new Error(`Could not start the local Office bridge: ${error.message}`);
  });
  officeBridgeServer = server;
  return officeBridgeState();
}

async function stopOfficeBridge() {
  if (!officeBridgeServer) return officeBridgeState();
  const server = officeBridgeServer;
  officeBridgeServer = undefined;
  await new Promise((resolve) => server.close(() => resolve()));
  return officeBridgeState();
}

function removeOfficeCertificate() {
  if (officeBridgeServer) throw new Error('Stop the Office bridge before removing its certificate.');
  return officeBridgeModule('certificate.cjs').removeOfficeCertificate(officeCertificateDirectory());
}

const OFFICE_MANIFEST_HOSTS = { word: 'Word', excel: 'Excel', powerpoint: 'PowerPoint', outlook: 'Outlook', onenote: 'OneNote', project: 'Project' };

function revealOfficeManifest(name = 'manifest-word.xml') {
  const host = Object.keys(OFFICE_MANIFEST_HOSTS).find((key) => `manifest-${key}.xml` === name) || 'word';
  const manifestPath = path.join(officeBridgeResourcePath(), `manifest-${host}.xml`);
  // Name the host that was actually asked for. This said "Word" for all six,
  // so a user who picked Outlook was told the Word manifest was missing.
  if (!fs.existsSync(manifestPath)) throw new Error(`The ${OFFICE_MANIFEST_HOSTS[host]} Office manifest is not included in this build.`);
  shell.showItemInFolder(manifestPath);
  return manifestPath;
}

function bundleIdentifier(bundlePath) {
  try {
    const infoPath = path.join(bundlePath, 'Contents', 'Info.plist');
    const output = execFileSync('/usr/bin/plutil', ['-extract', 'CFBundleIdentifier', 'raw', '-o', '-', infoPath], { encoding: 'utf8' });
    return output.trim();
  } catch (_) {
    return '';
  }
}

function spellServerState() {
  const supported = process.platform === 'darwin';
  const sourcePath = spellServerSourcePath();
  const installPath = spellServerInstallPath();
  const available = supported && fs.existsSync(path.join(sourcePath, 'Contents', 'MacOS', 'ikmal-spellserver'));
  const installed = supported && bundleIdentifier(installPath) === 'com.timeworthymedia.ikmal-editor.spellserver';
  return { supported, available, installed, path: installPath };
}

function installSpellServer() {
  const state = spellServerState();
  if (!state.supported) throw new Error('The native macOS spell service is only available on macOS.');
  if (!state.available) throw new Error('The native spell-service bundle is not included in this build. Rebuild ikmal editor with the macOS spell-server package available.');
  if (fs.existsSync(state.path) && bundleIdentifier(state.path) !== 'com.timeworthymedia.ikmal-editor.spellserver') {
    throw new Error('A different spell service already uses this installation path. ikmal editor left it unchanged.');
  }
  fs.mkdirSync(path.dirname(state.path), { recursive: true });
  if (fs.existsSync(state.path)) fs.rmSync(state.path, { recursive: true, force: true });
  fs.cpSync(spellServerSourcePath(), state.path, { recursive: true });
  return spellServerState();
}

function removeSpellServer() {
  const state = spellServerState();
  if (!state.supported) throw new Error('The native macOS spell service is only available on macOS.');
  if (!fs.existsSync(state.path)) return state;
  if (bundleIdentifier(state.path) !== 'com.timeworthymedia.ikmal-editor.spellserver') {
    throw new Error('The existing spell service was not installed by ikmal editor, so it was left unchanged.');
  }
  fs.rmSync(state.path, { recursive: true, force: true });
  return spellServerState();
}

async function endpointReady(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(700) });
    return response.ok;
  } catch (_) {
    return false;
  }
}

function recentChecksPath() {
  return path.join(app.getPath('userData'), 'recent-checks.json');
}

function readRecentChecks() {
  try {
    const entries = JSON.parse(fs.readFileSync(recentChecksPath(), 'utf8'));
    return Array.isArray(entries) ? entries.slice(0, RECENT_CHECK_LIMIT) : [];
  } catch (_) {
    return [];
  }
}

function recordRecentCheck(text, response) {
  const normalized = String(text || '').trim();
  if (!normalized) return;
  const entries = readRecentChecks().filter((entry) => entry.text !== normalized);
  entries.unshift({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    text: normalized,
    checkedAt: new Date().toISOString(),
    matchCount: Array.isArray(response.matches) ? response.matches.length : 0,
  });
  try {
    fs.mkdirSync(path.dirname(recentChecksPath()), { recursive: true });
    fs.writeFileSync(recentChecksPath(), `${JSON.stringify(entries.slice(0, RECENT_CHECK_LIMIT), null, 2)}\n`);
  } catch (error) {
    console.warn(`Could not save recent check: ${error.message}`);
  }
}

function clearRecentChecks() {
  try {
    fs.rmSync(recentChecksPath(), { force: true });
  } catch (error) {
    console.warn(`Could not clear recent checks: ${error.message}`);
  }
  return [];
}

async function readServiceState() {
  const [languageToolReady, proxyReady, qualityReady] = await Promise.all([
    endpointReady(`${LANGUAGE_TOOL_URL}/v2/languages`),
    endpointReady(`${QUALITY_PROXY_URL}/health`),
    endpointReady(QUALITY_HEALTH_URL),
  ]);
  return {
    languageToolReady,
    proxyReady,
    qualityReady,
    managerRunning: Boolean(backendProcess && backendProcess.exitCode === null),
    proxyUrl: QUALITY_PROXY_URL,
    qualityUrl: QUALITY_HEALTH_URL,
  };
}

function send(channel, payload) {
  if (desktopIPCAPI && !desktopIPCAPI.isDesktopEventChannel(channel)) {
    throw new Error(`Refusing to send an unregistered desktop event channel: ${channel}`);
  }
  [mainWindow, editorWindow].forEach((window) => {
    if (window && !window.isDestroyed()) window.webContents.send(channel, payload);
  });
}

async function publishServiceState() {
  send('service-state', await readServiceState());
}

function startManager() {
  if (backendProcess && backendProcess.exitCode === null) {
    return;
  }
  const binary = findManagerBinary();
  if (!fs.existsSync(binary)) {
    send('service-error', `Manager binary not found at ${binary}. Build it with: go build -o ikmal-editor .`);
    return;
  }
  backendProcess = spawn(binary, ['--integrated'], {
    cwd: path.dirname(binary),
    env: { ...process.env },
    stdio: 'ignore',
  });
  backendProcess.on('error', (error) => send('service-error', error.message));
  backendProcess.on('exit', (code, signal) => {
    if (!quitting) {
      send('service-error', `ikmal services stopped${code === null ? ` (${signal})` : ` (exit ${code})`}.`);
      publishServiceState();
    }
  });
  publishServiceState();
}

function stopManager() {
  if (!backendProcess || backendProcess.exitCode !== null) {
    return;
  }
  backendProcess.kill('SIGTERM');
  backendProcess = undefined;
  publishServiceState();
}

function runManagerCommand(args, extraEnv = {}, options = {}) {
  return new Promise((resolve, reject) => {
    const binary = findManagerBinary();
    if (!fs.existsSync(binary)) {
      reject(new Error(`Manager binary not found at ${binary}. Build the desktop bundle first.`));
      return;
    }
    execFile(binary, args, {
      cwd: path.dirname(binary),
      env: { ...process.env, ...extraEnv },
      timeout: options.timeout ?? 10000,
      // The quality-stack install pipes an npm install and a model download
      // through stdout. At the 1MB default execFile kills the child partway
      // through with ERR_CHILD_PROCESS_STDIO_MAXBUFFER, which surfaces as a
      // failed install after the user has already waited for the download.
      maxBuffer: options.maxBuffer ?? 1024 * 1024,
    }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error((stderr || stdout || error.message).trim()));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

// positionWindow places the popover next to the pointer. It belongs only to
// *invocation* — a tray click or a quick check — never to a resize. The window
// grows and shrinks as the user types, and re-running this on every resize made
// it jump to wherever the mouse happened to be resting, sometimes onto another
// display mid-sentence. Resizes use constrainWindowToDisplay instead.
function positionWindow() {
  const point = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(point);
  const bounds = mainWindow.getBounds();
  const x = Math.min(Math.max(display.bounds.x + 12, point.x - bounds.width + 24), display.bounds.x + display.bounds.width - bounds.width - 12);
  const y = Math.min(display.bounds.y + 42, point.y + 12);
  mainWindow.setPosition(Math.round(x), Math.round(y), false);
}

// Keep the window exactly where the user left it, and only pull it back when
// its new size would push it off the screen it is already on.
function constrainWindowToDisplay() {
  if (!mainWindow) return;
  const bounds = mainWindow.getBounds();
  const area = screen.getDisplayMatching(bounds).workArea;
  const x = Math.min(Math.max(area.x, bounds.x), area.x + Math.max(0, area.width - bounds.width));
  const y = Math.min(Math.max(area.y, bounds.y), area.y + Math.max(0, area.height - bounds.height));
  if (x !== bounds.x || y !== bounds.y) mainWindow.setPosition(Math.round(x), Math.round(y), false);
}

function toggleWindow() {
  if (!mainWindow) return;
  // A tray click should restore an unfocused window. This matters on macOS,
  // where the compact window can remain technically visible after focus moves
  // to another app.
  if (mainWindow.isVisible() && mainWindow.isFocused()) {
    mainWindow.hide();
    return;
  }
  showWindow();
}

function showWindow() {
  if (!mainWindow) return;
  positionWindow();
  mainWindow.show();
  mainWindow.focus();
  send('compact-invoked');
  publishServiceState();
}

// activate is false when the renderer collapses the drawer on its own — for
// instance once the last suggestion is applied. Only a real click on the toggle
// should raise and focus the window; doing it on an automatic collapse would
// pull focus out of whatever the user was typing in.
function setCompactExpanded(expanded, activate = true) {
  if (!mainWindow) return false;
  const width = expanded ? 760 : 430;
  mainWindow.setMinimumSize(expanded ? 620 : 380, 440);
  const bounds = mainWindow.getBounds();
  const nextHeight = Math.max(440, bounds.height);
  if (bounds.width !== width || bounds.height !== nextHeight) mainWindow.setSize(width, nextHeight, true);
  constrainWindowToDisplay();
  if (activate) {
    mainWindow.show();
    mainWindow.focus();
  }
  return true;
}

// The launcher's height bounds, named once because they were stated twice and
// disagreed: the clamp allowed 360 while the window itself refused to go below
// 440, so the window won and the clamp was decorative. The floor is what the
// launcher needs with nothing to report — a quick-check field, the modes, and
// the two ways out of the window.
const COMPACT_MIN_HEIGHT = 360;
const COMPACT_MAX_HEIGHT = 820;

function setCompactHeight(height) {
  if (!mainWindow) return false;
  const bounds = mainWindow.getBounds();
  const nextHeight = Math.max(COMPACT_MIN_HEIGHT, Math.min(COMPACT_MAX_HEIGHT, Math.round(Number(height) || bounds.height)));
  if (bounds.height === nextHeight) return true;
  mainWindow.setSize(bounds.width, nextHeight, true);
  constrainWindowToDisplay();
  return true;
}

// deliverEditorText hands pending text to the editor renderer once the page is
// listening. Readiness is tracked with an explicit flag set from
// did-finish-load rather than webContents.isLoading(), which still reports true
// while that event is being delivered — polling it drops the text entirely.
function deliverEditorText() {
  if (!editorWindow || !editorReady || !editorPendingText) return;
  send('editor-text', editorPendingText);
  editorPendingText = '';
}

function showEditorWindow(text = '') {
  const initialText = String(text || '');
  // Only replace the editor's contents when there is text to hand over.
  // Reopening the window from the tray, the dock, or app.on('activate') passes
  // nothing, and sending an empty string would clear the user's draft.
  if (initialText) editorPendingText = initialText;
  if (!editorWindow) {
    editorWindow = new BrowserWindow({
      width: 1120,
      height: 760,
      minWidth: 840,
      minHeight: 600,
      show: false,
      resizable: true,
      title: 'ikmal editor',
      backgroundColor: '#1e1e22',
      // The full editor is a normal desktop window. Keeping the native title
      // bar prevents its controls from competing with the writing toolbar.
      titleBarStyle: 'default',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: desktopEditorPreloadPath(),
      },
    });
    editorWindow.loadFile(desktopEditorPagePath());
    // on, not once: a reload re-runs the renderer and clears its listeners, so
    // readiness has to be re-established each time the page loads.
    editorWindow.webContents.on('did-finish-load', () => {
      editorReady = true;
      deliverEditorText();
    });
    editorWindow.once('ready-to-show', () => {
      editorWindow.show();
      editorWindow.focus();
      deliverEditorText();
    });
    const editorContentsID = editorWindow.webContents.id;
    editorWindow.on('closed', () => { checkStates.delete(editorContentsID); editorWindow = undefined; editorReady = false; });
    return;
  }
  editorWindow.show();
  editorWindow.focus();
  deliverEditorText();
}

function quickCheckClipboard() {
  const text = clipboard.readText();
  if (!text.trim()) {
    send('service-error', 'The clipboard does not contain any text to check.');
    return;
  }
  showWindow();
  send('quick-check', text);
}

function createTray() {
  // Use a transparent PNG for the menubar. Electron/macOS can rasterize SVGs
  // inconsistently, which can result in an invisible or white-box tray icon.
  const iconPath = assetPath('ikmal_languagetool_tray.png');
  let icon = nativeImage.createFromPath(iconPath);
  if (icon.isEmpty()) {
    console.error(`Could not load tray icon at ${iconPath}`);
  }
  if (process.platform === 'darwin') {
    icon = icon.resize({ width: 18, height: 18 });
    icon.setTemplateImage(true);
  }
  tray = new Tray(icon);
  tray.setToolTip('ikmal editor');
  tray.on('click', toggleWindow);
  tray.on('right-click', () => {
    const menu = Menu.buildFromTemplate([
      { label: 'Quick check clipboard', click: quickCheckClipboard },
      { label: 'Open editor…', click: () => showEditorWindow() },
      { label: 'Open writing tester', click: showWindow },
      { label: `Recent checks (${readRecentChecks().length})`, click: () => { showWindow(); send('show-history'); } },
      { type: 'separator' },
      { label: 'Start services', click: startManager },
      { label: 'Stop services', click: stopManager },
      { type: 'separator' },
      { label: 'Quit ikmal editor', click: () => { quitting = true; app.quit(); } },
    ]);
    tray.popUpContextMenu(menu);
  });
}

function destroyTray() {
  if (!tray) return;
  tray.destroy();
  tray = undefined;
}

function desktopPresenceState() {
  return {
    menubarIcon: desktopPreferences.menubarIcon,
    dockIcon: desktopPreferences.dockIcon,
    dockSupported: process.platform === 'darwin',
  };
}

function applyDesktopPreferences() {
  applyDockVisibility();
  destroyTray();
  if (desktopPreferences.menubarIcon) createTray();
}

async function checkText(text, options = {}, stateKey = 0) {
  // Without the compiled planner the whole document is checked, as before.
  const plan = chunkedChecksAPI
    ? chunkedChecksAPI.planChunkedCheck(writingCoreAPI, text, checkStates.get(stateKey), options)
    : { text, sent: text, chunk: null, carried: null };
  const body = new URLSearchParams({
    text: plan.sent,
    language: 'en-US',
    enabledOnly: 'false',
  });
  const response = await fetch(`${QUALITY_PROXY_URL}/v2/check`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    throw new Error(`Writing check failed with HTTP ${response.status}`);
  }
  const merged = chunkedChecksAPI
    ? chunkedChecksAPI.mergeChunkedCheck(await response.json(), plan)
    : await response.json();
  // Both of these describe the document, not the slice that was sent: the
  // dictionary filters against the text the offsets belong to, and a recent
  // session is the draft, not one paragraph of it.
  merged.matches = filterDictionaryMatches(merged.matches, text, desktopPreferences?.dictionary);
  recordRecentCheck(text, merged);
  if (chunkedChecksAPI) checkStates.set(stateKey, chunkedChecksAPI.chunkedCheckState(plan, merged));
  return merged;
}

function filterDictionaryMatches(matches, text, dictionary) {
  const words = new Set((Array.isArray(dictionary) ? dictionary : [])
    .map((word) => String(word || '').trim().toLocaleLowerCase())
    .filter(Boolean));
  if (!words.size) return matches;
  return (Array.isArray(matches) ? matches : []).filter((match) => {
    const issueType = String(match?.rule?.issueType || '').toLowerCase();
    const category = String(match?.rule?.category?.id || '').toLowerCase();
    const rule = String(match?.rule?.id || '').toLowerCase();
    const spelling = issueType.includes('misspell') || category.includes('spell')
      || category.includes('typo') || rule.includes('morfologik');
    if (!spelling) return true;
    const word = String(text || '').slice(Number(match.offset), Number(match.offset) + Number(match.length))
      .trim().toLocaleLowerCase();
    return !words.has(word);
  });
}

function openedAtLogin() {
  try {
    return launchedAtLogin({
      loginItemSettings: process.platform === 'darwin' ? app.getLoginItemSettings() : undefined,
    });
  } catch {
    // A platform that cannot report login-item state is treated as a normal
    // launch; showing the popover is the recoverable side of that guess.
    return false;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 430,
    height: 520,
    minWidth: 380,
    minHeight: COMPACT_MIN_HEIGHT,
    show: false,
    resizable: true,
    title: 'ikmal editor',
    backgroundColor: '#101318',
    // The compact writing tester is invoked from the menubar and should not
    // carry a second title bar or traffic lights. The expanded editor keeps
    // the normal macOS title-bar treatment below.
    frame: process.platform !== 'darwin',
    vibrancy: undefined,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: desktopCompactPreloadPath(),
    },
  });
  mainWindow.loadFile(desktopCompactPagePath());
  // A launch the user asked for should land on the popover. A launch-at-login
  // start should not: the window positions itself at the pointer and takes
  // focus, so showing it would interrupt whatever the login session opens with.
  mainWindow.once('ready-to-show', () => { if (!openedAtLogin()) showWindow(); });
  // The compact window hides on blur so it behaves like a menubar popover.
  // A native file panel steals focus, so auto-hide is suppressed while one is
  // open; otherwise the window disappears and takes its attached sheet along.
  mainWindow.on('blur', () => { if (!suppressAutoHide) mainWindow.hide(); });
  const compactContentsID = mainWindow.webContents.id;
  mainWindow.on('closed', () => { checkStates.delete(compactContentsID); mainWindow = undefined; });
}

function registerIPC() {
	if (!desktopIPCAPI) throw new Error('The compiled desktop IPC contract is not loaded.');
	const nativeIPCHandle = ipcMain.handle.bind(ipcMain);
	ipcMain.handle = (channel, listener) => nativeIPCHandle(channel, async (event, ...args) => {
	  const parsed = desktopIPCAPI.parseDesktopInvoke(channel, args);
	  if (!parsed) throw new Error(`Rejected desktop IPC invocation: ${channel}`);
	  return listener(event, ...parsed.args);
	});
	launchAtLogin = createLaunchAtLoginController({
		platform: process.platform,
		appDataPath: app.getPath('appData'),
		executablePath: process.execPath,
		appPath: app.getAppPath(),
		isPackaged: app.isPackaged,
		electron: app,
	});
  ipcMain.handle('service-state', readServiceState);
  ipcMain.handle('open-editor', (_, text) => { showEditorWindow(text); return true; });
  ipcMain.handle('open-compact', () => { showWindow(); return true; });
  ipcMain.handle('set-compact-expanded', (_, expanded, activate) => setCompactExpanded(Boolean(expanded), activate !== false));
  ipcMain.handle('set-compact-height', (_, height) => setCompactHeight(height));
  ipcMain.handle('start-services', async () => {
    const state = await readServiceState();
    if (state.languageToolReady && state.proxyReady && state.qualityReady) return state;
    startManager();
    return readServiceState();
  });
  ipcMain.handle('stop-services', () => { stopManager(); return readServiceState(); });
  ipcMain.handle('integration-status', async () => {
    const output = await runManagerCommand(['--integration-status'], { IKMAL_EDITOR_SERVER_URL: INTEGRATION_ENDPOINT });
    return JSON.parse(output);
  });
  ipcMain.handle('configure-integrations', async (_, targetIDs) => {
    const allowed = new Set(['macos', 'firefox', 'chrome', 'vscode']);
    const targets = Array.isArray(targetIDs) ? targetIDs.filter((id) => allowed.has(id)) : [];
    if (!targets.length) throw new Error('No detected integrations were selected. Choose at least one integration to configure.');
    const output = await runManagerCommand(['--configure-apps'], {
      IKMAL_EDITOR_SERVER_URL: INTEGRATION_ENDPOINT,
      IKMAL_EDITOR_CONFIGURE_APPS: targets.join(','),
    });
    return { targets, output };
  });
  ipcMain.handle('quality-status', async () => {
    const output = await runManagerCommand(['--quality-status']);
    return JSON.parse(output);
  });
  ipcMain.handle('quality-setup', async (_, acknowledged) => {
    // The renderer gates this button on an explicit acknowledgement, so the
    // consent the CLI would prompt for is passed through rather than the app
    // hanging on a prompt no window can answer. Refuse without it.
    if (acknowledged !== true) {
      throw new Error('The third-party notices must be acknowledged before the quality stack can be installed.');
    }
    const output = await runManagerCommand(['--quality-setup'], {
      IKMAL_ACCEPT_QUALITY_NOTICES: '1',
    }, { timeout: 30 * 60 * 1000, maxBuffer: 64 * 1024 * 1024 });
    return { output, status: JSON.parse(await runManagerCommand(['--quality-status'])) };
  });
  ipcMain.handle('reveal-extension', async () => {
    const candidates = [
      path.join(process.resourcesPath || '', 'extension'),
      path.resolve(__dirname, '..', 'extension'),
    ];
    const target = candidates.find((candidate) => candidate && fs.existsSync(candidate));
    if (!target) throw new Error('The extension directory was not found in this build.');
    shell.showItemInFolder(path.join(target, 'manifest.json'));
    return target;
  });
  // The one channel this rewrite added. Every other capability it needed
  // already existed; About had no way to ask what version it was, so the panel
  // reported "unknown" about the app it was running inside.
  ipcMain.handle('app-version', () => app.getVersion());
  ipcMain.handle('open-third-party-notices', async () => {
    const candidates = [
      path.join(process.resourcesPath || '', 'THIRD-PARTY-NOTICES.md'),
      path.join(__dirname, '..', 'THIRD-PARTY-NOTICES.md'),
    ];
    const notices = candidates.find((candidate) => candidate && fs.existsSync(candidate));
    if (!notices) throw new Error('THIRD-PARTY-NOTICES.md was not found in this build.');
    await shell.openPath(notices);
    return true;
  });
  ipcMain.handle('check-text', (event, text, options) => checkText(text, options || {}, event.sender.id));
  ipcMain.handle('recent-checks', () => readRecentChecks());
  ipcMain.handle('clear-recent-checks', () => clearRecentChecks());
  ipcMain.handle('style-guide-state', async () => {
    const response = await fetch(STYLE_GUIDE_URL, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) throw new Error(`Style-guide state failed with HTTP ${response.status}`);
    return response.json();
  });
  ipcMain.handle('import-style-guide', async (event) => {
    // Parent the panel to the window that actually asked for it. Preferring the
    // editor window attached the compact window's sheet to a window that may be
    // hidden or behind, leaving the user with no visible dialog.
    const owner = BrowserWindow.fromWebContents(event.sender) || editorWindow || mainWindow;
    // The compact window hides itself on blur, which would take an attached
    // sheet down with it and leave this promise pending forever.
    const suppressed = owner === mainWindow;
    if (suppressed) suppressAutoHide = true;
    let result;
    try {
      result = await dialog.showOpenDialog(owner, {
        title: 'Import a style guide',
        buttonLabel: 'Import guide',
        properties: ['openFile'],
        filters: [
          { name: 'Style guides', extensions: ['pdf', 'html', 'htm', 'md', 'markdown', 'txt'] },
          { name: 'All files', extensions: ['*'] },
        ],
      });
    } finally {
      if (suppressed) suppressAutoHide = false;
    }
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    const filePath = result.filePaths[0];
    const output = await runManagerCommand(['--style-guide-import', filePath]);
    return { canceled: false, filePath, output };
  });
  ipcMain.handle('style-guide-select', async (_, id) => {
    const response = await fetch(`${QUALITY_PROXY_URL}/v1/style-guide/select`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw new Error(detail.error || `Style-guide selection failed with HTTP ${response.status}`);
    }
    return response.json();
  });
  ipcMain.handle('style-guide-enabled', async (_, enabled) => {
    const response = await fetch(`${QUALITY_PROXY_URL}/v1/style-guide/enabled`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: Boolean(enabled) }),
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw new Error(detail.error || `Style-guide setting failed with HTTP ${response.status}`);
    }
    return response.json();
  });
  ipcMain.handle('set-launch-at-login', (_, enabled) => {
		return launchAtLogin.set(Boolean(enabled));
	});
	ipcMain.handle('get-launch-at-login', () => launchAtLogin.get());
  ipcMain.handle('desktop-presence-state', () => desktopPresenceState());
  ipcMain.handle('get-annotation-preferences', () => annotationPreferencesState());
  ipcMain.handle('add-dictionary-word', (_, word) => {
    const value = String(word || '').trim();
    if (!value) throw new Error('There is no word to add.');
    desktopPreferences.dictionary = [...new Set([...(desktopPreferences.dictionary || []), value])];
    saveDesktopPreferences();
    return { word: value };
  });
  ipcMain.handle('set-annotation-preferences', (_, next) => {
    const requested = next && typeof next === 'object' ? next : {};
    desktopPreferences = {
      ...desktopPreferences,
      annotationStyle: ['line', 'dash'].includes(requested.style) ? requested.style : ANNOTATION_DEFAULTS.style,
      annotationPalette: ANNOTATION_PALETTES.has(requested.palette) ? requested.palette : ANNOTATION_DEFAULTS.palette,
      annotationIntensity: normalizeAnnotationIntensity(requested.intensity),
    };
    saveDesktopPreferences();
    const preferences = annotationPreferencesState();
    send('annotation-preferences', preferences);
    return preferences;
  });
  ipcMain.handle('get-checking-preferences', () => checkingPreferencesState());
  ipcMain.handle('set-checking-preferences', (_, next) => {
    const requested = next && typeof next === 'object' ? next : {};
    const categories = requested.categories && typeof requested.categories === 'object' ? requested.categories : {};
    desktopPreferences = {
      ...desktopPreferences,
      checkMode: requested.mode === 'manual' ? 'manual' : 'automatic',
      checkDelay: Number.isFinite(Number(requested.delay)) ? Math.max(200, Math.min(2000, Math.round(Number(requested.delay) / 50) * 50)) : CHECKING_DEFAULTS.delay,
      checkSensitivity: Number.isFinite(Number(requested.sensitivity)) ? Math.max(0, Math.min(100, Math.round(Number(requested.sensitivity) / 5) * 5)) : CHECKING_DEFAULTS.sensitivity,
      checkCategories: {
        grammar: categories.grammar !== false,
        repetition: categories.repetition !== false,
        style: categories.style !== false,
        languagetool: categories.languagetool !== false,
      },
    };
    saveDesktopPreferences();
    const preferences = checkingPreferencesState();
    send('checking-preferences', preferences);
    // The effective preferences are derived from these, so anyone showing the
    // focus state needs to hear about it.
    send('focus-mode', focusModeState());
    return preferences;
  });
  ipcMain.handle('focus-mode-state', () => focusModeState());
  ipcMain.handle('set-focus-mode', (_, next) => {
    const requested = next && typeof next === 'object' ? next : {};
    const focus = focusModeModule();
    // A duration is only meaningful when starting a mode; switching back to
    // active clears the deadline rather than carrying a stale one.
    const state = requested.mode === 'active' || !focus.FOCUS_MODES.includes(requested.mode)
      ? { mode: 'active', until: null }
      : focus.startFocusState(requested.mode, requested.duration);
    // The chosen duration is kept beside the deadline it produced. The core
    // normalizes focus state down to mode and deadline, so this is the only
    // place the choice itself survives.
    desktopPreferences = {
      ...desktopPreferences,
      focusMode: state.mode === 'active' ? state : { ...state, duration: requested.duration || 'forever' },
    };
    saveDesktopPreferences();
    const full = focusModeState();
    send('focus-mode', full);
    return full;
  });
  ipcMain.handle('spell-server-state', () => spellServerState());
  ipcMain.handle('install-spell-server', () => installSpellServer());
  ipcMain.handle('remove-spell-server', () => removeSpellServer());
  ipcMain.handle('office-bridge-state', () => officeBridgeState());
  ipcMain.handle('office-bridge-generate-certificate', () => generateOfficeCertificate());
  ipcMain.handle('office-bridge-start', () => startOfficeBridge());
  ipcMain.handle('office-bridge-stop', () => stopOfficeBridge());
  ipcMain.handle('office-bridge-remove-certificate', () => removeOfficeCertificate());
  ipcMain.handle('office-reveal-manifest', () => revealOfficeManifest('manifest-word.xml'));
  ipcMain.handle('office-reveal-excel-manifest', () => revealOfficeManifest('manifest-excel.xml'));
  ipcMain.handle('office-reveal-powerpoint-manifest', () => revealOfficeManifest('manifest-powerpoint.xml'));
  ipcMain.handle('office-reveal-outlook-manifest', () => revealOfficeManifest('manifest-outlook.xml'));
  ipcMain.handle('office-reveal-onenote-manifest', () => revealOfficeManifest('manifest-onenote.xml'));
  ipcMain.handle('office-reveal-project-manifest', () => revealOfficeManifest('manifest-project.xml'));
  ipcMain.handle('set-desktop-presence', (_, next) => {
    const requested = next && typeof next === 'object' ? next : {};
    let menubarIcon = requested.menubarIcon !== false;
    let dockIcon = requested.dockIcon === true;
    let notice = '';
    // Keep at least one local entry point available. Which one can be kept is
    // platform-specific: only macOS has a Dock, and applyDockVisibility is a
    // no-op elsewhere. Substituting the Dock on Windows or Linux would leave
    // the app running with no tray, no dock, and no way back to it.
    if (!menubarIcon && !dockIcon) {
      if (process.platform === 'darwin') {
        dockIcon = true;
        notice = 'The Dock icon was kept on because at least one way to open ikmal editor must remain available.';
      } else {
        menubarIcon = true;
        notice = 'The tray icon was kept on because it is the only way to open ikmal editor on this platform.';
      }
    }
    desktopPreferences = { ...desktopPreferences, menubarIcon, dockIcon };
    saveDesktopPreferences();
    applyDesktopPreferences();
    return { ...desktopPresenceState(), notice };
  });
}

app.whenReady().then(async () => {
  desktopPreferences = readDesktopPreferences();
  await loadDesktopIPCContract();
  await loadWritingCore();
  registerIPC();
  createWindow();
  applyDesktopPreferences();
  startManager();
  pollTimer = setInterval(publishServiceState, SERVICE_POLL_MS);
}).catch((error) => {
  // Startup runs entirely inside this promise: a rejection anywhere in it
  // leaves the app with no IPC handlers, no window, and no tray, which looks
  // exactly like an app that launched and then did nothing. Say what failed
  // and exit rather than sitting there.
  console.error('ikmal editor could not start:', error);
  dialog.showErrorBox('ikmal editor could not start', error?.message || String(error));
  app.exit(1);
});

app.on('activate', () => {
  // A visible Dock icon is the full-editor entry point. If the Dock icon is
  // hidden, activation still restores the compact window for OS-level calls.
  if (desktopPreferences?.dockIcon) showEditorWindow();
  else showWindow();
});

app.on('window-all-closed', (event) => event.preventDefault());
app.on('before-quit', () => {
  quitting = true;
  clearInterval(pollTimer);
  void stopOfficeBridge();
  stopManager();
});
