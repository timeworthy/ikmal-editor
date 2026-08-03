import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const desktop = path.join(root, 'desktop');
const packageJSON = JSON.parse(fs.readFileSync(path.join(desktop, 'package.json'), 'utf8'));
const packageLock = JSON.parse(fs.readFileSync(path.join(desktop, 'package-lock.json'), 'utf8'));
const mainGo = fs.readFileSync(path.join(root, 'main.go'), 'utf8');
const version = mainGo.match(/appVersion\s*=\s*"([^"]+)"/)?.[1];

const requiredFiles = [
  'index.html',
  'main.cjs',
  'preload.cjs',
  'renderer.js',
  'styles.css',
  'launch_at_login.cjs',
  'package_desktop.mjs',
];
const missing = requiredFiles.filter((file) => !fs.existsSync(path.join(desktop, file)));
if (missing.length) throw new Error(`Missing desktop files: ${missing.join(', ')}`);
if (!version || packageJSON.version !== version || packageLock.version !== version) {
  throw new Error(`Desktop version mismatch: app=${version}, package=${packageJSON.version}, lock=${packageLock.version}`);
}
if (packageJSON.main !== 'main.cjs' || packageJSON.name !== 'ikmal-editor-desktop' || packageJSON.productName !== 'Ikmal Editor') {
  throw new Error('Desktop package metadata does not identify the expected app entry point.');
}

const mainSource = fs.readFileSync(path.join(desktop, 'main.cjs'), 'utf8');
for (const requiredText of ['--integrated', 'app.isPackaged', 'launch_at_login.cjs']) {
  if (!mainSource.includes(requiredText)) throw new Error(`Desktop main is missing ${requiredText}.`);
}
if (!packageJSON.devDependencies?.['@electron/packager']) {
  throw new Error('Desktop package is missing @electron/packager.');
}
const launchSource = fs.readFileSync(path.join(desktop, 'launch_at_login.cjs'), 'utf8');
for (const requiredText of ['setLoginItemSettings', 'autostart', 'darwin', 'win32', 'linux']) {
  if (!launchSource.includes(requiredText)) throw new Error(`Launch-at-login helper is missing ${requiredText}.`);
}

console.log(`Desktop package manifest verified for Ikmal Editor v${version}.`);
console.log(`  Entry point: desktop/${packageJSON.main}`);
console.log(`  Required files: ${requiredFiles.length}`);
console.log('  Bundle command: npm run package');
console.log('  Launch-at-login coverage: macOS, Windows, Linux XDG autostart');
