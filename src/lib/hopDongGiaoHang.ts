import { hopDongApi, phieuGiaoHangApi } from './api';
import type { HopDong, HopDongChiTiet } from '../types';

export function buildDaGiaoMapFromPhieuList(
  phieuList: { chi_tiet?: { hop_dong_chi_tiet_id?: number; so_luong_giao?: number }[] }[]
): Record<number, number> {
  const map: Record<number, number> = {};
  for (const phieu of phieuList) {
    for (const ct of phieu.chi_tiet || []) {
      const ref = ct.hop_dong_chi_tiet_id;
      if (ref) map[ref] = (map[ref] || 0) + (Number(ct.so_luong_giao) || 0);
    }
  }
  return map;
}

/** Còn ít nhất một dòng HĐ chưa giao đủ số lượng. */
export function hopDongConHangDuocGiao(
  chiTiet: Pick<HopDongChiTiet, 'id' | 'so_luong'>[],
  daGiaoMap: Record<number, number>
): boolean {
  if (!chiTiet?.length) return false;
  return chiTiet.some((ct) => {
    if (!ct.id) return true;
    const daGiao = daGiaoMap[ct.id] || 0;
    return (Number(ct.so_luong) || 0) - daGiao > 0;
  });
}

export function hopDongLabel(hd: { so_hop_dong?: string; ten_du_an?: string }): string {
  const so = hd.so_hop_dong || '';
  return hd.ten_du_an ? `${so} - ${hd.ten_du_an}` : so;
}

/** Loại HĐ đã xuất/giao hết hàng. */
export async function locHopDongConHang(hopDongs: HopDong[]): Promise<HopDong[]> {
  const checked = await Promise.all(
    hopDongs.map(async (hd) => {
      const id = Number(hd.id);
      if (!id) return null;
      try {
        const [hdRes, pghRes] = await Promise.all([
          hopDongApi.get(id),
          phieuGiaoHangApi.byHopDong(id),
        ]);
        const chiTiet = (hdRes.data?.chi_tiet || []) as HopDongChiTiet[];
        const map = buildDaGiaoMapFromPhieuList(pghRes.data || []);
        return hopDongConHangDuocGiao(chiTiet, map) ? hd : null;
      } catch {
        return hd;
      }
    })
  );
  return checked.filter((x): x is HopDong => x != null);
}
