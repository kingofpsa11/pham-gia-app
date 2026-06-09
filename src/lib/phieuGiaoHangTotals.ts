import type { PhieuGiaoHang, PhieuGiaoHangChiTiet } from '../types';

export function donGiaChuaVatPgh(ct: PhieuGiaoHangChiTiet): number {
  return Number(ct.gia_hop_dong) || Number(ct.gia_ban_thuc_te) || 0;
}

export function calcTongSauThuePhieuChiTiet(chiTiet: PhieuGiaoHangChiTiet[]): number {
  let tongTruocVAT = 0;
  let vat8 = 0;
  let vat10 = 0;
  for (const ct of chiTiet || []) {
    const sl = Number(ct.so_luong_giao) || 0;
    const gia = donGiaChuaVatPgh(ct);
    const tien = sl * gia;
    const thue = Number(ct.thue_suat) || 10;
    tongTruocVAT += tien;
    if (thue === 8) vat8 += tien * 0.08;
    else if (thue === 10) vat10 += tien * 0.1;
  }
  return tongTruocVAT + vat8 + vat10;
}

/** Giá trị ghi nợ = tổng sau thuế VAT (ưu tiên tính từ chi tiết). */
export function giaTriGhiNoPhieu(pgh: Pick<PhieuGiaoHang, 'gia_tri_ghi_no' | 'chi_tiet'>): number {
  if (pgh.chi_tiet?.length) {
    return calcTongSauThuePhieuChiTiet(pgh.chi_tiet);
  }
  return Number(pgh.gia_tri_ghi_no) || 0;
}
