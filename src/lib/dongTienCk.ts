import type { DongTienMoi, TaiKhoanTien } from '../types';

export type ChieuTien = 'thu' | 'chi';

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function namesMatch(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

export function parseMoTaCounterpart(moTa?: string | null): string {
  if (!moTa) return '';
  const parts = moTa.split('--');
  if (parts.length < 2) return '';
  return parts[parts.length - 1].trim();
}

export function findTaiKhoanByHint(
  list: TaiKhoanTien[],
  hint: string,
  excludeId?: number,
): TaiKhoanTien | undefined {
  const h = hint.trim();
  if (!h) return undefined;
  return list.find(
    (tk) =>
      (excludeId == null || String(tk.id) !== String(excludeId))
      && tk.ten_tai_khoan
      && namesMatch(tk.ten_tai_khoan, h),
  );
}

function isSelfNhan(row: DongTienMoi): boolean {
  return !!row.tai_khoan_nhan_id
    && String(row.tai_khoan_nhan_id) === String(row.tai_khoan_tien_id);
}

/** Suy chiều tiền từ cặp CK cùng ngày / cùng số tiền / khác tài khoản. */
function resolveCkChieuFromPair(row: DongTienMoi, paired: DongTienMoi): ChieuTien | null {
  if (String(paired.tai_khoan_nhan_id) === String(row.tai_khoan_tien_id)
    && !isSelfNhan(paired)) {
    return 'thu';
  }
  if (String(row.tai_khoan_nhan_id) === String(paired.tai_khoan_tien_id)
    && !isSelfNhan(row)) {
    return 'chi';
  }
  return null;
}

export function findCkCounterpartForImport(
  list: TaiKhoanTien[],
  currentId: string | number,
  hints: Array<string | undefined | null>,
): TaiKhoanTien | undefined {
  const exclude = Number(currentId);
  for (const hint of hints) {
    const found = hint ? findTaiKhoanByHint(list, hint, exclude) : undefined;
    if (found) return found;
  }
  return undefined;
}

function dateKey(ngay?: string | null): string {
  return (ngay || '').slice(0, 10);
}

export function findCkPair(row: DongTienMoi, allRows: DongTienMoi[]): DongTienMoi | undefined {
  const dk = dateKey(row.ngay_giao_dich);
  const amt = Number(row.so_tien);
  return allRows.find(
    (r) =>
      r.id !== row.id
      && r.loai_giao_dich === 'chuyen_khoan_noi_bo'
      && Number(r.so_tien) === amt
      && dateKey(r.ngay_giao_dich) === dk
      && r.tai_khoan_tien_id !== row.tai_khoan_tien_id,
  );
}

/** Tài khoản đối ứng hiển thị (← gửi / → nhận). */
export function resolveCkCounterpartName(
  row: DongTienMoi,
  taiKhoanList: TaiKhoanTien[],
  allRows?: DongTienMoi[],
  chieu?: ChieuTien,
): string {
  const paired = allRows ? findCkPair(row, allRows) : undefined;
  const ckChieu = chieu ?? resolveCkChieu(row, taiKhoanList, allRows);

  if (ckChieu === 'thu' && paired) {
    const pairedTk = taiKhoanList.find((t) => t.id === paired.tai_khoan_tien_id);
    return pairedTk?.ten_tai_khoan || paired.ten_tai_khoan || '';
  }
  if (ckChieu === 'chi' && row.ten_tai_khoan_nhan && !isSelfNhan(row)) {
    return row.ten_tai_khoan_nhan;
  }
  if (paired) {
    const pairedTk = taiKhoanList.find((t) => t.id === paired.tai_khoan_tien_id);
    return pairedTk?.ten_tai_khoan || paired.ten_tai_khoan || '';
  }
  return row.ten_tai_khoan_nhan || '';
}

/** Chiều tiền của CK đối với tai_khoan_tien_id trên dòng này. */
export function resolveCkChieu(
  row: DongTienMoi,
  taiKhoanList: TaiKhoanTien[],
  allRows?: DongTienMoi[],
): ChieuTien {
  const paired = allRows ? findCkPair(row, allRows) : undefined;
  if (paired) {
    const fromPair = resolveCkChieuFromPair(row, paired);
    if (fromPair) return fromPair;
  }

  if ((row.chieu_tien === 'thu' || row.chieu_tien === 'chi') && !isSelfNhan(row)) {
    return row.chieu_tien;
  }

  // Nhập tay 1 dòng: tài khoản tiền = nguồn, tài khoản nhận = đích
  if (row.tai_khoan_nhan_id && row.nguon_du_lieu !== 'import_excel' && !isSelfNhan(row)) {
    return 'chi';
  }

  const currentTk = taiKhoanList.find((t) => t.id === row.tai_khoan_tien_id);
  const currentName = currentTk?.ten_tai_khoan || row.ten_tai_khoan || '';

  if (paired && currentName) {
    const pairedTk = taiKhoanList.find((t) => t.id === paired.tai_khoan_tien_id);
    const pairedName = pairedTk?.ten_tai_khoan || paired.ten_tai_khoan || '';
    const pairedSuffix = parseMoTaCounterpart(paired.mo_ta_giao_dich);
    const rowSuffix = parseMoTaCounterpart(row.mo_ta_giao_dich);

    if (pairedSuffix && namesMatch(pairedSuffix, currentName)) {
      return 'thu';
    }
    if (rowSuffix && pairedName && namesMatch(rowSuffix, pairedName)) {
      return 'chi';
    }

    const moTa = (row.mo_ta_giao_dich || '').toLowerCase();
    if (moTa.includes('vao cong ty') || moTa.includes('nop tien')) {
      if (currentTk?.pham_vi === 'cong_ty' && pairedTk?.pham_vi !== 'cong_ty') return 'thu';
      if (currentTk?.pham_vi !== 'cong_ty' && pairedTk?.pham_vi === 'cong_ty') return 'chi';
    }
  }

  return 'chi';
}

export function ckBalanceDelta(dt: DongTienMoi, tkId: number, chieu: ChieuTien): number {
  const amt = Number(dt.so_tien) || 0;
  if (String(dt.tai_khoan_tien_id) === String(tkId)) {
    return chieu === 'thu' ? amt : -amt;
  }
  if (String(dt.tai_khoan_nhan_id) === String(tkId) && chieu === 'chi') {
    return amt;
  }
  return 0;
}
