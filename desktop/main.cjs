const { app, BrowserWindow, Menu, Tray, nativeImage, ipcMain, screen } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const QUALITY_PROXY_URL = process.env.IKMAL_DESKTOP_PROXY_URL || 'http://127.0.0.1:8096';
const QUALITY_HEALTH_URL = process.env.IKMAL_DESKTOP_QUALITY_URL || 'http://127.0.0.1:8098/health';
const SERVICE_POLL_MS = 3000;

let tray;
let mainWindow;
let backendProcess;
let pollTimer;
let quitting = false;

function findManagerBinary() {
  if (process.env.IKMAL_MANAGER_BINARY) {
    return process.env.IKMAL_MANAGER_BINARY;
  }
  const candidates = process.env.IKMAL_DESKTOP_PACKAGED === '1'
    ? [path.join(process.resourcesPath, 'ikmal-editor')]
    : [path.resolve(__dirname, '..', 'ikmal-editor'), path.resolve(process.cwd(), 'ikmal-editor')];
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}

async function endpointReady(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(700) });
    return response.ok;
  } catch (_) {
    return false;
  }
}

async function readServiceState() {
  const [proxyReady, qualityReady] = await Promise.all([
    endpointReady(`${QUALITY_PROXY_URL}/health`),
    endpointReady(QUALITY_HEALTH_URL),
  ]);
  return {
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

function createTray() {
  const iconPath = path.resolve(__dirname, '..', 'assets', 'ikmal_languagetool_icon.png');
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon);
  tray.setToolTip('Ikmal Editor');
  tray.on('click', toggleWindow);
  tray.on('right-click', () => {
    const menu = Menu.buildFromTemplate([
      { label: 'Open writing tester', click: () => { if (!mainWindow.isVisible()) toggleWindow(); } },
      { type: 'separator' },
      { label: 'Start services', click: startManager },
      { label: 'Stop services', click: stopManager },
      { type: 'separator' },
      { label: 'Quit Ikmal Editor', click: () => { quitting = true; app.quit(); } },
    ]);
    tray.popUpContextMenu(menu);
  });
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
  ipcMain.handle('service-state', readServiceState);
  ipcMain.handle('start-services', () => { startManager(); return readServiceState(); });
  ipcMain.handle('stop-services', () => { stopManager(); return readServiceState(); });
  ipcMain.handle('check-text', async (_, text) => {
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
    return response.json();
  });
  ipcMain.handle('set-launch-at-login', (_, enabled) => {
    app.setLoginItemSettings({ openAtLogin: Boolean(enabled) });
    return app.getLoginItemSettings().openAtLogin;
  });
  ipcMain.handle('get-launch-at-login', () => app.getLoginItemSettings().openAtLogin);
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
