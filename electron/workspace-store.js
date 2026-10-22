'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { parseSource } = require('../web/core.js');

const MAX_SNAPSHOT_BYTES = 256 * 1024 * 1024;
function check(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== 1 ||
      !Array.isArray(value.sources) || value.sources.length > 500 ||
      !Number.isSafeInteger(value.sourceSeq) || value.sourceSeq < 0) throw Error('รูปแบบโปรเจกต์ไม่ถูกต้อง');
  const ids = new Set();
  const sources = value.sources.map(item => {
    if (!item || typeof item !== 'object' ||
      !/^source[1-9]\d*$/.test(item.id) || ids.has(item.id) ||
      typeof item.name !== 'string' || !item.name || item.name.length > 500 ||
      !['txt','docx','paste'].includes(item.kind) ||
      typeof item.text !== 'string' || item.text.length > 30 * 1024 * 1024 ||
      !Array.isArray(item.chapters) || item.chapters.length > 10000) throw Error('แหล่งข้อมูลโปรเจกต์ไม่ถูกต้อง');
    ids.add(item.id);
    const result = parseSource({id:item.id,name:item.name,kind:item.kind,text:item.text});
    if (!result.exactMatch || result.chapters.length !== item.chapters.length) throw Error('ข้อมูลต้นฉบับและบทไม่ตรงกัน');
    const chapters = item.chapters.map((chapter, i) => {
      if (!chapter || typeof chapter !== 'object' ||
          chapter.sourceOrder !== i || typeof chapter.included !== 'boolean' ||
          typeof chapter.title !== 'string' || chapter.title.length > 2000 ||
          typeof chapter.text !== 'string' || chapter.text.length > 30 * 1024 * 1024) {
        throw Error('ข้อมูลบทที่บันทึกไม่ถูกต้อง');
      }
      return {sourceOrder:i,included:chapter.included,title:chapter.title,text:chapter.text};
    });
    return {id:item.id,name:item.name,kind:item.kind,text:item.text,chapters};
  });
  return {version:1,sourceSeq:value.sourceSeq,sources};
}
function storePath(userData) { return path.join(userData, 'chapter-workspace.json'); }
async function load(userData) {
  const filename=storePath(userData);
  let text;
  try { text=await fs.readFile(filename,'utf8'); }
  catch (e) { if(e.code==='ENOENT')return null; throw e; }
  if(Buffer.byteLength(text,'utf8')>MAX_SNAPSHOT_BYTES)throw Error('โปรเจกต์ใหญ่เกินขีดจำกัด');
  try { return check(JSON.parse(text)); }
  catch(e) { throw Error('ไม่สามารถอ่านโปรเจกต์ที่บันทึกไว้ได้: '+e.message+' (ไฟล์เดิมยังอยู่ในเครื่อง)'); }
}
async function save(userData,input) {
  const checked=check(input);
  const text=JSON.stringify(checked);
  if(Buffer.byteLength(text,'utf8')>MAX_SNAPSHOT_BYTES)throw Error('โปรเจกต์เกิน 256 MB โปรดลดขนาดข้อมูล');
  await fs.mkdir(userData,{recursive:true});
  const filename=storePath(userData), temporary=filename+'.tmp', backup=filename+'.bak';
  // Never replace unreadable workspace with an empty or altered project.
  try { await load(userData); await fs.copyFile(filename,backup); }
  catch(e) { if(!/ENOENT/.test(e.code || '')) {
    if(e.code!=='ENOENT')throw e;
  }}
  try {
    await fs.writeFile(temporary,text,'utf8');
    await fs.rename(temporary,filename);
  } finally { await fs.rm(temporary,{force:true}).catch(()=>{}); }
  return {saved:true,bytes:Buffer.byteLength(text,'utf8')};
}
module.exports={check,load,save,storePath};
