(function () {
  'use strict';

  const state = document.getElementById('state');
  const findings = document.getElementById('findings');
  const checkButton = document.getElementById('check');
  const clearButton = document.getElementById('clear');
  const styleSelect = document.getElementById('style');
  let lastSelectionText = '';
  let lastMatches = [];
  let markedAnnotations = [];

  function setState(message) {
    state.textContent = message;
  }

  function renderFindings(matches) {
    findings.replaceChildren();
    if (!matches.length) {
      const empty = document.createElement('li');
      empty.className = 'empty';
      empty.textContent = 'No findings in the current selection.';
      findings.append(empty);
      return;
    }
    for (const match of matches) {
      const item = document.createElement('li');
      item.className = 'finding';
      const message = document.createElement('p');
      message.textContent = match.message || 'Review this passage.';
      item.append(message);
      if (match.replacements?.length) {
        const apply = document.createElement('button');
        apply.type = 'button';
        apply.textContent = `Apply “${replacementValue(match)}”`;
        apply.addEventListener('click', () => applyMatch(match));
        item.append(apply);
      }
      findings.append(item);
    }
  }

  async function getSelection() {
    return Word.run(async (context) => {
      const selection = context.document.getSelection();
      selection.load('text');
      await context.sync();
      return selection.text;
    });
  }

  async function checkSelection() {
    setState('Checking locally…');
    try {
      const text = await getSelection();
      if (!text.trim()) throw new Error('Select some text in Word first.');
      const response = await fetch('/office/api/check', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, language: 'en-US', enabledOnly: 'false' }),
      });
      if (!response.ok) throw new Error(`Local checker returned HTTP ${response.status}`);
      const result = await response.json();
      lastSelectionText = text;
      lastMatches = Array.isArray(result.matches) ? result.matches : [];
      await clearMarks();
      await markMatches(text, lastMatches);
      renderFindings(lastMatches);
      clearButton.disabled = markedAnnotations.length === 0;
      setState(`${lastMatches.length} finding${lastMatches.length === 1 ? '' : 's'} in selection`);
    } catch (error) {
      setState(error.message || 'The local check failed.');
    }
  }

  function matchText(text, match) {
    const start = Number(match.offset);
    const length = Number(match.length);
    if (!Number.isInteger(start) || !Number.isInteger(length) || start < 0 || length <= 0) return '';
    return text.slice(start, start + length);
  }

  function replacementValue(match) {
    const replacement = match.replacements?.[0];
    return typeof replacement === 'string' ? replacement : replacement?.value || '';
  }

  async function markMatch(text, match) {
    const needle = matchText(text, match);
    if (!needle || text.indexOf(needle) !== text.lastIndexOf(needle)) return false;
    return Word.run(async (context) => {
      const selection = context.document.getSelection();
      const results = selection.search(needle, { matchCase: true, matchWholeWord: false });
      results.load('items/text, items/font/underline, items/font/highlightColor');
      await context.sync();
      if (results.items.length !== 1 || results.items[0].text !== needle) return false;
      const font = results.items[0].font;
      const previous = { underline: font.underline, highlightColor: font.highlightColor };
      if (styleSelect.value === 'highlight') {
        font.highlightColor = 'Yellow';
      } else {
        font.underline = styleSelect.value === 'dotted' ? 'Dotted' : 'Wave';
      }
      await context.sync();
      return { needle, ...previous };
    });
  }

  async function markMatches(text, matches) {
    for (const match of matches) {
      const annotation = await markMatch(text, match);
      if (annotation) markedAnnotations.push(annotation);
    }
  }

  async function clearMarks() {
    if (!markedAnnotations.length) return;
    await Word.run(async (context) => {
      const selection = context.document.getSelection();
      for (const annotation of markedAnnotations) {
        const needle = annotation.needle;
        const results = selection.search(needle, { matchCase: true, matchWholeWord: false });
        results.load('items/text');
        await context.sync();
        if (results.items.length === 1 && results.items[0].text === needle) {
          results.items[0].font.underline = annotation.underline || 'None';
          results.items[0].font.highlightColor = annotation.highlightColor || null;
        }
      }
      await context.sync();
    }).catch(() => {});
    markedAnnotations = [];
    clearButton.disabled = true;
  }

  async function applyMatch(match) {
    const replacement = replacementValue(match);
    const needle = matchText(lastSelectionText, match);
    if (!replacement || !needle) return;
    try {
      // Unmark first. Marks are restored by searching for the original text, so
      // once a replacement lands the needle is gone and that word's underline
      // can never be removed again — it stays in the user's document, and Word
      // carries the formatting onto the inserted replacement too.
      await clearMarks();
      await Word.run(async (context) => {
        const document = context.document;
        document.load('changeTrackingMode');
        const selection = context.document.getSelection();
        const results = selection.search(needle, { matchCase: true, matchWholeWord: false });
        results.load('items/text');
        await context.sync();
        if (results.items.length !== 1) throw new Error('The match is no longer unambiguous.');
        results.items[0].insertText(replacement, 'Replace');
        await context.sync();
        if (document.changeTrackingMode !== 'Off') {
          setState('Applied with Word change tracking enabled.');
        }
      });
      if (state.textContent !== 'Applied with Word change tracking enabled.') {
        setState('Applied. Check the selection again for updated findings.');
      }
    } catch (error) {
      setState(error.message || 'Could not apply the replacement.');
    }
  }

  function init(info) {
    if (info.host !== Office.HostType.Word) {
      setState('This task pane is currently configured for Word.');
      return;
    }
    checkButton.disabled = false;
    checkButton.addEventListener('click', checkSelection);
    clearButton.addEventListener('click', clearMarks);
    setState('Ready. Select text in Word.');
  }

  Office.onReady(init);
}());
