#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const desktopRoot = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(desktopRoot, '..');
const platform = process.env.IKMAL_DESKTOP_PLATFORM || process.platform;
const arch = process.env.IKMAL_DESKTOP_ARCH || (process.arch === 'x64' ? 'x64' : process.arch);
if (platform !== 'darwin') throw new Error(`Packaged rewrite smoke currently targets macOS; received ${platform}.`);
const bundle = path.join(root, 'bin', 'desktop', `ikmal editor-${platform}-${arch}`, 'ikmal editor.app');
const executable = path.join(bundle, 'Contents', 'MacOS', 'ikmal editor');
if (!fs.existsSync(executable)) {
  execFileSync(process.execPath, [path.join(desktopRoot, 'package_desktop.mjs')], { stdio: 'inherit' });
}
if (!fs.existsSync(executable)) throw new Error(`Packaged desktop executable is missing: ${executable}`);
execFileSync(process.execPath, [path.join(desktopRoot, 'rewrite_smoke.mjs')], {
  stdio: 'inherit',
  env: { ...process.env, IKMAL_REWRITE_SMOKE_EXECUTABLE: executable, IKMAL_REWRITE_SMOKE_DEBUG_PORT: String(Number(process.env.IKMAL_REWRITE_SMOKE_DEBUG_PORT || 0)) },
});
console.log(`Packaged desktop rewrite smoke passed: ${bundle}`);
