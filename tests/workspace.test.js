'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const store=require('../electron/workspace-store');
test('persists complete edited chapter snapshot and restores it',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'novel-chapter-'));
 try{
  const value={version:1,sourceSeq:1,sources:[{id:'source1',name:'a.txt',kind:'txt',text:'บทที่ ๑ Alpha\nHello\n[จบตอน]',chapters:[{sourceOrder:0,title:'Edited',text:'บทที่ ๑ Alpha\nEdited\n[จบตอน]',included:false}]}]};
  await store.save(dir,value);
  assert.deepEqual(await store.load(dir),value);
  const newer=structuredClone(value);newer.sources[0].chapters[0].included=true;
  await store.save(dir,newer);
  assert.deepEqual(await store.load(dir),newer);
  assert.deepEqual(JSON.parse(await fs.readFile(store.storePath(dir)+'.bak','utf8')),value);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('rejects inconsistent/invalid source snapshots without destroying last file',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'novel-chapter-'));
 try{
  const valid={version:1,sourceSeq:1,sources:[]};
  await store.save(dir,valid);
  await assert.rejects(()=>store.save(dir,{version:1,sourceSeq:1,sources:[{id:'source1',name:'a.txt',kind:'txt',text:'บทที่ 1\nHi\n[จบตอน]',chapters:[]}]}));
  assert.deepEqual(await store.load(dir),valid);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
