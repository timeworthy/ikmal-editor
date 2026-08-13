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
// Subscribing to an event the shell already sends is not a new capability, so
// these do not widen the launcher's surface in the sense the forbidden list
// means. What they end is the shell talking to nobody: the tray's "Quick check
// clipboard" and "Recent checks" sent events this window never listened for, so
// both items did nothing, and four service failures — including a manager
// binary that cannot be found — reported themselves to a listener that did not
// exist.
const subscribe = (channel) => (callback) => {
  if (typeof callback !== 'function') return () => {};
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('ikmal', {
  checkText: (text) => ipcRenderer.invoke('check-text', String(text ?? '')),

  // The shell speaking. A failure nobody renders is a failure the user meets as
  // the product silently not working.
  onServiceError: subscribe('service-error'),
  // The tray checks whatever is on the clipboard, and this window is where the
  // result goes.
  onQuickCheck: subscribe('quick-check'),
  // The tray opened this window on purpose, so the field should be ready to
  // type into rather than needing to be clicked first.
  onCompactInvoked: subscribe('compact-invoked'),
  // Recent checks live in the editor's Privacy section, which is where this
  // routes rather than growing a second copy of them here.
  onShowHistory: subscribe('show-history'),

  // Services: what is running, and starting or stopping it.
  getServiceState: () => ipcRenderer.invoke('service-state'),
  startServices: () => ipcRenderer.invoke('start-services'),
  stopServices: () => ipcRenderer.invoke('stop-services'),
  onServiceState: subscribe('service-state'),

  // Focus modes. Quick controls belong next to the writing, not in settings.
  getFocusMode: () => ipcRenderer.invoke('focus-mode-state'),
  setFocusMode: (mode, duration) => ipcRenderer.invoke('set-focus-mode', { mode, duration }),
  onFocusMode: subscribe('focus-mode'),

  // The route into the editor, carrying whatever is in the quick-check field.
  // Settings live there; this is how the launcher's gear reaches them.
  // The launcher sizes its own window to what it is showing. This is a
  // launcher-shell concern and belongs here: it is on the editor's forbidden
  // list precisely because that window is not the one it describes.
  setCompactHeight: (height) => ipcRenderer.invoke('set-compact-height', Number(height) || 0),
  openEditor: (text) => ipcRenderer.invoke('open-editor', String(text ?? '')),
});
