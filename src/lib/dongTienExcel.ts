import * as XLSX from 'xlsx';
import { formatNgayGiaoDichUtcToVn } from './utils';
import type {
  DongTienMoi, LoaiGiaoDich, HangMucThuChi, TaiKhoanTien,
  KhachHang, NhaCungCap, HopDong, HopDongMua,
} from '../types';

export const DONG_TIEN_EXCEL_HEADERS = [
  'ID',
  'Mã GD ngân hàng',
  'Ngày GD',
  'Loại GD',
  'Tài khoản',
  'Tài khoản nhận',
  'Số tiền',
  'Mã hạng mục',
  'Mô tả GD',
  'ID Khách hàng',
  'Khách hàng',
  'ID NCC',
  'Nhà cung cấp',
  'ID HĐ bán',
  'Số HĐ bán',
  'ID HĐ mua',
  'Số HĐ mua',
  'Số TK đối ứng',
  'Chủ TK đối ứng',
  'Số dư sau GD',
  'Ghi chú',
  'Trạng thái',
  'Mã GD hệ thống',
] as const;

const LOAI_EXPORT: Record<LoaiGiaoDich, string> = {
  thu: 'Thu',
  chi: 'Chi',
  chuyen_khoan_noi_bo: 'Chuyển khoản nội bộ',
  dieu_chinh_so_du: 'Điều chỉnh số dư',
};

const LOAI_IMPORT: Record<string, LoaiGiaoDich> = {
  thu: 'thu',
  chi: 'chi',
  'chuyển khoản nội bộ': 'chuyen_khoan_noi_bo',
  'chuyen khoan noi bo': 'chuyen_khoan_noi_bo',
  chuyen_khoan_noi_bo: 'chuyen_khoan_noi_bo',
  'điều chỉnh số dư': 'dieu_chinh_so_du',
  'dieu chinh so du': 'dieu_chinh_so_du',
  dieu_chinh_so_du: 'dieu_chinh_so_du',
};

const TRANG_THAI_IMPORT: Record<string, string> = {
  'hoàn thành': 'hoan_thanh',
  'hoan thanh': 'hoan_thanh',
  hoan_thanh: 'hoan_thanh',
  'chờ đối soát': 'cho_doi_soat',
  'cho doi soat': 'cho_doi_soat',
  cho_doi_soat: 'cho_doi_soat',
  lỗi: 'loi',
  loi: 'loi',
};

export interface DongTienExcelLookups {
  hangMucList: HangMucThuChi[];
  taiKhoanList: TaiKhoanTien[];
  khachHangList: KhachHang[];
  nhaCungCapList: NhaCungCap[];
  hopDongList: HopDong[];
  hopDongMuaList: HopDongMua[];
}

export interface DongTienBulkItem {
  id?: number;
  ma_giao_dich_ngan_hang?: string | null;
  ngay_giao_dich: string;
  loai_giao_dich: LoaiGiaoDich;
  tai_khoan_tien_id: number;
  tai_khoan_nhan_id?: number | null;
  so_tien: number;
  hang_muc_thu_chi_id?: number | null;
  mo_ta_giao_dich?: string | null;
  khach_hang_id?: number | null;
  nha_cung_cap_id?: number | null;
  hop_dong_id?: number | null;
  hop_dong_mua_id?: number | null;
  so_tai_khoan_doi_ung?: string | null;
  ten_tai_khoan_doi_ung?: string | null;
  so_du_sau_giao_dich?: number | null;
  ghi_chu?: string | null;
  trang_thai?: string;
}

