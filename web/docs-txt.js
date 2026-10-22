/* Google Docs tab -> TXT extraction. Pure helpers shared by renderer/tests. */
(function(root,factory){
  'use strict';
  const value=factory();
  if(typeof module==='object'&&module.exports)module.exports=value;
  if(root)root.DocsTxtExport=value;
})(typeof window!=='undefined'?window:null,function(){
'use strict';
const THAI='๐๑๒๓๔๕๖๗๘๙';
const maxDocs=25, maxChapters=2000, maxTextBytes=256*1024*1024;
const toArabic=s=>String(s).replace(/[๐-๙]/g,c=>String(THAI.indexOf(c)));
function parseHeading(text){
  const first=String(text||'').replace(/^\uFEFF/,'').trim();
  const m=first.match(/^บทที่[\t ]*([0-9๐-๙]+)(?:[\t ]*[:：.\-–—]?[\t ]*(.*))?$/);
  if(!m)return null;
  const number=Number(toArabic(m[1]));
  return Number.isSafeInteger(number)&&number>=0?{number,title:(m[2]||'').trim()}:null;
}
function firstNonblank(text){
  return String(text||'').split(/\r\n|\n|\r/).find(line=>line.trim().length)||'';
}
function safeName(value,max=140){
  let out=String(value||'').replace(/[<>:"/\\|?*\x00-\x1F]/g,' ').replace(/\s+/g,' ').trim().replace(/[. ]+$/,'');
  if(!out)out='ไม่มีชื่อ';
  out=Array.from(out).slice(0,max).join('').replace(/[. ]+$/,'');
  if(/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(out))out='_'+out;
  return out;
}
function docIdFrom(value){
  const input=String(value||'').trim();
  if(/^[A-Za-z0-9_-]{15,}$/.test(input))return input;
  let url;
  try{url=new URL(input);}catch{throw Error('กรุณาใช้ลิงก์ Google Docs https://docs.google.com/document/d/.../edit');}
  if(url.protocol!=='https:'||url.hostname!=='docs.google.com')throw Error('ลิงก์ต้องมาจาก docs.google.com เท่านั้น');
  const match=url.pathname.match(/^\/document\/(?:u\/\d+\/)?d\/([A-Za-z0-9_-]{15,})(?:\/|$)/);
  if(!match)throw Error('ไม่พบ Document ID ในลิงก์ Google Docs');
  return match[1];
}
function parseLinks(value){
  const entries=String(value||'').split(/[\r\n]+/).map(v=>v.trim()).filter(Boolean);
  if(!entries.length)throw Error('กรุณาวางลิงก์ Google Docs อย่างน้อย 1 ลิงก์');
  if(entries.length>maxDocs)throw Error('รองรับครั้งละไม่เกิน '+maxDocs+' เอกสาร');
  return [...new Set(entries.map(docIdFrom))];
}
function readBlocks(elements,where){
  if(!Array.isArray(elements))throw Error('ไม่มีโครงสร้างเนื้อหาใน '+where);
  let text='';
  for(const part of elements){
    if(part.paragraph){
      if(!Array.isArray(part.paragraph.elements))continue;
      for(const leaf of part.paragraph.elements){
        if(typeof leaf.textRun?.content==='string')text+=leaf.textRun.content;
        else if(leaf.inlineObjectElement||leaf.richLink||leaf.person||leaf.footnoteReference||leaf.equation||leaf.autoText||leaf.pageBreak)
          throw Error('พบภาพ/ลิงก์พิเศษ/องค์ประกอบที่แปลงเป็น TXT ไม่ครบใน '+where+' — ไม่สร้างไฟล์ที่ข้อมูลอาจหาย');
      }
    }else if(part.table){
      const rows=part.table.tableRows||[];
      for(const row of rows){
        const cells=[];
        for(const cell of row.tableCells||[])cells.push(readBlocks(cell.content||[],where).replace(/\n+$/,''));
        text+=cells.join('\t')+'\n';
      }
    }else if(part.tableOfContents){
      text+=readBlocks(part.tableOfContents.content||[],where);
    }else if(part.sectionBreak){ /* layout metadata, no text */ }
    else throw Error('พบชนิดเนื้อหาที่ TXT ยังไม่รองรับใน '+where);
  }
  return text;
}
function getTabs(doc){
  if(!Array.isArray(doc?.tabs)||!doc.tabs.length)throw Error('Google Docs ไม่มีข้อมูล tabs หรือไม่เปิด includeTabsContent');
  const result=[];
  function visit(tab){
    if(!tab?.tabProperties?.tabId)throw Error('Google Docs ส่ง tabId ไม่ครบ');
    result.push(tab);
    for(const child of tab.childTabs||[])visit(child);
  }
  for(const t of doc.tabs)visit(t);
  return result;
}
function extractDocument(doc){
  const id=doc?.documentId;
  if(typeof id!=='string'||!id)throw Error('ไม่มี Document ID');
  const result=[],warnings=[];
  const tabs=getTabs(doc);
  for(const tab of tabs){
    const tabTitle=String(tab.tabProperties.title||'');
    const where='แท็บ '+(tabTitle||tab.tabProperties.tabId);
    const text=readBlocks(tab.documentTab?.body?.content,where);
    if(!text.trim())throw Error(where+' ว่างเปล่า กรุณาตรวจสอบก่อนดาวน์โหลด');
    const heading=parseHeading(firstNonblank(text));
    const tabHeading=parseHeading(tabTitle);
    if(heading&&tabHeading&&heading.number!==tabHeading.number)
      throw Error(where+' มีเลขบทไม่ตรงกับหัวบทในเนื้อหา ('+heading.number+' กับ '+tabHeading.number+')');
    const found=heading||tabHeading;
    if(!found)throw Error(where+' ไม่มีเลขบทแบบ “บทที่ 101” ให้ตรวจชื่อแท็บหรือหัวบทก่อน');
    if(!heading)warnings.push(where+' ไม่มีหัวบทในข้อความ ใช้เลขบทจากชื่อแท็บ');
    if(!/\[(?:จบตอน|จบบท)\]\s*$/.test(text.trimEnd()))warnings.push(where+' ไม่พบ [จบตอน] หรือ [จบบท] ที่ท้ายบท');
    const title=(heading?.title||tabHeading?.title||'').trim();
    result.push({number:found.number,title,text,tabId:tab.tabProperties.tabId,documentId:id,documentTitle:String(doc.title||'เอกสารไม่มีชื่อ')});
  }
  return {entries:result,warnings,documentTitle:String(doc.title||'เอกสารไม่มีชื่อ'),documentId:id};
}
function makeFiles(documents){
  if(!Array.isArray(documents)||!documents.length||documents.length>maxDocs)throw Error('จำนวนเอกสารไม่ถูกต้อง');
  const byNumber=new Map(),docs=new Set(),warnings=[];
  for(const document of documents){
    if(docs.has(document.documentId))throw Error('ลิงก์เอกสารซ้ำ: '+document.documentTitle);
    docs.add(document.documentId);
    warnings.push(...document.warnings);
    for(const chapter of document.entries){
      if(byNumber.has(chapter.number))
        throw Error('พบบทที่ '+chapter.number+' ซ้ำระหว่างเอกสาร '+byNumber.get(chapter.number).documentTitle+' และ '+chapter.documentTitle+' — กรุณาแยกดาวน์โหลดแต่ละเรื่อง');
      byNumber.set(chapter.number,chapter);
    }
  }
  if(!byNumber.size||byNumber.size>maxChapters)throw Error('จำนวนบทไม่ถูกต้อง (สูงสุด '+maxChapters+')');
  let total=0;
  const files=[...byNumber.values()].sort((a,b)=>a.number-b.number).map(ch=>{
    const filename=safeName('บทที่ '+ch.number+(ch.title?' '+ch.title:''))+'.txt';
    total+=new TextEncoder().encode(ch.text).byteLength;
    if(total>maxTextBytes)throw Error('ชุดข้อมูลใหญ่เกิน 256 MB กรุณาแบ่งดาวน์โหลดเป็นหลายรอบ');
    return {name:filename,text:ch.text,number:ch.number,documentId:ch.documentId,tabId:ch.tabId};
  });
  const filenames=new Set();
  for(const file of files){
    const key=file.name.toLocaleLowerCase('en');
    if(filenames.has(key))throw Error('ชื่อไฟล์ซ้ำ: '+file.name);
    filenames.add(key);
  }
  return {files,warnings,totalCharacters:files.reduce((n,f)=>n+f.text.length,0),
    range:[files[0].number,files[files.length-1].number],documents:docs.size};
}
return {parseHeading,safeName,docIdFrom,parseLinks,readBlocks,getTabs,extractDocument,makeFiles};
});