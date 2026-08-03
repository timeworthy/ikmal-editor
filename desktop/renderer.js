const input = document.querySelector('#writing-input');
const results = document.querySelector('#results');
const emptyState = document.querySelector('#empty-state');
const notice = document.querySelector('#writing-notice');
const summary = document.querySelector('#check-summary');
const wordCount = document.querySelector('#word-count');
const serviceLabel = document.querySelector('#service-label');
const serviceSummary = document.querySelector('#service-summary');
const startButton = document.querySelector('#start-button');
const stopButton = document.querySelector('#stop-button');
const checkButton = document.querySelector('#check-button');
const clearButton = document.querySelector('#clear-button');
const languageToolStatusDot = document.querySelector('#languagetool-status-dot');
const languageToolStatusLabel = document.querySelector('#languagetool-status-label');
const qualityStatusDot = document.querySelector('#quality-status-dot');
const qualityStatusLabel = document.querySelector('#quality-status-label');
const styleGuideSelect = document.querySelector('#style-guide-select');
const styleGuideToggle = document.querySelector('#style-guide-toggle');
const styleGuideCount = document.querySelector('#style-guide-count');
const styleGuideStatus = document.querySelector('#style-guide-status');
const refreshStyleGuidesButton = document.querySelector('#refresh-style-guides');
const historyList = document.querySelector('#history-list');
const historyEmptyState = document.querySelector('#history-empty-state');
const historyNotice = document.querySelector('#history-notice');
const clearHistoryButton = document.querySelector('#clear-history-button');

const sampleText = 'Plants, by comparison, produce their own food. The method is different. The result shows a difference.';
let lastResponse = { matches: [] };
let styleGuideState;
let recentChecks = [];

function escapeHTML(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function updateWordCount() {
  const words = input.value.trim() ? input.value.trim().split(/\s+/).length : 0;
  wordCount.textContent = `${words} word${words === 1 ? '' : 's'}`;
}

function setNotice(message, visible = true) {
  notice.textContent = message;
  notice.classList.toggle('is-hidden', !visible);
}

function selectPanel(panelId) {
  document.querySelectorAll('.tab').forEach((tab) => tab.classList.toggle('is-active', tab.dataset.panel === panelId));
  document.querySelectorAll('.panel').forEach((panel) => panel.classList.toggle('is-active', panel.id === panelId));
  if (panelId === 'history-panel') loadRecentChecks();
}

function setHistoryNotice(message, visible = true) {
  historyNotice.textContent = message;
  historyNotice.classList.toggle('is-hidden', !visible);
}

function formatHistoryDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Earlier' : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function renderRecentChecks(entries) {
  recentChecks = Array.isArray(entries) ? entries : [];
  historyList.querySelectorAll('.history-card').forEach((node) => node.remove());
  historyEmptyState.classList.toggle('is-hidden', recentChecks.length > 0);
  recentChecks.forEach((entry, index) => {
    const card = document.createElement('article');
    card.className = 'history-card';
    const preview = String(entry.text || '').replace(/\s+/g, ' ').trim();
    const matchCount = Number(entry.matchCount) || 0;
    card.innerHTML = `
      <div class="history-topline">
        <span>${escapeHTML(formatHistoryDate(entry.checkedAt))}</span>
        <span>${matchCount} suggestion${matchCount === 1 ? '' : 's'}</span>
      </div>
      <p>${escapeHTML(preview.length > 140 ? `${preview.slice(0, 137)}…` : preview)}</p>
      <button class="history-open" type="button" data-history-index="${index}">Open and check again</button>`;
    historyList.appendChild(card);
  });
  historyList.querySelectorAll('.history-open').forEach((button) => {
    button.addEventListener('click', () => {
      const entry = recentChecks[Number(button.dataset.historyIndex)];
      if (!entry) return;
      input.value = entry.text;
      updateWordCount();
      selectPanel('writing-panel');
      checkWriting();
    });
  });
}

async function loadRecentChecks() {
  try {
    renderRecentChecks(await window.ikmal.getRecentChecks());
    setHistoryNotice('', false);
  } catch (error) {
    setHistoryNotice(error.message || 'Recent checks are unavailable.');
  }
}

function setHealth(element, label, ready) {
  element.classList.toggle('is-ready', ready);
  element.classList.toggle('is-unavailable', !ready);
  label.textContent = ready ? 'Ready' : 'Unavailable';
}

