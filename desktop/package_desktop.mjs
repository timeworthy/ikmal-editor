import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { packager } from '@electron/packager';
import { runNpm } from '../tools/npm_command.mjs';

const desktopRoot = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(desktopRoot, '..');
const packageJSON = JSON.parse(fs.readFileSync(path.join(desktopRoot, 'package.json'), 'utf8'));
const mainGo = fs.readFileSync(path.join(root, 'main.go'), 'utf8');
const version = mainGo.match(/appVersion\s*=\s*"([^"]+)"/)?.[1];
if (!version || version !== packageJSON.version) {
  throw new Error(`Desktop and Go versions do not match: ${packageJSON.version} vs ${version || 'missing'}`);
}

const platform = process.env.IKMAL_DESKTOP_PLATFORM || process.platform;
const arch = process.env.IKMAL_DESKTOP_ARCH || (process.arch === 'x64' ? 'x64' : process.arch);
const goOS = platform === 'win32' ? 'windows' : platform;
const goArch = arch === 'x64' ? 'amd64' : arch === 'arm64' ? 'arm64' : arch === 'armv7l' ? 'arm' : arch;
if (!['darwin', 'linux', 'win32'].includes(platform)) throw new Error(`Unsupported desktop platform: ${platform}`);
if (!['x64', 'arm64', 'armv7l'].includes(arch)) throw new Error(`Unsupported desktop architecture: ${arch}`);
// Electron Packager normalizes the icon option by appending the platform
// extension. Pass the basename, not the already-suffixed .icns path, or it
// looks for `ikmal_editor.icon` and silently skips the real asset.
// The deprecated app keeps its historical LanguageTool-named aliases; the
// fresh rewrite uses product-branded assets exclusively.
const macIconBasePath = path.join(root, 'assets', 'ikmal_editor');
const macIconPath = `${macIconBasePath}.icns`;
const windowsIconPath = `${macIconBasePath}.ico`;
const linuxDesktopPath = path.join(desktopRoot, 'linux');
const spellServerBundlePath = path.join(root, 'bin', 'macos', 'ikmal editor spell server.service');
const writingAdapters = path.join(root, 'packages', 'writing-adapters');

execFileSync(process.execPath, [path.join(root, 'tools', 'package_desktop_rewrite.mjs')], { stdio: 'inherit' });
runNpm(['run', 'build', '--prefix', writingAdapters], { stdio: 'inherit' });
// The compiled contracts are ESM. Inside the bundle they land in
// Contents/Resources/dist, where the nearest package.json is Electron's own
// app manifest — which declares no "type", so the main process would load
// desktop_ipc.js as CommonJS and fail on its first import. The marker travels
// with the directory and makes it ESM wherever the bundle is installed.
fs.writeFileSync(
  path.join(writingAdapters, 'dist', 'package.json'),
  `${JSON.stringify({ name: 'ikmal-writing-adapters', type: 'module', private: true }, null, 2)}\n`,
);
fs.mkdirSync(path.join(root, 'extension', 'adapters'), { recursive: true });
fs.copyFileSync(
  path.join(writingAdapters, 'dist', 'extension_messages.js'),
  path.join(root, 'extension', 'adapters', 'extension_messages.js'),
);

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ikmal-editor-desktop-'));
const managerPath = path.join(tempDir, platform === 'win32' ? 'ikmal-editor.exe' : 'ikmal-editor');
const outputDir = path.join(root, 'bin', 'desktop');

