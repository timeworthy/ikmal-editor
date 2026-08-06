import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { packager } from '@electron/packager';

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
const macIconPath = path.join(root, 'assets', 'ikmal_languagetool.icns');
const spellServerBundlePath = path.join(root, 'bin', 'macos', 'ikmal editor spell server.service');

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
    ...(platform === 'darwin' && fs.existsSync(macIconPath) ? { icon: macIconPath } : {}),
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
      // Shipped unpacked so Settings > Browser extension can reveal a folder
      // the browser's "Load unpacked" can actually read.
      path.join(root, 'extension'),
      // Office task-pane assets and the loopback bridge are kept outside the
      // Electron asar so a future certificate/setup flow can start the same
      // files in the packaged app.
      path.join(root, 'office-bridge'),
      ...(platform === 'darwin' && fs.existsSync(spellServerBundlePath) ? [spellServerBundlePath] : []),
    ],
    ignore: /^\/launch_at_login\.test\.cjs$/,
  });
  for (const bundle of bundles) console.log(`Desktop bundle ready: ${bundle}`);
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
