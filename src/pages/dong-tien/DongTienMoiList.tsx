import { useState, useEffect, useCallback, useRef } from 'react';
import {
  dongTienMoiApi, taiKhoanTienApi, hangMucThuChiApi,
  khachHangApi, nhaCungCapApi, hopDongApi, hopDongMuaApi,
} from '../../lib/api';
import { useToastStore } from '../../store/toast';
import { useAuthStore } from '../../store/auth';
import {
  formatVND,
  formatDateTime,
  toInputDateValue,
  getTodayInputValue,
  sanitizeInputDateValue,
  parseExcelNum,
} from '../../lib/utils';
import Modal from '../../components/ui/Modal';
import NumInput from '../../components/ui/NumInput';
import Pagination from '../../components/ui/Pagination';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import EmptyState from '../../components/ui/EmptyState';
import {
  findCkCounterpartForImport,
  parseMoTaCounterpart,
  resolveCkChieu,
  resolveCkCounterpartName,
} from '../../lib/dongTienCk';
import {
  Plus, Pencil, Trash2, Filter, Banknote, Search,
  ArrowUpRight, ArrowDownRight, ArrowLeftRight, Settings2,
  ChevronDown, X, RefreshCw, FileSpreadsheet, Save,
} from 'lucide-react';
import type {
  TaiKhoanTien, HangMucThuChi, DongTienMoi,
  KhachHang, NhaCungCap, HopDong, HopDongMua, LoaiGiaoDich, PhamViTaiKhoan,
} from '../../types';

const PAGE_SIZE = 20;

// ─── Label helpers ───────────────────────────────────────────────────────────

const LOAI_GD_LABEL: Record<LoaiGiaoDich, string> = {
  thu: 'Thu',
  chi: 'Chi',
  chuyen_khoan_noi_bo: 'Chuyển khoản nội bộ',
  dieu_chinh_so_du: 'Điều chỉnh số dư',
};

const LOAI_GD_COLOR: Record<LoaiGiaoDich, string> = {
  thu: 'bg-green-100 text-green-700',
  chi: 'bg-red-100 text-red-700',
  chuyen_khoan_noi_bo: 'bg-blue-100 text-blue-700',
  dieu_chinh_so_du: 'bg-amber-100 text-amber-700',
};

const PHAM_VI_LABEL: Record<string, string> = {
  cong_ty: 'Công ty',
  ca_nhan: 'Cá nhân',
  oto: 'Ô tô',
  vay_no: 'Vay nợ',
  khac: 'Khác',
};

const PHAM_VI_COLOR: Record<string, string> = {
  cong_ty: 'bg-sky-100 text-sky-700',
  ca_nhan: 'bg-violet-100 text-violet-700',
  oto: 'bg-orange-100 text-orange-700',
  vay_no: 'bg-rose-100 text-rose-700',
  khac: 'bg-gray-100 text-gray-600',
};

// ─── Build grouped hang muc options for <select> ─────────────────────────────
interface HangMucSelectOption {
  id: number;
  label: string;
  indent: number;
  isParent: boolean;
}

interface BuildHangMucOpts {
  loaiGd?: LoaiGiaoDich;
  taiKhoanPhamVi?: PhamViTaiKhoan;
}

function allowedHangMucPhamVi(tkPhamVi?: PhamViTaiKhoan): Set<string> | null {
  if (!tkPhamVi) return null;
  if (tkPhamVi === 'cong_ty') {
    return new Set(['cong_ty', 'khac', 'vay_no', 'dung_chung']);
  }
  /** TK cá nhân / dùng chung: vẫn hiện Chi phí công ty (chi từ TK cá nhân cho công ty). */
  return new Set(['ca_nhan', 'oto', 'vay_no', 'khac', 'dung_chung', 'cong_ty']);
}

/** Một số hạng mục CK trong DB có pham_vi rỗng — coi là dùng chung. */
function hangMucPhamViForFilter(hm: HangMucThuChi): string {
  const pv = String(hm.pham_vi ?? '').trim();
  return pv || 'dung_chung';
}

/** Khi đã hiện nhóm CK thì bổ sung các con CK còn thiếu nhưng vẫn phù hợp phạm vi TK. */
function ensureCkSubtreeComplete(
  filtered: HangMucThuChi[],
  candidates: HangMucThuChi[],
  fullList: HangMucThuChi[],
  tkPhamVi?: PhamViTaiKhoan,
): HangMucThuChi[] {
  const allowed = allowedHangMucPhamVi(tkPhamVi);
  if (!allowed) return filtered;
  const ckRoot = fullList.find((h) => h.ma_hang_muc === 'CK');
  if (!ckRoot) return filtered;
  const filteredIds = new Set(filtered.map((h) => h.id));
  const ckItems = candidates.filter((h) => h.id === ckRoot.id || h.parent_id === ckRoot.id);
  if (!ckItems.some((h) => filteredIds.has(h.id))) return filtered;
  const extras = ckItems.filter(
    (h) => !filteredIds.has(h.id) && allowed.has(hangMucPhamViForFilter(h)),
  );
  return extras.length ? [...filtered, ...extras] : filtered;
}

function filterHangMucByLoaiGd(list: HangMucThuChi[], loaiGd: LoaiGiaoDich): HangMucThuChi[] {
  return list.filter((hm) => {
    if (hm.trang_thai === 'an') return false;
    if (loaiGd === 'chuyen_khoan_noi_bo') return hm.loai_giao_dich === 'chuyen_khoan_noi_bo' || hm.loai_giao_dich === 'tat_ca';
    if (loaiGd === 'dieu_chinh_so_du') return hm.loai_giao_dich === 'dieu_chinh_so_du' || hm.loai_giao_dich === 'tat_ca';
    if (loaiGd === 'thu' || loaiGd === 'chi') {
      return hm.loai_giao_dich === loaiGd
        || hm.loai_giao_dich === 'tat_ca'
        || hm.loai_giao_dich === 'chuyen_khoan_noi_bo';
    }
    return hm.loai_giao_dich === loaiGd || hm.loai_giao_dich === 'tat_ca';
  });
}

function filterHangMucByTaiKhoan(
  candidates: HangMucThuChi[],
  fullList: HangMucThuChi[],
  tkPhamVi?: PhamViTaiKhoan,
): HangMucThuChi[] {
  const allowed = allowedHangMucPhamVi(tkPhamVi);
  if (!allowed) return candidates;

  const candidateIds = new Set(candidates.map(h => h.id));
  const allowedIds = new Set<number>();
  for (const hm of candidates) {
    if (allowed.has(hangMucPhamViForFilter(hm))) allowedIds.add(hm.id);
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const id of [...allowedIds]) {
      const hm = fullList.find(h => h.id === id);
      if (hm?.parent_id != null && candidateIds.has(hm.parent_id) && !allowedIds.has(hm.parent_id)) {
        allowedIds.add(hm.parent_id);
        changed = true;
      }
    }
  }
  return candidates.filter(hm => allowedIds.has(hm.id));
}

function ensureSelectedHangMuc(
  filtered: HangMucThuChi[],
  selectedId: string,
  fullList: HangMucThuChi[],
): HangMucThuChi[] {
  if (!selectedId || filtered.some(h => String(h.id) === selectedId)) return filtered;
  const selected = fullList.find(h => String(h.id) === selectedId);
  return selected ? [...filtered, selected] : filtered;
}

function filterHangMucForContext(
  fullList: HangMucThuChi[],
  loaiGd: LoaiGiaoDich,
  taiKhoanPhamVi?: PhamViTaiKhoan,
  selectedId?: string,
): HangMucThuChi[] {
  if (!taiKhoanPhamVi) {
    return ensureSelectedHangMuc([], selectedId || '', fullList);
  }
  const byLoai = filterHangMucByLoaiGd(fullList, loaiGd);
  const byTaiKhoan = filterHangMucByTaiKhoan(byLoai, fullList, taiKhoanPhamVi);
  const withCk = ensureCkSubtreeComplete(byTaiKhoan, byLoai, fullList, taiKhoanPhamVi);
  return ensureSelectedHangMuc(withCk, selectedId || '', fullList);
}

function isCaNhanChiRoot(hm: HangMucThuChi): boolean {
  if (hm.ma_hang_muc === 'CHI.CN') return true;
  const ten = (hm.ten_hang_muc || '').toLowerCase();
  return !hm.parent_id
    && hm.pham_vi === 'ca_nhan'
    && hm.loai_giao_dich === 'chi'
    && ten.includes('chi phí cá nhân');
}

function sortHangMucRoots(roots: HangMucThuChi[], opts?: BuildHangMucOpts): HangMucThuChi[] {
  const nonCompany = opts?.taiKhoanPhamVi && opts.taiKhoanPhamVi !== 'cong_ty';
  if (!nonCompany) {
    return [...roots].sort((a, b) => (a.thu_tu ?? 0) - (b.thu_tu ?? 0));
  }

  const score = (hm: HangMucThuChi): number => {
    const loai = opts?.loaiGd;
    if (loai === 'chi') {
      if (isCaNhanChiRoot(hm)) return 0;
      if (hm.ma_hang_muc === 'CHI.OTO' || hm.pham_vi === 'oto') return 1;
      if (hm.ma_hang_muc === 'CK') return 2;
      if (hm.ma_hang_muc === 'VAINO') return 3;
      return 10;
    }
    if (loai === 'thu') {
      if (hm.ma_hang_muc === 'VAINO') return 0;
      if (hm.ma_hang_muc === 'THU') return 1;
      if (hm.ma_hang_muc === 'CK') return 2;
      return 10;
    }
    if (loai === 'chuyen_khoan_noi_bo' && hm.ma_hang_muc === 'CK') return 0;
    return 10;
  };

  return [...roots].sort((a, b) => {
    const diff = score(a) - score(b);
    if (diff !== 0) return diff;
    return (a.thu_tu ?? 0) - (b.thu_tu ?? 0);
  });
}

function buildHangMucOptions(list: HangMucThuChi[], opts?: BuildHangMucOpts): HangMucSelectOption[] {
  const byParent: Record<number | string, HangMucThuChi[]> = {};
  const parentIds = new Set<number>();
  for (const hm of list) {
    const key = hm.parent_id ?? 'root';
    if (!byParent[key]) byParent[key] = [];
    byParent[key].push(hm);
    if (hm.parent_id) parentIds.add(hm.parent_id);
  }
  for (const children of Object.values(byParent)) {
    children.sort((a, b) => (a.thu_tu ?? 0) - (b.thu_tu ?? 0));
  }

  const result: HangMucSelectOption[] = [];
  function walkChildren(parentId: number, depth: number) {
    for (const hm of byParent[parentId] || []) {
      result.push({
        id: hm.id,
        label: hm.ten_hang_muc,
        indent: depth,
        isParent: parentIds.has(hm.id),
      });
      walkChildren(hm.id, depth + 1);
    }
  }

  const roots = sortHangMucRoots(byParent['root'] || [], opts);

  for (const hm of roots) {
    result.push({
      id: hm.id,
      label: hm.ten_hang_muc,
      indent: 0,
      isParent: parentIds.has(hm.id),
    });
    walkChildren(hm.id, 1);
  }
  return result;
}

function renderHangMucSelectOptions(
  options: HangMucSelectOption[],
  indentMultiplier = 2,
) {
  return options.map(o => (
    <option
      key={o.id}
      value={o.id}
      className={o.isParent ? 'font-bold' : ''}
      style={o.isParent ? { fontWeight: 700, color: '#0f766e' } : undefined}
    >
      {'\u00A0'.repeat(o.indent * indentMultiplier)}
      {o.isParent ? '▸ ' : ''}
      {o.label}
    </option>
  ));
}

