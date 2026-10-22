/* Browser-only Google Docs API publisher. No password, tokens are never persisted. */
(function(root){
'use strict';
const SCOPE='https://www.googleapis.com/auth/drive.file';
const BASE='https://docs.googleapis.com/v1/documents';
let token='';
let tokenClient;
let connectedClientId='';
let scriptPromise=null;

function loadGoogleIdentity(){
  if(root.NovelDesktop?.googleConnect) return Promise.resolve();
  if (root.google?.accounts?.oauth2) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src='https://accounts.google.com/gsi/client';script.async=true;script.dataset.googleIdentity='true';
    script.onload=()=>{
      if(root.google?.accounts?.oauth2)resolve();
      else {scriptPromise=null;script.remove();reject(new Error('โหลด Google Identity แล้วแต่ API ไม่พร้อมใช้งาน'));}
    };
    script.onerror=()=>{scriptPromise=null;script.remove();reject(new Error('ไม่สามารถเชื่อมต่อบริการ Google ได้'));};
    document.head.append(script);
  });
  return scriptPromise;
}

async function connect(clientId){
  if(!/^\d+-[a-z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientId.trim())) throw new Error('กรุณาใส่ OAuth Client ID ให้ถูกต้อง (โปรแกรม Desktop ต้องใช้ Client ID ประเภท Desktop app)');
  if(root.NovelDesktop?.googleConnect){
    token='';
    const response=await root.NovelDesktop.googleConnect(clientId.trim());
    if(!response?.connected)throw new Error('Google ไม่อนุญาตการเข้าถึง');
    token='desktop-session'; connectedClientId=clientId.trim();
    return true;
  }
  if(!['http:','https:'].includes(location.protocol)) throw new Error('เชื่อม Google ต้องเปิดเว็บผ่าน http://localhost หรือ HTTPS ไม่ใช่ไฟล์ในเครื่อง');
  await loadGoogleIdentity();
  token='';
  return new Promise((resolve,reject)=>{
    try {
      tokenClient=root.google.accounts.oauth2.initTokenClient({
        client_id:clientId.trim(),scope:SCOPE,callback(response){
          if(response.error||!response.access_token){reject(new Error(response.error_description||response.error||'Google ไม่อนุญาตการเข้าถึง'));return;}
          token=response.access_token;connectedClientId=clientId.trim();resolve(true);
        },error_callback(e){reject(new Error('ปิดหน้าต่างเข้าสู่ระบบ หรือเชื่อมต่อ Google ไม่สำเร็จ: '+(e.type||'')));}
      });
      tokenClient.requestAccessToken({prompt:'consent'});
    } catch(e){reject(e);}
  });
}
async function restore(){
  if(!root.NovelDesktop?.googleStatus)return false;
  const status=await root.NovelDesktop.googleStatus();
  token=status.connected?'desktop-session':'';
  connectedClientId=status.clientId||'';
  return status;
}
function disconnect(){token='';connectedClientId='';if(root.NovelDesktop?.googleDisconnect)void root.NovelDesktop.googleDisconnect();}
async function api(url,method='GET',body=null){
  if(root.NovelDesktop?.googleRequest){
    if(!token)throw new Error('กรุณาเชื่อม Google ใหม่');
    try{return await root.NovelDesktop.googleRequest(url,method,body);}
    catch(e){if(String(e.message).includes('Google API 401:'))disconnect();throw e;}
  }
  if(!token)throw new Error('กรุณาเชื่อม Google ใหม่ (โทเค็นหมดอายุหรือยังไม่ได้เชื่อม)');
  let response;
  try{response=await fetch(url,{method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});}
  catch(e){throw new Error('เครือข่ายขัดข้อง: '+e.message+' — ตรวจสอบเอกสาร Google Docs ก่อนลองใหม่ เพื่อเลี่ยงสร้างซ้ำ');}
  if(response.status===401){disconnect();throw new Error('Google Session หมดอายุ กรุณาเชื่อมใหม่ (งานที่สร้างแล้วจะยังอยู่ใน Google Drive)');}
  if(!response.ok){const message=await response.text();let detail=message;try{detail=JSON.parse(message).error?.message||message;}catch{}throw new Error(`Google API ${response.status}: ${detail.slice(0,650)}`);}
  return response.status===204?{}:response.json();
}
async function searchDocuments(term){
  if(!token)throw Error('กรุณาเชื่อม Google ก่อน');
  if(!root.NovelDesktop?.googleSearch)throw Error('ใช้การค้นหาเอกสารผ่านโปรแกรม Desktop เท่านั้น');
  return root.NovelDesktop.googleSearch(String(term||'').trim().replace(/^@/,''));
}
async function fetchDocumentsTxt(links,onProgress=()=>{}){
  if(!token)throw Error('กรุณาเชื่อม Google ก่อน');
  if(!root.DocsTxtExport)throw Error('โมดูลดาวน์โหลด TXT ไม่พร้อม');
  const ids=root.DocsTxtExport.parseLinks(links);
  const documents=[];
  for(let i=0;i<ids.length;i++){
    onProgress('กำลังอ่านเอกสาร '+(i+1)+'/'+ids.length);
    const id=ids[i];
    let doc;
    try{doc=await rateAware(()=>api(BASE+'/'+encodeURIComponent(id)+'?includeTabsContent=true'));}
    catch(e){throw Error('อ่านเอกสารลำดับ '+(i+1)+' ไม่สำเร็จ: '+e.message);}
    documents.push(root.DocsTxtExport.extractDocument(doc));
  }
  return root.DocsTxtExport.makeFiles(documents);
}
function batchUpdate(id,requests){return api(`${BASE}/${encodeURIComponent(id)}:batchUpdate`,'POST',{requests});}
const wait = ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function rateAware(op){
  for(let attempt=0;attempt<4;attempt++){
    try{return await op();}
    catch(e){
      // A 429 is a confirmed rejected request, safe to retry. Other mutation failures are not automatically retried.
      if(!String(e.message).includes('Google API 429:')||attempt===3)throw e;
      await wait(1100*Math.pow(2,attempt));
    }
  }
}
function byUtf16(text,max){
  const pieces=[];
  for(let i=0;i<text.length;){
    let end=Math.min(i+max,text.length);
    if(end<text.length&&end>i&&/[\uD800-\uDBFF]/.test(text[end-1])&&/[\uDC00-\uDFFF]/.test(text[end]))end--;
    pieces.push(text.slice(i,end));i=end;
  }
  return pieces;
}
async function publish(chapters,options={},onProgress=()=>{}){
  if(!token)throw new Error('กรุณากดเชื่อม Google ก่อน');
  if(!chapters?.length)throw new Error('ไม่มีบทสำหรับส่งออก');
  if(!root.NovelVolume?.plan)throw new Error('ระบบคำนวณเลขเล่มไม่พร้อมใช้งาน');
  const groups=root.NovelVolume.plan(chapters,options);
  const created=[];let done=0;
  const progress=(message)=>onProgress({message,done,total:chapters.length,created:created.slice()});
  for(let groupIndex=0;groupIndex<groups.length;groupIndex++){
    const planned=groups[groupIndex],group=planned.chapters;
    const title=planned.title;
    progress(`สร้างเอกสารเล่ม ${planned.volume} (${groupIndex+1}/${groups.length})...`);
    const doc=await rateAware(()=>api(BASE,'POST',{title}));
    const docId=doc.documentId;
    if(!docId)throw new Error('Google ไม่ได้ส่ง Document ID กลับมา');
    const item={id:docId,title,url:`https://docs.google.com/document/d/${encodeURIComponent(docId)}/edit`,done:0,total:group.length};
    created.push(item);progress(`สร้าง ${title} แล้ว`);
    const details=await rateAware(()=>api(`${BASE}/${encodeURIComponent(docId)}?includeTabsContent=true&fields=tabs(tabProperties)`));
    const firstId=details.tabs?.[0]?.tabProperties?.tabId;
    if(!firstId)throw new Error('อ่าน ID ของแท็บแรกไม่สำเร็จ ดูลิงก์เอกสารที่สร้างไว้ก่อนแล้ว');
    await rateAware(()=>batchUpdate(docId,[{updateDocumentTabProperties:{tabProperties:{tabId:firstId,title:tabName(group[0])},fields:'title'}}]));
    const tabIds=[firstId];
    if(group.length>1){
      const creation=await rateAware(()=>batchUpdate(docId,group.slice(1).map(ch=>({addDocumentTab:{tabProperties:{title:tabName(ch)}}}))));
      for(let i=0;i<group.length-1;i++){
        const id=creation.replies?.[i]?.addDocumentTab?.tabProperties?.tabId;
        if(!id)throw new Error(`สร้างแท็บสำหรับบทที่ ${group[i+1].number} แล้ว แต่ไม่ได้รับ ID ของแท็บ (ตรวจเอกสารที่สร้างไว้)`);
        tabIds.push(id);
      }
    }
    let pending=[],size=0,scheduled=[];
    async function flush(){
      if(!pending.length)return;
      await rateAware(()=>batchUpdate(docId,pending));
      for(const index of scheduled){
        group[index]._uploadPartsDone=(group[index]._uploadPartsDone||0)+1;
        if(group[index]._uploadPartsDone===group[index]._uploadPartsTotal){
          done++;item.done++;progress(`ส่งบทที่ ${group[index].number} สำเร็จ (${done}/${chapters.length})`);
        }
      }
      pending=[];scheduled=[];size=0;
    }
    for(let i=0;i<group.length;i++){
      // Google Docs strips some control characters; reject rather than silently changing manuscript content.
      if(/[\x00-\x08\x0C-\x1F\uE000-\uF8FF]/.test(group[i].text)) throw new Error(`บทที่ ${group[i].number} มีอักขระที่ Google Docs ไม่รองรับ กรุณาลบเองจากต้นฉบับก่อนส่ง`);
      const pieces=byUtf16(group[i].text,60000);
      group[i]._uploadPartsDone=0;group[i]._uploadPartsTotal=pieces.length;
      for(const part of pieces){
        if(pending.length>=12||size+part.length>170000)await flush();
        pending.push({insertText:{endOfSegmentLocation:{tabId:tabIds[i]},text:part}});
        scheduled.push(i);size+=part.length;
      }
    }
    await flush();
  }
  progress('สร้างเอกสาร Google Docs เสร็จแล้ว');
  return created;
}

