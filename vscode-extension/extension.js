const http = require('node:http');
const https = require('node:https');
const vscode = require('vscode');
const {
  CHECK_CONTRACT_VERSION,
  buildCheckBody,
  normalizeCheckResponse,
  resultIsCurrent,
} = require('./check_contract.cjs');

const diagnosticSource = 'ikmal editor';
const timers = new Map();
const generations = new Map();
const matchesByDocument = new Map();

function settings() {
  return vscode.workspace.getConfiguration('ikmal');
}

function documentKey(document) {
  return document.uri.toString();
}

function nextGeneration(document) {
  const key = documentKey(document);
  const generation = (generations.get(key) || 0) + 1;
  generations.set(key, generation);
  return generation;
}

function loopbackEndpoint(value) {
  const endpoint = new URL(String(value || 'http://127.0.0.1:8096'));
  if (!['http:', 'https:'].includes(endpoint.protocol) || !['127.0.0.1', 'localhost', '::1', '[::1]'].includes(endpoint.hostname)) {
    throw new Error('ikmal only connects to a loopback endpoint.');
  }
  // Everything else in this project documents the server as
  // http://127.0.0.1:8096/v2 — that is the value in IKMAL_EDITOR_SERVER_URL
  // and in the Firefox and Chrome policies. Pasting it here used to produce
  // /v2/v2/check and a permanent 404, so the suffix is normalized away and
  // re-added by postCheck.
  endpoint.pathname = endpoint.pathname.replace(/\/+$/, '').replace(/\/v2(\/check)?$/i, '');
  return endpoint;
}

function postCheck(endpoint, body) {
  const url = new URL(`${endpoint.toString().replace(/\/+$/, '')}/v2/check`);
  const transport = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const request = transport.request(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'content-length': Buffer.byteLength(body),
      },
    }, (response) => {
      let payload = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { payload += chunk; });
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`The local server answered with HTTP ${response.statusCode}.`));
          return;
        }
        try {
          resolve(normalizeCheckResponse(JSON.parse(payload)));
        } catch (_) {
          reject(new Error('The local server returned invalid JSON.'));
        }
      });
    });
    request.setTimeout(8000, () => request.destroy(new Error('The local check timed out.')));
    request.on('error', reject);
    request.end(body);
  });
}

async function checkDocument(document, diagnostics) {
  if (!isCheckable(document)) return;
  const key = documentKey(document);
  const generation = nextGeneration(document);
  const text = document.getText();
  const version = document.version;
  const currentSettings = settings();
  const minimum = Math.max(1, Number(currentSettings.get('minLength', 12)) || 12);
  const maximum = Math.max(minimum, Number(currentSettings.get('maxLength', 20000)) || 20000);

  matchesByDocument.delete(key);
  diagnostics.delete(document.uri);
  if (!currentSettings.get('enabled', true) || text.trim().length < minimum || text.length > maximum) return;

  let endpoint;
  try {
    endpoint = loopbackEndpoint(currentSettings.get('endpoint', 'http://127.0.0.1:8096'));
  } catch (error) {
    vscode.window.showWarningMessage(error.message);
    return;
  }

  try {
    const response = await postCheck(endpoint, buildCheckBody({
      text,
      language: currentSettings.get('language', 'auto'),
    }));
    if (generations.get(key) !== generation || document.version !== version || !resultIsCurrent(document.getText(), text)) return;
    matchesByDocument.set(key, { version, matches: response.matches });
    diagnostics.set(document.uri, response.matches.map((match, index) => diagnosticFor(document, match, index)));
  } catch (error) {
    if (generations.get(key) === generation) vscode.window.setStatusBarMessage(`ikmal: ${error.message}`, 5000);
  }
}

