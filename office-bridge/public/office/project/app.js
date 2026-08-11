import { fieldForMatch, projectTasks } from './projection.js';

const state = document.getElementById('state');
const findings = document.getElementById('findings');
const checkButton = document.getElementById('check');
let lastProjection;
let lastTask;
let lastMatches = [];

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

function asyncDocumentCall(method, ...args) {
  return new Promise((resolve, reject) => {
    if (typeof Office?.context?.document?.[method] !== 'function') {
      reject(new Error(`Project does not expose ${method} in this client.`));
      return;
    }
    Office.context.document[method](...args, (result) => {
      if (result.status === Office.AsyncResultStatus.Succeeded) resolve(result.value);
      else reject(result.error || new Error(`Project ${method} failed.`));
    });
  });
}

async function readSelectedTask() {
  const taskId = await asyncDocumentCall('getSelectedTaskAsync');
  const task = await asyncDocumentCall('getTaskAsync', taskId);
  const notesResult = await asyncDocumentCall('getTaskFieldAsync', taskId, Office.ProjectTaskFields.Notes);
  return {
    taskId: String(taskId),
    name: String(task?.taskName || ''),
    notes: String(notesResult?.fieldValue ?? ''),
  };
}

async function setTaskField(taskId, field, value) {
  await asyncDocumentCall('setTaskFieldAsync', taskId, Office.ProjectTaskFields[field === 'name' ? 'Name' : 'Notes'], value);
}

function renderFindings(matches) {
  findings.replaceChildren();
  if (!matches.length) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent = 'No findings in the selected task fields.';
    findings.append(empty);
    return;
  }
  for (const match of matches) {
    const field = fieldForMatch(lastProjection, match);
    const item = document.createElement('li');
    item.className = 'finding';
    const message = document.createElement('p');
    message.textContent = `${field ? `${field.field === 'name' ? 'Name' : 'Notes'}: ` : 'Task: '}${match.message || 'Review this field.'}`;
    item.append(message);
    const replacement = replacementValue(match);
    if (field && replacement) {
      const apply = document.createElement('button');
      apply.type = 'button';
      apply.textContent = `Apply “${replacement}”`;
      apply.addEventListener('click', () => applyMatch(match));
      item.append(apply);
    }
    findings.append(item);
  }
}

async function checkTask() {
  setState('Reading the selected Project task locally…');
  try {
    const task = await readSelectedTask();
    const projection = projectTasks([task]);
    if (!projection.text.trim()) throw new Error('The selected task has no Name or Notes text.');
    if (projection.text.length > 120000) throw new Error('The selected task is too large for one local check.');
    const response = await fetch('/office/api/check', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: projection.text, language: 'en-US' }),
    });
    if (!response.ok) throw new Error(`Local checker returned HTTP ${response.status}`);
    const result = await response.json();
    lastTask = task;
    lastProjection = projection;
    lastMatches = Array.isArray(result.matches) ? result.matches : [];
    renderFindings(lastMatches);
    setState(`${lastMatches.length} finding${lastMatches.length === 1 ? '' : 's'} in the selected task${degradedSuffix(result)}`);
  } catch (error) {
    setState(error.message || 'The local check failed.');
  }
}

async function applyMatch(match) {
  const field = fieldForMatch(lastProjection, match);
  const replacement = replacementValue(match);
  if (!field || !replacement) return;
  try {
    const current = await readSelectedTask();
    if (current.taskId !== lastTask.taskId || current[field.field] !== lastTask[field.field]) {
      throw new Error('The selected task changed. Check it again before applying.');
    }
    const localStart = Number(match.offset) - field.start;
    const next = `${field.value.slice(0, localStart)}${replacement}${field.value.slice(localStart + Number(match.length))}`;
    await setTaskField(current.taskId, field.field, next);
    setState(`Applied to ${field.field === 'name' ? 'Name' : 'Notes'}. Check the task again for updated findings.`);
  } catch (error) {
    setState(error.message || 'Could not apply the replacement.');
  }
}

function init(info) {
  if (info.host !== Office.HostType.Project) {
    setState('This task pane is currently configured for Project.');
    return;
  }
  checkButton.disabled = false;
  checkButton.addEventListener('click', checkTask);
  setState('Ready. Select a task in Project.');
}

Office.onReady(init);
