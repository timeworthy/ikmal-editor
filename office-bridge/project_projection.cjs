'use strict';

function taskValue(task, field) {
  if (field === 'name') return String(task?.name ?? task?.taskName ?? '');
  return String(task?.notes ?? task?.taskNotes ?? '');
}

function projectTasks(tasks) {
  const source = Array.isArray(tasks) ? tasks : [];
  const records = [];
  const fields = [];
  let text = '';

  source.forEach((task, index) => {
    const taskId = String(task?.taskId ?? task?.id ?? '');
    const record = { taskId, index, name: taskValue(task, 'name'), notes: taskValue(task, 'notes') };
    records.push(record);
    for (const field of ['name', 'notes']) {
      const value = record[field];
      if (!value) continue;
      const start = text.length;
      text += value;
      fields.push({ taskId, index, field, value, start, end: text.length });
      text += '\n';
    }
    if (text && !text.endsWith('\n')) text += '\n';
  });

  return { text, records, fields };
}

function fieldForMatch(projection, match) {
  const start = Number(match?.offset);
  const length = Number(match?.length);
  const end = start + length;
  if (!Number.isInteger(start) || !Number.isInteger(length) || start < 0 || length <= 0) return null;
  return projection?.fields?.find((field) => start >= field.start && end <= field.end) || null;
}

function replacementForField(projection, match, replacement) {
  const field = fieldForMatch(projection, match);
  if (!field) return null;
  const localStart = Number(match.offset) - field.start;
  return {
    ...field,
    value: `${field.value.slice(0, localStart)}${String(replacement)}${field.value.slice(localStart + Number(match.length))}`,
  };
}

module.exports = { fieldForMatch, projectTasks, replacementForField };
