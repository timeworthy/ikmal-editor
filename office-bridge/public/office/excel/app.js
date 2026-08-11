import { cellForMatch, projectRange } from './projection.js';

const state = document.getElementById('state');
const findings = document.getElementById('findings');
const checkButton = document.getElementById('check');
const clearButton = document.getElementById('clear');
const styleSelect = document.getElementById('style');
let lastProjection;
let lastSnapshot;
let lastMatches = [];
let markedCells = [];

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

function renderFindings(matches) {
  findings.replaceChildren();
  if (!matches.length) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent = 'No findings in the selected cells.';
    findings.append(empty);
    return;
  }
  for (const match of matches) {
    const cell = cellForMatch(lastProjection, match);
    const item = document.createElement('li');
    item.className = 'finding';
    const message = document.createElement('p');
    message.textContent = `${cell ? `${cell.address}: ` : 'Multiple cells: '}${match.message || 'Review this value.'}`;
    item.append(message);
    if (cell && replacementValue(match)) {
      const apply = document.createElement('button');
      apply.type = 'button';
      apply.textContent = `Apply “${replacementValue(match)}”`;
      apply.addEventListener('click', () => applyMatch(match));
      item.append(apply);
    }
    findings.append(item);
  }
}

async function getSelectedRange() {
  return Excel.run(async (context) => {
    const range = context.workbook.getSelectedRange();
    range.load(['text', 'formulas', 'rowIndex', 'columnIndex', 'worksheet/name']);
    await context.sync();
    return {
      values: range.text,
      formulas: range.formulas,
      rowIndex: range.rowIndex,
      columnIndex: range.columnIndex,
      worksheetName: range.worksheet.name,
    };
  });
}

async function checkSelection() {
  setState('Checking selected cells locally…');
  try {
    const snapshot = await getSelectedRange();
    const projection = projectRange(snapshot.values, snapshot);
    if (!projection.text.trim()) throw new Error('Select cells containing text first.');
    if (projection.text.length > 120000) throw new Error('Select a smaller range; checks are capped for privacy and responsiveness.');
    await clearMarks();
    const response = await fetch('/office/api/check', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: projection.text, language: 'en-US' }),
    });
    if (!response.ok) throw new Error(`Local checker returned HTTP ${response.status}`);
    const result = await response.json();
    lastSnapshot = snapshot;
    lastProjection = projection;
    lastMatches = Array.isArray(result.matches) ? result.matches : [];
    await markMatches(lastMatches);
    renderFindings(lastMatches);
    clearButton.disabled = markedCells.length === 0;
    setState(`${lastMatches.length} finding${lastMatches.length === 1 ? '' : 's'} in selected cells${degradedSuffix(result)}`);
  } catch (error) {
    setState(error.message || 'The local check failed.');
  }
}

function worksheet(context, name) {
  return context.workbook.worksheets.getItem(name);
}

async function markMatches(matches) {
  // One entry per cell, not per finding. Two findings in the same cell used to
  // record two "previous fills", and because the loop synced between them the
  // second captured the highlight the first had just written — so restoring
  // replayed original-then-highlight and left the cell highlighted for good.
  const addresses = [];
  for (const match of matches) {
    const cell = cellForMatch(lastProjection, match);
    if (cell && !addresses.includes(cell.address)) addresses.push(cell.address);
  }
  if (!addresses.length) return;
  await Excel.run(async (context) => {
    const sheet = worksheet(context, lastSnapshot.worksheetName);
    const ranges = addresses.map((address) => {
      const range = sheet.getRange(address);
      range.load(['format/fill/color', 'format/font/underline']);
      return { address, range };
    });
    // One sync for every read, before any write, so nothing reads back a value
    // this same pass has already changed.
    await context.sync();
    const color = styleSelect.value === 'highlight'
      ? '#FFF2CC'
      : styleSelect.value === 'dotted' ? '#E2F0D9' : '#FCE4D6';
    for (const entry of ranges) {
      markedCells.push({
        worksheetName: lastSnapshot.worksheetName,
        address: entry.address,
        fill: entry.range.format.fill.color,
        underline: entry.range.format.font.underline,
      });
      entry.range.format.fill.color = color;
    }
    await context.sync();
  });
}

async function clearMarks() {
  if (!markedCells.length) return;
  await Excel.run(async (context) => {
    for (const marked of markedCells) {
      const range = worksheet(context, marked.worksheetName).getRange(marked.address);
      // A cell that had no fill reports an empty colour, and assigning that
      // back is not a valid write — clear() is how "no fill" is expressed.
      if (marked.fill) range.format.fill.color = marked.fill;
      else range.format.fill.clear();
      range.format.font.underline = marked.underline || 'None';
    }
    await context.sync();
  }).catch(() => {});
  markedCells = [];
  clearButton.disabled = true;
}

async function applyMatch(match) {
  const cell = cellForMatch(lastProjection, match);
  const replacement = replacementValue(match);
  if (!cell || !replacement) return;
  const formula = lastSnapshot.formulas?.[cell.row]?.[cell.column];
  if (typeof formula === 'string' && formula.startsWith('=')) {
    setState(`${cell.address} contains a formula; ikmal left it unchanged.`);
    return;
  }
  const localStart = Number(match.offset) - cell.start;
  const next = `${cell.text.slice(0, localStart)}${replacement}${cell.text.slice(localStart + Number(match.length))}`;
  try {
    // Restore the original fills before writing. Writing a value does not clear
    // the highlight, and the recorded findings stop describing the sheet the
    // moment one cell changes, so clearing afterwards would work from stale
    // bookkeeping and leave highlights behind.
    await clearMarks();
    await Excel.run(async (context) => {
      const range = worksheet(context, lastSnapshot.worksheetName).getRange(cell.address);
      range.values = [[next]];
      await context.sync();
    });
    setState(`Applied in ${cell.address}. Check the selection again for updated findings.`);
  } catch (error) {
    setState(error.message || 'Could not apply the replacement.');
  }
}

function init(info) {
  if (info.host !== Office.HostType.Excel) {
    setState('This task pane is currently configured for Excel.');
    return;
  }
  checkButton.disabled = false;
  checkButton.addEventListener('click', checkSelection);
  clearButton.addEventListener('click', clearMarks);
  setState('Ready. Select cells in Excel.');
}

Office.onReady(init);
