/**
 * Test xuất Word với mẫu local (không cần DB upload).
 * Usage: node server/scripts/test-hop-dong-word.js <hop_dong_id>
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { query, queryOne } from '../db.js';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { buildHopDongChiTietTableXml, injectChiTietTable } from '../utils/hopDongTableXml.js';
import { soBangChu } from '../utils/soBangChu.js';
import { calcTongTruocVAT, calcTongVAT, calcTongThanhToan } from '../utils/baoGiaCalc.js';

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const hopDongId = process.argv[2];
if (!hopDongId) {
  console.error('Usage: node test-hop-dong-word.js <hop_dong_id>');
  process.exit(1);
}

function fmtDate(d) {
  const dt = new Date(d);
  return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
}
function fmtNum(n) {
  return new Intl.NumberFormat('vi-VN').format(Math.round(Number(n) || 0));
}

const templatePath = path.join(__dirname, '../../uploads/templates/Mau-hop-dong-Pham-Gia.docx');
const templateBuffer = await fs.readFile(templatePath);

const hd = await queryOne(
  `SELECT hd.*, kh.ten_cong_ty, kh.ma_so_thue, kh.dia_chi, kh.dien_thoai,
          kh.nguoi_dai_dien, kh.chuc_vu, kh.tai_khoan_ngan_hang
   FROM hop_dong hd LEFT JOIN khach_hang kh ON hd.khach_hang_id = kh.id WHERE hd.id = ?`,
  [hopDongId],
);
const items = await query('SELECT * FROM hop_dong_chi_tiet WHERE hop_dong_id = ? ORDER BY id', [hopDongId]);

const calcItems = items.map((r) => ({
  so_luong: r.so_luong,
  gia_ban_thuc_te: Number(r.gia_hop_dong) || 0,
  thue_suat: r.thue_suat,
}));
const tongTruocVAT = calcTongTruocVAT(calcItems);
const tongVAT = calcTongVAT(calcItems);
const tongThanhToan = calcTongThanhToan(tongTruocVAT, tongVAT, 0);

const zip = new PizZip(templateBuffer);
const tableXml = buildHopDongChiTietTableXml(items);
zip.file('word/document.xml', injectChiTietTable(zip.file('word/document.xml').asText(), tableXml));

const data = {
  SO_HD: hd.so_hop_dong,
  NGAY_KY: fmtDate(hd.ngay_hop_dong),
  TEN_DU_AN: hd.ten_du_an || '',
  TEN_CONG_TY: hd.ten_cong_ty || '',
  DIA_CHI: hd.dia_chi || '',
  DIEN_THOAI: hd.dien_thoai || '',
  MST: hd.ma_so_thue || '',
  STK: hd.tai_khoan_ngan_hang || '',
  NGUOI_DAI_DIEN: hd.nguoi_dai_dien || '',
  CHUC_VU: hd.chuc_vu || '',
  TONG_BANG_CHU: soBangChu(tongThanhToan),
  TONG_THANH_TOAN: fmtNum(tongThanhToan),
};

const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, delimiters: { start: '{{', end: '}}' } });
doc.render(data);

const out = path.join(__dirname, '../../uploads/templates/test-output.docx');
await fs.writeFile(out, doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' }));
console.log('Wrote', out);
