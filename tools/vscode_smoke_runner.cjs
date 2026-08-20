'use strict';

// Runs inside the VS Code extension host. `run` is what
// @vscode/test-electron calls once the window is up and the extension under
// development has been loaded.
//
// The assertions are about what a user would see: a document with a mistake in
// it acquires a diagnostic, the quick fix offered for that diagnostic actually
// corrects the text, and Pause stops the checking rather than merely hiding the
// result. Everything here goes through the real extension — no module of it is
// imported directly, because the thing worth proving is that activation,
// configuration, transport, and rendering are wired to each other.

const assert = require('node:assert/strict');
const http = require('node:http');
const vscode = require('vscode');

const CHECKED = [];

function startFixtureChecker() {
  const server = http.createServer(async (request, response) => {
    if (request.method !== 'POST' || !request.url.startsWith('/v2/check')) {
      response.writeHead(404);
      response.end();
      return;
    }
    let body = '';
    for await (const chunk of request) body += chunk;
    const text = new URLSearchParams(body).get('text') || '';
    CHECKED.push(text);
    const matches = [];
    const offset = text.indexOf('teh');
    if (offset >= 0) matches.push({
      offset,
      length: 3,
      message: 'Use the correct spelling.',
      replacements: [{ value: 'the' }],
      rule: { id: 'SPELL', category: { id: 'TYPOS' }, issueType: 'misspelling' },
      ikmalSource: 'quality-sidecar',
    });
    const grammarOffset = text.indexOf('results is');
    if (grammarOffset >= 0) matches.push({
      offset: grammarOffset,
      length: 10,
      message: 'Use a plural verb.',
      replacements: [{ value: 'results are' }],
      rule: { id: 'AGREEMENT', category: { id: 'GRAMMAR' } },
      ikmalSource: 'quality-sidecar',
    });
    const styleOffset = text.indexOf('very unique');
    if (styleOffset >= 0) matches.push({
      offset: styleOffset,
      length: 11,
      message: 'Prefer a precise description.',
      replacements: [{ value: 'unique' }],
      rule: { id: 'STYLE_WORDINESS', category: { id: 'STYLE' } },
      ikmalSource: 'quality-sidecar',
    });
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ matches }));
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function waitFor(describe, predicate, timeout = 15000) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    last = await predicate();
    if (last) return last;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Timed out waiting for ${describe}. Last value: ${JSON.stringify(last)}`);
}

const ikmalDiagnostics = (uri) => vscode.languages
  .getDiagnostics(uri)
  .filter((diagnostic) => String(diagnostic.source).includes('ikmal') || String(diagnostic.message).includes('correct spelling'));

async function run() {
  const server = await startFixtureChecker();
  const { port } = server.address();
  try {
    // Global, because the test window opens no folder and a workspace-scoped
    // setting would have nowhere to live.
    const settings = vscode.workspace.getConfiguration('ikmal');
    await settings.update('endpoint', `http://127.0.0.1:${port}`, vscode.ConfigurationTarget.Global);
    await settings.update('checkDelayMs', 200, vscode.ConfigurationTarget.Global);
    await settings.update('enabled', true, vscode.ConfigurationTarget.Global);
    await settings.update('enabledLanguages', ['plaintext'], vscode.ConfigurationTarget.Global);
    await settings.update('dictionary', [], vscode.ConfigurationTarget.Global);
    await settings.update('ignoredRules', [], vscode.ConfigurationTarget.Global);
    await settings.update('minLength', 1, vscode.ConfigurationTarget.Global);
    await settings.update('maxLength', 20000, vscode.ConfigurationTarget.Global);

    const document = await vscode.workspace.openTextDocument({
      content: 'Please review teh results is very unique before the meeting.',
      language: 'plaintext',
    });
    const editor = await vscode.window.showTextDocument(document);

    await vscode.commands.executeCommand('ikmal.checkDocument');
    const found = await waitFor('a diagnostic on the opened document', () => {
      const diagnostics = ikmalDiagnostics(document.uri);
      return diagnostics.length ? diagnostics : null;
    });
    assert.match(found[0].message, /correct spelling/);
    assert.equal(document.getText(found[0].range), 'teh', 'the diagnostic must cover the word it describes');
    assert.equal(found.length, 3, 'grammar, spelling, and style findings should all be rendered');
    assert.ok(CHECKED.some((text) => text.includes('teh')), 'the extension never reached the checker');

    // A quick fix that is offered but does not correct the text is the same
    // silent no-op a suggestion card would be.
    const actions = await vscode.commands.executeCommand(
      'vscode.executeCodeActionProvider',
      document.uri,
      found[0].range,
    );
    // Matched on the extension's own title and its own command. VS Code offers
    // built-in actions here too ("Fix", "Explain", "Modify"), and a looser match
    // would let one of those satisfy an assertion about ikmal's quick fix.
    const fix = (actions || []).find((action) => action.command?.command === 'ikmal.applyIssue');
    assert.ok(fix, `no ikmal quick fix was offered: ${JSON.stringify((actions || []).map((action) => action.title))}`);
    assert.match(fix.title, /Replace with .*the/, 'the quick fix must name the replacement it will make');
    if (fix.edit) await vscode.workspace.applyEdit(fix.edit);
    else if (fix.command) await vscode.commands.executeCommand(fix.command.command, ...(fix.command.arguments || []));
    await waitFor('the correction to reach the document', async () => document.getText().includes('the results'));
    assert.ok(!document.getText().includes('teh results'), `the quick fix did not correct the text: ${document.getText()}`);

    // Dictionary suppression is a real configuration update, not a local
    // diagnostic hide: the subsequent checker response still contains the
    // spelling match, while the core preference filter removes it.
    await settings.update('dictionary', ['teh'], vscode.ConfigurationTarget.Global);
    await editor.edit((builder) => builder.insert(new vscode.Position(0, 0), 'teh '));
    await vscode.commands.executeCommand('ikmal.checkDocument');
    const dictionaryFiltered = await waitFor('dictionary filtering', () => {
      const diagnostics = ikmalDiagnostics(document.uri);
      return diagnostics.length === 2 && diagnostics.every((diagnostic) => document.getText(diagnostic.range) !== 'teh') ? diagnostics : null;
    });
    assert.equal(dictionaryFiltered.length, 2);

    await settings.update('ignoredRules', ['AGREEMENT'], vscode.ConfigurationTarget.Global);
    await vscode.commands.executeCommand('ikmal.checkDocument');
    await waitFor('ignored rule filtering', () => {
      const diagnostics = ikmalDiagnostics(document.uri);
      return diagnostics.length === 1 && document.getText(diagnostics[0].range) === 'very unique' ? diagnostics : null;
    });

    // Language mode enablement clears existing diagnostics and prevents a
    // request when the active document's language is not enabled.
    await settings.update('enabledLanguages', ['markdown'], vscode.ConfigurationTarget.Global);
    await waitFor('disabled language mode', () => ikmalDiagnostics(document.uri).length === 0 ? true : null);
    await new Promise((resolve) => setTimeout(resolve, 500));
    const beforeLanguageSkip = CHECKED.length;
    await vscode.commands.executeCommand('ikmal.checkDocument');
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.equal(CHECKED.length, beforeLanguageSkip, 'disabled language mode must not call the checker');
    await settings.update('enabledLanguages', ['plaintext'], vscode.ConfigurationTarget.Global);

    // Selection offsets are translated back into document coordinates so the
    // resulting diagnostic can be applied by the same stale-safe path.
    const selectionOffset = document.getText().indexOf('very unique');
    editor.selection = new vscode.Selection(document.positionAt(selectionOffset), document.positionAt(selectionOffset + 11));
    await vscode.commands.executeCommand('ikmal.checkSelection');
    const selectionFinding = await waitFor('selection diagnostic', () => {
      const diagnostics = ikmalDiagnostics(document.uri);
      return diagnostics.length === 1 && document.getText(diagnostics[0].range) === 'very unique' ? diagnostics[0] : null;
    });
    assert.equal(document.offsetAt(selectionFinding.range.start), selectionOffset);

    // A bounded maximum is observable as a skip and does not send the long
    // document to the checker.
    const longDocument = await vscode.workspace.openTextDocument({ content: `${'x'.repeat(1100)} teh`, language: 'plaintext' });
    await vscode.window.showTextDocument(longDocument);
    await settings.update('maxLength', 1000, vscode.ConfigurationTarget.Global);
    const beforeLongSkip = CHECKED.length;
    await vscode.commands.executeCommand('ikmal.checkDocument');
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.equal(ikmalDiagnostics(longDocument.uri).length, 0);
    assert.ok(!CHECKED.slice(beforeLongSkip).some((text) => text.includes('x'.repeat(1100))), 'maxLength must prevent the long document from reaching the checker');

    await vscode.window.showTextDocument(document);
    await settings.update('maxLength', 20000, vscode.ConfigurationTarget.Global);
    await settings.update('enabled', false, vscode.ConfigurationTarget.Global);
    const beforeDisabled = CHECKED.length;
    await vscode.commands.executeCommand('ikmal.checkDocument');
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.equal(ikmalDiagnostics(document.uri).length, 0);
    assert.equal(CHECKED.length, beforeDisabled, 'disabled checking must prevent a checker request');

    // ikmal.pause is deliberately not invoked here. It opens a quick pick to
    // choose a duration, and executeCommand awaits the handler, which awaits
    // the pick — with nothing to answer it, the command never returns. On a
    // desktop the pick dismisses itself when focus moves and the call happens
    // to resolve; under a virtual display it does not, and the harness hangs
    // until the runner is killed. A test that depends on which of those a
    // machine does is worse than one that leaves the mode alone.
    // Pause suppression is covered at the unit level by tools/focus_mode.test.mjs.
    await settings.update('enabled', true, vscode.ConfigurationTarget.Global);
    await settings.update('maxLength', 20000, vscode.ConfigurationTarget.Global);
    await settings.update('ignoredRules', [], vscode.ConfigurationTarget.Global);
    await settings.update('dictionary', [], vscode.ConfigurationTarget.Global);
    const beforeResume = CHECKED.length;
    await vscode.commands.executeCommand('ikmal.resume');
    const currentEditor = await vscode.window.showTextDocument(document);
    await currentEditor.edit((builder) => builder.insert(new vscode.Position(0, 0), 'Also teh other one. '));
    await waitFor('a check after an edit', () => CHECKED.length > beforeResume);

    console.log(`VS Code smoke: ${CHECKED.length} checks, diagnostic and quick fix verified.`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

module.exports = { run };