export interface DongTienExcelParseRow {
  excelRow: number;
  action: 'update' | 'create' | 'skip';
  item?: DongTienBulkItem;
  preview?: string;
  error?: string;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Đọc ô Ngày GD từ Excel (text, serial hoặc Date). */
function parseNgayCell(v: unknown): string {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return `${pad2(v.getDate())}/${pad2(v.getMonth() + 1)}/${v.getFullYear()} ${pad2(v.getHours())}:${pad2(v.getMinutes())}:${pad2(v.getSeconds())}`;
  }
  if (typeof v === 'number' && v > 0) {
    const dc = XLSX.SSF.parse_date_code(v);
    if (dc) {
      const base = `${pad2(dc.d)}/${pad2(dc.m)}/${dc.y}`;
      const hasTime = dc.H != null || dc.M != null || (dc.S != null && dc.S > 0);
      return hasTime
        ? `${base} ${pad2(dc.H || 0)}:${pad2(dc.M || 0)}:${pad2(Math.floor(dc.S || 0))}`
        : base;
    }
  }
  return cellStr(v);
}

function parseNum(v: unknown): number {
  if (v == null || v === '') return 0;
  const s = String(v).replace(/\./g, '').replace(/,/g, '.').trim();
  const n = parseFloat(s);
  return Number.isNaN(n) ? 0 : n;
}

