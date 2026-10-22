'use strict';
const path = require('node:path');
const { app, BrowserWindow, ipcMain, shell, dialog, safeStorage } = require('electron');
const fs = require('node:fs/promises');
const { authorizeDesktop, refresh } = require('./oauth');
const credentialsStore=require('./credential-store');
const store = require('./workspace-store');
let win, connecting = false, googleToken = '', googleExpiry=0;
let credentialQueue=Promise.resolve();
const vault=()=>app.getPath('userData');
function persist(value){const task=credentialQueue.catch(()=>{}).then(()=>credentialsStore.save(vault(),safeStorage,value));credentialQueue=task;return task;}
async function getCredentials(){return credentialsStore.load(vault(),safeStorage);}
async function ensureGoogleToken(){
  if(googleToken&&Date.now()<googleExpiry-60000)return googleToken;
  const saved=await getCredentials();
  if(!saved?.refresh_token)throw Error('กรุณาเชื่อม Google ใหม่');
  try{
    const data=await refresh(saved);
    if(data.refresh_token)saved.refresh_token=data.refresh_token;
    googleToken=data.access_token;googleExpiry=Date.now()+(Number(data.expires_in)||3600)*1000;
    if(data.refresh_token)await persist(saved);
    return googleToken;
  }catch(e){
    googleToken='';googleExpiry=0;
    if(e.oauthCode==='invalid_grant')throw Error('Google ยกเลิกสิทธิ์ที่เคยอนุญาต กรุณาเชื่อมใหม่');
    throw e;
  }
}
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
  const verify=event=>{if(event.sender!==win?.webContents)throw Error('Unauthorized window');};
  ipcMain.handle('google:import',async event=>{
    verify(event);
    const picker=await dialog.showOpenDialog(win,{title:'เลือก OAuth Desktop JSON จาก Google Cloud',properties:['openFile'],filters:[{name:'Google OAuth JSON',extensions:['json']}]});
    if(picker.canceled||!picker.filePaths.length)return {cancelled:true};
    const raw=await fs.readFile(picker.filePaths[0]);
    if(raw.byteLength>32768)throw Error('ไฟล์ OAuth ใหญ่ผิดปกติ');
    const imported=credentialsStore.validateCredentials(JSON.parse(raw.toString('utf8')));
    // Do not modify the existing authorization if secure storage is unavailable.
    await persist(imported);
    googleToken='';googleExpiry=0;
    return {clientId:imported.client_id};
  });
  ipcMain.handle('google:status',async event=>{
    verify(event);
    const saved=await getCredentials();
    if(!saved)return {configured:false,connected:false};
    if(!saved.refresh_token)return {configured:true,connected:false,clientId:saved.client_id};
    try{
      await ensureGoogleToken();
      return {configured:true,connected:true,clientId:saved.client_id};
    }catch(e){return {configured:true,connected:false,clientId:saved.client_id,message:e.message};}
  });
  ipcMain.handle('google:connect',async(event,clientId)=>{
    verify(event);
    if(connecting)throw Error('Google connection already in progress');
    connecting=true;
    try{
      const saved=await getCredentials();
      if(!saved)throw Error('กรุณานำเข้าไฟล์ OAuth JSON ประเภท Desktop app ก่อน');
      if(clientId && clientId!==saved.client_id)throw Error('Client ID ไม่ตรงกับไฟล์ OAuth ที่นำเข้า โปรดเลือกไฟล์ JSON ให้ถูกต้อง');
      const data=await authorizeDesktop(saved,url=>shell.openExternal(url));
      if(!data.refresh_token)throw Error('Google ไม่ส่ง refresh_token กรุณาถอนสิทธิ์เดิมแล้วเชื่อมใหม่');
      await persist({...saved,refresh_token:data.refresh_token});
      googleToken=data.access_token;googleExpiry=Date.now()+(Number(data.expires_in)||3600)*1000;
      return {connected:true};
    }finally{connecting=false;}
  });
  ipcMain.handle('google:disconnect',async event=>{
    verify(event);
    googleToken='';googleExpiry=0;
    await credentialsStore.clear(vault());
    return true;
  });
  ipcMain.handle('google:request',async(event,address,method='GET',body=null)=>{
    verify(event);
    if(!['GET','POST'].includes(method))throw Error('Blocked method');
    const url=validateDocsUrl(address);
    const json=body===null?null:JSON.stringify(body);
    if(json&&Buffer.byteLength(json)>MAX_REQUEST_BYTES)throw Error('Google request too large');
    const access=await ensureGoogleToken();
    let response;
    try{response=await fetch(url,{method,headers:{Authorization:'Bearer '+access,
      ...(json?{'Content-Type':'application/json'}:{})},body:json,signal:AbortSignal.timeout(60000)});}
    catch(e){throw Error('เครือข่ายขัดข้อง: '+e.message+' — ตรวจเอกสารก่อนลองใหม่เพื่อเลี่ยงส่งซ้ำ');}
    if(response.status===401){googleToken='';googleExpiry=0;}
    if(!response.ok){
      const message=(await response.text()).slice(0,1500);let detail=message;
      try{detail=JSON.parse(message).error?.message||message;}catch{}
      throw Error('Google API '+response.status+': '+String(detail).slice(0,650));
    }
    return response.status===204?{}:response.json();
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
