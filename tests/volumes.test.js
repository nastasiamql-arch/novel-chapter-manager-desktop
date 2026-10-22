'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {volumeOf,plan}=require('../web/volumes.js');
const chapters=(...numbers)=>numbers.map(number=>({number,text:'บทที่ '+number}));
test('volume mapping based on chapter number',()=>{
 assert.equal(volumeOf(1),1);assert.equal(volumeOf(100),1);
 assert.equal(volumeOf(101),2);assert.equal(volumeOf(200),2);
 assert.equal(volumeOf(201),3);assert.equal(volumeOf(690),7);
 assert.equal(volumeOf(701),8);
});
test('chapter 95-110 splits across volumes and keeps story name',()=>{
 const groups=plan(chapters(...Array.from({length:16},(_,i)=>i+95)),{prefix:'เซียนหุ้นย้อนเวลา',perDoc:100});
 assert.deepEqual(groups.map(x=>x.volume),[1,2]);
 assert.deepEqual(groups.map(x=>[x.first,x.last]),[[95,100],[101,110]]);
 assert.equal(groups[1].title,'เซียนหุ้นย้อนเวลา เล่ม 2 (บท 101-110)');
});
test('independent exports of 101-200 never start at volume 1',()=>{
 const groups=plan(chapters(101,102,200),{prefix:'เรื่อง B',perDoc:100});
 assert.equal(groups[0].title,'เรื่อง B เล่ม 2 (บท 101-200)');
});
test('one volume subdivided by perDoc has unique parts',()=>{
 const groups=plan(chapters(...Array.from({length:100},(_,i)=>i+101)),{prefix:'เรื่อง A',perDoc:30});
 assert.equal(groups.length,4);
 assert.equal(groups[0].title,'เรื่อง A เล่ม 2 ส่วน 1-4 (บท 101-130)');
 assert.equal(groups[3].title,'เรื่อง A เล่ม 2 ส่วน 4-4 (บท 191-200)');
});
test('refuses duplicates, invalid numbers and missing story name',()=>{
 assert.throws(()=>plan(chapters(1,1),{prefix:'A'}),/ซ้ำ/);
 assert.throws(()=>plan(chapters(0),{prefix:'A'}),/เลขบท/);
 assert.throws(()=>plan(chapters(1),{prefix:''}),/ชื่อนิยาย/);
});