function isHangMucChuyenKhoanNoiBo(hangMucId: string, list: HangMucThuChi[]): boolean {
  if (!hangMucId) return false;
  let cur = list.find((h) => String(h.id) === hangMucId);
  while (cur) {
    if (cur.loai_giao_dich === 'chuyen_khoan_noi_bo') return true;
    const ma = cur.ma_hang_muc || '';
    if (ma === 'CK' || ma.startsWith('CK.')) return true;
    if (!cur.parent_id) break;
    cur = list.find((h) => h.id === cur!.parent_id);
  }
  return false;
}

function resolveImportLoaiGd(row: ExcelRow, list: HangMucThuChi[]): LoaiGiaoDich {
  if (isHangMucChuyenKhoanNoiBo(row.hang_muc_thu_chi_id, list)) {
    return 'chuyen_khoan_noi_bo';
  }
  return row.ghi_co > 0 ? 'thu' : 'chi';
}

function isHangMucHopDongCongTrinh(hm: HangMucThuChi, list: HangMucThuChi[]): boolean {
  let cur: HangMucThuChi | undefined = hm;
  while (cur) {
    if (cur.tinh_chat === 'chi_phi_cong_trinh') return true;
    const ma = cur.ma_hang_muc || '';
    if (ma === 'CHI.CT.HD' || ma.startsWith('CHI.CT.HD.')) return true;
    const ten = (cur.ten_hang_muc || '').toLowerCase();
    if (ten.includes('chi phí hợp đồng') && ten.includes('công trình')) return true;
    if (!cur.parent_id) break;
    cur = list.find((h) => h.id === cur!.parent_id);
  }
  return false;
}

/** Gắn KH / NCC / Hợp đồng khi chọn Chi phí hợp đồng / công trình (hoặc hạng mục thu có liên kết HĐ). */
function showDoiTuongTagFields(hangMucId: string, list: HangMucThuChi[]): boolean {
  if (!hangMucId) return false;
  const hm = list.find((h) => String(h.id) === hangMucId);
  if (!hm) return false;
  if (isHangMucHopDongCongTrinh(hm, list)) return true;
  return !!hm.ap_dung_cho_hop_dong;
}

function hangMucOptionsForImportRow(
  row: ExcelRow,
  list: HangMucThuChi[],
  taiKhoanPhamVi?: PhamViTaiKhoan,
): HangMucSelectOption[] {
  if (!taiKhoanPhamVi) return [];
  const loaiGd: LoaiGiaoDich = row.ghi_co > 0 ? 'thu' : 'chi';
  const filtered = filterHangMucForContext(list, loaiGd, taiKhoanPhamVi, row.hang_muc_thu_chi_id);
  return buildHangMucOptions(filtered, { loaiGd, taiKhoanPhamVi });
}

function clearInvalidImportHangMuc(
  rows: ExcelRow[],
  list: HangMucThuChi[],
  tkPhamVi?: PhamViTaiKhoan,
): ExcelRow[] {
  if (!tkPhamVi) {
    return rows.map((row) => ({
      ...row,
      hang_muc_thu_chi_id: '',
      khach_hang_id: '',
      nha_cung_cap_id: '',
      hop_dong_id: '',
    }));
  }
  return rows.map((row) => {
    const loaiGd: LoaiGiaoDich = row.ghi_co > 0 ? 'thu' : 'chi';
    const stillValid = !row.hang_muc_thu_chi_id || filterHangMucForContext(
      list, loaiGd, tkPhamVi, row.hang_muc_thu_chi_id,
    ).some((h) => String(h.id) === row.hang_muc_thu_chi_id);
    if (stillValid) return row;
    return {
      ...row,
      hang_muc_thu_chi_id: '',
      khach_hang_id: '',
      nha_cung_cap_id: '',
      hop_dong_id: '',
    };
  });
}

// ─── Excel import types ───────────────────────────────────────────────────────
interface ExcelRow {
  stt: number;
  ngay_gd: string;
  ngay_gt: string;
  ngay_iso: string;
  dien_giai: string;
  ghi_no: number;  // debit from bank = chi
  ghi_co: number;  // credit from bank = thu
  so_du: number;
  tk_doi_ung: string;
  chu_tk: string;
  ma_giao_dich_ngan_hang: string;
  valid: boolean;
  error?: string;
  khach_hang_id: string;
  nha_cung_cap_id: string;
  hop_dong_id: string;
  hang_muc_thu_chi_id: string;
  ghi_chu: string;
}

interface ImportDuplicateInfo {
  stt: number;
  ma_giao_dich_ngan_hang: string;
  ngay_gd: string;
  dien_giai: string;
  so_tien: number;
  reason: 'he_thong' | 'trong_lo';
}

function importRowSoTien(row: ExcelRow): number {
  return row.ghi_co > 0 ? row.ghi_co : row.ghi_no;
}

function normalizeMaGiaoDichNganHang(s: string): string {
  return String(s || '').trim().toUpperCase();
}

function normalizeImportText(s: string): string {
  return String(s || '').trim().replace(/\s+/g, ' ');
}

function normalizeImportMoney(n: number | string | null | undefined): string {
  return String(Math.round(Number(n) || 0));
}

/** Khóa trùng: tất cả cột sao kê Excel phải giống hệt nhau. */
function saoKeImportDupKey(parts: {
  ngay_gd: string;
  ngay_gt: string;
  dien_giai: string;
  ghi_no: number;
  ghi_co: number;
  so_du: number;
  tk_doi_ung: string;
  chu_tk: string;
  ma_giao_dich_ngan_hang: string;
}): string {
  return [
    normalizeImportText(parts.ngay_gd),
    normalizeImportText(parts.ngay_gt),
    normalizeImportText(parts.dien_giai),
    normalizeImportMoney(parts.ghi_no),
    normalizeImportMoney(parts.ghi_co),
    normalizeImportMoney(parts.so_du),
    normalizeImportText(parts.tk_doi_ung),
    normalizeImportText(parts.chu_tk),
    normalizeMaGiaoDichNganHang(parts.ma_giao_dich_ngan_hang),
  ].join('|');
}

function bankGhiNoCoFromRecord(d: DongTienMoi): { ghi_no: number; ghi_co: number } {
  const tien = Number(d.so_tien) || 0;
  if (d.loai_giao_dich === 'thu') return { ghi_no: 0, ghi_co: tien };
  if (d.loai_giao_dich === 'chi') return { ghi_no: tien, ghi_co: 0 };
  if (d.loai_giao_dich === 'chuyen_khoan_noi_bo') {
    if (d.chieu_tien === 'thu') return { ghi_no: 0, ghi_co: tien };
    if (d.chieu_tien === 'chi') return { ghi_no: tien, ghi_co: 0 };
  }
  return { ghi_no: 0, ghi_co: 0 };
}

function importRowDupKey(row: ExcelRow): string {
  return saoKeImportDupKey(row);
}

function existingRecordDupKey(d: DongTienMoi): string {
  const { ghi_no, ghi_co } = bankGhiNoCoFromRecord(d);
  return saoKeImportDupKey({
    ngay_gd: d.ngay_giao_dich || '',
    ngay_gt: d.ngay_hach_toan || '',
    dien_giai: d.mo_ta_giao_dich || '',
    ghi_no,
    ghi_co,
    so_du: Number(d.so_du_sau_giao_dich) || 0,
    tk_doi_ung: d.so_tai_khoan_doi_ung || '',
    chu_tk: d.ten_tai_khoan_doi_ung || '',
    ma_giao_dich_ngan_hang: d.ma_giao_dich_ngan_hang || '',
  });
}

function findImportDuplicates(
  validRows: ExcelRow[],
  existingKeys: Set<string>,
): ImportDuplicateInfo[] {
  const dupes: ImportDuplicateInfo[] = [];
  const batchKeys = new Set<string>();

  for (const row of validRows) {
    const key = importRowDupKey(row);
    const soTien = importRowSoTien(row);
    if (existingKeys.has(key)) {
      dupes.push({
        stt: row.stt,
        ma_giao_dich_ngan_hang: row.ma_giao_dich_ngan_hang,
        ngay_gd: row.ngay_gd, dien_giai: row.dien_giai,
        so_tien: soTien, reason: 'he_thong',
      });
    } else if (batchKeys.has(key)) {
      dupes.push({
        stt: row.stt,
        ma_giao_dich_ngan_hang: row.ma_giao_dich_ngan_hang,
        ngay_gd: row.ngay_gd, dien_giai: row.dien_giai,
        so_tien: soTien, reason: 'trong_lo',
      });
    } else {
      batchKeys.add(key);
    }
  }
  return dupes;
}

