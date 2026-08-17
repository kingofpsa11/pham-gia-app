/**
 * Tính số dư tài khoản tiền từ dong_tien_moi (port logic frontend dongTienCk).
 */

function normalizeName(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function namesMatch(a, b) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

function parseMoTaCounterpart(moTa) {
  if (!moTa) return '';
  const parts = String(moTa).split('--');
  if (parts.length < 2) return '';
  return parts[parts.length - 1].trim();
}

function isSelfNhan(row) {
  return !!row.tai_khoan_nhan_id
    && String(row.tai_khoan_nhan_id) === String(row.tai_khoan_tien_id);
}

function dateKey(ngay) {
  return String(ngay || '').slice(0, 10);
}

function findCkPair(row, allRows) {
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

function resolveCkChieuFromPair(row, paired) {
  if (String(paired.tai_khoan_nhan_id) === String(row.tai_khoan_tien_id) && !isSelfNhan(paired)) {
    return 'thu';
  }
  if (String(row.tai_khoan_nhan_id) === String(paired.tai_khoan_tien_id) && !isSelfNhan(row)) {
    return 'chi';
  }
  return null;
}

function resolveCkChieu(row, accounts, allRows) {
  const paired = findCkPair(row, allRows);
  if (paired) {
    const fromPair = resolveCkChieuFromPair(row, paired);
    if (fromPair) return fromPair;
  }

  if ((row.chieu_tien === 'thu' || row.chieu_tien === 'chi') && !isSelfNhan(row)) {
    return row.chieu_tien;
  }

  if (row.tai_khoan_nhan_id && row.nguon_du_lieu !== 'import_excel' && !isSelfNhan(row)) {
    return 'chi';
  }

  const currentTk = accounts.find((t) => String(t.id) === String(row.tai_khoan_tien_id));
  const currentName = currentTk?.ten_tai_khoan || row.ten_tai_khoan || '';

  if (paired && currentName) {
    const pairedTk = accounts.find((t) => String(t.id) === String(paired.tai_khoan_tien_id));
    const pairedName = pairedTk?.ten_tai_khoan || paired.ten_tai_khoan || '';
    const pairedSuffix = parseMoTaCounterpart(paired.mo_ta_giao_dich);
    const rowSuffix = parseMoTaCounterpart(row.mo_ta_giao_dich);

    if (pairedSuffix && namesMatch(pairedSuffix, currentName)) return 'thu';
    if (rowSuffix && pairedName && namesMatch(rowSuffix, pairedName)) return 'chi';

    const moTa = String(row.mo_ta_giao_dich || '').toLowerCase();
    if (moTa.includes('vao cong ty') || moTa.includes('nop tien')) {
      if (currentTk?.pham_vi === 'cong_ty' && pairedTk?.pham_vi !== 'cong_ty') return 'thu';
      if (currentTk?.pham_vi !== 'cong_ty' && pairedTk?.pham_vi === 'cong_ty') return 'chi';
    }
  }

  return 'chi';
}

function ckBalanceDelta(dt, tkId, chieu) {
  const amt = Number(dt.so_tien) || 0;
  if (String(dt.tai_khoan_tien_id) === String(tkId)) {
    return chieu === 'thu' ? amt : -amt;
  }
  if (String(dt.tai_khoan_nhan_id) === String(tkId) && chieu === 'chi') {
    return amt;
  }
  return 0;
}

/**
 * @param {Array} accounts - rows from tai_khoan_tien
 * @param {Array} transactions - rows from dong_tien_moi (minimal columns OK)
 * @returns {Array} accounts with so_du_hien_tai
 */
export function computeTaiKhoanBalances(accounts, transactions) {
  const rows = transactions || [];
  return (accounts || []).map((tk) => {
    const so_du_hien_tai = rows.reduce((sum, dt) => {
      const amt = Number(dt.so_tien) || 0;
      if (dt.loai_giao_dich === 'thu' && String(dt.tai_khoan_tien_id) === String(tk.id)) {
        return sum + amt;
      }
      if (dt.loai_giao_dich === 'chi' && String(dt.tai_khoan_tien_id) === String(tk.id)) {
        return sum - amt;
      }
      if (dt.loai_giao_dich === 'chuyen_khoan_noi_bo') {
        const chieu = resolveCkChieu(dt, accounts, rows);
        return sum + ckBalanceDelta(dt, tk.id, chieu);
      }
      if (dt.loai_giao_dich === 'dieu_chinh_so_du' && String(dt.tai_khoan_tien_id) === String(tk.id)) {
        return sum + amt;
      }
      return sum;
    }, Number(tk.so_du_dau_ky) || 0);
    return { ...tk, so_du_hien_tai };
  });
}
