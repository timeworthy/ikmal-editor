const input = document.querySelector('#writing-input');
const results = document.querySelector('#results');
const emptyState = document.querySelector('#empty-state');
const notice = document.querySelector('#writing-notice');
const summary = document.querySelector('#check-summary');
const wordCount = document.querySelector('#word-count');
const characterCount = document.querySelector('#character-count');
const serviceLabel = document.querySelector('#service-label');
const serviceSummary = document.querySelector('#service-summary');
const startButton = document.querySelector('#start-button');
const stopButton = document.querySelector('#stop-button');
const clearButton = document.querySelector('#clear-button');
const openEditorButton = document.querySelector('#open-editor-button');
const antecedentLinks = document.querySelector('#antecedent-links');
const antecedentList = document.querySelector('#antecedent-list');
const languageToolStatusDot = document.querySelector('#languagetool-status-dot');
const languageToolStatusLabel = document.querySelector('#languagetool-status-label');
const qualityStatusDot = document.querySelector('#quality-status-dot');
const qualityStatusLabel = document.querySelector('#quality-status-label');
const styleGuideSelect = document.querySelector('#style-guide-select');
const styleGuideToggle = document.querySelector('#style-guide-toggle');
const styleGuideCount = document.querySelector('#style-guide-count');
const styleGuideStatus = document.querySelector('#style-guide-status');
const importStyleGuideButton = document.querySelector('#import-style-guide');
const refreshStyleGuidesButton = document.querySelector('#refresh-style-guides');
const integrationList = document.querySelector('#integration-list');
const integrationSwitch = document.querySelector('#integration-switch');
const switchToIkmalButton = document.querySelector('#switch-to-ikmal');
const dismissSwitchButton = document.querySelector('#dismiss-switch');
// The browser targets are the only ones ikmal has its own product for. macOS
// system integration and the VS Code entry are LanguageTool's too, but ikmal's
// alternatives there are the spell server and the VS Code adapter, which are
// installed from their own cards rather than by swapping an extension.
const BROWSER_LANGUAGETOOL_TARGETS = new Set(['firefox', 'chrome']);
const refreshIntegrationsButton = document.querySelector('#refresh-integrations');
const qualityComponentList = document.querySelector('#quality-component-list');
const qualityLicenseNotice = document.querySelector('#quality-license-notice');
const qualityLicenseBody = document.querySelector('#quality-license-body');
const qualityInstall = document.querySelector('#quality-install');
const qualityAck = document.querySelector('#quality-ack');
const qualityInstallStatus = document.querySelector('#quality-install-status');
const installQualityButton = document.querySelector('#install-quality');
const refreshQualityButton = document.querySelector('#refresh-quality');
const openNoticesButton = document.querySelector('#open-notices');
const revealExtensionButton = document.querySelector('#reveal-extension');
const extensionStatus = document.querySelector('#extension-status');
const configureIntegrationsButton = document.querySelector('#configure-integrations');
const integrationAction = document.querySelector('#integration-action');
const integrationActionTitle = document.querySelector('#integration-action-title');
const integrationActionDescription = document.querySelector('#integration-action-description');
const applyIntegrationsButton = document.querySelector('#apply-integrations');
const cancelIntegrationsButton = document.querySelector('#cancel-integrations');
const historyList = document.querySelector('#history-list');
const historyEmptyState = document.querySelector('#history-empty-state');
const historyNotice = document.querySelector('#history-notice');
const clearHistoryButton = document.querySelector('#clear-history-button');
const writingSurface = document.querySelector('.writing-surface');
const writingHighlights = document.querySelector('#writing-highlights');
const suggestionPopover = document.querySelector('#suggestion-popover');
const writingStatus = document.querySelector('#writing-status');
const writingStatusLabel = document.querySelector('#writing-status-label');
const writingStatusAction = document.querySelector('#writing-status-action');
const menubarToggle = document.querySelector('#menubar-toggle');
const dockToggle = document.querySelector('#dock-toggle');
const presenceNotice = document.querySelector('#presence-notice');
const annotationIndicatorStyle = document.querySelector('#annotation-indicator-style');
const annotationPalette = document.querySelector('#annotation-palette');
const annotationIntensity = document.querySelector('#annotation-intensity');
const annotationIntensityValue = document.querySelector('#annotation-intensity-value');
const checkingMode = document.querySelector('#checking-mode');
const checkingDelay = document.querySelector('#checking-delay');
const checkingDelayValue = document.querySelector('#checking-delay-value');
const checkingSensitivity = document.querySelector('#checking-sensitivity');
const checkingSensitivityValue = document.querySelector('#checking-sensitivity-value');
const checkingCategoryInputs = {
  grammar: document.querySelector('#checking-category-grammar'),
  repetition: document.querySelector('#checking-category-repetition'),
  style: document.querySelector('#checking-category-style'),
  languagetool: document.querySelector('#checking-category-languagetool'),
};
const focusStateLabel = document.querySelector('#focus-state-label');
const focusDurationSelect = document.querySelector('#focus-duration');
const focusModeButtons = [...document.querySelectorAll('.focus-mode-button')];
const spellServerSettings = document.querySelector('#native-spell-settings');
const installSpellServerButton = document.querySelector('#install-spell-server');
const removeSpellServerButton = document.querySelector('#remove-spell-server');
const startSpellServicesButton = document.querySelector('#start-spell-services');
const spellServerStatus = document.querySelector('#spell-server-status');
const officeBridgeSettings = document.querySelector('#office-settings');
const generateOfficeCertificateButton = document.querySelector('#generate-office-certificate');
const startOfficeBridgeButton = document.querySelector('#start-office-bridge');
const stopOfficeBridgeButton = document.querySelector('#stop-office-bridge');
const revealOfficeManifestButton = document.querySelector('#reveal-office-manifest');
const officeManifestHost = document.querySelector('#office-manifest-host');
const removeOfficeCertificateButton = document.querySelector('#remove-office-certificate');
// The preload contract still exposes one method per host; only the UI collapsed
// into a picker, so the main-process handlers stay one-per-manifest.
const officeManifestReveals = {
  word: () => window.ikmal.revealOfficeManifest(),
  excel: () => window.ikmal.revealOfficeExcelManifest(),
  powerpoint: () => window.ikmal.revealOfficePowerPointManifest(),
  outlook: () => window.ikmal.revealOfficeOutlookManifest(),
  onenote: () => window.ikmal.revealOfficeOneNoteManifest(),
  project: () => window.ikmal.revealOfficeProjectManifest(),
};
const officeBridgeStatus = document.querySelector('#office-bridge-status');
const setupCelebration = document.querySelector('#setup-celebration');
const celebrationConfetti = document.querySelector('#celebration-confetti');
const dismissCelebration = document.querySelector('#dismiss-celebration');
const writingNoticeSurface = window.IkmalNoticeSurface.attach(notice);

