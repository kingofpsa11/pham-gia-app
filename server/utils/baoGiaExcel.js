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

function parseStylesLookup(stylesXml) {
  const customFmts = new Map();
  for (const m of stylesXml.matchAll(/<numFmt numFmtId="(\d+)" formatCode="([^"]+)"/g)) {
    customFmts.set(parseInt(m[1], 10), m[2]);
  }
  const xfs = [...stylesXml.matchAll(/<xf ([^/>]+)\/?>/g)].map((m) => m[1]);
  return { customFmts, xfs };
}

function getNumFmtId(xfAttrs, xfs) {
  let numFmtId = parseInt((xfAttrs.match(/numFmtId="(\d+)"/) || [])[1] || '0', 10);
  if (!xfAttrs.includes('applyNumberFormat="1"')) {
    const xfId = parseInt((xfAttrs.match(/xfId="(\d+)"/) || [])[1] || '0', 10);
    const parent = xfs[xfId];
    if (parent) {
      numFmtId = parseInt((parent.match(/numFmtId="(\d+)"/) || [])[1] || String(numFmtId), 10);
    }
  }
  return numFmtId;
}

function isPercentNumFmt(numFmtId, customFmts) {
  if (numFmtId === 9 || numFmtId === 10) return true;
  return (customFmts.get(numFmtId) || '').includes('%');
}

function findPercentStyleIdx(stylesLookup) {
  const { xfs, customFmts } = stylesLookup;
  for (let i = 0; i < xfs.length; i++) {
    if (isPercentNumFmt(getNumFmtId(xfs[i], xfs), customFmts)) return String(i);
  }
  return '';
}

function resolveThueStyleIdx(templateCells, colThue, stylesLookup) {
  const thueCell = templateCells.find((c) => c.col === colThue);
  if (thueCell?.styleIdx) {
    const xf = stylesLookup.xfs[parseInt(thueCell.styleIdx, 10)];
    if (xf && isPercentNumFmt(getNumFmtId(xf, stylesLookup.xfs), stylesLookup.customFmts)) {
      return thueCell.styleIdx;
    }
  }
  return findPercentStyleIdx(stylesLookup) || thueCell?.styleIdx || '';
}

function colToNum(col) {
  let n = 0;
  for (const c of col) n = n * 26 + (c.charCodeAt(0) - 64);
  return n;
}

function getMergeSpanForCol(sheetXml, col, rowNum) {
  const ref = `${col}${rowNum}`;
  for (const m of sheetXml.matchAll(/<mergeCell ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"/g)) {
    if (`${m[1]}${m[2]}` === ref) return { colStart: m[1], colEnd: m[3] };
  }
  return { colStart: col, colEnd: col };
}

function getColWidthFromSheet(sheetXml, colNum) {
  for (const m of sheetXml.matchAll(/<col min="(\d+)" max="(\d+)"([^>]*)\/>/g)) {
    const min = parseInt(m[1], 10);
    const max = parseInt(m[2], 10);
    if (colNum >= min && colNum <= max) {
      const w = (m[3].match(/width="([\d.]+)"/) || [])[1];
      return w ? parseFloat(w) : 8.43;
    }
  }
  return 8.43;
}

function getMergedColWidth(sheetXml, colStart, colEnd) {
  const start = colToNum(colStart);
  const end = colToNum(colEnd);
  let total = 0;
  for (let c = start; c <= end; c++) total += getColWidthFromSheet(sheetXml, c);
  return total;
}

function ensureWrapTextStyleIdx(stylesXml, baseStyleIdx) {
  const xfsBlock = stylesXml.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/);
  if (!xfsBlock) return { stylesXml, styleIdx: baseStyleIdx };

  const xfs = [...xfsBlock[1].matchAll(/<xf ([^>]*?)(?:\/>|>[\s\S]*?<\/xf>)/g)];
  const baseEntry = xfs[parseInt(baseStyleIdx, 10)];
  if (!baseEntry) return { stylesXml, styleIdx: baseStyleIdx };

  let attrs = baseEntry[1].trim();
  if (!attrs.includes('applyAlignment')) attrs += ' applyAlignment="1"';
  else attrs = attrs.replace('applyAlignment="0"', 'applyAlignment="1"');

  const newXf = `<xf ${attrs}><alignment horizontal="left" vertical="center" wrapText="1"/></xf>`;
  const count = parseInt((stylesXml.match(/<cellXfs count="(\d+)"/) || [])[1], 10);
  const updated = stylesXml
    .replace('</cellXfs>', `${newXf}</cellXfs>`)
    .replace(/<cellXfs count="\d+"/, `<cellXfs count="${count + 1}"`);

  return { stylesXml: updated, styleIdx: String(count) };
}

