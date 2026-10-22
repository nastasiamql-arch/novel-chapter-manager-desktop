/* Novel Chapter Manager - deterministic, loss-aware chapter parsing. */
(function (root) {
  'use strict';
  const thaiDigits = '๐๑๒๓๔๕๖๗๘๙';
  const thaiToArabic = value => String(value).replace(/[๐-๙]/g, d => String(thaiDigits.indexOf(d)));
  const HEADING = /^[\t ]*บทที่[\t ]*([0-9๐-๙]+)(?:[\t ]*[:：.\-–—]?[\t ]*(.*?))?[\t ]*$/;
  const END = /^[\t ]*\[(จบตอน|จบบท)\][\t ]*$/;

  function linesWithOffsets(text) {
    const result = [];
    const rx = /[^\r\n]*(?:\r\n|\r|\n|$)/g;
    let m;
    while ((m = rx.exec(text)) && m[0]) {
      const raw = m[0];
      result.push({ start: m.index, end: m.index + raw.length, line: raw.replace(/\r\n$|\r$|\n$/, '') });
    }
    return result;
  }

  function headingFromLine(line) {
    const m = line.replace(/^\uFEFF/, '').match(HEADING);
    if (!m) return null;
    const number = Number(thaiToArabic(m[1]));
    if (!Number.isSafeInteger(number) || number < 0) return null;
    return { number, title: (m[2] || '').trim(), heading: line.replace(/^\uFEFF/, '').trim() };
  }

  function chapterFrom(raw, heading, source, index, start, end) {
    const ends = linesWithOffsets(raw).filter(x => END.test(x.line));
    const afterLast = ends.length ? raw.slice(ends[ends.length - 1].end) : '';
    const issues = [];
    if (!ends.length) issues.push('ไม่พบ [จบตอน] หรือ [จบบท]');
    if (ends.length > 1) issues.push('พบเครื่องหมายจบมากกว่าหนึ่งครั้ง');
    if (afterLast.trim()) issues.push('พบข้อความหลังเครื่องหมายจบ');
    return {
      id: `${source.id}:${index}`, sourceId: source.id, sourceName: source.name,
      sourceOrder: index, number: heading.number, title: heading.title,
      originalTitle: heading.title, text: raw, originalText: raw,
      heading: heading.heading, originalStart: start, originalEnd: end,
      hasEnd: ends.length > 0, endMarker: ends.length ? ends[ends.length - 1].line.trim() : '',
      issues, included: true, edited: false
    };
  }

  function parseSource(source) {
    const text = source.text || '';
    const lines = linesWithOffsets(text);
    const matches = [];
    for (const line of lines) {
      const heading = headingFromLine(line.line);
      if (heading) matches.push({ ...heading, start: line.start, lineEnd: line.end });
    }
    const chapters = [];
    const notes = [];
    let prefix = '';
    if (matches.length) {
      prefix = text.slice(0, matches[0].start);
      if (prefix.trim().replace(/^\uFEFF/, '').trim()) notes.push(`พบข้อความก่อนบทแรกในไฟล์ ${source.name}`);
      for (let i = 0; i < matches.length; i++) {
        const start = matches[i].start;
        const end = i + 1 < matches.length ? matches[i + 1].start : text.length;
        chapters.push(chapterFrom(text.slice(start, end), matches[i], source, i, start, end));
      }
      // Preserve whitespace and BOM preceding the first heading inside the first output chapter.
      if (prefix && !prefix.replace(/^\uFEFF/, '').trim()) {
        chapters[0].text = prefix + chapters[0].text;
        chapters[0].originalText = chapters[0].text;
        chapters[0].originalStart = 0;
        prefix = '';
      }
    } else {
      const byName = headingFromLine((source.name || '').replace(/\.(txt|docx)$/i, '').replace(/[_-]/g, ' '));
      if (byName && text.trim()) {
        chapters.push(chapterFrom(text, byName, source, 0, 0, text.length));
        notes.push(`ใช้เลขบทจากชื่อไฟล์ ${source.name} (ไม่พบหัวบทในเนื้อหา)`);
      } else if (text.trim()) {
        prefix = text;
        notes.push(`ไม่พบหัวบทใน ${source.name} — เก็บข้อความไว้เป็นส่วนที่ยังแยกไม่ได้`);
      }
    }
    const rejoined = prefix + chapters.map(c => c.originalText).join('');
    return { source, chapters, notes, prefix, exactMatch: rejoined === text };
  }

  function audit(chapters, results) {
    const active = chapters.filter(c => c.included);
    const sorted = active.slice().sort((a,b) => a.number - b.number || a.sourceName.localeCompare(b.sourceName) || a.sourceOrder - b.sourceOrder);
    const counts = new Map();
    for (const c of active) counts.set(c.number, (counts.get(c.number) || 0) + 1);
    const duplicates = [...counts].filter(([,n]) => n > 1).map(([n]) => n);
    const missing = [];
    const nums = [...new Set(sorted.map(c => c.number))];
    for (let i = 1; i < nums.length; i++) {
      for (let n = nums[i-1]+1; n < nums[i] && missing.length < 2000; n++) missing.push(n);
    }
    const incomplete = active.filter(c => c.issues.length);
    const loose = results.filter(r => r.prefix && r.prefix.replace(/^\uFEFF/, '').trim());
    const losslessSources = results.every(r => r.exactMatch);
    return { active, sorted, duplicates, missing, incomplete, loose, losslessSources,
      hardErrors: duplicates.length + incomplete.length + loose.length + (losslessSources ? 0 : 1) };
  }

  function chunks(items, maxPerDocument=90) {
    const out=[];
    for (let i=0; i<items.length; i+=maxPerDocument) out.push(items.slice(i, i+maxPerDocument));
    return out;
  }
  function safeFilename(s) {
    return String(s).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/[.\s]+$/g, '').slice(0, 110) || 'ไม่มีชื่อ';
  }
  function fileBase(chapter) {
    return safeFilename(`บทที่ ${chapter.number}${chapter.title ? ' '+chapter.title : ''}`);
  }
  function xmlEscape(text) {
    return String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
  }
  function docxXML(text) {
    if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(text)) throw new Error('ต้นฉบับมีอักขระควบคุมที่ Word ไม่รองรับ กรุณาตรวจและแก้ไขก่อนส่งออก');
    const body = String(text).replace(/\r\n|\r/g,'\n').split('\n').map(line => {
      return `<w:p><w:r><w:t xml:space="preserve">${xmlEscape(line)}</w:t></w:r></w:p>`;
    }).join('');
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:body>' + body + '<w:sectPr/></w:body></w:document>';
  }
  function makeDocx(text, Zip) {
    const zip=new Zip();
    zip.file('[Content_Types].xml','<?xml version="1.0" encoding="UTF-8"?>'+
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'+
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'+ 
      '<Default Extension="xml" ContentType="application/xml"/>'+ 
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'+ 
      '</Types>');
    zip.folder('_rels').file('.rels','<?xml version="1.0" encoding="UTF-8"?>'+
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'+ 
      '</Relationships>');
    zip.folder('word').file('document.xml',docxXML(text));
    return zip;
  }

  function docxToText(documentXml) {
    const parser = new DOMParser();
    const xml = parser.parseFromString(documentXml, 'application/xml');
    if (xml.getElementsByTagName('parsererror').length) throw new Error('ไฟล์ DOCX มี XML ที่อ่านไม่ได้');
    const body = Array.from(xml.documentElement.childNodes).find(n => n.localName === 'body') ||
      xml.getElementsByTagNameNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main','body')[0];
    if (!body) throw new Error('ไม่พบเนื้อหาในไฟล์ DOCX');
    const paras = Array.from(body.getElementsByTagName('*')).filter(n=>n.localName==='p');
    const paraText = paragraph => {
      let value='';
      function walk(node) {
        if (node.nodeType !== 1) return;
        if (node.localName==='del') return;
        if (node.localName==='t') { value += node.textContent; return; }
        if (node.localName==='tab') { value += '\t'; return; }
        if (node.localName==='br'||node.localName==='cr') { value += '\n'; return; }
        for (const child of node.childNodes) walk(child);
      }
      walk(paragraph);
      return value;
    };
    return paras.map(paraText).join('\n');
  }

  const api = { headingFromLine, parseSource, audit, chunks, fileBase, safeFilename, makeDocx, docxToText, docxXML };
  root.NovelCore=api;
  if (typeof module !== 'undefined' && module.exports) module.exports=api;
})(typeof window !== 'undefined' ? window : globalThis);