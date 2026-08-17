/**
 * Chuẩn bị mẫu BBBG Excel từ file biên bản bàn giao thực tế.
 * Usage: node server/scripts/prepare-bbbg-template.js [input.xlsx] [output.xlsx]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import JSZip from 'jszip';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultIn = String.raw`g:\My Drive\00 Phạm Gia\2026\Hợp đồng\19 Pidi - LĐ 146\Đầu ra\BBBG 146 1.xlsx`;
const defaultOut = path.join(__dirname, '../templates/mau_bbbg.xlsx');

const input = process.argv[2] || defaultIn;
const output = process.argv[3] || defaultOut;

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
    result.push(texts.join(''));
    pos = e + 5;
  }
  return result;
}

function escXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildSiXml(text) {
  const needsSpace = text.startsWith(' ') || text.endsWith(' ') || text.includes('\r') || text.includes('\n');
  const attr = needsSpace ? ' xml:space="preserve"' : '';
  return `<si><t${attr}>${escXml(text)}</t></si>`;
}

function rebuildSharedStrings(origXml, newTexts) {
  const sstStart = origXml.indexOf('<sst');
  const sstBodyStart = origXml.indexOf('>', sstStart) + 1;
  const sstEnd = origXml.lastIndexOf('</sst>');
  const origTag = origXml.slice(sstStart, sstBodyStart);
  const tag = origTag
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

const REPLACE_EXACT = {
  'BBBG số:        /2026': 'BBBG số: {{so_bbbg}}',
  'Hà Nội, ngày      tháng      năm 2026': 'Hà Nội, ngày {{ngay}} tháng {{thang}} năm {{nam}}',
  '1. BÊN GIAO: CÔNG TY TNHH ĐẦU TƯ XÂY DỰNG VÀ DỊCH VỤ KỸ THUẬT PHẠM GIA':
    '1. BÊN GIAO: CÔNG TY TNHH ĐẦU TƯ XÂY DỰNG VÀ DỊCH VỤ KỸ THUẬT PHẠM GIA',
  '- Người giao hàng: Phạm Mạnh Hà': '- Người giao hàng: {{nguoi_giao}}',
  '2. BÊN NHẬN: CÔNG TY CỔ PHẦN ĐẦU TƯ VÀ XÂY LẮP KỸ THUẬT HẠ TẦNG PIDI':
    '2. BÊN NHẬN: {{ten_cong_ty}}',
  '- Người nhận hàng: .................................................':
    '- Người nhận hàng: {{nguoi_nhan}}',
  'Phạm Mạnh Hà': '{{nguoi_giao}}',
};

const buf = fs.readFileSync(input);
const zip = await JSZip.loadAsync(buf);
const sheetKey = Object.keys(zip.files).find((k) => /xl\/worksheets\/sheet\d+\.xml$/.test(k));
if (!sheetKey) throw new Error('Không tìm thấy sheet');

let ssXml = await zip.file('xl/sharedStrings.xml').async('string');
let sheetXml = await zip.file(sheetKey).async('string');
const ssTexts = parseSharedStrings(ssXml);

// Replace header shared strings
for (let i = 0; i < ssTexts.length; i++) {
  const key = ssTexts[i];
  if (REPLACE_EXACT[key] !== undefined) ssTexts[i] = REPLACE_EXACT[key];
  // Chức vụ cells: keep label, append placeholder via separate cells if needed
  if (key === 'Chức vụ:') {
    // Will handle F6/F8 by putting placeholder in adjacent shared string replacement on sheet cells
  }
}

// Add new placeholders if missing
const need = [
  '{{so_bbbg}}',
  '{{ngay}}',
  '{{thang}}',
  '{{nam}}',
  '{{ten_cong_ty}}',
  '{{nguoi_giao}}',
  '{{nguoi_nhan}}',
  '{{chuc_vu_giao}}',
  '{{chuc_vu_nhan}}',
  '{{stt}}',
  '{{ten_san_pham}}',
  '{{don_vi}}',
  '{{so_luong}}',
  '{{ghi_chu}}',
];
const addSs = (text) => {
  const idx = ssTexts.indexOf(text);
  if (idx !== -1) return idx;
  ssTexts.push(text);
  return ssTexts.length - 1;
};
for (const p of need) addSs(p);

const idx = {
  stt: addSs('{{stt}}'),
  ten: addSs('{{ten_san_pham}}'),
  dvt: addSs('{{don_vi}}'),
  sl: addSs('{{so_luong}}'),
  gc: addSs('{{ghi_chu}}'),
  cvGiao: addSs('Chức vụ: {{chuc_vu_giao}}'),
  cvNhan: addSs('Chức vụ: {{chuc_vu_nhan}}'),
};

// Update Chức vụ shared string usages on F6/F8 by rewriting cells in rows 6 and 8
function setCellShared(rowXml, col, ssIndex) {
  const re = new RegExp(`<c r="${col}\\d+"([^>]*)>(?:[\\s\\S]*?)</c>|<c r="${col}\\d+"([^/]*)/>`);
  const newCell = `<c r="${col}${rowXml.match(/\br="(\d+)"/)[1]}" t="s"${rowXml.includes(`r="${col}`) ? '' : ''}><v>${ssIndex}</v></c>`;
  // Find cell for this col
  const cellRe = new RegExp(`<c r="${col}(\\d+)"([^>]*)(?:/>|>([\\s\\S]*?)</c>)`);
  const m = rowXml.match(cellRe);
  if (!m) {
    // insert before </row>
    return rowXml.replace('</row>', `<c r="${col}${rowXml.match(/\br="(\d+)"/)[1]}" t="s"><v>${ssIndex}</v></c></row>`);
  }
  const rowNum = m[1];
  const style = (m[2].match(/s="(\d+)"/) || [])[1];
  const sAttr = style ? ` s="${style}"` : '';
  return rowXml.replace(cellRe, `<c r="${col}${rowNum}"${sAttr} t="s"><v>${ssIndex}</v></c>`);
}

const rows = parseRows(sheetXml);
const keepRows = [];
let templateItemRow = null;

for (const row of rows) {
  if (row.rowNum === 6) {
    let xml = setCellShared(row.xml, 'F', idx.cvGiao);
    keepRows.push({ ...row, xml });
  } else if (row.rowNum === 8) {
    let xml = setCellShared(row.xml, 'F', idx.cvNhan);
    keepRows.push({ ...row, xml });
  } else if (row.rowNum === 11) {
    // First item row → placeholders (GIỮ style border gốc)
    function setPlaceholder(rowXml, col, ssIndex, forceStyle) {
      const cellRe = new RegExp(`<c r="${col}11"([^>]*)(?:/>|>([\\s\\S]*?)</c>)`);
      const m = rowXml.match(cellRe);
      const style = forceStyle || (m?.[1].match(/s="(\d+)"/) || [])[1] || '';
      const sAttr = style ? ` s="${style}"` : '';
      const cell = `<c r="${col}11"${sAttr} t="s"><v>${ssIndex}</v></c>`;
      if (!m) return rowXml.replace('</row>', `${cell}</row>`);
      return rowXml.replace(cellRe, cell);
    }
    let xml = row.xml;
    // Styles từ mẫu gốc: A/F/G/H = 3 (border đủ), B = 12 (cột tên), C/D/E giữ nguyên merge
    xml = setPlaceholder(xml, 'A', idx.stt, '3');
    xml = setPlaceholder(xml, 'B', idx.ten, '12');
    xml = setPlaceholder(xml, 'F', idx.dvt, '3');
    xml = setPlaceholder(xml, 'G', idx.sl, '3');
    xml = setPlaceholder(xml, 'H', idx.gc, '3');
    templateItemRow = { ...row, xml };
    keepRows.push(templateItemRow);
  } else if (row.rowNum >= 12 && row.rowNum <= 17) {
    // drop sample item rows
    continue;
  } else if (row.rowNum > 17) {
    // shift up by 6 (removed rows 12-17)
    const delta = -6;
    const newNum = row.rowNum + delta;
    let xml = row.xml.replace(/\br="(\d+)"/, `r="${newNum}"`);
    xml = xml.replace(/\br="([A-Z]+)(\d+)"/g, (_m, col, r) => `r="${col}${parseInt(r, 10) + delta}"`);
    keepRows.push({ rowNum: newNum, xml, start: row.start, end: row.end });
  } else {
    keepRows.push(row);
  }
}

// Rebuild sheet: replace all row blocks
const firstRowStart = rows[0].start;
const lastRowEnd = rows[rows.length - 1].end;
const newSheet =
  sheetXml.slice(0, firstRowStart) +
  keepRows.map((r) => r.xml).join('') +
  sheetXml.slice(lastRowEnd);

// Fix merges: remove item merges for rows 12-17, keep row 11 merge B11:E11, shift merges after 17
let mergeBlock = newSheet.match(/<mergeCells[\s\S]*?<\/mergeCells>/)?.[0] || '';
const merges = [...mergeBlock.matchAll(/<mergeCell ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"\/>/g)].map((m) => ({
  c1: m[1], r1: parseInt(m[2], 10), c2: m[3], r2: parseInt(m[4], 10),
}));
const newMerges = [];
for (const mg of merges) {
  // Drop merges fully inside deleted item rows 12-17
  if (mg.r1 >= 12 && mg.r2 <= 17) continue;
  let r1 = mg.r1;
  let r2 = mg.r2;
  if (r1 > 17) r1 -= 6;
  if (r2 > 17) r2 -= 6;
  // Keep B11:E11 for template row
  if (r1 >= 12 && r1 <= 11) continue;
  newMerges.push(`<mergeCell ref="${mg.c1}${r1}:${mg.c2}${r2}"/>`);
}
const mergeXml = `<mergeCells count="${newMerges.length}">${newMerges.join('')}</mergeCells>`;
const finalSheet = newSheet.replace(/<mergeCells[\s\S]*?<\/mergeCells>/, mergeXml);

zip.file('xl/sharedStrings.xml', rebuildSharedStrings(ssXml, ssTexts));
zip.file(sheetKey, finalSheet);

fs.mkdirSync(path.dirname(output), { recursive: true });
const outBuf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
fs.writeFileSync(output, outBuf);
console.log('Wrote', output);
console.log('Shared strings sample:', ssTexts.filter((t) => t.includes('{{')).join(', '));
