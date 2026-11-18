const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("downloader", {
  selectDirectory: () => ipcRenderer.invoke("dialog:select-directory"),
  start: (options) => ipcRenderer.invoke("download:start", options),
  pause: () => ipcRenderer.invoke("download:pause"),
  resume: (delayMs) => ipcRenderer.invoke("download:resume", delayMs),
  cancel: () => ipcRenderer.invoke("download:cancel"),
  onProgress: (callback) => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on("download:progress", listener);
    return () => ipcRenderer.removeListener("download:progress", listener);
  },
});
