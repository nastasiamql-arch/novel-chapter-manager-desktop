'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('NovelDesktop', Object.freeze({
  googleConnect: clientId => ipcRenderer.invoke('google:connect', clientId)
}));
