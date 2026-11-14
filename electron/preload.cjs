const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('desktop', {
  getState: () => ipcRenderer.invoke('get-state'),
  getQr: address => ipcRenderer.invoke('get-qr', address),
  rotateCode: () => ipcRenderer.invoke('rotate-code'),
  revokeDevice: id => ipcRenderer.invoke('revoke-device', id),
  saveSettings: values => ipcRenderer.invoke('save-settings', values),
  hide: () => ipcRenderer.invoke('hide-window'),
  onState: callback => {
    const listener = (_, state) => callback(state)
    ipcRenderer.on('state', listener)
    return () => ipcRenderer.removeListener('state', listener)
  }
})
