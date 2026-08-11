import {
  applyHTMLMatch,
  decorateHTMLMatches,
  projectHTML,
  removeHTMLMarks,
  segmentForMatch,
} from './projection.js';

const state = document.getElementById('state');
const findings = document.getElementById('findings');
const checkButton = document.getElementById('check');
const clearButton = document.getElementById('clear');
const styleSelect = document.getElementById('style');
let lastHTML = '';
let lastProjection;
let lastMatches = [];
let lastInline = false;

// The bridge names the engines that did not answer. A pane that reported only
// the count would present a partial check as a finished one.
function degradedSuffix(result) {
  const missing = Array.isArray(result?.ikmalDegradedChecks) ? result.ikmalDegradedChecks : [];
  return missing.length ? ` · ${missing.join(' and ')} checks did not run` : '';
}

function setState(message) {
  state.textContent = message;
}

function replacementValue(match) {
  const replacement = match.replacements?.[0];
  return typeof replacement === 'string' ? replacement : replacement?.value || '';
}

function extractPageHTML(value) {
  try {
    const parsed = JSON.parse(value);
    const visit = (node) => {
      if (!node || typeof node !== 'object') return '';
      if (typeof node.content === 'string' && /<[^>]+>/.test(node.content)) return node.content;
      for (const child of Object.values(node)) {
        const found = visit(child);
        if (found) return found;
      }
      return '';
    };
    return visit(parsed);
  } catch (_) {
    return /<[^>]+>/.test(value) ? value : '';
  }
}

function getSelectedHTML() {
  return new Promise((resolve, reject) => {
    Office.context.document.getSelectedDataAsync(Office.CoercionType.Html, (result) => {
      if (result.status === Office.AsyncResultStatus.Succeeded) resolve(result.value || '');
      else reject(result.error || new Error('OneNote did not provide a selected range.'));
    });
  });
}

function setSelectedHTML(html) {
  return new Promise((resolve, reject) => {
    Office.context.document.setSelectedDataAsync(html, { coercionType: Office.CoercionType.Html }, (result) => {
      if (result.status === Office.AsyncResultStatus.Succeeded) resolve();
      else reject(result.error || new Error('OneNote could not update the selected range.'));
    });
  });
}

async function getActivePageHTML() {
  return OneNote.run(async (context) => {
    const page = context.application.getActivePage();
    const analyzed = page.analyzePage();
    await context.sync();
    return extractPageHTML(analyzed.value || '');
  });
}

async function getSource() {
  try {
    const selected = await getSelectedHTML();
    if (projectHTML(selected).text.trim()) return { html: selected, inline: true };
  } catch (_) {
    // Whole-page analysis is the supported fallback when no selection exists.
  }
  const pageHTML = await getActivePageHTML();
  if (!pageHTML) throw new Error('OneNote did not expose HTML for the active page. Use OneNote on the web and try again.');
  return { html: pageHTML, inline: false };
}

function renderFindings(matches) {
  findings.replaceChildren();
  if (!matches.length) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent = 'No findings in the available page content.';
    findings.append(empty);
    return;
  }
  for (const match of matches) {
    const item = document.createElement('li');
    item.className = 'finding';
    const message = document.createElement('p');
    message.textContent = `${lastInline && segmentForMatch(lastProjection, match) ? 'Inline: ' : 'Pane only: '}${match.message || 'Review this passage.'}`;
    item.append(message);
    if (lastInline && segmentForMatch(lastProjection, match) && replacementValue(match)) {
      const apply = document.createElement('button');
      apply.type = 'button';
      apply.textContent = `Apply “${replacementValue(match)}”`;
      apply.addEventListener('click', () => applyMatch(match));
      item.append(apply);
    }
    findings.append(item);
  }
}

async function clearMarks() {
  if (!lastInline) return;
  const current = await getSelectedHTML();
  const clean = removeHTMLMarks(current);
  if (clean !== current) await setSelectedHTML(clean);
  lastHTML = clean;
  clearButton.disabled = true;
}

async function checkPage() {
  setState('Reading the active OneNote page locally…');
  try {
    const source = await getSource();
    const clean = removeHTMLMarks(source.html);
    const projection = projectHTML(clean);
    if (!projection.text.trim()) throw new Error('The active OneNote page has no readable text.');
    if (projection.text.length > 120000) throw new Error('This page is too large for one local check.');
    if (source.inline) {
      const current = await getSelectedHTML();
      if (current !== source.html) throw new Error('The selected OneNote content changed while it was being read.');
    }
    const response = await fetch('/office/api/check', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: projection.text, language: 'en-US' }),
    });
    if (!response.ok) throw new Error(`Local checker returned HTTP ${response.status}`);
    const result = await response.json();
    lastInline = source.inline;
    lastMatches = Array.isArray(result.matches) ? result.matches : [];
    const decorated = source.inline ? decorateHTMLMatches(projection, lastMatches, styleSelect.value) : clean;
    if (source.inline && decorated !== clean) await setSelectedHTML(decorated);
    lastHTML = source.inline ? decorated : clean;
    lastProjection = projectHTML(lastHTML);
    renderFindings(lastMatches);
    clearButton.disabled = !source.inline || decorated === clean;
    setState(`${lastMatches.length} finding${lastMatches.length === 1 ? '' : 's'}${source.inline ? ' in selection' : ' in active page'}${degradedSuffix(result)}`);
  } catch (error) {
    setState(error.message || 'The local check failed.');
  }
}

async function applyMatch(match) {
  if (!lastInline) return;
  const replacement = replacementValue(match);
  if (!replacement) return;
  try {
    const current = await getSelectedHTML();
    if (current !== lastHTML) throw new Error('The selected OneNote content changed. Check again before applying.');
    const next = applyHTMLMatch(lastProjection, match, replacement);
    if (!next) throw new Error('This finding crosses page markup and cannot be applied safely.');
    await setSelectedHTML(next);
    lastHTML = next;
    lastProjection = projectHTML(next);
    setState('Applied. Check the selection again for updated findings.');
  } catch (error) {
    setState(error.message || 'Could not apply the replacement.');
  }
}

function init(info) {
  if (info.host !== Office.HostType.OneNote) {
    setState('This task pane is currently configured for OneNote.');
    return;
  }
  checkButton.disabled = false;
  checkButton.addEventListener('click', checkPage);
  clearButton.addEventListener('click', clearMarks);
  setState('Ready. Select text for inline review, or check the active page.');
}

Office.onReady(init);
