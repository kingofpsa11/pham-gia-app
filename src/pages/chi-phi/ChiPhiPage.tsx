import { useState, useEffect, useCallback } from 'react';
import { dongTienApi, taiKhoanApi, loaiChiPhiApi, chiPhiApi, chiPhiCuTheApi } from '../../lib/api';
import { useToastStore } from '../../store/toast';
import { useAuthStore } from '../../store/auth';
import { formatVND, formatDate } from '../../lib/utils';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import EmptyState from '../../components/ui/EmptyState';
import Pagination from '../../components/ui/Pagination';
import { CircleDollarSign, Plus, Pencil, Trash2 } from 'lucide-react';
import type { LoaiChiPhi, ChiPhi, ChiPhiCuThe, DongTien, TaiKhoan } from '../../types';

// ─── Types ───────────────────────────────────────────────────────────────────

interface LoaiChiPhiFormValues {
  ten_loai_chi_phi: string;
}

interface ChiPhiFormValues {
  loai_chi_phi_id: string;
  ten_chi_phi: string;
}

interface ChiPhiCuTheFormValues {
  chi_phi_id: string;
  ten_chi_phi_cu_the: string;
}

interface ChiPhiBreakdown {
  id: number;
  ten: string;
  tong_tien: number;
}

interface RecentExpense extends DongTien {
  loai_chi_phi?: LoaiChiPhi;
  chi_phi?: ChiPhi;
  chi_phi_cu_the?: ChiPhiCuThe;
  tai_khoan?: TaiKhoan;
}

const emptyLoaiChiPhiForm: LoaiChiPhiFormValues = {
  ten_loai_chi_phi: '',
};

const emptyChiPhiForm: ChiPhiFormValues = {
  loai_chi_phi_id: '',
  ten_chi_phi: '',
};

const emptyChiPhiCuTheForm: ChiPhiCuTheFormValues = {
  chi_phi_id: '',
  ten_chi_phi_cu_the: '',
};

const PAGE_SIZE = 10;

// ─── Main component ──────────────────────────────────────────────────────────

