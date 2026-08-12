import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runNpm } from '../tools/npm_command.mjs';

const desktopRoot = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(desktopRoot, '..');
const platform = process.env.IKMAL_DESKTOP_PLATFORM || process.platform;
const arch = process.env.IKMAL_DESKTOP_ARCH || (process.arch === 'x64' ? 'x64' : process.arch);

if (!['darwin', 'linux', 'win32'].includes(platform)) {
  throw new Error(`Unsupported desktop platform: ${platform}`);
}

const bundleName = `ikmal editor-${platform}-${arch}`;
const bundleRoot = path.join(root, 'bin', 'desktop', bundleName);

console.log('Building the packaged desktop app before launch…');
runNpm(['run', 'package'], {
  cwd: desktopRoot,
  stdio: 'inherit',
  env: { ...process.env, IKMAL_DESKTOP_PLATFORM: platform, IKMAL_DESKTOP_ARCH: arch },
});

let command;
let args;
if (platform === 'darwin') {
  command = 'open';
  args = [path.join(bundleRoot, 'ikmal editor.app')];
} else if (platform === 'win32') {
  command = path.join(bundleRoot, 'ikmal editor.exe');
  args = [];
} else {
  command = path.join(bundleRoot, 'ikmal-editor');
  args = [];
}

console.log(`Launching ${bundleName}…`);
spawn(command, args, { detached: true, stdio: 'ignore' }).unref();
