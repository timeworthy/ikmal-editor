'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const KEY_NAME = 'localhost.key';
const CERTIFICATE_NAME = 'localhost.crt';

function certificatePaths(directory) {
  const root = path.resolve(directory);
  return {
    directory: root,
    keyPath: path.join(root, KEY_NAME),
    certificatePath: path.join(root, CERTIFICATE_NAME),
  };
}

function isRegularFile(filePath) {
  try {
    return fs.lstatSync(filePath).isFile();
  } catch (_) {
    return false;
  }
}

function certificateState(directory) {
  const paths = certificatePaths(directory);
  const keyPresent = isRegularFile(paths.keyPath);
  const certificatePresent = isRegularFile(paths.certificatePath);
  return {
    ...paths,
    configured: keyPresent && certificatePresent,
    keyPresent,
    certificatePresent,
    trust: 'manual',
    trustMessage: 'The certificate is local, but OS trust must be approved separately before Office will load it.',
  };
}

function generateOfficeCertificate({ directory, opensslPath = 'openssl', execFileSyncImpl = execFileSync } = {}) {
  if (!directory) throw new Error('A certificate directory is required');
  const paths = certificatePaths(directory);
  const existing = certificateState(directory);
  if (existing.keyPresent || existing.certificatePresent) {
    throw new Error('An ikmal Office certificate already exists; remove it explicitly before generating a new one.');
  }
  fs.mkdirSync(paths.directory, { recursive: true, mode: 0o700 });
  fs.chmodSync(paths.directory, 0o700);
  const temporaryKey = path.join(paths.directory, `${KEY_NAME}.tmp`);
  const temporaryCertificate = path.join(paths.directory, `${CERTIFICATE_NAME}.tmp`);
  try {
    execFileSyncImpl(opensslPath, [
      'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
      '-keyout', temporaryKey,
      '-out', temporaryCertificate,
      '-days', '825',
      '-subj', '/CN=localhost',
      '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1',
    ], { stdio: 'ignore' });
    fs.renameSync(temporaryKey, paths.keyPath);
    fs.renameSync(temporaryCertificate, paths.certificatePath);
    fs.chmodSync(paths.keyPath, 0o600);
    fs.chmodSync(paths.certificatePath, 0o644);
    return certificateState(paths.directory);
  } catch (error) {
    for (const temporaryPath of [temporaryKey, temporaryCertificate]) {
      try { fs.rmSync(temporaryPath, { force: true }); } catch (_) { /* best effort cleanup */ }
    }
    throw new Error(`Could not generate the local Office certificate with ${opensslPath}: ${error.message}`);
  }
}

function removeOfficeCertificate(directory) {
  const state = certificateState(directory);
  for (const filePath of [state.keyPath, state.certificatePath]) {
    if (isRegularFile(filePath)) fs.rmSync(filePath);
  }
  return certificateState(directory);
}

module.exports = {
  CERTIFICATE_NAME,
  KEY_NAME,
  certificatePaths,
  certificateState,
  generateOfficeCertificate,
  removeOfficeCertificate,
};