document.documentElement.dataset.platform = window.ikmal.platform;

let lastResponse = { matches: [] };
let rawResponse = { matches: [] };
let checkingPreferences = { mode: 'automatic', delay: 700, sensitivity: 55, categories: { grammar: true, repetition: true, style: true, languagetool: true } };
let focusState = { mode: 'active', until: null, label: 'Checking', durations: [], effective: null };
let styleGuideState;
let integrationState;
let serviceState = { proxyReady: false };
let spellServerInstalled = false;
let recentChecks = [];
let checkTimer;
let checkGeneration = 0;
let ignoredMatches = new Set();
let switchOfferDismissed = false;
let resizeFrame;
let statusAnimationFrame;
const annotationSurface = window.IkmalAnnotationSurface.attach({
  input,
  highlights: writingHighlights,
  popover: suggestionPopover,
  getResponse: () => lastResponse,
  displaySource,
  onApply: (index) => applySuggestion(index),
  onIgnore: (index) => {
    ignoredMatches.add(index);
    renderResults(lastResponse, input.value);
  },
  onInvalidate: () => clearStaleFindings(),
});
const annotationControls = window.IkmalAnnotationPreferences.bindControls({
  style: annotationIndicatorStyle,
  palette: annotationPalette,
  intensity: annotationIntensity,
  output: annotationIntensityValue,
  onChange: async (preferences) => {
    try {
      annotationControls.apply(await window.ikmal.setAnnotationPreferences(preferences));
    } catch (error) {
      showFailureNotice(error.message || 'Could not save highlighting preferences.', { details: error.stack || error.message });
    }
  },
});

