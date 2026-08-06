document.documentElement.dataset.platform = window.ikmal.platform;

const editorInput = document.querySelector('#editor-input');
const editorCheckButton = document.querySelector('#editor-check');
const editorCopyButton = document.querySelector('#editor-copy');
const editorSuggestions = document.querySelector('#editor-suggestions');
const editorSuggestionCount = document.querySelector('#editor-suggestion-count');
const editorDocumentMeta = document.querySelector('#editor-document-meta');
const editorCount = document.querySelector('#editor-count');
const editorNotice = document.querySelector('#editor-notice');
const editorNoticeSurface = window.IkmalNoticeSurface.attach(editorNotice);
const editorStyleGuide = document.querySelector('#editor-style-guide');
const editorStyleGuideEnabled = document.querySelector('#editor-style-guide-enabled');
const editorStyleCount = document.querySelector('#editor-style-count');
const editorServiceDot = document.querySelector('#editor-service-dot');
const editorServiceLabel = document.querySelector('#editor-service-label');
const editorSettingsView = document.querySelector('#editor-settings-view');
const editorCanvas = document.querySelector('.pro-canvas');
const editorBackButton = document.querySelector('#editor-back');
const editorStartServicesButton = document.querySelector('#editor-start-services');
const editorStopServicesButton = document.querySelector('#editor-stop-services');
const editorImportStyleGuideButton = document.querySelector('#editor-import-style-guide');
const editorRecentSessions = document.querySelector('#editor-recent-sessions');
const editorMenuTrigger = document.querySelector('#editor-menu-trigger');
const editorAppMenu = document.querySelector('#editor-app-menu');
const editorWritingStatus = document.querySelector('#editor-writing-status');
const editorWritingStatusLabel = document.querySelector('#editor-writing-status-label');
const editorWritingStatusAction = document.querySelector('#editor-writing-status-action');
const editorMenubarToggle = document.querySelector('#editor-menubar-toggle');
const editorDockToggle = document.querySelector('#editor-dock-toggle');
const editorPresenceNotice = document.querySelector('#editor-presence-notice');
const editorAnnotationIndicatorStyle = document.querySelector('#editor-annotation-indicator-style');
const editorAnnotationPalette = document.querySelector('#editor-annotation-palette');
const editorAnnotationIntensity = document.querySelector('#editor-annotation-intensity');
const editorAnnotationIntensityValue = document.querySelector('#editor-annotation-intensity-value');
const editorCheckingMode = document.querySelector('#editor-checking-mode');
const editorCheckingDelay = document.querySelector('#editor-checking-delay');
const editorCheckingDelayValue = document.querySelector('#editor-checking-delay-value');
const editorCheckingSensitivity = document.querySelector('#editor-checking-sensitivity');
const editorCheckingSensitivityValue = document.querySelector('#editor-checking-sensitivity-value');
const editorCheckingCategoryInputs = {
  grammar: document.querySelector('#editor-checking-category-grammar'),
  repetition: document.querySelector('#editor-checking-category-repetition'),
  style: document.querySelector('#editor-checking-category-style'),
  languagetool: document.querySelector('#editor-checking-category-languagetool'),
};
const editorAnnotationSurface = window.IkmalAnnotationSurface.attach({
  input: editorInput,
  highlights: document.querySelector('#editor-highlights'),
  popover: document.querySelector('#editor-popover'),
  getResponse: () => lastResponse,
  displaySource,
  onApply: (index) => applySuggestion(index),
  onIgnore: (index) => {
    ignoredMatches.add(index);
    renderSuggestions(lastResponse);
  },
  onInvalidate: () => clearStaleSuggestions(),
});
const editorAnnotationControls = window.IkmalAnnotationPreferences.bindControls({
  style: editorAnnotationIndicatorStyle,
  palette: editorAnnotationPalette,
  intensity: editorAnnotationIntensity,
  output: editorAnnotationIntensityValue,
  onChange: async (preferences) => {
    try {
      editorAnnotationControls.apply(await window.ikmal.setAnnotationPreferences(preferences));
    } catch (error) {
      showFailureNotice(error.message || 'Could not save highlighting preferences.', { details: error.stack || error.message });
    }
  },
});

let lastResponse = { matches: [] };
let rawResponse = { matches: [] };
let checkingPreferences = { mode: 'automatic', delay: 700, sensitivity: 55, categories: { grammar: true, repetition: true, style: true, languagetool: true } };
let ignoredMatches = new Set();
let checkTimer;
let checkGeneration = 0;
let editorStatusAnimationFrame;

