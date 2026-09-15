const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('bidstrat', {
  retry: () => ipcRenderer.send('desktop-retry'),
  openDataDir: () => ipcRenderer.send('desktop-open-datadir'),
})
