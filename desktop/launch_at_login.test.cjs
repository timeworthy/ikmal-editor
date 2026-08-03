const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { createLaunchAtLoginController, desktopEntryPath } = require('./launch_at_login.cjs');

test('Linux uses an XDG autostart entry and removes it when disabled', () => {
  const appDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ikmal-autostart-'));
  const controller = createLaunchAtLoginController({
    platform: 'linux',
    appDataPath,
    executablePath: '/opt/Ikmal Editor/ikmal-editor-desktop',
    appPath: '/opt/Ikmal Editor/resources/app',
    isPackaged: true,
  });

  assert.equal(controller.supported, true);
  assert.equal(controller.get(), false);
  assert.equal(controller.set(true), true);
  const entryPath = desktopEntryPath(appDataPath);
  const entry = fs.readFileSync(entryPath, 'utf8');
  assert.match(entry, /Name=Ikmal Editor/);
  assert.match(entry, /Exec="\/opt\/Ikmal Editor\/ikmal-editor-desktop" --hidden/);
  assert.equal(controller.get(), true);
  assert.equal(controller.set(false), false);
  assert.equal(fs.existsSync(entryPath), false);
});

for (const platform of ['darwin', 'win32']) {
  test(`${platform} delegates launch-at-login state to Electron`, () => {
    let current = false;
    let settings;
    const electron = {
      getLoginItemSettings: () => ({ openAtLogin: current }),
      setLoginItemSettings: (next) => { settings = next; current = next.openAtLogin; },
    };
    const controller = createLaunchAtLoginController({ platform, electron });
    assert.equal(controller.supported, true);
    assert.equal(controller.set(true), true);
    assert.equal(controller.get(), true);
    assert.equal(settings.openAtLogin, true);
    if (platform === 'darwin') assert.equal(settings.openAsHidden, true);
    assert.equal(controller.set(false), false);
  });
}

test('unsupported platforms fail safely without changing state', () => {
  const controller = createLaunchAtLoginController({ platform: 'freebsd' });
  assert.equal(controller.supported, false);
  assert.equal(controller.get(), false);
  assert.equal(controller.set(true), false);
});
