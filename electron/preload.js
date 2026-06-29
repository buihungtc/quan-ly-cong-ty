const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Mở URL trong trình duyệt mặc định
  openExternal: (url) => ipcRenderer.send('open-external', url),

  // Lắng nghe khi main process gửi URLs về
  onUrlsReady: (callback) => ipcRenderer.on('urls-ready', (_, data) => callback(data)),
});
