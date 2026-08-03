import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const rootDir = process.cwd();
const debStructure = path.join(rootDir, 'dist', 'deb_structure');
const version = '0.9.0-beta';

console.log('Building Debian .deb package for ikmal-editor...');

fs.mkdirSync(path.join(debStructure, 'DEBIAN'), { recursive: true });
fs.mkdirSync(path.join(debStructure, 'usr', 'local', 'bin'), { recursive: true });

fs.copyFileSync(
  path.join(rootDir, 'bin', 'ikmal-editor-linux-amd64'),
  path.join(debStructure, 'usr', 'local', 'bin', 'ikmal-editor')
);
fs.chmodSync(path.join(debStructure, 'usr', 'local', 'bin', 'ikmal-editor'), 0755);

const controlContent = `Package: ikmal-editor
Version: ${version}
Section: utils
Priority: optional
Architecture: amd64
Maintainer: Ian Sherr <ian@timeworthymedia.com>
Description: Standalone LanguageTool manager, background service supervisor, and app auto-configurator
 ikmal editor automates local LanguageTool server setup on port 8097,
 embeds Plain English conciseness rule packs, and configures web extensions.
`;

fs.writeFileSync(path.join(debStructure, 'DEBIAN', 'control'), controlContent);

try {
  execSync(`dpkg-deb --build "${debStructure}" "${path.join(rootDir, 'bin', `ikmal-editor_${version}_amd64.deb`)}"`);
  console.log(`Created Debian package: bin/ikmal-editor_${version}_amd64.deb`);
} catch (e) {
  console.log('dpkg-deb not present on host OS, package structure created in dist/deb_structure');
}
