const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vpnwatch', {
  submit: (value) => ipcRenderer.send('country-submit', value),
  cancel: () => ipcRenderer.send('country-cancel'),
});