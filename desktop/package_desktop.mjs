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

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ikmal-editor-desktop-'));
const managerPath = path.join(tempDir, platform === 'win32' ? 'ikmal-editor.exe' : 'ikmal-editor');
const outputDir = path.join(root, 'bin', 'desktop');

try {
  console.log(`Building ikmal editor desktop bundle for ${platform}/${arch}…`);
  execFileSync('go', ['build', '-o', managerPath, '.'], {
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
    overwrite: true,
    asar: true,
    prune: true,
    extraResource: [path.join(root, 'assets'), managerPath],
    ignore: /^\/launch_at_login\.test\.cjs$/,
  });
  for (const bundle of bundles) console.log(`Desktop bundle ready: ${bundle}`);
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
