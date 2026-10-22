'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../web/google.js'),'utf8');
const context={window:{},URL,URLSearchParams,console,setTimeout,clearTimeout};
vm.runInNewContext(source,context);
const name=ch=>context.window.GooglePublisher.tabName(ch);
test('short titles remain unchanged',()=>{
  assert.equal(name({number:1,title:'เริ่มต้น'}),'บทที่ 1 เริ่มต้น');
  assert.equal(name({number:2,title:''}),'บทที่ 2');
});
test('only over-limit title falls back to chapter number',()=>{
  const ch={number:120,title:'ท'.repeat(60)};
  assert.equal(name(ch),'บทที่ 120');
  assert.equal(name({number:1,title:'ก'.repeat(60)}),'บทที่ 1');
});
test('exactly 50 characters remain complete and manuscript stays intact',()=>{
  const prefix='บทที่ 1 ';
  const title='ท'.repeat(50-prefix.length);
  const ch={number:1,title,text:prefix+title+'\nเนื้อหาต้นฉบับ\n[จบตอน]'};
  assert.equal(name(ch).length,50);
  assert.equal(name(ch),prefix+title);
  assert.equal(ch.text,prefix+title+'\nเนื้อหาต้นฉบับ\n[จบตอน]');
});