function cellStr(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

function findHangMuc(lookups: DongTienExcelLookups, ma: string, _ten: string): HangMucThuChi | undefined {
  const m = ma.trim().toLowerCase();
  if (m) return lookups.hangMucList.find(h => (h.ma_hang_muc || '').toLowerCase() === m);
  return undefined;
}

function findTaiKhoan(lookups: DongTienExcelLookups, label: string): TaiKhoanTien | undefined {
  const t = label.trim().toLowerCase();
  if (!t) return undefined;
  const byId = lookups.taiKhoanList.find(tk => String(tk.id) === t);
  if (byId) return byId;
  return lookups.taiKhoanList.find(tk => tk.ten_tai_khoan.trim().toLowerCase() === t);
}

function parseLoaiGd(raw: string): LoaiGiaoDich | null {
  const key = raw.trim().toLowerCase();
  return LOAI_IMPORT[key] || null;
}

function parseTrangThai(raw: string): string {
  const key = raw.trim().toLowerCase();
  return TRANG_THAI_IMPORT[key] || 'hoan_thanh';
}

function rowToArray(row: DongTienMoi, hm?: HangMucThuChi): (string | number)[] {
  return [
    row.id,
    row.ma_giao_dich_ngan_hang || '',
    formatNgayGiaoDichUtcToVn(row.ngay_giao_dich),
    LOAI_EXPORT[row.loai_giao_dich] || row.loai_giao_dich,
    row.ten_tai_khoan || row.tai_khoan_tien_id,
    row.ten_tai_khoan_nhan || row.tai_khoan_nhan_id || '',
    Number(row.so_tien) || 0,
    hm?.ma_hang_muc || '',
    row.mo_ta_giao_dich || '',
    row.khach_hang_id || '',
    row.ten_cong_ty || '',
    row.nha_cung_cap_id || '',
    row.ten_nha_cung_cap || '',
    row.hop_dong_id || '',
    row.so_hop_dong || '',
    row.hop_dong_mua_id || '',
    row.so_hop_dong_mua || '',
    row.so_tai_khoan_doi_ung || '',
    row.ten_tai_khoan_doi_ung || '',
    row.so_du_sau_giao_dich ?? '',
    row.ghi_chu || '',
    row.trang_thai || 'hoan_thanh',
    row.ma_giao_dich || '',
  ];
}

export function exportDongTienWorkbook(rows: DongTienMoi[], lookups: DongTienExcelLookups): XLSX.WorkBook {
  const hmById = new Map(lookups.hangMucList.map(h => [h.id, h]));
  const data = rows.map(r => rowToArray(r, r.hang_muc_thu_chi_id ? hmById.get(r.hang_muc_thu_chi_id) : undefined));
  const sheetData = [[...DONG_TIEN_EXCEL_HEADERS], ...data];
  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  ws['!cols'] = DONG_TIEN_EXCEL_HEADERS.map((h) => ({ wch: Math.min(40, Math.max(10, h.length + 2)) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Dong tien');
  return wb;
}

export function downloadDongTienExcel(rows: DongTienMoi[], lookups: DongTienExcelLookups) {
  const wb = exportDongTienWorkbook(rows, lookups);
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  XLSX.writeFile(wb, `dong-tien-${stamp}.xlsx`);
}

function mapRawRow(raw: Record<string, unknown>, excelRow: number, lookups: DongTienExcelLookups): DongTienExcelParseRow {
  const get = (key: string) => cellStr(raw[key]);

  const idRaw = get('ID');
  const id = idRaw ? Number(idRaw) : 0;
  const loai = parseLoaiGd(get('Loại GD'));
  const taiKhoan = findTaiKhoan(lookups, get('Tài khoản'));
  const taiKhoanNhan = findTaiKhoan(lookups, get('Tài khoản nhận'));
  const soTien = parseNum(raw['Số tiền']);
  const ngay = parseNgayCell(raw['Ngày GD']);
  const hm = findHangMuc(lookups, get('Mã hạng mục'), '');

  if (!idRaw && !get('Mã GD ngân hàng') && !ngay && !get('Mô tả GD')) {
    return { excelRow, action: 'skip' };
  }

  if (!loai) {
    return { excelRow, action: 'skip', error: 'Loại GD không hợp lệ' };
  }
  if (!taiKhoan) {
    return { excelRow, action: 'skip', error: 'Không tìm thấy tài khoản' };
  }
  if (!ngay) {
    return { excelRow, action: 'skip', error: 'Thiếu ngày GD' };
  }
  if (soTien <= 0) {
    return { excelRow, action: 'skip', error: 'Số tiền phải > 0' };
  }
  if (loai === 'chuyen_khoan_noi_bo' && !taiKhoanNhan) {
    return { excelRow, action: 'skip', error: 'Chuyển khoản nội bộ cần tài khoản nhận' };
  }

  const khId = get('ID Khách hàng') ? Number(get('ID Khách hàng')) : null;
  const nccId = get('ID NCC') ? Number(get('ID NCC')) : null;
  const hdId = get('ID HĐ bán') ? Number(get('ID HĐ bán')) : null;
  const hdmId = get('ID HĐ mua') ? Number(get('ID HĐ mua')) : null;

  const item: DongTienBulkItem = {
    ...(id > 0 ? { id } : {}),
    ma_giao_dich_ngan_hang: get('Mã GD ngân hàng') || null,
    ngay_giao_dich: ngay,
    loai_giao_dich: loai,
    tai_khoan_tien_id: taiKhoan.id,
    tai_khoan_nhan_id: taiKhoanNhan?.id ?? null,
    so_tien: soTien,
    hang_muc_thu_chi_id: hm?.id ?? null,
    mo_ta_giao_dich: get('Mô tả GD') || null,
    khach_hang_id: khId && !Number.isNaN(khId) ? khId : null,
    nha_cung_cap_id: nccId && !Number.isNaN(nccId) ? nccId : null,
    hop_dong_id: hdId && !Number.isNaN(hdId) ? hdId : null,
    hop_dong_mua_id: hdmId && !Number.isNaN(hdmId) ? hdmId : null,
    so_tai_khoan_doi_ung: get('Số TK đối ứng') || null,
    ten_tai_khoan_doi_ung: get('Chủ TK đối ứng') || null,
    so_du_sau_giao_dich: parseNum(raw['Số dư sau GD']) || null,
    ghi_chu: get('Ghi chú') || null,
    trang_thai: parseTrangThai(get('Trạng thái')),
  };

  const preview = `${id > 0 ? `Cập nhật #${id}` : 'Tạo mới'} — ${ngay} — ${LOAI_EXPORT[loai]} — ${formatNum(soTien)}`;
  return {
    excelRow,
    action: id > 0 ? 'update' : 'create',
    item,
    preview,
  };
}

function formatNum(n: number): string {
  return new Intl.NumberFormat('vi-VN').format(n);
}

export async function parseDongTienExcelFile(
  file: File,
  lookups: DongTienExcelLookups,
): Promise<DongTienExcelParseRow[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  return json.map((row, idx) => mapRawRow(row, idx + 2, lookups));
}
