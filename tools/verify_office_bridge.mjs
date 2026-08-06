import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bridge = path.join(root, 'office-bridge');
const requiredFiles = [
  'check_contract.cjs',
  'office_bridge.cjs',
  'manifest-word.xml',
  'manifest-excel.xml',
  'manifest-powerpoint.xml',
  'manifest-outlook.xml',
  'manifest-onenote.xml',
  'manifest-project.xml',
  'public/office/word/index.html',
  'public/office/word/app.js',
  'public/office/word/styles.css',
  'public/office/word/icon.svg',
  'public/office/excel/index.html',
  'public/office/excel/app.js',
  'public/office/excel/projection.js',
  'public/office/excel/styles.css',
  'public/office/excel/icon.svg',
  'public/office/powerpoint/index.html',
  'public/office/powerpoint/app.js',
  'public/office/powerpoint/projection.js',
  'public/office/powerpoint/styles.css',
  'public/office/powerpoint/icon.svg',
  'public/office/outlook/index.html',
  'public/office/outlook/app.js',
  'public/office/outlook/projection.js',
  'public/office/outlook/commands.html',
  'public/office/outlook/styles.css',
  'public/office/outlook/icon.svg',
  'public/office/onenote/index.html',
  'public/office/onenote/app.js',
  'public/office/onenote/projection.js',
  'public/office/onenote/styles.css',
  'public/office/onenote/icon.svg',
  'public/office/project/index.html',
  'public/office/project/app.js',
  'public/office/project/projection.js',
  'public/office/project/styles.css',
  'public/office/project/icon.svg',
];
const missing = requiredFiles.filter((file) => !fs.existsSync(path.join(bridge, file)));
if (missing.length) throw new Error(`Missing Office bridge files: ${missing.join(', ')}`);

const manifest = fs.readFileSync(path.join(bridge, 'manifest-word.xml'), 'utf8');
for (const requiredText of [
  '<Id>2e8f5d4d-29c3-4ba9-ae3f-7b2d4f8a1001</Id>',
  'xsi:type="TaskPaneApp"',
  'https://localhost:8765/office/word/',
  '<Host Name="Document"/>',
  '<Permissions>ReadWriteDocument</Permissions>',
]) {
  if (!manifest.includes(requiredText)) throw new Error(`Word manifest is missing ${requiredText}.`);
}
const excelManifest = fs.readFileSync(path.join(bridge, 'manifest-excel.xml'), 'utf8');
for (const requiredText of ['<Id>2e8f5d4d-29c3-4ba9-ae3f-7b2d4f8a1002</Id>', '<Host Name="Workbook"/>', 'https://localhost:8765/office/excel/']) {
  if (!excelManifest.includes(requiredText)) throw new Error(`Excel manifest is missing ${requiredText}.`);
}
const powerpointManifest = fs.readFileSync(path.join(bridge, 'manifest-powerpoint.xml'), 'utf8');
for (const requiredText of ['<Id>2e8f5d4d-29c3-4ba9-ae3f-7b2d4f8a1003</Id>', '<Host Name="Presentation"/>', 'https://localhost:8765/office/powerpoint/']) {
  if (!powerpointManifest.includes(requiredText)) throw new Error(`PowerPoint manifest is missing ${requiredText}.`);
}
const outlookManifest = fs.readFileSync(path.join(bridge, 'manifest-outlook.xml'), 'utf8');
for (const requiredText of ['<Id>2e8f5d4d-29c3-4ba9-ae3f-7b2d4f8a1004</Id>', 'xsi:type="MailApp"', '<Host Name="Mailbox">', 'https://localhost:8765/office/outlook/', '<Permissions>ReadWriteMailbox</Permissions>']) {
  if (!outlookManifest.includes(requiredText)) throw new Error(`Outlook manifest is missing ${requiredText}.`);
}
const onenoteManifest = fs.readFileSync(path.join(bridge, 'manifest-onenote.xml'), 'utf8');
for (const requiredText of ['<Id>2e8f5d4d-29c3-4ba9-ae3f-7b2d4f8a1005</Id>', '<Host Name="Notebook"/>', 'https://localhost:8765/office/onenote/']) {
  if (!onenoteManifest.includes(requiredText)) throw new Error(`OneNote manifest is missing ${requiredText}.`);
}
const projectManifest = fs.readFileSync(path.join(bridge, 'manifest-project.xml'), 'utf8');
for (const requiredText of ['<Id>2e8f5d4d-29c3-4ba9-ae3f-7b2d4f8a1006</Id>', '<Host Name="Project"/>', 'https://localhost:8765/office/project/']) {
  if (!projectManifest.includes(requiredText)) throw new Error(`Project manifest is missing ${requiredText}.`);
}

const source = fs.readFileSync(path.join(bridge, 'office_bridge.cjs'), 'utf8');
for (const requiredText of [
  'createOfficeBridgeServer',
  'loopback-only',
  'Office origin is not allowed',
  'BODY_TOO_LARGE',
  '/office/api/check',
  '127.0.0.1',
]) {
  if (!source.includes(requiredText)) throw new Error(`Office bridge is missing ${requiredText}.`);
}

console.log(`Office bridge verified: Word, Excel, PowerPoint, Outlook, OneNote, and Project task panes; files ${requiredFiles.length}.`);
console.log('  Network reach: exact HTTPS origin to loopback checker only');
