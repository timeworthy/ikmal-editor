import assert from 'node:assert/strict';
import test from 'node:test';
import stats from '../extension/core/text_stats.js';

test('counts words rather than whitespace runs', () => {
  assert.equal(stats.wordCount('A short phrase.'), 3);
  assert.equal(stats.wordCount('  one\n two\tthree  '), 3);
  assert.equal(stats.wordCount('— …'), 0);
});

test('counts user-visible characters, including Unicode code points', () => {
  assert.equal(stats.characterCount('hello world'), 11);
  assert.equal(stats.characterCount('Hi 👋'), 4);
  assert.equal(stats.characterCount(''), 0);
});
