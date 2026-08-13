const { contextBridge, ipcRenderer } = require('electron');

// The launcher's capability surface, and deliberately only that.
//
// The compact window is a launcher: quick check, service status, focus modes,
// and a way into the editor. It carries no settings, so it is not given the
// capabilities settings would need — a preload that exposed them would invite
// the duplication this rewrite exists to remove.
//
// Every channel here already exists in the shell; nothing new was added to the
// main process for the launcher.
contextBridge.exposeInMainWorld('ikmal', {
  checkText: (text) => ipcRenderer.invoke('check-text', String(text ?? '')),

  // Services: what is running, and starting or stopping it.
  getServiceState: () => ipcRenderer.invoke('service-state'),
  startServices: () => ipcRenderer.invoke('start-services'),
  stopServices: () => ipcRenderer.invoke('stop-services'),
  onServiceState: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('service-state', listener);
    return () => ipcRenderer.removeListener('service-state', listener);
  },

  // Focus modes. Quick controls belong next to the writing, not in settings.
  getFocusMode: () => ipcRenderer.invoke('focus-mode-state'),
  setFocusMode: (mode, duration) => ipcRenderer.invoke('set-focus-mode', { mode, duration }),
  onFocusMode: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('focus-mode', listener);
    return () => ipcRenderer.removeListener('focus-mode', listener);
  },

  // The route into the editor, carrying whatever is in the quick-check field.
  // Settings live there; this is how the launcher's gear reaches them.
  // The launcher sizes its own window to what it is showing. This is a
  // launcher-shell concern and belongs here: it is on the editor's forbidden
  // list precisely because that window is not the one it describes.
  setCompactHeight: (height) => ipcRenderer.invoke('set-compact-height', Number(height) || 0),
  openEditor: (text) => ipcRenderer.invoke('open-editor', String(text ?? '')),
});
