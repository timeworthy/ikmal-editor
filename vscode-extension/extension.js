const http = require('node:http');
const https = require('node:https');
const vscode = require('vscode');
const {
  CHECK_CONTRACT_VERSION,
  buildCheckBody,
  normalizeCheckResponse,
  degradedCheckMessage,
} = require('./check_contract.cjs');
const {
  CORE_PREFERENCES,
  normalizeDocumentResult,
  applyIssueCorrection,
} = require('./core_adapter.cjs');

let writingCorePromise;
let writingCoreAPI;

function writingCore() {
  if (!writingCorePromise) {
    // The first path is what the VSIX contains. The second keeps the source
    // adapter runnable from this repository while the package is developed.
    writingCorePromise = import('./writing-core/index.js')
      .catch(() => import('../packages/writing-core/dist/index.js'))
      .then((module) => {
        writingCoreAPI = module;
        return module;
      });
  }
  return writingCorePromise;
}

// Held in memory rather than in settings.json: a pause is a passing intent, and
// writing it to a file the user may have in version control is the wrong place
// for it. Restarting the window resumes checking, which is the safe direction.
let focusState = { mode: 'active', until: null };
let statusItem;
// The engines that did not answer the most recent check. Held so the status bar
// keeps saying so, and so the same interruption is not repeated on every
// keystroke while a service stays down.
let degradedChecks = '';
// Why the active document is not being checked at all, when that is a decision
// this extension made rather than one the user made.
let skippedReason = '';

function currentFocus() {
  if (writingCoreAPI) focusState = writingCoreAPI.resolveFocusState(focusState);
  return focusState;
}

function describeFocus(value) {
  return writingCoreAPI?.describeFocusState(value) || (value.mode === 'active' ? 'Checking' : value.mode === 'paused' ? 'Paused' : 'Zen');
}

function renderFocusStatus() {
  if (!statusItem) return;
  const state = currentFocus();
  // Ordered by how much of the check is missing. Nothing checked outranks some
  // checks missing, which outranks the ordinary focus readout.
  if (skippedReason) {
    statusItem.text = '$(circle-slash) ikmal';
    statusItem.tooltip = skippedReason;
  } else if (degradedChecks) {
    // A check missing one of its engines reports fewer problems, not fewer
    // diagnostics worth trusting. The status bar keeps saying so for as long as
    // it is true, because the diagnostics themselves cannot show what is absent.
    statusItem.text = '$(warning) ikmal';
    statusItem.tooltip = degradedChecks;
  } else {
    statusItem.text = state.mode === 'active' ? '$(check) ikmal' : `$(debug-pause) ${describeFocus(state)}`;
    statusItem.tooltip = state.mode === 'active'
      ? 'ikmal is checking this document'
      : `${describeFocus(state)} — run "ikmal: Resume checking" to turn it back on`;
  }
  statusItem.show();
}

function setSkippedReason(reason) {
  if (reason === skippedReason) return;
  skippedReason = reason;
  renderFocusStatus();
}

// Reports a degraded check once per change of state: a service that stays down
// would otherwise interrupt on every keystroke.
function reportDegradedChecks(response) {
  const message = degradedCheckMessage(response);
  if (message === degradedChecks) return;
  degradedChecks = message;
  renderFocusStatus();
  if (message) vscode.window.showWarningMessage(`ikmal: ${message}`);
}

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
  if (!currentSettings.get('enabled', true) || text.trim().length < minimum) {
    setSkippedReason('');
    return;
  }
  if (text.length > maximum) {
    // Clearing every diagnostic and returning in silence is indistinguishable
    // from finding nothing wrong: the document reads as checked and clean. Say
    // that it was not checked, and name the setting that decided so.
    setSkippedReason(`ikmal is not checking this document: ${text.length} characters exceeds the ikmal.maxLength limit of ${maximum}.`);
    return;
  }
  setSkippedReason('');

  // Pause is answered before the request is built, so nothing is sent at all.
  const focus = currentFocus();
  renderFocusStatus();
  if (focus.mode === 'paused') return;

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
    const core = await writingCore();
    const normalized = normalizeDocumentResult(core, {
      documentId: key,
      text,
      revision: version,
      language: currentSettings.get('language', 'auto'),
      languageHint: vscode.env.language,
      response,
      focus,
      preferences: CORE_PREFERENCES,
    });
    if (generations.get(key) !== generation || document.version !== version || !normalized.current || document.getText() !== text) return;
    reportDegradedChecks(response);
    // Zen keeps checking and narrows what is reported. The indices stored here
    // must match the ones the diagnostics carry, so the core filter is applied
    // once and both diagnostics and code actions read the same array.
    const matches = normalized.matches;
    matchesByDocument.set(key, { version, matches, result: normalized.result });
    diagnostics.set(document.uri, matches.map((match, index) => diagnosticFor(document, match, index)));
  } catch (error) {
    if (generations.get(key) === generation) vscode.window.setStatusBarMessage(`ikmal: ${error.message}`, 5000);
  }
}

