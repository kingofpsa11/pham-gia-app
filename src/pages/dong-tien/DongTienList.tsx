import { useState, useEffect, useCallback, useRef } from 'react';
import { dongTienApi, taiKhoanApi, khachHangApi, nhaCungCapApi, hopDongApi, hopDongMuaApi, loaiChiPhiApi, chiPhiApi, chiPhiCuTheApi } from '../../lib/api';
import { useToastStore } from '../../store/toast';
import { useAuthStore } from '../../store/auth';
import {
  formatVND,
  formatDate,
  toInputDateValue,
  getTodayInputValue,
  parseExcelNum,
} from '../../lib/utils';
import Modal from '../../components/ui/Modal';
import Pagination from '../../components/ui/Pagination';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import EmptyState from '../../components/ui/EmptyState';
import { Plus, Pencil, Trash2, ArrowUpRight, ArrowDownRight, Filter, Banknote, Search, FileSpreadsheet, RefreshCw, Save, X, ChevronDown } from 'lucide-react';
import type { DongTien, TaiKhoan, KhachHang, NhaCungCap, LoaiChiPhi, ChiPhi, ChiPhiCuThe, HopDong, HopDongMua } from '../../types';

const PAGE_SIZE = 20;

interface Filters {
  dateFrom: string;
  dateTo: string;
  tai_khoan_id: string;
  khach_hang_id: string;
  nha_cung_cap_id: string;
  hop_dong_id: string;
  hop_dong_mua_id: string;
  loai_chi_phi_id: string;
  chi_phi_id: string;
  search: string;
}

const emptyFilters: Filters = {
  dateFrom: '',
  dateTo: '',
  tai_khoan_id: '',
  khach_hang_id: '',
  nha_cung_cap_id: '',
  hop_dong_id: '',
  hop_dong_mua_id: '',
  loai_chi_phi_id: '',
  chi_phi_id: '',
  search: '',
};

interface ThuFormValues {
  ngay_gio_giao_dich: string;
  tai_khoan_id: string;
  mo_ta_giao_dich: string;
  ghi_no: string;
  khach_hang_id: string;
  hop_dong_id: string;
  ghi_chu: string;
}

const emptyThuForm: ThuFormValues = {
  ngay_gio_giao_dich: getTodayInputValue(),
  tai_khoan_id: '',
  mo_ta_giao_dich: '',
  ghi_no: '',
  khach_hang_id: '',
  hop_dong_id: '',
  ghi_chu: '',
};

interface ChiFormValues {
  ngay_gio_giao_dich: string;
  tai_khoan_id: string;
  mo_ta_giao_dich: string;
  ghi_co: string;
  nha_cung_cap_id: string;
  hop_dong_mua_id: string;
  loai_chi_phi_id: string;
  chi_phi_id: string;
  chi_phi_cu_the_id: string;
  ghi_chu: string;
}

const emptyChiForm: ChiFormValues = {
  ngay_gio_giao_dich: getTodayInputValue(),
  tai_khoan_id: '',
  mo_ta_giao_dich: '',
  ghi_co: '',
  nha_cung_cap_id: '',
  hop_dong_mua_id: '',
  loai_chi_phi_id: '',
  chi_phi_id: '',
  chi_phi_cu_the_id: '',
  ghi_chu: '',
};

// ─── Excel import types ──────────────────────────────────────────────────────
interface ExcelRow {
  stt: number;
  ngay_gd: string;
  ngay_iso: string;
  dien_giai: string;
  ghi_no: number;
  ghi_co: number;
  so_du: number;
  tk_doi_ung: string;
  chu_tk: string;
  valid: boolean;
  error?: string;
  // Tag fields (editable by user)
  khach_hang_id: string;
  hop_dong_id: string;
  loai_chi_phi_id: string;
  chi_phi_id: string;
  chi_phi_cu_the_id: string;
  ghi_chu: string;
}

// Parse date from Excel: accepts "26/05/2026 15:21:12", "26/05/2026", "2026-05-26", etc.
function parseExcelDate(s: string): string {
  if (!s || !s.trim()) return '';
  const trimmed = s.trim();
  // "dd/mm/yyyy hh:mm:ss" or "dd/mm/yyyy"
  const dmyMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  // "yyyy-mm-dd" already ISO
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

    // Expected columns (from bank statement export):
    // 0: Ngày giao dịch (Transaction Date)
    // 1: Ngày giá trị (Value Date) — optional, skip
    // 2: Diễn giải (Contents)
    // 3: Ghi nợ (Debit)
    // 4: Ghi có (Credit)
    // 5: Số dư (Balance)
    // 6: TK đối ứng (Counter account)
    // 7: Chủ TK đối ứng (Counter account owner)
    const ngayGD = (cols[0] || '').trim();
    const dienGiai = (cols[2] || cols[1] || '').trim();
    const ghiNo = parseExcelNum(cols[3] || '');
    const ghiCo = parseExcelNum(cols[4] || '');
    const soDu = parseExcelNum(cols[5] || '');
    const tkDoiUng = (cols[6] || '').trim();
    const chuTK = (cols[7] || '').trim();
    const ngayISO = parseExcelDate(ngayGD);

    // Skip header rows (no date or all zero)
    if (!dienGiai && ghiNo === 0 && ghiCo === 0) continue;
    if (!ngayISO && !dienGiai) continue;

    const valid = !!ngayISO && !!dienGiai && (ghiNo > 0 || ghiCo > 0);
    rows.push({
      stt: stt++,
      ngay_gd: ngayGD,
      ngay_iso: ngayISO,
      dien_giai: dienGiai,
      ghi_no: ghiNo,
      ghi_co: ghiCo,
      so_du: soDu,
      tk_doi_ung: tkDoiUng,
      chu_tk: chuTK,
      valid,
      error: !ngayISO ? 'Ngày không hợp lệ' : !dienGiai ? 'Thiếu diễn giải' : ghiNo === 0 && ghiCo === 0 ? 'Không có số tiền' : undefined,
      khach_hang_id: '',
      hop_dong_id: '',
      loai_chi_phi_id: '',
      chi_phi_id: '',
      chi_phi_cu_the_id: '',
      ghi_chu: '',
    });
  }

  return rows;
}