try {
  console.log(`Building ikmal editor desktop bundle for ${platform}/${arch}…`);
  execFileSync('go', ['build', '-buildvcs=false', '-o', managerPath, '.'], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, CGO_ENABLED: '0', GOOS: goOS, GOARCH: goArch, ...(arch === 'armv7l' ? { GOARM: '7' } : {}) },
  });

  const bundles = await packager({
    dir: desktopRoot,
    name: 'ikmal editor',
    out: outputDir,
    platform,
    arch,
    electronVersion: packageJSON.devDependencies.electron,
    appVersion: version,
    appBundleId: 'com.timeworthymedia.ikmal-editor',
    ...(platform === 'linux' ? { executableName: 'ikmal-editor' } : {}),
    // Keep the bundle metadata aligned with the product name. Packager's
    // default is Electron.icns even when a custom source icon is supplied.
    ...(platform === 'darwin' ? { extendInfo: { CFBundleIconFile: 'ikmal editor.icns' } } : {}),
    ...((platform === 'darwin' && fs.existsSync(macIconPath)) || (platform === 'win32' && fs.existsSync(windowsIconPath)) ? { icon: macIconBasePath } : {}),
    // Packager 20 probes the newer macOS `.icon` format even when the valid
    // `.icns` input is present. This workspace intentionally ships ICNS and
    // has no Xcode actool asset-catalog source; suppress that non-fatal probe
    // warning while the ICNS copy is verified below.
    ...(platform === 'darwin' ? { quiet: true } : {}),
    overwrite: true,
    asar: true,
    prune: true,
    // Ship the license and notices inside Contents/Resources so they survive
    // when only the .app is distributed. Electron's own LICENSE and the
    // Chromium license set are written beside the app by the packager.
    extraResource: [
      path.join(root, 'assets'),
      managerPath,
      path.join(root, 'LICENSE'),
      path.join(root, 'THIRD-PARTY-NOTICES.md'),
      // The Electron main process loads the compiled desktop IPC contract from
      // Resources/dist before registering any handler.
      path.join(writingAdapters, 'dist'),
      // Shipped unpacked so Settings > Browser extension can reveal a folder
      // the browser's "Load unpacked" can actually read.
      path.join(root, 'extension'),
      // Fresh desktop rewrite renderer; selected only when explicitly enabled.
      path.join(root, 'apps', 'desktop-editor'),
      // Office task-pane assets and the loopback bridge are kept outside the
      // Electron asar so a future certificate/setup flow can start the same
      // files in the packaged app.
      path.join(root, 'office-bridge'),
      ...(platform === 'darwin' && fs.existsSync(spellServerBundlePath) ? [spellServerBundlePath] : []),
      ...(platform === 'linux' && fs.existsSync(linuxDesktopPath) ? [linuxDesktopPath] : []),
    ],
    ignore: /^\/launch_at_login\.test\.cjs$/,
  });
  for (const bundle of bundles) {
    if (platform === 'darwin') {
      // Electron's template leaves its unused default icon beside the app.
      // The bundle plist points at the product-named icon above, so remove the
      // stale template resource from the distributable artifact.
      const appBundle = path.join(bundle, `${packageJSON.productName || packageJSON.name}.app`);
      fs.rmSync(path.join(appBundle, 'Contents', 'Resources', 'electron.icns'), { force: true });
      const productIcon = path.join(appBundle, 'Contents', 'Resources', 'ikmal editor.icns');
      if (!fs.existsSync(productIcon)) throw new Error(`Packaged product icon is missing: ${productIcon}`);

      // Electron's binary arrives linker-signed, and everything above modifies
      // the bundle it was signed for: the injected extraResources, the replaced
      // Info.plist, and the icon removed a moment ago. The signature is left
      // declaring sealed resources that no longer match, and macOS reports that
      // as "damaged and can't be opened" — which is worse than unsigned,
      // because an unsigned app can still be opened from the context menu and a
      // broken one cannot. v0.9.1-beta shipped in exactly that state.
      //
      // An ad-hoc signature is not Developer ID and does not satisfy Gatekeeper.
      // What it does is make the bundle coherent, which is the difference
      // between "unidentified developer" and "damaged".
      if (process.platform === 'darwin') {
        execFileSync('codesign', ['--force', '--deep', '--sign', '-', appBundle], { stdio: 'inherit' });
        execFileSync('codesign', ['--verify', '--deep', '--strict', appBundle], { stdio: 'inherit' });
        console.log('Ad-hoc signed. Not notarized: users still need to allow it on first open.');
      } else {
        console.warn(`WARNING: ${appBundle} was packaged on ${process.platform}, so it could not be signed. macOS will report it as damaged.`);
      }
    }
    console.log(`Desktop bundle ready: ${bundle}`);
  }
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