export default function ChiPhiPage() {
  const addToast = useToastStore((s) => s.addToast);
  const isAdmin = useAuthStore((s) => s.isAdmin);

  // ─── Category data ─────────────────────────────────────────────────────────
  const [loaiChiPhiList, setLoaiChiPhiList] = useState<LoaiChiPhi[]>([]);
  const [chiPhiList, setChiPhiList] = useState<ChiPhi[]>([]);
  const [chiPhiCuTheList, setChiPhiCuTheList] = useState<ChiPhiCuThe[]>([]);

  // ─── Selected items for filtering ──────────────────────────────────────────
  const [selectedLoaiChiPhiId, setSelectedLoaiChiPhiId] = useState<number | null>(null);
  const [selectedChiPhiId, setSelectedChiPhiId] = useState<number | null>(null);

  // ─── Loading states ────────────────────────────────────────────────────────
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingRecent, setLoadingRecent] = useState(true);

  // ─── Summary data ──────────────────────────────────────────────────────────
  const [tongChiPhiThang, setTongChiPhiThang] = useState(0);
  const [breakdownByLoaiChiPhi, setBreakdownByLoaiChiPhi] = useState<ChiPhiBreakdown[]>([]);
  const [breakdownByChiPhi, setBreakdownByChiPhi] = useState<ChiPhiBreakdown[]>([]);
  const [top5Expenses, setTop5Expenses] = useState<RecentExpense[]>([]);

  // ─── Recent transactions ────────────────────────────────────────────────────
  const [recentExpenses, setRecentExpenses] = useState<RecentExpense[]>([]);
  const [recentPage, setRecentPage] = useState(1);
  const [recentTotal, setRecentTotal] = useState(0);

  // ─── Modal states ──────────────────────────────────────────────────────────
  const [loaiChiPhiModalOpen, setLoaiChiPhiModalOpen] = useState(false);
  const [loaiChiPhiForm, setLoaiChiPhiForm] = useState<LoaiChiPhiFormValues>(emptyLoaiChiPhiForm);
  const [editingLoaiChiPhiId, setEditingLoaiChiPhiId] = useState<number | null>(null);
  const [savingLoaiChiPhi, setSavingLoaiChiPhi] = useState(false);

  const [chiPhiModalOpen, setChiPhiModalOpen] = useState(false);
  const [chiPhiForm, setChiPhiForm] = useState<ChiPhiFormValues>(emptyChiPhiForm);
  const [editingChiPhiId, setEditingChiPhiId] = useState<number | null>(null);
  const [savingChiPhi, setSavingChiPhi] = useState(false);

  const [chiPhiCuTheModalOpen, setChiPhiCuTheModalOpen] = useState(false);
  const [chiPhiCuTheForm, setChiPhiCuTheForm] = useState<ChiPhiCuTheFormValues>(emptyChiPhiCuTheForm);
  const [editingChiPhiCuTheId, setEditingChiPhiCuTheId] = useState<number | null>(null);
  const [savingChiPhiCuThe, setSavingChiPhiCuThe] = useState(false);

  // ─── Delete confirm ────────────────────────────────────────────────────────
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'loai_chi_phi' | 'chi_phi' | 'chi_phi_cu_the'; id: number } | null>(null);

  // ─── Lookup data ───────────────────────────────────────────────────────────
  const [_taiKhoanList, setTaiKhoanList] = useState<TaiKhoan[]>([]);

  // ─── Computed filtered lists ───────────────────────────────────────────────
  const filteredChiPhiList = chiPhiList.filter(
    (cp) => !selectedLoaiChiPhiId || cp.loai_chi_phi_id === selectedLoaiChiPhiId
  );

  const filteredChiPhiCuTheList = chiPhiCuTheList.filter(
    (cpct) => !selectedChiPhiId || cpct.chi_phi_id === selectedChiPhiId
  );

  // ─── Load lookup data ──────────────────────────────────────────────────────
  useEffect(() => {
    taiKhoanApi.list().then(({ data }) => { setTaiKhoanList(data as TaiKhoan[]); });
  }, []);

  // ─── Fetch categories ──────────────────────────────────────────────────────
  const fetchCategories = useCallback(async () => {
    setLoadingCategories(true);
    try {
      const [lcpRes, cpRes, cpctRes] = await Promise.all([
        loaiChiPhiApi.list(),
        chiPhiApi.list(),
        chiPhiCuTheApi.list(),
      ]);

      setLoaiChiPhiList((lcpRes.data as LoaiChiPhi[]) || []);
      setChiPhiList((cpRes.data as ChiPhi[]) || []);
      setChiPhiCuTheList((cpctRes.data as ChiPhiCuThe[]) || []);
    } catch (err) {
      console.error('Loi tai danh muc chi phi:', err);
      addToast('error', 'Không thể tải danh mục chi phí');
    } finally {
      setLoadingCategories(false);
    }
  }, [addToast]);

  // ─── Fetch summary ─────────────────────────────────────────────────────────
  const fetchSummary = useCallback(async () => {
    setLoadingSummary(true);
    try {
      const now = new Date();
      const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const endOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()).padStart(2, '0')}`;

      // Get dong_tien with chi_phi fields for this month
      const { data: dongTienData } = await dongTienApi.list({
        date_from: startOfMonth,
        date_to: endOfMonth,
        limit: 99999,
      });

      // Filter to only chi_phi records (ghi_co > 0 and loai_chi_phi_id not null)
      const records = (dongTienData || []).filter((r) => r.ghi_co > 0 && r.loai_chi_phi_id != null);

      // Total expenses this month
      const total = records.reduce((sum, r) => sum + (r.ghi_co || 0), 0);
      setTongChiPhiThang(total);

      // Breakdown by loai_chi_phi
      const byLoai: Record<number, number> = {};
      records.forEach((r) => {
        if (r.loai_chi_phi_id) {
          byLoai[r.loai_chi_phi_id] = (byLoai[r.loai_chi_phi_id] || 0) + (r.ghi_co || 0);
        }
      });

      const loaiIds = Object.keys(byLoai).map(Number);
      if (loaiIds.length > 0) {
        const { data: loaiData } = await loaiChiPhiApi.list();

        const breakdown: ChiPhiBreakdown[] = (loaiData || [])
          .filter((l) => loaiIds.includes(l.id))
          .map((l) => ({
            id: l.id,
            ten: l.ten_loai_chi_phi,
            tong_tien: byLoai[l.id] || 0,
          }));
        breakdown.sort((a, b) => b.tong_tien - a.tong_tien);
        setBreakdownByLoaiChiPhi(breakdown);
      } else {
        setBreakdownByLoaiChiPhi([]);
      }

      // Breakdown by chi_phi
      const byChiPhi: Record<number, number> = {};
      records.forEach((r) => {
        if (r.chi_phi_id) {
          byChiPhi[r.chi_phi_id] = (byChiPhi[r.chi_phi_id] || 0) + (r.ghi_co || 0);
        }
      });

      const cpIds = Object.keys(byChiPhi).map(Number);
      if (cpIds.length > 0) {
        const { data: cpData } = await chiPhiApi.list();

        const breakdownCp: ChiPhiBreakdown[] = (cpData || [])
          .filter((c) => cpIds.includes(c.id))
          .map((c) => ({
            id: c.id,
            ten: c.ten_chi_phi,
            tong_tien: byChiPhi[c.id] || 0,
          }));
        breakdownCp.sort((a, b) => b.tong_tien - a.tong_tien);
        setBreakdownByChiPhi(breakdownCp);
      } else {
        setBreakdownByChiPhi([]);
      }

      // Top 5 largest expenses
      const sorted = [...records].sort((a, b) => (b.ghi_co || 0) - (a.ghi_co || 0));
      const top5 = sorted.slice(0, 5);

      if (top5.length > 0) {
        const loaiIdsForTop5 = [...new Set(top5.map((r) => r.loai_chi_phi_id).filter(Boolean) as number[])];
        const cpIdsForTop5 = [...new Set(top5.map((r) => r.chi_phi_id).filter(Boolean) as number[])];
        const cpctIdsForTop5 = [...new Set(top5.map((r) => r.chi_phi_cu_the_id).filter(Boolean) as number[])];

        const [loaiRes, cpRes2, cpctRes2] = await Promise.all([
          loaiIdsForTop5.length > 0
            ? loaiChiPhiApi.list()
            : Promise.resolve({ data: [] }),
          cpIdsForTop5.length > 0
            ? chiPhiApi.list()
            : Promise.resolve({ data: [] }),
          cpctIdsForTop5.length > 0
            ? chiPhiCuTheApi.list()
            : Promise.resolve({ data: [] }),
        ]);

        const loaiMap = Object.fromEntries((loaiRes.data || []).filter((l) => loaiIdsForTop5.includes(l.id)).map((l) => [l.id, l]));
        const cpMap = Object.fromEntries((cpRes2.data || []).filter((c) => cpIdsForTop5.includes(c.id)).map((c) => [c.id, c]));
        const cpctMap = Object.fromEntries((cpctRes2.data || []).filter((c) => cpctIdsForTop5.includes(c.id)).map((c) => [c.id, c]));

        const top5WithNames: RecentExpense[] = top5.map((r) => ({
          ngay_gio_giao_dich: r.ngay_gio_giao_dich || '',
          ghi_no: 0,
          ...r,
          loai_chi_phi: r.loai_chi_phi_id ? loaiMap[r.loai_chi_phi_id] : undefined,
          chi_phi: r.chi_phi_id ? cpMap[r.chi_phi_id] : undefined,
          chi_phi_cu_the: r.chi_phi_cu_the_id ? cpctMap[r.chi_phi_cu_the_id] : undefined,
        }));
        setTop5Expenses(top5WithNames);
      } else {
        setTop5Expenses([]);
      }
    } catch (err) {
      console.error('Loi tai tong hop chi phi:', err);
      addToast('error', 'Không thể tải tổng hợp chi phí');
    } finally {
      setLoadingSummary(false);
    }
  }, [addToast]);

  // ─── Fetch recent expense transactions ─────────────────────────────────────
  const fetchRecentExpenses = useCallback(async () => {
    setLoadingRecent(true);
    try {
      const { data: allData, total } = await dongTienApi.list({
        page: recentPage,
        limit: PAGE_SIZE,
      });

      // Filter to only chi_phi records (ghi_co > 0 and loai_chi_phi_id not null)
      const records = (allData || []).filter((r) => r.ghi_co > 0 && r.loai_chi_phi_id != null);
      setRecentTotal(total);

      // Fetch related names
      if (records.length > 0) {
        const loaiIds = [...new Set(records.map((r) => r.loai_chi_phi_id).filter(Boolean) as number[])];
        const cpIds = [...new Set(records.map((r) => r.chi_phi_id).filter(Boolean) as number[])];
        const cpctIds = [...new Set(records.map((r) => r.chi_phi_cu_the_id).filter(Boolean) as number[])];
        const tkIds = [...new Set(records.map((r) => r.tai_khoan_id).filter(Boolean) as number[])];

        const [loaiRes, cpRes3, cpctRes3, tkRes] = await Promise.all([
          loaiIds.length > 0
            ? loaiChiPhiApi.list()
            : Promise.resolve({ data: [] }),
          cpIds.length > 0
            ? chiPhiApi.list()
            : Promise.resolve({ data: [] }),
          cpctIds.length > 0
            ? chiPhiCuTheApi.list()
            : Promise.resolve({ data: [] }),
          tkIds.length > 0
            ? taiKhoanApi.list()
            : Promise.resolve({ data: [] }),
        ]);

        const loaiMap = Object.fromEntries((loaiRes.data || []).filter((l) => loaiIds.includes(l.id)).map((l) => [l.id, l]));
        const cpMap = Object.fromEntries((cpRes3.data || []).filter((c) => cpIds.includes(c.id)).map((c) => [c.id, c]));
        const cpctMap = Object.fromEntries((cpctRes3.data || []).filter((c) => cpctIds.includes(c.id)).map((c) => [c.id, c]));
        const tkMap = Object.fromEntries((tkRes.data || []).filter((t) => tkIds.includes(t.id)).map((t) => [t.id, t]));

        const enriched: RecentExpense[] = records.map((r) => ({
          ...r,
          loai_chi_phi: r.loai_chi_phi_id ? loaiMap[r.loai_chi_phi_id] : undefined,
          chi_phi: r.chi_phi_id ? cpMap[r.chi_phi_id] : undefined,
          chi_phi_cu_the: r.chi_phi_cu_the_id ? cpctMap[r.chi_phi_cu_the_id] : undefined,
          tai_khoan: r.tai_khoan_id ? tkMap[r.tai_khoan_id] : undefined,
        }));
        setRecentExpenses(enriched);
      } else {
        setRecentExpenses([]);
      }
    } catch (err) {
      console.error('Loi tai giao dich chi phi:', err);
      addToast('error', 'Không thể tải giao dịch chi phí');
    } finally {
      setLoadingRecent(false);
    }
  }, [addToast, recentPage]);

  // ─── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    fetchCategories();
    fetchSummary();
    fetchRecentExpenses();
  }, [fetchCategories, fetchSummary, fetchRecentExpenses]);

  // ─── Category CRUD handlers ────────────────────────────────────────────────

  // --- Loai chi phi ---
  function openAddLoaiChiPhi() {
    setLoaiChiPhiForm(emptyLoaiChiPhiForm);
    setEditingLoaiChiPhiId(null);
    setLoaiChiPhiModalOpen(true);
  }

  function openEditLoaiChiPhi(item: LoaiChiPhi) {
    setLoaiChiPhiForm({ ten_loai_chi_phi: item.ten_loai_chi_phi });
    setEditingLoaiChiPhiId(item.id);
    setLoaiChiPhiModalOpen(true);
  }

  async function handleSaveLoaiChiPhi() {
    if (!loaiChiPhiForm.ten_loai_chi_phi.trim()) {
      addToast('warning', 'Vui lòng nhập tên loại chi phí');
      return;
    }
    setSavingLoaiChiPhi(true);
    try {
      if (editingLoaiChiPhiId) {
        await loaiChiPhiApi.update(editingLoaiChiPhiId, { ten_loai_chi_phi: loaiChiPhiForm.ten_loai_chi_phi.trim() });
        addToast('success', 'Cập nhật loại chi phí thành công');
      } else {
        await loaiChiPhiApi.create({ ten_loai_chi_phi: loaiChiPhiForm.ten_loai_chi_phi.trim() });
        addToast('success', 'Thêm loại chi phí thành công');
      }
      setLoaiChiPhiModalOpen(false);
      fetchCategories();
      fetchSummary();
    } catch (err) {
      console.error('Loi luu loai chi phi:', err);
      addToast('error', 'Không thể lưu loại chi phí');
    } finally {
      setSavingLoaiChiPhi(false);
    }
  }

  // --- Chi phi ---
  function openAddChiPhi() {
    setChiPhiForm({
      ...emptyChiPhiForm,
      loai_chi_phi_id: selectedLoaiChiPhiId ? String(selectedLoaiChiPhiId) : '',
    });
    setEditingChiPhiId(null);
    setChiPhiModalOpen(true);
  }

  function openEditChiPhi(item: ChiPhi) {
    setChiPhiForm({
      loai_chi_phi_id: String(item.loai_chi_phi_id),
      ten_chi_phi: item.ten_chi_phi,
    });
    setEditingChiPhiId(item.id);
    setChiPhiModalOpen(true);
  }

  async function handleSaveChiPhi() {
    if (!chiPhiForm.loai_chi_phi_id) {
      addToast('warning', 'Vui lòng chọn loại chi phí');
      return;
    }
    if (!chiPhiForm.ten_chi_phi.trim()) {
      addToast('warning', 'Vui lòng nhập tên chi phí');
      return;
    }
    setSavingChiPhi(true);
    try {
      if (editingChiPhiId) {
        await chiPhiApi.update(editingChiPhiId, {
          loai_chi_phi_id: Number(chiPhiForm.loai_chi_phi_id),
          ten_chi_phi: chiPhiForm.ten_chi_phi.trim(),
        });
        addToast('success', 'Cập nhật chi phí thành công');
      } else {
        await chiPhiApi.create({
          loai_chi_phi_id: Number(chiPhiForm.loai_chi_phi_id),
          ten_chi_phi: chiPhiForm.ten_chi_phi.trim(),
        });
        addToast('success', 'Thêm chi phí thành công');
      }
      setChiPhiModalOpen(false);
      fetchCategories();
      fetchSummary();
    } catch (err) {
      console.error('Loi luu chi phi:', err);
      addToast('error', 'Không thể lưu chi phí');
    } finally {
      setSavingChiPhi(false);
    }
  }

  // --- Chi phi cu the ---
  function openAddChiPhiCuThe() {
    setChiPhiCuTheForm({
      ...emptyChiPhiCuTheForm,
      chi_phi_id: selectedChiPhiId ? String(selectedChiPhiId) : '',
    });
    setEditingChiPhiCuTheId(null);
    setChiPhiCuTheModalOpen(true);
  }

  function openEditChiPhiCuThe(item: ChiPhiCuThe) {
    setChiPhiCuTheForm({
      chi_phi_id: String(item.chi_phi_id),
      ten_chi_phi_cu_the: item.ten_chi_phi_cu_the,
    });
    setEditingChiPhiCuTheId(item.id);
    setChiPhiCuTheModalOpen(true);
  }

  async function handleSaveChiPhiCuThe() {
    if (!chiPhiCuTheForm.chi_phi_id) {
      addToast('warning', 'Vui lòng chọn chi phí');
      return;
    }
    if (!chiPhiCuTheForm.ten_chi_phi_cu_the.trim()) {
      addToast('warning', 'Vui lòng nhập tên chi phí cụ thể');
      return;
    }
    setSavingChiPhiCuThe(true);
    try {
      if (editingChiPhiCuTheId) {
        await chiPhiCuTheApi.update(editingChiPhiCuTheId, {
          chi_phi_id: Number(chiPhiCuTheForm.chi_phi_id),
          ten_chi_phi_cu_the: chiPhiCuTheForm.ten_chi_phi_cu_the.trim(),
        });
        addToast('success', 'Cập nhật chi phí cụ thể thành công');
      } else {
        await chiPhiCuTheApi.create({
          chi_phi_id: Number(chiPhiCuTheForm.chi_phi_id),
          ten_chi_phi_cu_the: chiPhiCuTheForm.ten_chi_phi_cu_the.trim(),
        });
        addToast('success', 'Thêm chi phí cụ thể thành công');
      }
      setChiPhiCuTheModalOpen(false);
      fetchCategories();
      fetchSummary();
    } catch (err) {
      console.error('Loi luu chi phi cu the:', err);
      addToast('error', 'Không thể lưu chi phí cụ thể');
    } finally {
      setSavingChiPhiCuThe(false);
    }
  }

  // --- Delete ---
  function openDeleteDialog(type: 'loai_chi_phi' | 'chi_phi' | 'chi_phi_cu_the', id: number) {
    setDeleteTarget({ type, id });
    setDeleteDialogOpen(true);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.type === 'loai_chi_phi') {
        await loaiChiPhiApi.delete(deleteTarget.id);
      } else if (deleteTarget.type === 'chi_phi') {
        await chiPhiApi.delete(deleteTarget.id);
      } else {
        await chiPhiCuTheApi.delete(deleteTarget.id);
      }

      const labels = {
        loai_chi_phi: 'loại chi phí',
        chi_phi: 'chi phí',
        chi_phi_cu_the: 'chi phí cụ thể',
      };
      addToast('success', `Xóa ${labels[deleteTarget.type]} thành công`);

      // Reset selection if deleted item was selected
      if (deleteTarget.type === 'loai_chi_phi' && deleteTarget.id === selectedLoaiChiPhiId) {
        setSelectedLoaiChiPhiId(null);
        setSelectedChiPhiId(null);
      }
      if (deleteTarget.type === 'chi_phi' && deleteTarget.id === selectedChiPhiId) {
        setSelectedChiPhiId(null);
      }

      fetchCategories();
      fetchSummary();
      fetchRecentExpenses();
    } catch (err) {
      console.error('Loi xoa:', err);
      addToast('error', 'Không thể xóa. Có thể còn dữ liệu liên quan.');
    }
  }

  // ─── Selection handlers ────────────────────────────────────────────────────
  function handleSelectLoaiChiPhi(id: number | null) {
    setSelectedLoaiChiPhiId(id);
    setSelectedChiPhiId(null);
  }

  function handleSelectChiPhi(id: number | null) {
    setSelectedChiPhiId(id);
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Chi phí</h1>
        <p className="mt-1 text-sm text-gray-500">Quản lý danh mục chi phí và báo cáo chi phí</p>
      </div>

      {/* ─── Summary Cards ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center">
              <CircleDollarSign className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Tổng chi phí tháng này</p>
              <p className="text-lg font-bold text-gray-900">
                {loadingSummary ? (
                  <span className="inline-block w-24 h-6 bg-gray-100 rounded animate-pulse" />
                ) : (
                  formatVND(tongChiPhiThang)
                )}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center">
              <CircleDollarSign className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Số loại chi phí</p>
              <p className="text-lg font-bold text-gray-900">
                {loadingCategories ? (
                  <span className="inline-block w-12 h-6 bg-gray-100 rounded animate-pulse" />
                ) : (
                  loaiChiPhiList.length
                )}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <CircleDollarSign className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Giao dịch chi phí tháng này</p>
              <p className="text-lg font-bold text-gray-900">
                {loadingSummary ? (
                  <span className="inline-block w-12 h-6 bg-gray-100 rounded animate-pulse" />
                ) : (
                  recentTotal
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Three-level Category Management ──────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Danh mục chi phí</h2>
          <p className="text-sm text-gray-500">Quản lý cấp bậc: Loại chi phí - Chi phí - Chi phí cụ thể</p>
        </div>

        {loadingCategories ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
            <span className="ml-2 text-sm text-gray-500">Đang tải...</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-gray-200">
            {/* Column 1: Loai chi phi */}
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-700">Loại chi phí</h3>
                {isAdmin() && (
                  <button
                    onClick={openAddLoaiChiPhi}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-primary-600 bg-primary-50 hover:bg-primary-100 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Thêm
                  </button>
                )}
              </div>

              {loaiChiPhiList.length === 0 ? (
                <p className="text-sm text-gray-400 italic py-4 text-center">Chưa có loại chi phí</p>
              ) : (
                <ul className="space-y-1">
                  {loaiChiPhiList.map((lcp) => (
                    <li
                      key={lcp.id}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                        selectedLoaiChiPhiId === lcp.id
                          ? 'bg-primary-50 text-primary-700'
                          : 'hover:bg-gray-50 text-gray-700'
                      }`}
                      onClick={() => handleSelectLoaiChiPhi(lcp.id)}
                    >
                      <span className="text-sm font-medium truncate">{lcp.ten_loai_chi_phi}</span>
                      {isAdmin() && (
                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); openEditLoaiChiPhi(lcp); }}
                            className="p-1 rounded text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                            title="Sửa"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); openDeleteDialog('loai_chi_phi', lcp.id); }}
                            className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="Xóa"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Column 2: Chi phi */}
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-700">
                  Chi phí
                  {selectedLoaiChiPhiId && (
                    <span className="ml-1 font-normal text-gray-400">
                      ({loaiChiPhiList.find((l) => l.id === selectedLoaiChiPhiId)?.ten_loai_chi_phi})
                    </span>
                  )}
                </h3>
                {isAdmin() && (
                  <button
                    onClick={openAddChiPhi}
                    disabled={!selectedLoaiChiPhiId}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-primary-600 bg-primary-50 hover:bg-primary-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Thêm
                  </button>
                )}
              </div>

              {!selectedLoaiChiPhiId ? (
                <p className="text-sm text-gray-400 italic py-4 text-center">Chọn loại chi phí để xem</p>
              ) : filteredChiPhiList.length === 0 ? (
                <p className="text-sm text-gray-400 italic py-4 text-center">Chưa có chi phí</p>
              ) : (
                <ul className="space-y-1">
                  {filteredChiPhiList.map((cp) => (
                    <li
                      key={cp.id}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                        selectedChiPhiId === cp.id
                          ? 'bg-primary-50 text-primary-700'
                          : 'hover:bg-gray-50 text-gray-700'
                      }`}
                      onClick={() => handleSelectChiPhi(cp.id)}
                    >
                      <span className="text-sm font-medium truncate">{cp.ten_chi_phi}</span>
                      {isAdmin() && (
                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); openEditChiPhi(cp); }}
                            className="p-1 rounded text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                            title="Sửa"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); openDeleteDialog('chi_phi', cp.id); }}
                            className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="Xóa"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Column 3: Chi phi cu the */}
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-700">
                  Chi phí cụ thể
                  {selectedChiPhiId && (
                    <span className="ml-1 font-normal text-gray-400">
                      ({chiPhiList.find((c) => c.id === selectedChiPhiId)?.ten_chi_phi})
                    </span>
                  )}
                </h3>
                {isAdmin() && (
                  <button
                    onClick={openAddChiPhiCuThe}
                    disabled={!selectedChiPhiId}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-primary-600 bg-primary-50 hover:bg-primary-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Thêm
                  </button>
                )}
              </div>

              {!selectedChiPhiId ? (
                <p className="text-sm text-gray-400 italic py-4 text-center">Chọn chi phí để xem</p>
              ) : filteredChiPhiCuTheList.length === 0 ? (
                <p className="text-sm text-gray-400 italic py-4 text-center">Chưa có chi phí cụ thể</p>
              ) : (
                <ul className="space-y-1">
                  {filteredChiPhiCuTheList.map((cpct) => (
                    <li
                      key={cpct.id}
                      className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors text-gray-700"
                    >
                      <span className="text-sm font-medium truncate">{cpct.ten_chi_phi_cu_the}</span>
                      {isAdmin() && (
                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          <button
                            onClick={() => openEditChiPhiCuThe(cpct)}
                            className="p-1 rounded text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                            title="Sửa"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => openDeleteDialog('chi_phi_cu_the', cpct.id)}
                            className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="Xóa"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ─── Expense Breakdown ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Breakdown by loai chi phi */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Chi phí theo loại chi phí tháng này</h2>
          {loadingSummary ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
            </div>
          ) : breakdownByLoaiChiPhi.length === 0 ? (
            <p className="text-sm text-gray-400 italic py-4 text-center">Chưa có chi phí tháng này</p>
          ) : (
            <div className="space-y-3">
              {breakdownByLoaiChiPhi.map((item) => {
                const percent = tongChiPhiThang > 0 ? (item.tong_tien / tongChiPhiThang) * 100 : 0;
                return (
                  <div key={item.id}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-700">{item.ten}</span>
                      <span className="text-sm font-semibold text-gray-900">{formatVND(item.tong_tien)}</span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-red-500 rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(percent, 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Breakdown by chi phi */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Chi phí theo chi phí tháng này</h2>
          {loadingSummary ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
            </div>
          ) : breakdownByChiPhi.length === 0 ? (
            <p className="text-sm text-gray-400 italic py-4 text-center">Chưa có chi phí tháng này</p>
          ) : (
            <div className="space-y-3">
              {breakdownByChiPhi.map((item) => {
                const percent = tongChiPhiThang > 0 ? (item.tong_tien / tongChiPhiThang) * 100 : 0;
                return (
                  <div key={item.id}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-700">{item.ten}</span>
                      <span className="text-sm font-semibold text-gray-900">{formatVND(item.tong_tien)}</span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-500 rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(percent, 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ─── Top 5 Expenses ──────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">5 chi phí lớn nhất tháng này</h2>
        {loadingSummary ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
          </div>
        ) : top5Expenses.length === 0 ? (
          <p className="text-sm text-gray-400 italic py-4 text-center">Chua co chi phi thang nay</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-header">Ngày</th>
                  <th className="table-header">Mô tả</th>
                  <th className="table-header">Loại chi phí</th>
                  <th className="table-header">Chi phí</th>
                  <th className="table-header text-right">Số tiền</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {top5Expenses.map((dt) => (
                  <tr key={dt.id} className="hover:bg-gray-50 transition-colors">
                    <td className="table-cell">{formatDate(dt.ngay_gio_giao_dich)}</td>
                    <td className="table-cell max-w-[200px] truncate">{dt.mo_ta_giao_dich}</td>
                    <td className="table-cell">{dt.loai_chi_phi?.ten_loai_chi_phi || '--'}</td>
                    <td className="table-cell">{dt.chi_phi?.ten_chi_phi || '--'}</td>
                    <td className="table-cell text-right whitespace-nowrap font-semibold text-red-600">
                      {formatVND(dt.ghi_co)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── Recent Expense Transactions ──────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Giao dịch chi phí gần đây</h2>
        </div>

        {loadingRecent ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
            <span className="ml-2 text-sm text-gray-500">Đang tải...</span>
          </div>
        ) : recentExpenses.length === 0 ? (
          <EmptyState
            icon={CircleDollarSign}
            title="Không có giao dịch chi phí"
            description="Chưa có giao dịch chi phí nào"
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="table-header">Ngày</th>
                    <th className="table-header">Mô tả</th>
                    <th className="table-header">Loại chi phí</th>
                    <th className="table-header">Chi phí</th>
                    <th className="table-header">Chi phí cụ thể</th>
                    <th className="table-header text-right">Số tiền</th>
                    <th className="table-header">Tài khoản</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {recentExpenses.map((dt) => (
                    <tr key={dt.id} className="hover:bg-gray-50 transition-colors">
                      <td className="table-cell whitespace-nowrap">{formatDate(dt.ngay_gio_giao_dich)}</td>
                      <td className="table-cell max-w-[200px] truncate">{dt.mo_ta_giao_dich}</td>
                      <td className="table-cell">{dt.loai_chi_phi?.ten_loai_chi_phi || '--'}</td>
                      <td className="table-cell">{dt.chi_phi?.ten_chi_phi || '--'}</td>
                      <td className="table-cell">{dt.chi_phi_cu_the?.ten_chi_phi_cu_the || '--'}</td>
                      <td className="table-cell text-right whitespace-nowrap font-semibold text-red-600">
                        {formatVND(dt.ghi_co)}
                      </td>
                      <td className="table-cell">{dt.tai_khoan?.ten_tai_khoan || '--'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {recentTotal > PAGE_SIZE && (
              <div className="px-6 py-4 border-t border-gray-200">
                <Pagination
                  currentPage={recentPage}
                  totalPages={Math.ceil(recentTotal / PAGE_SIZE)}
                  onPageChange={setRecentPage}
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* ─── Loai Chi Phi Modal ───────────────────────────────────────────── */}
      <Modal
        open={loaiChiPhiModalOpen}
        onOpenChange={setLoaiChiPhiModalOpen}
        title={editingLoaiChiPhiId ? 'Sửa loại chi phí' : 'Thêm loại chi phí'}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setLoaiChiPhiModalOpen(false)} disabled={savingLoaiChiPhi}>
              Hủy
            </button>
            <button className="btn-primary" onClick={handleSaveLoaiChiPhi} disabled={savingLoaiChiPhi}>
              {savingLoaiChiPhi ? 'Đang lưu...' : 'Lưu'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tên loại chi phí <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={loaiChiPhiForm.ten_loai_chi_phi}
              onChange={(e) => setLoaiChiPhiForm((f) => ({ ...f, ten_loai_chi_phi: e.target.value }))}
              className="input-field w-full"
              placeholder="Nhập tên loại chi phí"
            />
          </div>
        </div>
      </Modal>

      {/* ─── Chi Phi Modal ────────────────────────────────────────────────── */}
      <Modal
        open={chiPhiModalOpen}
        onOpenChange={setChiPhiModalOpen}
        title={editingChiPhiId ? 'Sửa chi phí' : 'Thêm chi phí'}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setChiPhiModalOpen(false)} disabled={savingChiPhi}>
              Hủy
            </button>
            <button className="btn-primary" onClick={handleSaveChiPhi} disabled={savingChiPhi}>
              {savingChiPhi ? 'Đang lưu...' : 'Lưu'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Loại chi phí <span className="text-red-500">*</span>
            </label>
            <select
              value={chiPhiForm.loai_chi_phi_id}
              onChange={(e) => setChiPhiForm((f) => ({ ...f, loai_chi_phi_id: e.target.value }))}
              className="select-field w-full"
            >
              <option value="">-- Chọn loại chi phí --</option>
              {loaiChiPhiList.map((lcp) => (
                <option key={lcp.id} value={lcp.id}>{lcp.ten_loai_chi_phi}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tên chi phí <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={chiPhiForm.ten_chi_phi}
              onChange={(e) => setChiPhiForm((f) => ({ ...f, ten_chi_phi: e.target.value }))}
              className="input-field w-full"
              placeholder="Nhập tên chi phí"
            />
          </div>
        </div>
      </Modal>

      {/* ─── Chi Phi Cu The Modal ─────────────────────────────────────────── */}
      <Modal
        open={chiPhiCuTheModalOpen}
        onOpenChange={setChiPhiCuTheModalOpen}
        title={editingChiPhiCuTheId ? 'Sửa chi phí cụ thể' : 'Thêm chi phí cụ thể'}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setChiPhiCuTheModalOpen(false)} disabled={savingChiPhiCuThe}>
              Hủy
            </button>
            <button className="btn-primary" onClick={handleSaveChiPhiCuThe} disabled={savingChiPhiCuThe}>
              {savingChiPhiCuThe ? 'Đang lưu...' : 'Lưu'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Chi phí <span className="text-red-500">*</span>
            </label>
            <select
              value={chiPhiCuTheForm.chi_phi_id}
              onChange={(e) => setChiPhiCuTheForm((f) => ({ ...f, chi_phi_id: e.target.value }))}
              className="select-field w-full"
            >
              <option value="">-- Chọn chi phí --</option>
              {filteredChiPhiList.map((cp) => (
                <option key={cp.id} value={cp.id}>{cp.ten_chi_phi}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tên chi phí cụ thể <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={chiPhiCuTheForm.ten_chi_phi_cu_the}
              onChange={(e) => setChiPhiCuTheForm((f) => ({ ...f, ten_chi_phi_cu_the: e.target.value }))}
              className="input-field w-full"
              placeholder="Nhập tên chi phí cụ thể"
            />
          </div>
        </div>
      </Modal>

      {/* ─── Delete Confirm ───────────────────────────────────────────────── */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Xác nhận xóa"
        description="Bạn có chắc chắn muốn xóa? Hành động này không thể hoàn tác."
        onConfirm={handleDelete}
        confirmText="Xóa"
        cancelText="Hủy"
        variant="danger"
      />
    </div>
  );
}
