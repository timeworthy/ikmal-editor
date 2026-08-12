// Builds an installable VS Code extension in bin/vscode-extension/.
// The package is dependency-free; the VS Code host supplies its API.
//
// This emits a real .vsix rather than a plain zip of the folder. A .vsix is a
// zip with a required shape — every file under an `extension/` prefix, plus
// `extension.vsixmanifest` and `[Content_Types].xml` at the root — and
// `code --install-extension` rejects anything else. A flat zip left only one
// install route: extract it by hand into a versioned directory name the user
// has to construct correctly. Instructions like that are worse than no
// package, so the shape is built here instead of documented around.
//
// Written by hand rather than with @vscode/vsce so packaging needs no network
// and no dependency the rest of this repository does not already have.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runNpm } from './npm_command.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const extension = path.join(root, 'vscode-extension');
const writingCore = path.join(root, 'packages', 'writing-core');
const writingCoreDist = path.join(writingCore, 'dist');
const outputDir = path.join(root, 'bin', 'vscode-extension');
const verify = path.join(root, 'tools', 'verify_vscode_extension.mjs');

// Compile the portable core before staging the extension. The VSIX must never
// depend on a developer checkout or Node's test-only TypeScript stripping.
runNpm(['run', 'build', '--prefix', writingCore], { stdio: 'inherit' });
if (!fs.existsSync(path.join(writingCoreDist, 'index.js'))) throw new Error('writing-core build did not emit dist/index.js.');

// Verification first: a build that skipped the loopback-only check would be
// exactly the build worth checking.
execFileSync(process.execPath, [verify], { stdio: 'inherit' });

const manifest = JSON.parse(fs.readFileSync(path.join(extension, 'package.json'), 'utf8'));
for (const field of ['name', 'version', 'publisher', 'engines']) {
  if (!manifest[field]) throw new Error(`vscode-extension/package.json is missing "${field}", which a .vsix identity requires.`);
}

const archive = path.join(outputDir, `${manifest.publisher}.${manifest.name}-${manifest.version}.vsix`);

function collect(directory, prefix = '') {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name === '.DS_Store') return [];
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? collect(absolute, relative) : [relative];
  });
}

const files = [...collect(extension), 'writing-core/index.js', 'writing-core/package.json'];
if (!files.includes('package.json')) throw new Error('vscode-extension is missing package.json.');

const escapeXML = (value) => String(value).replace(/[&<>"']/g, (character) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[character]
));

// Content types must cover every extension present, and files with no
// extension at all — LICENSE is one — need an explicit override or the package
// is rejected as malformed.
const extensions = [...new Set(files.map((file) => path.extname(file).slice(1)).filter(Boolean))];
const knownTypes = {
  json: 'application/json',
  js: 'application/javascript',
  cjs: 'application/javascript',
  mjs: 'application/javascript',
  md: 'text/markdown',
  txt: 'text/plain',
  png: 'image/png',
  svg: 'image/svg+xml',
};
const defaults = extensions
  .map((value) => `  <Default Extension="${escapeXML(value)}" ContentType="${knownTypes[value] || 'application/octet-stream'}"/>`)
  .join('\n');
const overrides = files
  .filter((file) => !path.extname(file))
  .map((file) => `  <Override PartName="/extension/${escapeXML(file)}" ContentType="text/plain"/>`)
  .join('\n');

const contentTypes = `<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="vsixmanifest" ContentType="text/xml"/>
${defaults}
${overrides}
</Types>
`;

const categories = Array.isArray(manifest.categories) ? manifest.categories.join(',') : 'Other';
const vsixManifest = `<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011" xmlns:d="http://schemas.microsoft.com/developer/vsx-schema-design/2011">
  <Metadata>
    <Identity Language="en-US" Id="${escapeXML(manifest.name)}" Version="${escapeXML(manifest.version)}" Publisher="${escapeXML(manifest.publisher)}"/>
    <DisplayName>${escapeXML(manifest.displayName || manifest.name)}</DisplayName>
    <Description xml:space="preserve">${escapeXML(manifest.description || '')}</Description>
    <Categories>${escapeXML(categories)}</Categories>
  </Metadata>
  <Installation>
    <InstallationTarget Id="Microsoft.VisualStudio.Code"/>
  </Installation>
  <Dependencies/>
  <Assets>
    <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/>
  </Assets>
</PackageManifest>
`;

// Staged in a temp directory so the source tree never gains the extension/
// prefix layout the archive format wants.
const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'ikmal-vsix-'));
try {
  fs.cpSync(extension, path.join(staging, 'extension'), {
    recursive: true,
    filter: (source) => !source.includes('node_modules') && !source.endsWith('.DS_Store'),
  });
  fs.mkdirSync(path.join(staging, 'extension', 'writing-core'), { recursive: true });
  fs.copyFileSync(path.join(writingCoreDist, 'index.js'), path.join(staging, 'extension', 'writing-core', 'index.js'));
  // The compiled core is ESM, but the nearest package.json inside the VSIX is
  // vscode-extension/package.json, which declares no "type" — so Node would
  // load index.js as CommonJS and the adapter's import() would fail with a
  // SyntaxError at activation. Nothing catches that: activate() awaits the
  // core, and the repository fallback path does not exist in a package. This
  // marker is what makes the file ESM wherever the VSIX is installed.
  fs.writeFileSync(
    path.join(staging, 'extension', 'writing-core', 'package.json'),
    `${JSON.stringify({ name: 'ikmal-writing-core', type: 'module', main: 'index.js', private: true }, null, 2)}\n`,
  );
  fs.writeFileSync(path.join(staging, 'extension.vsixmanifest'), vsixManifest);
  fs.writeFileSync(path.join(staging, '[Content_Types].xml'), contentTypes);

  fs.mkdirSync(outputDir, { recursive: true });
  fs.rmSync(archive, { force: true });
  execFileSync('zip', ['-r', '-q', archive, 'extension', 'extension.vsixmanifest', '[Content_Types].xml'], { cwd: staging });
} finally {
  fs.rmSync(staging, { recursive: true, force: true });
}

const size = (fs.statSync(archive).size / 1024).toFixed(1);
console.log(`\nVS Code adapter package ready: ${archive} (${size} KB)`);
console.log(`Install it with: code --install-extension ${archive}`);