function estimateRowHeight(textLen, totalColWidth) {
  const charsPerLine = Math.max(12, Math.floor(totalColWidth * 0.85));
  const lines = Math.max(1, Math.ceil(textLen / charsPerLine));
  return Math.min(120, Math.max(15, lines * 15));
}

function applyRowHeight(openTag, height) {
  if (!height || height <= 15) return openTag;
  let tag = openTag.replace(/\sht="[^"]*"/, '').replace(/\scustomHeight="[^"]*"/, '');
  return tag.replace('<row ', `<row ht="${height}" customHeight="1" `);
}

function cellStyleAttr(cell, styleOverride) {
  if (styleOverride[cell.col] !== undefined) {
    return styleOverride[cell.col] ? ` s="${styleOverride[cell.col]}"` : '';
  }
  return cell.styleIdx ? ` s="${cell.styleIdx}"` : '';
}

function buildItemRow(templateXml, newRowNum, ssReplace, numericReplace, formulaReplace = {}, styleOverride = {}, rowHeight) {
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
    const s = cellStyleAttr(cell, styleOverride);
    if (formulaReplace[cell.col] !== undefined) {
      parts.push(`<c r="${newRef}"${s}><f>${formulaReplace[cell.col]}</f></c>`);
    } else if (numericReplace[cell.col] !== undefined) {
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

function findPlaceholderCell(sheetXml, ssTexts, placeholder) {
  for (const row of parseRows(sheetXml)) {
    for (const cell of parseCells(row.xml)) {
      let matched = false;
      if (cell.type === 's' && cell.value !== '') {
        const text = ssTexts[parseInt(cell.value, 10)];
        if (text === placeholder) matched = true;
      }
      if (cell.fullXml.includes(placeholder)) matched = true;
      if (matched) {
        return { rowNum: row.rowNum, col: cell.col, styleIdx: cell.styleIdx || '' };
      }
    }
  }
  return null;
}

function shiftSummaryRow(origRow, tmplRowNum, numExtra) {
  return origRow > tmplRowNum ? origRow + numExtra : origRow;
}

function upsertFormulaCellInRow(sheetXml, rowNum, col, formula, styleIdx) {
  const rows = parseRows(sheetXml);
  const row = rows.find((r) => r.rowNum === rowNum);
  if (!row) return sheetXml;
  const cells = parseCells(row.xml);
  const existing = cells.find((c) => c.col === col);
  const s = styleIdx ? ` s="${styleIdx}"` : '';
  const newCell = `<c r="${col}${rowNum}"${s}><f>${formula}</f></c>`;
  let newRowXml;
  if (existing) {
    newRowXml = row.xml.slice(0, existing.start) + newCell + row.xml.slice(existing.end);
  } else {
    const closeTag = row.xml.lastIndexOf('</row>');
    newRowXml = row.xml.slice(0, closeTag) + newCell + row.xml.slice(closeTag);
  }
  return sheetXml.slice(0, row.start) + newRowXml + sheetXml.slice(row.end);
}

const FIELD_ALIASES = {
  stt: ['{{stt}}', '{{STT}}'],
  ten_san_pham: ['{{ten_san_pham}}', '{{TEN_SAN_PHAM}}'],
  don_vi: ['{{don_vi}}', '{{DVT}}'],
  so_luong: ['{{so_luong}}', '{{SL}}'],
  gia_ban: ['{{gia_ban}}', '{{DON_GIA}}'],
  thanh_tien: ['{{thanh_tien}}', '{{THANH_TIEN}}'],
  thue_suat: ['{{thue_suat}}', '{{THUE_SUAT}}'],
  so_bao_gia: ['{{so_bao_gia}}', '{{SO_BAO_GIA}}'],
  ngay_bao_gia: ['{{ngay_bao_gia}}', '{{NGAY_BAO_GIA}}'],
  ten_du_an: ['{{ten_du_an}}', '{{TEN_DU_AN}}'],
  ten_cong_ty: ['{{ten_cong_ty}}', '{{TEN_CONG_TY}}', '{{TEN_KHACH_HANG}}'],
  tong_truoc_vat: ['{{tong_truoc_vat}}', '{{TONG_TRUOC_VAT}}', '{{TONG_TRUOC_THUE}}'],
  vat_10: ['{{VAT_10}}'],
  vat_8: ['{{VAT_8}}'],
  tong_thanh_toan: ['{{tong_thanh_toan}}', '{{TONG_THANH_TOAN}}', '{{TONG_TIEN}}'],
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

function findPlaceholderCellAny(sheetXml, ssTexts, aliases) {
  for (const ph of aliases) {
    const loc = findPlaceholderCell(sheetXml, ssTexts, ph);
    if (loc) return loc;
  }
  return null;
}

function buildPlaceholderMap(values) {
  const map = {};
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    if (values[field] === undefined) continue;
    for (const ph of aliases) map[ph] = values[field];
  }
  return map;
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

  const zip = await JSZip.loadAsync(templateBuffer);
  const sheetKeys = Object.keys(zip.files).filter((k) => /xl\/worksheets\/sheet\d+\.xml$/.test(k));
  if (!sheetKeys.length) throw new Error('Không tìm thấy sheet XML');

  const ssFile = zip.file('xl/sharedStrings.xml');
  if (!ssFile) throw new Error('Không tìm thấy sharedStrings.xml');

  const stylesFile = zip.file('xl/styles.xml');
  const [ssXmlOrig, sheetXmlOrig, stylesXmlOrig] = await Promise.all([
    ssFile.async('string'),
    zip.file(sheetKeys[0]).async('string'),
    stylesFile ? stylesFile.async('string') : Promise.resolve(''),
  ]);
  const stylesLookup = parseStylesLookup(stylesXmlOrig);

  const ssTexts = parseSharedStrings(ssXmlOrig);
  const newSsTexts = [...ssTexts];
  const addSs = (text) => {
    const i = newSsTexts.length;
    newSsTexts.push(text);
    return i;
  };

  const placeholderMap = buildPlaceholderMap({
    so_bao_gia: bgData.so_bao_gia || '',
    ngay_bao_gia: fmtDate(bgData.ngay_bao_gia),
    ten_du_an: bgData.ten_du_an || '',
    ten_cong_ty: bgData.ten_cong_ty || bgData.ten_khach_hang || '',
  });

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

  const COL_STT = resolveCol(phToCol, FIELD_ALIASES.stt, 'A');
  const COL_TEN = resolveCol(phToCol, FIELD_ALIASES.ten_san_pham, 'B');
  const COL_DVT = resolveCol(phToCol, FIELD_ALIASES.don_vi, 'C');
  const COL_SL = resolveCol(phToCol, FIELD_ALIASES.so_luong, 'F');
  const COL_DON_GIA = resolveCol(phToCol, FIELD_ALIASES.gia_ban, 'G');
  const COL_THANH_TIEN = resolveCol(phToCol, FIELD_ALIASES.thanh_tien, 'H');
  const COL_THUE = resolveCol(phToCol, FIELD_ALIASES.thue_suat, 'I');

  const templateCells = parseCells(templateRow.xml);
  const tenTemplateStyle = templateCells.find((c) => c.col === COL_TEN)?.styleIdx || '';
  const wrapTenStyle = ensureWrapTextStyleIdx(stylesXmlOrig, tenTemplateStyle);
  let stylesXmlOut = wrapTenStyle.stylesXml;

  const thueStyleOverride = {
    [COL_THUE]: resolveThueStyleIdx(templateCells, COL_THUE, stylesLookup),
    [COL_TEN]: wrapTenStyle.styleIdx,
  };

  const tmplRowNum = templateRow.rowNum;
  const mergeSpan = getMergeSpanForCol(sheetXmlOrig, COL_TEN, tmplRowNum);
  const tenColWidth = getMergedColWidth(sheetXmlOrig, mergeSpan.colStart, mergeSpan.colEnd);
  const numItems = items.length;
  const numExtra = numItems - 1;

  const itemRowXmls = [];
  for (let i = 0; i < numItems; i++) {
    const item = itemsWithGiaBan[i];
    const rowNum = tmplRowNum + i;
    const soLuong = Number(item.so_luong) || 0;
    const giaBan = item._gia_xuat;
    const thueSuat = Number(item.thue_suat) || 0;
    const tenText = item.ten_san_pham || '';
    const rowHeight = estimateRowHeight(tenText.length, tenColWidth);
    itemRowXmls.push(buildItemRow(templateRow.xml, rowNum, {
      [COL_STT]: addSs(String(i + 1)),
      [COL_TEN]: addSs(tenText),
      [COL_DVT]: addSs(item.don_vi || ''),
    }, {
      [COL_SL]: soLuong,
      [COL_DON_GIA]: giaBan,
      [COL_THUE]: thueSuat / 100,
    }, {
      [COL_THANH_TIEN]: `${COL_SL}${rowNum}*${COL_DON_GIA}${rowNum}`,
    }, thueStyleOverride, rowHeight));
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

  for (let i = 0; i < newSsTexts.length; i++) {
    if (placeholderMap[newSsTexts[i]] !== undefined) newSsTexts[i] = placeholderMap[newSsTexts[i]];
  }

  if (numItems > 0) {
    const firstItemRow = tmplRowNum;
    const lastItemRow = tmplRowNum + numItems - 1;
    const thanhTienRange = `${COL_THANH_TIEN}${firstItemRow}:${COL_THANH_TIEN}${lastItemRow}`;
    const thueRange = `${COL_THUE}${firstItemRow}:${COL_THUE}${lastItemRow}`;

    const locTongTruoc = findPlaceholderCellAny(sheetXmlOrig, ssTexts, FIELD_ALIASES.tong_truoc_vat);
    const locVat10 = findPlaceholderCellAny(sheetXmlOrig, ssTexts, FIELD_ALIASES.vat_10);
    const locVat8 = findPlaceholderCellAny(sheetXmlOrig, ssTexts, FIELD_ALIASES.vat_8);
    const locTongThanhToan = findPlaceholderCellAny(sheetXmlOrig, ssTexts, FIELD_ALIASES.tong_thanh_toan);

    const summaryFormulas = [];
    if (locTongTruoc) {
      summaryFormulas.push([
        locTongTruoc,
        `SUM(${thanhTienRange})`,
      ]);
    }
    if (locVat10) {
      summaryFormulas.push([
        locVat10,
        `SUMIF(${thueRange},0.1,${thanhTienRange})*0.1`,
      ]);
    }
    if (locVat8) {
      summaryFormulas.push([
        locVat8,
        `SUMIF(${thueRange},0.08,${thanhTienRange})*0.08`,
      ]);
    }
    if (locTongThanhToan && locTongTruoc && locVat10 && locVat8) {
      const rowTong = shiftSummaryRow(locTongTruoc.rowNum, tmplRowNum, numExtra);
      const rowV10 = shiftSummaryRow(locVat10.rowNum, tmplRowNum, numExtra);
      const rowV8 = shiftSummaryRow(locVat8.rowNum, tmplRowNum, numExtra);
      const tongParts = [
        `${locTongTruoc.col}${rowTong}`,
        `${locVat10.col}${rowV10}`,
        `${locVat8.col}${rowV8}`,
      ];
      if (cheDoVC === 0 && phiVC > 0) tongParts.push(String(phiVC));
      summaryFormulas.push([locTongThanhToan, tongParts.join('+')]);
    }

    for (const [loc, formula] of summaryFormulas) {
      const targetRow = shiftSummaryRow(loc.rowNum, tmplRowNum, numExtra);
      combined = upsertFormulaCellInRow(combined, targetRow, loc.col, formula, loc.styleIdx);
    }
  }

  zip.file('xl/sharedStrings.xml', rebuildSharedStrings(ssXmlOrig, newSsTexts));
  if (stylesFile) zip.file('xl/styles.xml', stylesXmlOut);
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
