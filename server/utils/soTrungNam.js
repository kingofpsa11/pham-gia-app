/** Năm từ ngày ISO (yyyy-mm-dd) hoặc dd/mm/yyyy */
export function parseNamFromDate(ngay) {
  if (!ngay) return new Date().getFullYear();
  const s = String(ngay).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return parseInt(s.slice(0, 4), 10);
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return parseInt(m[3], 10);
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.getFullYear();
  return new Date().getFullYear();
}

export async function findBaoGiaTrungSo(queryOne, soBaoGia, nam, excludeId) {
  const so = String(soBaoGia || '').trim();
  if (!so || !nam) return null;
  if (excludeId) {
    return queryOne(
      `SELECT id, so_bao_gia, ngay_bao_gia FROM bao_gia
       WHERE TRIM(so_bao_gia) = ? AND YEAR(ngay_bao_gia) = ? AND id != ? LIMIT 1`,
      [so, nam, excludeId]
    );
  }
  return queryOne(
    `SELECT id, so_bao_gia, ngay_bao_gia FROM bao_gia
     WHERE TRIM(so_bao_gia) = ? AND YEAR(ngay_bao_gia) = ? LIMIT 1`,
    [so, nam]
  );
}

export async function findHopDongTrungSo(queryOne, soHopDong, nam, excludeId) {
  const so = String(soHopDong || '').trim();
  if (!so || !nam) return null;
  if (excludeId) {
    return queryOne(
      `SELECT id, so_hop_dong, ngay_hop_dong FROM hop_dong
       WHERE TRIM(so_hop_dong) = ? AND YEAR(ngay_hop_dong) = ? AND id != ? LIMIT 1`,
      [so, nam, excludeId]
    );
  }
  return queryOne(
    `SELECT id, so_hop_dong, ngay_hop_dong FROM hop_dong
     WHERE TRIM(so_hop_dong) = ? AND YEAR(ngay_hop_dong) = ? LIMIT 1`,
    [so, nam]
  );
}

export function messageBaoGiaTrung(so, nam) {
  return `Số báo giá "${so}" đã tồn tại trong năm ${nam}. Vui lòng nhập số khác.`;
}

export function messageHopDongTrung(so, nam) {
  return `Số hợp đồng "${so}" đã tồn tại trong năm ${nam}. Vui lòng nhập số khác.`;
}
