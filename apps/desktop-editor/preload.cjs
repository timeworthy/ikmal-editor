const { contextBridge, ipcRenderer } = require('electron');

// The editor's capability surface.
//
// The writing capabilities came first; the settings ones are here because
// settings live in this window and nowhere else. The launcher deliberately
// cannot reach any of them — one settings implementation is the point, and a
// capability exposed in two places is how a second one starts.
//
// Every channel already exists in the shell. Nothing was added to the main
// process for this.
const subscribe = (channel) => (callback) => {
  if (typeof callback !== 'function') return () => {};
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('ikmal', {
  // Writing
  checkText: (text) => ipcRenderer.invoke('check-text', String(text ?? '')),
  addDictionaryWord: (word) => ipcRenderer.invoke('add-dictionary-word', String(word ?? '')),
  onEditorText: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, text) => callback(String(text ?? ''));
    ipcRenderer.on('editor-text', listener);
    return () => ipcRenderer.removeListener('editor-text', listener);
  },

  // A failure with nobody listening is a failure the user meets as the product
  // silently not working. Four sites send this, including a manager binary that
  // cannot be found.
  onServiceError: subscribe('service-error'),

  // The shell is the authority on what a preference ended up as — it clamps and
  // rounds — and it announces the result. Without these, a settings page shows
  // what it asked for rather than what was kept, and two windows disagree.
  onCheckingPreferences: subscribe('checking-preferences'),
  onAnnotationPreferences: subscribe('annotation-preferences'),

  // The tray's "Recent checks" opens this window at the section that holds them.
  onShowHistory: subscribe('show-history'),

  // Checking — what the product does while you write.
  getCheckingPreferences: () => ipcRenderer.invoke('get-checking-preferences'),
  setCheckingPreferences: (settings) => ipcRenderer.invoke('set-checking-preferences', settings),

  // Appearance — marks, and where the app shows itself.
  getAnnotationPreferences: () => ipcRenderer.invoke('get-annotation-preferences'),
  setAnnotationPreferences: (settings) => ipcRenderer.invoke('set-annotation-preferences', settings),
  getDesktopPresence: () => ipcRenderer.invoke('desktop-presence-state'),
  setDesktopPresence: (settings) => ipcRenderer.invoke('set-desktop-presence', settings),
  getLaunchAtLogin: () => ipcRenderer.invoke('get-launch-at-login'),
  setLaunchAtLogin: (enabled) => ipcRenderer.invoke('set-launch-at-login', Boolean(enabled)),

  // Rules — an imported guide can be selected and separately enabled, because
  // turning one off should not mean deleting it.
  getStyleGuideState: () => ipcRenderer.invoke('style-guide-state'),
  importStyleGuide: () => ipcRenderer.invoke('import-style-guide'),
  selectStyleGuide: (id) => ipcRenderer.invoke('style-guide-select', id),
  setStyleGuideEnabled: (enabled) => ipcRenderer.invoke('style-guide-enabled', Boolean(enabled)),

  // Services and diagnostics.
  getServiceState: () => ipcRenderer.invoke('service-state'),
  startServices: () => ipcRenderer.invoke('start-services'),
  stopServices: () => ipcRenderer.invoke('stop-services'),
  onServiceState: subscribe('service-state'),

  // The optional local model: the one part of this product that installs
  // third-party code and model weights onto the user's machine.
  getQualityStatus: () => ipcRenderer.invoke('quality-status'),
  installQualityStack: (acknowledged) => ipcRenderer.invoke('quality-setup', acknowledged === true),

  // ikmal's own browser extension — a separate product from LanguageTool's.
  revealExtension: () => ipcRenderer.invoke('reveal-extension'),

  // Integrations — ikmal's own adapters, and LanguageTool's plugins pointed at
  // this machine. The distinction matters and the card keeps it.
  getIntegrationStatus: () => ipcRenderer.invoke('integration-status'),
  configureIntegrations: (targets) => ipcRenderer.invoke('configure-integrations', targets),

  // Native macOS spell service.
  getSpellServerState: () => ipcRenderer.invoke('spell-server-state'),
  installSpellServer: () => ipcRenderer.invoke('install-spell-server'),
  removeSpellServer: () => ipcRenderer.invoke('remove-spell-server'),

  // Office bridge: certificate, server, and the per-host manifests.
  getOfficeBridgeState: () => ipcRenderer.invoke('office-bridge-state'),
  generateOfficeCertificate: () => ipcRenderer.invoke('office-bridge-generate-certificate'),
  removeOfficeCertificate: () => ipcRenderer.invoke('office-bridge-remove-certificate'),
  startOfficeBridge: () => ipcRenderer.invoke('office-bridge-start'),
  stopOfficeBridge: () => ipcRenderer.invoke('office-bridge-stop'),
  revealOfficeManifest: (host) => ipcRenderer.invoke(({
    word: 'office-reveal-manifest',
    excel: 'office-reveal-excel-manifest',
    powerpoint: 'office-reveal-powerpoint-manifest',
    outlook: 'office-reveal-outlook-manifest',
    onenote: 'office-reveal-onenote-manifest',
    project: 'office-reveal-project-manifest',
  })[host] || 'office-reveal-manifest'),

  // Privacy and data — what is kept on this machine, and removing it.
  getRecentChecks: () => ipcRenderer.invoke('recent-checks'),
  clearRecentChecks: () => ipcRenderer.invoke('clear-recent-checks'),
  getAppVersion: () => ipcRenderer.invoke('app-version'),
  openThirdPartyNotices: () => ipcRenderer.invoke('open-third-party-notices'),
});
