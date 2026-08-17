import JSZip from 'jszip';
import { query, queryOne } from '../db.js';
import { loadTemplateBuffer } from './loadTemplate.js';
import { CHI_TIET_SELECT, enrichPhieuChiTietRows, loadHopDongChiTietOrdered } from './phieuGiaoHangChiTiet.js';

const MAU_KEY = 'mau_bbbg';
const FALLBACK = 'mau_bbbg.xlsx';

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
  const needsSpace = text.startsWith(' ') || text.endsWith(' ') || /[\r\n]/.test(text);
  const attr = needsSpace ? ' xml:space="preserve"' : '';
  return `<si><t${attr}>${escXml(text)}</t></si>`;
}

function rebuildSharedStrings(origXml, newTexts) {
  const sstStart = origXml.indexOf('<sst');
  const sstBodyStart = origXml.indexOf('>', sstStart) + 1;
  const sstEnd = origXml.lastIndexOf('</sst>');
  if (sstStart === -1 || sstEnd === -1) return origXml;
  const origTag = origXml.slice(sstStart, sstBodyStart);
  const origCount = parseInt((origTag.match(/count="(\d+)"/) || [])[1], 10);
  const count = Number.isFinite(origCount) ? Math.max(origCount, newTexts.length) : newTexts.length;
  const tag = origTag
    .replace(/count="[^"]*"/, `count="${count}"`)
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
    if (selfClose !== -1 && (fullClose === -1 || selfClose < fullClose)) cEnd = selfClose + 2;
    else if (fullClose !== -1) cEnd = fullClose + 4;
    else break;
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

function applyRowHeight(openTag, height) {
  if (!height || height <= 15) return openTag;
  let tag = openTag.replace(/\sht="[^"]*"/, '').replace(/\scustomHeight="[^"]*"/, '');
  return tag.replace('<row ', `<row ht="${height}" customHeight="1" `);
}

function buildItemRow(templateXml, newRowNum, ssReplace, numericReplace = {}, rowHeight, styleOverride = {}) {
  const cells = parseCells(templateXml);
  const openTagEnd = templateXml.indexOf('>') + 1;
  let newOpenTag = templateXml.slice(0, openTagEnd).replace(/\br="(\d+)"/, `r="${newRowNum}"`);
  newOpenTag = applyRowHeight(newOpenTag, rowHeight);
  const parts = [];
  let cursor = openTagEnd;
  for (const cell of cells) {
    if (cell.start > cursor) parts.push(templateXml.slice(cursor, cell.start));
    cursor = cell.end;
    const newRef = cell.col + newRowNum;
    const styleIdx = styleOverride[cell.col] !== undefined
      ? styleOverride[cell.col]
      : cell.styleIdx;
    const s = styleIdx ? ` s="${styleIdx}"` : '';
    if (numericReplace[cell.col] !== undefined) {
      parts.push(`<c r="${newRef}"${s}><v>${numericReplace[cell.col]}</v></c>`);
    } else if (ssReplace[cell.col] !== undefined) {
      parts.push(`<c r="${newRef}"${s} t="s"><v>${ssReplace[cell.col]}</v></c>`);
    } else {
      // Keep empty styled cells (C/D/E trong vùng merge) để border liền mạch
      const kept = cell.fullXml.replace(/\br="[A-Z]+\d+"/, `r="${newRef}"`);
      if (styleIdx && !/\bs="/.test(kept)) {
        parts.push(kept.replace('<c ', `<c s="${styleIdx}" `));
      } else if (styleIdx) {
        parts.push(kept.replace(/\bs="\d+"/, `s="${styleIdx}"`));
      } else {
        parts.push(kept);
      }
    }
  }
  if (cursor < templateXml.length) parts.push(templateXml.slice(cursor));
  return newOpenTag + parts.join('');
}

function shiftAllRowNums(xml, delta) {
  if (delta === 0) return xml;
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
  if (delta === 0) return xml;
  return xml.replace(
    /<mergeCell ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"\/>/g,
    (_m, c1, r1s, c2, r2s) => {
      const r1 = parseInt(r1s, 10);
      const r2 = parseInt(r2s, 10);
      return `<mergeCell ref="${c1}${r1 > afterRow ? r1 + delta : r1}:${c2}${r2 > afterRow ? r2 + delta : r2}"/>`;
    },
  );
}

const FIELD_ALIASES = {
  stt: ['{{stt}}', '{{STT}}'],
  ten_san_pham: ['{{ten_san_pham}}', '{{TEN_SAN_PHAM}}'],
  don_vi: ['{{don_vi}}', '{{DVT}}'],
  so_luong: ['{{so_luong}}', '{{SL}}'],
  ghi_chu: ['{{ghi_chu}}', '{{GHI_CHU}}'],
};

function findSsIndex(ssTexts, aliases) {
  for (const ph of aliases) {
    const idx = ssTexts.indexOf(ph);
    if (idx !== -1) return idx;
  }
  return -1;
}

function resolveCol(phToCol, aliases, fallback) {
  for (const ph of aliases) {
    if (phToCol[ph]) return phToCol[ph];
  }
  return fallback;
}

function parseDateParts(d) {
  if (!d) {
    const now = new Date();
    return {
      ngay: String(now.getDate()).padStart(2, '0'),
      thang: String(now.getMonth() + 1).padStart(2, '0'),
      nam: String(now.getFullYear()),
    };
  }
  const s = String(d).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return { ngay: iso[3], thang: iso[2], nam: iso[1] };
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return { ngay: '', thang: '', nam: '' };
  return {
    ngay: String(dt.getDate()).padStart(2, '0'),
    thang: String(dt.getMonth() + 1).padStart(2, '0'),
    nam: String(dt.getFullYear()),
  };
}

function buildSoBbbg(soPhieu, ngayGiao) {
  const parts = parseDateParts(ngayGiao);
  const raw = String(soPhieu || '').trim();
  if (raw) {
    // Keep existing number style if already looks like BBBG
    if (/bbbg/i.test(raw) || raw.includes('/')) return raw.replace(/^BBBG\s*s[ốo]?:\s*/i, '').trim();
    return `${raw}/${parts.nam}`;
  }
  return ` /${parts.nam}`;
}

/**
 * @param {number} phieuGiaoHangId
 * @param {{ nguoi_giao?: string, chuc_vu_giao?: string, nguoi_nhan?: string, chuc_vu_nhan?: string, so_bbbg?: string }} [opts]
 */
export async function generateBbbgExcel(phieuGiaoHangId, opts = {}) {
  const templateBuffer = await loadTemplateBuffer(MAU_KEY, { fallbackFile: FALLBACK });

  const pgh = await queryOne(
    `SELECT pgh.*, kh.ten_cong_ty, kh.nguoi_dai_dien, kh.chuc_vu,
            hd.so_hop_dong, hd.ten_du_an
     FROM phieu_giao_hang pgh
     LEFT JOIN khach_hang kh ON pgh.khach_hang_id = kh.id
     LEFT JOIN hop_dong hd ON pgh.hop_dong_id = hd.id
     WHERE pgh.id = ?`,
    [phieuGiaoHangId],
  );
  if (!pgh) throw new Error(`Không tìm thấy phiếu giao hàng id=${phieuGiaoHangId}`);

  const rawItems = await query(
    `${CHI_TIET_SELECT} WHERE pghct.phieu_giao_hang_id = ? ORDER BY pghct.id`,
    [phieuGiaoHangId],
  );
  const hdRows = await loadHopDongChiTietOrdered(pgh.hop_dong_id);
  const items = enrichPhieuChiTietRows(rawItems, hdRows).filter(
    (r) => (Number(r.so_luong_giao) || 0) > 0 || String(r.ten_san_pham || '').trim(),
  );
  if (items.length === 0) throw new Error('Phiếu giao hàng chưa có dòng hàng để xuất BBBG');

  const dateParts = parseDateParts(pgh.ngay_giao);
  const soBbbg = opts.so_bbbg || buildSoBbbg(pgh.so_phieu, pgh.ngay_giao);
  const nguoiGiao = opts.nguoi_giao || 'Phạm Mạnh Hà';
  const chucVuGiao = opts.chuc_vu_giao || '';
  const nguoiNhan = opts.nguoi_nhan || pgh.nguoi_dai_dien || '';
  const chucVuNhan = opts.chuc_vu_nhan || pgh.chuc_vu || '';

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
    newSsTexts.push(String(text ?? ''));
    return i;
  };

  const placeholderMap = {
    '{{so_bbbg}}': soBbbg,
    '{{ngay}}': dateParts.ngay,
    '{{thang}}': dateParts.thang,
    '{{nam}}': dateParts.nam,
    '{{ten_cong_ty}}': pgh.ten_cong_ty || '',
    '{{nguoi_giao}}': nguoiGiao,
    '{{nguoi_nhan}}': nguoiNhan || '.................................................',
    '{{chuc_vu_giao}}': chucVuGiao,
    '{{chuc_vu_nhan}}': chucVuNhan,
  };

  // Also replace composite shared strings
  for (let i = 0; i < newSsTexts.length; i++) {
    let t = newSsTexts[i];
    for (const [ph, val] of Object.entries(placeholderMap)) {
      if (t.includes(ph)) t = t.split(ph).join(val);
    }
    newSsTexts[i] = t;
  }

  const sttSsIdx = findSsIndex(ssTexts, FIELD_ALIASES.stt);
  const allRows = parseRows(sheetXmlOrig);
  let templateRow = sttSsIdx !== -1
    ? allRows.find((row) => parseCells(row.xml).some((c) => c.type === 's' && parseInt(c.value, 10) === sttSsIdx))
    : undefined;
  if (!templateRow) {
    for (const ph of FIELD_ALIASES.stt) {
      templateRow = allRows.find((row) => row.xml.includes(ph));
      if (templateRow) break;
    }
  }
  if (!templateRow) throw new Error('Không tìm thấy dòng template chứa {{stt}} trong mẫu BBBG');

  const phToCol = {};
  for (const cell of parseCells(templateRow.xml)) {
    if (cell.type === 's' && cell.value !== '') {
      const text = ssTexts[parseInt(cell.value, 10)];
      if (text) phToCol[text] = cell.col;
    }
  }

  const COL_STT = resolveCol(phToCol, FIELD_ALIASES.stt, 'A');
  const COL_TEN = resolveCol(phToCol, FIELD_ALIASES.ten_san_pham, 'B');
  const COL_DVT = resolveCol(phToCol, FIELD_ALIASES.don_vi, 'F');
  const COL_SL = resolveCol(phToCol, FIELD_ALIASES.so_luong, 'G');
  const COL_GC = resolveCol(phToCol, FIELD_ALIASES.ghi_chu, 'H');

  // Style border từ dòng mẫu; fallback theo mẫu BBBG gốc (A/F/G/H=3, B=12, C/D=10, E=11)
  const templateCells = parseCells(templateRow.xml);
  const styleOf = (col, fallback) => {
    const found = templateCells.find((c) => c.col === col)?.styleIdx;
    return found || fallback;
  };
  const styleOverride = {
    A: styleOf('A', '3'),
    B: styleOf('B', '12'),
    C: styleOf('C', '10'),
    D: styleOf('D', '10'),
    E: styleOf('E', '11'),
    F: styleOf('F', '3'),
    G: styleOf('G', '3'),
    H: styleOf('H', '3'),
  };

  const tmplRowNum = templateRow.rowNum;
  const numItems = items.length;
  const numExtra = numItems - 1;

  const itemRowXmls = [];
  for (let i = 0; i < numItems; i++) {
    const item = items[i];
    const rowNum = tmplRowNum + i;
    const soLuong = Number(item.so_luong_giao) || 0;
    const tenText = item.ten_san_pham || '';
    const rowHeight = Math.min(90, Math.max(18, Math.ceil(tenText.length / 40) * 15));
    itemRowXmls.push(buildItemRow(templateRow.xml, rowNum, {
      [COL_STT]: addSs(String(i + 1)),
      [COL_TEN]: addSs(tenText),
      [COL_DVT]: addSs(item.don_vi || ''),
      [COL_GC]: addSs(item.ghi_chu || ''),
    }, {
      [COL_SL]: soLuong,
    }, rowHeight, styleOverride));
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
      combined = combined.replace('</mergeCells>', `${newMerges.join('')}</mergeCells>`);
      combined = combined.replace(
        /<mergeCells count="(\d+)"/,
        (_s, n) => `<mergeCells count="${parseInt(n, 10) + newMerges.length}"`,
      );
    }
  }

  zip.file('xl/sharedStrings.xml', rebuildSharedStrings(ssXmlOrig, newSsTexts));
  zip.file(sheetKeys[0], combined);

  const outBuffer = Buffer.from(await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  }));

  const safeName = (pgh.so_phieu || `BBBG-${phieuGiaoHangId}`)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_');
  return { buffer: outBuffer, fileName: `BBBG_${safeName}.xlsx` };
}
