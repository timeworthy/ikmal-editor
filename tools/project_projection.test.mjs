import assert from 'node:assert/strict';
import test from 'node:test';
import projection from '../office-bridge/project_projection.cjs';

test('Project tasks become a bounded name and notes projection', () => {
  const result = projection.projectTasks([
    { taskId: 17, name: 'Write introduction', notes: 'Keep the scope narrow.' },
    { id: '18', taskName: 'Review draft', taskNotes: '' },
  ]);
  assert.equal(result.text, 'Write introduction\nKeep the scope narrow.\nReview draft\n');
  assert.deepEqual(result.fields.map(({ taskId, field, start, end }) => ({ taskId, field, start, end })), [
    { taskId: '17', field: 'name', start: 0, end: 18 },
    { taskId: '17', field: 'notes', start: 19, end: 41 },
    { taskId: '18', field: 'name', start: 42, end: 54 },
  ]);
});

test('Project matches crossing a task field boundary are pane-only', () => {
  const result = projection.projectTasks([{ taskId: 'a', name: 'Write', notes: 'carefully' }]);
  assert.equal(projection.fieldForMatch(result, { offset: 3, length: 8 }), null);
  assert.equal(projection.fieldForMatch(result, { offset: 1, length: 2 }).field, 'name');
  assert.equal(projection.fieldForMatch(result, { offset: 7, length: 4 }).field, 'notes');
});

test('Project replacement mapping stays inside one task field', () => {
  const result = projection.projectTasks([{ taskId: 'a', name: 'Write draft', notes: '' }]);
  const match = { offset: 6, length: 5 };
  assert.deepEqual(projection.replacementForField(result, match, 'plan'), {
    taskId: 'a', index: 0, field: 'name', value: 'Write plan', start: 0, end: 11,
  });
  assert.equal(projection.replacementForField(result, { offset: 10, length: 4 }, 'x'), null);
});
