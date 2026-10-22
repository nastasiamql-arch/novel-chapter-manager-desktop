(function(){
'use strict';
const C=window.NovelCore;
const $=id=>document.getElementById(id);
const state={results:[],query:'',currentEdit:null,busy:false,sourceSeq:0,uploadLinks:[]};
const esc=s=>String(s).replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const chapterList=()=>state.results.flatMap(x=>x.chapters);
const report=()=>C.audit(chapterList(),state.results);
const toast=message=>{const el=$('toast');el.textContent=message;el.classList.remove('hidden');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.add('hidden'),3900);};
const showError=(target,message)=>{target.textContent=message;target.className='inline-feedback error';};
const showSuccess=(target,message)=>{target.textContent=message;target.className='inline-feedback success';};

function navigate(view){
  for(const v of document.querySelectorAll('.view'))v.classList.toggle('active',v.id===`view-${view}`);
  for(const v of document.querySelectorAll('[data-view]'))v.classList.toggle('active',v.dataset.view===view);
  const names={workspace:'จัดการบทนิยาย',export:'ส่งออกไฟล์',google:'Google Docs',help:'วิธีใช้งาน'};
  $('breadcrumb').textContent=names[view]||view;
  if(view==='export')refreshExport();
  if(view==='google')window.GooglePublisher.prepare().catch(()=>{});
  window.scrollTo({top:0,behavior:'smooth'});
}
function refreshExport(){
  const a=report();
  $('exportSummary').textContent=a.active.length?`เลือก ${a.active.length} บท · เลขบทซ้ำ ${a.duplicates.length} จุด · บทที่มีปัญหา ${a.incomplete.length} บท · ข้อความไม่ได้แยก ${a.loose.length} ไฟล์`:'ยังไม่มีบทที่พร้อมส่งออก';
}
function render(){
  const all=chapterList();const a=report();
  $('statFound').textContent=all.length.toLocaleString('th-TH');
  $('statActive').textContent=a.active.length.toLocaleString('th-TH');
  $('statDup').textContent=a.duplicates.length.toLocaleString('th-TH');
  $('statAlerts').textContent=a.hardErrors.toLocaleString('th-TH');
  $('importedList').innerHTML=state.results.map(r=>`<div class="source-chip"><span>▤</span><span class="source-name" title="${esc(r.source.name)}">${esc(r.source.name)}</span><span>(${r.chapters.length})</span><button type="button" title="ลบแหล่งข้อมูลนี้" data-remove="${esc(r.source.id)}">×</button></div>`).join('');
  const note=[];
  if(a.duplicates.length)note.push(`เลขบทซ้ำ: ${a.duplicates.slice(0,25).join(', ')}${a.duplicates.length>25?' …':''}`);
  if(a.incomplete.length)note.push(`บทที่ต้องตรวจ: ${a.incomplete.slice(0,15).map(x=>x.number).join(', ')}${a.incomplete.length>15?' …':''}`);
  if(a.loose.length)note.push(`ข้อความไม่ได้แยกครบใน ${a.loose.length} ไฟล์ (โปรดตรวจไฟล์ต้นฉบับ)`);
  if(!a.losslessSources)note.push('การแบ่งบทจากต้นฉบับมีเนื้อหาไม่ตรงกัน — กรุณาตรวจสอบ');
  if(a.missing.length)note.push(`เลขบทอาจขาด: ${a.missing.slice(0,20).join(', ')}${a.missing.length>20?' …':''} (ไม่บังคับ)`);
  for(const result of state.results)for(const n of result.notes||[]){if(!note.includes(n))note.push(n);}
  const notice=$('auditNotice');notice.classList.toggle('hidden',!note.length);
  notice.innerHTML=note.length?`<strong>⚠ มีจุดที่ควรตรวจสอบ (${note.length})</strong><ul>${note.map(n=>`<li>${esc(n)}</li>`).join('')}</ul>`:'';
  const filtered=a.sorted.filter(ch=>!state.query||String(ch.number).includes(state.query)||ch.title.toLowerCase().includes(state.query)||ch.sourceName.toLowerCase().includes(state.query));
  // Show deselected chapters too, sorted by their original chapter numbers.
  const visible=all.slice().sort((x,y)=>x.number-y.number||x.sourceOrder-y.sourceOrder).filter(ch=>!state.query||String(ch.number).includes(state.query)||ch.title.toLowerCase().includes(state.query)||ch.sourceName.toLowerCase().includes(state.query));
  $('chapterList').innerHTML=visible.length?visible.map(ch=>`<div class="chapter-row ${ch.included?'':'is-off'}">
    <input type="checkbox" ${ch.included?'checked':''} data-select="${esc(ch.id)}" aria-label="เลือกบทที่ ${ch.number}"/>
    <span class="chapter-num">${ch.number}</span>
    <div class="chapter-desc"><strong>${esc(ch.title||'(ไม่มีชื่อบท)')}</strong><small>${esc(ch.sourceName)} · ${ch.text.length.toLocaleString('en-US')} อักขระ${ch.edited?' · แก้ไขแล้ว':''}</small></div>
    <span class="chapter-status ${ch.issues.length?'bad':''}">${ch.issues.length?'ต้องตรวจ':'ครบถ้วน ✓'}</span><button class="edit-btn" data-edit="${esc(ch.id)}">ดู / แก้ไข</button>
  </div>`).join(''):`<div class="empty-state"><div class="empty-art">▤</div><h3>${all.length?'ไม่มีบทที่ตรงกับคำค้น':'ยังไม่มีบทนิยาย'}</h3><p>${all.length?'ลองเปลี่ยนคำค้นหา':'เพิ่มไฟล์หรือวางข้อความด้านบน แล้วระบบจะแยกบทให้ทันที'}</p></div>`;
  $('listCount').textContent=all.length?`แสดง ${visible.length} จาก ${all.length} บท · เลือก ${a.active.length} บท`:'ยังไม่ได้นำเข้า';
  refreshExport();
}
function addSource(name,text,kind){
  const source={id:'source'+(++state.sourceSeq),name,kind,text};
  const result=C.parseSource(source);
  if(!result.exactMatch)throw new Error(`ตรวจการรักษาเนื้อหาต้นฉบับไม่ผ่าน: ${name}`);
  state.results.push(result);
  return result;
}
async function importFiles(files){
  if(state.busy){toast('มีงานกำลังดำเนินการอยู่');return;}
  const arr=Array.from(files||[]);
  if(!arr.length)return;
  state.busy=true;$('pickFileBtn').disabled=true;
  let loaded=0,fail=[];
  for(const file of arr){
    try{
      if(file.size>30*1024*1024)throw new Error('ขนาดเกิน 30 MB ต่อไฟล์');
      if(!/\.(txt|docx)$/i.test(file.name))throw new Error('รองรับเฉพาะ TXT และ DOCX');
      let text,kind;
      if(/\.docx$/i.test(file.name)){
        kind='docx';
        const zip=await JSZip.loadAsync(await file.arrayBuffer());
        const xml=zip.file('word/document.xml');
        if(!xml)throw new Error('ไม่พบ word/document.xml ในไฟล์ DOCX');
        text=C.docxToText(await xml.async('string'));
      }else{
        kind='txt';
        text=await file.text();
      }
      addSource(file.name,text,kind);loaded++;
    }catch(e){fail.push(`${file.name}: ${e.message}`);}
  }
  state.busy=false;$('pickFileBtn').disabled=false;render();
  if(loaded)toast(`นำเข้า ${loaded} ไฟล์แล้ว · พบ ${chapterList().length} บท`);
  if(fail.length){$('auditNotice').classList.remove('hidden');const extra=document.createElement('div');extra.style.color='#c94747';extra.textContent='นำเข้าล้มเหลว: '+fail.join(' | ');$('auditNotice').prepend(extra);}
  $('fileInput').value='';
}
function openEditor(id){
  const ch=chapterList().find(c=>c.id===id);if(!ch)return;
  state.currentEdit=id;
  $('editorHeading').textContent=`บทที่ ${ch.number} · ${ch.title||'ไม่มีชื่อ'}`;
  $('editorTitle').value=ch.title;
  $('editorText').value=ch.text;
  $('editorOverlay').classList.remove('hidden');
  document.body.style.overflow='hidden';
}
function closeEditor(){state.currentEdit=null;$('editorOverlay').classList.add('hidden');document.body.style.overflow='';}
function saveEditor(){
  const ch=chapterList().find(c=>c.id===state.currentEdit);if(!ch)return;
  const newText=$('editorText').value,newTitle=$('editorTitle').value.trim();
  if(!newText.trim()){toast('เนื้อหาบทต้องไม่ว่าง');return;}
  ch.title=newTitle;ch.text=newText;ch.edited=ch.originalText!==newText||ch.originalTitle!==newTitle;
  const analyzed=C.parseSource({id:'check',name:'ตรวจสอบ.txt',text:newText});
  if(analyzed.chapters.length===1 && analyzed.chapters[0].number===ch.number){
    ch.issues=analyzed.chapters[0].issues;
    ch.hasEnd=analyzed.chapters[0].hasEnd;
  }else{
    ch.issues=['พบหัวบทเกินหรือเลขบทในข้อความไม่ตรงกับเลขบทเดิม'];
  }
  closeEditor();render();toast(`บันทึกบทที่ ${ch.number} แล้ว`);
}
function validateOutgoing(allow){
  const a=report();
  if(!a.active.length)throw new Error('กรุณานำเข้าและเลือกอย่างน้อยหนึ่งบท');
  if(!allow&&a.hardErrors){throw new Error(`พบ ${a.hardErrors} จุดที่อาจมีปัญหา (บทซ้ำ/ไม่จบ/ข้อความหลงเหลือ) กรุณาตรวจสอบ หรือทำเครื่องหมายยอมรับความเสี่ยงก่อนส่งออก`);}
  return a.sorted;
}
function saveBlob(blob,name){
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
function uniqueName(ch,ext,used){
  const base=C.fileBase(ch);let next=base+'.'+ext,n=2;
  while(used.has(next.toLowerCase()))next=base+'__'+n++ +'.'+ext;
  used.add(next.toLowerCase());return next;
}
async function download(){
  const feedback=$('exportFeedback');feedback.textContent='';
  if(state.busy)return;
  try{
    const chapters=validateOutgoing($('allowIssuesExport').checked);
    const format=document.querySelector('input[name="exportFormat"]:checked').value;
    state.busy=true;$('downloadBtn').disabled=true;feedback.textContent='กำลังสร้างไฟล์...';feedback.className='inline-feedback';
    if(format==='merged'){
      const text=chapters.map(ch=>ch.text).join('\n\n');
      const blob=await C.makeDocx(text,JSZip).generateAsync({type:'blob',compression:'DEFLATE'});
      saveBlob(blob,C.safeFilename(`นิยายรวม_บท${chapters[0].number}-${chapters.at(-1).number}`)+'.docx');
    }else{
      const zip=new JSZip(),used=new Set();
      const manifest=[];
      for(const ch of chapters){
        const ext=format==='docx'?'docx':'txt';const name=uniqueName(ch,ext,used);
        if(format==='docx'){
          const data=await C.makeDocx(ch.text,JSZip).generateAsync({type:'uint8array',compression:'DEFLATE'});
          zip.file(name,data);
        }else zip.file(name,ch.text);
        manifest.push({number:ch.number,title:ch.title,file:name,source:ch.sourceName,characters:ch.text.length,edited:ch.edited,issues:ch.issues});
      }
      zip.file('_chapter_manifest.json',JSON.stringify({createdAt:new Date().toISOString(),total:chapters.length,chapters:manifest},null,2));
      const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}});
      saveBlob(blob,C.safeFilename(`นิยายแยกบท_${chapters[0].number}-${chapters.at(-1).number}`)+'.zip');
    }
    showSuccess(feedback,`✓ สร้างไฟล์ ${chapters.length} บท เรียบร้อยแล้ว`);
  }catch(e){showError(feedback,e.message);}finally{state.busy=false;$('downloadBtn').disabled=false;}
}
function renderDocs(items){
  const el=$('createdDocs');
  state.uploadLinks=items;
  el.innerHTML=items.length?'<strong>เอกสาร Google Docs</strong>'+items.map(d=>`<div class="doc-link"><div><a href="${esc(d.url)}" target="_blank" rel="noopener">↗ ${esc(d.title)}</a><small> · ${d.mode==='append'?'เพิ่ม':'ส่งแล้ว'} ${d.done}/${d.total} บท${d.mode==='append'?' · ข้ามซ้ำ '+d.skipped+' บท':''}</small></div><a href="${esc(d.url)}" target="_blank" rel="noopener">เปิดเอกสาร</a></div>`).join(''):'';
}
async function connect(){
  const btn=$('connectBtn');btn.disabled=true;$('connectStatus').textContent='กำลังเชื่อม...';
  try{
    const clientId=$('googleClientId').value.trim();
    if(clientId){try{localStorage.setItem('novel-google-client-id',clientId);}catch{}}
    await window.GooglePublisher.connect(clientId);
    $('connectStatus').textContent='เชื่อม Google แล้ว ✓';$('connectStatus').classList.add('ok');toast('อนุญาต Google Docs เรียบร้อย');
  }catch(e){$('connectStatus').textContent='เชื่อมไม่สำเร็จ';$('connectStatus').classList.remove('ok');showError($('googleFeedback'),e.message);}finally{btn.disabled=false;}
}
function googleMode(){return document.querySelector('input[name="googleMode"]:checked')?.value||'new';}
function refreshGoogleMode(){
  const append=googleMode()==='append';
  $('createSettings').classList.toggle('hidden',append);
  $('appendSettings').classList.toggle('hidden',!append);
  $('publishBtn').textContent=append?'◈ เพิ่มบทที่ยังไม่มีลง Google Docs เดิม':'◈ สร้างเอกสารและแท็บ Google Docs';
  $('googleWarningText').textContent=append
    ?'โหมดเติมบท: อ่านแท็บเดิมและข้ามเลขบทที่มีแล้ว โดยไม่แก้ไขแท็บเหล่านั้น ตรวจลิงก์และสำรองเอกสารก่อนดำเนินการ หากงานหยุดกลางทาง ให้ตรวจเอกสารจริงก่อนลองใหม่'
    :'โหมดสร้างใหม่: สร้างเอกสารใหม่ใน Google Drive ไม่แก้ไฟล์เดิม หากการส่งออกหยุดกลางทาง ให้ตรวจลิงก์ที่สร้างแล้วก่อนเริ่มใหม่เพื่อหลีกเลี่ยงเอกสารซ้ำ';
  $('appendPreview').classList.add('hidden');
}
function summarizeAppend(plan){
  const extra=plan.hasUnknownTabs?'\n⚠ พบแท็บที่ไม่ได้ตั้งชื่อแบบ บทที่ ... ระบบจะนับเป็นพื้นที่ที่ใช้แล้ว และไม่แก้ไขแท็บเหล่านั้น':'';
  const duplicate=plan.skippedNumbers.length?`\nข้ามบทที่มีแล้ว: ${plan.skippedNumbers.slice(0,18).join(', ')}${plan.skippedNumbers.length>18?' …':''}`:'';
  return `เอกสาร: ${plan.title}\nมีแล้ว ${plan.existingTabs} แท็บ (บทที่ตรวจพบ ${plan.existingChapters}) · ว่าง ${plan.free} แท็บ\nจะเพิ่ม ${plan.add} บท · ข้ามซ้ำ ${plan.skipped} บท${duplicate}${extra}`;
}
async function inspectDoc(){
  if(state.busy)return;
  const el=$('appendPreview'),btn=$('inspectDocBtn');
  try{
    const chapters=validateOutgoing($('allowIssuesGoogle').checked);
    if(!window.GooglePublisher.isConnected)throw new Error('กรุณาเชื่อม Google ก่อนตรวจเอกสาร');
    state.busy=true;btn.disabled=true;el.classList.remove('hidden','warn');el.textContent='กำลังตรวจแท็บในเอกสารเดิม...';
    const plan=await window.GooglePublisher.inspectAppend(chapters,$('existingDocUrl').value);
    el.textContent=summarizeAppend(plan)+(plan.add>plan.free?'\n⛔ พื้นที่ไม่เพียงพอ ระบบจะไม่แก้ไขเอกสาร':'\n✓ สามารถเติมบทใหม่ได้');
    el.classList.toggle('warn',plan.add>plan.free||plan.hasUnknownTabs);
  }catch(e){el.textContent='ไม่สามารถตรวจสอบ: '+e.message;el.classList.remove('hidden');el.classList.add('warn');}
  finally{state.busy=false;btn.disabled=false;}
}
async function publish(){
  const feedback=$('googleFeedback');feedback.textContent='';
  if(state.busy)return;
  try{
    const chapters=validateOutgoing($('allowIssuesGoogle').checked);
    if(!window.GooglePublisher.isConnected)throw new Error('กรุณาเชื่อม Google ก่อนส่งออก');
    if(chapters.some(ch=>/[\x00-\x08\x0C-\x1F\uE000-\uF8FF]/.test(ch.text)))throw new Error('พบอักขระที่ Google Docs อาจลบทิ้ง โปรดตรวจต้นฉบับก่อนส่ง');
    const isAppend=googleMode()==='append';
    state.busy=true;$('publishBtn').disabled=true;$('inspectDocBtn').disabled=true;
    if(isAppend){
      const plan=await window.GooglePublisher.inspectAppend(chapters,$('existingDocUrl').value);
      $('appendPreview').textContent=summarizeAppend(plan);
      $('appendPreview').classList.remove('hidden');
      if(plan.add>plan.free)throw new Error(`เอกสารเดิมเหลือ ${plan.free} แท็บ แต่ต้องเพิ่ม ${plan.add} บท กรุณาเลือกส่งบางบทหรือสร้างเอกสารใหม่สำหรับส่วนที่เหลือ`);
      const agree=confirm(`${summarizeAppend(plan)}\n\nยืนยันจะเพิ่มบทใหม่ลงเอกสารนี้ใช่หรือไม่? ระบบจะไม่แก้แท็บที่มีอยู่`);
      if(!agree){showSuccess(feedback,'ยกเลิกการเติมบทแล้ว ไม่มีการเปลี่ยนแปลงเอกสาร');return;}
    }
    $('publishProgress').classList.remove('hidden');
    $('progressLabel').textContent=isAppend?'กำลังตรวจและเติมเอกสารเดิม...':'กำลังสร้างเอกสารใหม่...';
    $('progressPct').textContent='0%';$('progressBar').style.width='0%';
    const onProgress=info=>{
      $('progressLabel').textContent=info.message;
      $('progressPct').textContent=Math.round(100*info.done/info.total)+'%';
      $('progressBar').style.width=(100*info.done/info.total)+'%';
      renderDocs(info.created);
    };
    if(isAppend){
      const {docs,plan}=await window.GooglePublisher.append(chapters,$('existingDocUrl').value,onProgress);
      renderDocs(docs);
      showSuccess(feedback,`✓ เพิ่ม ${plan.add} บท · ข้ามบทที่มีอยู่แล้ว ${plan.skipped} บท ไม่มีการแก้เนื้อหาเดิม กรุณาเปิด Google Docs ตรวจผล`);
    }else{
      const items=await window.GooglePublisher.publish(chapters,{prefix:$('docPrefix').value.trim()||'นิยายแปล',perDoc:Number($('perDoc').value)},onProgress);
      showSuccess(feedback,`✓ สร้าง ${items.length} เอกสาร รวม ${chapters.length} แท็บเรียบร้อยแล้ว กรุณาเปิดตรวจตัวอย่างบน Google Docs`);
    }
  }catch(e){showError(feedback,`${e.message}\nหากมีการสร้างแท็บไปแล้ว โปรดตรวจลิงก์ด้านล่างก่อนลองใหม่`);}
  finally{state.busy=false;$('publishBtn').disabled=false;$('inspectDocBtn').disabled=false;}
}
for(const btn of document.querySelectorAll('[data-view]'))btn.addEventListener('click',()=>navigate(btn.dataset.view));
$('goExport').addEventListener('click',()=>navigate('export'));
$('pickFileBtn').addEventListener('click',()=>$('fileInput').click());
$('fileInput').addEventListener('change',event=>importFiles(event.target.files));
const dropZone=$('dropZone');
for(const eventName of ['dragenter','dragover'])dropZone.addEventListener(eventName,event=>{event.preventDefault();dropZone.classList.add('dragging');});
for(const eventName of ['dragleave','drop'])dropZone.addEventListener(eventName,event=>{event.preventDefault();dropZone.classList.remove('dragging');});
dropZone.addEventListener('drop',event=>importFiles(event.dataTransfer.files));
$('togglePaste').addEventListener('click',()=>$('pastePanel').classList.toggle('hidden'));
$('pasteAddBtn').addEventListener('click',()=>{
  const content=$('pasteText').value;
  if(!content.trim()){toast('กรุณาวางข้อความนิยายก่อน');return;}
  try{
    const name=$('pasteName').value.trim()||`ข้อความที่วาง ${state.sourceSeq+1}`;
    const result=addSource(name+'.txt',content,'paste');
    $('pasteText').value='';$('pasteName').value='';
    render();toast(`นำเข้าข้อความแล้ว พบ ${result.chapters.length} บท`);
  }catch(e){toast(e.message);}
});
$('searchInput').addEventListener('input',e=>{state.query=e.target.value.trim().toLowerCase();render();});
$('chapterList').addEventListener('change',e=>{if(e.target.dataset.select){const ch=chapterList().find(c=>c.id===e.target.dataset.select);if(ch){ch.included=e.target.checked;render();}}});
$('chapterList').addEventListener('click',e=>{const b=e.target.closest('[data-edit]');if(b)openEditor(b.dataset.edit);});
$('importedList').addEventListener('click',e=>{const b=e.target.closest('[data-remove]');if(!b)return;state.results=state.results.filter(x=>x.source.id!==b.dataset.remove);render();});
$('selectAllBtn').addEventListener('click',()=>{chapterList().forEach(c=>c.included=true);render();});
$('clearAllBtn').addEventListener('click',()=>{chapterList().forEach(c=>c.included=false);render();});
$('resetBtn').addEventListener('click',()=>{if(!state.results.length)return;if(confirm('ล้างนิยายทั้งหมดที่นำเข้าจากหน้านี้? (ไฟล์จริงของคุณจะไม่ถูกลบ)')){state.results=[];state.query='';$('searchInput').value='';render();}});
$('closeEditor').addEventListener('click',closeEditor);$('cancelEditor').addEventListener('click',closeEditor);$('saveEditor').addEventListener('click',saveEditor);
$('editorOverlay').addEventListener('click',e=>{if(e.target===$('editorOverlay'))closeEditor();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&state.currentEdit)closeEditor();});
$('downloadBtn').addEventListener('click',download);
$('connectBtn').addEventListener('click',connect);
$('disconnectBtn').addEventListener('click',()=>{window.GooglePublisher.disconnect();$('connectStatus').textContent='ยกเลิกการเชื่อมแล้ว';$('connectStatus').classList.remove('ok');toast('ยกเลิกการเชื่อมในหน้าเว็บแล้ว');});
$('publishBtn').addEventListener('click',publish);
$('inspectDocBtn').addEventListener('click',inspectDoc);
for(const radio of document.querySelectorAll('input[name="googleMode"]'))radio.addEventListener('change',refreshGoogleMode);
$('existingDocUrl').addEventListener('input',()=>{$('appendPreview').classList.add('hidden');});
refreshGoogleMode();
try{$('googleClientId').value=localStorage.getItem('novel-google-client-id')||'';}catch{}
render();
})();