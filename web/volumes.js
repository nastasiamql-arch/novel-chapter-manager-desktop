/* Deterministic volume grouping: chapters 1-100 -> volume 1, 101-200 -> volume 2. */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.NovelVolume=api;
})(typeof window!=='undefined'?window:null,function(){
'use strict';
const VOLUME_SIZE=100;
function volumeOf(number){
  if(!Number.isSafeInteger(number)||number<1)throw Error('เลขบทต้องเป็นจำนวนเต็มเริ่มจาก 1');
  return Math.floor((number-1)/VOLUME_SIZE)+1;
}
function plan(chapters,options={}){
  if(!Array.isArray(chapters)||!chapters.length)throw Error('ไม่มีบทสำหรับสร้างเอกสาร');
  const perDoc=Number(options.perDoc??100);
  if(!Number.isInteger(perDoc)||perDoc<1||perDoc>100)throw Error('จำนวนบทต่อเอกสารต้องอยู่ระหว่าง 1–100');
  const prefix=String(options.prefix||'').trim();
  if(!prefix||prefix.length>110)throw Error('กรุณากรอกชื่อนิยายก่อนสร้าง Google Docs (ไม่เกิน 110 ตัวอักษร)');
  const byVolume=new Map(),numbers=new Set();
  for(const ch of chapters){
    const number=ch?.number;
    const volume=volumeOf(number);
    if(numbers.has(number))throw Error('พบบทที่ '+number+' ซ้ำ โปรดเอาบทซ้ำออกก่อนส่งออก');
    numbers.add(number);
    if(!byVolume.has(volume))byVolume.set(volume,[]);
    byVolume.get(volume).push(ch);
  }
  const result=[];
  for(const [volume,items] of [...byVolume].sort((a,b)=>a[0]-b[0])){
    items.sort((a,b)=>a.number-b.number);
    const parts=Math.ceil(items.length/perDoc);
    for(let i=0;i<parts;i++){
      const group=items.slice(i*perDoc,(i+1)*perDoc);
      const first=group[0].number,last=group[group.length-1].number;
      // An explicit "part" distinguishes multiple documents in the same volume.
      const suffix=parts>1?' ส่วน '+(i+1)+'-'+parts:'';
      result.push({
        volume,part:i+1,parts,chapters:group,
        first,last,
        title:prefix+' เล่ม '+volume+suffix+' (บท '+first+'-'+last+')'
      });
    }
  }
  return result;
}
return {VOLUME_SIZE,volumeOf,plan};
});