function escapeHTML(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function displaySource(source) {
  return ({
    'quality-sidecar': 'Quality checks',
    'style-guide-sidecar': 'Style guide',
    transformer: 'Transformer',
  })[source] || source || 'LanguageTool';
}

function sourceClass(match) {
  const source = String(match.ikmalSource || '').toLowerCase();
  const category = String(match.rule?.category?.id || match.category || '').toLowerCase();
  if (source.includes('style') || category.includes('style')) return 'style';
  if (source.includes('quality') || category.includes('grammar') || category.includes('agreement')) return 'g';
  return '';
}

function checkingCategory(match) {
  const source = String(match.ikmalSource || '').toLowerCase();
  const rule = String(match.rule?.id || '').toLowerCase();
  const description = String(match.rule?.description || match.rule?.category?.id || match.category || '').toLowerCase();
  if (rule.includes('repetition') || rule.includes('word-family') || rule.includes('echo') || description.includes('repetition') || description.includes('echo')) return 'repetition';
  if (source.includes('style') || rule.includes('style-guide') || description.includes('style')) return 'style';
  if (source.includes('quality') || description.includes('grammar') || description.includes('agreement') || rule.includes('pronoun') || rule.includes('verb')) return 'grammar';
  return 'languagetool';
}

function filteredResponse(response) {
  const value = response || { matches: [] };
  const threshold = 0.9 - (checkingPreferences.sensitivity / 100) * 0.4;
  const matches = Array.isArray(value.matches) ? value.matches.filter((match) => {
    const confidence = Number(match.ikmalConfidence ?? match.confidence ?? 1);
    return checkingPreferences.categories[checkingCategory(match)] !== false && (!Number.isFinite(confidence) || confidence >= threshold);
  }) : [];
  return { ...value, matches };
}

function renderCheckingPreferences(preferences) {
  const sensitivity = Number(preferences?.sensitivity);
  checkingPreferences = {
    mode: preferences?.mode === 'manual' ? 'manual' : 'automatic',
    delay: Math.max(200, Math.min(2000, Number(preferences?.delay) || 700)),
    sensitivity: Number.isFinite(sensitivity) ? Math.max(0, Math.min(100, sensitivity)) : 55,
    categories: { ...checkingPreferences.categories, ...(preferences?.categories || {}) },
  };
  editorCheckingMode.value = checkingPreferences.mode;
  editorCheckingDelay.value = String(checkingPreferences.delay);
  editorCheckingDelayValue.textContent = `${checkingPreferences.delay} ms`;
  editorCheckingSensitivity.value = String(checkingPreferences.sensitivity);
  editorCheckingSensitivityValue.textContent = `${checkingPreferences.sensitivity}%`;
  Object.entries(editorCheckingCategoryInputs).forEach(([category, control]) => { control.checked = checkingPreferences.categories[category] !== false; });
}

async function updateCheckingPreferences() {
  try {
    const preferences = await window.ikmal.setCheckingPreferences({
      mode: editorCheckingMode.value,
      delay: Number(editorCheckingDelay.value),
      sensitivity: Number(editorCheckingSensitivity.value),
      categories: Object.fromEntries(Object.entries(editorCheckingCategoryInputs).map(([category, control]) => [category, control.checked])),
    });
    renderCheckingPreferences(preferences);
    renderSuggestions(rawResponse);
    if (checkingPreferences.mode === 'manual') setEditorWritingStatus('good', editorInput.value.trim() ? 'Ready to check' : 'Ready when you are');
    else if (editorInput.value.trim()) scheduleCheck();
  } catch (error) {
    setNotice(error.message || 'Could not save checking preferences.');
  }
}

function setNotice(message, error = false) {
  if (!message) {
    editorNoticeSurface.hide();
    return;
  }
  editorNoticeSurface.show({ message, error });
}

function showFailureNotice(message, { retry, cancel, cancelLabel = 'Cancel', continueLabel = 'Continue', details = '' } = {}) {
  const actions = [];
  if (retry) actions.push({ label: 'Retry', kind: 'primary', onClick: retry });
  if (cancel) actions.push({ label: cancelLabel, onClick: cancel });
  else actions.push({ label: continueLabel, onClick: () => {} });
  editorNoticeSurface.show({ message, error: true, details, actions });
}

function setEditorWritingStatus(kind, label, actionable = false, detail = label) {
  editorWritingStatus.className = `writing-status is-${kind}`;
  cancelAnimationFrame(editorStatusAnimationFrame);
  editorStatusAnimationFrame = requestAnimationFrame(() => editorWritingStatus.classList.add('is-settling'));
  editorWritingStatusLabel.textContent = label;
  editorWritingStatus.setAttribute('aria-label', detail);
  editorWritingStatusAction.disabled = !actionable;
  editorWritingStatusAction.textContent = document.querySelector('.pro').classList.contains('suggestions-open')
    ? 'Close suggestions'
    : 'Open suggestions';
  editorWritingStatusAction.setAttribute('aria-expanded', String(document.querySelector('.pro').classList.contains('suggestions-open')));
  editorWritingStatusAction.setAttribute('aria-label', editorWritingStatusAction.textContent);
}

function updateEditorMeta() {
  const text = editorInput.value.trim();
  const words = text ? text.split(/\s+/).length : 0;
  const characters = editorInput.value.length;
  editorDocumentMeta.textContent = 'not saved';
  editorCount.textContent = `${words} word${words === 1 ? '' : 's'} · ${characters} character${characters === 1 ? '' : 's'} · ${lastResponse.matches?.length || 0} suggestion${lastResponse.matches?.length === 1 ? '' : 's'}`;
}

function issueType(match) {
  const kind = sourceClass(match);
  return kind === 'g' ? 'Grammar' : kind === 'style' ? 'Style' : 'LanguageTool';
}

function issueSummary(matches) {
  const counts = new Map();
  matches.forEach((match) => counts.set(issueType(match), (counts.get(issueType(match)) || 0) + 1));
  return [...counts.entries()].map(([type, count]) => `${count} ${type.toLowerCase()}`).join(' · ');
}

function selectMatch(match) {
  const start = Number(match.offset) || 0;
  const end = start + (Number(match.length) || 0);
  editorInput.focus();
  editorInput.setSelectionRange(start, end);
  editorSuggestions.querySelectorAll('.pro-sug').forEach((card) => card.classList.remove('is-selected'));
  const card = editorSuggestions.querySelector(`[data-match-index="${match.__index}"]`);
  if (card) card.classList.add('is-selected');
}

function renderSuggestions(response) {
  response = filteredResponse(response);
  lastResponse = response || { matches: [] };
  editorAnnotationSurface.render(lastResponse, editorInput.value, ignoredMatches);
  const matches = Array.isArray(lastResponse.matches) ? lastResponse.matches : [];
  const visibleMatches = matches.filter((_, index) => !ignoredMatches.has(index));
  editorSuggestionCount.textContent = String(visibleMatches.length);
  if (!visibleMatches.length) setEditorSuggestionsOpen(false);
  setEditorWritingStatus(
    visibleMatches.length ? 'warning' : 'good',
    visibleMatches.length ? `${visibleMatches.length} to review` : 'No issues detected',
    visibleMatches.length > 0,
    visibleMatches.length ? issueSummary(visibleMatches) : 'No issues detected',
  );
  editorSuggestions.replaceChildren();
  if (!visibleMatches.length) {
    const empty = document.createElement('div');
    empty.className = 'pro-empty';
    empty.innerHTML = matches.length ? '<span>✓</span><p>All suggestions reviewed.</p><small>Check again to restore ignored findings.</small>' : '<span>✦</span><p>No suggestions yet.</p><small>Check again when you are ready.</small>';
    editorSuggestions.appendChild(empty);
    updateEditorMeta();
    return;
  }
  visibleMatches.forEach((match) => {
    const index = matches.indexOf(match);
    const matchedText = editorInput.value.slice(match.offset || 0, (match.offset || 0) + (match.length || 0));
    const replacement = match.replacements?.[0]?.value || '';
    const source = match.ikmalSource || (match.rule?.id?.startsWith('IKMAL_') ? 'quality-sidecar' : 'LanguageTool');
    const sources = Array.isArray(match.ikmalSources) ? match.ikmalSources : [source];
    const related = Array.isArray(match.ikmalRelated) ? match.ikmalRelated : [];
    const card = document.createElement('article');
    card.className = `pro-sug ${sourceClass(match)}`;
    card.dataset.matchIndex = String(index);
    const sourceLabel = `${displaySource(source)}${sources.length > 1 ? ` + ${sources.length - 1} related` : ''}`;
    card.innerHTML = `
      <div class="pro-sug-top"><span class="pro-sug-src">${escapeHTML(sourceLabel)}</span><em>${related.length ? `${related.length + 1} findings` : 'ikmal'}</em></div>
      <p>${escapeHTML(match.message || 'Review this passage.')}</p>
      ${replacement ? `<div class="pro-swap"><del>${escapeHTML(matchedText)}</del><span>→</span><ins>${escapeHTML(replacement)}</ins></div>` : ''}
      <div class="pro-sug-act">
        <button class="pro-btn pri" type="button" data-action="apply" ${replacement ? '' : 'disabled'}>Apply</button>
        <button class="pro-btn ghost" type="button" data-action="ignore">Ignore</button>
        <button class="pro-btn ghost" type="button" data-action="rule">Rule</button>
      </div>`;
    card.addEventListener('click', (event) => {
      const action = event.target.closest('[data-action]')?.dataset.action;
      if (action === 'apply') {
        applySuggestion(index);
        return;
      }
      if (action === 'ignore') {
        ignoredMatches.add(index);
        renderSuggestions(lastResponse);
        setNotice('Suggestion ignored for this check. Check again to review it again.');
        return;
      }
      if (action === 'rule') {
        setNotice('Rule controls are available in Settings. This suggestion was not changed.');
        return;
      }
      selectMatch({ ...match, __index: index });
    });
    editorSuggestions.appendChild(card);
  });
  updateEditorMeta();
}

function applySuggestion(index) {
  const match = lastResponse.matches?.[index];
  const replacement = match?.replacements?.[0]?.value || '';
  if (!match || !replacement) return;
  editorInput.setRangeText(replacement, match.offset, match.offset + match.length, 'end');
  ignoredMatches = new Set();
  updateEditorMeta();
  checkWriting();
}

function clearStaleSuggestions() {
  rawResponse = { matches: [] };
  lastResponse = { matches: [] };
  ignoredMatches = new Set();
  editorSuggestionCount.textContent = '0';
  editorSuggestions.innerHTML = '<div class="pro-empty"><span>…</span><p>Checking current text…</p><small>Suggestions will return when this check finishes.</small></div>';
  updateEditorMeta();
}

async function checkWriting() {
  clearTimeout(checkTimer);
  if (!editorAnnotationSurface.isCurrent()) clearStaleSuggestions();
  const generation = ++checkGeneration;
  const text = editorInput.value;
  if (!text.trim()) {
    setEditorWritingStatus('good', 'Ready when you are');
    setNotice('', false);
    editorCheckButton.disabled = false;
    return;
  }
  editorCheckButton.disabled = true;
  setEditorWritingStatus('checking', 'Checking…');
  setNotice('', false);
  try {
    const response = await window.ikmal.checkText(text);
    if (generation !== checkGeneration) return;
    rawResponse = response || { matches: [] };
    ignoredMatches = new Set();
    renderSuggestions(rawResponse);
    loadRecentSessions();
  } catch (error) {
    if (generation !== checkGeneration) return;
    setEditorWritingStatus('error', 'Check unavailable');
    showFailureNotice(error.message || 'The writing service is unavailable.', {
      retry: () => checkWriting(),
      cancel: () => setEditorWritingStatus('good', 'Ready when you are'),
      cancelLabel: 'Keep editing',
      details: error.stack || error.message,
    });
  } finally {
    if (generation === checkGeneration || !editorInput.value.trim()) editorCheckButton.disabled = false;
    if (generation === checkGeneration) updateEditorMeta();
  }
}

function scheduleCheck() {
  clearTimeout(checkTimer);
  checkGeneration += 1;
  if (!editorInput.value.trim()) {
    rawResponse = { matches: [] };
    lastResponse = { matches: [] };
    renderSuggestions(lastResponse);
    setEditorWritingStatus('good', 'Ready when you are');
    setNotice('', false);
    editorCheckButton.disabled = false;
    return;
  }
  if (checkingPreferences.mode === 'manual') {
    setEditorWritingStatus('good', 'Ready to check');
    setNotice('', false);
    return;
  }
  setEditorWritingStatus('checking', 'Waiting to check…');
  setNotice('', false);
  checkTimer = setTimeout(() => checkWriting(), checkingPreferences.delay);
}

function updateServiceState(state) {
  const ready = Boolean(state?.proxyReady);
  const allServicesReady = Boolean(state?.languageToolReady && state?.proxyReady && state?.qualityReady);
  editorServiceDot.classList.toggle('is-ready', ready);
  editorServiceDot.classList.toggle('is-unavailable', !ready);
  editorServiceLabel.textContent = allServicesReady ? (state?.managerRunning ? 'Ready · managed' : 'Ready · existing') : ready ? 'Enhancer ready' : state?.managerRunning ? 'Starting services…' : 'Services unavailable';
  editorStartServicesButton.disabled = Boolean(state?.managerRunning || allServicesReady);
  editorStartServicesButton.textContent = allServicesReady ? 'Already running' : state?.managerRunning ? 'Starting…' : 'Start services';
  editorStartServicesButton.classList.toggle('button-primary', !allServicesReady);
  editorStartServicesButton.classList.toggle('button-quiet', allServicesReady);
  editorStopServicesButton.disabled = !state?.managerRunning;
}

async function loadStyleGuides() {
  try {
    const state = await window.ikmal.getStyleGuideState();
    const guides = Array.isArray(state?.guides) ? state.guides : [];
    editorStyleGuide.replaceChildren();
    guides.forEach((guide) => {
      const option = document.createElement('option');
      option.value = guide.id;
      option.textContent = guide.name;
      editorStyleGuide.appendChild(option);
    });
    if (!guides.length) {
      editorStyleGuide.innerHTML = '<option value="">None selected</option>';
    }
    editorStyleGuide.disabled = !guides.length;
    editorStyleGuide.value = state?.activeId || '';
    editorStyleGuideEnabled.disabled = !state?.activeId;
    editorStyleGuideEnabled.checked = Boolean(state?.enabled);
    editorStyleCount.textContent = state?.enabled && state?.activeId ? 'on' : guides.length ? 'available' : 'off';
  } catch (error) {
    editorStyleGuide.disabled = true;
    editorStyleCount.textContent = 'unavailable';
    showFailureNotice(error.message || 'Style-guide state is unavailable.', {
      retry: () => loadStyleGuides(),
      details: error.stack || error.message,
    });
  }
}

async function loadRecentSessions() {
  try {
    const entries = await window.ikmal.getRecentChecks();
    editorRecentSessions.replaceChildren();
    if (!entries.length) {
      editorRecentSessions.innerHTML = '<small>No recent checks.</small>';
      return;
    }
    entries.slice(0, 8).forEach((entry) => {
      const button = document.createElement('button');
      button.className = 'pro-session';
      button.type = 'button';
      const preview = String(entry.text || '').replace(/\s+/g, ' ').trim();
      const count = Number(entry.matchCount) || 0;
      button.innerHTML = `<strong>${escapeHTML(preview.length > 34 ? `${preview.slice(0, 31)}…` : preview)}</strong><small>${count} suggestion${count === 1 ? '' : 's'}</small>`;
      button.addEventListener('click', () => {
        showEditorSettings(false);
        editorInput.value = entry.text || '';
        ignoredMatches = new Set();
        renderSuggestions({ matches: [] });
        updateEditorMeta();
        if (editorInput.value.trim()) checkWriting();
      });
      editorRecentSessions.appendChild(button);
    });
  } catch (_) {
    editorRecentSessions.innerHTML = '<small>Recent checks unavailable.</small>';
  }
}

editorInput.addEventListener('input', () => { updateEditorMeta(); scheduleCheck(); });
editorInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    checkWriting();
  }
});
editorCheckButton.addEventListener('click', checkWriting);
editorCheckingMode.addEventListener('change', updateCheckingPreferences);
editorCheckingDelay.addEventListener('input', () => { editorCheckingDelayValue.textContent = `${editorCheckingDelay.value} ms`; });
editorCheckingDelay.addEventListener('change', updateCheckingPreferences);
editorCheckingSensitivity.addEventListener('input', () => { editorCheckingSensitivityValue.textContent = `${editorCheckingSensitivity.value}%`; });
editorCheckingSensitivity.addEventListener('change', updateCheckingPreferences);
Object.values(editorCheckingCategoryInputs).forEach((control) => control.addEventListener('change', updateCheckingPreferences));
async function copyEditorText() {
  try {
    await navigator.clipboard.writeText(editorInput.value);
    setNotice('Corrected text copied from the scratch pad.');
  } catch (error) {
    showFailureNotice('Could not copy the text.', {
      retry: () => copyEditorText(),
      details: error.stack || error.message || 'Clipboard access was unavailable.',
    });
  }
}
editorCopyButton.addEventListener('click', copyEditorText);
editorStyleGuide.addEventListener('change', async (event) => {
  if (!event.target.value) return;
  editorStyleGuide.disabled = true;
  try {
    await window.ikmal.selectStyleGuide(event.target.value);
    editorStyleCount.textContent = 'selected';
    setNotice('Style guide selected. Enable it in Settings if you want it active.');
  } catch (error) {
    showFailureNotice(error.message || 'Could not select that style guide.', {
      retry: () => window.ikmal.selectStyleGuide(event.target.value).then(() => loadStyleGuides()),
      details: error.stack || error.message,
    });
  } finally {
    editorStyleGuide.disabled = false;
  }
});
editorStyleGuideEnabled.addEventListener('change', async (event) => {
  editorStyleGuideEnabled.disabled = true;
  try {
    const state = await window.ikmal.setStyleGuideEnabled(event.target.checked);
    editorStyleGuideEnabled.checked = Boolean(state?.enabled);
    editorStyleCount.textContent = state?.enabled ? 'on' : 'off';
    setNotice(state?.enabled ? 'Style guide checks enabled.' : 'Style guide checks disabled.');
  } catch (error) {
    editorStyleGuideEnabled.checked = !event.target.checked;
    showFailureNotice(error.message || 'Could not update style-guide setting.', {
      retry: () => window.ikmal.setStyleGuideEnabled(event.target.checked),
      details: error.stack || error.message,
    });
  } finally {
    editorStyleGuideEnabled.disabled = !editorStyleGuide.value;
  }
});
editorImportStyleGuideButton.addEventListener('click', async () => {
  editorImportStyleGuideButton.disabled = true;
  try {
    const result = await window.ikmal.importStyleGuide();
    if (!result?.canceled) {
      await loadStyleGuides();
      setNotice('Style guide imported. Review and enable it in Settings when ready.');
    }
  } catch (error) {
    showFailureNotice(error.message || 'Could not import that style guide.', {
      retry: () => editorImportStyleGuideButton.click(),
      details: error.stack || error.message,
    });
  } finally {
    editorImportStyleGuideButton.disabled = false;
  }
});
function showEditorSettings(show) {
  document.querySelector('.pro').classList.toggle('settings-open', show);
  if (show) {
    setEditorSuggestionsOpen(false);
  }
  editorSettingsView.classList.toggle('is-hidden', !show);
  editorCanvas.classList.toggle('is-hidden', show);
  document.querySelector('.pro-top').classList.toggle('is-hidden', show);
}
function setEditorSuggestionsOpen(open) {
  const next = Boolean(open);
  document.querySelector('.pro').classList.toggle('suggestions-open', next);
  editorWritingStatusAction.textContent = next ? 'Close suggestions' : 'Open suggestions';
  editorWritingStatusAction.setAttribute('aria-expanded', String(next));
  editorWritingStatusAction.setAttribute('aria-label', editorWritingStatusAction.textContent);
  if (next) editorWritingStatusAction.disabled = false;
}
function setEditorPresenceNotice(message) {
  editorPresenceNotice.textContent = message || '';
  editorPresenceNotice.classList.toggle('is-hidden', !message);
}
function renderEditorPresence(state) {
  editorMenubarToggle.checked = Boolean(state?.menubarIcon);
  editorDockToggle.checked = Boolean(state?.dockIcon);
  editorDockToggle.disabled = state?.dockSupported === false;
  if (state?.dockSupported === false) setEditorPresenceNotice('Dock visibility is managed by the operating system on this platform.');
}
async function updateEditorPresence() {
  try {
    const state = await window.ikmal.setDesktopPresence({ menubarIcon: editorMenubarToggle.checked, dockIcon: editorDockToggle.checked });
    renderEditorPresence(state);
    setEditorPresenceNotice(state?.notice || '');
  } catch (error) {
    setEditorPresenceNotice(error.message || 'Could not update app access settings.');
    window.ikmal.getDesktopPresence().then(renderEditorPresence).catch(() => {});
  }
}
editorWritingStatusAction.addEventListener('click', () => {
  setEditorSuggestionsOpen(!document.querySelector('.pro').classList.contains('suggestions-open'));
});
editorMenubarToggle.addEventListener('change', updateEditorPresence);
editorDockToggle.addEventListener('change', updateEditorPresence);
function closeEditorMenu() {
  editorAppMenu.classList.remove('is-open');
  editorMenuTrigger.setAttribute('aria-expanded', 'false');
}
editorMenuTrigger.addEventListener('click', (event) => {
  event.stopPropagation();
  const open = !editorAppMenu.classList.contains('is-open');
  editorAppMenu.classList.toggle('is-open', open);
  editorMenuTrigger.setAttribute('aria-expanded', String(open));
});
document.addEventListener('mousedown', (event) => {
  if (!editorAppMenu.contains(event.target) && !editorMenuTrigger.contains(event.target)) closeEditorMenu();
}, true);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeEditorMenu();
  if (event.key === ',' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    showEditorSettings(true);
  }
});
document.querySelectorAll('[data-editor-menu]').forEach((button) => {
  button.addEventListener('click', () => {
    closeEditorMenu();
    if (button.dataset.editorMenu === 'settings') {
      showEditorSettings(true);
      loadStyleGuides();
    } else if (button.dataset.editorMenu === 'compact') {
      window.ikmal.openCompact();
    }
  });
});
document.querySelectorAll('[data-editor-nav]').forEach((button) => {
  button.addEventListener('click', () => {
    const action = button.dataset.editorNav;
    if (action === 'editor') {
      showEditorSettings(false);
      editorInput.focus();
    } else if (action === 'style') {
      showEditorSettings(true);
      editorStyleGuide.focus();
      setNotice('Choose an imported style guide above. It remains optional until enabled in Settings.');
    } else if (action === 'recent') {
      setNotice('Recent checks are available from the compact window. The scratch pad itself is never saved.');
    } else {
      setNotice('These rule packs are active through the same checking service.');
    }
  });
});
editorBackButton.addEventListener('click', () => {
  showEditorSettings(false);
  editorInput.focus();
});
async function startEditorServices() {
  editorStartServicesButton.disabled = true;
  try {
    updateServiceState(await window.ikmal.startServices());
    setNotice('Local services are starting.');
  } catch (error) {
    showFailureNotice(error.message || 'Could not start services.', {
      retry: () => startEditorServices(),
      details: error.stack || error.message,
    });
  } finally {
    editorStartServicesButton.disabled = false;
  }
}
editorStartServicesButton.addEventListener('click', startEditorServices);
async function stopEditorServices() {
  editorStopServicesButton.disabled = true;
  try {
    updateServiceState(await window.ikmal.stopServices());
    setNotice('Local services stopped.');
  } catch (error) {
    showFailureNotice(error.message || 'Could not stop services.', {
      retry: () => stopEditorServices(),
      details: error.stack || error.message,
    });
  } finally {
    editorStopServicesButton.disabled = false;
  }
}
editorStopServicesButton.addEventListener('click', stopEditorServices);

