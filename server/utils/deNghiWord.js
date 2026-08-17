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

function fmtDate(d) {
  if (!d) return '';
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return String(d);
  return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
}

function fmtNum(n) {
  return new Intl.NumberFormat('vi-VN').format(Math.round(Number(n) || 0));
}

function parseDateParts(d) {
  const dt = d ? new Date(d) : new Date();
  if (Number.isNaN(dt.getTime())) {
    const now = new Date();
    return {
      ngay: String(now.getDate()).padStart(2, '0'),
      thang: String(now.getMonth() + 1).padStart(2, '0'),
      nam: String(now.getFullYear()),
      iso: now,
    };
  }
  return {
    ngay: String(dt.getDate()).padStart(2, '0'),
    thang: String(dt.getMonth() + 1).padStart(2, '0'),
    nam: String(dt.getFullYear()),
    iso: dt,
  };
}

function buildSoVanBan(ngayVanBan) {
  const p = parseDateParts(ngayVanBan);
  return `${p.ngay}${p.thang}/${p.nam}/PG`;
}

function capitalizeBangChu(s) {
  const t = String(s || '').trim();
  if (!t) return '';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * @param {number} hopDongId
 * @param {'tam_ung'|'thanh_toan'} loai
 * @param {{
 *   so_van_ban?: string,
 *   ngay_van_ban?: string,
 *   so_tien?: number,
 *   ngay_ban_giao?: string,
 *   nguoi_ky?: string,
 *   tieu_de?: string,
 * }} [opts]
 */
export async function generateDeNghiDocx(hopDongId, loai, opts = {}) {
  if (loai !== 'tam_ung' && loai !== 'thanh_toan') {
    throw new Error('loai phải là tam_ung hoặc thanh_toan');
  }

  const configKey = loai === 'tam_ung' ? 'mau_de_nghi_tam_ung' : 'mau_de_nghi_thanh_toan';
  const fallbackFile = loai === 'tam_ung' ? 'mau_de_nghi_tam_ung.docx' : 'mau_de_nghi_thanh_toan.docx';
  const templateBuffer = await loadTemplateBuffer(configKey, { fallbackFile });

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
  const phiRieng = cheDoVC === 0 ? phiVC : 0;
  const tongThanhToan = calcTongThanhToan(tongTruocVAT, tongVAT, phiRieng);
  const giaTriTamUng = Number(hd.gia_tri_tam_ung) || 0;
  const giaTriConLai = Math.max(0, tongThanhToan - giaTriTamUng);

  const ngayVanBan = opts.ngay_van_ban || new Date().toISOString().slice(0, 10);
  const parts = parseDateParts(ngayVanBan);
  const soTien = opts.so_tien != null
    ? Number(opts.so_tien)
    : (loai === 'tam_ung' ? giaTriTamUng : giaTriConLai);

  let ngayBanGiao = opts.ngay_ban_giao || '';
  if (!ngayBanGiao && loai === 'thanh_toan') {
    const latestPgh = await queryOne(
      `SELECT ngay_giao FROM phieu_giao_hang
       WHERE hop_dong_id = ? ORDER BY ngay_giao DESC, id DESC LIMIT 1`,
      [hopDongId],
    );
    ngayBanGiao = latestPgh?.ngay_giao ? fmtDate(latestPgh.ngay_giao) : '';
  } else if (ngayBanGiao) {
    ngayBanGiao = fmtDate(ngayBanGiao);
  }

  const tieuDe = opts.tieu_de
    || (loai === 'tam_ung' ? 'Đề nghị tạm ứng' : 'Đề nghị thanh toán và thông báo giao hàng');

  const data = {
    so_van_ban: opts.so_van_ban || buildSoVanBan(ngayVanBan),
    tieu_de: tieuDe,
    so_hop_dong: hd.so_hop_dong || '',
    ngay: parts.ngay,
    thang: parts.thang,
    nam: parts.nam,
    ten_cong_ty: hd.ten_cong_ty || '',
    ngay_hop_dong: fmtDate(hd.ngay_hop_dong),
    so_tien: fmtNum(soTien),
    so_tien_bang_chu: capitalizeBangChu(soBangChu(soTien)),
    ngay_ban_giao: ngayBanGiao || '..../..../......',
    nguoi_ky: opts.nguoi_ky || 'Phạm Mạnh Hà',
    ten_du_an: hd.ten_du_an || '',
    gia_tri_tam_ung: fmtNum(giaTriTamUng),
    gia_tri_con_lai: fmtNum(giaTriConLai),
    tong_thanh_toan: fmtNum(tongThanhToan),
  };

  const zip = new PizZip(templateBuffer);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: '{{', end: '}}' },
  });
  doc.render(data);

  const buffer = doc.getZip().generate({
    type: 'nodebuffer',
    compression: 'DEFLATE',
  });

  const safeHd = (hd.so_hop_dong || `HD-${hopDongId}`)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_');
  const prefix = loai === 'tam_ung' ? 'De_nghi_tam_ung' : 'De_nghi_thanh_toan';
  return { buffer, fileName: `${prefix}_${safeHd}.docx`, meta: data };
}
