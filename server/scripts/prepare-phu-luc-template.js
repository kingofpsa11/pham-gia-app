/**
 * Chuẩn bị mẫu Word phụ lục hợp đồng từ file PLHĐ thực tế.
 * Usage: node server/scripts/prepare-phu-luc-template.js [input.docx] [output.docx]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import PizZip from 'pizzip';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultIn = String.raw`g:\My Drive\00 Phạm Gia\2026\Hợp đồng\04 Pidi - Đại học Văn Hóa\PLHĐ 01 - HĐMB 07.docx`;
const defaultOut = path.join(__dirname, '../templates/mau_phu_luc_hop_dong.docx');
const input = process.argv[2] || defaultIn;
const output = process.argv[3] || defaultOut;

function replaceAcrossRuns(xml, from, to) {
  if (xml.includes(from)) return xml.split(from).join(to);
  const chars = [...from];
  let pattern = '';
  for (let i = 0; i < chars.length; i++) {
    pattern += chars[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (i < chars.length - 1) pattern += '(?:<(?!/w:p)[^>]+>)*';
  }
  const re = new RegExp(pattern, 'g');
  const next = xml.replace(re, () => to);
  if (next === xml) console.warn('NOT FOUND:', from.slice(0, 80));
  return next;
}

const buf = fs.readFileSync(input);
const zip = new PizZip(buf);
const xmlPath = 'word/document.xml';
let xml = zip.file(xmlPath).asText();

let tableIdx = 0;
xml = xml.replace(/<w:tbl[\s\S]*?<\/w:tbl>/g, (tbl) => {
  const i = tableIdx++;
  if (i === 2) {
    return '<w:p><w:r><w:t>{{BANG_CHI_TIET}}</w:t></w:r></w:p>';
  }
  return tbl;
});

const pairs = [
  ['PHỤ LỤC HỢP ĐỒNG 01', 'PHỤ LỤC HỢP ĐỒNG {{so_phu_luc}}'],
  ['PHỤ LỤC HỢP ĐỒNG 01', 'PHỤ LỤC HỢP ĐỒNG {{so_phu_luc}}'],
  ['07/HĐMB/2026/VISC-PG/HH3', '{{so_hop_dong}}'],
  ['ký ngày 15/01/2026', 'ký ngày {{ngay_hop_dong}}'],
  ['ký ngày 15/01/2026', 'ký ngày {{ngay_hop_dong}}'],
  ['Hôm nay, ngày 18 tháng 01 năm 2026', 'Hôm nay, ngày {{ngay}} tháng {{thang}} năm {{nam}}'],
  ['CÔNG TY CỔ PHẦN DỊCH VỤ QUỐC TẾ VIỆT NAM', '{{ten_cong_ty}}'],
  ['Công ty CP Dịch vụ Quốc tế Việt Nam', '{{ten_cong_ty}}'],
  ['Biệt thự số BT5-27 Khu đô thị Đoàn Ngoại Giao, Đường Xuân Tảo, Phường Xuân Đỉnh, TP Hà Nội, Việt Nam', '{{dia_chi}}'],
  ['024.62600000', '{{dien_thoai}}'],
  ['0107357034', '{{ma_so_thue}}'],
  ['26866 88888 - Tại Ngân Hàng Ngân Hàng TMCP Quân Đội – CN Hà Nội', '{{tai_khoan_ngan_hang}}'],
  ['Ông Đỗ Việt Thanh', '{{nguoi_dai_dien}}'],
  ['Tổng Giám Đốc', '{{chuc_vu}}'],
  ['ĐIỀU CHỈNH TĂNG NỘI DUNG CÔNG VIỆC VÀ GIÁ TRỊ HỢP ĐỒNG', '{{dieu_1_tieu_de}}'],
  ['465.780.540', '{{gia_tri_hd_truoc}}'],
  ['22.680.000', '{{gia_tri_phu_luc}}'],
  ['488.460.540', '{{gia_tri_hd_sau}}'],
  ['Giá trị PLHĐ 01', 'Giá trị PLHĐ {{so_phu_luc}}'],
];

for (const [from, to] of pairs) xml = replaceAcrossRuns(xml, from, to);

zip.file(xmlPath, xml);
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, zip.generate({ type: 'nodebuffer' }));

const plain = [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('');
const ph = [...new Set([...plain.matchAll(/\{\{[^}]+\}\}/g)].map((m) => m[0]))];
console.log('Wrote', output);
console.log('placeholders:', ph.join(', '));
if (!plain.includes('{{BANG_CHI_TIET}}')) console.warn('WARNING: missing BANG_CHI_TIET');
