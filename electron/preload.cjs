const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  scanDirectory: (dirPath) => ipcRenderer.invoke('scan-directory', dirPath)
});