function updateServiceState(state) {
  const ready = state.proxyReady;
  serviceSummary.classList.toggle('is-ready', ready);
  serviceSummary.classList.toggle('is-warning', !ready && state.managerRunning);
  serviceLabel.textContent = ready ? 'Ready' : state.managerRunning ? 'Starting' : 'Stopped';
  document.querySelector('.status-dot').setAttribute('aria-label', ready ? 'Ready' : 'Unavailable');
  setHealth(languageToolStatusDot, languageToolStatusLabel, state.languageToolReady);
  setHealth(qualityStatusDot, qualityStatusLabel, state.qualityReady);
  if (state.proxyUrl) document.querySelector('#proxy-endpoint').textContent = `${state.proxyUrl}/v2`;
  startButton.disabled = state.managerRunning;
  stopButton.disabled = !state.managerRunning;
}

function setStyleGuideStatus(message, error = false) {
  styleGuideStatus.textContent = message;
  styleGuideStatus.classList.toggle('is-error', error);
}

function renderStyleGuideState(state) {
  styleGuideState = state || { guides: [], activeId: '', enabled: false };
  const guides = Array.isArray(styleGuideState.guides) ? styleGuideState.guides : [];
  styleGuideSelect.replaceChildren();
  if (!guides.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No imported guides';
    styleGuideSelect.appendChild(option);
  } else {
    guides.forEach((guide) => {
      const option = document.createElement('option');
      option.value = guide.id;
      option.textContent = `${guide.name} (${guide.entryCount} entr${guide.entryCount === 1 ? 'y' : 'ies'})`;
      styleGuideSelect.appendChild(option);
    });
  }
  styleGuideSelect.disabled = guides.length === 0;
  styleGuideToggle.disabled = !styleGuideState.activeId;
  styleGuideSelect.value = styleGuideState.activeId || '';
  styleGuideToggle.checked = Boolean(styleGuideState.enabled);
  styleGuideCount.textContent = guides.length ? `${guides.length} guide${guides.length === 1 ? '' : 's'} available` : 'No guides imported';
  if (!guides.length) {
    setStyleGuideStatus('Import and select a guide to enable style checks.');
  } else if (!styleGuideState.activeId) {
    setStyleGuideStatus('Choose a guide to make it the default.');
  } else if (styleGuideState.enabled) {
    setStyleGuideStatus('Enabled. Restart services to apply native XML rules.');
  } else {
    setStyleGuideStatus('Selected but disabled.');
  }
}

async function loadStyleGuideState() {
  try {
    renderStyleGuideState(await window.ikmal.getStyleGuideState());
  } catch (error) {
    setStyleGuideStatus(error.message || 'Style-guide settings are unavailable.', true);
  }
}

function displaySource(source) {
  return ({
    'quality-sidecar': 'Quality checks',
    'style-guide-sidecar': 'Style guide',
    transformer: 'Transformer',
  })[source] || source || 'LanguageTool';
}

function renderResults(response, sourceText) {
  const matches = Array.isArray(response.matches) ? response.matches : [];
  const groupedCount = matches.reduce((count, match) => count + (Array.isArray(match.ikmalRelated) ? match.ikmalRelated.length : 0), 0);
  lastResponse = response;
  emptyState.classList.toggle('is-hidden', matches.length > 0);
  summary.textContent = matches.length
    ? `${matches.length} suggestion${matches.length === 1 ? '' : 's'} found${groupedCount ? ` · ${groupedCount} grouped finding${groupedCount === 1 ? '' : 's'}` : ''}`
    : '';
  summary.classList.toggle('is-hidden', matches.length === 0);
  results.querySelectorAll('.result-card').forEach((node) => node.remove());
  matches.forEach((match, index) => {
    const matchedText = sourceText.slice(match.offset || 0, (match.offset || 0) + (match.length || 0));
    const replacement = match.replacements && match.replacements[0] ? match.replacements[0].value : '';
    const source = match.ikmalSource || (match.rule && match.rule.id && match.rule.id.startsWith('IKMAL_') ? 'quality sidecar' : 'LanguageTool');
    const sources = Array.isArray(match.ikmalSources) ? match.ikmalSources : [source];
    const related = Array.isArray(match.ikmalRelated) ? match.ikmalRelated : [];
    const suggestion = replacement
      ? `Replace “${matchedText}” with “${replacement}”`
      : 'Review this wording';
    const relatedMarkup = related.length ? `
      <details class="related-findings">
        <summary>Also flagged by ${escapeHTML(related.map((finding) => displaySource(finding.source)).join(', '))}</summary>
        <div class="related-list">${related.map((finding) => `
          <div class="related-finding">
            <strong>${escapeHTML(displaySource(finding.source))}</strong>
            <span>${escapeHTML(finding.message || 'Related finding.')}</span>
            ${finding.replacement ? `<small>Suggested: ${escapeHTML(finding.replacement)}</small>` : ''}
          </div>`).join('')}
        </div>
      </details>` : '';
    const card = document.createElement('article');
    card.className = 'result-card';
    card.innerHTML = `
      <div class="result-topline">
        <span class="result-category">${escapeHTML(displaySource(source))}${sources.length > 1 ? ` + ${sources.length - 1} related` : ''}</span>
        <span class="result-offset">${match.length || 0} chars</span>
      </div>
      <p class="result-message">${escapeHTML(match.message || 'Review this passage.')}</p>
      <div class="suggestion-chip">
        <span class="chip-label">Suggested change</span>
        <strong>${escapeHTML(suggestion)}</strong>
      </div>
      ${relatedMarkup}
      <button class="result-apply" type="button" data-match-index="${index}" ${replacement ? '' : 'disabled'}>${replacement ? 'Apply suggestion' : 'No direct replacement'}</button>`;
    results.appendChild(card);
  });
  results.querySelectorAll('.result-apply:not(:disabled)').forEach((button) => {
    button.addEventListener('click', () => applySuggestion(Number(button.dataset.matchIndex)));
  });
}