/* Append mode: inspect the actual existing tabs before *any* mutation.
   Deliberately refuse risky/ambiguous documents instead of overwriting text. */
function normalizeDigits(value){
  const thai='๐๑๒๓๔๕๖๗๘๙';
  return String(value).replace(/[๐-๙]/g,ch=>String(thai.indexOf(ch)));
}
function chapterNumberFromHeading(value){
  const match=String(value||'').replace(/^\uFEFF/,'').trimStart().match(/^บทที่\s*([0-9๐-๙]+)(?=\s|$|[:：.\-–—])/);
  if(!match)return null;
  const number=Number(normalizeDigits(match[1]));
  return Number.isSafeInteger(number)&&number>=0?number:null;
}
function tabPlainText(tab){
  const content=tab.documentTab?.body?.content||[];
  let result='';
  for(const element of content){
    for(const run of element.paragraph?.elements||[]){
      if(typeof run.textRun?.content==='string')result+=run.textRun.content;
    }
  }
  return result;
}
function documentIdFrom(input){
  const value=String(input||'').trim();
  if(/^[a-zA-Z0-9_-]{15,}$/.test(value))return value;
  try{
    const url=new URL(value);
    if(url.protocol!=='https:'||!['docs.google.com','www.docs.google.com'].includes(url.hostname))throw Error();
    const match=url.pathname.match(/^\/document\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]{15,})(?:\/|$)/);
    if(match)return match[1];
  }catch{}
  throw new Error('กรุณาวางลิงก์ Google Docs รูปแบบ https://docs.google.com/document/d/.../edit หรือ Document ID');
}
function tabName(ch){
  const base=`บทที่ ${ch.number}`;
  const full=ch.title?`${base} ${ch.title}`:base;
  return full.length>50?base:full;
}
function isEndMarked(text){return /\[(?:จบตอน|จบบท)\]\s*$/.test(String(text||'').trimEnd());}
async function readExisting(input){
  const id=documentIdFrom(input);
  // A full tabs read is intentional: the first actual line is used as a fallback
  // when a user renamed a tab. This prevents silently duplicating such chapters.
  const doc=await rateAware(()=>api(`${BASE}/${encodeURIComponent(id)}?includeTabsContent=true`));
  if(!Array.isArray(doc.tabs)||!doc.tabs.length)throw new Error('ไม่พบข้อมูลแท็บของเอกสาร Google Docs นี้');
  if(doc.tabs.some(t=>t.childTabs?.length))throw new Error('เอกสารนี้มีแท็บซ้อน (child tabs) ซึ่งยังไม่รองรับการเติมอย่างปลอดภัย กรุณาใช้เอกสารที่มีแท็บชั้นเดียว');
  if(doc.tabs.length>100)throw new Error('จำนวนแท็บในเอกสารผิดปกติ (เกิน 100) ไม่สามารถเติมได้');
  const list=doc.tabs.map((tab,index)=>{
    const title=String(tab.tabProperties?.title||'');
    const text=tabPlainText(tab);
    const first=text.split(/\r\n|\r|\n/).find(s=>s.trim())||'';
    const byTitle=chapterNumberFromHeading(title);
    const byText=chapterNumberFromHeading(first);
    if(byTitle!==null&&byText!==null&&byTitle!==byText){
      throw new Error(`เอกสารเดิมมีแท็บชื่อ ${title} แต่เนื้อหาขึ้นต้นด้วยบทที่ ${byText} — โปรดแก้ให้ตรงกันก่อน`);
    }
    const number=byTitle??byText;
    return {id:tab.tabProperties?.tabId,index,title,number,empty:!text.trim(),hasEnd:number!==null?isEndMarked(text):false};
  });
  if(list.some(t=>!t.id))throw new Error('Google Docs ส่งข้อมูลแท็บไม่ครบ (ไม่มี tabId)');
  const seen=new Set();
  for(const t of list){
    if(t.number===null)continue;
    if(seen.has(t.number))throw new Error(`พบแท็บบทที่ ${t.number} ซ้ำกันอยู่แล้วในเอกสารเดิม กรุณาจัดการก่อนเติม`);
    seen.add(t.number);
    if(t.empty)throw new Error(`แท็บบทที่ ${t.number} ในเอกสารเดิมว่างเปล่า อาจเป็นงานส่งค้าง กรุณาตรวจสอบก่อนเติม (ระบบจะไม่ถือว่าสำเร็จ)`);
    if(!t.hasEnd)throw new Error(`แท็บบทที่ ${t.number} ในเอกสารเดิมไม่พบ [จบตอน] หรือ [จบบท] ที่ท้ายข้อความ กรุณาตรวจสอบก่อนเติม`);
  }
  return {id,title:String(doc.title||'เอกสารไม่มีชื่อ'),list,url:`https://docs.google.com/document/d/${encodeURIComponent(id)}/edit`};
}
function planFrom(existing,chapters){
  if(!Array.isArray(chapters)||!chapters.length)throw new Error('ไม่มีบทที่เลือกสำหรับเติมลงเอกสาร');
  const incoming=new Set();
  for(const ch of chapters){
    if(!Number.isSafeInteger(ch.number)||ch.number<0)throw new Error('เลขบทในข้อมูลนำเข้าไม่ถูกต้อง');
    if(incoming.has(ch.number))throw new Error(`ไฟล์ที่จะส่งมีบทที่ ${ch.number} ซ้ำกัน โปรดเอารายการซ้ำออกก่อนเติม`);
    incoming.add(ch.number);
  }
  const present=new Set(existing.list.filter(t=>t.number!==null).map(t=>t.number));
  const skipped=chapters.filter(ch=>present.has(ch.number));
  const added=chapters.filter(ch=>!present.has(ch.number)).sort((a,b)=>a.number-b.number);
  const free=100-existing.list.length;
  return {docId:existing.id,url:existing.url,title:existing.title,existingTabs:existing.list.length,
    existingChapters:present.size,free,skipped:skipped.length,add:added.length,
    skippedNumbers:skipped.map(c=>c.number),addNumbers:added.map(c=>c.number),
    // For the UI: provide a clear warning if the target is not a chapter document.
    hasUnknownTabs:existing.list.some(t=>t.number===null),added,existingList:existing.list};
}
async function inspectAppend(chapters,documentInput){
  if(!token)throw new Error('กรุณาเชื่อม Google ก่อน');
  return planFrom(await readExisting(documentInput),chapters);
}
async function append(chapters,documentInput,onProgress=()=>{}){
  if(!token)throw new Error('กรุณาเชื่อม Google ก่อน');
  // Always recheck the live document immediately before editing, even if it
  // was previously previewed. Never trust an old count/selection.
  const plan=await inspectAppend(chapters,documentInput);
  if(plan.add>plan.free)throw new Error(`เอกสารเดิมเหลือ ${plan.free} แท็บ แต่ต้องเพิ่ม ${plan.add} บท — ไม่มีการแก้เอกสาร กรุณาแบ่งส่งหรือสร้างเอกสารใหม่สำหรับส่วนที่เกิน`);
  const item={id:plan.docId,title:plan.title,url:plan.url,done:0,total:plan.add,skipped:plan.skipped,mode:'append'};
  let completed=plan.skipped;
  function progress(msg){onProgress({message:msg,done:completed,total:chapters.length,created:[{...item}]});}
  progress(`พบแล้ว ${plan.skipped} บท · เตรียมเพิ่ม ${plan.add} บท`);
  if(!plan.add){progress('ทุกบทมีอยู่ในเอกสารแล้ว ไม่ได้สร้างแท็บหรือแก้ไขข้อความใด ๆ');return {docs:[item],plan};}
  const allTabs=plan.existingList.map(t=>({number:t.number}));
  // Prepare chronological insertion indexes for the existing top-level list.
  // Requests in one batch are applied in order, so indexes update accordingly.
  const requests=[];
  for(const ch of plan.added){
    let idx=allTabs.findIndex(t=>t.number!==null&&t.number>ch.number);
    if(idx<0)idx=allTabs.length;
    requests.push({addDocumentTab:{tabProperties:{title:tabName(ch),index:idx}}});
    allTabs.splice(idx,0,{number:ch.number});
  }
  progress(`กำลังสร้างแท็บใหม่ ${plan.add} แท็บ...`);
  // Never retry a possibly committed mutation on network/5xx errors.
  const response=await batchUpdate(plan.docId,requests);
  const tabIds=plan.added.map((ch,index)=>{
    const tabId=response.replies?.[index]?.addDocumentTab?.tabProperties?.tabId;
    if(!tabId)throw new Error(`สร้างแท็บแล้วแต่ไม่ได้รับ ID สำหรับบทที่ ${ch.number} โปรดตรวจเอกสารเดิมก่อนลองใหม่`);
    return tabId;
  });
  let pending=[],scheduled=[],size=0;
  async function flush(){
    if(!pending.length)return;
    // retry only explicit 429, which is a rejected request. For uncertain
    // failures, report the existing document URL so the user can verify.
    await rateAware(()=>batchUpdate(plan.docId,pending));
    for(const i of scheduled){
      const ch=plan.added[i];
      ch._appendPartsDone=(ch._appendPartsDone||0)+1;
      if(ch._appendPartsDone===ch._appendPartsTotal){item.done++;completed++;progress(`เพิ่มบทที่ ${ch.number} แล้ว (${item.done}/${plan.add})`);}
    }
    pending=[];scheduled=[];size=0;
  }
  for(let i=0;i<plan.added.length;i++){
    const ch=plan.added[i];
    if(/[\x00-\x08\x0C-\x1F\uE000-\uF8FF]/.test(ch.text))throw new Error(`บทที่ ${ch.number} มีอักขระที่ Google Docs ไม่รองรับ`);
    const pieces=byUtf16(ch.text,60000);
    ch._appendPartsDone=0;ch._appendPartsTotal=pieces.length;
    for(const part of pieces){
      if(pending.length>=12||size+part.length>170000)await flush();
      pending.push({insertText:{endOfSegmentLocation:{tabId:tabIds[i]},text:part}});
      scheduled.push(i);size+=part.length;
    }
  }
  await flush();
  progress(`เพิ่ม ${item.done} บท · ข้าม ${item.skipped} บทที่มีอยู่แล้ว`);
  return {docs:[item],plan};
}

root.GooglePublisher={tabName,searchDocuments,fetchDocumentsTxt,connect,disconnect,restore,publish,inspectAppend,append,documentIdFrom,prepare:loadGoogleIdentity,get isConnected(){return Boolean(token)},get clientId(){return connectedClientId}};
})(window);