const { app, BrowserWindow, Menu, Tray, nativeImage, ipcMain, screen, clipboard } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { createLaunchAtLoginController } = require('./launch_at_login.cjs');

const QUALITY_PROXY_URL = process.env.IKMAL_DESKTOP_PROXY_URL || 'http://127.0.0.1:8096';
const STYLE_GUIDE_URL = `${QUALITY_PROXY_URL}/v1/style-guides`;
const QUALITY_HEALTH_URL = process.env.IKMAL_DESKTOP_QUALITY_URL || 'http://127.0.0.1:8098/health';
const LANGUAGE_TOOL_URL = process.env.IKMAL_DESKTOP_LANGUAGETOOL_URL || 'http://127.0.0.1:8097';
const SERVICE_POLL_MS = 3000;
const RECENT_CHECK_LIMIT = 10;

let tray;
let mainWindow;
let backendProcess;
let pollTimer;
let quitting = false;
let launchAtLogin;

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
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
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
      send('service-error', `Ikmal services stopped${code === null ? ` (${signal})` : ` (exit ${code})`}.`);
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
  if (mainWindow.isVisible()) {
    mainWindow.hide();
    return;
  }
  positionWindow();
  mainWindow.show();
  mainWindow.focus();
  publishServiceState();
}

function showWindow() {
  if (!mainWindow) return;
  positionWindow();
  mainWindow.show();
  mainWindow.focus();
  publishServiceState();
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
  const iconPath = assetPath('ikmal_languagetool_tray.svg');
  const icon = nativeImage.createFromPath(iconPath);
  if (process.platform === 'darwin') {
    icon.setTemplateImage(true);
  }
  tray = new Tray(icon);
  tray.setToolTip('Ikmal Editor');
  tray.on('click', toggleWindow);
  tray.on('right-click', () => {
    const menu = Menu.buildFromTemplate([
      { label: 'Quick check clipboard', click: quickCheckClipboard },
      { label: 'Open writing tester', click: showWindow },
      { label: `Recent checks (${readRecentChecks().length})`, click: () => { showWindow(); send('show-history'); } },
      { type: 'separator' },
      { label: 'Start services', click: startManager },
      { label: 'Stop services', click: stopManager },
      { type: 'separator' },
      { label: 'Quit Ikmal Editor', click: () => { quitting = true; app.quit(); } },
    ]);
    tray.popUpContextMenu(menu);
  });
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
    height: 680,
    minWidth: 380,
    minHeight: 560,
    show: false,
    resizable: true,
    title: 'Ikmal Editor',
    backgroundColor: '#101318',
    vibrancy: process.platform === 'darwin' ? 'under-window' : undefined,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
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
  ipcMain.handle('start-services', () => { startManager(); return readServiceState(); });
  ipcMain.handle('stop-services', () => { stopManager(); return readServiceState(); });
  ipcMain.handle('check-text', (_, text) => checkText(text));
  ipcMain.handle('recent-checks', () => readRecentChecks());
  ipcMain.handle('clear-recent-checks', () => clearRecentChecks());
  ipcMain.handle('style-guide-state', async () => {
    const response = await fetch(STYLE_GUIDE_URL, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) throw new Error(`Style-guide state failed with HTTP ${response.status}`);
    return response.json();
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
}

app.whenReady().then(() => {
  registerIPC();
  createWindow();
  createTray();
  startManager();
  pollTimer = setInterval(publishServiceState, SERVICE_POLL_MS);
});

app.on('window-all-closed', (event) => event.preventDefault());
app.on('before-quit', () => {
  quitting = true;
  clearInterval(pollTimer);
  stopManager();
});
