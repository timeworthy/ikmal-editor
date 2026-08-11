const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ikmal', {
  checkText: (text) => ipcRenderer.invoke('check-text', String(text ?? '')),
  addDictionaryWord: (word) => ipcRenderer.invoke('add-dictionary-word', String(word ?? '')),
  onEditorText: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, text) => callback(String(text ?? ''));
    ipcRenderer.on('editor-text', listener);
    return () => ipcRenderer.removeListener('editor-text', listener);
  },
});
