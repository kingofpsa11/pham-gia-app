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

// Parse date from MySQL ISO string or date-only string without timezone shift
function parseDateLocal(date: string): Date | null {
  if (!date) return null;
  // Date-only: "2026-05-12" → treat as local
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  // ISO with time: use UTC then convert to local display
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  return d;
}

export function formatDate(date: string | undefined | null): string {
  if (!date) return '';
  const d = parseDateLocal(date);
  if (!d) return '';
  // For ISO timestamps (UTC), use toLocaleDateString to get VN time
  if (/T/.test(date)) {
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

export function formatDateTime(date: string | undefined | null): string {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function toISOString(date: string): string {
  if (!date) return '';
  const [day, month, year] = date.split('/');
  if (!day || !month || !year) return date;
  return `${year}-${month}-${day}`;
}

export function toInputDateValue(date: string | undefined | null): string {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().split('T')[0];
}

export function getTodayInputValue(): string {
  return new Date().toISOString().split('T')[0];
}

export function calcGiaBanGoiY(donGiaVon: number, laiSuatPhanTram: number): number {
  return donGiaVon * (1 + laiSuatPhanTram / 100);
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

export function generateSoBaoGia(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const random = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  return `BG${year}${month}${random}`;
}

export function generateSoHopDong(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const random = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  return `HD${year}${month}${random}`;
}

export function generateSoPhieu(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const random = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  return `PGH${year}${month}${random}`;
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