function applySuggestion(index) {
  const match = lastResponse.matches && lastResponse.matches[index];
  const replacement = match && match.replacements && match.replacements[0] ? match.replacements[0].value : '';
  if (!match || !replacement) return;
  input.setRangeText(replacement, match.offset, match.offset + match.length, 'end');
  updateWordCount();
  checkWriting();
}

async function checkWriting() {
  const text = input.value;
  if (!text.trim()) {
    setNotice('Write or paste some text first.');
    return;
  }
  setNotice('Checking locally…');
  checkButton.disabled = true;
  try {
    const response = await window.ikmal.checkText(text);
    renderResults(response, text);
    setNotice(response.matches && response.matches.length ? 'Review the suggestions below.' : 'No suggestions for this passage.', true);
  } catch (error) {
    setNotice(error.message || 'The writing service is unavailable.');
  } finally {
    checkButton.disabled = false;
  }
}

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => selectPanel(tab.dataset.panel));
});

input.addEventListener('input', updateWordCount);
checkButton.addEventListener('click', checkWriting);
clearButton.addEventListener('click', () => {
  input.value = '';
  lastResponse = { matches: [] };
  renderResults(lastResponse, '');
  setNotice('', false);
  updateWordCount();
  input.focus();
});
document.querySelector('#sample-button').addEventListener('click', () => { input.value = sampleText; updateWordCount(); input.focus(); });
startButton.addEventListener('click', () => window.ikmal.startServices().then(updateServiceState));
stopButton.addEventListener('click', () => window.ikmal.stopServices().then(updateServiceState));
clearHistoryButton.addEventListener('click', async () => {
  try {
    renderRecentChecks(await window.ikmal.clearRecentChecks());
    setHistoryNotice('Recent checks cleared.');
  } catch (error) {
    setHistoryNotice(error.message || 'Could not clear recent checks.');
  }
});
document.querySelector('#launch-toggle').addEventListener('change', (event) => window.ikmal.setLaunchAtLogin(event.target.checked));
refreshStyleGuidesButton.addEventListener('click', loadStyleGuideState);
styleGuideSelect.addEventListener('change', async (event) => {
  if (!event.target.value) return;
  styleGuideSelect.disabled = true;
  setStyleGuideStatus('Selecting guide…');
  try {
    renderStyleGuideState(await window.ikmal.selectStyleGuide(event.target.value));
  } catch (error) {
    setStyleGuideStatus(error.message || 'Could not select that guide.', true);
    await loadStyleGuideState();
  }
});
styleGuideToggle.addEventListener('change', async (event) => {
  styleGuideToggle.disabled = true;
  setStyleGuideStatus(event.target.checked ? 'Enabling guide…' : 'Disabling guide…');
  try {
    renderStyleGuideState(await window.ikmal.setStyleGuideEnabled(event.target.checked));
  } catch (error) {
    setStyleGuideStatus(error.message || 'Could not update that guide.', true);
    await loadStyleGuideState();
  }
});
input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    checkWriting();
  }
});
window.ikmal.onServiceState(updateServiceState);
window.ikmal.onServiceError((message) => setNotice(message));
window.ikmal.onQuickCheck((text) => {
  input.value = text;
  updateWordCount();
  selectPanel('writing-panel');
  checkWriting();
});
window.ikmal.onShowHistory(() => selectPanel('history-panel'));
window.ikmal.getServiceState().then(updateServiceState);
window.ikmal.getLaunchAtLogin().then((enabled) => { document.querySelector('#launch-toggle').checked = enabled; });
loadStyleGuideState();
loadRecentChecks();
updateWordCount();
