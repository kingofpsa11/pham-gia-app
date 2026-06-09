import fs from 'fs/promises';
import path from 'path';
import JSZip from 'jszip';
import { query, queryOne } from '../db.js';
import { TEMPLATES_UPLOAD_DIR } from './uploadPaths.js';

function fmtDate(d) {
  if (!d) return '';
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return String(d);
  return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
}

function fmtNum(n) {
  return new Intl.NumberFormat('vi-VN').format(Math.round(n || 0));
}

function escXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function decodeXml(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function parseSharedStrings(xml) {
  const result = [];
  let pos = 0;
  while (true) {
    const s = xml.indexOf('<si>', pos);
    if (s === -1) break;
    const e = xml.indexOf('</si>', s);
    if (e === -1) break;
    const block = xml.slice(s + 4, e);
    const texts = [];
    let tp = 0;
    while (true) {
      const ts = block.indexOf('<t', tp);
      if (ts === -1) break;
      const te = block.indexOf('</t>', ts);
      if (te === -1) break;
      const tagEnd = block.indexOf('>', ts);
      if (tagEnd === -1 || tagEnd > te) break;
      texts.push(block.slice(tagEnd + 1, te));
      tp = te + 4;
    }
    result.push(decodeXml(texts.join('')));
    pos = e + 5;
  }
  return result;
}

function buildSiXml(text) {
  const needsSpace = text.startsWith(' ') || text.endsWith(' ');
  const attr = needsSpace ? ' xml:space="preserve"' : '';
  return `<si><t${attr}>${escXml(text)}</t></si>`;
}

function rebuildSharedStrings(origXml, newTexts) {
  const sstStart = origXml.indexOf('<sst');
  const sstBodyStart = origXml.indexOf('>', sstStart) + 1;
  const sstEnd = origXml.lastIndexOf('</sst>');
  if (sstStart === -1 || sstEnd === -1) return origXml;
  const tag = origXml.slice(sstStart, sstBodyStart)
    .replace(/count="[^"]*"/, `count="${newTexts.length}"`)
    .replace(/uniqueCount="[^"]*"/, `uniqueCount="${newTexts.length}"`);
  return origXml.slice(0, sstStart) + tag + newTexts.map(buildSiXml).join('') + origXml.slice(sstEnd);
}

function parseRows(xml) {
  const rows = [];
  let pos = 0;
  while (true) {
    const s = xml.indexOf('<row ', pos);
    if (s === -1) break;
    const e = xml.indexOf('</row>', s);
    if (e === -1) break;
    const fullEnd = e + 6;
    const rowXml = xml.slice(s, fullEnd);
    const m = rowXml.match(/\br="(\d+)"/);
    if (m) rows.push({ rowNum: parseInt(m[1], 10), start: s, end: fullEnd, xml: rowXml });
    pos = fullEnd;
  }
  return rows;
}

function parseCells(rowXml) {
  const cells = [];
  let pos = 0;
  while (true) {
    const cStart = rowXml.indexOf('<c ', pos);
    if (cStart === -1) break;
    const selfClose = rowXml.indexOf('/>', cStart);
    const fullClose = rowXml.indexOf('</c>', cStart);
    let cEnd;
    if (selfClose !== -1 && (fullClose === -1 || selfClose < fullClose)) {
      cEnd = selfClose + 2;
    } else if (fullClose !== -1) {
      cEnd = fullClose + 4;
    } else {
      break;
    }
    const fullXml = rowXml.slice(cStart, cEnd);
    const refM = fullXml.match(/\br="([A-Z]+)(\d+)"/);
    if (refM) {
      cells.push({
        col: refM[1],
        rowNum: parseInt(refM[2], 10),
        type: (fullXml.match(/\bt="([^"]*)"/) || [])[1] || '',
        styleIdx: (fullXml.match(/\bs="(\d+)"/) || [])[1] || '',
        value: (fullXml.match(/<v>([^<]*)<\/v>/) || [])[1] || '',
        start: cStart,
        end: cEnd,
        fullXml,
      });
    }
    pos = cEnd;
  }
  return cells;
}

function buildItemRow(templateXml, newRowNum, ssReplace, numericReplace) {
  const cells = parseCells(templateXml);
  const openTagEnd = templateXml.indexOf('>') + 1;
  const newOpenTag = templateXml.slice(0, openTagEnd).replace(/\br="(\d+)"/, `r="${newRowNum}"`);
  const parts = [];
  let cursor = openTagEnd;

  for (const cell of cells) {
    if (cell.start > cursor) parts.push(templateXml.slice(cursor, cell.start));
    cursor = cell.end;
    const newRef = cell.col + newRowNum;
    const s = cell.styleIdx ? ` s="${cell.styleIdx}"` : '';
    if (numericReplace[cell.col] !== undefined) {
      parts.push(`<c r="${newRef}"${s}><v>${numericReplace[cell.col]}</v></c>`);
    } else if (ssReplace[cell.col] !== undefined) {
      parts.push(`<c r="${newRef}"${s} t="s"><v>${ssReplace[cell.col]}</v></c>`);
    } else {
      parts.push(cell.fullXml.replace(/\br="[A-Z]+\d+"/, `r="${newRef}"`));
    }
  }
  if (cursor < templateXml.length) parts.push(templateXml.slice(cursor));
  return newOpenTag + parts.join('');
}

function shiftAllRowNums(xml, delta) {
  if (delta <= 0) return xml;
  const rows = parseRows(xml);
  if (rows.length === 0) return xml;
  const out = [];
  let pos = 0;
  for (const row of rows) {
    out.push(xml.slice(pos, row.start));
    pos = row.end;
    const newRowNum = row.rowNum + delta;
    const cells = parseCells(row.xml);
    const openTagEnd = row.xml.indexOf('>') + 1;
    const newOpenTag = row.xml.slice(0, openTagEnd).replace(/\br="(\d+)"/, `r="${newRowNum}"`);
    const parts = [];
    let cur = openTagEnd;
    for (const cell of cells) {
      if (cell.start > cur) parts.push(row.xml.slice(cur, cell.start));
      cur = cell.end;
      parts.push(cell.fullXml.replace(/\br="[A-Z]+\d+"/, `r="${cell.col}${newRowNum}"`));
    }
    if (cur < row.xml.length) parts.push(row.xml.slice(cur));
    out.push(newOpenTag + parts.join(''));
  }
  out.push(xml.slice(pos));
  return out.join('');
}

function shiftMerges(xml, afterRow, delta) {
  if (delta <= 0) return xml;
  return xml.replace(
    /<mergeCell ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"\/>/g,
    (_m, c1, r1s, c2, r2s) => {
      const r1 = parseInt(r1s, 10);
      const r2 = parseInt(r2s, 10);
      return `<mergeCell ref="${c1}${r1 > afterRow ? r1 + delta : r1}:${c2}${r2 > afterRow ? r2 + delta : r2}"/>`;
    },
  );
}

function upsertSsCellInRow(sheetXml, rowNum, col, ssIdx, styleIdx) {
  const rows = parseRows(sheetXml);
  const row = rows.find((r) => r.rowNum === rowNum);
  if (!row) return sheetXml;
  const cells = parseCells(row.xml);
  const existing = cells.find((c) => c.col === col);
  const s = styleIdx ? ` s="${styleIdx}"` : '';
  const newCell = `<c r="${col}${rowNum}"${s} t="s"><v>${ssIdx}</v></c>`;
  let newRowXml;
  if (existing) {
    newRowXml = row.xml.slice(0, existing.start) + newCell + row.xml.slice(existing.end);
  } else {
    const closeTag = row.xml.lastIndexOf('</row>');
    newRowXml = row.xml.slice(0, closeTag) + newCell + row.xml.slice(closeTag);
  }
  return sheetXml.slice(0, row.start) + newRowXml + sheetXml.slice(row.end);
}

async function loadTemplateBuffer(mauKey) {
  const row = await queryOne('SELECT value FROM cau_hinh WHERE `key` = ?', [mauKey]);
  if (!row?.value) throw new Error(`Không tìm thấy mẫu (key: ${mauKey})`);
  const meta = JSON.parse(row.value);
  if (meta.path) {
    return fs.readFile(path.join(TEMPLATES_UPLOAD_DIR, meta.path));
  }
  if (meta.url) {
    const resp = await fetch(meta.url);
    if (!resp.ok) throw new Error('Không thể tải file mẫu');
    return Buffer.from(await resp.arrayBuffer());
  }
  throw new Error('Mẫu không có đường dẫn file hợp lệ');
}

export async function generateBaoGiaExcel(baoGiaId, mauKey) {
  const templateBuffer = await loadTemplateBuffer(mauKey);

  const bgData = await queryOne(
    `SELECT bg.*, kh.ten_cong_ty
     FROM bao_gia bg LEFT JOIN khach_hang kh ON bg.khach_hang_id = kh.id WHERE bg.id = ?`,
    [baoGiaId],
  );
  if (!bgData) throw new Error(`Không tìm thấy báo giá id=${baoGiaId}`);

  const items = await query(
    'SELECT * FROM bao_gia_chi_tiet WHERE bao_gia_id = ? ORDER BY id',
    [baoGiaId],
  );

  const cheDoVC = Number(bgData.che_do_van_chuyen ?? 1);
  const phiVC = Number(bgData.phi_van_chuyen || 0);

  const itemsWithGia = items.map((item) => {
    const giaCoBan = Number(item.gia_ban_co_ban) || Number(item.gia_ban_thuc_te) || 0;
    return { ...item, _gia_co_ban: giaCoBan };
  });

  const tongCoBan = itemsWithGia.reduce((s, i) => s + Number(i.so_luong) * i._gia_co_ban, 0);

  const itemsWithGiaBan = itemsWithGia.map((item) => {
    const giaCoBan = item._gia_co_ban;
    if (cheDoVC === 1 && phiVC > 0 && tongCoBan > 0 && Number(item.so_luong) > 0) {
      const tyLe = (Number(item.so_luong) * giaCoBan) / tongCoBan;
      const vcDonGia = Math.round((phiVC * tyLe) / Number(item.so_luong) / 1000) * 1000;
      return { ...item, _gia_xuat: giaCoBan + vcDonGia };
    }
    return { ...item, _gia_xuat: giaCoBan };
  });

  const tongTruocVAT = itemsWithGiaBan.reduce((s, i) => s + Number(i.so_luong) * i._gia_xuat, 0);
  const vat10 = itemsWithGiaBan.filter((i) => Number(i.thue_suat) === 10)
    .reduce((s, i) => s + Number(i.so_luong) * i._gia_xuat * 0.1, 0);
  const vat8 = itemsWithGiaBan.filter((i) => Number(i.thue_suat) === 8)
    .reduce((s, i) => s + Number(i.so_luong) * i._gia_xuat * 0.08, 0);
  const tongThanhToan = tongTruocVAT + vat10 + vat8 + (cheDoVC === 0 ? phiVC : 0);

  const zip = await JSZip.loadAsync(templateBuffer);
  const sheetKeys = Object.keys(zip.files).filter((k) => /xl\/worksheets\/sheet\d+\.xml$/.test(k));
  if (!sheetKeys.length) throw new Error('Không tìm thấy sheet XML');

  const ssFile = zip.file('xl/sharedStrings.xml');
  if (!ssFile) throw new Error('Không tìm thấy sharedStrings.xml');

  const [ssXmlOrig, sheetXmlOrig] = await Promise.all([
    ssFile.async('string'),
    zip.file(sheetKeys[0]).async('string'),
  ]);

  const ssTexts = parseSharedStrings(ssXmlOrig);
  const newSsTexts = [...ssTexts];
  const addSs = (text) => {
    const i = newSsTexts.length;
    newSsTexts.push(text);
    return i;
  };

  const headerMap = {
    '{{so_bao_gia}}': bgData.so_bao_gia || '',
    '{{ngay_bao_gia}}': fmtDate(bgData.ngay_bao_gia),
    '{{ten_du_an}}': bgData.ten_du_an || '',
    '{{ten_cong_ty}}': bgData.ten_cong_ty || bgData.ten_khach_hang || '',
    '{{tong_truoc_vat}}': '',
    '{{tong_thanh_toan}}': '',
    '{{VAT_10}}': fmtNum(vat10),
    '{{VAT_8}}': fmtNum(vat8),
  };
  for (let i = 0; i < newSsTexts.length; i++) {
    if (headerMap[newSsTexts[i]] !== undefined) newSsTexts[i] = headerMap[newSsTexts[i]];
  }

  const sttSsIdx = ssTexts.indexOf('{{stt}}');
  const allRows = parseRows(sheetXmlOrig);

  let templateRow = sttSsIdx !== -1
    ? allRows.find((row) => parseCells(row.xml).some((c) => c.type === 's' && parseInt(c.value, 10) === sttSsIdx))
    : undefined;
  if (!templateRow) templateRow = allRows.find((row) => row.xml.includes('{{stt}}'));
  if (!templateRow) throw new Error('Không tìm thấy dòng template chứa {{stt}} trong file mẫu');

  const phToCol = {};
  for (const cell of parseCells(templateRow.xml)) {
    if (cell.type === 's' && cell.value !== '') {
      const text = ssTexts[parseInt(cell.value, 10)];
      if (text) phToCol[text] = cell.col;
    }
    if (cell.type === 'inlineStr' || cell.type === '') {
      const inlineText = cell.fullXml.match(/{{[^}]+}}/)?.[0];
      if (inlineText) phToCol[inlineText] = cell.col;
    }
  }
  const rawPlaceholders = templateRow.xml.match(/\{\{[^}]+\}\}/g) || [];
  for (const ph of rawPlaceholders) {
    if (!phToCol[ph]) {
      for (const cell of parseCells(templateRow.xml)) {
        if (cell.fullXml.includes(ph)) {
          phToCol[ph] = cell.col;
          break;
        }
      }
    }
  }

  const COL_STT = phToCol['{{stt}}'] || 'A';
  const COL_TEN = phToCol['{{ten_san_pham}}'] || 'B';
  const COL_DVT = phToCol['{{don_vi}}'] || 'C';
  const COL_SL = phToCol['{{so_luong}}'] || 'F';
  const COL_DON_GIA = phToCol['{{gia_ban}}'] || 'G';
  const COL_THANH_TIEN = phToCol['{{thanh_tien}}'] || 'H';
  const COL_THUE = phToCol['{{thue_suat}}'] || 'I';

  const tmplRowNum = templateRow.rowNum;
  const numItems = items.length;
  const numExtra = numItems - 1;

  const itemRowXmls = [];
  for (let i = 0; i < numItems; i++) {
    const item = itemsWithGiaBan[i];
    const soLuong = Number(item.so_luong) || 0;
    const giaBan = item._gia_xuat;
    const thanhTien = soLuong * giaBan;
    const thueSuat = Number(item.thue_suat) || 0;
    itemRowXmls.push(buildItemRow(templateRow.xml, tmplRowNum + i, {
      [COL_STT]: addSs(String(i + 1)),
      [COL_TEN]: addSs(item.ten_san_pham || ''),
      [COL_DVT]: addSs(item.don_vi || ''),
      [COL_THUE]: addSs(`${thueSuat}%`),
    }, {
      [COL_SL]: soLuong,
      [COL_DON_GIA]: giaBan,
      [COL_THANH_TIEN]: thanhTien,
    }));
  }

  const before = sheetXmlOrig.slice(0, templateRow.start);
  const after = sheetXmlOrig.slice(templateRow.end);
  const shiftedAfter = shiftAllRowNums(after, numExtra);
  let combined = before + itemRowXmls.join('') + shiftedAfter;
  combined = shiftMerges(combined, tmplRowNum, numExtra);

  if (numExtra > 0) {
    const origMergeRe = /<mergeCell ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"\/>/g;
    const newMerges = [];
    let mm;
    while ((mm = origMergeRe.exec(sheetXmlOrig)) !== null) {
      const r1 = parseInt(mm[2], 10);
      const r2 = parseInt(mm[4], 10);
      if (r1 <= tmplRowNum && r2 >= tmplRowNum) {
        for (let i = 1; i < numItems; i++) {
          newMerges.push(
            `<mergeCell ref="${mm[1]}${r1 === tmplRowNum ? tmplRowNum + i : r1 + i}:${mm[3]}${r2 === tmplRowNum ? tmplRowNum + i : r2 + i}"/>`,
          );
        }
      }
    }
    if (newMerges.length) {
      combined = combined.replace('</mergeCells>', newMerges.join('') + '</mergeCells>');
      combined = combined.replace(
        /<mergeCells count="(\d+)"/,
        (_s, n) => `<mergeCells count="${parseInt(n, 10) + newMerges.length}"`,
      );
    }
  }

  const summaryStyle = '40';
  const row12 = tmplRowNum + numItems;
  const row15 = tmplRowNum + numItems + 3;
  combined = upsertSsCellInRow(combined, row12, 'G', addSs(fmtNum(tongTruocVAT)), summaryStyle);
  combined = upsertSsCellInRow(combined, row15, 'G', addSs(fmtNum(tongThanhToan)), summaryStyle);

  zip.file('xl/sharedStrings.xml', rebuildSharedStrings(ssXmlOrig, newSsTexts));
  zip.file(sheetKeys[0], combined);

  const outBuffer = Buffer.from(await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  }));

  const safeName = (bgData.so_bao_gia || 'bao-gia')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_');
  const fileName = `${safeName}.xlsx`;

  return { buffer: outBuffer, fileName };
}
