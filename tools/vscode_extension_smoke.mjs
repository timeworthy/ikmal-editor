#!/usr/bin/env node
// End-to-end proof that the VS Code adapter checks a document and reports what
// it found.
//
// This was the last host covered only by contract assertions: verify_vscode
// _extension.mjs reads the source and confirms the shapes are present, which
// cannot tell you whether the extension activates, reaches the checker, or ever
// produces a diagnostic. Every other host in this repository has a harness that
// launches it for real, and each one of those found something when it was first
// run.
//
// The runner half executes inside the extension host and lives in
// tools/vscode_smoke_runner.cjs rather than under vscode-extension/, because the
// packager ships that directory wholesale and a test has no business in a .vsix.
//
// Opt-in, like the browser harnesses: this downloads a VS Code build on first
// use. Set IKMAL_VSCODE_VERSION to pin one.
//   node tools/vscode_extension_smoke.mjs

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runTests } from '@vscode/test-electron';
import { runNpm } from './npm_command.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const extensionDevelopmentPath = path.join(root, 'vscode-extension');

// The extension imports ./writing-core/index.js, which only the packager
// creates — inside a staging directory, so a checkout has never had it and the
// extension cannot run from source without this. The ESM marker matters for the
// same reason it does in the package: vscode-extension/package.json declares no
// "type", so Node would load the compiled core as CommonJS and activation would
// fail on an import() that nothing catches.
runNpm(['run', 'build', '--prefix', path.join(root, 'packages', 'writing-core')], { stdio: 'inherit' });
const stagedCore = path.join(extensionDevelopmentPath, 'writing-core');
fs.mkdirSync(stagedCore, { recursive: true });
fs.copyFileSync(path.join(root, 'packages', 'writing-core', 'dist', 'index.js'), path.join(stagedCore, 'index.js'));
fs.writeFileSync(
  path.join(stagedCore, 'package.json'),
  `${JSON.stringify({ name: 'ikmal-writing-core', type: 'module', main: 'index.js', private: true }, null, 2)}\n`,
);

// A hang is the failure mode this harness is most exposed to: anything that
// waits on the editor for input never returns, and a runner that never returns
// occupies a CI job until the six-hour limit rather than reporting anything.
// The budget is generous enough for a cold VS Code download.
const TIMEOUT_MS = Number(process.env.IKMAL_VSCODE_TIMEOUT_MS || 10 * 60 * 1000);
let timer;
const exitCode = await Promise.race([
  runTests({
    version: process.env.IKMAL_VSCODE_VERSION || 'stable',
    extensionDevelopmentPath,
    extensionTestsPath: path.join(root, 'tools', 'vscode_smoke_runner.cjs'),
    // A clean profile with no other extension loaded, so a diagnostic that
    // appears came from this one.
    launchArgs: ['--disable-extensions', '--disable-gpu', '--no-sandbox'],
  }),
  new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`VS Code smoke did not finish within ${TIMEOUT_MS}ms. Something is waiting on the editor.`)), TIMEOUT_MS);
  }),
]).finally(() => clearTimeout(timer));

if (exitCode !== 0) throw new Error(`VS Code smoke failed with exit code ${exitCode}.`);
console.log('VS Code extension smoke passed.');
