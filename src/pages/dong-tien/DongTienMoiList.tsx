import { useState, useEffect, useCallback, useRef } from 'react';
import {
  dongTienMoiApi, taiKhoanTienApi, hangMucThuChiApi,
  khachHangApi, nhaCungCapApi, hopDongApi, hopDongMuaApi,
} from '../../lib/api';
import { useToastStore } from '../../store/toast';
import { useAuthStore } from '../../store/auth';
import { formatVND, formatDate, toInputDateValue, getTodayInputValue } from '../../lib/utils';
import Modal from '../../components/ui/Modal';
import Pagination from '../../components/ui/Pagination';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import EmptyState from '../../components/ui/EmptyState';
import {
  Plus, Pencil, Trash2, Filter, Banknote, Search,
  ArrowUpRight, ArrowDownRight, ArrowLeftRight, Settings2,
  ChevronDown, X, RefreshCw, FileSpreadsheet, Save,
} from 'lucide-react';
import type {
  TaiKhoanTien, HangMucThuChi, DongTienMoi,
  KhachHang, NhaCungCap, HopDong, HopDongMua, LoaiGiaoDich,
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
// Returns [{groupLabel, items: [{id, label, indent}]}]
function buildHangMucOptions(list: HangMucThuChi[]): { id: number; label: string; indent: number }[] {
  const byParent: Record<number | string, HangMucThuChi[]> = {};
  for (const hm of list) {
    const key = hm.parent_id ?? 'root';
    if (!byParent[key]) byParent[key] = [];
    byParent[key].push(hm);
  }
  const result: { id: number; label: string; indent: number }[] = [];
  function walk(parentId: number | 'root', depth: number) {
    const children = byParent[parentId] || [];
    for (const hm of children) {
      result.push({ id: hm.id, label: hm.ten_hang_muc, indent: depth });
      walk(hm.id, depth + 1);
    }
  }
  walk('root', 0);
  return result;
}

// ─── Excel import types ───────────────────────────────────────────────────────
interface ExcelRow {
  stt: number;
  ngay_gd: string;
  ngay_iso: string;
  dien_giai: string;
  ghi_no: number;  // debit from bank = chi
  ghi_co: number;  // credit from bank = thu
  so_du: number;
  tk_doi_ung: string;
  chu_tk: string;
  valid: boolean;
  error?: string;
  khach_hang_id: string;
  nha_cung_cap_id: string;
  hop_dong_id: string;
  hang_muc_thu_chi_id: string;
  ghi_chu: string;
}

function parseExcelNum(s: string): number {
  if (!s || !s.trim()) return 0;
  const raw = s.trim();
  const stripped = raw.replace(/[^\d\-.,]/g, '');
  if (!stripped) return 0;
  const lastComma = stripped.lastIndexOf(',');
  const lastDot = stripped.lastIndexOf('.');
  let normalized: string;
  if (lastDot === -1 && lastComma === -1) {
    normalized = stripped;
  } else if (lastDot === -1) {
    const afterLastComma = stripped.slice(lastComma + 1);
    normalized = afterLastComma.length <= 2
      ? stripped.replace(/,/g, '.').replace(/(\.)(?=.*\.)/g, '')
      : stripped.replace(/,/g, '');
  } else if (lastComma === -1) {
    const afterLastDot = stripped.slice(lastDot + 1);
    normalized = afterLastDot.length === 3 && stripped.indexOf('.') !== lastDot
      ? stripped.replace(/\./g, '')
      : stripped;
  } else if (lastComma > lastDot) {
    normalized = stripped.replace(/\./g, '').replace(',', '.');
  } else {
    normalized = stripped.replace(/,/g, '');
  }
  const n = parseFloat(normalized);
  return isNaN(n) ? 0 : n;
}

function parseExcelDate(s: string): string {
  if (!s || !s.trim()) return '';
  const trimmed = s.trim();
  const dmyMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  return '';
}

function parseExcelPaste(text: string): ExcelRow[] {
  const lines = text.trim().split('\n').filter(l => l.trim());
  const rows: ExcelRow[] = [];
  let stt = 1;
  for (const line of lines) {
    const cols = line.split('\t');
    if (cols.length < 3) continue;
    const ngayGD = (cols[0] || '').trim();
    const dienGiai = (cols[2] || cols[1] || '').trim();
    const ghiNo = parseExcelNum(cols[3] || '');
    const ghiCo = parseExcelNum(cols[4] || '');
    const soDu = parseExcelNum(cols[5] || '');
    const tkDoiUng = (cols[6] || '').trim();
    const chuTK = (cols[7] || '').trim();
    const ngayISO = parseExcelDate(ngayGD);
    if (!dienGiai && ghiNo === 0 && ghiCo === 0) continue;
    if (!ngayISO && !dienGiai) continue;
    const valid = !!ngayISO && !!dienGiai && (ghiNo > 0 || ghiCo > 0);
    rows.push({
      stt: stt++, ngay_gd: ngayGD, ngay_iso: ngayISO,
      dien_giai: dienGiai, ghi_no: ghiNo, ghi_co: ghiCo, so_du: soDu,
      tk_doi_ung: tkDoiUng, chu_tk: chuTK, valid,
      error: !ngayISO ? 'Ngày không hợp lệ' : !dienGiai ? 'Thiếu diễn giải' : ghiNo === 0 && ghiCo === 0 ? 'Không có số tiền' : undefined,
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
  so_tien: string;
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
  so_tien: '',
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

  // ── Filtered hang muc by loai_giao_dich ───────────────────────────────────
  const hangMucFiltered = hangMucList.filter(hm => {
    if (form.loai_giao_dich === 'chuyen_khoan_noi_bo') return hm.loai_giao_dich === 'chuyen_khoan_noi_bo' || hm.loai_giao_dich === 'tat_ca';
    if (form.loai_giao_dich === 'dieu_chinh_so_du') return hm.loai_giao_dich === 'dieu_chinh_so_du' || hm.loai_giao_dich === 'tat_ca';
    return hm.loai_giao_dich === form.loai_giao_dich || hm.loai_giao_dich === 'tat_ca';
  });
  const hangMucOptions = buildHangMucOptions(hangMucFiltered);

  // ── Filtered hop dong by khach hang ───────────────────────────────────────
  const hopDongFiltered = form.khach_hang_id
    ? hopDongList.filter(hd => String((hd as any).khach_hang_id) === form.khach_hang_id)
    : hopDongList;

  // ── Excel import ───────────────────────────────────────────────────────────
  const [showImport, setShowImport] = useState(false);
  const [importTaiKhoanId, setImportTaiKhoanId] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [excelRows, setExcelRows] = useState<ExcelRow[]>([]);
  const [importing, setImporting] = useState(false);
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

  // ── Load master data ───────────────────────────────────────────────────────
  useEffect(() => {
    taiKhoanTienApi.list().then(({ data }) => setTaiKhoanList((data as TaiKhoanTien[]) ?? [])).catch(console.error);
    hangMucThuChiApi.list().then(({ data }) => setHangMucList((data as HangMucThuChi[]) ?? [])).catch(console.error);
    khachHangApi.list({ limit: 1000 }).then(({ data }) => setKhachHangList((data as KhachHang[]) ?? [])).catch(console.error);
    nhaCungCapApi.list().then(({ data }) => setNhaCungCapList((data as NhaCungCap[]) ?? [])).catch(console.error);
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

      const { data: rows, total } = await dongTienMoiApi.list(params);
      setData(rows as DongTienMoi[]);
      setTotalCount(total);

      // Summary: fetch all for current filters (no pagination)
      const allParams = { ...params };
      delete allParams.page;
      delete allParams.limit;
      allParams.limit = 99999;
      const { data: allRows } = await dongTienMoiApi.list(allParams);
      setTongThu(allRows.reduce((s, r) => s + (r.loai_giao_dich === 'thu' ? Number(r.so_tien) : 0), 0));
      setTongChi(allRows.reduce((s, r) => s + (r.loai_giao_dich === 'chi' ? Number(r.so_tien) : 0), 0));
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
    setForm({
      loai_giao_dich: row.loai_giao_dich,
      ngay_giao_dich: toInputDateValue(row.ngay_giao_dich) || getTodayInputValue(),
      tai_khoan_tien_id: String(row.tai_khoan_tien_id),
      tai_khoan_nhan_id: row.tai_khoan_nhan_id ? String(row.tai_khoan_nhan_id) : '',
      so_tien: String(row.so_tien),
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
    if (!form.tai_khoan_tien_id) { addToast('warning', 'Vui lòng chọn tài khoản tiền'); return; }
    if (!form.so_tien || Number(form.so_tien) <= 0) { addToast('warning', 'Số tiền phải lớn hơn 0'); return; }
    if (!form.ngay_giao_dich) { addToast('warning', 'Vui lòng nhập ngày giao dịch'); return; }
    if (form.loai_giao_dich === 'chuyen_khoan_noi_bo' && !form.tai_khoan_nhan_id) {
      addToast('warning', 'Vui lòng chọn tài khoản nhận'); return;
    }
    if (form.loai_giao_dich === 'dieu_chinh_so_du' && !form.ghi_chu.trim()) {
      addToast('warning', 'Điều chỉnh số dư cần có ghi chú lý do'); return;
    }

    setSaving(true);
    try {
      const payload = {
        loai_giao_dich: form.loai_giao_dich,
        ngay_giao_dich: form.ngay_giao_dich,
        tai_khoan_tien_id: Number(form.tai_khoan_tien_id),
        tai_khoan_nhan_id: form.tai_khoan_nhan_id ? Number(form.tai_khoan_nhan_id) : null,
        so_tien: Number(form.so_tien),
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
  function handleParsePaste() {
    if (!pasteText.trim()) { addToast('warning', 'Vui lòng dán dữ liệu Excel'); return; }
    const rows = parseExcelPaste(pasteText);
    if (rows.length === 0) { addToast('warning', 'Không tìm thấy dữ liệu hợp lệ'); return; }
    setExcelRows(rows);
    addToast('success', `Đã bóc tách ${rows.length} dòng`);
  }

  function updateExcelRow(stt: number, field: keyof ExcelRow, value: string) {
    setExcelRows(prev => prev.map(r => {
      if (r.stt !== stt) return r;
      const updated = { ...r, [field]: value };
      if (field === 'khach_hang_id') updated.hop_dong_id = '';
      return updated;
    }));
  }

  async function handleImportExcel() {
    if (!importTaiKhoanId) { addToast('warning', 'Vui lòng chọn tài khoản'); return; }
    const validRows = excelRows.filter(r => r.valid);
    if (validRows.length === 0) { addToast('warning', 'Không có dòng hợp lệ'); return; }
    setImporting(true);
    let ok = 0, skipped = 0, err = 0;
    try {
      // Load all existing transactions for this account in the date range of the import
      // to check for duplicates locally (avoids per-row API calls and format issues)
      const dates = validRows.map(r => r.ngay_iso).filter(Boolean).sort();
      const dateFrom = dates[0];
      const dateTo = dates[dates.length - 1];
      const existing = await dongTienMoiApi.list({
        tai_khoan_tien_id: importTaiKhoanId,
        date_from: dateFrom,
        date_to: dateTo,
        limit: 9999,
      });
      // Build a Set of "so_tien|mo_ta_giao_dich" keys for fast lookup
      const existingKeys = new Set(
        (existing.data || []).map((d: any) =>
          `${Number(d.so_tien)}|${(d.mo_ta_giao_dich || '').trim().toLowerCase()}`
        )
      );

      for (const row of validRows) {
        try {
          const loaiGD: LoaiGiaoDich = row.ghi_co > 0 ? 'thu' : 'chi';
          const soTien = row.ghi_co > 0 ? row.ghi_co : row.ghi_no;
          const dupKey = `${soTien}|${row.dien_giai.trim().toLowerCase()}`;
          if (existingKeys.has(dupKey)) {
            skipped++;
            continue;
          }

          await dongTienMoiApi.create({
            loai_giao_dich: loaiGD,
            ngay_giao_dich: row.ngay_gd,
            tai_khoan_tien_id: Number(importTaiKhoanId),
            so_tien: soTien,
            mo_ta_giao_dich: row.dien_giai,
            so_tai_khoan_doi_ung: row.tk_doi_ung || null,
            ten_tai_khoan_doi_ung: row.chu_tk || null,
            khach_hang_id: row.khach_hang_id ? Number(row.khach_hang_id) : null,
            nha_cung_cap_id: row.nha_cung_cap_id ? Number(row.nha_cung_cap_id) : null,
            hop_dong_id: row.hop_dong_id ? Number(row.hop_dong_id) : null,
            hang_muc_thu_chi_id: row.hang_muc_thu_chi_id ? Number(row.hang_muc_thu_chi_id) : null,
            ghi_chu: row.ghi_chu.trim() || null,
            nguon_du_lieu: 'import_excel',
          });
          // Add to existing keys so subsequent rows in the same import don't re-insert
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
      setShowImport(false); setPasteText(''); setExcelRows([]); setImportTaiKhoanId('');
      fetchData();
    } catch {
      addToast('error', 'Lỗi khi nhập dữ liệu');
    } finally {
      setImporting(false);
    }
  }

  const validImportCount = excelRows.filter(r => r.valid).length;

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
        <div className="flex items-center gap-2">
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
            <button onClick={() => { setShowImport(false); setPasteText(''); setExcelRows([]); }} className="text-teal-100 hover:text-white p-1">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-shrink-0 px-5 py-4 border-b border-gray-200 bg-gray-50 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 items-start">
              <div>
                <label className="block text-sm font-semibold text-teal-700 mb-1.5">1. Chọn tài khoản <span className="text-red-500">*</span></label>
                <select value={importTaiKhoanId} onChange={e => setImportTaiKhoanId(e.target.value)}
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
                <span>Cột: <strong>Ngày GD · Ngày GT · Diễn giải · Nợ · Có · Số dư · TK đối ứng · Chủ TK</strong></span>
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
                  <button onClick={() => { setPasteText(''); setExcelRows([]); }}
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
                        <th className="px-2 py-2 w-44 text-left bg-teal-700">KHÁCH HÀNG</th>
                        <th className="px-2 py-2 w-44 text-left bg-teal-700">NHÀ CUNG CẤP</th>
                        <th className="px-2 py-2 w-32 text-left bg-teal-700">HỢP ĐỒNG</th>
                        <th className="px-2 py-2 w-44 text-left bg-teal-700">HẠNG MỤC</th>
                        <th className="px-2 py-2 w-28 text-left bg-teal-700">GHI CHÚ</th>
                        <th className="px-2 py-2 w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {excelRows.map(row => {
                        const hopDongForRow = row.khach_hang_id
                          ? hopDongList.filter(hd => String((hd as any).khach_hang_id) === row.khach_hang_id)
                          : hopDongList;
                        const khName = khachHangList.find(k => String(k.id) === row.khach_hang_id)?.ten_cong_ty || '';
                        const hmForRow = hangMucList.filter(hm => hm.loai_giao_dich !== 'chuyen_khoan_noi_bo');
                        const hmOptions = buildHangMucOptions(hmForRow);
                        return (
                          <tr key={row.stt} className={!row.valid ? 'bg-red-50' : 'hover:bg-gray-50'}>
                            <td className="px-2 py-1 text-center text-gray-500">{row.stt}</td>
                            <td className="px-2 py-1 whitespace-nowrap">
                              <span className={`text-xs font-medium ${row.ngay_iso ? 'text-teal-700' : 'text-red-500'}`}>
                                {row.ngay_gd || '—'}
                              </span>
                            </td>
                            <td className="px-2 py-1" style={{ maxWidth: 224 }}>
                              <div className="text-gray-800 break-words leading-tight">{row.dien_giai || <span className="italic text-red-400">Trống</span>}</div>
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
                            {/* KH */}
                            <td className="px-1 py-1 bg-teal-50" style={{ minWidth: 160 }}>
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
                            </td>
                            {/* NCC - chỉ hiện cho giao dịch chi */}
                            <td className="px-1 py-1 bg-teal-50" style={{ minWidth: 160 }}>
                              {row.ghi_no > 0 ? (() => {
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
                            {/* HĐ */}
                            <td className="px-1 py-1 bg-teal-50" style={{ minWidth: 120 }}>
                              <select value={row.hop_dong_id} onChange={e => updateExcelRow(row.stt, 'hop_dong_id', e.target.value)}
                                className="w-full text-xs px-1.5 py-1 border border-teal-200 rounded focus:outline-none focus:border-teal-500 bg-white">
                                <option value="">- HĐ -</option>
                                {hopDongForRow.map(hd => <option key={hd.id} value={hd.id}>{hd.so_hop_dong}</option>)}
                              </select>
                            </td>
                            {/* Hạng mục */}
                            <td className="px-1 py-1 bg-teal-50" style={{ minWidth: 160 }}>
                              <select value={row.hang_muc_thu_chi_id} onChange={e => updateExcelRow(row.stt, 'hang_muc_thu_chi_id', e.target.value)}
                                className="w-full text-xs px-1.5 py-1 border border-teal-200 rounded focus:outline-none focus:border-teal-500 bg-white">
                                <option value="">- Hạng mục -</option>
                                {hmOptions.map(o => (
                                  <option key={o.id} value={o.id}>{'\u00A0'.repeat(o.indent * 2)}{o.label}</option>
                                ))}
                              </select>
                            </td>
                            {/* Ghi chú */}
                            <td className="px-1 py-1 bg-teal-50" style={{ minWidth: 110 }}>
                              <input type="text" value={row.ghi_chu} onChange={e => updateExcelRow(row.stt, 'ghi_chu', e.target.value)}
                                className="w-full text-xs px-1.5 py-1 border border-teal-200 rounded focus:outline-none focus:border-teal-500 bg-white" placeholder="Ghi chú..." />
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
            <button onClick={() => { setShowImport(false); setPasteText(''); setExcelRows([]); }}
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
                <input type="date" value={filters.dateFrom} onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))} className="input-field w-full" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Đến ngày</label>
                <input type="date" value={filters.dateTo} onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))} className="input-field w-full" />
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
                  {buildHangMucOptions(hangMucList).map(o => (
                    <option key={o.id} value={o.id}>{'\u00A0'.repeat(o.indent * 2)}{o.label}</option>
                  ))}
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
                ) : data.map(row => (
                  <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-2 py-1.5 text-xs text-gray-500 whitespace-nowrap">
                      {formatDate(row.ngay_giao_dich)}
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
                      {row.loai_giao_dich === 'chuyen_khoan_noi_bo' && row.ten_tai_khoan_nhan && (
                        <div className="text-blue-600 mt-0.5">→ {row.ten_tai_khoan_nhan}</div>
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
                      {row.loai_giao_dich === 'thu'
                        ? <span className="font-semibold text-green-600">{formatVND(row.so_tien)}</span>
                        : <span className="text-gray-300">--</span>}
                    </td>
                    <td className="px-2 py-1.5 text-xs text-right whitespace-nowrap">
                      {row.loai_giao_dich === 'chi'
                        ? <span className="font-semibold text-red-600">{formatVND(row.so_tien)}</span>
                        : row.loai_giao_dich === 'chuyen_khoan_noi_bo'
                          ? <span className="font-semibold text-blue-600">{formatVND(row.so_tien)}</span>
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
                ))}
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
              <input type="date" value={form.ngay_giao_dich}
                onChange={e => setForm(f => ({ ...f, ngay_giao_dich: e.target.value }))} className="input-field w-full" />
            </div>

            {/* Số tiền */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Số tiền <span className="text-red-500">*</span></label>
              <input type="number" value={form.so_tien} min={0}
                onChange={e => setForm(f => ({ ...f, so_tien: e.target.value }))}
                className="input-field w-full" placeholder="0" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Tài khoản tiền */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {form.loai_giao_dich === 'chuyen_khoan_noi_bo' ? 'Tài khoản nguồn' : 'Tài khoản tiền'} <span className="text-red-500">*</span>
              </label>
              <select value={form.tai_khoan_tien_id}
                onChange={e => setForm(f => ({ ...f, tai_khoan_tien_id: e.target.value }))} className="select-field w-full">
                <option value="">-- Chọn tài khoản --</option>
                {taiKhoanList.map(tk => <option key={tk.id} value={tk.id}>{tk.ten_tai_khoan}</option>)}
              </select>
            </div>

            {/* Tài khoản nhận – chỉ hiện khi chuyen_khoan_noi_bo */}
            {form.loai_giao_dich === 'chuyen_khoan_noi_bo' ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tài khoản nhận <span className="text-red-500">*</span></label>
                <select value={form.tai_khoan_nhan_id}
                  onChange={e => setForm(f => ({ ...f, tai_khoan_nhan_id: e.target.value }))} className="select-field w-full">
                  <option value="">-- Chọn tài khoản nhận --</option>
                  {taiKhoanList.filter(tk => String(tk.id) !== form.tai_khoan_tien_id).map(tk => (
                    <option key={tk.id} value={tk.id}>{tk.ten_tai_khoan}</option>
                  ))}
                </select>
              </div>
            ) : (
              /* Hạng mục */
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Hạng mục thu chi</label>
                <select value={form.hang_muc_thu_chi_id}
                  onChange={e => setForm(f => ({ ...f, hang_muc_thu_chi_id: e.target.value }))} className="select-field w-full">
                  <option value="">-- Chọn hạng mục --</option>
                  {hangMucOptions.map(o => (
                    <option key={o.id} value={o.id}>{'\u00A0'.repeat(o.indent * 3)}{o.label}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Mô tả */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả giao dịch</label>
            <input type="text" value={form.mo_ta_giao_dich}
              onChange={e => setForm(f => ({ ...f, mo_ta_giao_dich: e.target.value }))}
              className="input-field w-full" placeholder="Nhập mô tả..." />
          </div>

          {/* Khách hàng / Nhà cung cấp – theo loại giao dịch */}
          {(form.loai_giao_dich === 'thu' || form.loai_giao_dich === 'chi') && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {form.loai_giao_dich === 'thu' ? (
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
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nhà cung cấp</label>
                    <select value={form.nha_cung_cap_id}
                      onChange={e => setForm(f => ({ ...f, nha_cung_cap_id: e.target.value, hop_dong_mua_id: '' }))} className="select-field w-full">
                      <option value="">-- Nhà cung cấp --</option>
                      {nhaCungCapList.map(ncc => <option key={ncc.id} value={ncc.id}>{ncc.ten_nha_cung_cap}</option>)}
                    </select>
                  </div>
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
                </>
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
