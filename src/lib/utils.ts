export function formatVND(amount: number | string | undefined | null): string {
  if (amount == null || amount === '') return '0 ₫';
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '0 ₫';
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

export function formatNumber(value: number | string | undefined | null, decimals = 0): string {
  if (value == null || value === '') return '0';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '0';
  return new Intl.NumberFormat('vi-VN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
}

export function formatPercent(value: number | string | undefined | null): string {
  if (value == null || value === '') return '0%';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '0%';
  return new Intl.NumberFormat('vi-VN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(num) + '%';
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function wallClockToDbString(y: number, mo: number, day: number, h = 0, mi = 0, se = 0): string {
  return `${y}-${pad2(mo)}-${pad2(day)} ${pad2(h)}:${pad2(mi)}:${pad2(se)}`;
}

/** DB → hiển thị dd/mm/yyyy [HH:mm:ss], giữ nguyên giờ đã lưu (không đổi múi giờ). */
export function formatNgayGiaoDichUtcToVn(raw: string | null | undefined): string {
  const s = String(raw || '').trim();
  if (!s) return '';
  const isoT = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  if (isoT) {
    return `${isoT[3]}/${isoT[2]}/${isoT[1]} ${isoT[4]}:${isoT[5]}:${isoT[6]}`;
  }
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?/);
  if (!m) return s;
  const base = `${m[3]}/${m[2]}/${m[1]}`;
  return m[4] !== undefined ? `${base} ${m[4]}:${m[5]}:${m[6]}` : base;
}

/** Giá trị người nhập → chuỗi DB, giữ nguyên giờ. */
export function parseNgayGiaoDichVnToUtc(raw: string | null | undefined): string {
  const s = String(raw || '').trim();
  if (!s) return '';

  const tryParts = (d: string, m: string, y: string, h?: string, mi?: string, se?: string) => {
    const mo = parseInt(m, 10);
    const day = parseInt(d, 10);
    const year = parseInt(y, 10);
    if (mo < 1 || mo > 12 || day < 1 || day > 31) return '';
    return wallClockToDbString(
      year, mo, day,
      h != null ? parseInt(h, 10) : 0,
      mi != null ? parseInt(mi, 10) : 0,
      se != null ? parseInt(se, 10) : 0,
    );
  };

  const dmySlash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?/);
  if (dmySlash) {
    const r = tryParts(dmySlash[1], dmySlash[2], dmySlash[3], dmySlash[4], dmySlash[5], dmySlash[6]);
    if (r) return r;
  }

  const dmyDash = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?/);
  if (dmyDash) {
    const r = tryParts(dmyDash[1], dmyDash[2], dmyDash[3], dmyDash[4], dmyDash[5], dmyDash[6]);
    if (r) return r;
  }

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?/);
  if (iso) {
    const r = tryParts(iso[3], iso[2], iso[1], iso[4], iso[5], iso[6]);
    if (r) return r;
  }

  return '';
}

function parseDbDatetimeToMs(raw: string): number | null {
  const m = String(raw).trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?/);
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
}

function parseDateLocal(date: string): Date | null {
  if (!date) return null;
  const ms = parseDbDatetimeToMs(date);
  if (ms != null) return new Date(ms);
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  return d;
}

/** Giá trị sort theo ngày (lớn = mới hơn). */
export function ngaySortKey(ngay: string | null | undefined): number {
  if (!ngay) return 0;
  const ms = parseDbDatetimeToMs(ngay);
  if (ms != null) return ms;
  const d = parseDateLocal(ngay) ?? new Date(ngay);
  const t = d.getTime();
  return Number.isNaN(t) ? 0 : t;
}

/** Sắp xếp bản ghi theo ngày mới nhất (rồi id giảm dần). */
export function sortTheoNgayMoiNhat<T extends { id?: number }>(
  rows: T[],
  getNgay: (row: T) => string | null | undefined
): T[] {
  return [...rows].sort((a, b) => {
    const byNgay = ngaySortKey(getNgay(b)) - ngaySortKey(getNgay(a));
    if (byNgay !== 0) return byNgay;
    return (Number(b.id) || 0) - (Number(a.id) || 0);
  });
}

