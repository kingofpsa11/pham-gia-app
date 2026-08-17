import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { query, queryOne } from '../db.js';
import { loadTemplateBuffer } from './loadTemplate.js';
import { soBangChu } from './soBangChu.js';
import { buildHopDongChiTietTableXml, injectChiTietTable } from './hopDongTableXml.js';
import { dieu1TieuDe } from './phuLucHopDong.js';

const MAU_KEY = 'mau_phu_luc_hop_dong';

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
  if (Number.isNaN(dt.getTime())) return { ngay: '', thang: '', nam: '' };
  return {
    ngay: String(dt.getDate()).padStart(2, '0'),
    thang: String(dt.getMonth() + 1).padStart(2, '0'),
    nam: String(dt.getFullYear()),
  };
}

function capitalizeBangChu(s) {
  const t = String(s || '').trim();
  if (!t) return '';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export async function generatePhuLucDocx(phuLucId) {
  const templateBuffer = await loadTemplateBuffer(MAU_KEY, { fallbackFile: 'mau_phu_luc_hop_dong.docx' });

  const pl = await queryOne(
    `SELECT pl.*, hd.so_hop_dong, hd.ngay_hop_dong, hd.ten_du_an,
            kh.ten_cong_ty, kh.ma_so_thue, kh.dia_chi, kh.dien_thoai, kh.email,
            kh.nguoi_dai_dien, kh.chuc_vu, kh.tai_khoan_ngan_hang
     FROM phu_luc_hop_dong pl
     JOIN hop_dong hd ON hd.id = pl.hop_dong_id
     LEFT JOIN khach_hang kh ON kh.id = hd.khach_hang_id
     WHERE pl.id = ?`,
    [phuLucId],
  );
  if (!pl) throw new Error(`Không tìm thấy phụ lục id=${phuLucId}`);

  const items = await query(
    'SELECT * FROM phu_luc_hop_dong_chi_tiet WHERE phu_luc_id = ? ORDER BY id',
    [phuLucId],
  );

  const tableItems = items.map((r) => ({
    ten_san_pham: r.ten_san_pham,
    don_vi: r.don_vi,
    so_luong: r.so_luong_thay_doi,
    gia_hop_dong: r.gia_hop_dong,
    thue_suat: r.thue_suat,
  }));
  const tableXml = buildHopDongChiTietTableXml(tableItems);
  const parts = parseDateParts(pl.ngay_ky);
  const dieu1 = pl.tieu_de?.trim() || dieu1TieuDe(items);

  const data = {
    so_phu_luc: pl.so_phu_luc || '',
    so_hop_dong: pl.so_hop_dong || '',
    ngay_hop_dong: fmtDate(pl.ngay_hop_dong),
    ngay_ky: fmtDate(pl.ngay_ky),
    ngay: parts.ngay,
    thang: parts.thang,
    nam: parts.nam,
    ten_du_an: pl.ten_du_an || '',
    ten_cong_ty: pl.ten_cong_ty || '',
    ma_so_thue: pl.ma_so_thue || '',
    dia_chi: pl.dia_chi || '',
    dien_thoai: pl.dien_thoai || '',
    email: pl.email || '',
    nguoi_dai_dien: pl.nguoi_dai_dien || '',
    chuc_vu: pl.chuc_vu || '',
    tai_khoan_ngan_hang: pl.tai_khoan_ngan_hang || '',
    dieu_1_tieu_de: dieu1,
    gia_tri_hd_truoc: fmtNum(pl.gia_tri_hd_truoc),
    gia_tri_phu_luc: fmtNum(pl.gia_tri_phu_luc),
    gia_tri_hd_sau: fmtNum(pl.gia_tri_hd_sau),
    gia_tri_hd_sau_bang_chu: capitalizeBangChu(soBangChu(pl.gia_tri_hd_sau)),
    ly_do: pl.ly_do || '',
  };

  const zip = new PizZip(templateBuffer);
  const docFile = zip.file('word/document.xml');
  if (!docFile) throw new Error('Mẫu Word thiếu word/document.xml');
  zip.file('word/document.xml', injectChiTietTable(docFile.asText(), tableXml));

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

  const buffer = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
  const safeHd = (pl.so_hop_dong || `HD-${pl.hop_dong_id}`).replace(/[^\w.-]+/g, '_');
  return { buffer, fileName: `PLHD_${pl.so_phu_luc || phuLucId}_${safeHd}.docx` };
}
