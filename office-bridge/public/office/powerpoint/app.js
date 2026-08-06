import { projectShapes, shapeForMatch } from './projection.js';

const state = document.getElementById('state');
const findings = document.getElementById('findings');
const checkButton = document.getElementById('check');
const clearButton = document.getElementById('clear');
const styleSelect = document.getElementById('style');
let lastProjection;
let lastMatches = [];
let markedRanges = [];

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
    empty.textContent = 'No findings in the presentation text.';
    findings.append(empty);
    return;
  }
  for (const match of matches) {
    const shape = shapeForMatch(lastProjection, match);
    const item = document.createElement('li');
    item.className = 'finding';
    const message = document.createElement('p');
    message.textContent = `${shape ? `Slide ${shape.slideNumber}, ${shape.name || shape.shapeId}: ` : 'Multiple shapes: '}${match.message || 'Review this text.'}`;
    item.append(message);
    if (shape && replacementValue(match)) {
      const apply = document.createElement('button');
      apply.type = 'button';
      apply.textContent = `Apply “${replacementValue(match)}”`;
      apply.addEventListener('click', () => applyMatch(match));
      item.append(apply);
    }
    findings.append(item);
  }
}

async function getPresentationShapes() {
  return PowerPoint.run(async (context) => {
    const slides = context.presentation.slides;
    slides.load('items/id');
    await context.sync();
    const records = [];
    for (let slideIndex = 0; slideIndex < slides.items.length; slideIndex += 1) {
      const slide = slides.items[slideIndex];
      const shapes = slide.shapes;
      shapes.load('items/id,items/name,items/type');
      await context.sync();
      const textShapes = shapes.items.filter((shape) => shape.type !== 'Line' && shape.type !== 'Picture');
      const ranges = textShapes.map((shape) => {
        const textRange = shape.textFrame.textRange;
        textRange.load('text');
        return { shape, textRange };
      });
      await context.sync();
      for (const item of ranges) {
        if (!item.textRange.text) continue;
        records.push({
          slideNumber: slideIndex + 1,
          slideId: slide.id,
          shapeId: item.shape.id,
          name: item.shape.name,
          type: item.shape.type,
          text: item.textRange.text,
        });
      }
    }
    return records;
  });
}

async function checkPresentation() {
  setState('Checking slide text locally…');
  try {
    const shapes = await getPresentationShapes();
    const projection = projectShapes(shapes);
    if (!projection.text.trim()) throw new Error('No text-bearing shapes were found.');
    if (projection.text.length > 120000) throw new Error('This presentation is too large for one check; select a smaller deck.');
    await clearMarks();
    const response = await fetch('/office/api/check', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: projection.text, language: 'en-US' }),
    });
    if (!response.ok) throw new Error(`Local checker returned HTTP ${response.status}`);
    const result = await response.json();
    lastProjection = projection;
    lastMatches = Array.isArray(result.matches) ? result.matches : [];
    await markMatches(lastMatches);
    renderFindings(lastMatches);
    clearButton.disabled = markedRanges.length === 0;
    setState(`${lastMatches.length} finding${lastMatches.length === 1 ? '' : 's'} in presentation text`);
  } catch (error) {
    setState(error.message || 'The local check failed.');
  }
}

async function forMatch(match, callback) {
  const shape = shapeForMatch(lastProjection, match);
  if (!shape) return null;
  return PowerPoint.run(async (context) => {
    const slide = context.presentation.slides.getItemAt(shape.slideNumber - 1);
    const target = slide.shapes.getItem(shape.shapeId).textFrame.textRange;
    const start = Number(match.offset) - shape.start;
    const targetRange = target.getSubstring(start, Number(match.length));
    await callback({ context, targetRange, shape });
    await context.sync();
    return shape;
  });
}

async function markMatches(matches) {
  for (const match of matches) {
    const shape = shapeForMatch(lastProjection, match);
    if (!shape) continue;
    const marked = await forMatch(match, async ({ targetRange }) => {
      targetRange.load('font/underline,font/color');
      await targetRange.context.sync();
      const previous = { underline: targetRange.font.underline, color: targetRange.font.color };
      if (styleSelect.value === 'highlight') {
        targetRange.font.color = '#C43C4A';
      } else {
        targetRange.font.underline = styleSelect.value === 'dotted' ? 'Dotted' : 'Wavy';
      }
      markedRanges.push({ ...shape, start: Number(match.offset) - shape.start, length: Number(match.length), ...previous });
    });
    if (!marked) continue;
  }
}

async function clearMarks() {
  if (!markedRanges.length) return;
  const marks = markedRanges;
  markedRanges = [];
  for (const mark of marks) {
    await PowerPoint.run(async (context) => {
      const slide = context.presentation.slides.getItemAt(mark.slideNumber - 1);
      const target = slide.shapes.getItem(mark.shapeId).textFrame.textRange;
      const range = target.getSubstring(mark.start, mark.length);
      range.font.underline = mark.underline || 'None';
      range.font.color = mark.color || null;
      await context.sync();
    }).catch(() => {});
  }
  clearButton.disabled = true;
}

async function applyMatch(match) {
  const shape = shapeForMatch(lastProjection, match);
  const replacement = replacementValue(match);
  if (!shape || !replacement) return;
  try {
    await forMatch(match, async ({ targetRange }) => {
      targetRange.text = replacement;
    });
    setState(`Applied on slide ${shape.slideNumber}. Check again for updated findings.`);
  } catch (error) {
    setState(error.message || 'Could not apply the replacement.');
  }
}

function init(info) {
  if (info.host !== Office.HostType.PowerPoint) {
    setState('This task pane is currently configured for PowerPoint.');
    return;
  }
  checkButton.disabled = false;
  checkButton.addEventListener('click', checkPresentation);
  clearButton.addEventListener('click', clearMarks);
  setState('Ready. Check presentation text.');
}

Office.onReady(init);
