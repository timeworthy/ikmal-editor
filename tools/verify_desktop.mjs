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
  'editor.html',
  'electron_smoke.mjs',
  'annotation_surface.js',
  'annotation_preferences.js',
  'notice_surface.js',
  'editor-renderer.js',
  'editor-styles.css',
  'editor_ui.test.mjs',
  'rewrite_smoke.mjs',
  'main.cjs',
  'preload.cjs',
  'renderer.js',
  'styles.css',
  'launch_at_login.cjs',
  'launch_packaged.mjs',
  'package_desktop.mjs',
  'linux/ikmal-editor.desktop',
];
const missing = requiredFiles.filter((file) => !fs.existsSync(path.join(desktop, file)));
if (missing.length) throw new Error(`Missing desktop files: ${missing.join(', ')}`);
const linuxDesktop = fs.readFileSync(path.join(desktop, 'linux', 'ikmal-editor.desktop'), 'utf8');
for (const requiredText of ['Name=ikmal editor', 'Exec=ikmal-editor %U', 'Icon=ikmal-editor', 'Categories=Office;Utility;']) {
  if (!linuxDesktop.includes(requiredText)) throw new Error(`Linux desktop entry is missing ${requiredText}.`);
}
for (const size of [16, 32, 48, 64, 128, 256]) {
  const icon = path.join(desktop, 'linux', 'icons', 'hicolor', `${size}x${size}`, 'apps', 'ikmal-editor.png');
  if (!fs.existsSync(icon)) throw new Error(`Missing Linux hicolor icon: ${icon}`);
}
for (const asset of ['ikmal_languagetool_tray.png', 'ikmal_languagetool_tray.svg', 'ikmal_languagetool.icns', 'ikmal_languagetool.ico', 'ikmal_languagetool_icon.png', 'ikmal_editor.icns', 'ikmal_editor.ico', 'ikmal_editor_icon.png']) {
  if (!fs.existsSync(path.join(root, 'assets', asset))) throw new Error(`Missing desktop asset: ${asset}`);
}
if (!version || packageJSON.version !== version || packageLock.version !== version) {
  throw new Error(`Desktop version mismatch: app=${version}, package=${packageJSON.version}, lock=${packageLock.version}`);
}
if (packageJSON.main !== 'main.cjs' || packageJSON.name !== 'ikmal-editor-desktop' || packageJSON.productName !== 'ikmal editor' || packageJSON.scripts?.smoke !== 'node electron_smoke.mjs') {
  throw new Error('Desktop package metadata does not identify the expected app entry point.');
}

const mainSource = fs.readFileSync(path.join(desktop, 'main.cjs'), 'utf8');
for (const requiredText of ['--integrated', 'app.isPackaged', 'launch_at_login.cjs', 'integration-status', 'configure-integrations', 'open-editor', 'editor.html', 'desktopEditorPagePath', 'IKMAL_DESKTOP_REWRITE_SLICE', 'ready-to-show', 'desktop-presence-state', 'set-desktop-presence', 'get-annotation-preferences', 'set-annotation-preferences', 'set-compact-height', 'office-bridge-state', 'office-reveal-manifest', 'office-reveal-excel-manifest', 'office-reveal-powerpoint-manifest', 'office-reveal-outlook-manifest', 'office-reveal-onenote-manifest', 'office-reveal-project-manifest', 'app.on(\'activate\'', 'loadDesktopIPCContract', 'parseDesktopInvoke', 'isDesktopEventChannel']) {
  if (!mainSource.includes(requiredText)) throw new Error(`Desktop main is missing ${requiredText}.`);
}
const preloadSource = fs.readFileSync(path.join(desktop, 'preload.cjs'), 'utf8');
for (const requiredText of ['getIntegrationStatus', 'configureIntegrations', 'getAnnotationPreferences', 'setAnnotationPreferences', 'onAnnotationPreferences', 'getOfficeBridgeState', 'generateOfficeCertificate', 'startOfficeBridge', 'revealOfficeExcelManifest', 'revealOfficePowerPointManifest', 'revealOfficeOutlookManifest', 'revealOfficeOneNoteManifest', 'revealOfficeProjectManifest']) {
  if (!preloadSource.includes(requiredText)) throw new Error(`Desktop preload is missing ${requiredText}.`);
}
const launcherSource = fs.readFileSync(path.join(desktop, 'launch_packaged.mjs'), 'utf8');
for (const requiredText of ['run', 'package', 'ikmal editor.app', 'ikmal editor.exe', 'ikmal-editor']) {
  if (!launcherSource.includes(requiredText)) throw new Error(`Packaged launcher is missing ${requiredText}.`);
}
const packageSource = fs.readFileSync(path.join(desktop, 'package_desktop.mjs'), 'utf8');
if (!packageSource.includes("'-buildvcs=false'") || !packageSource.includes("path.join(root, 'office-bridge')")
  || !packageSource.includes("const writingAdapters = path.join(root, 'packages', 'writing-adapters')")
  || !packageSource.includes("path.join(writingAdapters, 'dist')")
  || !packageSource.includes("package_desktop_rewrite.mjs")
  || !packageSource.includes("path.join(root, 'apps', 'desktop-editor')")) {
  throw new Error('Desktop packaging must keep the Go build offline and reproducible.');
}
if (!packageJSON.devDependencies?.['@electron/packager']) {
  throw new Error('Desktop package is missing @electron/packager.');
}
const launchSource = fs.readFileSync(path.join(desktop, 'launch_at_login.cjs'), 'utf8');
for (const requiredText of ['setLoginItemSettings', 'autostart', 'darwin', 'win32', 'linux']) {
  if (!launchSource.includes(requiredText)) throw new Error(`Launch-at-login helper is missing ${requiredText}.`);
}

console.log(`Desktop package manifest verified for ikmal editor v${version}.`);
console.log(`  Entry point: desktop/${packageJSON.main}`);
console.log(`  Required files: ${requiredFiles.length}`);
console.log('  Bundle command: npm run package');
console.log('  Launch-at-login coverage: macOS, Windows, Linux XDG autostart');
