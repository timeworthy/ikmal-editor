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

const sampleText = 'Plants, by comparison, produce their own food. The method is different. The result shows a difference.';
let lastResponse = { matches: [] };

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

function renderResults(response, sourceText) {
  const matches = Array.isArray(response.matches) ? response.matches : [];
  lastResponse = response;
  emptyState.classList.toggle('is-hidden', matches.length > 0);
  summary.textContent = matches.length ? `${matches.length} suggestion${matches.length === 1 ? '' : 's'} found` : '';
  summary.classList.toggle('is-hidden', matches.length === 0);
  results.querySelectorAll('.result-card').forEach((node) => node.remove());
  matches.forEach((match, index) => {
    const matchedText = sourceText.slice(match.offset || 0, (match.offset || 0) + (match.length || 0));
    const replacement = match.replacements && match.replacements[0] ? match.replacements[0].value : '';
    const source = match.ikmalSource || (match.rule && match.rule.id && match.rule.id.startsWith('IKMAL_') ? 'quality sidecar' : 'LanguageTool');
    const suggestion = replacement
      ? `Replace “${matchedText}” with “${replacement}”`
      : 'Review this wording';
    const card = document.createElement('article');
    card.className = 'result-card';
    card.innerHTML = `
      <div class="result-topline">
        <span class="result-category">${escapeHTML(source)}</span>
        <span class="result-offset">${match.length || 0} chars</span>
      </div>
      <p class="result-message">${escapeHTML(match.message || 'Review this passage.')}</p>
      <div class="suggestion-chip">
        <span class="chip-label">Suggested change</span>
        <strong>${escapeHTML(suggestion)}</strong>
      </div>
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
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((candidate) => candidate.classList.toggle('is-active', candidate === tab));
    document.querySelectorAll('.panel').forEach((panel) => panel.classList.toggle('is-active', panel.id === tab.dataset.panel));
  });
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
document.querySelector('#launch-toggle').addEventListener('change', (event) => window.ikmal.setLaunchAtLogin(event.target.checked));
input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    checkWriting();
  }
});
window.ikmal.onServiceState(updateServiceState);
window.ikmal.onServiceError((message) => setNotice(message));
window.ikmal.getServiceState().then(updateServiceState);
window.ikmal.getLaunchAtLogin().then((enabled) => { document.querySelector('#launch-toggle').checked = enabled; });
updateWordCount();
