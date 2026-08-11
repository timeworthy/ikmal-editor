const fs = require('node:fs');
const path = require('node:path');

const desktopEntryName = 'ikmal-editor.desktop';
// Autostart entries carry this flag so a login launch can be told apart from a
// launch the user asked for. The menubar popover belongs on screen only in the
// second case.
const hiddenLaunchArgument = '--hidden';

function desktopEntryPath(appDataPath) {
  return path.join(appDataPath, 'autostart', desktopEntryName);
}

function quoteDesktopExec(value) {
  return `"${String(value).replace(/[\\"]/g, '\\$&').replace(/[\r\n]/g, '')}"`;
}

function createLaunchAtLoginController(options) {
  const platform = options.platform || process.platform;
  const electron = options.electron;
  if (platform === 'linux') {
    const entryPath = desktopEntryPath(options.appDataPath);
    const command = [quoteDesktopExec(options.executablePath)];
    if (!options.isPackaged) command.push(quoteDesktopExec(options.appPath));
    command.push(hiddenLaunchArgument);
    const desktopEntry = [
      '[Desktop Entry]',
      'Type=Application',
      'Name=ikmal editor',
      'Comment=Local-first writing quality',
      `Exec=${command.join(' ')}`,
      'Terminal=false',
      'X-GNOME-Autostart-enabled=true',
      '',
    ].join('\n');

    return {
      supported: true,
      path: entryPath,
      get() {
        return fs.existsSync(entryPath);
      },
      set(enabled) {
        if (!enabled) {
          fs.rmSync(entryPath, { force: true });
          return false;
        }
        fs.mkdirSync(path.dirname(entryPath), { recursive: true });
        fs.writeFileSync(entryPath, desktopEntry, { mode: 0o644 });
        return true;
      },
    };
  }

  if (platform !== 'darwin' && platform !== 'win32') {
    return {
      supported: false,
      get: () => false,
      set: () => false,
    };
  }

  // Windows login items launch the executable directly, so the flag has to
  // travel in the registry entry's arguments. getLoginItemSettings only reports
  // an entry it can match, so the read side passes the same arguments back.
  const windowsSettings = platform === 'win32' ? { args: [hiddenLaunchArgument] } : {};

  return {
    supported: true,
    get() {
      return Boolean(electron.getLoginItemSettings({ ...windowsSettings }).openAtLogin);
    },
    set(enabled) {
      const settings = { ...windowsSettings, openAtLogin: Boolean(enabled) };
      if (platform === 'darwin') settings.openAsHidden = true;
      electron.setLoginItemSettings(settings);
      return Boolean(electron.getLoginItemSettings({ ...windowsSettings }).openAtLogin);
    },
  };
}

// launchedAtLogin reports whether this process was started by the autostart
// entry rather than by the user. Linux and Windows entries pass the hidden
// flag; macOS login items receive no arguments, so Electron's own record of the
// launch is the only signal there.
function launchedAtLogin(options = {}) {
  const argv = options.argv || process.argv;
  if (argv.includes(hiddenLaunchArgument)) return true;
  const platform = options.platform || process.platform;
  if (platform !== 'darwin') return false;
  return Boolean(options.loginItemSettings?.wasOpenedAtLogin);
}

module.exports = { createLaunchAtLoginController, desktopEntryPath, launchedAtLogin, hiddenLaunchArgument };