function parseExcelDate(s: string): string {
  if (!s || !s.trim()) return '';
  const trimmed = s.trim();
  const dmySlash = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmySlash) {
    const [, d, m, y] = dmySlash;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const dmyDash = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (dmyDash) {
    const [, d, m, y] = dmyDash;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  return '';
}

function isoToDmySlash(iso: string, time?: string): string {
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return '';
  const base = `${d}/${m}/${y}`;
  return time ? `${base} ${time}` : base;
}

function resolveImportNgay(cols: string[]): { ngayISO: string; ngayGD: string } {
  const col0 = (cols[0] || '').trim();
  const col1 = (cols[1] || '').trim();
  const ngayISO = parseExcelDate(col0) || parseExcelDate(col1);
  if (!ngayISO) return { ngayISO: '', ngayGD: col0 || col1 };
  const timeMatch = col0.match(/\s+(\d{2}:\d{2}:\d{2})/);
  const timePart = timeMatch?.[1] || '';
  if (parseExcelDate(col1)) {
    return { ngayISO, ngayGD: isoToDmySlash(ngayISO, timePart) };
  }
  return { ngayISO, ngayGD: isoToDmySlash(ngayISO, timePart) || col0 };
}

function parseExcelPaste(text: string): ExcelRow[] {
  const lines = text.trim().split('\n').filter(l => l.trim());
  const rows: ExcelRow[] = [];
  let stt = 1;
  for (const line of lines) {
    const cols = line.split('\t');
    if (cols.length < 3) continue;
    const ngayGt = (cols[1] || '').trim();
    const { ngayISO, ngayGD } = resolveImportNgay(cols);
    const dienGiai = (cols[2] || '').trim();
    const ghiNo = parseExcelNum(cols[3] || '');
    const ghiCo = parseExcelNum(cols[4] || '');
    const soDu = parseExcelNum(cols[5] || '');
    const tkDoiUng = (cols[6] || '').trim();
    const chuTK = (cols[7] || '').trim();
    const maGiaoDichNganHang = (cols[8] || '').trim();
    const expectsMaCol = cols.length >= 9;
    if (!dienGiai && ghiNo === 0 && ghiCo === 0) continue;
    if (!ngayISO && !dienGiai) continue;
    const valid = !!ngayISO && !!dienGiai && (ghiNo > 0 || ghiCo > 0)
      && (!expectsMaCol || !!maGiaoDichNganHang);
    rows.push({
      stt: stt++, ngay_gd: ngayGD, ngay_gt: ngayGt, ngay_iso: ngayISO,
      dien_giai: dienGiai, ghi_no: ghiNo, ghi_co: ghiCo, so_du: soDu,
      tk_doi_ung: tkDoiUng, chu_tk: chuTK, ma_giao_dich_ngan_hang: maGiaoDichNganHang, valid,
      error: !ngayISO ? 'Ngày không hợp lệ'
        : !dienGiai ? 'Thiếu diễn giải'
          : ghiNo === 0 && ghiCo === 0 ? 'Không có số tiền'
            : expectsMaCol && !maGiaoDichNganHang ? 'Thiếu mã giao dịch' : undefined,
      khach_hang_id: '', nha_cung_cap_id: '', hop_dong_id: '', hang_muc_thu_chi_id: '', ghi_chu: '',
    });
  }
  return rows;
}

// ─── Form values ──────────────────────────────────────────────────────────────
interface FormValues {
  loai_giao_dich: LoaiGiaoDich;
  ngay_giao_dich: string;
  tai_khoan_tien_id: string;
  tai_khoan_nhan_id: string;
  so_tien: number;
  hang_muc_thu_chi_id: string;
  khach_hang_id: string;
  hop_dong_id: string;
  nha_cung_cap_id: string;
  hop_dong_mua_id: string;
  mo_ta_giao_dich: string;
  so_tai_khoan_doi_ung: string;
  ten_tai_khoan_doi_ung: string;
  ghi_chu: string;
  trang_thai: string;
}

const emptyForm: FormValues = {
  loai_giao_dich: 'thu',
  ngay_giao_dich: getTodayInputValue(),
  tai_khoan_tien_id: '',
  tai_khoan_nhan_id: '',
  so_tien: 0,
  hang_muc_thu_chi_id: '',
  khach_hang_id: '',
  hop_dong_id: '',
  nha_cung_cap_id: '',
  hop_dong_mua_id: '',
  mo_ta_giao_dich: '',
  so_tai_khoan_doi_ung: '',
  ten_tai_khoan_doi_ung: '',
  ghi_chu: '',
  trang_thai: 'hoan_thanh',
};

interface Filters {
  dateFrom: string;
  dateTo: string;
  loai_giao_dich: string;
  tai_khoan_tien_id: string;
  pham_vi: string;
  hang_muc_thu_chi_id: string;
  khach_hang_id: string;
  search: string;
}

const emptyFilters: Filters = {
  dateFrom: '', dateTo: '', loai_giao_dich: '', tai_khoan_tien_id: '',
  pham_vi: '', hang_muc_thu_chi_id: '', khach_hang_id: '', search: '',
};

// ─── Component ───────────────────────────────────────────────────────────────
export default function DongTienMoiList() {
  const addToast = useToastStore(s => s.addToast);
  const isAdmin = useAuthStore(s => s.isAdmin);

  // ── Master data ────────────────────────────────────────────────────────────
  const [taiKhoanList, setTaiKhoanList] = useState<TaiKhoanTien[]>([]);
  const [hangMucList, setHangMucList] = useState<HangMucThuChi[]>([]);
  const [khachHangList, setKhachHangList] = useState<KhachHang[]>([]);
  const [nhaCungCapList, setNhaCungCapList] = useState<NhaCungCap[]>([]);
  const [hopDongList, setHopDongList] = useState<HopDong[]>([]);
  const [hopDongMuaList, setHopDongMuaList] = useState<HopDongMua[]>([]);

  // ── Table state ────────────────────────────────────────────────────────────
  const [data, setData] = useState<DongTienMoi[]>([]);
  const [allFilteredRows, setAllFilteredRows] = useState<DongTienMoi[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // ── Summary ────────────────────────────────────────────────────────────────
  const [tongThu, setTongThu] = useState(0);
  const [tongChi, setTongChi] = useState(0);

  // ── Filters ────────────────────────────────────────────────────────────────
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [filtersApplied, setFiltersApplied] = useState<Filters>(emptyFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const hasActiveFilters = Object.values(filtersApplied).some(v => v !== '');

  // ── Modal ──────────────────────────────────────────────────────────────────
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormValues>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DongTienMoi | null>(null);

  const formTaiKhoan = taiKhoanList.find(t => String(t.id) === form.tai_khoan_tien_id);
  const hangMucFiltered = filterHangMucForContext(
    hangMucList,
    form.loai_giao_dich,
    formTaiKhoan?.pham_vi,
    form.hang_muc_thu_chi_id,
  );
  const hangMucOptions = buildHangMucOptions(hangMucFiltered, {
    loaiGd: form.loai_giao_dich,
    taiKhoanPhamVi: formTaiKhoan?.pham_vi,
  });
  const isPersonalTaiKhoan = formTaiKhoan?.pham_vi != null && formTaiKhoan.pham_vi !== 'cong_ty';
  const showDoiTuongModal = showDoiTuongTagFields(form.hang_muc_thu_chi_id, hangMucList);
  const showKhHopDongChi =
    showDoiTuongModal || !!(form.khach_hang_id || form.hop_dong_id);
  const showKhHopDongThu =
    showDoiTuongModal || !!(form.khach_hang_id || form.hop_dong_id);

  // ── Filtered hop dong by khach hang ───────────────────────────────────────
  const hopDongFiltered = form.khach_hang_id
    ? hopDongList.filter(hd => String((hd as any).khach_hang_id) === form.khach_hang_id)
    : hopDongList;

  // ── Excel import ───────────────────────────────────────────────────────────
  const [showImport, setShowImport] = useState(false);
  const [importTaiKhoanId, setImportTaiKhoanId] = useState('');
  const importTaiKhoan = taiKhoanList.find(t => String(t.id) === importTaiKhoanId);
  const [pasteText, setPasteText] = useState('');
  const [excelRows, setExcelRows] = useState<ExcelRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [importDupDialogOpen, setImportDupDialogOpen] = useState(false);
  const [importDuplicates, setImportDuplicates] = useState<ImportDuplicateInfo[]>([]);
  const [importDuplicateStts, setImportDuplicateStts] = useState<Set<number>>(new Set());
  const importExistingKeysRef = useRef<Set<string>>(new Set());
  const pasteRef = useRef<HTMLTextAreaElement>(null);
  const [khSearchMap, setKhSearchMap] = useState<Record<number, string>>({});
  const [khDropMap, setKhDropMap] = useState<Record<number, boolean>>({});
  const [khResultsMap, setKhResultsMap] = useState<Record<number, KhachHang[]>>({});
  const khTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  function searchKhForRow(stt: number, q: string) {
    if (khTimers.current[stt]) clearTimeout(khTimers.current[stt]);
    if (!q.trim()) { setKhResultsMap(m => ({ ...m, [stt]: [] })); return; }
    khTimers.current[stt] = setTimeout(async () => {
      try {
        const res = await khachHangApi.list({ search: q.trim(), limit: 15 });
        setKhResultsMap(m => ({ ...m, [stt]: (res.data as KhachHang[]) || [] }));
      } catch { /* ignore */ }
    }, 250);
  }

  const [nccSearchMap, setNccSearchMap] = useState<Record<number, string>>({});
  const [nccDropMap, setNccDropMap] = useState<Record<number, boolean>>({});
  const [nccResultsMap, setNccResultsMap] = useState<Record<number, NhaCungCap[]>>({});
  const nccTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const [hdSearchMap, setHdSearchMap] = useState<Record<number, string>>({});
  const [hdDropMap, setHdDropMap] = useState<Record<number, boolean>>({});
  const [hdResultsMap, setHdResultsMap] = useState<Record<number, HopDong[]>>({});
  const hdTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const [copyDownOpen, setCopyDownOpen] = useState<number | null>(null);
  const [copyDownCount, setCopyDownCount] = useState(1);

  function resetImportTagMaps() {
    setKhSearchMap({});
    setKhDropMap({});
    setKhResultsMap({});
    setNccSearchMap({});
    setNccDropMap({});
    setNccResultsMap({});
    setHdSearchMap({});
    setHdDropMap({});
    setHdResultsMap({});
    setCopyDownOpen(null);
    setCopyDownCount(1);
  }

  function searchNccForRow(stt: number, q: string) {
    if (nccTimers.current[stt]) clearTimeout(nccTimers.current[stt]);
    if (!q.trim()) { setNccResultsMap(m => ({ ...m, [stt]: [] })); return; }
    nccTimers.current[stt] = setTimeout(async () => {
      try {
        const res = await nhaCungCapApi.list({ search: q.trim(), limit: 15 });
        setNccResultsMap(m => ({ ...m, [stt]: (res.data as NhaCungCap[]) || [] }));
      } catch { /* ignore */ }
    }, 250);
  }

  function searchHdForRow(stt: number, q: string, khachHangId: string) {
    if (hdTimers.current[stt]) clearTimeout(hdTimers.current[stt]);
    hdTimers.current[stt] = setTimeout(async () => {
      try {
        const res = await hopDongApi.list({
          search: q.trim() || undefined,
          khach_hang_id: khachHangId || undefined,
          limit: 20,
        });
        setHdResultsMap((m) => ({ ...m, [stt]: (res.data as HopDong[]) || [] }));
      } catch {
        setHdResultsMap((m) => ({ ...m, [stt]: [] }));
      }
    }, 250);
  }

  // ── Load master data ───────────────────────────────────────────────────────
  useEffect(() => {
    taiKhoanTienApi.list().then(({ data }) => setTaiKhoanList((data as TaiKhoanTien[]) ?? [])).catch(console.error);
    hangMucThuChiApi.list().then(({ data }) => setHangMucList((data as HangMucThuChi[]) ?? [])).catch(console.error);
    khachHangApi.list({ limit: 1000 }).then(({ data }) => setKhachHangList((data as KhachHang[]) ?? [])).catch(console.error);
    nhaCungCapApi.list({ limit: 1000 }).then(({ data }) => setNhaCungCapList((data as NhaCungCap[]) ?? [])).catch(console.error);
    hopDongApi.list({ limit: 1000 }).then(({ data }) => setHopDongList((data as HopDong[]) ?? [])).catch(console.error);
    hopDongMuaApi.list({ limit: 1000 }).then(({ data }) => setHopDongMuaList((data as HopDongMua[]) ?? [])).catch(console.error);
  }, []);

  // ── Fetch data ─────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const f = filtersApplied;
      const params: Record<string, string | number | undefined> = { page: currentPage, limit: PAGE_SIZE };
      if (f.dateFrom) params.date_from = f.dateFrom;
      if (f.dateTo) params.date_to = f.dateTo;
      if (f.loai_giao_dich) params.loai_giao_dich = f.loai_giao_dich;
      if (f.tai_khoan_tien_id) params.tai_khoan_tien_id = f.tai_khoan_tien_id;
      if (f.pham_vi) params.pham_vi = f.pham_vi;
      if (f.hang_muc_thu_chi_id) params.hang_muc_thu_chi_id = f.hang_muc_thu_chi_id;
      if (f.khach_hang_id) params.khach_hang_id = f.khach_hang_id;
      if (f.search.trim()) params.search = f.search.trim();

      const { data: rows, total, tong_thu, tong_chi } = await dongTienMoiApi.list({
        ...params,
        summary: '1',
      });
      setData(rows as DongTienMoi[]);
      setTotalCount(total);
      setAllFilteredRows(rows as DongTienMoi[]);
      setTongThu(Number(tong_thu) || 0);
      setTongChi(Number(tong_chi) || 0);
    } catch (err) {
      console.error(err);
      addToast('error', 'Không thể tải danh sách dòng tiền');
    } finally {
      setLoading(false);
    }
  }, [currentPage, filtersApplied, addToast]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { setCurrentPage(1); }, [filtersApplied]);

  // ── Filter actions ─────────────────────────────────────────────────────────
  function applyFilters() { setFiltersApplied({ ...filters }); setCurrentPage(1); }
  function clearFilters() { setFilters(emptyFilters); setFiltersApplied(emptyFilters); setCurrentPage(1); }

  // ── Modal open ─────────────────────────────────────────────────────────────
  function openAddModal() {
    setEditingId(null);
    setForm(emptyForm);
    setModalOpen(true);
  }

  function openEditModal(row: DongTienMoi) {
    setEditingId(row.id);
    const hmId = row.hang_muc_thu_chi_id ? String(row.hang_muc_thu_chi_id) : '';
    const loaiGd = isHangMucChuyenKhoanNoiBo(hmId, hangMucList)
      ? 'chuyen_khoan_noi_bo'
      : row.loai_giao_dich;
    setForm({
      loai_giao_dich: loaiGd,
      ngay_giao_dich: toInputDateValue(row.ngay_giao_dich) || getTodayInputValue(),
      tai_khoan_tien_id: String(row.tai_khoan_tien_id),
      tai_khoan_nhan_id: row.tai_khoan_nhan_id ? String(row.tai_khoan_nhan_id) : '',
      so_tien: Number(row.so_tien) || 0,
      hang_muc_thu_chi_id: row.hang_muc_thu_chi_id ? String(row.hang_muc_thu_chi_id) : '',
      khach_hang_id: row.khach_hang_id ? String(row.khach_hang_id) : '',
      hop_dong_id: row.hop_dong_id ? String(row.hop_dong_id) : '',
      nha_cung_cap_id: row.nha_cung_cap_id ? String(row.nha_cung_cap_id) : '',
      hop_dong_mua_id: row.hop_dong_mua_id ? String(row.hop_dong_mua_id) : '',
      mo_ta_giao_dich: row.mo_ta_giao_dich || '',
      so_tai_khoan_doi_ung: row.so_tai_khoan_doi_ung || '',
      ten_tai_khoan_doi_ung: row.ten_tai_khoan_doi_ung || '',
      ghi_chu: row.ghi_chu || '',
      trang_thai: row.trang_thai || 'hoan_thanh',
    });
    setModalOpen(true);
  }

  // ── Save ───────────────────────────────────────────────────────────────────
  async function handleSave() {
    const loaiGd = isHangMucChuyenKhoanNoiBo(form.hang_muc_thu_chi_id, hangMucList)
      ? 'chuyen_khoan_noi_bo'
      : form.loai_giao_dich;

    if (!form.tai_khoan_tien_id) { addToast('warning', 'Vui lòng chọn tài khoản tiền'); return; }
    if (!form.so_tien || form.so_tien <= 0) { addToast('warning', 'Số tiền phải lớn hơn 0'); return; }
    if (!form.ngay_giao_dich) { addToast('warning', 'Vui lòng nhập ngày giao dịch'); return; }
    if (loaiGd === 'dieu_chinh_so_du' && !form.ghi_chu.trim()) {
      addToast('warning', 'Điều chỉnh số dư cần có ghi chú lý do'); return;
    }

    setSaving(true);
    try {
      const payload = {
        loai_giao_dich: loaiGd,
        chieu_tien: loaiGd === 'chuyen_khoan_noi_bo' ? 'chi' : null,
        ngay_giao_dich: form.ngay_giao_dich,
        tai_khoan_tien_id: Number(form.tai_khoan_tien_id),
        tai_khoan_nhan_id: form.tai_khoan_nhan_id ? Number(form.tai_khoan_nhan_id) : null,
        so_tien: form.so_tien,
        hang_muc_thu_chi_id: form.hang_muc_thu_chi_id ? Number(form.hang_muc_thu_chi_id) : null,
        khach_hang_id: form.khach_hang_id ? Number(form.khach_hang_id) : null,
        hop_dong_id: form.hop_dong_id ? Number(form.hop_dong_id) : null,
        nha_cung_cap_id: form.nha_cung_cap_id ? Number(form.nha_cung_cap_id) : null,
        hop_dong_mua_id: form.hop_dong_mua_id ? Number(form.hop_dong_mua_id) : null,
        mo_ta_giao_dich: form.mo_ta_giao_dich.trim() || null,
        so_tai_khoan_doi_ung: form.so_tai_khoan_doi_ung.trim() || null,
        ten_tai_khoan_doi_ung: form.ten_tai_khoan_doi_ung.trim() || null,
        ghi_chu: form.ghi_chu.trim() || null,
        trang_thai: form.trang_thai,
      };

      if (editingId) {
        await dongTienMoiApi.update(editingId, payload);
        addToast('success', 'Cập nhật giao dịch thành công');
      } else {
        await dongTienMoiApi.create(payload);
        addToast('success', 'Thêm giao dịch thành công');
      }
      setModalOpen(false);
      fetchData();
    } catch (err) {
      console.error(err);
      addToast('error', 'Không thể lưu giao dịch');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await dongTienMoiApi.delete(deleteTarget.id);
      addToast('success', 'Xóa giao dịch thành công');
      fetchData();
    } catch {
      addToast('error', 'Không thể xóa giao dịch');
    } finally {
      setDeleteTarget(null);
    }
  }

  // ── Excel import ───────────────────────────────────────────────────────────
  function clearImportDuplicateState() {
    setImportDupDialogOpen(false);
    setImportDuplicates([]);
    setImportDuplicateStts(new Set());
  }

  function handleParsePaste() {
    if (!pasteText.trim()) { addToast('warning', 'Vui lòng dán dữ liệu Excel'); return; }
    const rows = parseExcelPaste(pasteText);
    if (rows.length === 0) { addToast('warning', 'Không tìm thấy dữ liệu hợp lệ'); return; }
    resetImportTagMaps();
    clearImportDuplicateState();
    setExcelRows(rows);
    addToast('success', `Đã bóc tách ${rows.length} dòng`);
  }

  function updateExcelRow(stt: number, field: keyof ExcelRow, value: string) {
    if (field === 'hang_muc_thu_chi_id' && !showDoiTuongTagFields(value, hangMucList)) {
      setKhSearchMap((m) => ({ ...m, [stt]: '' }));
      setNccSearchMap((m) => ({ ...m, [stt]: '' }));
      setHdSearchMap((m) => ({ ...m, [stt]: '' }));
    }
    if (field === 'khach_hang_id') {
      setHdSearchMap((m) => ({ ...m, [stt]: '' }));
    }
    setExcelRows(prev => prev.map(r => {
      if (r.stt !== stt) return r;
      const updated = { ...r, [field]: value };
      if (field === 'khach_hang_id') updated.hop_dong_id = '';
      if (field === 'hang_muc_thu_chi_id' && !showDoiTuongTagFields(value, hangMucList)) {
        updated.khach_hang_id = '';
        updated.nha_cung_cap_id = '';
        updated.hop_dong_id = '';
      }
      return updated;
    }));
  }

  function copyTagsDown(fromIdx: number, count: number) {
    setCopyDownOpen(null);
    const khUpdates: Record<number, string> = {};
    const nccUpdates: Record<number, string> = {};
    const hdUpdates: Record<number, string> = {};
    let copied = 0;

    setExcelRows(prev => {
      const src = prev[fromIdx];
      if (!src) return prev;
      const khName = khachHangList.find(k => String(k.id) === src.khach_hang_id)?.ten_cong_ty || '';
      const nccName = nhaCungCapList.find(n => String(n.id) === src.nha_cung_cap_id)?.ten_nha_cung_cap || '';
      const hdSo = hopDongList.find(h => String(h.id) === src.hop_dong_id)?.so_hop_dong || '';
      const next = [...prev];
      for (let i = fromIdx + 1; i <= fromIdx + count && i < next.length; i++) {
        const target = next[i];
        next[i] = {
          ...target,
          khach_hang_id: src.khach_hang_id,
          nha_cung_cap_id: src.nha_cung_cap_id,
          hop_dong_id: src.hop_dong_id,
          hang_muc_thu_chi_id: src.hang_muc_thu_chi_id,
          ghi_chu: src.ghi_chu,
        };
        khUpdates[target.stt] = khName;
        nccUpdates[target.stt] = nccName;
        hdUpdates[target.stt] = hdSo;
        copied++;
      }
      return next;
    });
    if (copied === 0) return;
    setKhSearchMap(m => ({ ...m, ...khUpdates }));
    setNccSearchMap(m => ({ ...m, ...nccUpdates }));
    setHdSearchMap(m => ({ ...m, ...hdUpdates }));
    addToast('success', `Đã copy tag cho ${copied} dòng bên dưới`);
  }

  useEffect(() => {
    if (copyDownOpen === null) return;
    function handlePointerDown(e: MouseEvent) {
      const el = e.target as Element;
      if (!el.closest('[data-copy-down-root]')) setCopyDownOpen(null);
    }
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [copyDownOpen]);

  async function runImportExcel(skipStts: Set<number>) {
    const validRows = excelRows.filter(r => r.valid);
    const existingKeys = importExistingKeysRef.current;
    let ok = 0, skipped = 0, err = 0;

    for (const row of validRows) {
      if (skipStts.has(row.stt)) {
        skipped++;
        continue;
      }
      try {
        const loaiGD = resolveImportLoaiGd(row, hangMucList);
        const soTien = importRowSoTien(row);
        const dupKey = importRowDupKey(row);
        if (existingKeys.has(dupKey)) {
          skipped++;
          continue;
        }

        const chieuTien = loaiGD === 'chuyen_khoan_noi_bo'
          ? (row.ghi_co > 0 ? 'thu' : 'chi')
          : null;
        let counterpart = loaiGD === 'chuyen_khoan_noi_bo'
          ? findCkCounterpartForImport(taiKhoanList, importTaiKhoanId, [
            parseMoTaCounterpart(row.dien_giai),
            row.chu_tk,
          ])
          : undefined;
        if (counterpart && String(counterpart.id) === String(importTaiKhoanId)) {
          counterpart = undefined;
        }

        await dongTienMoiApi.create({
          loai_giao_dich: loaiGD,
          chieu_tien: chieuTien,
          ngay_giao_dich: row.ngay_gd,
          ngay_hach_toan: row.ngay_gt || null,
          tai_khoan_tien_id: Number(importTaiKhoanId),
          tai_khoan_nhan_id: counterpart?.id ?? null,
          so_tien: soTien,
          mo_ta_giao_dich: row.dien_giai,
          so_tai_khoan_doi_ung: row.tk_doi_ung || null,
          ten_tai_khoan_doi_ung: row.chu_tk || null,
          so_du_sau_giao_dich: row.so_du > 0 ? row.so_du : null,
          ma_giao_dich_ngan_hang: row.ma_giao_dich_ngan_hang || null,
          khach_hang_id: row.khach_hang_id ? Number(row.khach_hang_id) : null,
          nha_cung_cap_id: row.nha_cung_cap_id ? Number(row.nha_cung_cap_id) : null,
          hop_dong_id: row.hop_dong_id ? Number(row.hop_dong_id) : null,
          hang_muc_thu_chi_id: row.hang_muc_thu_chi_id ? Number(row.hang_muc_thu_chi_id) : null,
          ghi_chu: row.ghi_chu.trim() || null,
          nguon_du_lieu: 'import_excel',
        });
        existingKeys.add(dupKey);
        ok++;
      } catch { err++; }
    }

    if (ok > 0 || skipped > 0) {
      const parts = [];
      if (ok > 0) parts.push(`Đã nhập ${ok} giao dịch`);
      if (skipped > 0) parts.push(`bỏ qua ${skipped} trùng`);
      if (err > 0) parts.push(`${err} lỗi`);
      addToast(ok > 0 ? 'success' : 'warning', parts.join(', '));
    } else {
      addToast('error', 'Không nhập được giao dịch nào');
    }

    if (ok > 0) {
      resetImportTagMaps();
      clearImportDuplicateState();
      setPasteText('');
      setExcelRows([]);
      fetchData();
    }
  }

  async function handleImportExcel() {
    if (!importTaiKhoanId) { addToast('warning', 'Vui lòng chọn tài khoản'); return; }
    const validRows = excelRows.filter(r => r.valid);
    if (validRows.length === 0) { addToast('warning', 'Không có dòng hợp lệ'); return; }
    setImporting(true);
    try {
      const dates = validRows.map(r => r.ngay_iso).filter(Boolean).sort();
      const existing = await dongTienMoiApi.list({
        tai_khoan_tien_id: importTaiKhoanId,
        date_from: dates[0],
        date_to: dates[dates.length - 1],
        limit: 9999,
      });
      const existingKeys = new Set(
        ((existing.data || []) as DongTienMoi[]).map(existingRecordDupKey),
      );
      importExistingKeysRef.current = existingKeys;

      const duplicates = findImportDuplicates(validRows, existingKeys);
      if (duplicates.length > 0) {
        setImportDuplicates(duplicates);
        setImportDuplicateStts(new Set(duplicates.map(d => d.stt)));
        setImportDupDialogOpen(true);
        addToast('warning', `Phát hiện ${duplicates.length} giao dịch trùng — vui lòng xác nhận trước khi lưu`);
        return;
      }

      await runImportExcel(new Set());
    } catch {
      addToast('error', 'Lỗi khi nhập dữ liệu');
    } finally {
      setImporting(false);
    }
  }

  async function handleImportSkipDuplicates() {
    const skipStts = new Set(importDuplicates.map(d => d.stt));
    const remaining = excelRows.filter(r => r.valid && !skipStts.has(r.stt));
    if (remaining.length === 0) {
      addToast('warning', 'Tất cả giao dịch đều trùng — không có gì để lưu');
      setImportDupDialogOpen(false);
      return;
    }
    setImportDupDialogOpen(false);
    setImporting(true);
    try {
      await runImportExcel(skipStts);
    } catch {
      addToast('error', 'Lỗi khi nhập dữ liệu');
    } finally {
      setImporting(false);
    }
  }

  const validImportCount = excelRows.filter(r => r.valid).length;
  const importDupSkipStts = new Set(importDuplicates.map(d => d.stt));
  const importSaveableCount = excelRows.filter(r => r.valid && !importDupSkipStts.has(r.stt)).length;

  // ── Helpers ────────────────────────────────────────────────────────────────
  function getTaiKhoanLabel(id?: number | null) {
    if (!id) return '--';
    const tk = taiKhoanList.find(t => t.id === id);
    return tk ? tk.ten_tai_khoan : '--';
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dòng tiền</h1>
          <p className="mt-1 text-sm text-gray-500">Quản lý thu chi thực tế</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-semibold hover:bg-teal-700 transition-colors shadow-sm"
            onClick={() => setShowImport(!showImport)}
          >
            <FileSpreadsheet className="w-4 h-4" />
            Nhập từ Excel
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showImport ? 'rotate-180' : ''}`} />
          </button>
          <button className="btn-primary flex items-center gap-2" onClick={openAddModal}>
            <Plus className="w-4 h-4" />
            Thêm giao dịch
          </button>
        </div>
      </div>

      {/* ── Excel Import Panel ─────────────────────────────────────────────── */}
      {showImport && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col overflow-hidden">
          <div className="bg-teal-600 px-5 py-3 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="w-5 h-5 text-white" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wide">Nhập liệu từ sao kê ngân hàng</h2>
            </div>
            <button onClick={() => { setShowImport(false); setPasteText(''); setExcelRows([]); resetImportTagMaps(); clearImportDuplicateState(); }} className="text-teal-100 hover:text-white p-1">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-shrink-0 px-5 py-4 border-b border-gray-200 bg-gray-50 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 items-start">
              <div>
                <label className="block text-sm font-semibold text-teal-700 mb-1.5">1. Chọn tài khoản <span className="text-red-500">*</span></label>
                <select value={importTaiKhoanId} onChange={e => {
                    const newId = e.target.value;
                    setImportTaiKhoanId(newId);
                    const newTk = taiKhoanList.find((t) => String(t.id) === newId);
                    setExcelRows((rows) => clearInvalidImportHangMuc(rows, hangMucList, newTk?.pham_vi));
                  }}
                  className="w-full px-3 py-2 text-sm border-2 border-teal-300 rounded-lg focus:outline-none focus:border-teal-500 bg-white">
                  <option value="">-- Chọn tài khoản --</option>
                  {taiKhoanList.map(tk => <option key={tk.id} value={tk.id}>{tk.ten_tai_khoan}</option>)}
                </select>
              </div>
              <div className="lg:col-span-2">
                <label className="block text-sm font-semibold text-teal-700 mb-1.5">2. Dán dữ liệu từ Excel</label>
                <div className="flex gap-2 items-start">
                  <textarea ref={pasteRef} value={pasteText} onChange={e => setPasteText(e.target.value)}
                    className="flex-1 h-16 px-3 py-2 text-xs border-2 border-dashed border-teal-300 rounded-lg focus:outline-none focus:border-teal-500 font-mono resize-none bg-white placeholder-teal-400"
                    placeholder="Dán (Ctrl+V) dữ liệu Excel vào đây..." />
                  <button onClick={handleParsePaste}
                    className="flex items-center gap-2 px-3 py-2 bg-teal-600 text-white rounded-lg text-xs font-bold hover:bg-teal-700 transition-colors whitespace-nowrap self-start">
                    <RefreshCw className="w-3.5 h-3.5" /> Bóc tách
                  </button>
                </div>
              </div>
              <div className="flex items-start gap-2 p-3 bg-teal-50 border border-teal-200 rounded-lg text-xs text-teal-700 self-end">
                <span className="w-5 h-5 rounded-full bg-teal-600 text-white flex items-center justify-center font-bold flex-shrink-0 mt-0.5">i</span>
                <span>Cột: <strong>Ngày GD · Ngày GT · Diễn giải · Nợ · Có · Số dư · TK đối ứng · Chủ TK · Mã GD</strong> — trùng khi <strong>tất cả các cột</strong> giống hệt dòng đã có</span>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-auto px-5 py-4">
            {excelRows.length > 0 ? (
              <div className="h-full flex flex-col">
                <div className="flex items-center justify-between mb-2 flex-shrink-0">
                  <span className="text-sm font-semibold text-teal-700">
                    3. Kiểm tra & gắn tag
                    <span className="ml-2 text-xs font-normal text-gray-500">{validImportCount}/{excelRows.length} hợp lệ</span>
                  </span>
                  <button onClick={() => { setPasteText(''); setExcelRows([]); resetImportTagMaps(); clearImportDuplicateState(); }}
                    className="text-xs text-gray-400 hover:text-red-500 flex items-center gap-1">
                    <X className="w-3 h-3" /> Xóa tất cả
                  </button>
                </div>
                <div className="overflow-x-auto rounded-lg border border-gray-200 flex-1">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-teal-600 text-white">
                        <th className="px-2 py-2 w-8 text-center">STT</th>
                        <th className="px-2 py-2 w-32 text-left">NGÀY GD</th>
                        <th className="px-2 py-2 w-56 text-left">DIỄN GIẢI</th>
                        <th className="px-2 py-2 w-24 text-right">NỢ (CHI)</th>
                        <th className="px-2 py-2 w-24 text-right">CÓ (THU)</th>
                        <th className="px-2 py-2 w-24 text-right">SỐ DƯ</th>
                        <th className="px-2 py-2 w-24 text-left">TK ĐỐI ỨNG</th>
                        <th className="px-2 py-2 w-40 text-left">CHỦ TK</th>
                        <th className="px-2 py-2 w-32 text-left font-mono">MÃ GD</th>
                        <th className="px-2 py-2 w-44 text-left bg-teal-700">HẠNG MỤC</th>
                        <th className="px-2 py-2 w-44 text-left bg-teal-700">KHÁCH HÀNG</th>
                        <th className="px-2 py-2 w-44 text-left bg-teal-700">NHÀ CUNG CẤP</th>
                        <th className="px-2 py-2 w-36 text-left bg-teal-700">SỐ HỢP ĐỒNG</th>
                        <th className="px-2 py-2 w-28 text-left bg-teal-700">GHI CHÚ</th>
                        <th className="px-2 py-2 w-16 text-center bg-teal-700">COPY</th>
                        <th className="px-2 py-2 w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {excelRows.map((row, idx) => {
                        const khName = khachHangList.find(k => String(k.id) === row.khach_hang_id)?.ten_cong_ty || '';
                        const selectedHd =
                          hopDongList.find(h => String(h.id) === row.hop_dong_id)
                          || (hdResultsMap[row.stt] || []).find(h => String(h.id) === row.hop_dong_id);
                        const hdSo = selectedHd?.so_hop_dong || '';
                        const hmOptions = hangMucOptionsForImportRow(row, hangMucList, importTaiKhoan?.pham_vi);
                        const showDoiTuong = showDoiTuongTagFields(row.hang_muc_thu_chi_id, hangMucList);
                        const isThu = row.ghi_co > 0;
                        const isChi = row.ghi_no > 0;
                        const isCopyOpen = copyDownOpen === row.stt;
                        const rowsBelow = excelRows.length - 1 - idx;
                        const isDuplicate = importDuplicateStts.has(row.stt);
                        const rowBg = !row.valid
                          ? 'bg-rose-50 hover:bg-rose-100'
                          : isDuplicate
                            ? 'bg-amber-50 hover:bg-amber-100'
                            : idx % 2 === 0
                              ? 'bg-sky-50 hover:bg-sky-100'
                              : 'bg-indigo-50 hover:bg-indigo-100';
                        const tagCellBg = !row.valid
                          ? 'bg-rose-100'
                          : isDuplicate
                            ? 'bg-amber-100'
                            : idx % 2 === 0
                              ? 'bg-sky-100'
                              : 'bg-indigo-100';
                        return (
                          <tr key={row.stt} className={rowBg}>
                            <td className="px-2 py-1 text-center text-gray-500">{row.stt}</td>
                            <td className="px-2 py-1 whitespace-nowrap">
                              <span className={`text-xs font-medium ${row.ngay_iso ? 'text-teal-700' : 'text-red-500'}`}>
                                {row.ngay_gd || '—'}
                              </span>
                            </td>
                            <td className="px-2 py-1" style={{ maxWidth: 224 }}>
                              <div className="text-gray-800 break-words leading-tight">{row.dien_giai || <span className="italic text-red-400">Trống</span>}</div>
                              {isDuplicate && <div className="text-amber-700 text-[10px] font-medium">Trùng toàn bộ cột sao kê với giao dịch đã có hoặc dòng khác trong danh sách</div>}
                              {row.error && <div className="text-red-500 text-[10px]">{row.error}</div>}
                            </td>
                            <td className="px-2 py-1 text-right whitespace-nowrap">
                              {row.ghi_no > 0 ? <span className="font-medium text-red-600">{formatVND(row.ghi_no)}</span> : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-2 py-1 text-right whitespace-nowrap">
                              {row.ghi_co > 0 ? <span className="font-medium text-green-600">{formatVND(row.ghi_co)}</span> : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-2 py-1 text-right whitespace-nowrap text-gray-600">
                              {row.so_du > 0 ? formatVND(row.so_du) : '—'}
                            </td>
                            <td className="px-2 py-1 text-gray-600 font-mono text-[11px]">{row.tk_doi_ung || '—'}</td>
                            <td className="px-2 py-1 text-gray-600 text-[11px] break-words" style={{ maxWidth: 160 }}>{row.chu_tk || '—'}</td>
                            <td className="px-2 py-1 text-gray-700 font-mono text-[10px] whitespace-nowrap">{row.ma_giao_dich_ngan_hang || '—'}</td>
                            {/* Hạng mục — chọn trước KH/NCC/HĐ */}
                            <td className={`px-1 py-1 ${tagCellBg}`} style={{ minWidth: 160 }}>
                              <select
                                value={row.hang_muc_thu_chi_id}
                                disabled={!importTaiKhoanId}
                                onChange={e => updateExcelRow(row.stt, 'hang_muc_thu_chi_id', e.target.value)}
                                className="w-full text-xs px-1.5 py-1 border border-teal-200 rounded focus:outline-none focus:border-teal-500 bg-white disabled:bg-gray-100 disabled:text-gray-400"
                              >
                                <option value="">{importTaiKhoanId ? '— Hạng mục —' : 'Chọn TK trước'}</option>
                                {renderHangMucSelectOptions(hmOptions)}
                              </select>
                            </td>
                            {/* KH — thu: KH+HĐ; chi HĐ/công trình: KH+NCC+HĐ */}
                            <td className={`px-1 py-1 ${tagCellBg}`} style={{ minWidth: 160 }}>
                              {showDoiTuong && (isThu || isChi) ? (
                                <div className="relative">
                                  <input type="text" value={khSearchMap[row.stt] !== undefined ? khSearchMap[row.stt] : khName}
                                    placeholder="Tìm khách..."
                                    className="w-full text-xs px-1.5 py-1 border border-teal-200 rounded focus:outline-none focus:border-teal-500 bg-white"
                                    onChange={e => {
                                      const v = e.target.value;
                                      setKhSearchMap(m => ({ ...m, [row.stt]: v }));
                                      setKhDropMap(m => ({ ...m, [row.stt]: true }));
                                      if (!v) updateExcelRow(row.stt, 'khach_hang_id', '');
                                      searchKhForRow(row.stt, v);
                                    }}
                                    onFocus={() => { setKhDropMap(m => ({ ...m, [row.stt]: true })); searchKhForRow(row.stt, khSearchMap[row.stt] || khName || ''); }}
                                    onBlur={() => setTimeout(() => setKhDropMap(m => ({ ...m, [row.stt]: false })), 200)}
                                  />
                                  {row.khach_hang_id && (
                                    <button type="button" onClick={() => { updateExcelRow(row.stt, 'khach_hang_id', ''); setKhSearchMap(m => ({ ...m, [row.stt]: '' })); }}
                                      className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-300 hover:text-red-400">
                                      <X className="w-3 h-3" />
                                    </button>
                                  )}
                                  {khDropMap[row.stt] && (khResultsMap[row.stt] || []).length > 0 && (
                                    <div className="absolute left-0 top-full mt-0.5 z-50 bg-white border border-teal-200 rounded shadow-lg max-h-40 overflow-y-auto min-w-[180px]">
                                      {(khResultsMap[row.stt] || []).map(kh => (
                                        <button key={kh.id} type="button"
                                          className="w-full text-left px-2 py-1 text-xs hover:bg-teal-50 text-gray-800"
                                          onMouseDown={() => {
                                            updateExcelRow(row.stt, 'khach_hang_id', String(kh.id));
                                            setKhSearchMap(m => ({ ...m, [row.stt]: kh.ten_cong_ty }));
                                            setKhDropMap(m => ({ ...m, [row.stt]: false }));
                                          }}>{kh.ten_cong_ty}</button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-gray-300 text-xs px-1.5">—</span>
                              )}
                            </td>
                            {/* NCC — chỉ tiền chi */}
                            <td className={`px-1 py-1 ${tagCellBg}`} style={{ minWidth: 160 }}>
                              {showDoiTuong && isChi ? (() => {
                                const nccName = nhaCungCapList.find(n => String(n.id) === row.nha_cung_cap_id)?.ten_nha_cung_cap || '';
                                const displayVal = nccSearchMap[row.stt] !== undefined ? nccSearchMap[row.stt] : nccName;
                                return (
                                  <div className="relative">
                                    <input type="text" value={displayVal}
                                      placeholder="Tìm NCC..."
                                      className="w-full text-xs px-1.5 py-1 border border-teal-200 rounded focus:outline-none focus:border-teal-500 bg-white"
                                      onChange={e => {
                                        const v = e.target.value;
                                        setNccSearchMap(m => ({ ...m, [row.stt]: v }));
                                        setNccDropMap(m => ({ ...m, [row.stt]: true }));
                                        if (!v) updateExcelRow(row.stt, 'nha_cung_cap_id', '');
                                        searchNccForRow(row.stt, v);
                                      }}
                                      onFocus={() => { setNccDropMap(m => ({ ...m, [row.stt]: true })); searchNccForRow(row.stt, nccSearchMap[row.stt] || nccName || ''); }}
                                      onBlur={() => setTimeout(() => setNccDropMap(m => ({ ...m, [row.stt]: false })), 200)}
                                    />
                                    {row.nha_cung_cap_id && (
                                      <button type="button" onClick={() => { updateExcelRow(row.stt, 'nha_cung_cap_id', ''); setNccSearchMap(m => ({ ...m, [row.stt]: '' })); }}
                                        className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-300 hover:text-red-400">
                                        <X className="w-3 h-3" />
                                      </button>
                                    )}
                                    {nccDropMap[row.stt] && (nccResultsMap[row.stt] || []).length > 0 && (
                                      <div className="absolute left-0 top-full mt-0.5 z-50 bg-white border border-teal-200 rounded shadow-lg max-h-40 overflow-y-auto min-w-[180px]">
                                        {(nccResultsMap[row.stt] || []).map(ncc => (
                                          <button key={ncc.id} type="button"
                                            className="w-full text-left px-2 py-1 text-xs hover:bg-teal-50 text-gray-800"
                                            onMouseDown={() => {
                                              updateExcelRow(row.stt, 'nha_cung_cap_id', String(ncc.id));
                                              setNccSearchMap(m => ({ ...m, [row.stt]: ncc.ten_nha_cung_cap }));
                                              setNccDropMap(m => ({ ...m, [row.stt]: false }));
                                            }}>{ncc.ten_nha_cung_cap}</button>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })() : <span className="text-gray-300 text-xs px-1.5">—</span>}
                            </td>
                            {/* Số HĐ */}
                            <td className={`px-1 py-1 ${tagCellBg}`} style={{ minWidth: 130 }}>
                              {showDoiTuong && (isThu || isChi) ? (
                                <div className="relative">
                                  <input
                                    type="text"
                                    value={hdSearchMap[row.stt] !== undefined ? hdSearchMap[row.stt] : hdSo}
                                    placeholder="Tìm số HĐ..."
                                    className="w-full text-xs px-1.5 py-1 border border-teal-200 rounded focus:outline-none focus:border-teal-500 bg-white"
                                    onChange={e => {
                                      const v = e.target.value;
                                      setHdSearchMap(m => ({ ...m, [row.stt]: v }));
                                      setHdDropMap(m => ({ ...m, [row.stt]: true }));
                                      if (!v) updateExcelRow(row.stt, 'hop_dong_id', '');
                                      searchHdForRow(row.stt, v, row.khach_hang_id);
                                    }}
                                    onFocus={() => {
                                      setHdDropMap(m => ({ ...m, [row.stt]: true }));
                                      searchHdForRow(row.stt, hdSearchMap[row.stt] || hdSo || '', row.khach_hang_id);
                                    }}
                                    onBlur={() => setTimeout(() => setHdDropMap(m => ({ ...m, [row.stt]: false })), 200)}
                                  />
                                  {row.hop_dong_id && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        updateExcelRow(row.stt, 'hop_dong_id', '');
                                        setHdSearchMap(m => ({ ...m, [row.stt]: '' }));
                                      }}
                                      className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-300 hover:text-red-400"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  )}
                                  {hdDropMap[row.stt] && (hdResultsMap[row.stt] || []).length > 0 && (
                                    <div className="absolute left-0 top-full mt-0.5 z-50 bg-white border border-teal-200 rounded shadow-lg max-h-48 overflow-y-auto w-[420px] max-w-[min(420px,calc(100vw-2rem))]">
                                      <table className="w-full table-fixed text-xs border-collapse">
                                        <thead className="sticky top-0 bg-teal-50 z-10">
                                          <tr className="border-b border-teal-100 text-[10px] font-semibold text-teal-700 uppercase">
                                            <th className="text-left px-2 py-1.5 w-[42%]">Số HĐ</th>
                                            <th className="text-left px-2 py-1.5 w-[58%]">Dự án</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {(hdResultsMap[row.stt] || []).map(hd => (
                                            <tr
                                              key={hd.id}
                                              className="border-b border-gray-50 last:border-0 hover:bg-teal-50 cursor-pointer"
                                              onMouseDown={() => {
                                                updateExcelRow(row.stt, 'hop_dong_id', String(hd.id));
                                                setHdSearchMap(m => ({ ...m, [row.stt]: hd.so_hop_dong }));
                                                setHdDropMap(m => ({ ...m, [row.stt]: false }));
                                              }}
                                            >
                                              <td className="px-2 py-1.5 align-top">
                                                <span
                                                  className="block font-medium text-teal-800 truncate"
                                                  title={hd.so_hop_dong}
                                                >
                                                  {hd.so_hop_dong}
                                                </span>
                                              </td>
                                              <td className="px-2 py-1.5 align-top text-gray-600">
                                                <span className="block break-words leading-tight" title={hd.ten_du_an || undefined}>
                                                  {hd.ten_du_an || '—'}
                                                </span>
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-gray-300 text-xs px-1.5">—</span>
                              )}
                            </td>
                            {/* Ghi chú */}
                            <td className={`px-1 py-1 ${tagCellBg}`} style={{ minWidth: 110 }}>
                              <input type="text" value={row.ghi_chu} onChange={e => updateExcelRow(row.stt, 'ghi_chu', e.target.value)}
                                className="w-full text-xs px-1.5 py-1 border border-teal-200 rounded focus:outline-none focus:border-teal-500 bg-white" placeholder="Ghi chú..." />
                            </td>
                            {/* Copy tag xuống */}
                            <td className={`px-1 py-1 text-center relative ${tagCellBg}`}>
                              {rowsBelow > 0 && (
                                <div className="relative inline-block" data-copy-down-root>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setCopyDownOpen(isCopyOpen ? null : row.stt);
                                    }}
                                    className="flex items-center gap-0.5 px-1.5 py-1 rounded text-xs font-medium bg-teal-100 text-teal-700 hover:bg-teal-200 transition-colors whitespace-nowrap"
                                  >
                                    Copy <ChevronDown className="w-3 h-3" />
                                  </button>
                                  {isCopyOpen && (
                                    <div
                                      className="absolute right-0 top-full mt-1 z-50 bg-white border border-teal-200 rounded-lg shadow-lg p-2 min-w-[160px]"
                                      onMouseDown={(e) => e.stopPropagation()}
                                    >
                                      <p className="text-[10px] text-gray-500 mb-1.5 font-medium">Copy tag xuống:</p>
                                      <button type="button" onMouseDown={() => copyTagsDown(idx, 1)} className="w-full text-left px-2 py-1 text-xs rounded hover:bg-teal-50 text-gray-700">1 dòng</button>
                                      {rowsBelow >= 3 && <button type="button" onMouseDown={() => copyTagsDown(idx, 3)} className="w-full text-left px-2 py-1 text-xs rounded hover:bg-teal-50 text-gray-700">3 dòng</button>}
                                      {rowsBelow >= 5 && <button type="button" onMouseDown={() => copyTagsDown(idx, 5)} className="w-full text-left px-2 py-1 text-xs rounded hover:bg-teal-50 text-gray-700">5 dòng</button>}
                                      <button type="button" onMouseDown={() => copyTagsDown(idx, rowsBelow)} className="w-full text-left px-2 py-1 text-xs rounded hover:bg-teal-50 text-teal-700 font-medium">Tất cả ({rowsBelow})</button>
                                      <hr className="my-1 border-gray-100" />
                                      <div className="flex items-center gap-1">
                                        <input type="number" min={1} max={rowsBelow} value={copyDownCount}
                                          onChange={e => setCopyDownCount(Math.max(1, Math.min(rowsBelow, Number(e.target.value))))}
                                          className="w-12 text-xs px-1.5 py-0.5 border border-gray-200 rounded focus:outline-none" />
                                        <button type="button" onMouseDown={() => copyTagsDown(idx, copyDownCount)} className="flex-1 text-xs px-1.5 py-0.5 bg-teal-600 text-white rounded hover:bg-teal-700">OK</button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="px-1 py-1 text-center">
                              <button onClick={() => setExcelRows(prev => prev.filter(r => r.stt !== row.stt))}
                                className="p-0.5 rounded text-gray-300 hover:text-red-500 hover:bg-red-50">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400">
                <div className="text-center">
                  <FileSpreadsheet className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Dán dữ liệu Excel và nhấn "Bóc tách" để bắt đầu</p>
                </div>
              </div>
            )}
          </div>

          <div className="flex-shrink-0 px-5 py-3 border-t border-gray-200 bg-gray-50 flex items-center gap-3">
            <button onClick={handleImportExcel} disabled={importing || validImportCount === 0 || !importTaiKhoanId}
              className="flex items-center gap-2 px-5 py-2 bg-teal-600 text-white rounded-lg text-sm font-bold hover:bg-teal-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
              <Save className="w-4 h-4" />
              {importing ? 'Đang nhập...' : validImportCount > 0 ? `Nhập ${validImportCount} giao dịch` : 'Nhập vào hệ thống'}
            </button>
            {!importTaiKhoanId && <span className="text-xs text-amber-600 font-medium">Vui lòng chọn tài khoản trước</span>}
            <button onClick={() => { setShowImport(false); setPasteText(''); setExcelRows([]); resetImportTagMaps(); clearImportDuplicateState(); }}
              className="ml-auto flex items-center gap-2 px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-100">
              <X className="w-4 h-4" /> Đóng
            </button>
          </div>
        </div>
      )}

      {/* ── Summary cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center flex-shrink-0">
            <ArrowUpRight className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Tổng thu</p>
            <p className="text-lg font-bold text-green-600">{formatVND(tongThu)}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
            <ArrowDownRight className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Tổng chi</p>
            <p className="text-lg font-bold text-red-600">{formatVND(tongChi)}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-sky-50 flex items-center justify-center flex-shrink-0">
            <Banknote className="w-5 h-5 text-sky-600" />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Dòng tiền thuần</p>
            <p className={`text-lg font-bold ${tongThu - tongChi >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
              {formatVND(tongThu - tongChi)}
            </p>
          </div>
        </div>
      </div>

      {/* ── Filters ────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200">
        <button className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors rounded-xl"
          onClick={() => setFiltersOpen(!filtersOpen)}>
          <span className="flex items-center gap-2">
            <Filter className="w-4 h-4" />
            Bộ lọc
            {hasActiveFilters && (
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary-600 text-white text-xs">
                {Object.values(filtersApplied).filter(v => v !== '').length}
              </span>
            )}
          </span>
          <ChevronDown className={`w-4 h-4 transition-transform ${filtersOpen ? 'rotate-180' : ''}`} />
        </button>
        {filtersOpen && (
          <div className="px-4 pb-4 border-t border-gray-100 space-y-4 pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Từ ngày</label>
                <input type="date" value={sanitizeInputDateValue(filters.dateFrom)} onChange={e => setFilters(f => ({ ...f, dateFrom: sanitizeInputDateValue(e.target.value) }))} className="input-field w-full" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Đến ngày</label>
                <input type="date" value={sanitizeInputDateValue(filters.dateTo)} onChange={e => setFilters(f => ({ ...f, dateTo: sanitizeInputDateValue(e.target.value) }))} className="input-field w-full" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Loại giao dịch</label>
                <select value={filters.loai_giao_dich} onChange={e => setFilters(f => ({ ...f, loai_giao_dich: e.target.value }))} className="select-field w-full">
                  <option value="">Tất cả</option>
                  <option value="thu">Thu</option>
                  <option value="chi">Chi</option>
                  <option value="chuyen_khoan_noi_bo">Chuyển khoản nội bộ</option>
                  <option value="dieu_chinh_so_du">Điều chỉnh số dư</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Tài khoản tiền</label>
                <select value={filters.tai_khoan_tien_id} onChange={e => setFilters(f => ({ ...f, tai_khoan_tien_id: e.target.value }))} className="select-field w-full">
                  <option value="">Tất cả</option>
                  {taiKhoanList.map(tk => <option key={tk.id} value={tk.id}>{tk.ten_tai_khoan}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Phạm vi</label>
                <select value={filters.pham_vi} onChange={e => setFilters(f => ({ ...f, pham_vi: e.target.value }))} className="select-field w-full">
                  <option value="">Tất cả</option>
                  <option value="cong_ty">Công ty</option>
                  <option value="ca_nhan">Cá nhân</option>
                  <option value="oto">Ô tô</option>
                  <option value="vay_no">Vay nợ</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Hạng mục</label>
                <select value={filters.hang_muc_thu_chi_id} onChange={e => setFilters(f => ({ ...f, hang_muc_thu_chi_id: e.target.value }))} className="select-field w-full">
                  <option value="">Tất cả</option>
                  {renderHangMucSelectOptions(buildHangMucOptions(hangMucList))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Khách hàng</label>
                <select value={filters.khach_hang_id} onChange={e => setFilters(f => ({ ...f, khach_hang_id: e.target.value }))} className="select-field w-full">
                  <option value="">Tất cả</option>
                  {khachHangList.map(kh => <option key={kh.id} value={kh.id}>{kh.ten_cong_ty}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Tìm kiếm</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <input type="text" value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
                    placeholder="Mô tả giao dịch..." className="input-field w-full pl-9" />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <button className="btn-primary text-sm" onClick={applyFilters}>Áp dụng</button>
              {hasActiveFilters && <button className="btn-secondary text-sm" onClick={clearFilters}>Xóa bộ lọc</button>}
            </div>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center">
          <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
        </div>
      )}

      {/* ── Transaction list ───────────────────────────────────────────────── */}
      {loading || data.length > 0 ? (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="px-2 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50 whitespace-nowrap">Ngày GD</th>
                  <th className="px-2 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50 whitespace-nowrap">Loại</th>
                  <th className="px-2 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50">Mô tả</th>
                  <th className="px-2 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50">Đối tượng</th>
                  <th className="px-2 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50 whitespace-nowrap">Hợp đồng</th>
                  <th className="px-2 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50 whitespace-nowrap">Tài khoản</th>
                  <th className="px-2 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50 whitespace-nowrap">Hạng mục</th>
                  <th className="px-2 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50 whitespace-nowrap">Phạm vi</th>
                  <th className="px-2 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50 text-right whitespace-nowrap">Thu</th>
                  <th className="px-2 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50 text-right whitespace-nowrap">Chi</th>
                  <th className="px-2 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50">Ghi chú</th>
                  {isAdmin() && <th className="px-2 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50 w-16"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan={12} className="py-12 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
                        <p className="text-sm text-gray-500">Đang tải...</p>
                      </div>
                    </td>
                  </tr>
                ) : data.map(row => {
                  const ckChieu = row.loai_giao_dich === 'chuyen_khoan_noi_bo'
                    ? resolveCkChieu(row, taiKhoanList, allFilteredRows)
                    : null;
                  const ckCounterpart = ckChieu
                    ? resolveCkCounterpartName(row, taiKhoanList, allFilteredRows, ckChieu)
                    : '';
                  return (
                  <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-2 py-1.5 text-xs text-gray-500 whitespace-nowrap">
                      {formatDateTime(row.ngay_giao_dich)}
                    </td>
                    <td className="px-2 py-1.5 text-xs whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${LOAI_GD_COLOR[row.loai_giao_dich]}`}>
                        {row.loai_giao_dich === 'thu' && <ArrowUpRight className="w-3 h-3" />}
                        {row.loai_giao_dich === 'chi' && <ArrowDownRight className="w-3 h-3" />}
                        {row.loai_giao_dich === 'chuyen_khoan_noi_bo' && <ArrowLeftRight className="w-3 h-3" />}
                        {row.loai_giao_dich === 'dieu_chinh_so_du' && <Settings2 className="w-3 h-3" />}
                        {LOAI_GD_LABEL[row.loai_giao_dich]}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-xs text-gray-900 max-w-[240px]">
                      <span className="font-medium leading-snug">{row.mo_ta_giao_dich || '--'}</span>
                      {row.loai_giao_dich === 'chuyen_khoan_noi_bo' && ckCounterpart && (
                        <div className={`mt-0.5 ${ckChieu === 'thu' ? 'text-green-600' : 'text-red-600'}`}>
                          {ckChieu === 'thu' ? '←' : '→'} {ckCounterpart}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-xs text-gray-700 max-w-[160px]">
                      {row.ten_cong_ty || row.ten_nha_cung_cap || row.ten_doi_tuong || '--'}
                    </td>
                    <td className="px-2 py-1.5 text-xs text-gray-600 whitespace-nowrap">
                      {row.so_hop_dong || row.so_hop_dong_mua || '--'}
                    </td>
                    <td className="px-2 py-1.5 text-xs text-gray-700 whitespace-nowrap">
                      {getTaiKhoanLabel(row.tai_khoan_tien_id)}
                    </td>
                    <td className="px-2 py-1.5 text-xs whitespace-nowrap">
                      {row.ten_hang_muc ? (
                        <span className="text-gray-600">{row.ten_hang_muc}</span>
                      ) : (
                        <span className="text-amber-500 italic">Chưa phân loại</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-xs whitespace-nowrap">
                      {row.pham_vi_hang_muc ? (
                        <span className={`inline-block px-1.5 py-0.5 rounded-full text-xs font-medium ${PHAM_VI_COLOR[row.pham_vi_hang_muc] || 'bg-gray-100 text-gray-600'}`}>
                          {PHAM_VI_LABEL[row.pham_vi_hang_muc] || row.pham_vi_hang_muc}
                        </span>
                      ) : '--'}
                    </td>
                    <td className="px-2 py-1.5 text-xs text-right whitespace-nowrap">
                      {row.loai_giao_dich === 'thu' || ckChieu === 'thu'
                        ? <span className="font-semibold text-green-600">{formatVND(row.so_tien)}</span>
                        : <span className="text-gray-300">--</span>}
                    </td>
                    <td className="px-2 py-1.5 text-xs text-right whitespace-nowrap">
                      {row.loai_giao_dich === 'chi' || ckChieu === 'chi'
                        ? <span className="font-semibold text-red-600">{formatVND(row.so_tien)}</span>
                        : <span className="text-gray-300">--</span>}
                    </td>
                    <td className="px-2 py-1.5 text-xs text-gray-500 max-w-[140px]">
                      {row.ghi_chu || '--'}
                    </td>
                    {isAdmin() && (
                      <td className="px-2 py-1.5 text-xs">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEditModal(row)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-colors" title="Sửa">
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button onClick={() => setDeleteTarget(row)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Xóa">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
          )}
        </div>
      ) : (
        <EmptyState
          icon={Banknote}
          title="Chưa có giao dịch"
          description="Bắt đầu thêm giao dịch thu chi để quản lý dòng tiền"
          action={{ label: 'Thêm giao dịch', onClick: openAddModal }}
        />
      )}

      {/* ── Add/Edit Modal ─────────────────────────────────────────────────── */}
      <Modal
        open={modalOpen}
        onOpenChange={setModalOpen}
        title={editingId ? 'Sửa giao dịch' : 'Thêm giao dịch'}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setModalOpen(false)} disabled={saving}>Hủy</button>
            <button className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu'}</button>
          </>
        }
      >
        <div className="space-y-4">
          {/* Loại giao dịch */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Loại giao dịch <span className="text-red-500">*</span></label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(['thu', 'chi', 'chuyen_khoan_noi_bo', 'dieu_chinh_so_du'] as LoaiGiaoDich[]).map(loai => (
                <button key={loai} type="button"
                  onClick={() => setForm(f => ({ ...f, loai_giao_dich: loai, hang_muc_thu_chi_id: '', tai_khoan_nhan_id: '' }))}
                  className={`flex flex-col items-center gap-1 px-3 py-2.5 rounded-lg border-2 text-xs font-medium transition-colors ${form.loai_giao_dich === loai
                    ? loai === 'thu' ? 'border-green-500 bg-green-50 text-green-700'
                      : loai === 'chi' ? 'border-red-500 bg-red-50 text-red-700'
                        : loai === 'chuyen_khoan_noi_bo' ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-amber-500 bg-amber-50 text-amber-700'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                  {loai === 'thu' && <ArrowUpRight className="w-4 h-4" />}
                  {loai === 'chi' && <ArrowDownRight className="w-4 h-4" />}
                  {loai === 'chuyen_khoan_noi_bo' && <ArrowLeftRight className="w-4 h-4" />}
                  {loai === 'dieu_chinh_so_du' && <Settings2 className="w-4 h-4" />}
                  {LOAI_GD_LABEL[loai]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Ngày giao dịch */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ngày giao dịch <span className="text-red-500">*</span></label>
              <input type="date" value={sanitizeInputDateValue(form.ngay_giao_dich) || getTodayInputValue()}
                onChange={e => setForm(f => ({ ...f, ngay_giao_dich: sanitizeInputDateValue(e.target.value) || getTodayInputValue() }))} className="input-field w-full" />
            </div>

            {/* Số tiền */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Số tiền <span className="text-red-500">*</span></label>
              <NumInput
                value={form.so_tien}
                onChange={(v) => setForm(f => ({ ...f, so_tien: v }))}
                className="input-field w-full text-right"
                min={0}
                isInteger
                format="money"
              />
            </div>
          </div>

          <div className={`grid grid-cols-1 gap-4 ${form.loai_giao_dich === 'chuyen_khoan_noi_bo' ? 'sm:grid-cols-2' : ''}`}>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {form.loai_giao_dich === 'chuyen_khoan_noi_bo' ? 'Tài khoản nguồn' : 'Tài khoản tiền'} <span className="text-red-500">*</span>
              </label>
              <select value={form.tai_khoan_tien_id}
                onChange={e => {
                  const newTkId = e.target.value;
                  const newTk = taiKhoanList.find(t => String(t.id) === newTkId);
                  setForm((f) => {
                    const stillValid = !f.hang_muc_thu_chi_id || filterHangMucForContext(
                      hangMucList, f.loai_giao_dich, newTk?.pham_vi, f.hang_muc_thu_chi_id,
                    ).some(h => String(h.id) === f.hang_muc_thu_chi_id);
                    return {
                      ...f,
                      tai_khoan_tien_id: newTkId,
                      hang_muc_thu_chi_id: stillValid ? f.hang_muc_thu_chi_id : '',
                      ...(stillValid ? {} : { khach_hang_id: '', hop_dong_id: '', nha_cung_cap_id: '', hop_dong_mua_id: '' }),
                    };
                  });
                }}
                className="select-field w-full">
                <option value="">-- Chọn tài khoản --</option>
                {taiKhoanList.map(tk => <option key={tk.id} value={tk.id}>{tk.ten_tai_khoan}</option>)}
              </select>
            </div>

            {form.loai_giao_dich === 'chuyen_khoan_noi_bo' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tài khoản nhận</label>
                <select value={form.tai_khoan_nhan_id}
                  onChange={e => setForm(f => ({ ...f, tai_khoan_nhan_id: e.target.value }))} className="select-field w-full">
                  <option value="">-- Chọn tài khoản nhận --</option>
                  {taiKhoanList.filter(tk => String(tk.id) !== form.tai_khoan_tien_id).map(tk => (
                    <option key={tk.id} value={tk.id}>{tk.ten_tai_khoan}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Hạng mục thu chi</label>
              <select value={form.hang_muc_thu_chi_id}
                onChange={e => {
                  const v = e.target.value;
                  setForm((f) => {
                    const wasShow = showDoiTuongTagFields(f.hang_muc_thu_chi_id, hangMucList);
                    const nowShow = showDoiTuongTagFields(v, hangMucList);
                    const isCk = isHangMucChuyenKhoanNoiBo(v, hangMucList);
                    const leavingCk = f.loai_giao_dich === 'chuyen_khoan_noi_bo' && !isCk;
                    return {
                      ...f,
                      hang_muc_thu_chi_id: v,
                      loai_giao_dich: isCk
                        ? 'chuyen_khoan_noi_bo'
                        : leavingCk
                          ? 'chi'
                          : f.loai_giao_dich,
                      ...(leavingCk ? { tai_khoan_nhan_id: '' } : {}),
                      ...(wasShow !== nowShow
                        ? { khach_hang_id: '', hop_dong_id: '', nha_cung_cap_id: '', hop_dong_mua_id: '' }
                        : {}),
                    };
                  });
                }}
                className="select-field w-full">
                <option value="">-- Chọn hạng mục --</option>
                {renderHangMucSelectOptions(hangMucOptions, 2)}
              </select>
              {isPersonalTaiKhoan && form.loai_giao_dich === 'thu' && (
                <p className="mt-1 text-xs text-violet-600">
                  Tài khoản cá nhân: ưu tiên Vay nợ / Thu khác / Chuyển khoản nội bộ
                </p>
              )}
              {isPersonalTaiKhoan && form.loai_giao_dich === 'chi' && (
                <p className="mt-1 text-xs text-violet-600">
                  Tài khoản cá nhân: ưu tiên Chi phí cá nhân, Chi phí ô tô, Chuyển khoản nội bộ
                </p>
              )}
              {hangMucOptions.length === 0 && (
                <p className="mt-1 text-xs text-amber-600">Chưa có hạng mục phù hợp — hãy chọn loại giao dịch và tài khoản</p>
              )}
          </div>

          {/* Mô tả */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả giao dịch</label>
            <input type="text" value={form.mo_ta_giao_dich}
              onChange={e => setForm(f => ({ ...f, mo_ta_giao_dich: e.target.value }))}
              className="input-field w-full" placeholder="Nhập mô tả..." />
          </div>

          {/* Đối tượng — theo loại giao dịch và hạng mục */}
          {form.loai_giao_dich === 'thu' && showKhHopDongThu && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Khách hàng</label>
                <select value={form.khach_hang_id}
                  onChange={e => setForm(f => ({ ...f, khach_hang_id: e.target.value, hop_dong_id: '' }))} className="select-field w-full">
                  <option value="">-- Khách hàng --</option>
                  {khachHangList.map(kh => <option key={kh.id} value={kh.id}>{kh.ten_cong_ty}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Hợp đồng bán</label>
                <select value={form.hop_dong_id}
                  onChange={e => setForm(f => ({ ...f, hop_dong_id: e.target.value }))} className="select-field w-full">
                  <option value="">-- Hợp đồng --</option>
                  {hopDongFiltered.map(hd => <option key={hd.id} value={hd.id}>{hd.so_hop_dong}</option>)}
                </select>
              </div>
            </div>
          )}

          {form.loai_giao_dich === 'chi' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {showKhHopDongChi && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Khách hàng</label>
                    <select value={form.khach_hang_id}
                      onChange={e => setForm(f => ({ ...f, khach_hang_id: e.target.value, hop_dong_id: '' }))} className="select-field w-full">
                      <option value="">-- Khách hàng --</option>
                      {khachHangList.map(kh => <option key={kh.id} value={kh.id}>{kh.ten_cong_ty}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Hợp đồng bán</label>
                    <select value={form.hop_dong_id}
                      onChange={e => setForm(f => ({ ...f, hop_dong_id: e.target.value }))} className="select-field w-full">
                      <option value="">-- Hợp đồng --</option>
                      {hopDongFiltered.map(hd => <option key={hd.id} value={hd.id}>{hd.so_hop_dong}</option>)}
                    </select>
                  </div>
                </>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nhà cung cấp</label>
                <select value={form.nha_cung_cap_id}
                  onChange={e => setForm(f => ({
                    ...f,
                    nha_cung_cap_id: e.target.value,
                    hop_dong_mua_id: showKhHopDongChi ? f.hop_dong_mua_id : '',
                  }))} className="select-field w-full">
                  <option value="">-- Nhà cung cấp --</option>
                  {nhaCungCapList.map(ncc => <option key={ncc.id} value={ncc.id}>{ncc.ten_nha_cung_cap}</option>)}
                </select>
              </div>
              {!showKhHopDongChi && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Hợp đồng mua</label>
                  <select value={form.hop_dong_mua_id}
                    onChange={e => setForm(f => ({ ...f, hop_dong_mua_id: e.target.value }))} className="select-field w-full">
                    <option value="">-- Hợp đồng mua --</option>
                    {hopDongMuaList.filter(hdm => !form.nha_cung_cap_id || String(hdm.nha_cung_cap_id) === form.nha_cung_cap_id).map(hdm => (
                      <option key={hdm.id} value={hdm.id}>{hdm.so_hop_dong}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* TK đối ứng */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Số TK đối ứng</label>
              <input type="text" value={form.so_tai_khoan_doi_ung}
                onChange={e => setForm(f => ({ ...f, so_tai_khoan_doi_ung: e.target.value }))}
                className="input-field w-full" placeholder="Số tài khoản..." />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Chủ TK đối ứng</label>
              <input type="text" value={form.ten_tai_khoan_doi_ung}
                onChange={e => setForm(f => ({ ...f, ten_tai_khoan_doi_ung: e.target.value }))}
                className="input-field w-full" placeholder="Tên chủ tài khoản..." />
            </div>
          </div>

          {/* Ghi chú – bắt buộc khi dieu_chinh_so_du */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Ghi chú {form.loai_giao_dich === 'dieu_chinh_so_du' && <span className="text-red-500">* (bắt buộc lý do)</span>}
            </label>
            <textarea value={form.ghi_chu}
              onChange={e => setForm(f => ({ ...f, ghi_chu: e.target.value }))}
              className="input-field w-full" rows={2} placeholder="Ghi chú (tùy chọn)" />
          </div>

          {/* Trạng thái */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Trạng thái</label>
            <select value={form.trang_thai} onChange={e => setForm(f => ({ ...f, trang_thai: e.target.value }))} className="select-field w-full">
              <option value="hoan_thanh">Hoàn thành</option>
              <option value="cho_doi_soat">Chờ đối soát</option>
              <option value="loi">Lỗi</option>
            </select>
          </div>
        </div>
      </Modal>

      {/* ── Import duplicate dialog ────────────────────────────────────────── */}
      <Modal
        open={importDupDialogOpen}
        onOpenChange={open => { if (!open) setImportDupDialogOpen(false); }}
        title="Phát hiện giao dịch trùng"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setImportDupDialogOpen(false)}>
              Quay lại sửa
            </button>
            <button
              className="btn-primary"
              onClick={handleImportSkipDuplicates}
              disabled={importing || importSaveableCount === 0}
            >
              {importing
                ? 'Đang lưu...'
                : importSaveableCount > 0
                  ? `Loại bỏ ${importDuplicates.length} trùng, lưu ${importSaveableCount} giao dịch`
                  : 'Không có giao dịch để lưu'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Có <span className="font-semibold text-amber-700">{importDuplicates.length}</span> giao dịch trùng
            (<strong>tất cả các cột sao kê</strong> giống hệt dữ liệu đã có hoặc dòng khác trong danh sách).
            Bạn có thể <span className="font-medium">quay lại sửa</span> hoặc{' '}
            <span className="font-medium">loại bỏ các giao dịch trùng</span> rồi lưu phần còn lại.
          </p>
          <div className="max-h-52 overflow-y-auto rounded-lg border border-amber-200 bg-amber-50/50 divide-y divide-amber-100">
            {importDuplicates.map(d => (
              <div key={d.stt} className="px-3 py-2 text-xs">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-gray-700">Dòng {d.stt}</span>
                  <span className="font-mono text-teal-800 bg-teal-50 px-1.5 py-0.5 rounded">{d.ma_giao_dich_ngan_hang}</span>
                  <span className="text-gray-500">{d.ngay_gd}</span>
                  <span className="font-medium text-gray-800">{formatVND(d.so_tien)}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    d.reason === 'he_thong' ? 'bg-orange-100 text-orange-700' : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {d.reason === 'he_thong' ? 'Đã có trong hệ thống' : 'Trùng trong danh sách'}
                  </span>
                </div>
                <p className="mt-0.5 text-gray-600 truncate" title={d.dien_giai}>{d.dien_giai}</p>
              </div>
            ))}
          </div>
        </div>
      </Modal>

      {/* ── Delete Dialog ──────────────────────────────────────────────────── */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={open => { if (!open) setDeleteTarget(null); }}
        title="Xóa giao dịch"
        description={`Bạn có chắc muốn xóa giao dịch "${deleteTarget?.mo_ta_giao_dich}"? Hành động này không thể hoàn tác.`}
        onConfirm={handleDelete}
        confirmText="Xóa"
        cancelText="Hủy"
        variant="danger"
      />
    </div>
  );
}