export default function DongTienList() {
  const addToast = useToastStore((s) => s.addToast);
  const isAdmin = useAuthStore((s) => s.isAdmin);

  const [data, setData] = useState<DongTien[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [filtersApplied, setFiltersApplied] = useState<Filters>(emptyFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [soDuDauKy, setSoDuDauKy] = useState(0);
  const [tongThu, setTongThu] = useState(0);
  const [tongChi, setTongChi] = useState(0);

  const [taiKhoanList, setTaiKhoanList] = useState<TaiKhoan[]>([]);
  const [khachHangList, setKhachHangList] = useState<KhachHang[]>([]);
  const [nhaCungCapList, setNhaCungCapList] = useState<NhaCungCap[]>([]);
  const [hopDongList, setHopDongList] = useState<HopDong[]>([]);
  const [hopDongMuaList, setHopDongMuaList] = useState<HopDongMua[]>([]);
  const [loaiChiPhiList, setLoaiChiPhiList] = useState<LoaiChiPhi[]>([]);
  const [chiPhiList, setChiPhiList] = useState<ChiPhi[]>([]);
  const [chiPhiCuTheList, setChiPhiCuTheList] = useState<ChiPhiCuThe[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'thu' | 'chi'>('thu');
  const [thuForm, setThuForm] = useState<ThuFormValues>(emptyThuForm);
  const [chiForm, setChiForm] = useState<ChiFormValues>(emptyChiForm);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DongTien | null>(null);
  const [filteredChiPhi, setFilteredChiPhi] = useState<ChiPhi[]>([]);
  const [filteredChiPhiCuThe, setFilteredChiPhiCuThe] = useState<ChiPhiCuThe[]>([]);

  // ─── Excel import state ──────────────────────────────────────────────────
  const [showImport, setShowImport] = useState(false);
  const [importTaiKhoanId, setImportTaiKhoanId] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [excelRows, setExcelRows] = useState<ExcelRow[]>([]);
  const [importing, setImporting] = useState(false);
  const pasteRef = useRef<HTMLTextAreaElement>(null);
  const [copyDownOpen, setCopyDownOpen] = useState<number | null>(null);
  const [copyDownCount, setCopyDownCount] = useState(1);
  // Per-row KH search
  const [khSearchMap, setKhSearchMap] = useState<Record<number, string>>({});
  const [khDropMap, setKhDropMap] = useState<Record<number, boolean>>({});
  const [khResultsMap, setKhResultsMap] = useState<Record<number, KhachHang[]>>({});
  const khSearchTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  function resetImportTagMaps() {
    setKhSearchMap({});
    setKhDropMap({});
    setKhResultsMap({});
    setCopyDownOpen(null);
    setCopyDownCount(1);
  }

  function searchKhForRow(stt: number, q: string) {
    if (khSearchTimers.current[stt]) clearTimeout(khSearchTimers.current[stt]);
    if (!q.trim()) { setKhResultsMap(m => ({ ...m, [stt]: [] })); return; }
    khSearchTimers.current[stt] = setTimeout(async () => {
      try {
        const res = await khachHangApi.list({ search: q.trim(), limit: 15 });
        setKhResultsMap(m => ({ ...m, [stt]: (res.data as KhachHang[]) || [] }));
      } catch { /* ignore */ }
    }, 250);
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  useEffect(() => {
    taiKhoanApi.list().then(({ data }) => { setTaiKhoanList(data as TaiKhoan[]); });
    khachHangApi.list({ limit: 1000 }).then(({ data }) => { setKhachHangList(data as KhachHang[]); });
    nhaCungCapApi.list().then(({ data }) => { setNhaCungCapList(data as NhaCungCap[]); });
    hopDongApi.list({ limit: 1000 }).then(({ data }) => { setHopDongList(data as HopDong[]); });
    hopDongMuaApi.list({ limit: 1000 }).then(({ data }) => { setHopDongMuaList(data as HopDongMua[]); });
    loaiChiPhiApi.list().then(({ data }) => { setLoaiChiPhiList(data as LoaiChiPhi[]); });
    chiPhiApi.list().then(({ data }) => { setChiPhiList(data as ChiPhi[]); });
    chiPhiCuTheApi.list().then(({ data }) => { setChiPhiCuTheList(data as ChiPhiCuThe[]); });
  }, []);

  useEffect(() => {
    if (filters.loai_chi_phi_id) {
      setFilteredChiPhi(chiPhiList.filter((cp) => cp.loai_chi_phi_id === Number(filters.loai_chi_phi_id)));
    } else {
      setFilteredChiPhi(chiPhiList);
    }
  }, [filters.loai_chi_phi_id, chiPhiList]);

  useEffect(() => {
    if (filters.chi_phi_id) {
      setFilteredChiPhiCuThe(chiPhiCuTheList.filter((cpc) => cpc.chi_phi_id === Number(filters.chi_phi_id)));
    } else {
      setFilteredChiPhiCuThe([]);
    }
  }, [filters.chi_phi_id, chiPhiCuTheList]);

  useEffect(() => {
    if (chiForm.loai_chi_phi_id) {
      const filtered = chiPhiList.filter((cp) => cp.loai_chi_phi_id === Number(chiForm.loai_chi_phi_id));
      setFilteredChiPhi(filtered);
      if (chiForm.chi_phi_id && !filtered.find((cp) => cp.id === Number(chiForm.chi_phi_id))) {
        setChiForm((f) => ({ ...f, chi_phi_id: '', chi_phi_cu_the_id: '' }));
      }
    } else {
      setFilteredChiPhi(chiPhiList);
      setChiForm((f) => ({ ...f, chi_phi_id: '', chi_phi_cu_the_id: '' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chiForm.loai_chi_phi_id, chiPhiList]);

  useEffect(() => {
    if (chiForm.chi_phi_id) {
      const filtered = chiPhiCuTheList.filter((cpc) => cpc.chi_phi_id === Number(chiForm.chi_phi_id));
      setFilteredChiPhiCuThe(filtered);
      if (chiForm.chi_phi_cu_the_id && !filtered.find((cpc) => cpc.id === Number(chiForm.chi_phi_cu_the_id))) {
        setChiForm((f) => ({ ...f, chi_phi_cu_the_id: '' }));
      }
    } else {
      setFilteredChiPhiCuThe([]);
      setChiForm((f) => ({ ...f, chi_phi_cu_the_id: '' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chiForm.chi_phi_id, chiPhiCuTheList]);

  const fetchDongTien = useCallback(async () => {
    setLoading(true);
    try {
      const f = filtersApplied;
      const params: Record<string, string | number | undefined> = { page: currentPage, limit: PAGE_SIZE };
      if (f.dateFrom) params.date_from = f.dateFrom;
      if (f.dateTo) params.date_to = f.dateTo;
      if (f.tai_khoan_id) params.tai_khoan_id = f.tai_khoan_id;
      if (f.khach_hang_id) params.khach_hang_id = f.khach_hang_id;
      if (f.nha_cung_cap_id) params.nha_cung_cap_id = f.nha_cung_cap_id;
      if (f.hop_dong_id) params.hop_dong_id = f.hop_dong_id;
      if (f.hop_dong_mua_id) params.hop_dong_mua_id = f.hop_dong_mua_id;
      if (f.loai_chi_phi_id) params.loai_chi_phi_id = f.loai_chi_phi_id;
      if (f.chi_phi_id) params.chi_phi_id = f.chi_phi_id;
      if (f.search.trim()) params.search = f.search.trim();

      const { data: rows, total } = await dongTienApi.list(params);
      setData(rows as DongTien[]);
      setTotalCount(total);

      const sumParams: Record<string, string | number | undefined> = { ...params };
      delete sumParams.page;
      delete sumParams.limit;
      const { data: sumRows } = await dongTienApi.list(sumParams);

      setTongThu(sumRows.reduce((acc, r) => acc + (r.ghi_no || 0), 0));
      setTongChi(sumRows.reduce((acc, r) => acc + (r.ghi_co || 0), 0));

      if (f.dateFrom) {
        const dauKyParams: Record<string, string | number | undefined> = {};
        if (f.tai_khoan_id) dauKyParams.tai_khoan_id = f.tai_khoan_id;
        if (f.khach_hang_id) dauKyParams.khach_hang_id = f.khach_hang_id;
        if (f.nha_cung_cap_id) dauKyParams.nha_cung_cap_id = f.nha_cung_cap_id;
        if (f.hop_dong_id) dauKyParams.hop_dong_id = f.hop_dong_id;
        if (f.hop_dong_mua_id) dauKyParams.hop_dong_mua_id = f.hop_dong_mua_id;
        if (f.loai_chi_phi_id) dauKyParams.loai_chi_phi_id = f.loai_chi_phi_id;
        if (f.chi_phi_id) dauKyParams.chi_phi_id = f.chi_phi_id;
        dauKyParams.date_to = f.dateFrom;
        dauKyParams.limit = 99999;
        const { data: dauKyRows } = await dongTienApi.list(dauKyParams);
        setSoDuDauKy(dauKyRows.reduce((acc, r) => acc + (r.ghi_no || 0) - (r.ghi_co || 0), 0));
      } else {
        setSoDuDauKy(0);
      }
    } catch (err) {
      console.error('Loi tai dong tien:', err);
      addToast('error', 'Không thể tải danh sách dòng tiền');
    } finally {
      setLoading(false);
    }
  }, [currentPage, filtersApplied, addToast]);

  useEffect(() => { fetchDongTien(); }, [fetchDongTien]);
  useEffect(() => { setCurrentPage(1); }, [filtersApplied]);

  function applyFilters() { setFiltersApplied({ ...filters }); setCurrentPage(1); }
  function clearFilters() { setFilters(emptyFilters); setFiltersApplied(emptyFilters); setCurrentPage(1); }
  const hasActiveFilters = Object.values(filtersApplied).some((v) => v !== '');

  function openAddModal() {
    setEditingId(null);
    setActiveTab('thu');
    setThuForm(emptyThuForm);
    setChiForm(emptyChiForm);
    setModalOpen(true);
  }

  function openEditModal(row: DongTien) {
    setEditingId(row.id);
    if (row.ghi_no > 0) {
      setActiveTab('thu');
      setThuForm({
        ngay_gio_giao_dich: toInputDateValue(row.ngay_gio_giao_dich) || getTodayInputValue(),
        tai_khoan_id: String(row.tai_khoan_id),
        mo_ta_giao_dich: row.mo_ta_giao_dich || '',
        ghi_no: String(row.ghi_no),
        khach_hang_id: row.khach_hang_id ? String(row.khach_hang_id) : '',
        hop_dong_id: row.hop_dong_id ? String(row.hop_dong_id) : '',
        ghi_chu: row.ghi_chu || '',
      });
      setChiForm(emptyChiForm);
    } else {
      setActiveTab('chi');
      setChiForm({
        ngay_gio_giao_dich: toInputDateValue(row.ngay_gio_giao_dich) || getTodayInputValue(),
        tai_khoan_id: String(row.tai_khoan_id),
        mo_ta_giao_dich: row.mo_ta_giao_dich || '',
        ghi_co: String(row.ghi_co),
        nha_cung_cap_id: row.nha_cung_cap_id ? String(row.nha_cung_cap_id) : '',
        hop_dong_mua_id: row.hop_dong_mua_id ? String(row.hop_dong_mua_id) : '',
        loai_chi_phi_id: row.loai_chi_phi_id ? String(row.loai_chi_phi_id) : '',
        chi_phi_id: row.chi_phi_id ? String(row.chi_phi_id) : '',
        chi_phi_cu_the_id: row.chi_phi_cu_the_id ? String(row.chi_phi_cu_the_id) : '',
        ghi_chu: row.ghi_chu || '',
      });
      setThuForm(emptyThuForm);
    }
    setModalOpen(true);
  }

  async function calcSoDu(taiKhoanId: number): Promise<number> {
    const { data: latest } = await dongTienApi.list({ tai_khoan_id: String(taiKhoanId), limit: 1 });
    if (latest && latest.length > 0 && latest[0].so_du != null) return latest[0].so_du;
    const { data: allRows } = await dongTienApi.list({ tai_khoan_id: String(taiKhoanId), limit: 99999 });
    if (allRows) return allRows.reduce((acc, r) => acc + (r.ghi_no || 0) - (r.ghi_co || 0), 0);
    return 0;
  }

  async function handleSave() {
    if (activeTab === 'thu') {
      if (!thuForm.tai_khoan_id) { addToast('warning', 'Vui lòng chọn tài khoản'); return; }
      if (!thuForm.ghi_no || Number(thuForm.ghi_no) <= 0) { addToast('warning', 'Vui lòng nhập số tiền thu'); return; }
      if (!thuForm.mo_ta_giao_dich.trim()) { addToast('warning', 'Vui lòng nhập mô tả giao dịch'); return; }
    } else {
      if (!chiForm.tai_khoan_id) { addToast('warning', 'Vui lòng chọn tài khoản'); return; }
      if (!chiForm.ghi_co || Number(chiForm.ghi_co) <= 0) { addToast('warning', 'Vui lòng nhập số tiền chi'); return; }
      if (!chiForm.mo_ta_giao_dich.trim()) { addToast('warning', 'Vui lòng nhập mô tả giao dịch'); return; }
    }

    setSaving(true);
    try {
      const isThu = activeTab === 'thu';
      const taiKhoanId = Number(isThu ? thuForm.tai_khoan_id : chiForm.tai_khoan_id);
      const currentSoDu = await calcSoDu(taiKhoanId);
      let payload: Record<string, unknown>;

      if (isThu) {
        payload = {
          ngay_gio_giao_dich: thuForm.ngay_gio_giao_dich,
          tai_khoan_id: taiKhoanId,
          mo_ta_giao_dich: thuForm.mo_ta_giao_dich.trim(),
          ghi_no: Number(thuForm.ghi_no),
          ghi_co: 0,
          so_du: currentSoDu + Number(thuForm.ghi_no),
          khach_hang_id: thuForm.khach_hang_id ? Number(thuForm.khach_hang_id) : null,
          hop_dong_id: thuForm.hop_dong_id ? Number(thuForm.hop_dong_id) : null,
          ghi_chu: thuForm.ghi_chu.trim() || null,
        };
      } else {
        payload = {
          ngay_gio_giao_dich: chiForm.ngay_gio_giao_dich,
          tai_khoan_id: taiKhoanId,
          mo_ta_giao_dich: chiForm.mo_ta_giao_dich.trim(),
          ghi_no: 0,
          ghi_co: Number(chiForm.ghi_co),
          so_du: currentSoDu - Number(chiForm.ghi_co),
          nha_cung_cap_id: chiForm.nha_cung_cap_id ? Number(chiForm.nha_cung_cap_id) : null,
          hop_dong_mua_id: chiForm.hop_dong_mua_id ? Number(chiForm.hop_dong_mua_id) : null,
          loai_chi_phi_id: chiForm.loai_chi_phi_id ? Number(chiForm.loai_chi_phi_id) : null,
          chi_phi_id: chiForm.chi_phi_id ? Number(chiForm.chi_phi_id) : null,
          chi_phi_cu_the_id: chiForm.chi_phi_cu_the_id ? Number(chiForm.chi_phi_cu_the_id) : null,
          ghi_chu: chiForm.ghi_chu.trim() || null,
        };
      }

      if (editingId) {
        await dongTienApi.update(editingId, payload);
        addToast('success', 'Cập nhật giao dịch thành công');
      } else {
        await dongTienApi.create(payload);
        addToast('success', isThu ? 'Thêm giao dịch thu thành công' : 'Thêm giao dịch chi thành công');
      }
      setModalOpen(false);
      fetchDongTien();
    } catch (err) {
      console.error('Loi luu giao dich:', err);
      addToast('error', 'Không thể lưu giao dịch');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await dongTienApi.delete(deleteTarget.id);
      addToast('success', 'Xóa giao dịch thành công');
      fetchDongTien();
    } catch (err) {
      console.error('Loi xoa giao dich:', err);
      addToast('error', 'Không thể xóa giao dịch');
    } finally {
      setDeleteTarget(null);
    }
  }

  function getTaiKhoanName(row: DongTien): string {
    const tk = row.tai_khoan as TaiKhoan | undefined;
    if (tk) return tk.ten_tai_khoan;
    const found = taiKhoanList.find((t) => t.id === row.tai_khoan_id);
    return found ? found.ten_tai_khoan : '--';
  }

  function getKhachHangName(row: DongTien): string {
    const kh = row.khach_hang as KhachHang | undefined;
    if (kh) return kh.ten_cong_ty;
    if (!row.khach_hang_id) return '--';
    const found = khachHangList.find((k) => k.id === row.khach_hang_id);
    return found ? found.ten_cong_ty : '--';
  }

  function getNhaCungCapName(row: DongTien): string {
    const ncc = row.nha_cung_cap as NhaCungCap | undefined;
    if (ncc) return ncc.ten_nha_cung_cap;
    if (!row.nha_cung_cap_id) return '--';
    const found = nhaCungCapList.find((n) => n.id === row.nha_cung_cap_id);
    return found ? found.ten_nha_cung_cap : '--';
  }

  // ─── Excel import handlers ────────────────────────────────────────────────
  function handleParsePaste() {
    if (!pasteText.trim()) {
      addToast('warning', 'Vui lòng dán dữ liệu từ Excel vào ô trên');
      return;
    }
    const rows = parseExcelPaste(pasteText);
    if (rows.length === 0) {
      addToast('warning', 'Không tìm thấy dữ liệu hợp lệ');
      return;
    }
    resetImportTagMaps();
    setExcelRows(rows);
    addToast('success', `Đã bóc tách ${rows.length} dòng`);
  }

  function removeExcelRow(stt: number) {
    setExcelRows(prev => prev.filter(r => r.stt !== stt));
  }

  function updateExcelRowTag(stt: number, field: keyof ExcelRow, value: string) {
    setExcelRows(prev => prev.map(r => {
      if (r.stt !== stt) return r;
      const updated = { ...r, [field]: value };
      if (field === 'loai_chi_phi_id') { updated.chi_phi_id = ''; updated.chi_phi_cu_the_id = ''; }
      if (field === 'chi_phi_id') updated.chi_phi_cu_the_id = '';
      if (field === 'khach_hang_id') updated.hop_dong_id = ''; // reset contract when customer changes
      return updated;
    }));
  }

  // Copy tag fields from row at index `fromIdx` to rows below it (count rows)
  function copyTagsDown(fromIdx: number, count: number) {
    setExcelRows(prev => {
      const src = prev[fromIdx];
      if (!src) return prev;
      const next = [...prev];
      for (let i = fromIdx + 1; i <= fromIdx + count && i < next.length; i++) {
        next[i] = {
          ...next[i],
          khach_hang_id: src.khach_hang_id,
          hop_dong_id: src.hop_dong_id,
          loai_chi_phi_id: src.loai_chi_phi_id,
          chi_phi_id: src.chi_phi_id,
          chi_phi_cu_the_id: src.chi_phi_cu_the_id,
          ghi_chu: src.ghi_chu,
        };
      }
      return next;
    });
    setCopyDownOpen(null);
    addToast('success', `Đã copy tag cho ${count} dòng bên dưới`);
  }

  async function handleImportExcel() {
    if (!importTaiKhoanId) { addToast('warning', 'Vui lòng chọn tài khoản ngân hàng/quỹ'); return; }
    const validRows = excelRows.filter(r => r.valid);
    if (validRows.length === 0) { addToast('warning', 'Không có dòng hợp lệ để nhập'); return; }

    setImporting(true);
    let successCount = 0;
    let errorCount = 0;

    try {
      let currentSoDu = await calcSoDu(Number(importTaiKhoanId));

      for (const row of validRows) {
        try {
          const ghiNo = row.ghi_co > 0 ? row.ghi_co : 0;  // Có (credit) = tiền vào tài khoản = ghi_no
          const ghiCo = row.ghi_no > 0 ? row.ghi_no : 0;  // Nợ (debit) = tiền ra = ghi_co
          currentSoDu = currentSoDu + ghiNo - ghiCo;

          await dongTienApi.create({
            ngay_gio_giao_dich: row.ngay_gd,
            tai_khoan_id: Number(importTaiKhoanId),
            mo_ta_giao_dich: row.dien_giai,
            ghi_no: ghiNo,
            ghi_co: ghiCo,
            so_du: row.so_du || currentSoDu,
            tk_doi_ung: row.tk_doi_ung || null,
            ten_tk_doi_ung: row.chu_tk || null,
            khach_hang_id: row.khach_hang_id ? Number(row.khach_hang_id) : null,
            hop_dong_id: row.hop_dong_id ? Number(row.hop_dong_id) : null,
            loai_chi_phi_id: row.loai_chi_phi_id ? Number(row.loai_chi_phi_id) : null,
            chi_phi_id: row.chi_phi_id ? Number(row.chi_phi_id) : null,
            chi_phi_cu_the_id: row.chi_phi_cu_the_id ? Number(row.chi_phi_cu_the_id) : null,
            ghi_chu: row.ghi_chu.trim() || null,
          });
          successCount++;
        } catch {
          errorCount++;
        }
      }

      if (successCount > 0) addToast('success', `Đã nhập ${successCount} giao dịch thành công${errorCount > 0 ? `, ${errorCount} lỗi` : ''}`);
      else addToast('error', `Không nhập được giao dịch nào`);

      resetImportTagMaps();
      setPasteText('');
      setExcelRows([]);
      fetchDongTien();
    } catch (err) {
      console.error('Import error:', err);
      addToast('error', 'Lỗi khi nhập dữ liệu');
    } finally {
      setImporting(false);
    }
  }

  const soDuCuoiKy = soDuDauKy + tongThu - tongChi;
  const validImportCount = excelRows.filter(r => r.valid).length;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dòng tiền</h1>
          <p className="mt-1 text-sm text-gray-500">Quản lý thu chi và số dư tài khoản</p>
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

      {/* ─── Excel Import Panel (full-screen overlay) ────────────────────────── */}
      {showImport && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col overflow-hidden">
          {/* Header */}
          <div className="bg-teal-600 px-5 py-3 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="w-5 h-5 text-white" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wide">Nhập liệu & gắn tag chi phí dòng tiền</h2>
            </div>
            <button onClick={() => { setShowImport(false); setPasteText(''); setExcelRows([]); resetImportTagMaps(); }} className="text-teal-100 hover:text-white transition-colors p-1">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Top controls — fixed height */}
          <div className="flex-shrink-0 px-5 py-4 border-b border-gray-200 bg-gray-50 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 items-start">
              <div>
                <label className="block text-sm font-semibold text-teal-700 mb-1.5">
                  1. Chọn Ngân Hàng/Quỹ <span className="text-red-500">*</span>
                </label>
                <select
                  value={importTaiKhoanId}
                  onChange={(e) => setImportTaiKhoanId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border-2 border-teal-300 rounded-lg focus:outline-none focus:border-teal-500 bg-white"
                >
                  <option value="">-- Chọn tài khoản --</option>
                  {taiKhoanList.map((tk) => (
                    <option key={tk.id} value={tk.id}>{tk.ten_tai_khoan}</option>
                  ))}
                </select>
              </div>

              <div className="lg:col-span-2">
                <label className="block text-sm font-semibold text-teal-700 mb-1.5">2. Dán dữ liệu từ Excel</label>
                <div className="flex gap-2 items-start">
                  <textarea
                    ref={pasteRef}
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    className="flex-1 h-16 px-3 py-2 text-xs border-2 border-dashed border-teal-300 rounded-lg focus:outline-none focus:border-teal-500 font-mono resize-none bg-white placeholder-teal-400"
                    placeholder="Dán (Ctrl+V) dữ liệu Excel vào đây..."
                  />
                  <button
                    onClick={handleParsePaste}
                    className="flex items-center gap-2 px-3 py-2 bg-teal-600 text-white rounded-lg text-xs font-bold hover:bg-teal-700 transition-colors whitespace-nowrap self-start"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Bóc tách
                  </button>
                </div>
              </div>

              <div className="flex items-start gap-2 p-3 bg-teal-50 border border-teal-200 rounded-lg text-xs text-teal-700 self-end">
                <span className="w-5 h-5 rounded-full bg-teal-600 text-white flex items-center justify-center font-bold flex-shrink-0 mt-0.5">i</span>
                <span>Cột Excel: <strong>Ngày GD · Ngày giá trị · Diễn giải · Nợ · Có · Số dư · TK đối ứng · Chủ TK</strong></span>
              </div>
            </div>
          </div>

          {/* Table area — scrollable */}
          <div className="flex-1 overflow-auto px-5 py-4">
            {excelRows.length > 0 ? (
              <div className="h-full flex flex-col">
                <div className="flex items-center justify-between mb-2 flex-shrink-0">
                  <label className="text-sm font-semibold text-teal-700">
                    3. Kiểm tra & gắn tag dữ liệu
                    <span className="ml-2 text-xs font-normal text-gray-500">
                      {validImportCount}/{excelRows.length} dòng hợp lệ
                    </span>
                  </label>
                  <button
                    onClick={() => { setPasteText(''); setExcelRows([]); resetImportTagMaps(); }}
                    className="text-xs text-gray-400 hover:text-red-500 transition-colors flex items-center gap-1"
                  >
                    <X className="w-3 h-3" />
                    Xóa tất cả
                  </button>
                </div>

                <div className="overflow-x-auto rounded-lg border border-gray-200 flex-1">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-teal-600 text-white">
                        <th className="px-2 py-2 text-center font-semibold w-10">STT</th>
                        <th className="px-2 py-2 text-left font-semibold w-36">NGÀY GD</th>
                        <th className="px-2 py-2 text-left font-semibold w-64">DIỄN GIẢI</th>
                        <th className="px-2 py-2 text-right font-semibold w-28">NỢ (CHI)</th>
                        <th className="px-2 py-2 text-right font-semibold w-28">CÓ (THU)</th>
                        <th className="px-2 py-2 text-right font-semibold w-28">SỐ DƯ</th>
                        <th className="px-2 py-2 text-left font-semibold w-28">TK ĐỐI ỨNG</th>
                        <th className="px-2 py-2 text-left font-semibold w-48">CHỦ TK</th>
                        <th className="px-2 py-2 text-left font-semibold w-40 bg-teal-700">KHÁCH HÀNG</th>
                        <th className="px-2 py-2 text-left font-semibold w-36 bg-teal-700">HỢP ĐỒNG</th>
                        <th className="px-2 py-2 text-left font-semibold w-32 bg-teal-700">LOẠI CHI PHÍ</th>
                        <th className="px-2 py-2 text-left font-semibold w-32 bg-teal-700">CHI PHÍ</th>
                        <th className="px-2 py-2 text-left font-semibold w-32 bg-teal-700">CP CỤ THỂ</th>
                        <th className="px-2 py-2 text-left font-semibold w-32 bg-teal-700">GHI CHÚ</th>
                        <th className="px-2 py-2 text-center font-semibold w-16 bg-teal-700">COPY</th>
                        <th className="px-2 py-2 w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {excelRows.map((row, idx) => {
                        const chiPhiForRow = row.loai_chi_phi_id
                          ? chiPhiList.filter(cp => cp.loai_chi_phi_id === Number(row.loai_chi_phi_id))
                          : chiPhiList;
                        const chiPhiCuTheForRow = row.chi_phi_id
                          ? chiPhiCuTheList.filter(cpc => cpc.chi_phi_id === Number(row.chi_phi_id))
                          : [];
                        const hopDongForRow = row.khach_hang_id
                          ? hopDongList.filter(hd => String((hd as any).khach_hang_id) === row.khach_hang_id)
                          : hopDongList;
                        const isCopyOpen = copyDownOpen === row.stt;
                        const rowsBelow = excelRows.length - 1 - idx;
                        const khName = khachHangList.find(k => String(k.id) === row.khach_hang_id)?.ten_cong_ty || '';

                        return (
                          <tr
                            key={row.stt}
                            className={`transition-colors ${!row.valid ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-gray-50'}`}
                          >
                            <td className="px-2 py-1 text-center text-gray-500 font-medium">{row.stt}</td>

                            <td className="px-2 py-1 whitespace-nowrap">
                              <div className={`text-xs font-medium ${row.ngay_iso ? 'text-teal-700' : 'text-red-500'}`}>
                                {row.ngay_gd || <span className="italic text-red-400">—</span>}
                              </div>
                            </td>

                            <td className="px-2 py-1" style={{ minWidth: 200, maxWidth: 320 }}>
                              <div className="text-gray-800 break-words leading-tight">{row.dien_giai || <span className="italic text-red-400">Trống</span>}</div>
                              {row.error && <div className="text-red-500 text-[10px] mt-0.5">{row.error}</div>}
                            </td>

                            <td className="px-2 py-1 text-right whitespace-nowrap">
                              {row.ghi_no > 0 ? <span className="font-medium text-red-600">{formatVND(row.ghi_no)}</span> : <span className="text-gray-300">—</span>}
                            </td>

                            <td className="px-2 py-1 text-right whitespace-nowrap">
                              {row.ghi_co > 0 ? <span className="font-medium text-green-600">{formatVND(row.ghi_co)}</span> : <span className="text-gray-300">—</span>}
                            </td>

                            <td className="px-2 py-1 text-right whitespace-nowrap text-gray-600">
                              {row.so_du > 0 ? formatVND(row.so_du) : <span className="text-gray-300">—</span>}
                            </td>

                            <td className="px-2 py-1 text-gray-600 font-mono text-[11px] whitespace-nowrap">{row.tk_doi_ung || '—'}</td>

                            <td className="px-2 py-1" style={{ minWidth: 160, maxWidth: 220 }}>
                              <div className="text-gray-600 break-words leading-tight text-[11px]">{row.chu_tk || '—'}</div>
                            </td>

                            {/* TAG: Khách hàng */}
                            <td className="px-1 py-1 bg-teal-50" style={{ minWidth: 150 }}>
                              <div className="relative">
                                <input
                                  type="text"
                                  value={khSearchMap[row.stt] !== undefined ? khSearchMap[row.stt] : khName}
                                  placeholder="Tìm khách..."
                                  className="w-full text-xs px-1.5 py-1 border border-teal-200 rounded focus:outline-none focus:border-teal-500 bg-white"
                                  onChange={e => {
                                    const v = e.target.value;
                                    setKhSearchMap(m => ({ ...m, [row.stt]: v }));
                                    setKhDropMap(m => ({ ...m, [row.stt]: true }));
                                    if (!v) { updateExcelRowTag(row.stt, 'khach_hang_id', ''); }
                                    searchKhForRow(row.stt, v);
                                  }}
                                  onFocus={() => {
                                    setKhDropMap(m => ({ ...m, [row.stt]: true }));
                                    searchKhForRow(row.stt, khSearchMap[row.stt] || khName || '');
                                  }}
                                  onBlur={() => setTimeout(() => setKhDropMap(m => ({ ...m, [row.stt]: false })), 200)}
                                />
                                {row.khach_hang_id && (
                                  <button
                                    type="button"
                                    onClick={() => { updateExcelRowTag(row.stt, 'khach_hang_id', ''); setKhSearchMap(m => ({ ...m, [row.stt]: '' })); }}
                                    className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-300 hover:text-red-400"
                                  ><X className="w-3 h-3" /></button>
                                )}
                                {khDropMap[row.stt] && (khResultsMap[row.stt] || []).length > 0 && (
                                  <div className="absolute left-0 top-full mt-0.5 z-50 bg-white border border-teal-200 rounded shadow-lg max-h-40 overflow-y-auto min-w-[180px]">
                                    {(khResultsMap[row.stt] || []).map(kh => (
                                      <button
                                        key={kh.id}
                                        type="button"
                                        className="w-full text-left px-2 py-1 text-xs hover:bg-teal-50 text-gray-800"
                                        onMouseDown={() => {
                                          updateExcelRowTag(row.stt, 'khach_hang_id', String(kh.id));
                                          setKhSearchMap(m => ({ ...m, [row.stt]: kh.ten_cong_ty }));
                                          setKhDropMap(m => ({ ...m, [row.stt]: false }));
                                        }}
                                      >{kh.ten_cong_ty}</button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </td>

                            {/* TAG: Hợp đồng */}
                            <td className="px-1 py-1 bg-teal-50" style={{ minWidth: 130 }}>
                              <select
                                value={row.hop_dong_id}
                                onChange={e => updateExcelRowTag(row.stt, 'hop_dong_id', e.target.value)}
                                className="w-full text-xs px-1.5 py-1 border border-teal-200 rounded focus:outline-none focus:border-teal-500 bg-white"
                              >
                                <option value="">- HĐ -</option>
                                {hopDongForRow.map(hd => <option key={hd.id} value={hd.id}>{hd.so_hop_dong}</option>)}
                              </select>
                            </td>

                            {/* TAG: Loại chi phí */}
                            <td className="px-1 py-1 bg-teal-50" style={{ minWidth: 120 }}>
                              <select
                                value={row.loai_chi_phi_id}
                                onChange={e => updateExcelRowTag(row.stt, 'loai_chi_phi_id', e.target.value)}
                                className="w-full text-xs px-1.5 py-1 border border-teal-200 rounded focus:outline-none focus:border-teal-500 bg-white"
                              >
                                <option value="">- Loại -</option>
                                {loaiChiPhiList.map(lcp => <option key={lcp.id} value={lcp.id}>{lcp.ten_loai_chi_phi}</option>)}
                              </select>
                            </td>

                            {/* TAG: Chi phí */}
                            <td className="px-1 py-1 bg-teal-50" style={{ minWidth: 120 }}>
                              <select
                                value={row.chi_phi_id}
                                onChange={e => updateExcelRowTag(row.stt, 'chi_phi_id', e.target.value)}
                                className="w-full text-xs px-1.5 py-1 border border-teal-200 rounded focus:outline-none focus:border-teal-500 bg-white"
                              >
                                <option value="">- Chi phí -</option>
                                {chiPhiForRow.map(cp => <option key={cp.id} value={cp.id}>{cp.ten_chi_phi}</option>)}
                              </select>
                            </td>

                            {/* TAG: Chi phí cụ thể */}
                            <td className="px-1 py-1 bg-teal-50" style={{ minWidth: 120 }}>
                              <select
                                value={row.chi_phi_cu_the_id}
                                onChange={e => updateExcelRowTag(row.stt, 'chi_phi_cu_the_id', e.target.value)}
                                className="w-full text-xs px-1.5 py-1 border border-teal-200 rounded focus:outline-none focus:border-teal-500 bg-white"
                                disabled={chiPhiCuTheForRow.length === 0}
                              >
                                <option value="">- CT -</option>
                                {chiPhiCuTheForRow.map(cpc => <option key={cpc.id} value={cpc.id}>{cpc.ten_chi_phi_cu_the}</option>)}
                              </select>
                            </td>

                            {/* TAG: Ghi chú */}
                            <td className="px-1 py-1 bg-teal-50" style={{ minWidth: 120 }}>
                              <input
                                type="text"
                                value={row.ghi_chu}
                                onChange={e => updateExcelRowTag(row.stt, 'ghi_chu', e.target.value)}
                                className="w-full text-xs px-1.5 py-1 border border-teal-200 rounded focus:outline-none focus:border-teal-500 bg-white"
                                placeholder="Ghi chú..."
                              />
                            </td>

                            {/* Copy down */}
                            <td className="px-1 py-1 text-center bg-teal-50 relative">
                              {rowsBelow > 0 && (
                                <div className="relative inline-block">
                                  <button
                                    onClick={() => setCopyDownOpen(isCopyOpen ? null : row.stt)}
                                    className="flex items-center gap-0.5 px-1.5 py-1 rounded text-xs font-medium bg-teal-100 text-teal-700 hover:bg-teal-200 transition-colors whitespace-nowrap"
                                  >
                                    Copy <ChevronDown className="w-3 h-3" />
                                  </button>
                                  {isCopyOpen && (
                                    <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-teal-200 rounded-lg shadow-lg p-2 min-w-[160px]">
                                      <p className="text-[10px] text-gray-500 mb-1.5 font-medium">Copy tag xuống:</p>
                                      <button onClick={() => copyTagsDown(idx, 1)} className="w-full text-left px-2 py-1 text-xs rounded hover:bg-teal-50 text-gray-700">1 dòng</button>
                                      {rowsBelow >= 3 && <button onClick={() => copyTagsDown(idx, 3)} className="w-full text-left px-2 py-1 text-xs rounded hover:bg-teal-50 text-gray-700">3 dòng</button>}
                                      {rowsBelow >= 5 && <button onClick={() => copyTagsDown(idx, 5)} className="w-full text-left px-2 py-1 text-xs rounded hover:bg-teal-50 text-gray-700">5 dòng</button>}
                                      <button onClick={() => copyTagsDown(idx, rowsBelow)} className="w-full text-left px-2 py-1 text-xs rounded hover:bg-teal-50 text-teal-700 font-medium">Tất cả ({rowsBelow})</button>
                                      <hr className="my-1 border-gray-100" />
                                      <div className="flex items-center gap-1">
                                        <input type="number" min={1} max={rowsBelow} value={copyDownCount}
                                          onChange={e => setCopyDownCount(Math.max(1, Math.min(rowsBelow, Number(e.target.value))))}
                                          className="w-12 text-xs px-1.5 py-0.5 border border-gray-200 rounded focus:outline-none" />
                                        <button onClick={() => copyTagsDown(idx, copyDownCount)} className="flex-1 text-xs px-1.5 py-0.5 bg-teal-600 text-white rounded hover:bg-teal-700">OK</button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </td>

                            {/* Xóa */}
                            <td className="px-1 py-1 text-center">
                              <button onClick={() => removeExcelRow(row.stt)} className="p-0.5 rounded text-gray-300 hover:text-red-500 hover:bg-red-50" title="Xóa dòng">
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

          {/* Footer — fixed */}
          <div className="flex-shrink-0 px-5 py-3 border-t border-gray-200 bg-gray-50 flex items-center gap-3">
            <button
              onClick={handleImportExcel}
              disabled={importing || validImportCount === 0 || !importTaiKhoanId}
              className="flex items-center gap-2 px-5 py-2 bg-teal-600 text-white rounded-lg text-sm font-bold hover:bg-teal-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="w-4 h-4" />
              {importing ? 'Đang nhập...' : validImportCount > 0 ? `Nhập ${validImportCount} giao dịch vào hệ thống` : 'Nhập vào hệ thống'}
            </button>
            {!importTaiKhoanId && (
              <span className="text-xs text-amber-600 font-medium">Vui lòng chọn tài khoản trước</span>
            )}
            <button
              onClick={() => { setShowImport(false); setPasteText(''); setExcelRows([]); resetImportTagMaps(); }}
              className="ml-auto flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <X className="w-4 h-4" />
              Đóng
            </button>
          </div>
        </div>
      )}

      {/* ─── Summary Cards ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <Banknote className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Số dư đầu kỳ</p>
              <p className="text-lg font-bold text-gray-900">{formatVND(soDuDauKy)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
              <ArrowUpRight className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Tổng thu</p>
              <p className="text-lg font-bold text-green-600">{formatVND(tongThu)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center">
              <ArrowDownRight className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Tổng chi</p>
              <p className="text-lg font-bold text-red-600">{formatVND(tongChi)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-sky-50 flex items-center justify-center">
              <Banknote className="w-5 h-5 text-sky-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Số dư cuối kỳ</p>
              <p className="text-lg font-bold text-gray-900">{formatVND(soDuCuoiKy)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Filters ─────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200">
        <button
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors rounded-xl"
          onClick={() => setFiltersOpen(!filtersOpen)}
        >
          <span className="flex items-center gap-2">
            <Filter className="w-4 h-4" />
            Bộ lọc
            {hasActiveFilters && (
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary-600 text-white text-xs">
                {Object.values(filtersApplied).filter((v) => v !== '').length}
              </span>
            )}
          </span>
          <ChevronDown className={`w-4 h-4 transition-transform ${filtersOpen ? 'rotate-180' : ''}`} />
        </button>

        {filtersOpen && (
          <div className="px-4 pb-4 space-y-4 border-t border-gray-100">
            <div className="pt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Từ ngày</label>
                <input type="date" value={filters.dateFrom} onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))} className="input-field w-full" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Đến ngày</label>
                <input type="date" value={filters.dateTo} onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))} className="input-field w-full" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Tài khoản</label>
                <select value={filters.tai_khoan_id} onChange={(e) => setFilters((f) => ({ ...f, tai_khoan_id: e.target.value }))} className="select-field w-full">
                  <option value="">Tất cả</option>
                  {taiKhoanList.map((tk) => <option key={tk.id} value={tk.id}>{tk.ten_tai_khoan}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Khách hàng</label>
                <select value={filters.khach_hang_id} onChange={(e) => setFilters((f) => ({ ...f, khach_hang_id: e.target.value }))} className="select-field w-full">
                  <option value="">Tất cả</option>
                  {khachHangList.map((kh) => <option key={kh.id} value={kh.id}>{kh.ten_cong_ty}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Nhà cung cấp</label>
                <select value={filters.nha_cung_cap_id} onChange={(e) => setFilters((f) => ({ ...f, nha_cung_cap_id: e.target.value }))} className="select-field w-full">
                  <option value="">Tất cả</option>
                  {nhaCungCapList.map((ncc) => <option key={ncc.id} value={ncc.id}>{ncc.ten_nha_cung_cap}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Hợp đồng bán</label>
                <select value={filters.hop_dong_id} onChange={(e) => setFilters((f) => ({ ...f, hop_dong_id: e.target.value }))} className="select-field w-full">
                  <option value="">Tất cả</option>
                  {hopDongList.map((hd) => <option key={hd.id} value={hd.id}>{hd.so_hop_dong}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Hợp đồng mua</label>
                <select value={filters.hop_dong_mua_id} onChange={(e) => setFilters((f) => ({ ...f, hop_dong_mua_id: e.target.value }))} className="select-field w-full">
                  <option value="">Tất cả</option>
                  {hopDongMuaList.map((hdm) => <option key={hdm.id} value={hdm.id}>{hdm.so_hop_dong}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Loại chi phí</label>
                <select value={filters.loai_chi_phi_id} onChange={(e) => setFilters((f) => ({ ...f, loai_chi_phi_id: e.target.value, chi_phi_id: '' }))} className="select-field w-full">
                  <option value="">Tất cả</option>
                  {loaiChiPhiList.map((lcp) => <option key={lcp.id} value={lcp.id}>{lcp.ten_loai_chi_phi}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Chi phí</label>
                <select value={filters.chi_phi_id} onChange={(e) => setFilters((f) => ({ ...f, chi_phi_id: e.target.value }))} className="select-field w-full">
                  <option value="">Tất cả</option>
                  {filteredChiPhi.map((cp) => <option key={cp.id} value={cp.id}>{cp.ten_chi_phi}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">Tìm mô tả giao dịch</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <input type="text" value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} placeholder="Nhập mô tả giao dịch..." className="input-field w-full pl-9" />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button className="btn-primary text-sm" onClick={applyFilters}>Áp dụng bộ lọc</button>
              {hasActiveFilters && <button className="btn-secondary text-sm" onClick={clearFilters}>Xóa bộ lọc</button>}
            </div>
          </div>
        )}
      </div>

      {/* ─── Transaction List ─────────────────────────────────────────────────── */}
      {loading || data.length > 0 ? (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-header">Ngày</th>
                  <th className="table-header">Mô tả</th>
                  <th className="table-header">Tài khoản</th>
                  <th className="table-header">Khách hàng</th>
                  <th className="table-header">Nhà cung cấp</th>
                  <th className="table-header text-right">Ghi nợ</th>
                  <th className="table-header text-right">Ghi có</th>
                  <th className="table-header text-right">Số dư</th>
                  <th className="table-header">Ghi chú</th>
                  <th className="table-header w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
                        <p className="text-sm text-gray-500">Đang tải...</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  data.map((row) => (
                    <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                      <td className="table-cell text-gray-500 whitespace-nowrap">
                        {formatDate(row.ngay_gio_giao_dich)}
                      </td>
                      <td className="table-cell">
                        <span className="font-medium text-gray-900">{row.mo_ta_giao_dich}</span>
                      </td>
                      <td className="table-cell text-gray-700">{getTaiKhoanName(row)}</td>
                      <td className="table-cell text-gray-700">{getKhachHangName(row)}</td>
                      <td className="table-cell text-gray-700">{getNhaCungCapName(row)}</td>
                      <td className="table-cell text-right whitespace-nowrap">
                        {row.ghi_no > 0 ? <span className="font-semibold text-green-600">{formatVND(row.ghi_no)}</span> : <span className="text-gray-300">--</span>}
                      </td>
                      <td className="table-cell text-right whitespace-nowrap">
                        {row.ghi_co > 0 ? <span className="font-semibold text-red-600">{formatVND(row.ghi_co)}</span> : <span className="text-gray-300">--</span>}
                      </td>
                      <td className="table-cell text-right whitespace-nowrap font-medium text-gray-900">
                        {formatVND(row.so_du)}
                      </td>
                      <td className="table-cell text-gray-500 max-w-[200px] truncate">{row.ghi_chu || '--'}</td>
                      <td className="table-cell">
                        <div className="flex items-center justify-end gap-1">
                          {isAdmin() && (
                            <>
                              <button onClick={() => openEditModal(row)} className="p-1.5 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-colors" title="Sửa">
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button onClick={() => setDeleteTarget(row)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Xóa">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
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

      {/* ─── Add/Edit Modal ───────────────────────────────────────────────────── */}
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
          <div className="flex border-b border-gray-200">
            <button
              className={`flex-1 py-2 text-sm font-medium text-center border-b-2 transition-colors ${activeTab === 'thu' ? 'border-green-600 text-green-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              onClick={() => setActiveTab('thu')}
            >
              <span className="flex items-center justify-center gap-1.5"><ArrowUpRight className="w-4 h-4" />Thu</span>
            </button>
            <button
              className={`flex-1 py-2 text-sm font-medium text-center border-b-2 transition-colors ${activeTab === 'chi' ? 'border-red-600 text-red-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              onClick={() => setActiveTab('chi')}
            >
              <span className="flex items-center justify-center gap-1.5"><ArrowDownRight className="w-4 h-4" />Chi</span>
            </button>
          </div>

          {activeTab === 'thu' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ngày giao dịch <span className="text-red-500">*</span></label>
                <input type="date" value={thuForm.ngay_gio_giao_dich} onChange={(e) => setThuForm((f) => ({ ...f, ngay_gio_giao_dich: e.target.value }))} className="input-field w-full" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tài khoản <span className="text-red-500">*</span></label>
                <select value={thuForm.tai_khoan_id} onChange={(e) => setThuForm((f) => ({ ...f, tai_khoan_id: e.target.value }))} className="select-field w-full">
                  <option value="">-- Chọn tài khoản --</option>
                  {taiKhoanList.map((tk) => <option key={tk.id} value={tk.id}>{tk.ten_tai_khoan}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả giao dịch <span className="text-red-500">*</span></label>
                <input type="text" value={thuForm.mo_ta_giao_dich} onChange={(e) => setThuForm((f) => ({ ...f, mo_ta_giao_dich: e.target.value }))} className="input-field w-full" placeholder="Nhập mô tả giao dịch" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Số tiền thu <span className="text-red-500">*</span></label>
                <input type="number" value={thuForm.ghi_no} onChange={(e) => setThuForm((f) => ({ ...f, ghi_no: e.target.value }))} className="input-field w-full" min={0} placeholder="0" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Khách hàng</label>
                <select value={thuForm.khach_hang_id} onChange={(e) => setThuForm((f) => ({ ...f, khach_hang_id: e.target.value }))} className="select-field w-full">
                  <option value="">-- Chọn khách hàng --</option>
                  {khachHangList.map((kh) => <option key={kh.id} value={kh.id}>{kh.ten_cong_ty}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Hợp đồng bán</label>
                <select value={thuForm.hop_dong_id} onChange={(e) => setThuForm((f) => ({ ...f, hop_dong_id: e.target.value }))} className="select-field w-full">
                  <option value="">-- Chọn hợp đồng --</option>
                  {hopDongList.map((hd) => <option key={hd.id} value={hd.id}>{hd.so_hop_dong}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú</label>
                <textarea value={thuForm.ghi_chu} onChange={(e) => setThuForm((f) => ({ ...f, ghi_chu: e.target.value }))} className="input-field w-full" rows={2} placeholder="Ghi chú (tùy chọn)" />
              </div>
            </div>
          )}

          {activeTab === 'chi' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ngày giao dịch <span className="text-red-500">*</span></label>
                <input type="date" value={chiForm.ngay_gio_giao_dich} onChange={(e) => setChiForm((f) => ({ ...f, ngay_gio_giao_dich: e.target.value }))} className="input-field w-full" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tài khoản <span className="text-red-500">*</span></label>
                <select value={chiForm.tai_khoan_id} onChange={(e) => setChiForm((f) => ({ ...f, tai_khoan_id: e.target.value }))} className="select-field w-full">
                  <option value="">-- Chọn tài khoản --</option>
                  {taiKhoanList.map((tk) => <option key={tk.id} value={tk.id}>{tk.ten_tai_khoan}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả giao dịch <span className="text-red-500">*</span></label>
                <input type="text" value={chiForm.mo_ta_giao_dich} onChange={(e) => setChiForm((f) => ({ ...f, mo_ta_giao_dich: e.target.value }))} className="input-field w-full" placeholder="Nhập mô tả giao dịch" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Số tiền chi <span className="text-red-500">*</span></label>
                <input type="number" value={chiForm.ghi_co} onChange={(e) => setChiForm((f) => ({ ...f, ghi_co: e.target.value }))} className="input-field w-full" min={0} placeholder="0" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nhà cung cấp</label>
                <select value={chiForm.nha_cung_cap_id} onChange={(e) => setChiForm((f) => ({ ...f, nha_cung_cap_id: e.target.value }))} className="select-field w-full">
                  <option value="">-- Chọn nhà cung cấp --</option>
                  {nhaCungCapList.map((ncc) => <option key={ncc.id} value={ncc.id}>{ncc.ten_nha_cung_cap}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Hợp đồng mua</label>
                <select value={chiForm.hop_dong_mua_id} onChange={(e) => setChiForm((f) => ({ ...f, hop_dong_mua_id: e.target.value }))} className="select-field w-full">
                  <option value="">-- Chọn hợp đồng mua --</option>
                  {hopDongMuaList.map((hdm) => <option key={hdm.id} value={hdm.id}>{hdm.so_hop_dong}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Loại chi phí</label>
                <select value={chiForm.loai_chi_phi_id} onChange={(e) => setChiForm((f) => ({ ...f, loai_chi_phi_id: e.target.value }))} className="select-field w-full">
                  <option value="">-- Chọn loại chi phí --</option>
                  {loaiChiPhiList.map((lcp) => <option key={lcp.id} value={lcp.id}>{lcp.ten_loai_chi_phi}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Chi phí</label>
                <select value={chiForm.chi_phi_id} onChange={(e) => setChiForm((f) => ({ ...f, chi_phi_id: e.target.value }))} className="select-field w-full">
                  <option value="">-- Chọn chi phí --</option>
                  {filteredChiPhi.map((cp) => <option key={cp.id} value={cp.id}>{cp.ten_chi_phi}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Chi phí cụ thể</label>
                <select value={chiForm.chi_phi_cu_the_id} onChange={(e) => setChiForm((f) => ({ ...f, chi_phi_cu_the_id: e.target.value }))} className="select-field w-full">
                  <option value="">-- Chọn chi phí cụ thể --</option>
                  {filteredChiPhiCuThe.map((cpc) => <option key={cpc.id} value={cpc.id}>{cpc.ten_chi_phi_cu_the}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú</label>
                <textarea value={chiForm.ghi_chu} onChange={(e) => setChiForm((f) => ({ ...f, ghi_chu: e.target.value }))} className="input-field w-full" rows={2} placeholder="Ghi chú (tùy chọn)" />
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* ─── Delete Confirm Dialog ────────────────────────────────────────────── */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
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