function escapeHTML(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function updateWordCount() {
  const words = input.value.trim() ? input.value.trim().split(/\s+/).length : 0;
  wordCount.textContent = `${words} word${words === 1 ? '' : 's'}`;
  characterCount.textContent = `${input.value.length} character${input.value.length === 1 ? '' : 's'}`;
}

function setNotice(message, visible = true) {
  if (!visible || !message) {
    writingNoticeSurface.hide();
    return;
  }
  writingNoticeSurface.show({ message, error: false });
}

function showFailureNotice(message, { retry, cancel, cancelLabel = 'Cancel', continueLabel = 'Continue', details = '' } = {}) {
  const actions = [];
  if (retry) actions.push({ label: 'Retry', kind: 'primary', onClick: retry });
  if (cancel) actions.push({ label: cancelLabel, onClick: cancel });
  else actions.push({ label: continueLabel, onClick: () => {} });
  writingNoticeSurface.show({ message, error: true, details, actions });
}

function setWritingStatus(kind, label, actionable = false, detail = label) {
  writingStatus.className = `writing-status is-${kind}`;
  cancelAnimationFrame(statusAnimationFrame);
  statusAnimationFrame = requestAnimationFrame(() => writingStatus.classList.add('is-settling'));
  writingStatusLabel.textContent = label;
  writingStatus.setAttribute('aria-label', detail);
  writingStatusAction.disabled = !actionable;
  writingStatusAction.textContent = document.querySelector('#writing-panel').classList.contains('suggestions-expanded')
    ? 'Close suggestions'
    : 'Open suggestions';
  writingStatusAction.setAttribute('aria-expanded', String(document.querySelector('#writing-panel').classList.contains('suggestions-expanded')));
  writingStatusAction.setAttribute('aria-label', writingStatusAction.textContent);
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
  serviceState = state || { proxyReady: false };
  const ready = state.proxyReady;
  const allServicesReady = state.languageToolReady && state.proxyReady && state.qualityReady;
  serviceSummary.classList.toggle('is-ready', ready);
  serviceSummary.classList.toggle('is-warning', !ready && state.managerRunning);
  serviceLabel.textContent = allServicesReady ? (state.managerRunning ? 'Ready · managed' : 'Ready · existing') : ready ? 'Enhancer ready' : state.managerRunning ? 'Starting' : 'Stopped';
  document.querySelector('.status-dot').setAttribute('aria-label', ready ? 'Ready' : 'Unavailable');
  setHealth(languageToolStatusDot, languageToolStatusLabel, state.languageToolReady);
  setHealth(qualityStatusDot, qualityStatusLabel, state.qualityReady);
  if (state.proxyUrl) document.querySelector('#proxy-endpoint').textContent = `${state.proxyUrl}/v2`;
  startButton.disabled = state.managerRunning || allServicesReady;
  startButton.textContent = allServicesReady ? 'Already running' : state.managerRunning ? 'Starting…' : 'Start services';
  startButton.classList.toggle('button-primary', !allServicesReady);
  startButton.classList.toggle('button-quiet', allServicesReady);
  stopButton.disabled = !state.managerRunning;
  if (spellServerInstalled) renderSpellServerState({ installed: true, available: true, supported: true });
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

function integrationCandidates() {
  return (integrationState?.targets || []).filter((target) => target.detected && !target.configured);
}

function renderIntegrationStatus(state) {
  integrationState = state || { endpoint: '', targets: [] };
  const targets = Array.isArray(integrationState.targets) ? integrationState.targets : [];
  integrationList.replaceChildren();
  if (!targets.some((target) => target.detected)) {
    integrationList.innerHTML = '<small>No supported LanguageTool integrations detected. The desktop writing tester remains available.</small>';
  } else {
    targets.forEach((target) => {
      const row = document.createElement('div');
      row.className = 'integration-target';
      const state = target.state || (target.configured ? 'configured' : target.detected ? 'detected' : 'not-detected');
      const status = state === 'configured'
        ? 'Connected to ikmal enhancer'
        : state === 'misconfigured'
          ? `Found · points to ${target.configuredEndpoint || 'a different server'}`
          : state === 'detected'
            ? 'Found · no managed endpoint'
            : 'Not detected';
      // Every state needs its own colour. 'detected' and 'misconfigured' both
      // fell through to the default grey dot, so an integration pointing at the
      // wrong server looked exactly like one that simply is not set up.
      const dotClass = state === 'configured'
        ? 'is-ready'
        : state === 'misconfigured'
          ? 'is-warn'
          : state === 'detected'
            ? 'is-idle'
            : 'is-unavailable';
      // Name whose product each row is. Every row here is LanguageTool's, and
      // saying so is the difference between "my integrations" and "someone
      // else's plugin I pointed at my own server".
      row.innerHTML = `<span class="mini-status-dot ${dotClass}"></span><span><strong>${escapeHTML(target.name)}</strong><small>${escapeHTML(status)} · ${escapeHTML(target.details || '')}</small><small class="integration-vendor">LanguageTool's plugin</small></span>`;
      integrationList.appendChild(row);
    });
  }
  // Offer ikmal's own extension only where one of LanguageTool's browser
  // plugins is actually installed. Nothing is switched automatically: the
  // button reveals the folder and the panel states what changes.
  const browserPluginDetected = targets.some((target) => BROWSER_LANGUAGETOOL_TARGETS.has(target.id) && target.detected);
  integrationSwitch.classList.toggle('is-hidden', !browserPluginDetected || switchOfferDismissed);

  const candidates = integrationCandidates();
  configureIntegrationsButton.disabled = candidates.length === 0;
  configureIntegrationsButton.textContent = candidates.length ? 'Review' : targets.some((target) => target.configured) ? 'Connected' : 'No changes';
  if (candidates.length) document.querySelector('#enhancer-settings').open = true;
  if (!candidates.length) integrationAction.classList.add('is-hidden');
}

async function loadIntegrationStatus() {
  integrationList.innerHTML = '<small>Checking installed integrations…</small>';
  try {
    renderIntegrationStatus(await window.ikmal.getIntegrationStatus());
  } catch (error) {
    integrationList.innerHTML = `<small class="is-error">Could not inspect integrations: ${escapeHTML(error.message || 'unknown error')}.</small>`;
    configureIntegrationsButton.disabled = true;
  }
}

async function loadQualityStatus() {
  qualityComponentList.innerHTML = '<small>Checking installed components…</small>';
  try {
    renderQualityStatus(await window.ikmal.getQualityStatus());
  } catch (error) {
    qualityComponentList.innerHTML = `<small class="is-error">Could not inspect quality components: ${escapeHTML(error.message || 'unknown error')}.</small>`;
    qualityInstall.classList.add('is-hidden');
  }
}

function renderQualityStatus(status) {
  const components = Array.isArray(status.components) ? status.components : [];
  qualityComponentList.innerHTML = components.map((component) => `
    <div class="component-row">
      <span class="mini-status-dot ${component.installed ? 'is-ready' : 'is-idle'}"></span>
      <span class="component-body">
        <strong>${escapeHTML(component.name)}</strong>
        <small>${component.installed ? 'Installed' : 'Not installed'} · ${escapeHTML(component.license)}${component.size && component.size !== '—' ? ` · ${escapeHTML(component.size)}` : ''}</small>
        <small class="component-source">${escapeHTML(component.source)}</small>
      </span>
    </div>
  `).join('');

  if (status.modelIsDefault) {
    qualityLicenseBody.textContent = `The default model ${status.modelId} is licensed ${status.modelLicense}. ikmal editor's own MIT license does not cover these weights. Installing them here makes this machine the party bound by that license. For commercial use, set IKMAL_TRANSFORMER_MODEL to a permissively licensed model before installing.`;
    qualityLicenseNotice.classList.remove('is-hidden');
  } else {
    qualityLicenseNotice.classList.add('is-hidden');
  }

  const missing = components.filter((component) => !component.installed);
  const runtimeMissing = missing.some((component) => component.id === 'node');

  if (status.ready) {
    qualityInstall.classList.add('is-hidden');
    qualityInstallStatus.textContent = '';
    qualityComponentList.insertAdjacentHTML('beforeend', '<small class="is-ready-note">All components are installed. Start services with the transformer enabled to use them.</small>');
    return;
  }

  qualityInstall.classList.remove('is-hidden');
  if (runtimeMissing) {
    qualityAck.disabled = true;
    installQualityButton.disabled = true;
    qualityInstallStatus.textContent = 'Node.js and npm are required and were not found on your PATH. Install them, then refresh. ikmal editor will not install them for you.';
    return;
  }

  qualityAck.disabled = false;
  const alreadyAccepted = status.noticesAccepted === true;
  qualityAck.checked = alreadyAccepted;
  installQualityButton.disabled = !alreadyAccepted;
  const size = missing.map((component) => component.size).filter((value) => value && value !== '—').join(' + ');
  qualityInstallStatus.textContent = size ? `Downloads about ${size}.` : '';
}

async function installQualityStack() {
  if (!qualityAck.checked) return;
  installQualityButton.disabled = true;
  qualityAck.disabled = true;
  refreshQualityButton.disabled = true;
  qualityInstallStatus.textContent = 'Installing. This downloads several hundred megabytes and can take a few minutes…';
  try {
    const result = await window.ikmal.installQualityStack(true);
    qualityInstallStatus.textContent = 'Quality components installed.';
    if (result && result.status) renderQualityStatus(result.status);
    else await loadQualityStatus();
  } catch (error) {
    qualityInstallStatus.textContent = `Install failed: ${error.message || 'unknown error'}. Nothing was left running.`;
    qualityAck.disabled = false;
    installQualityButton.disabled = !qualityAck.checked;
  } finally {
    refreshQualityButton.disabled = false;
  }
}

function reviewIntegrations() {
  const candidates = integrationCandidates();
  if (!candidates.length) return;
  integrationActionTitle.textContent = 'Review before changing anything';
  integrationActionDescription.textContent = `This will point ${candidates.map((target) => target.name).join(', ')} at ${integrationState.endpoint}. It will not install extensions or modify your writing. Some apps may need to restart. Choose Configure selected to apply this, or Leave unchanged to keep current settings.`;
  applyIntegrationsButton.textContent = 'Configure selected';
  integrationAction.classList.remove('is-hidden');
}

async function applyIntegrations() {
  const candidates = integrationCandidates();
  if (!candidates.length) return;
  applyIntegrationsButton.disabled = true;
  integrationActionTitle.textContent = 'Configuring selected integrations…';
  integrationActionDescription.textContent = 'Writing only the approved server setting. Your existing LanguageTool service will remain running.';
  try {
    await window.ikmal.configureIntegrations(candidates.map((target) => target.id));
    integrationActionTitle.textContent = 'Enhancer connected';
    integrationActionDescription.textContent = 'The selected integrations now use the ikmal enhancer. Restart the affected browser or editor if it does not pick up the setting immediately.';
    await loadIntegrationStatus();
  } catch (error) {
    integrationActionTitle.textContent = 'Could not configure integrations';
    integrationActionDescription.textContent = `${error.message || 'The configuration command failed.'} You can Retry configuration or Leave unchanged.`;
    applyIntegrationsButton.textContent = 'Retry configuration';
  } finally {
    applyIntegrationsButton.disabled = false;
  }
}

function displaySource(source) {
  return ({
    'quality-sidecar': 'Quality checks',
    'style-guide-sidecar': 'Style guide',
    transformer: 'Transformer',
  })[source] || source || 'LanguageTool';
}

function selectTextRange(start, end) {
  input.focus();
  input.setSelectionRange(start, end);
}

function renderAntecedents(response, sourceText) {
  const links = Array.isArray(response.ikmalAntecedents) ? response.ikmalAntecedents : [];
  antecedentList.replaceChildren();
  antecedentLinks.classList.toggle('is-hidden', links.length === 0 || !sourceText);
  links.forEach((link) => {
    const button = document.createElement('button');
    button.className = 'antecedent-link';
    button.type = 'button';
    button.innerHTML = `<strong>${escapeHTML(link.pronoun || 'Pronoun')}</strong><span>→</span><mark>${escapeHTML(link.antecedent || 'Unresolved')}</mark>`;
    button.title = `Jump to ${link.pronoun || 'pronoun'} and its antecedent`;
    button.addEventListener('click', () => selectTextRange(link.start || 0, link.end || 0));
    antecedentList.appendChild(button);
  });
}

function clearStaleFindings() {
  lastResponse = { matches: [] };
  rawResponse = { matches: [] };
  ignoredMatches = new Set();
  renderAntecedents({ ikmalAntecedents: [] }, '');
  summary.textContent = '';
  summary.classList.add('is-hidden');
  results.querySelectorAll('.result-card').forEach((node) => node.remove());
  emptyState.classList.toggle('is-hidden', Boolean(input.value.trim()));
  resizeCompactWindow();
}

function renderOccurrencePreview(sourceText, match, occurrences) {
  const spans = [{ offset: match.offset || 0, length: match.length || 0 }, ...occurrences.map((occurrence) => ({ offset: occurrence.start ?? occurrence.offset ?? 0, length: occurrence.end != null ? occurrence.end - (occurrence.start ?? occurrence.offset ?? 0) : occurrence.length || 0 }))]
    .filter((span) => span.length > 0)
    .sort((left, right) => left.offset - right.offset);
  const unique = spans.filter((span, index) => index === 0 || span.offset !== spans[index - 1].offset || span.length !== spans[index - 1].length);
  let cursor = 0;
  const parts = [];
  unique.forEach((span) => {
    if (span.offset < cursor) return;
    parts.push(escapeHTML(sourceText.slice(cursor, span.offset)));
    parts.push(`<mark>${escapeHTML(sourceText.slice(span.offset, span.offset + span.length))}</mark>`);
    cursor = span.offset + span.length;
  });
  parts.push(escapeHTML(sourceText.slice(cursor)));
  return parts.join('');
}

function matchSource(match) {
  return match.ikmalSource || (match.rule && match.rule.id && match.rule.id.startsWith('IKMAL_') ? 'quality sidecar' : 'LanguageTool');
}

function matchClass(match) {
  const source = String(matchSource(match)).toLowerCase();
  const category = String(match.rule?.category?.id || match.category || '').toLowerCase();
  if (source.includes('style') || category.includes('style')) return 'is-style';
  if (source.includes('quality') || category.includes('grammar') || category.includes('agreement')) return 'is-grammar';
  return 'is-language';
}

function checkingCategory(match) {
  const source = String(matchSource(match)).toLowerCase();
  const rule = String(match.rule?.id || '').toLowerCase();
  const description = String(match.rule?.description || match.rule?.category?.id || match.category || '').toLowerCase();
  if (rule.includes('repetition') || rule.includes('word-family') || rule.includes('echo') || description.includes('repetition') || description.includes('echo')) return 'repetition';
  if (source.includes('style') || rule.includes('style-guide') || description.includes('style')) return 'style';
  if (source.includes('quality') || description.includes('grammar') || description.includes('agreement') || rule.includes('pronoun') || rule.includes('verb')) return 'grammar';
  return 'languagetool';
}

// Filtering reads the effective preferences — the user's own settings with the
// current focus mode applied on top, computed in the main process where the
// preset rules live. The stored preferences are left untouched, so the sliders
// keep showing what the user chose and Checking restores it exactly.
function effectiveCheckingPreferences() {
  return focusState.effective || checkingPreferences;
}

function filteredResponse(response) {
  const value = response || { matches: [] };
  const effective = effectiveCheckingPreferences();
  const threshold = 0.9 - (effective.sensitivity / 100) * 0.4;
  const matches = Array.isArray(value.matches) ? value.matches.filter((match) => {
    const confidence = Number(match.ikmalConfidence ?? match.confidence ?? 1);
    return effective.categories[checkingCategory(match)] !== false && (!Number.isFinite(confidence) || confidence >= threshold);
  }) : [];
  return { ...value, matches };
}

function renderFocusState(state) {
  focusState = state && typeof state === 'object' ? state : focusState;
  focusStateLabel.textContent = focusState.label || 'Checking';
  focusModeButtons.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.mode === focusState.mode);
    button.setAttribute('aria-pressed', String(button.dataset.mode === focusState.mode));
  });
  if (focusDurationSelect.options.length === 0 && Array.isArray(focusState.durations)) {
    focusState.durations.forEach((duration) => {
      const option = document.createElement('option');
      option.value = duration.id;
      option.textContent = duration.label;
      focusDurationSelect.appendChild(option);
    });
  }
  document.documentElement.dataset.focusMode = focusState.mode;
  // A mode change alters which findings pass the filter, so anything already
  // on screen has to be redrawn against the new effective settings.
  renderResults(rawResponse, input.value);
  if (focusState.mode === 'paused') setWritingStatus('idle', focusState.label);
}

