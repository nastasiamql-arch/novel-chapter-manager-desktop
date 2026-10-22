'use strict';
const path = require('node:path');
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { authorizeDesktop } = require('./oauth');
const store = require('./workspace-store');
let win, connecting = false, googleToken = '';
let saveQueue = Promise.resolve();
const MAX_REQUEST_BYTES = 2_000_000;
function validateDocsUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== 'docs.googleapis.com' ||
      !url.pathname.startsWith('/v1/documents')) throw Error('Blocked Google Docs URL');
  return url.href;
}
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
    try {
      googleToken = '';
      const response = await authorizeDesktop(clientId, url => shell.openExternal(url));
      googleToken = response.access_token;
      return { connected: true };
    } finally { connecting = false; }
  });
  ipcMain.handle('google:disconnect', event => {
    if (event.sender !== win?.webContents) throw Error('Unauthorized window');
    googleToken = '';
    return true;
  });
  ipcMain.handle('google:request', async (event, address, method='GET', body=null) => {
    if (event.sender !== win?.webContents) throw Error('Unauthorized window');
    if (!googleToken) throw Error('กรุณาเชื่อม Google ใหม่');
    if (!['GET','POST'].includes(method)) throw Error('Blocked method');
    const url = validateDocsUrl(address);
    const json = body===null ? null : JSON.stringify(body);
    if (json && Buffer.byteLength(json) > MAX_REQUEST_BYTES) throw Error('Google request too large');
    let response;
    try {
      response = await fetch(url, {method, headers: {
        Authorization:'Bearer '+googleToken, ...(json?{'Content-Type':'application/json'}:{})
      }, body:json,signal:AbortSignal.timeout(60000)});
    } catch(e) { throw Error('เครือข่ายขัดข้อง: '+e.message+' — ตรวจเอกสารก่อนลองใหม่เพื่อเลี่ยงส่งซ้ำ'); }
    if(response.status===401)googleToken='';
    if(!response.ok){
      const message=(await response.text()).slice(0,1500);
      let detail=message;
      try {detail=JSON.parse(message).error?.message || message;} catch{}
      throw Error('Google API '+response.status+': '+String(detail).slice(0,650));
    }
    return response.status===204 ? {} : response.json();
  });
  ipcMain.handle('workspace:load', async event => {
    if (event.sender !== win?.webContents) throw Error('Unauthorized window');
    return store.load(app.getPath('userData'));
  });
  ipcMain.handle('workspace:save', (event, snapshot) => {
    if (event.sender !== win?.webContents) throw Error('Unauthorized window');
    // Serial writes avoid one large earlier snapshot replacing a later snapshot.
    const operation=saveQueue.catch(()=>{}).then(()=>store.save(app.getPath('userData'),snapshot));
    saveQueue=operation;
    return operation;
  });
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
