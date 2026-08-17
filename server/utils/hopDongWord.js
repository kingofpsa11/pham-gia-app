import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { query, queryOne } from '../db.js';
import {
  calcTongTruocVAT,
  calcTongVAT,
  calcTongThanhToan,
} from './baoGiaCalc.js';
import { loadTemplateBuffer } from './loadTemplate.js';
import { soBangChu } from './soBangChu.js';
import { buildHopDongChiTietTableXml, injectChiTietTable } from './hopDongTableXml.js';

const MAU_HOP_DONG_KEY = 'mau_hop_dong';

function fmtDate(d) {
  if (!d) return '';
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return String(d);
  return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
}

/** "09 tháng 06 năm 2026" — dùng sau chữ "ngày" trong mẫu HĐ */
function fmtDateHopDongLong(d) {
  if (!d) return '';
  const s = String(d).trim();
  let ngay;
  let thang;
  let nam;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    nam = iso[1];
    thang = iso[2];
    ngay = iso[3];
  } else {
    const dt = d instanceof Date ? d : new Date(d);
    if (Number.isNaN(dt.getTime())) return s;
    ngay = String(dt.getDate()).padStart(2, '0');
    thang = String(dt.getMonth() + 1).padStart(2, '0');
    nam = String(dt.getFullYear());
  }
  return `${ngay} tháng ${thang} năm ${nam}`;
}

function fmtNum(n) {
  return new Intl.NumberFormat('vi-VN').format(Math.round(Number(n) || 0));
}

function parseDateParts(d) {
  const dt = d ? new Date(d) : new Date();
  if (Number.isNaN(dt.getTime())) return { ngay: '', thang: '', nam: '' };
  return {
    ngay: String(dt.getDate()),
    thang: String(dt.getMonth() + 1),
    nam: String(dt.getFullYear()),
  };
}

export async function generateHopDongDocx(hopDongId) {
  const templateBuffer = await loadTemplateBuffer(MAU_HOP_DONG_KEY, { fallbackFile: 'mau_hop_dong.docx' });

  const hd = await queryOne(
    `SELECT hd.*, kh.ten_cong_ty, kh.ma_so_thue, kh.dia_chi, kh.dien_thoai, kh.email,
            kh.nguoi_dai_dien, kh.chuc_vu, kh.tai_khoan_ngan_hang
     FROM hop_dong hd
     LEFT JOIN khach_hang kh ON hd.khach_hang_id = kh.id
     WHERE hd.id = ?`,
    [hopDongId],
  );
  if (!hd) throw new Error(`Không tìm thấy hợp đồng id=${hopDongId}`);

  const items = await query(
    'SELECT * FROM hop_dong_chi_tiet WHERE hop_dong_id = ? ORDER BY id',
    [hopDongId],
  );

  const cheDoVC = Number(hd.che_do_van_chuyen ?? 0);
  const phiVC = Number(hd.phi_van_chuyen || 0);
  const calcItems = items.map((r) => ({
    so_luong: r.so_luong,
    gia_ban_thuc_te: Number(r.gia_hop_dong) || 0,
    thue_suat: r.thue_suat,
  }));

  const tongTruocVAT = calcTongTruocVAT(calcItems);
  const tongVAT = calcTongVAT(calcItems);
  const vat10 = items
    .filter((i) => Number(i.thue_suat) === 10)
    .reduce((s, i) => s + Number(i.so_luong) * (Number(i.gia_hop_dong) || 0) * 0.1, 0);
  const vat8 = items
    .filter((i) => Number(i.thue_suat) === 8)
    .reduce((s, i) => s + Number(i.so_luong) * (Number(i.gia_hop_dong) || 0) * 0.08, 0);
  const phiRieng = cheDoVC === 0 ? phiVC : 0;
  const tongThanhToan = calcTongThanhToan(tongTruocVAT, tongVAT, phiRieng);
  const dateParts = parseDateParts(hd.ngay_hop_dong);

  const chiTiet = items.map((item, idx) => {
    const sl = Number(item.so_luong) || 0;
    const gia = Number(item.gia_hop_dong) || 0;
    return {
      stt: String(idx + 1),
      ten_san_pham: item.ten_san_pham || '',
      don_vi: item.don_vi || '',
      so_luong: fmtNum(sl),
      don_gia: fmtNum(gia),
      gia_hop_dong: fmtNum(gia),
      thanh_tien: fmtNum(sl * gia),
      thue_suat: item.thue_suat != null ? String(item.thue_suat) : '',
    };
  });

  const tongBangChu = soBangChu(tongThanhToan);
  const tableXml = buildHopDongChiTietTableXml(items);

  const data = {
    // Mẫu Word Phạm Gia (UPPERCASE)
    SO_HD: hd.so_hop_dong || '',
    NGAY_KY: fmtDateHopDongLong(hd.ngay_hop_dong),
    TEN_DU_AN: hd.ten_du_an || '',
    TEN_CONG_TY: hd.ten_cong_ty || '',
    DIA_CHI: hd.dia_chi || '',
    DIEN_THOAI: hd.dien_thoai || '',
    MST: hd.ma_so_thue || '',
    STK: hd.tai_khoan_ngan_hang || '',
    NGUOI_DAI_DIEN: hd.nguoi_dai_dien || '',
    CHUC_VU: hd.chuc_vu || '',
    TONG_BANG_CHU: tongBangChu,
    TONG_THANH_TOAN: fmtNum(tongThanhToan),
    // Lowercase (mẫu generic)
    so_hop_dong: hd.so_hop_dong || '',
    ngay_hop_dong: fmtDateHopDongLong(hd.ngay_hop_dong),
    ngay: dateParts.ngay,
    thang: dateParts.thang,
    nam: dateParts.nam,
    ten_du_an: hd.ten_du_an || '',
    mo_ta_noi_dung: hd.mo_ta_noi_dung || '',
    ten_cong_ty: hd.ten_cong_ty || '',
    ma_so_thue: hd.ma_so_thue || '',
    dia_chi: hd.dia_chi || '',
    dien_thoai: hd.dien_thoai || '',
    email: hd.email || '',
    nguoi_dai_dien: hd.nguoi_dai_dien || '',
    chuc_vu: hd.chuc_vu || '',
    tai_khoan_ngan_hang: hd.tai_khoan_ngan_hang || '',
    tong_truoc_vat: fmtNum(tongTruocVAT),
    vat_10: fmtNum(vat10),
    vat_8: fmtNum(vat8),
    phi_van_chuyen: fmtNum(phiRieng),
    tong_thanh_toan: fmtNum(tongThanhToan),
    tong_bang_chu: tongBangChu,
    chi_tiet: chiTiet,
  };

  const zip = new PizZip(templateBuffer);
  const docFile = zip.file('word/document.xml');
  if (!docFile) throw new Error('Mẫu Word thiếu word/document.xml');
  const patchedXml = injectChiTietTable(docFile.asText(), tableXml);
  zip.file('word/document.xml', patchedXml);

  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: '{{', end: '}}' },
  });

  try {
    doc.render(data);
  } catch (err) {
    const props = err.properties?.errors?.map((e) => e.properties?.explanation || e.message).join('; ');
    throw new Error(props || err.message || 'Lỗi điền dữ liệu vào mẫu Word');
  }

  const buffer = doc.getZip().generate({
    type: 'nodebuffer',
    compression: 'DEFLATE',
  });

  const safeSo = (hd.so_hop_dong || `HD${hopDongId}`).replace(/[^\w.-]+/g, '_');
  const fileName = `${safeSo}.docx`;
  return { buffer, fileName };
}