async function applyFocusMode(mode) {
  try {
    renderFocusState(await window.ikmal.setFocusMode(mode, focusDurationSelect.value));
    if (focusState.mode === 'active' && checkingPreferences.mode === 'automatic' && input.value.trim()) checkWriting();
  } catch (error) {
    setNotice(error.message || 'Could not change the focus mode.');
  }
}

function renderCheckingPreferences(preferences) {
  const sensitivity = Number(preferences?.sensitivity);
  checkingPreferences = {
    mode: preferences?.mode === 'manual' ? 'manual' : 'automatic',
    delay: Math.max(200, Math.min(2000, Number(preferences?.delay) || 700)),
    sensitivity: Number.isFinite(sensitivity) ? Math.max(0, Math.min(100, sensitivity)) : 55,
    categories: { ...checkingPreferences.categories, ...(preferences?.categories || {}) },
  };
  checkingMode.value = checkingPreferences.mode;
  checkingDelay.value = String(checkingPreferences.delay);
  checkingDelayValue.textContent = `${checkingPreferences.delay} ms`;
  checkingSensitivity.value = String(checkingPreferences.sensitivity);
  checkingSensitivityValue.textContent = `${checkingPreferences.sensitivity}%`;
  Object.entries(checkingCategoryInputs).forEach(([category, control]) => { control.checked = checkingPreferences.categories[category] !== false; });
}