export function formatDate(date: string | undefined | null): string {
  if (!date) return '';
  const vn = formatNgayGiaoDichUtcToVn(date);
  if (vn) return vn.split(' ')[0];
  const d = parseDateLocal(date);
  if (!d) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

export function formatDateTime(date: string | undefined | null): string {
  if (!date) return '';
  const vn = formatNgayGiaoDichUtcToVn(date);
  if (!vn) return '';
  const [datePart, timePart] = vn.split(' ');
  if (!timePart || timePart === '00:00:00') return datePart;
  return `${datePart} ${timePart.slice(0, 5)}`;
}

export function toISOString(date: string): string {
  if (!date) return '';
  const [day, month, year] = date.split('/');
  if (!day || !month || !year) return date;
  return `${year}-${month}-${day}`;
}

/** yyyy-MM-dd hợp lệ cho input type="date". */
export function isValidInputDateValue(value: string | undefined | null): boolean {
  if (!value) return false;
  const m = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const mo = parseInt(m[2], 10);
  const day = parseInt(m[3], 10);
  return mo >= 1 && mo <= 12 && day >= 1 && day <= 31;
}

export function toInputDateValue(date: string | undefined | null): string {
  if (!date) return '';
  const s = String(date).trim();
  const isoFromDb = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoFromDb) {
    const candidate = `${isoFromDb[1]}-${isoFromDb[2]}-${isoFromDb[3]}`;
    if (isValidInputDateValue(candidate)) return candidate;
  }
  const isoPart = s.includes('T') ? s.split('T')[0] : s.slice(0, 10);
  if (isValidInputDateValue(isoPart)) return isoPart;
  const vnRaw = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (vnRaw) {
    const [, dd, mm, yyyy] = vnRaw;
    const candidate = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    if (isValidInputDateValue(candidate)) return candidate;
  }
  return '';
}

