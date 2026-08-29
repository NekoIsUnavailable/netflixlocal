const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  scanDirectory: (dirPath) => ipcRenderer.invoke('scan-directory', dirPath),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  selectFile: () => ipcRenderer.invoke('select-file'),
  playInExternalPlayer: (playerPath, videoPath) => ipcRenderer.invoke('play-in-external-player', playerPath, videoPath),
  onScanProgress: (callback) => {
    const handler = (_, payload) => callback(payload);
    ipcRenderer.on('scan-progress', handler);
    return handler;
  },
  offScanProgress: (handler) => {
    ipcRenderer.removeListener('scan-progress', handler);
  }
});
