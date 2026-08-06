const { app, BrowserWindow, Menu, Tray, nativeImage, ipcMain, screen, clipboard, dialog, shell } = require('electron');
const { spawn, execFile, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { createLaunchAtLoginController } = require('./launch_at_login.cjs');

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
let officeBridgeServer;

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
      ...normalizeCheckingPreferences(saved),
    };
  } catch (_) {
    return { menubarIcon: true, dockIcon: false, annotationStyle: ANNOTATION_DEFAULTS.style, annotationPalette: ANNOTATION_DEFAULTS.palette, annotationIntensity: ANNOTATION_DEFAULTS.intensity, ...normalizeCheckingPreferences() };
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

function officeCertificateDirectory() {
  return path.join(app.getPath('userData'), 'office-bridge-certificate');
}

function officeBridgeState() {
  const certificate = officeBridgeModule('certificate.cjs').certificateState(officeCertificateDirectory());
  return {
    supported: true,
    running: Boolean(officeBridgeServer),
    url: 'https://localhost:8765/office/word/',
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
    key: fs.readFileSync(state.keyPath),
    cert: fs.readFileSync(state.certificatePath),
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
    server.listen(8765, '127.0.0.1');
  }).catch((error) => {
    server.close();
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

function revealOfficeManifest(name = 'manifest-word.xml') {
  const allowed = new Set(['manifest-word.xml', 'manifest-excel.xml', 'manifest-powerpoint.xml', 'manifest-outlook.xml', 'manifest-onenote.xml', 'manifest-project.xml']);
  const manifestName = allowed.has(name) ? name : 'manifest-word.xml';
  const manifestPath = path.join(officeBridgeResourcePath(), manifestName);
  if (!fs.existsSync(manifestPath)) throw new Error('The Word Office manifest is not included in this build.');
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
      maxBuffer: 1024 * 1024,
    }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error((stderr || stdout || error.message).trim()));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

function positionWindow() {
  const point = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(point);
  const bounds = mainWindow.getBounds();
  const x = Math.min(Math.max(display.bounds.x + 12, point.x - bounds.width + 24), display.bounds.x + display.bounds.width - bounds.width - 12);
  const y = Math.min(display.bounds.y + 42, point.y + 12);
  mainWindow.setPosition(Math.round(x), Math.round(y), false);
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
  mainWindow.webContents.send('compact-invoked');
  publishServiceState();
}

function setCompactExpanded(expanded) {
  if (!mainWindow) return false;
  const width = expanded ? 760 : 430;
  mainWindow.setMinimumSize(expanded ? 620 : 380, 440);
  const bounds = mainWindow.getBounds();
  const nextHeight = Math.max(440, bounds.height);
  if (bounds.width !== width || bounds.height !== nextHeight) mainWindow.setSize(width, nextHeight, true);
  positionWindow();
  mainWindow.show();
  mainWindow.focus();
  return true;
}

function setCompactHeight(height) {
  if (!mainWindow) return false;
  const bounds = mainWindow.getBounds();
  const nextHeight = Math.max(440, Math.min(820, Math.round(Number(height) || bounds.height)));
  if (bounds.height === nextHeight) return true;
  mainWindow.setSize(bounds.width, nextHeight, true);
  positionWindow();
  return true;
}

function showEditorWindow(text = '') {
  const initialText = String(text || '');
  editorPendingText = initialText;
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
        preload: path.join(__dirname, 'preload.cjs'),
      },
    });
    editorWindow.loadFile(path.join(__dirname, 'editor.html'));
    editorWindow.once('ready-to-show', () => {
      editorWindow.show();
      editorWindow.focus();
      editorWindow.webContents.send('editor-text', editorPendingText);
      editorPendingText = '';
    });
    editorWindow.on('closed', () => { editorWindow = undefined; });
    return;
  }
  editorWindow.show();
  editorWindow.focus();
  if (!editorWindow.webContents.isLoading()) {
    editorWindow.webContents.send('editor-text', editorPendingText);
    editorPendingText = '';
  }
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

async function checkText(text) {
  const body = new URLSearchParams({
    text,
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
  const result = await response.json();
  recordRecentCheck(text, result);
  return result;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 430,
    height: 520,
    minWidth: 380,
    minHeight: 440,
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
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.once('ready-to-show', () => showWindow());
  mainWindow.on('blur', () => mainWindow.hide());
  mainWindow.on('closed', () => { mainWindow = undefined; });
}

function registerIPC() {
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
  ipcMain.handle('set-compact-expanded', (_, expanded) => setCompactExpanded(Boolean(expanded)));
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
    }, { timeout: 30 * 60 * 1000 });
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
  ipcMain.handle('check-text', (_, text) => checkText(text));
  ipcMain.handle('recent-checks', () => readRecentChecks());
  ipcMain.handle('clear-recent-checks', () => clearRecentChecks());
  ipcMain.handle('style-guide-state', async () => {
    const response = await fetch(STYLE_GUIDE_URL, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) throw new Error(`Style-guide state failed with HTTP ${response.status}`);
    return response.json();
  });
  ipcMain.handle('import-style-guide', async () => {
    const owner = editorWindow || mainWindow;
    const result = await dialog.showOpenDialog(owner, {
      title: 'Import a style guide',
      buttonLabel: 'Import guide',
      properties: ['openFile'],
      filters: [
        { name: 'Style guides', extensions: ['pdf', 'html', 'htm', 'md', 'markdown', 'txt'] },
        { name: 'All files', extensions: ['*'] },
      ],
    });
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
    return preferences;
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
    const menubarIcon = requested.menubarIcon !== false;
    let dockIcon = requested.dockIcon === true;
    let notice = '';
    // Keep at least one local entry point available. Turning off the menubar
    // while the Dock is hidden would strand a background app with no UI.
    if (!menubarIcon && !dockIcon) {
      dockIcon = true;
      notice = 'The Dock icon was kept on because at least one way to open ikmal editor must remain available.';
    }
    desktopPreferences = { ...desktopPreferences, menubarIcon, dockIcon };
    saveDesktopPreferences();
    applyDesktopPreferences();
    return { ...desktopPresenceState(), notice };
  });
}

app.whenReady().then(() => {
  desktopPreferences = readDesktopPreferences();
  registerIPC();
  createWindow();
  applyDesktopPreferences();
  startManager();
  pollTimer = setInterval(publishServiceState, SERVICE_POLL_MS);
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
