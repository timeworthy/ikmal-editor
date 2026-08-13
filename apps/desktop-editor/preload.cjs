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
  onServiceState: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('service-state', listener);
    return () => ipcRenderer.removeListener('service-state', listener);
  },

  // Privacy and data — what is kept on this machine, and removing it.
  getRecentChecks: () => ipcRenderer.invoke('recent-checks'),
  clearRecentChecks: () => ipcRenderer.invoke('clear-recent-checks'),
  openThirdPartyNotices: () => ipcRenderer.invoke('open-third-party-notices'),
});
