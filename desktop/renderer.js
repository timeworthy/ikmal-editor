const input = document.querySelector('#writing-input');
const results = document.querySelector('#results');
const emptyState = document.querySelector('#empty-state');
const notice = document.querySelector('#writing-notice');
const wordCount = document.querySelector('#word-count');
const serviceLabel = document.querySelector('#service-label');
const serviceSummary = document.querySelector('#service-summary');
const startButton = document.querySelector('#start-button');
const stopButton = document.querySelector('#stop-button');

const sampleText = 'Plants, by comparison, produces its own light. The method is different. The result shows a difference.';

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

function updateServiceState(state) {
  const ready = state.proxyReady;
  serviceSummary.classList.toggle('is-ready', ready);
  serviceSummary.classList.toggle('is-warning', !ready && state.managerRunning);
  serviceLabel.textContent = ready ? 'Ready' : state.managerRunning ? 'Starting' : 'Stopped';
  document.querySelector('.status-dot').setAttribute('aria-label', ready ? 'Ready' : 'Unavailable');
  if (state.proxyUrl) document.querySelector('#proxy-endpoint').textContent = state.proxyUrl;
  startButton.disabled = state.managerRunning;
  stopButton.disabled = !state.managerRunning;
}

function renderResults(response) {
  const matches = Array.isArray(response.matches) ? response.matches : [];
  emptyState.classList.toggle('is-hidden', matches.length > 0);
  results.querySelectorAll('.result-card').forEach((node) => node.remove());
  matches.forEach((match) => {
    const replacement = match.replacements && match.replacements[0] ? match.replacements[0].value : '';
    const source = match.ikmalSource || (match.rule && match.rule.id && match.rule.id.startsWith('IKMAL_') ? 'quality sidecar' : 'LanguageTool');
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
        <strong>${replacement ? escapeHTML(replacement) : 'Review wording'}</strong>
      </div>`;
    results.appendChild(card);
  });
}

async function checkWriting() {
  const text = input.value.trim();
  if (!text) {
    setNotice('Write or paste some text first.');
    return;
  }
  setNotice('Checking locally…');
  document.querySelector('#check-button').disabled = true;
  try {
    const response = await window.ikmal.checkText(text);
    renderResults(response);
    setNotice(response.matches && response.matches.length ? 'Review the suggestions below.' : 'No suggestions for this passage.', true);
  } catch (error) {
    setNotice(error.message || 'The writing service is unavailable.');
  } finally {
    document.querySelector('#check-button').disabled = false;
  }
}

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((candidate) => candidate.classList.toggle('is-active', candidate === tab));
    document.querySelectorAll('.panel').forEach((panel) => panel.classList.toggle('is-active', panel.id === tab.dataset.panel));
  });
});

input.addEventListener('input', updateWordCount);
document.querySelector('#check-button').addEventListener('click', checkWriting);
document.querySelector('#sample-button').addEventListener('click', () => { input.value = sampleText; updateWordCount(); input.focus(); });
startButton.addEventListener('click', () => window.ikmal.startServices().then(updateServiceState));
stopButton.addEventListener('click', () => window.ikmal.stopServices().then(updateServiceState));
document.querySelector('#launch-toggle').addEventListener('change', (event) => window.ikmal.setLaunchAtLogin(event.target.checked));
window.ikmal.onServiceState(updateServiceState);
window.ikmal.onServiceError((message) => setNotice(message));
window.ikmal.getServiceState().then(updateServiceState);
window.ikmal.getLaunchAtLogin().then((enabled) => { document.querySelector('#launch-toggle').checked = enabled; });
updateWordCount();
