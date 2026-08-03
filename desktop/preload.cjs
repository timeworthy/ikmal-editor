const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ikmal', {
  getServiceState: () => ipcRenderer.invoke('service-state'),
  startServices: () => ipcRenderer.invoke('start-services'),
  stopServices: () => ipcRenderer.invoke('stop-services'),
  getIntegrationStatus: () => ipcRenderer.invoke('integration-status'),
  configureIntegrations: (targetIDs) => ipcRenderer.invoke('configure-integrations', targetIDs),
  checkText: (text) => ipcRenderer.invoke('check-text', text),
  getRecentChecks: () => ipcRenderer.invoke('recent-checks'),
  clearRecentChecks: () => ipcRenderer.invoke('clear-recent-checks'),
  getStyleGuideState: () => ipcRenderer.invoke('style-guide-state'),
  selectStyleGuide: (id) => ipcRenderer.invoke('style-guide-select', id),
  setStyleGuideEnabled: (enabled) => ipcRenderer.invoke('style-guide-enabled', enabled),
  getLaunchAtLogin: () => ipcRenderer.invoke('get-launch-at-login'),
  setLaunchAtLogin: (enabled) => ipcRenderer.invoke('set-launch-at-login', enabled),
  onServiceState: (callback) => ipcRenderer.on('service-state', (_, state) => callback(state)),
  onServiceError: (callback) => ipcRenderer.on('service-error', (_, message) => callback(message)),
  onQuickCheck: (callback) => ipcRenderer.on('quick-check', (_, text) => callback(text)),
  onShowHistory: (callback) => ipcRenderer.on('show-history', () => callback()),
});
