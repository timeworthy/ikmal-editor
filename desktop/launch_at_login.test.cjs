const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { createLaunchAtLoginController, desktopEntryPath, launchedAtLogin } = require('./launch_at_login.cjs');

test('Linux uses an XDG autostart entry and removes it when disabled', () => {
  const appDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ikmal-autostart-'));
  const controller = createLaunchAtLoginController({
    platform: 'linux',
    appDataPath,
    executablePath: '/opt/ikmal editor/ikmal-editor-desktop',
    appPath: '/opt/ikmal editor/resources/app',
    isPackaged: true,
  });

  assert.equal(controller.supported, true);
  assert.equal(controller.get(), false);
  assert.equal(controller.set(true), true);
  const entryPath = desktopEntryPath(appDataPath);
  const entry = fs.readFileSync(entryPath, 'utf8');
  assert.match(entry, /Name=ikmal editor/);
  assert.match(entry, /Exec="\/opt\/ikmal editor\/ikmal-editor-desktop" --hidden/);
  assert.equal(controller.get(), true);
  assert.equal(controller.set(false), false);
  assert.equal(fs.existsSync(entryPath), false);
});

for (const platform of ['darwin', 'win32']) {
  test(`${platform} delegates launch-at-login state to Electron`, () => {
    let current = false;
    let settings;
    let queried;
    const electron = {
      getLoginItemSettings: (options) => { queried = options; return { openAtLogin: current }; },
      setLoginItemSettings: (next) => { settings = next; current = next.openAtLogin; },
    };
    const controller = createLaunchAtLoginController({ platform, electron });
    assert.equal(controller.supported, true);
    assert.equal(controller.set(true), true);
    assert.equal(controller.get(), true);
    assert.equal(settings.openAtLogin, true);
    if (platform === 'darwin') assert.equal(settings.openAsHidden, true);
    if (platform === 'win32') {
      // A Windows login item launches the executable directly, so the entry has
      // to carry the flag that marks the launch as automatic — and the read
      // side has to look the entry up with the same arguments.
      assert.deepEqual(settings.args, ['--hidden']);
      assert.deepEqual(queried.args, ['--hidden']);
    }
    assert.equal(controller.set(false), false);
  });
}

test('a login launch is told apart from a launch the user asked for', () => {
  // Linux and Windows autostart entries carry the flag.
  assert.equal(launchedAtLogin({ platform: 'linux', argv: ['electron', '.', '--hidden'] }), true);
  assert.equal(launchedAtLogin({ platform: 'win32', argv: ['ikmal-editor.exe', '--hidden'] }), true);
  assert.equal(launchedAtLogin({ platform: 'linux', argv: ['electron', '.'] }), false);

  // macOS login items receive no arguments, so Electron's own record decides.
  assert.equal(launchedAtLogin({ platform: 'darwin', argv: ['ikmal editor'], loginItemSettings: { wasOpenedAtLogin: true } }), true);
  assert.equal(launchedAtLogin({ platform: 'darwin', argv: ['ikmal editor'], loginItemSettings: { wasOpenedAtLogin: false } }), false);

  // A host that reports nothing is treated as a normal launch: showing the
  // window is the recoverable side of that guess.
  assert.equal(launchedAtLogin({ platform: 'darwin', argv: ['ikmal editor'] }), false);
  assert.equal(launchedAtLogin({ platform: 'win32', argv: ['ikmal-editor.exe'], loginItemSettings: { wasOpenedAtLogin: true } }), false);
});

test('unsupported platforms fail safely without changing state', () => {
  const controller = createLaunchAtLoginController({ platform: 'freebsd' });
  assert.equal(controller.supported, false);
  assert.equal(controller.get(), false);
  assert.equal(controller.set(true), false);
});
