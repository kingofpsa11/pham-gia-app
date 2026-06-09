import { query } from '../db.js';

export const CHI_TIET_SELECT = `
  SELECT pghct.*, hdct.ten_san_pham, hdct.gia_hop_dong, hdct.gia_ban_thuc_te,
         hdct.thue_suat, hdct.so_luong AS so_luong_hop_dong
  FROM phieu_giao_hang_chi_tiet pghct
  LEFT JOIN hop_dong_chi_tiet hdct ON hdct.id = pghct.hop_dong_chi_tiet_id
`;

export async function loadHopDongChiTietOrdered(hopDongId) {
  if (!hopDongId) return [];
  return query(
    `SELECT id, ten_san_pham, gia_hop_dong, gia_ban_thuc_te, thue_suat, so_luong, don_vi
     FROM hop_dong_chi_tiet WHERE hop_dong_id = ? ORDER BY id`,
    [hopDongId],
  );
}

/** Bổ sung tên SP / đơn giá khi FK hop_dong_chi_tiet_id lệch (theo thứ tự dòng). */
export function enrichPhieuChiTietRows(rows, hopDongChiTiet) {
  return (rows || []).map((row, idx) => {
    const hasName = String(row.ten_san_pham || '').trim();
    const hasPrice = row.gia_hop_dong != null && Number(row.gia_hop_dong) > 0;
    const hasThue = row.thue_suat != null && Number(row.thue_suat) > 0;

    const byId = row.hop_dong_chi_tiet_id
      ? hopDongChiTiet.find((h) => String(h.id) === String(row.hop_dong_chi_tiet_id))
      : null;
    const hd = byId || hopDongChiTiet[idx];
    if (!hd) {
      return hasName && hasPrice && hasThue
        ? row
        : { ...row, thue_suat: row.thue_suat ?? 10 };
    }

    const giaChuaVat = hasPrice ? row.gia_hop_dong : hd.gia_hop_dong;
    if (hasName && hasPrice && hasThue) return row;

    return {
      ...row,
      ten_san_pham: hasName ? row.ten_san_pham : hd.ten_san_pham,
      gia_hop_dong: giaChuaVat,
      gia_ban_thuc_te: row.gia_ban_thuc_te ?? hd.gia_ban_thuc_te,
      thue_suat: row.thue_suat ?? hd.thue_suat ?? 10,
      so_luong_hop_dong: row.so_luong_hop_dong ?? hd.so_luong,
      don_vi: row.don_vi || hd.don_vi,
    };
  });
}

/** Đơn giá chưa VAT dùng cho PGH (ưu tiên giá hợp đồng). */
export function donGiaChuaVat(ct) {
  return Number(ct.gia_hop_dong) || Number(ct.gia_ban_thuc_te) || 0;
}

export function calcTotalsFromPhieuChiTiet(rows) {
  let tongTruocVAT = 0;
  let vat8 = 0;
  let vat10 = 0;
  for (const ct of rows || []) {
    const sl = Number(ct.so_luong_giao) || 0;
    const gia = donGiaChuaVat(ct);
    const tien = sl * gia;
    const thue = Number(ct.thue_suat) || 10;
    tongTruocVAT += tien;
    if (thue === 8) vat8 += tien * 0.08;
    else if (thue === 10) vat10 += tien * 0.1;
  }
  return {
    tongTruocVAT,
    vat8,
    vat10,
    tongSauThue: tongTruocVAT + vat8 + vat10,
  };
}

export async function calcGiaTriGhiNoFromChiTiet(chiTiet, hopDongId = null) {
  const hdRows = hopDongId ? await loadHopDongChiTietOrdered(hopDongId) : [];
  const enriched = enrichPhieuChiTietRows(chiTiet, hdRows);
  return calcTotalsFromPhieuChiTiet(enriched).tongSauThue;
}
