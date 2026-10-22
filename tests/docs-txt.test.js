'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const e=require('../web/docs-txt.js');
const tab=(id,title,text)=>({tabProperties:{tabId:id,title},documentTab:{body:{content:[{paragraph:{elements:[{textRun:{content:text}}]}}]}}});
test('exports chapters from tabs and preserves exact strings',()=>{
  const doc={documentId:'abcdefghijklmnop',title:'นิยาย เล่ม 2',tabs:[
    tab('x','บทที่ 101','บทที่ 101 บ้าน\nเนื้อหา\n[จบตอน]\n'),
    tab('y','บทที่ 102 พูดคุย','บทที่ 102 พูดคุย\nทดสอบ\n[จบตอน]\n')]};
  const result=e.makeFiles([e.extractDocument(doc)]);
  assert.deepEqual(result.files.map(f=>f.name),['บทที่ 101 บ้าน.txt','บทที่ 102 พูดคุย.txt']);
  assert.equal(result.files[0].text,'บทที่ 101 บ้าน\nเนื้อหา\n[จบตอน]\n');
});
test('supports Thai digits and nested tabs',()=>{
  const doc={documentId:'abcdefghijklmnop',title:'Test',tabs:[{...tab('a','สารบัญ','ignored'),childTabs:[tab('b','บทที่ ๑๐๑','บทที่ ๑๐๑ บ้าน\n[จบตอน]')]}]};
  assert.throws(()=>e.extractDocument(doc),/ไม่มีเลขบท/);
  assert.equal(e.parseHeading('บทที่ ๑๐๑ บ้าน').number,101);
});
test('rejects inconsistent chapter numbers and duplicate tabs',()=>{
  assert.throws(()=>e.extractDocument({documentId:'abcdefghijklmnop',tabs:[tab('1','บทที่ 101','บทที่ 102\n[จบตอน]')]}),/ไม่ตรง/);
  const d=e.extractDocument({documentId:'abcdefghijklmnop',tabs:[tab('1','บทที่ 1','บทที่ 1\n[จบตอน]'),tab('2','บทที่ 1','บทที่ 1\n[จบตอน]')]});
  assert.throws(()=>e.makeFiles([d]),/ซ้ำ/);
});
test('rejects unsupported rich elements instead of silent omission',()=>{
  const doc={documentId:'abcdefghijklmnop',tabs:[{tabProperties:{tabId:'1',title:'บทที่ 1'},documentTab:{body:{content:[{paragraph:{elements:[{inlineObjectElement:{inlineObjectId:'image'}}]}}]}}}]};
  assert.throws(()=>e.extractDocument(doc),/แปลงเป็น TXT ไม่ครบ/);
});
test('secure links and safe windows filenames',()=>{
  assert.deepEqual(e.parseLinks('https://docs.google.com/document/d/abcdefghijklmnop/edit\nhttps://docs.google.com/document/d/abcdefghijklmnop/edit'),['abcdefghijklmnop']);
  assert.throws(()=>e.docIdFrom('https://evil.com/document/d/abcdefghijklmnop/edit'),/docs.google.com/);
  assert.equal(e.safeName('บทที่ 1: ก/ข?'),'บทที่ 1 ก ข');
});