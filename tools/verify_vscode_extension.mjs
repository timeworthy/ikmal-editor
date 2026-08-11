import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const extension = path.join(root, 'vscode-extension');
const requiredFiles = ['package.json', 'extension.js', 'core_adapter.cjs', 'check_contract.cjs', 'README.md', 'LICENSE'];
const missing = requiredFiles.filter((file) => !fs.existsSync(path.join(extension, file)));
if (missing.length) throw new Error(`Missing VS Code adapter files: ${missing.join(', ')}`);

const manifest = JSON.parse(fs.readFileSync(path.join(extension, 'package.json'), 'utf8'));
if (manifest.name !== 'ikmal-editor-vscode' || manifest.main !== 'extension.js' || !manifest.contributes?.configuration?.properties?.['ikmal.endpoint']) {
  throw new Error('VS Code adapter manifest is missing the expected identity or endpoint setting.');
}

const source = fs.readFileSync(path.join(extension, 'extension.js'), 'utf8');
for (const requiredText of ['vscode.languages.createDiagnosticCollection', 'registerCodeActionsProvider', '127.0.0.1', 'v2/check', 'setTimeout']) {
  if (!source.includes(requiredText)) throw new Error(`VS Code adapter is missing ${requiredText}.`);
}
const coreAdapterSource = fs.readFileSync(path.join(extension, 'core_adapter.cjs'), 'utf8');
if (!coreAdapterSource.includes('resultIsCurrent') || !coreAdapterSource.includes('applyCorrection')) {
  throw new Error('VS Code core bridge is missing stale-result or correction safety.');
}

const packageScript = fs.readFileSync(path.join(root, 'tools', 'package_vscode_extension.mjs'), 'utf8');
if (!source.includes('writingCore') || !source.includes('normalizeDocumentResult') || !source.includes('applyIssueCorrection')) {
  throw new Error('VS Code adapter is not consuming the compiled writing core.');
}
if (!packageScript.includes('verify_vscode_extension.mjs') || !packageScript.includes('writing-core') || !packageScript.includes('npm') || !packageScript.includes('zip')) {
  throw new Error('VS Code adapter package script is missing verification or archive creation.');
}

console.log(`VS Code adapter verified: ${manifest.name} v${manifest.version}.`);
console.log(`  Files: ${requiredFiles.length}`);
console.log('  Network reach: loopback only');