function diagnosticFor(document, match, index) {
  const textLength = document.getText().length;
  const start = Math.max(0, Math.min(textLength, Number(match.offset) || 0));
  const end = Math.max(start, Math.min(textLength, start + (Number(match.length) || 0)));
  const source = String(match.source || '').toLowerCase();
  const category = String(match.category || '').toLowerCase();
  const severity = source.includes('style') || category.includes('style') || category === 'guidance'
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
      action.command = {
        command: 'ikmal.applyIssue',
        title: `Replace with “${replacement}”`,
        arguments: [document.uri, document.version, match.id],
      };
      return action;
    })
    .filter(Boolean);
}

async function applyIssue(uri, expectedVersion, issueId) {
  const document = vscode.workspace.textDocuments.find((candidate) => candidate.uri.toString() === uri.toString());
  const entry = document ? matchesByDocument.get(documentKey(document)) : null;
  if (!document || !entry || entry.version !== expectedVersion || document.version !== expectedVersion) {
    vscode.window.showWarningMessage('ikmal: That issue is no longer available.');
    return;
  }
  const issue = entry.matches.find((candidate) => candidate.id === issueId);
  if (!issue) {
    vscode.window.showWarningMessage('ikmal: That issue is no longer available.');
    return;
  }
  const core = await writingCore();
  const documentModel = core.createTextDocument({
    id: documentKey(document),
    text: document.getText(),
    revision: document.version,
    language: settings().get('language', 'auto'),
    source: 'vscode',
  });
  const applied = applyIssueCorrection(core, { document: documentModel, result: entry.result, issueId: issue.id });
  if (!applied) {
    vscode.window.showWarningMessage('ikmal: That issue is stale; check the document again.');
    return;
  }
  const edit = new vscode.WorkspaceEdit();
  edit.replace(document.uri, new vscode.Range(
    document.positionAt(issue.offset),
    document.positionAt(issue.offset + issue.length),
  ), applied.record.replacementText);
  if (!await vscode.workspace.applyEdit(edit)) vscode.window.showWarningMessage('ikmal: Could not apply that correction.');
}

async function activate(context) {
  const core = await writingCore();
  const diagnostics = vscode.languages.createDiagnosticCollection('ikmal');
  const selector = [...CHECKABLE_SCHEMES].map((scheme) => ({ scheme }));
  context.subscriptions.push(diagnostics);
  context.subscriptions.push(vscode.languages.registerCodeActionsProvider(selector, { provideCodeActions }, {
    providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
  }));
  context.subscriptions.push(vscode.commands.registerCommand('ikmal.applyIssue', applyIssue));
  context.subscriptions.push(vscode.commands.registerCommand('ikmal.checkDocument', () => {
    const document = vscode.window.activeTextEditor?.document;
    if (document) checkDocument(document, diagnostics);
  }));

  statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 0);
  statusItem.command = 'ikmal.resume';
  context.subscriptions.push(statusItem);
  renderFocusStatus();

  const recheckEverything = () => {
    renderFocusStatus();
    for (const document of vscode.workspace.textDocuments) scheduleCheck(document, diagnostics);
  };

  const startMode = async (mode) => {
    const picked = await vscode.window.showQuickPick(
      core.FOCUS_DURATIONS.map((duration) => ({ label: duration.label, id: duration.id })),
      { title: mode === 'paused' ? 'Pause ikmal for how long?' : 'Zen mode for how long?' },
    );
    if (!picked) return;
    focusState = core.startFocusState(mode, picked.id);
    // Clearing first means a paused document does not keep showing the
    // diagnostics from before the pause.
    diagnostics.clear();
    recheckEverything();
  };

  context.subscriptions.push(vscode.commands.registerCommand('ikmal.pause', () => startMode('paused')));
  context.subscriptions.push(vscode.commands.registerCommand('ikmal.zen', () => startMode('zen')));
  context.subscriptions.push(vscode.commands.registerCommand('ikmal.resume', () => {
    focusState = { mode: 'active', until: null };
    diagnostics.clear();
    recheckEverything();
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
