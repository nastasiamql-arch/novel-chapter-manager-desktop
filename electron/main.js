'use strict';
const path = require('node:path');
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { authorizeDesktop } = require('./oauth');
let win, connecting = false;
function createWindow() {
  win = new BrowserWindow({
    width: 1260, height: 840, minWidth: 800, minHeight: 600,
    title: 'Novel Chapter Manager Desktop',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true
    }
  });
  win.webContents.setWindowOpenHandler(({url}) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return {action:'deny'};
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) {
      event.preventDefault();
      if (url.startsWith('https://')) void shell.openExternal(url);
    }
  });
  void win.loadFile(path.join(__dirname, '..', 'web', 'index.html'));
}
app.whenReady().then(() => {
  ipcMain.handle('google:connect', async (event, clientId) => {
    if (event.sender !== win?.webContents) throw new Error('Unauthorized window');
    if (connecting) throw new Error('Google connection already in progress');
    connecting = true;
    try { return await authorizeDesktop(clientId, url => shell.openExternal(url)); }
    finally { connecting = false; }
  });
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