function diagnosticFor(document, match, index) {
  const textLength = document.getText().length;
  const start = Math.max(0, Math.min(textLength, Number(match.offset) || 0));
  const end = Math.max(start, Math.min(textLength, start + (Number(match.length) || 0)));
  const source = String(match.ikmalSource || '').toLowerCase();
  const category = String(match.rule?.category?.id || match.category || '').toLowerCase();
  const severity = source.includes('style') || category.includes('style')
    ? vscode.DiagnosticSeverity.Information
    : vscode.DiagnosticSeverity.Warning;
  const diagnostic = new vscode.Diagnostic(new vscode.Range(document.positionAt(start), document.positionAt(end)), match.message || 'Review this passage.', severity);
  diagnostic.source = diagnosticSource;
  diagnostic.code = `${CHECK_CONTRACT_VERSION}:${index}`;
  return diagnostic;
}

// Only real editable buffers are checked. onDidOpen/onDidChange also fire for
// Output channels, log tails, SCM diffs and the debug console; the Output
// channel in particular changes constantly, which meant a steady stream of the
// user's log content being POSTed to the local server for diagnostics that the
// code-action provider (registered for these two schemes only) could never act
// on anyway.
const CHECKABLE_SCHEMES = new Set(['file', 'untitled']);

function isCheckable(document) {
  return Boolean(document) && CHECKABLE_SCHEMES.has(document.uri?.scheme);
}

function scheduleCheck(document, diagnostics) {
  if (!isCheckable(document)) return;
  const key = documentKey(document);
  clearTimeout(timers.get(key));
  nextGeneration(document);
  diagnostics.delete(document.uri);
  matchesByDocument.delete(key);
  const delay = Math.max(200, Math.min(2000, Number(settings().get('checkDelayMs', 900)) || 900));
  timers.set(key, setTimeout(() => {
    timers.delete(key);
    checkDocument(document, diagnostics);
  }, delay));
}

function provideCodeActions(document, _range, context) {
  const entry = matchesByDocument.get(documentKey(document));
  if (!entry || entry.version !== document.version) return [];
  return context.diagnostics
    .filter((diagnostic) => diagnostic.source === diagnosticSource && typeof diagnostic.code === 'string')
    .map((diagnostic) => {
      const index = Number(diagnostic.code.split(':').pop());
      const match = entry.matches[index];
      const replacement = match?.replacements?.[0]?.value;
      if (!replacement) return null;
      const action = new vscode.CodeAction(`Replace with “${replacement}”`, vscode.CodeActionKind.QuickFix);
      action.isPreferred = true;
      action.diagnostics = [diagnostic];
      action.edit = new vscode.WorkspaceEdit();
      action.edit.replace(document.uri, diagnostic.range, replacement);
      return action;
    })
    .filter(Boolean);
}

function activate(context) {
  const diagnostics = vscode.languages.createDiagnosticCollection('ikmal');
  const selector = [...CHECKABLE_SCHEMES].map((scheme) => ({ scheme }));
  context.subscriptions.push(diagnostics);
  context.subscriptions.push(vscode.languages.registerCodeActionsProvider(selector, { provideCodeActions }, {
    providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
  }));
  context.subscriptions.push(vscode.commands.registerCommand('ikmal.checkDocument', () => {
    const document = vscode.window.activeTextEditor?.document;
    if (document) checkDocument(document, diagnostics);
  }));
  context.subscriptions.push(vscode.workspace.onDidOpenTextDocument((document) => scheduleCheck(document, diagnostics)));
  context.subscriptions.push(vscode.workspace.onDidChangeTextDocument((event) => scheduleCheck(event.document, diagnostics)));
  context.subscriptions.push(vscode.workspace.onDidCloseTextDocument((document) => {
    const key = documentKey(document);
    clearTimeout(timers.get(key));
    timers.delete(key);
    generations.delete(key);
    matchesByDocument.delete(key);
    diagnostics.delete(document.uri);
  }));
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((event) => {
    if (!event.affectsConfiguration('ikmal')) return;
    const document = vscode.window.activeTextEditor?.document;
    if (document) scheduleCheck(document, diagnostics);
  }));
  for (const document of vscode.workspace.textDocuments) scheduleCheck(document, diagnostics);
}

function deactivate() {
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
}

module.exports = { activate, deactivate };
