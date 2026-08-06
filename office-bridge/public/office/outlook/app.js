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
let lastBodyHTML = '';
let lastProjection;
let lastMatches = [];

function setState(message) {
  state.textContent = message;
}

function replacementValue(match) {
  const replacement = match.replacements?.[0];
  return typeof replacement === 'string' ? replacement : replacement?.value || '';
}

function body() {
  return Office.context.mailbox.item?.body;
}

function getBodyHTML() {
  return new Promise((resolve, reject) => {
    const currentBody = body();
    if (!currentBody) return reject(new Error('Outlook did not provide a message body.'));
    currentBody.getAsync(Office.CoercionType.Html, (result) => {
      if (result.status === Office.AsyncResultStatus.Succeeded) resolve(result.value || '');
      else reject(result.error || new Error('Outlook could not read the message body.'));
    });
  });
}

function setBodyHTML(html) {
  return new Promise((resolve, reject) => {
    const currentBody = body();
    if (!currentBody) return reject(new Error('Outlook did not provide a message body.'));
    currentBody.setAsync(html, { coercionType: Office.CoercionType.Html }, (result) => {
      if (result.status === Office.AsyncResultStatus.Succeeded) resolve();
      else reject(result.error || new Error('Outlook could not update the message body.'));
    });
  });
}

function renderFindings(matches) {
  findings.replaceChildren();
  if (!matches.length) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent = 'No findings in this draft.';
    findings.append(empty);
    return;
  }
  for (const match of matches) {
    const item = document.createElement('li');
    item.className = 'finding';
    const mapped = Boolean(segmentForMatch(lastProjection, match));
    const message = document.createElement('p');
    message.textContent = `${mapped ? 'Inline: ' : 'Pane only: '}${match.message || 'Review this passage.'}`;
    item.append(message);
    if (mapped && replacementValue(match)) {
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
  const current = await getBodyHTML();
  const clean = removeHTMLMarks(current);
  if (clean !== current) await setBodyHTML(clean);
  lastBodyHTML = clean;
  clearButton.disabled = true;
  return clean;
}

async function checkDraft() {
  setState('Checking the draft locally…');
  try {
    const html = await clearMarks();
    const projection = projectHTML(html);
    if (!projection.text.trim()) throw new Error('The draft body is empty.');
    if (projection.text.length > 120000) throw new Error('This draft is too large for one local check.');
    const response = await fetch('/office/api/check', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: projection.text, language: 'en-US' }),
    });
    if (!response.ok) throw new Error(`Local checker returned HTTP ${response.status}`);
    const result = await response.json();
    const matches = Array.isArray(result.matches) ? result.matches : [];
    const decorated = decorateHTMLMatches(projection, matches, styleSelect.value);
    if (decorated !== html) await setBodyHTML(decorated);
    lastBodyHTML = decorated;
    lastProjection = projectHTML(decorated);
    lastMatches = matches;
    renderFindings(matches);
    clearButton.disabled = decorated === html;
    setState(`${matches.length} finding${matches.length === 1 ? '' : 's'} in draft`);
  } catch (error) {
    setState(error.message || 'The local check failed.');
  }
}

async function applyMatch(match) {
  const replacement = replacementValue(match);
  if (!replacement) return;
  try {
    const current = await getBodyHTML();
    if (current !== lastBodyHTML) throw new Error('The draft changed while ikmal was checking it. Check again before applying.');
    const next = applyHTMLMatch(lastProjection, match, replacement);
    if (!next) throw new Error('This finding crosses HTML markup and cannot be applied safely.');
    await setBodyHTML(next);
    lastBodyHTML = next;
    lastProjection = projectHTML(next);
    setState('Applied. Check the draft again for updated findings.');
  } catch (error) {
    setState(error.message || 'Could not apply the replacement.');
  }
}

function init(info) {
  if (info.host !== Office.HostType.Outlook) {
    setState('This task pane is currently configured for Outlook.');
    return;
  }
  checkButton.disabled = false;
  checkButton.addEventListener('click', checkDraft);
  clearButton.addEventListener('click', clearMarks);
  setState('Ready. Review the current draft locally.');
}

Office.onReady(init);
