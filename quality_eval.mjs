#!/usr/bin/env node

import fs from 'node:fs/promises';
import process from 'node:process';

const endpoint = process.env.IKMAL_QUALITY_URL || 'http://127.0.0.1:8098/v1/analyze';
const cases = JSON.parse(await fs.readFile(new URL('./quality-regression.json', import.meta.url), 'utf8'));

let failures = 0;
for (const testCase of cases) {
  let response;
  try {
    const result = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: testCase.text, language: 'en-US', mode: 'check' }),
    });
    response = await result.json();
  } catch (error) {
    console.log(`FAIL ${testCase.id}: request failed (${error.message})`);
    failures += 1;
    continue;
  }

  const suggestions = response.suggestions || [];
  const replacement = testCase.expectReplacement?.toLowerCase();
  const foundReplacement = replacement
    ? suggestions.some((suggestion) => suggestion.replacement?.toLowerCase() === replacement)
    : false;
  const clean = suggestions.length === 0;
  const hasUnexpectedCategory = testCase.expectNoCategory
    ? suggestions.some((suggestion) => suggestion.category === testCase.expectNoCategory)
    : false;
  const passed = replacement
    ? foundReplacement
    : testCase.expectNoSuggestions
      ? clean
      : testCase.expectNoCategory
        ? !hasUnexpectedCategory
        : true;
  console.log(`${passed ? 'PASS' : 'FAIL'} ${testCase.id}: ${suggestions.map((s) => `${s.replacement || '(no replacement)'} [${s.category}]`).join(', ') || 'no suggestions'}`);
  if (!passed) failures += 1;
}

if (failures) {
  console.error(`${failures} quality regression(s) failed.`);
  process.exitCode = 1;
} else {
  console.log(`All ${cases.length} quality regressions passed.`);
}