export function getTodayInputValue(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Chuẩn hóa giá trị ô date (tránh 2026-00-30). */
export function sanitizeInputDateValue(value: string): string {
  return isValidInputDateValue(value) ? value : '';
}

export function calcGiaBanGoiY(donGiaVon: number, laiSuatPhanTram: number): number {
  return donGiaVon * (1 + laiSuatPhanTram / 100);
}

/**
 * Giá bán dùng tính lãi % / lợi nhuận gộp.
 * Chế độ phân bổ (1): dùng giá chưa VC (trừ phí VC đã gộp vào đơn giá bán).
 */
export function giaBanThuanChoLoiNhuan(
  row: {
    gia_ban_thuc_te?: number | string;
    gia_ban_chua_van_chuyen?: number | string;
    chi_phi_van_chuyen_phan_bo?: number | string;
  },
  cheDoVanChuyen: number
): number {
  if (Number(cheDoVanChuyen) === 1) {
    const chua =
      typeof row.gia_ban_chua_van_chuyen === 'string'
        ? parseFloat(row.gia_ban_chua_van_chuyen) || 0
        : Number(row.gia_ban_chua_van_chuyen) || 0;
    if (chua > 0) return chua;
    const ban =
      typeof row.gia_ban_thuc_te === 'string'
        ? parseFloat(row.gia_ban_thuc_te) || 0
        : Number(row.gia_ban_thuc_te) || 0;
    const vc =
      typeof row.chi_phi_van_chuyen_phan_bo === 'string'
        ? parseFloat(row.chi_phi_van_chuyen_phan_bo) || 0
        : Number(row.chi_phi_van_chuyen_phan_bo) || 0;
    return Math.max(0, ban - vc);
  }
  const ban =
    typeof row.gia_ban_thuc_te === 'string'
      ? parseFloat(row.gia_ban_thuc_te) || 0
      : Number(row.gia_ban_thuc_te) || 0;
  const chua =
    typeof row.gia_ban_chua_van_chuyen === 'string'
      ? parseFloat(row.gia_ban_chua_van_chuyen) || 0
      : Number(row.gia_ban_chua_van_chuyen) || 0;
  return ban > 0 ? ban : chua;
}

/** Lãi % theo giá bán thuần (đã trừ VC phân bổ nếu chế độ 1) và giá vốn. */
export function calcLaiPhanTramTuGiaBan(giaBan: number, donGiaVon: number): number {
  const gv = Number(donGiaVon) || 0;
  if (gv <= 0) return 0;
  return Math.round(((Number(giaBan) - gv) / gv) * 100 * 100) / 100;
}

export function calcThanhTienBan(soLuong: number, giaBanThucTe: number): number {
  return soLuong * giaBanThucTe;
}

export function calcVAT(thanhTien: number, thueSuat: number): number {
  return thanhTien * thueSuat / 100;
}

export function calcTongTruocVAT(chiTiet: { so_luong: number | string; gia_ban_thuc_te: number | string }[]): number {
  return chiTiet.reduce((sum, item) => {
    const sl = typeof item.so_luong === 'string' ? parseFloat(item.so_luong) || 0 : (item.so_luong ?? 0);
    const gia = typeof item.gia_ban_thuc_te === 'string' ? parseFloat(item.gia_ban_thuc_te) || 0 : (item.gia_ban_thuc_te ?? 0);
    return sum + sl * gia;
  }, 0);
}

export function calcTongVAT(chiTiet: { so_luong: number | string; gia_ban_thuc_te: number | string; thue_suat: number | string }[]): number {
  return chiTiet.reduce((sum, item) => {
    const sl = typeof item.so_luong === 'string' ? parseFloat(item.so_luong) || 0 : (item.so_luong ?? 0);
    const gia = typeof item.gia_ban_thuc_te === 'string' ? parseFloat(item.gia_ban_thuc_te) || 0 : (item.gia_ban_thuc_te ?? 0);
    const thue = typeof item.thue_suat === 'string' ? parseFloat(item.thue_suat) || 0 : (item.thue_suat ?? 0);
    return sum + (sl * gia * thue / 100);
  }, 0);
}

export function calcTongThanhToan(tongTruocVAT: number, tongVAT: number, phiVanChuyen: number | string | null | undefined): number {
  const phi = typeof phiVanChuyen === 'string' ? parseFloat(phiVanChuyen) || 0 : (phiVanChuyen ?? 0);
  return tongTruocVAT + tongVAT + phi;
}

/** Giá bán chưa vận chuyển từ dòng báo giá (tránh lấy nhầm giá đã cộng VC). */
export function giaBanChuaVanChuyenFromBg(ct: {
  gia_ban_chua_van_chuyen?: number | string;
  gia_ban_co_ban?: number | string;
  gia_ban_thuc_te?: number | string;
  chi_phi_van_chuyen_phan_bo?: number | string;
}): number {
  const giaChua = Number(ct.gia_ban_chua_van_chuyen) || Number(ct.gia_ban_co_ban) || 0;
  if (giaChua > 0) return giaChua;
  const giaThucTe = Number(ct.gia_ban_thuc_te) || 0;
  const vc = Number(ct.chi_phi_van_chuyen_phan_bo) || 0;
  if (giaThucTe > 0 && vc > 0) return Math.max(0, giaThucTe - vc);
  return giaThucTe;
}

/** Phân bổ phí vận chuyển vào giá bán thực tế (chế độ Phân bổ = 1). */
export function applyVanChuyenToChiTiet<
  T extends {
    so_luong: number | string;
    gia_ban_chua_van_chuyen?: number | string;
    gia_ban_thuc_te?: number | string;
    chi_phi_van_chuyen_phan_bo?: number | string;
  },
>(items: T[], cheDoVanChuyen: number, phiVanChuyen: number | string): Array<
  T & { chi_phi_van_chuyen_phan_bo: number; gia_ban_thuc_te: number }
> {
  const phi = typeof phiVanChuyen === 'string' ? parseFloat(phiVanChuyen) || 0 : phiVanChuyen || 0;
  const cheDo = Number(cheDoVanChuyen ?? 1);

  const tongChuaVC = items.reduce((s, r) => {
    const sl = typeof r.so_luong === 'string' ? parseFloat(r.so_luong) || 0 : (r.so_luong ?? 0);
    const giaChua =
      (typeof r.gia_ban_chua_van_chuyen === 'string'
        ? parseFloat(r.gia_ban_chua_van_chuyen)
        : r.gia_ban_chua_van_chuyen) ||
      (typeof r.gia_ban_thuc_te === 'string' ? parseFloat(r.gia_ban_thuc_te) : r.gia_ban_thuc_te) ||
      0;
    return s + sl * giaChua;
  }, 0);

  return items.map((r) => {
    const sl = typeof r.so_luong === 'string' ? parseFloat(r.so_luong) || 0 : (r.so_luong ?? 0);
    const giaChua =
      (typeof r.gia_ban_chua_van_chuyen === 'string'
        ? parseFloat(r.gia_ban_chua_van_chuyen)
        : r.gia_ban_chua_van_chuyen) ||
      (typeof r.gia_ban_thuc_te === 'string' ? parseFloat(r.gia_ban_thuc_te) : r.gia_ban_thuc_te) ||
      0;

    if (cheDo === 1 && phi > 0 && tongChuaVC > 0 && sl > 0) {
      const tyLe = (sl * giaChua) / tongChuaVC;
      const vcThanhTien = phi * tyLe;
      const vcDonGia = Math.round(vcThanhTien / sl / 1000) * 1000;
      return {
        ...r,
        chi_phi_van_chuyen_phan_bo: vcDonGia,
        gia_ban_thuc_te: giaChua + vcDonGia,
      };
    }

    const vcPhanBo =
      typeof r.chi_phi_van_chuyen_phan_bo === 'string'
        ? parseFloat(r.chi_phi_van_chuyen_phan_bo) || 0
        : (r.chi_phi_van_chuyen_phan_bo ?? 0);

    return {
      ...r,
      chi_phi_van_chuyen_phan_bo: vcPhanBo,
      gia_ban_thuc_te: giaChua,
    };
  });
}

/** Dòng chi tiết chưa có tên sản phẩm (dòng mặc định trống). */
export function isChiTietRowTrong(tenSanPham: string | null | undefined): boolean {
  return !(tenSanPham || '').trim();
}

/**
 * Parse số tiền từ ô Excel sao kê VN (dấu chấm = phân cách nghìn: 3.000, 26.720.000).
 */
export function parseExcelNum(s: string): number {
  if (!s || !s.trim()) return 0;
  const stripped = s.trim().replace(/[^\d\-.,]/g, '');
  if (!stripped) return 0;

  const negative = stripped.startsWith('-');
  const digits = negative ? stripped.slice(1) : stripped;

  // 26.720.000, 3.000, 678.000 — nhóm nghìn bằng dấu chấm
  if (/^\d{1,3}(\.\d{3})+$/.test(digits)) {
    const n = parseInt(digits.replace(/\./g, ''), 10);
    return negative ? -n : isNaN(n) ? 0 : n;
  }

  if (!/[.,]/.test(digits)) {
    const n = parseInt(digits, 10);
    return negative ? -n : isNaN(n) ? 0 : n;
  }

  const lastComma = digits.lastIndexOf(',');
  const lastDot = digits.lastIndexOf('.');
  let normalized: string;

  if (lastDot === -1 && lastComma === -1) {
    normalized = digits;
  } else if (lastDot === -1) {
    const afterComma = digits.slice(lastComma + 1);
    normalized =
      afterComma.length <= 2
        ? digits.replace(/,/g, '.').replace(/(\.)(?=.*\.)/g, '')
        : digits.replace(/,/g, '');
  } else if (lastComma === -1) {
    const afterDot = digits.slice(lastDot + 1);
    const dotCount = (digits.match(/\./g) || []).length;
    if (dotCount > 1 || afterDot.length === 3) {
      normalized = digits.replace(/\./g, '');
    } else {
      normalized = digits;
    }
  } else if (lastComma > lastDot) {
    normalized = digits.replace(/\./g, '').replace(',', '.');
  } else {
    normalized = digits.replace(/,/g, '');
  }

  const n = parseFloat(normalized);
  const val = isNaN(n) ? 0 : n;
  return negative ? -val : val;
}

/** Parse clipboard TSV từ Excel (hỗ trợ ô có dấu ngoặc kép). */
export function parseTSV(text: string): string[][] {
  const records: string[][] = [];
  let fields: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === '\t') {
      fields.push(field);
      field = '';
      i++;
      continue;
    }
    if (ch === '\r' && text[i + 1] === '\n') {
      fields.push(field);
      records.push(fields);
      fields = [];
      field = '';
      i += 2;
      continue;
    }
    if (ch === '\n') {
      fields.push(field);
      records.push(fields);
      fields = [];
      field = '';
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  if (field || fields.length) {
    fields.push(field);
    records.push(fields);
  }
  return records;
}

/** Lợi nhuận gộp theo dòng = Σ SL × (giá bán − giá vốn) — không dùng giá HĐ. */
export function calcLoiNhuanGopTuBanVaVon(
  chiTiet: {
    so_luong: number | string;
    gia_ban_thuc_te: number | string;
    don_gia_von: number | string;
  }[]
): number {
  return chiTiet.reduce((s, r) => {
    const sl = typeof r.so_luong === 'string' ? parseFloat(r.so_luong) || 0 : (r.so_luong ?? 0);
    const ban =
      typeof r.gia_ban_thuc_te === 'string'
        ? parseFloat(r.gia_ban_thuc_te) || 0
        : (r.gia_ban_thuc_te ?? 0);
    const von =
      typeof r.don_gia_von === 'string' ? parseFloat(r.don_gia_von) || 0 : (r.don_gia_von ?? 0);
    return s + sl * (ban - von);
  }, 0);
}

/** Lợi nhuận gộp hiển thị; chế độ Hỗ trợ (2): trừ thêm phí VC (tổng giá bán − tổng giá vốn gồm VC). */
export function calcLoiNhuanGop(
  chiTiet: Parameters<typeof calcLoiNhuanGopTuBanVaVon>[0],
  cheDoVanChuyen: number,
  phiVanChuyen: number | string
): number {
  const line = calcLoiNhuanGopTuBanVaVon(chiTiet);
  if (Number(cheDoVanChuyen) === 2) {
    const phi =
      typeof phiVanChuyen === 'string' ? parseFloat(phiVanChuyen) || 0 : Number(phiVanChuyen) || 0;
    return line - phi;
  }
  return line;
}

/** Chế độ Hỗ trợ (2): phí VC cộng vào tổng giá vốn (hiển thị). */
export function calcTongGiaVonCoVanChuyen(
  tongGiaVonThuan: number,
  phiVanChuyen: number,
  cheDoVanChuyen: number
): number {
  const phi = Number(phiVanChuyen) || 0;
  return Number(cheDoVanChuyen) === 2 ? tongGiaVonThuan + phi : tongGiaVonThuan;
}

export function todayVN(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export function isoToVN(iso: string | null | undefined): string {
  if (!iso) return todayVN();
  const s = iso.includes('T') ? iso.split('T')[0] : iso;
  const [y, m, dd] = s.split('-');
  if (!y || !m || !dd) return todayVN();
  return `${dd}/${m}/${y}`;
}

export function vnToISO(vn: string): string {
  const parts = vn.split('/');
  if (parts.length === 3) {
    const [dd, mm, yyyy] = parts;
    if (dd && mm && yyyy && yyyy.length === 4) return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(vn)) return vn;
  return '';
}

export function isValidVNDate(s: string): boolean {
  return /^\d{2}\/\d{2}\/\d{4}$/.test(s);
}

/** Năm (4 chữ số) từ ngày dd/mm/yyyy hoặc chuỗi ISO. */
export function namTuNgay(ngayVN: string, ngayISO?: string): number {
  if (ngayISO && /^\d{4}-\d{2}-\d{2}/.test(ngayISO)) {
    return parseInt(ngayISO.slice(0, 4), 10);
  }
  const m = (ngayVN || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return parseInt(m[3], 10);
  return new Date().getFullYear();
}

export function cheDoVanChuyenLabel(value: number): string {
  switch (value) {
    case 0: return 'Riêng';
    case 1: return 'Phân bổ';
    case 2: return 'Hỗ trợ';
    default: return '';
  }
}

export function trangThaiHopDongLabel(value: string): string {
  switch (value) {
    case 'Hieu luc': return 'Hiệu lực';
    case 'Thanh ly': return 'Thanh lý';
    case 'Huy': return 'Hủy';
    default: return value;
  }
}

export function trangThaiHopDongColor(value: string): string {
  switch (value) {
    case 'Hieu luc': return 'badge-success';
    case 'Thanh ly': return 'badge-warning';
    case 'Huy': return 'badge-error';
    default: return 'badge-info';
  }
}

export function generateSoBaoGia(nam = new Date().getFullYear()): string {
  return `01/BG/${nam}`;
}

export function generateSoHopDong(nam = new Date().getFullYear()): string {
  return `01/HĐMB/${nam}/PG-`;
}

export function buildTenFolderHopDong(soHopDong: string, tenKhachHang: string, tenDuAn: string): string {
  const sttMatch = String(soHopDong || '').trim().match(/^(\d+)\//);
  const stt = sttMatch ? String(parseInt(sttMatch[1], 10)).padStart(2, '0') : '01';
  let kh = String(tenKhachHang || '')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  kh = kh.replace(/^(công ty tnhh mtv|công ty tnhh|công ty cổ phần|công ty cp|công ty|cty tnhh|cty cp|cty)\s+/i, '');
  const khWord = kh.split(' ').filter(Boolean)[0] || '';
  const duAn = String(tenDuAn || '')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40);
  if (khWord && duAn) return `${stt} ${khWord} - ${duAn}`;
  if (khWord) return `${stt} ${khWord}`;
  if (duAn) return `${stt} ${duAn}`;
  return stt;
}

export function driveFolderUrl(id?: string | null, googleEmail?: string | null): string {
  if (!id) return '';
  const folder = `https://drive.google.com/drive/folders/${encodeURIComponent(id)}`;
  const email = String(googleEmail || '').trim();
  const continueUrl = encodeURIComponent(folder);
  if (email) {
    return `https://accounts.google.com/AccountChooser?Email=${encodeURIComponent(email)}&continue=${continueUrl}`;
  }
  return `https://drive.google.com/open?id=${encodeURIComponent(id)}`;
}

export function generateSoPhieu(nam = new Date().getFullYear()): string {
  return `01/GH/${nam}`;
}

export function generateSoHoaDonNhap(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const random = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  return `HDN${year}${month}${random}`;
}

export function generateSoHopDongMua(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const random = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  return `HDM${year}${month}${random}`;
}

export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}