window.ikmal.onServiceState(updateServiceState);
window.ikmal.onServiceError((message) => showFailureNotice(message, {
  retry: () => window.ikmal.getServiceState().then(updateServiceState),
  details: message,
}));
window.ikmal.onEditorText((text) => {
  if (typeof text !== 'string') return;
  editorInput.value = text;
  ignoredMatches = new Set();
  rawResponse = { matches: [] };
  lastResponse = { matches: [] };
  renderSuggestions(lastResponse);
  updateEditorMeta();
  if (text.trim()) checkWriting();
  else editorInput.focus();
});
window.ikmal.getServiceState().then(updateServiceState).catch((error) => showFailureNotice('Could not read service status.', {
  retry: () => window.ikmal.getServiceState().then(updateServiceState),
  details: error.stack || error.message,
}));
window.ikmal.getDesktopPresence().then(renderEditorPresence).catch(() => setEditorPresenceNotice('Could not read app access settings.'));
window.ikmal.getAnnotationPreferences().then((preferences) => editorAnnotationControls.apply(preferences)).catch(() => editorAnnotationControls.apply(window.IkmalAnnotationPreferences.defaults));
window.ikmal.onAnnotationPreferences((preferences) => editorAnnotationControls.apply(preferences));
window.ikmal.getCheckingPreferences().then(renderCheckingPreferences).catch(() => renderCheckingPreferences(checkingPreferences));
window.ikmal.onCheckingPreferences(renderCheckingPreferences);
loadStyleGuides();
loadRecentSessions();
renderSuggestions(lastResponse);
updateEditorMeta();