async function updateCheckingPreferences() {
  try {
    const preferences = await window.ikmal.setCheckingPreferences({
      mode: checkingMode.value,
      delay: Number(checkingDelay.value),
      sensitivity: Number(checkingSensitivity.value),
      categories: Object.fromEntries(Object.entries(checkingCategoryInputs).map(([category, control]) => [category, control.checked])),
    });
    renderCheckingPreferences(preferences);
    // Ignored suggestions are tracked by their position in the filtered list,
    // so a change to sensitivity or categories renumbers them. Keeping the old
    // indices would hide unrelated suggestions the user never dismissed.
    ignoredMatches = new Set();
    renderResults(rawResponse, input.value);
    if (checkingPreferences.mode === 'manual') setWritingStatus('good', input.value.trim() ? 'Ready to check' : 'Ready when you are');
    else if (input.value.trim()) scheduleCheck();
  } catch (error) {
    setNotice(error.message || 'Could not save checking preferences.');
  }
}

function issueType(match) {
  const kind = matchClass(match);
  return kind === 'is-grammar' ? 'Grammar' : kind === 'is-style' ? 'Style' : 'LanguageTool';
}

function issueSummary(matches, getType) {
  const counts = new Map();
  matches.forEach((match) => counts.set(getType(match), (counts.get(getType(match)) || 0) + 1));
  return [...counts.entries()].map(([type, count]) => `${count} ${type.toLowerCase()}`).join(' · ');
}

function renderInlineFindings(response, sourceText) {
  annotationSurface.render(response, sourceText, ignoredMatches);
}

// activate is false for a collapse the renderer decides on its own, so the
// window resizes without being raised and focused. The main process must be
// told either way: skipping it left the window at its 760px expanded width with
// the drawer closed, and the next toggle click then appeared to do nothing.
function setSuggestionsExpanded(expanded, activate = true) {
  const next = Boolean(expanded);
  document.querySelector('#writing-panel').classList.toggle('suggestions-expanded', next);
  writingStatusAction.textContent = next ? 'Close suggestions' : 'Open suggestions';
  writingStatusAction.setAttribute('aria-expanded', String(next));
  writingStatusAction.setAttribute('aria-label', writingStatusAction.textContent);
  if (next) writingStatusAction.disabled = false;
  window.ikmal.setCompactExpanded(next, activate);
  resizeCompactWindow();
}

function resizeCompactWindow() {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => {
    if (document.querySelector('#writing-panel').classList.contains('is-hidden')) return;
    const expanded = document.querySelector('#writing-panel').classList.contains('suggestions-expanded');
    const text = input.value || '';
    const charsPerLine = expanded ? 42 : 48;
    const lineCount = text.split('\n').reduce((count, line) => count + Math.max(1, Math.ceil(line.length / charsPerLine)), 0);
    const surfaceHeight = Math.max(166, Math.min(360, 38 + lineCount * 23));
    writingSurface.style.height = `${surfaceHeight}px`;
    // The absolutely positioned drawer reports only its visible viewport in
    // some Chromium layouts, so reserve enough room for the first card even
    // when scrollHeight under-reports. Larger sets can still grow to the cap.
    const resultGrowth = expanded ? Math.max(90, Math.min(360, results.scrollHeight - 100)) : 0;
    const desiredHeight = 430 + Math.max(0, surfaceHeight - 166) + Math.min(280, resultGrowth);
    if (resizeCompactWindow.lastHeight !== desiredHeight) {
      resizeCompactWindow.lastHeight = desiredHeight;
      window.ikmal.setCompactHeight(desiredHeight);
    }
  });
}

