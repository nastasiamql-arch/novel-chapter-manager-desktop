'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../web/core.js');
const parse = (name,text) => core.parseSource({id:name,name,text});
test('splits Thai chapters without losing content', () => {
  const source = '\ufeffบทที่ ๖๙๐ เปิดเรื่อง\r\nคำไทย\r\n[จบตอน]\r\nบทที่ 691 ต่อ\r\nต่อไป\r\n[จบบท]';
  const result = parse('novel.txt',source);
  assert.equal(result.exactMatch,true);
  assert.deepEqual(result.chapters.map(x=>x.number),[690,691]);
  assert.equal(result.chapters.map(x=>x.originalText).join(''),source);
});
test('reports missing and duplicate chapters', () => {
  const a = parse('a.txt','บทที่ 1 A\nข้อความ\n[จบตอน]\nบทที่ 3 C\nข้อความ');
  const b = parse('b.txt','บทที่ 3 D\nข้อความ\n[จบบท]');
  const audit = core.audit([...a.chapters,...b.chapters],[a,b]);
  assert.deepEqual(audit.duplicates,[3]);
  assert.deepEqual(audit.missing,[2]);
  assert.equal(audit.incomplete.length,1);
});
test('preserves text before first chapter', () => {
  const p = parse('novel.txt','Notes\nบทที่ 2 Title\nText\n[จบตอน]');
  assert.equal(p.exactMatch,true);
  assert.equal(p.prefix,'Notes\n');
});
test('escapes Word XML characters', () => {
  assert.match(core.docxXML('A & B < C'),/A &amp; B &lt; C/);
});
