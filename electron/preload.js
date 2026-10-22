'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('NovelDesktop', Object.freeze({
  googleConnect: clientId => ipcRenderer.invoke('google:connect', clientId),
  googleDisconnect: () => ipcRenderer.invoke('google:disconnect'),
  googleRequest: (url, method, body) => ipcRenderer.invoke('google:request', url, method, body),
  workspaceLoad: () => ipcRenderer.invoke('workspace:load'),
  workspaceSave: snapshot => ipcRenderer.invoke('workspace:save', snapshot)
}));
