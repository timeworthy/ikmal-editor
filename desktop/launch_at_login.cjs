const fs = require('node:fs');
const path = require('node:path');

const desktopEntryName = 'ikmal-editor.desktop';

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
    command.push('--hidden');
    const desktopEntry = [
      '[Desktop Entry]',
      'Type=Application',
      'Name=Ikmal Editor',
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

  return {
    supported: true,
    get() {
      return Boolean(electron.getLoginItemSettings().openAtLogin);
    },
    set(enabled) {
      const settings = { openAtLogin: Boolean(enabled) };
      if (platform === 'darwin') settings.openAsHidden = true;
      electron.setLoginItemSettings(settings);
      return Boolean(electron.getLoginItemSettings().openAtLogin);
    },
  };
}

module.exports = { createLaunchAtLoginController, desktopEntryPath };
