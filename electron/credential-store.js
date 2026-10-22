'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');

const CLIENT_ID = /^\d+-[a-z0-9_-]+\.apps\.googleusercontent\.com$/;
function validateCredentials(raw) {
  const value = raw && typeof raw === 'object' ? raw.installed : null;
  if (!value || !CLIENT_ID.test(String(value.client_id || '')) ||
      typeof value.client_secret !== 'string' || !value.client_secret.trim() ||
      value.client_secret.length > 2048) {
    throw new Error('โปรดเลือก OAuth JSON ประเภท Desktop app จาก Google Cloud (ต้องมี installed.client_id และ client_secret)');
  }
  return { version:1, client_id:value.client_id, client_secret:value.client_secret, refresh_token:'' };
}
function filename(dir) { return path.join(dir, 'google-oauth.enc'); }
function encryptionReady(safeStorage) {
  if (!safeStorage?.isEncryptionAvailable?.() ||
      safeStorage.getSelectedStorageBackend?.() === 'basic_text') {
    throw new Error('ระบบเข้ารหัสข้อมูลของเครื่องไม่พร้อมใช้งาน จึงไม่บันทึก OAuth หรือ Refresh Token');
  }
}
function check(value) {
  if (!value || value.version !== 1 || !CLIENT_ID.test(value.client_id) ||
      typeof value.client_secret !== 'string' || !value.client_secret ||
      typeof value.refresh_token !== 'string' ||
      value.client_secret.length > 2048 || value.refresh_token.length > 8192) {
    throw new Error('ข้อมูล OAuth ที่บันทึกไม่ถูกต้อง');
  }
  return { version:1, client_id:value.client_id, client_secret:value.client_secret, refresh_token:value.refresh_token };
}
async function load(dir,safeStorage) {
  let encrypted;
  try { encrypted=await fs.readFile(filename(dir)); }
  catch(e) { if(e.code==='ENOENT')return null; throw e; }
  encryptionReady(safeStorage);
  if(encrypted.length > 65536)throw new Error('ไฟล์ OAuth ใหญ่ผิดปกติ');
  try { return check(JSON.parse(safeStorage.decryptString(encrypted))); }
  catch { throw new Error('อ่านข้อมูล OAuth ที่เข้ารหัสไม่ได้ (ไฟล์เดิมยังอยู่ ไม่ถูกเขียนทับ)'); }
}
async function save(dir,safeStorage,record) {
  encryptionReady(safeStorage);
  const data=check(record);
  const encrypted=safeStorage.encryptString(JSON.stringify(data));
  await fs.mkdir(dir,{recursive:true});
  const tmp=filename(dir)+'.tmp';
  try {
    await fs.writeFile(tmp,encrypted,{mode:0o600});
    await fs.rename(tmp,filename(dir));
  } finally { await fs.rm(tmp,{force:true}).catch(()=>{}); }
}
async function clear(dir) { await fs.rm(filename(dir),{force:true}); }
module.exports={validateCredentials,load,save,clear,filename};