function renderResults(response, sourceText) {
  response = filteredResponse(response);
  const matches = Array.isArray(response.matches) ? response.matches : [];
  const visibleMatches = matches.filter((_, index) => !ignoredMatches.has(index));
  const groupedCount = visibleMatches.reduce((count, match) => count + (Array.isArray(match.ikmalRelated) ? match.ikmalRelated.length : 0), 0);
  lastResponse = response;
  renderInlineFindings(response, sourceText);
  renderAntecedents(response, sourceText);
  emptyState.classList.toggle('is-hidden', visibleMatches.length > 0);
  summary.textContent = visibleMatches.length
    ? `${visibleMatches.length} suggestion${visibleMatches.length === 1 ? '' : 's'} found${groupedCount ? ` · ${groupedCount} grouped finding${groupedCount === 1 ? '' : 's'}` : ''}`
    : '';
  summary.classList.toggle('is-hidden', visibleMatches.length === 0);
  if (!visibleMatches.length) setSuggestionsExpanded(false, false);
  setWritingStatus(
    visibleMatches.length ? 'warning' : 'good',
    visibleMatches.length ? `${visibleMatches.length} to review` : 'No issues detected',
    visibleMatches.length > 0,
    visibleMatches.length ? issueSummary(visibleMatches, issueType) : 'No issues detected',
  );
  results.querySelectorAll('.result-card').forEach((node) => node.remove());
  visibleMatches.forEach((match) => {
    const index = matches.indexOf(match);
    const matchedText = sourceText.slice(match.offset || 0, (match.offset || 0) + (match.length || 0));
    const replacement = match.replacements && match.replacements[0] ? match.replacements[0].value : '';
    const source = matchSource(match);
    const sources = Array.isArray(match.ikmalSources) ? match.ikmalSources : [source];
    const related = Array.isArray(match.ikmalRelated) ? match.ikmalRelated : [];
    const occurrences = Array.isArray(match.ikmalRelatedOccurrences) ? match.ikmalRelatedOccurrences : [];
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
    const occurrenceMarkup = occurrences.length > 1 ? `
      <div class="occurrence-preview" aria-label="All related occurrences">
        <span>Occurrences</span>
        <p>${renderOccurrencePreview(sourceText, match, occurrences)}</p>
      </div>` : '';
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
      ${occurrenceMarkup}
      ${relatedMarkup}
      <button class="result-apply" type="button" data-match-index="${index}" ${replacement ? '' : 'disabled'}>${replacement ? 'Apply suggestion' : 'No direct replacement'}</button>`;
    results.appendChild(card);
  });
  results.querySelectorAll('.result-apply:not(:disabled)').forEach((button) => {
    button.addEventListener('click', () => applySuggestion(Number(button.dataset.matchIndex)));
  });
  resizeCompactWindow();
}

function applySuggestion(index) {
  const match = lastResponse.matches && lastResponse.matches[index];
  const replacement = match && match.replacements && match.replacements[0] ? match.replacements[0].value : '';
  if (!match || !replacement) return;
  input.setRangeText(replacement, match.offset, match.offset + match.length, 'end');
  ignoredMatches = new Set();
  updateWordCount();
  checkWriting();
}

async function checkWriting() {
  clearTimeout(checkTimer);
  if (!annotationSurface.isCurrent()) clearStaleFindings();
  const generation = ++checkGeneration;
  const text = input.value;
  if (!text.trim()) {
    setWritingStatus('good', 'Ready when you are');
    setNotice('', false);
    return;
  }
  setWritingStatus('checking', 'Checking…');
  setNotice('', false);
  try {
    const response = await window.ikmal.checkText(text);
    if (generation !== checkGeneration) return;
    rawResponse = response || { matches: [] };
    ignoredMatches = new Set();
    renderResults(rawResponse, text);
  } catch (error) {
    if (generation !== checkGeneration) return;
    setWritingStatus('error', 'Check unavailable');
    showFailureNotice(error.message || 'The writing service is unavailable.', {
      retry: () => checkWriting(),
      cancel: () => setWritingStatus('good', 'Ready when you are'),
      cancelLabel: 'Keep editing',
      details: error.stack || error.message,
    });
  }
}

function scheduleCheck() {
  clearTimeout(checkTimer);
  checkGeneration += 1;
  if (!input.value.trim()) {
    rawResponse = { matches: [] };
    lastResponse = { matches: [] };
    renderResults(lastResponse, '');
    setWritingStatus('good', 'Ready when you are');
    setNotice('', false);
    return;
  }
  // Pause resolves to manual, so this one branch covers both the setting and
  // the preset. The status names whichever is in force, so a paused window
  // does not look like a broken one.
  const effective = effectiveCheckingPreferences();
  if (effective.mode === 'manual') {
    setWritingStatus('good', focusState.mode === 'paused' ? focusState.label : 'Ready to check');
    setNotice('', false);
    return;
  }
  setWritingStatus('checking', 'Waiting to check…');
  setNotice('', false);
  checkTimer = setTimeout(() => checkWriting(), effective.delay);
}

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => selectPanel(tab.dataset.panel));
});

input.addEventListener('input', () => { updateWordCount(); resizeCompactWindow(); scheduleCheck(); });
input.addEventListener('scroll', () => {
  writingHighlights.scrollTop = input.scrollTop;
  writingHighlights.scrollLeft = input.scrollLeft;
});
writingStatusAction.addEventListener('click', () => setSuggestionsExpanded(!document.querySelector('#writing-panel').classList.contains('suggestions-expanded')));
clearButton.addEventListener('click', () => {
  input.value = '';
  rawResponse = { matches: [] };
  lastResponse = { matches: [] };
  ignoredMatches = new Set();
  renderResults(lastResponse, '');
  setNotice('', false);
  updateWordCount();
  input.focus();
});
async function openFullEditor() {
  try {
    await window.ikmal.openEditor(input.value);
  } catch (error) {
    showFailureNotice(error.message || 'Could not open the full editor.', {
      retry: () => openFullEditor(),
      details: error.stack || error.message,
    });
  }
}
openEditorButton.addEventListener('click', openFullEditor);
async function startServices() {
  startButton.disabled = true;
  try {
    updateServiceState(await window.ikmal.startServices());
  } catch (error) {
    showFailureNotice(error.message || 'Could not start services.', {
      retry: () => startServices(),
      details: error.stack || error.message,
    });
    // Only on failure. On success updateServiceState has already set this from
    // the status it received; re-enabling here would make "Already running"
    // clickable.
    startButton.disabled = false;
  }
}
startButton.addEventListener('click', startServices);
async function stopServices() {
  stopButton.disabled = true;
  try {
    updateServiceState(await window.ikmal.stopServices());
  } catch (error) {
    showFailureNotice(error.message || 'Could not stop services.', {
      retry: () => stopServices(),
      details: error.stack || error.message,
    });
    stopButton.disabled = false;
  }
}
stopButton.addEventListener('click', stopServices);
clearHistoryButton.addEventListener('click', async () => {
  try {
    renderRecentChecks(await window.ikmal.clearRecentChecks());
    setHistoryNotice('Recent checks cleared.');
  } catch (error) {
    setHistoryNotice(error.message || 'Could not clear recent checks.');
  }
});
document.querySelector('#launch-toggle').addEventListener('change', async (event) => {
  const requested = event.target.checked;
  try {
    await window.ikmal.setLaunchAtLogin(requested);
  } catch (error) {
    event.target.checked = !requested;
    setNotice(error.message || 'Could not update launch-at-login settings.');
  }
});
function setPresenceNotice(message) {
  presenceNotice.textContent = message || '';
  presenceNotice.classList.toggle('is-hidden', !message);
}
function renderDesktopPresence(state) {
  menubarToggle.checked = Boolean(state?.menubarIcon);
  dockToggle.checked = Boolean(state?.dockIcon);
  const unsupported = state?.dockSupported === false;
  dockToggle.disabled = unsupported;
  dockToggle.closest('label')?.classList.toggle('is-unavailable', unsupported);
  if (unsupported) setPresenceNotice('Dock visibility is managed by the operating system on this platform.');
}
async function updateDesktopPresence() {
  try {
    const state = await window.ikmal.setDesktopPresence({ menubarIcon: menubarToggle.checked, dockIcon: dockToggle.checked });
    renderDesktopPresence(state);
    setPresenceNotice(state?.notice || '');
  } catch (error) {
    setPresenceNotice(error.message || 'Could not update app access settings.');
    window.ikmal.getDesktopPresence().then(renderDesktopPresence).catch(() => {});
  }
}
menubarToggle.addEventListener('change', updateDesktopPresence);
dockToggle.addEventListener('change', updateDesktopPresence);
function renderSpellServerState(state) {
  const supported = state?.supported === true;
  spellServerSettings.classList.toggle('is-hidden', !supported);
  if (!supported) return;
  spellServerInstalled = Boolean(state?.installed);
  installSpellServerButton.disabled = state?.installed || !state?.available;
  installSpellServerButton.textContent = state?.installed ? 'Installed' : 'Install';
  removeSpellServerButton.disabled = !state?.installed;
  const checkerReady = serviceState.proxyReady === true;
  startSpellServicesButton.classList.toggle('is-hidden', !state?.installed || checkerReady);
  startSpellServicesButton.disabled = Boolean(serviceState.managerRunning);
  spellServerStatus.classList.toggle('is-ready', Boolean(state?.installed && checkerReady));
  spellServerStatus.classList.toggle('is-warning', Boolean(state?.installed && !checkerReady));
  spellServerStatus.textContent = !state?.available
    ? 'Not included in this build. Build the optional macOS spell-service component first.'
    : state?.installed && checkerReady
      ? 'Installed and connected. Restart a host editor, enable Check Grammar With Spelling, and choose English (ikmal editor).'
      : state?.installed
        ? 'Installed, but ikmal services are offline. Start ikmal services here, then restart the host editor.'
        : 'Not installed. Nothing will change until you choose Install.';
}

function renderOfficeBridgeState(state) {
  officeBridgeSettings.classList.toggle('is-hidden', state?.supported === false);
  if (state?.supported === false) return;
  const configured = state?.configured === true;
  const running = state?.running === true;
  generateOfficeCertificateButton.disabled = configured;
  generateOfficeCertificateButton.textContent = configured ? 'Certificate ready' : 'Generate certificate';
  startOfficeBridgeButton.disabled = !configured || running;
  stopOfficeBridgeButton.disabled = !running;
  removeOfficeCertificateButton.disabled = !configured || running;
  officeBridgeStatus.classList.toggle('is-ready', running);
  officeBridgeStatus.classList.toggle('is-warning', configured && !running);
  officeBridgeStatus.textContent = running
    ? `Running at ${state.url}. ${state.trustMessage}`
    : configured
      ? `Certificate ready. ${state.trustMessage}`
      : 'Not configured. Nothing is generated until you choose Generate certificate.';
}
async function loadOfficeBridgeState() {
  try {
    renderOfficeBridgeState(await window.ikmal.getOfficeBridgeState());
  } catch (error) {
    officeBridgeStatus.textContent = error.message || 'Could not read Office bridge status.';
  }
}
async function generateOfficeCertificate() {
  generateOfficeCertificateButton.disabled = true;
  officeBridgeStatus.textContent = 'Generating a local certificate…';
  try {
    renderOfficeBridgeState(await window.ikmal.generateOfficeCertificate());
  } catch (error) {
    showFailureNotice(error.message || 'Could not generate the Office certificate.', { details: error.stack || error.message });
    await loadOfficeBridgeState();
  }
}
async function startOfficeBridge() {
  startOfficeBridgeButton.disabled = true;
  officeBridgeStatus.textContent = 'Starting the local HTTPS bridge…';
  try {
    renderOfficeBridgeState(await window.ikmal.startOfficeBridge());
  } catch (error) {
    showFailureNotice(error.message || 'Could not start the Office bridge.', { details: error.stack || error.message });
    await loadOfficeBridgeState();
  }
}
async function stopOfficeBridge() {
  stopOfficeBridgeButton.disabled = true;
  try {
    renderOfficeBridgeState(await window.ikmal.stopOfficeBridge());
  } catch (error) {
    showFailureNotice(error.message || 'Could not stop the Office bridge.', { details: error.stack || error.message });
    await loadOfficeBridgeState();
  }
}
async function removeOfficeCertificate() {
  removeOfficeCertificateButton.disabled = true;
  try {
    renderOfficeBridgeState(await window.ikmal.removeOfficeCertificate());
  } catch (error) {
    showFailureNotice(error.message || 'Could not remove the Office certificate.', { details: error.stack || error.message });
    await loadOfficeBridgeState();
  }
}
async function loadSpellServerState() {
  try {
    renderSpellServerState(await window.ikmal.getSpellServerState());
  } catch (error) {
    spellServerStatus.textContent = error.message || 'Could not read native spell-service status.';
  }
}
async function installSpellServer() {
  installSpellServerButton.disabled = true;
  spellServerStatus.textContent = 'Installing for this user…';
  try {
    renderSpellServerState(await window.ikmal.installSpellServer());
    celebrateSpellServerInstall();
  } catch (error) {
    showFailureNotice(error.message || 'Could not install the native spell service.', { details: error.stack || error.message });
    await loadSpellServerState();
  }
}
function celebrateSpellServerInstall() {
  celebrationConfetti.replaceChildren();
  const colors = ['var(--violet-300)', 'var(--sage)', 'var(--amber)', 'var(--terracotta)', 'var(--steel)'];
  for (let index = 0; index < 24; index += 1) {
    const piece = document.createElement('span');
    const angle = (Math.PI * 2 * index) / 24;
    const distance = 62 + (index % 4) * 18;
    piece.style.setProperty('--confetti-color', colors[index % colors.length]);
    piece.style.setProperty('--confetti-x', `${Math.round(Math.cos(angle) * distance)}px`);
    piece.style.setProperty('--confetti-y', `${Math.round(Math.sin(angle) * distance)}px`);
    piece.style.setProperty('--confetti-rotation', `${(index % 2 ? 1 : -1) * (180 + index * 11)}deg`);
    piece.style.setProperty('--confetti-delay', `${(index % 6) * 18}ms`);
    celebrationConfetti.appendChild(piece);
  }
  setupCelebration.classList.remove('is-hidden');
  window.setTimeout(() => setupCelebration.classList.add('is-hidden'), 7000);
}
async function removeSpellServer() {
  removeSpellServerButton.disabled = true;
  spellServerStatus.textContent = 'Removing for this user…';
  try {
    renderSpellServerState(await window.ikmal.removeSpellServer());
  } catch (error) {
    showFailureNotice(error.message || 'Could not remove the native spell service.', { details: error.stack || error.message });
    await loadSpellServerState();
  }
}
installSpellServerButton.addEventListener('click', installSpellServer);
removeSpellServerButton.addEventListener('click', removeSpellServer);
startSpellServicesButton.addEventListener('click', startServices);
generateOfficeCertificateButton.addEventListener('click', generateOfficeCertificate);
startOfficeBridgeButton.addEventListener('click', startOfficeBridge);
stopOfficeBridgeButton.addEventListener('click', stopOfficeBridge);
removeOfficeCertificateButton.addEventListener('click', removeOfficeCertificate);
revealOfficeManifestButton.addEventListener('click', async () => {
  const host = officeManifestHost.value;
  const reveal = officeManifestReveals[host];
  const label = officeManifestHost.selectedOptions[0]?.textContent || host;
  if (!reveal) {
    showFailureNotice(`No manifest is available for ${label}.`);
    return;
  }
  try {
    await reveal();
  } catch (error) {
    showFailureNotice(error.message || `Could not reveal the ${label} manifest.`, { details: error.stack || error.message });
  }
});
dismissCelebration.addEventListener('click', () => setupCelebration.classList.add('is-hidden'));
refreshStyleGuidesButton.addEventListener('click', loadStyleGuideState);
refreshIntegrationsButton.addEventListener('click', loadIntegrationStatus);
switchToIkmalButton.addEventListener('click', async () => {
  try {
    await window.ikmal.revealExtension();
    document.querySelector('#extension-settings').open = true;
  } catch (error) {
    showFailureNotice(error.message || 'Could not open the ikmal extension folder.', { details: error.stack || error.message });
  }
});
dismissSwitchButton.addEventListener('click', () => {
  switchOfferDismissed = true;
  integrationSwitch.classList.add('is-hidden');
});
refreshQualityButton.addEventListener('click', loadQualityStatus);
qualityAck.addEventListener('change', () => { installQualityButton.disabled = !qualityAck.checked; });
installQualityButton.addEventListener('click', installQualityStack);
openNoticesButton.addEventListener('click', async () => {
  try {
    await window.ikmal.openThirdPartyNotices();
  } catch (error) {
    qualityInstallStatus.textContent = `Could not open the notices: ${error.message || 'unknown error'}.`;
  }
});
revealExtensionButton.addEventListener('click', async () => {
  try {
    const target = await window.ikmal.revealExtension();
    extensionStatus.textContent = `Load unpacked from: ${target}`;
  } catch (error) {
    extensionStatus.textContent = `Could not open the extension folder: ${error.message || 'unknown error'}.`;
  }
});
configureIntegrationsButton.addEventListener('click', reviewIntegrations);
applyIntegrationsButton.addEventListener('click', applyIntegrations);
cancelIntegrationsButton.addEventListener('click', () => integrationAction.classList.add('is-hidden'));
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
importStyleGuideButton.addEventListener('click', async () => {
  importStyleGuideButton.disabled = true;
  try {
    const result = await window.ikmal.importStyleGuide();
    if (!result?.canceled) {
      await loadStyleGuideState();
      setStyleGuideStatus('Guide imported. Select it and enable it when ready.');
    }
  } catch (error) {
    setStyleGuideStatus(error.message || 'Could not import that style guide.', true);
  } finally {
    importStyleGuideButton.disabled = false;
  }
});
input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    checkWriting();
  }
});
checkingMode.addEventListener('change', updateCheckingPreferences);
checkingDelay.addEventListener('input', () => { checkingDelayValue.textContent = `${checkingDelay.value} ms`; });
checkingDelay.addEventListener('change', updateCheckingPreferences);
checkingSensitivity.addEventListener('input', () => { checkingSensitivityValue.textContent = `${checkingSensitivity.value}%`; });
checkingSensitivity.addEventListener('change', updateCheckingPreferences);
Object.values(checkingCategoryInputs).forEach((control) => control.addEventListener('change', updateCheckingPreferences));
window.ikmal.onServiceState(updateServiceState);
window.ikmal.onServiceError((message) => showFailureNotice(message, {
  retry: () => window.ikmal.getServiceState().then(updateServiceState),
  details: message,
}));
window.ikmal.onQuickCheck((text) => {
  input.value = text;
  updateWordCount();
  selectPanel('writing-panel');
  checkWriting();
});
window.ikmal.onCompactInvoked(() => {
  selectPanel('writing-panel');
  input.focus();
});
window.ikmal.onShowHistory(() => selectPanel('history-panel'));
window.ikmal.getServiceState().then(updateServiceState).catch((error) => showFailureNotice('Could not read service status.', {
  retry: () => window.ikmal.getServiceState().then(updateServiceState),
  details: error.stack || error.message,
}));
window.ikmal.getLaunchAtLogin().then((enabled) => { document.querySelector('#launch-toggle').checked = enabled; }).catch((error) => showFailureNotice('Could not read launch-at-login settings.', {
  retry: () => window.ikmal.getLaunchAtLogin().then((enabled) => { document.querySelector('#launch-toggle').checked = enabled; }),
  details: error.stack || error.message,
}));
window.ikmal.getDesktopPresence().then(renderDesktopPresence).catch(() => setPresenceNotice('Could not read app access settings.'));
loadSpellServerState();
loadOfficeBridgeState();
window.ikmal.getAnnotationPreferences().then((preferences) => annotationControls.apply(preferences)).catch(() => annotationControls.apply(window.IkmalAnnotationPreferences.defaults));
window.ikmal.onAnnotationPreferences((preferences) => annotationControls.apply(preferences));
window.ikmal.getCheckingPreferences().then(renderCheckingPreferences).catch(() => renderCheckingPreferences(checkingPreferences));
window.ikmal.onCheckingPreferences(renderCheckingPreferences);
// Settings groups behave as an accordion. Each is short on its own, but the
// compact window only shows ~296px of panel, so several open at once turns the
// panel into a very long scroll with the thing you opened somewhere in the
// middle of it. Opening one closes the rest, which bounds the scroll to the
// summaries plus a single expanded group.
document.querySelectorAll('#settings-panel details.settings-group').forEach((group) => {
  group.addEventListener('toggle', () => {
    if (!group.open) return;
    document.querySelectorAll('#settings-panel details.settings-group').forEach((other) => {
      if (other !== group) other.open = false;
    });
    // Bring the newly opened group's summary to the top rather than leaving it
    // wherever the collapse of the others happened to move it.
    group.scrollIntoView({ block: 'nearest' });
  });
});

focusModeButtons.forEach((button) => button.addEventListener('click', () => applyFocusMode(button.dataset.mode)));
window.ikmal.getFocusMode().then(renderFocusState).catch(() => {});
window.ikmal.onFocusMode(renderFocusState);

loadStyleGuideState();
loadIntegrationStatus();
loadQualityStatus();
loadRecentChecks();
updateWordCount();
resizeCompactWindow();
if (input.value.trim()) setTimeout(() => { if (checkingPreferences.mode === 'automatic') checkWriting(); else setWritingStatus('good', 'Ready to check'); }, 150);
