import { useState, useEffect, useCallback } from 'react';
import { nhaCungCapApi, dongTienApi, taiKhoanApi } from '../../lib/api';
import { useToastStore } from '../../store/toast';
import { useAuthStore } from '../../store/auth';
import { formatVND, formatDate, getTodayInputValue } from '../../lib/utils';
import Modal from '../../components/ui/Modal';
import SearchInput from '../../components/ui/SearchInput';
import Pagination from '../../components/ui/Pagination';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import EmptyState from '../../components/ui/EmptyState';
import { Building2, Plus, Pencil, Trash2, Search, ChevronDown, ChevronRight, Banknote } from 'lucide-react';
import type { NhaCungCap, HopDongMua, HoaDonNhap, DongTien, TaiKhoan } from '../../types';

const PAGE_SIZE = 10;

// ─── Add/Edit form ────────────────────────────────────────────────────────────
interface FormValues {
  ten_nha_cung_cap: string;
  dien_thoai: string;
  dia_chi: string;
}

const emptyForm: FormValues = {
  ten_nha_cung_cap: '',
  dien_thoai: '',
  dia_chi: '',
};

// ─── Payment form ─────────────────────────────────────────────────────────────
interface PaymentFormValues {
  ngay_gio_giao_dich: string;
  tai_khoan_id: string;
  nha_cung_cap_id: string;
  hop_dong_mua_id: string;
  mo_ta_giao_dich: string;
  ghi_co: string;
  ghi_chu: string;
}

const emptyPaymentForm: PaymentFormValues = {
  ngay_gio_giao_dich: getTodayInputValue(),
  tai_khoan_id: '',
  nha_cung_cap_id: '',
  hop_dong_mua_id: '',
  mo_ta_giao_dich: '',
  ghi_co: '',
  ghi_chu: '',
};

// ─── Expanded row data ────────────────────────────────────────────────────────
interface ExpandedData {
  hop_dong_mua: HopDongMua[];
  hoa_don_nhap: HoaDonNhap[];
  dong_tien: DongTien[];
  loading: boolean;
}

export default function NhaCungCapList() {
  const addToast = useToastStore((s) => s.addToast);
  const isAdmin = useAuthStore((s) => s.isAdmin);

  // ─── Supplier list state ──────────────────────────────────────────────────
  const [data, setData] = useState<NhaCungCap[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // ─── Add/Edit modal state ─────────────────────────────────────────────────
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormValues>(emptyForm);
  const [saving, setSaving] = useState(false);

  // ─── Delete confirm state ────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<NhaCungCap | null>(null);

  // ─── Payment modal state ─────────────────────────────────────────────────
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentForm, setPaymentForm] = useState<PaymentFormValues>(emptyPaymentForm);
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [taiKhoanList, setTaiKhoanList] = useState<TaiKhoan[]>([]);
  const [hopDongMuaByNcc, setHopDongMuaByNcc] = useState<HopDongMua[]>([]);

  // ─── Expanded rows state ─────────────────────────────────────────────────
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [expandedData, setExpandedData] = useState<ExpandedData>({
    hop_dong_mua: [],
    hoa_don_nhap: [],
    dong_tien: [],
    loading: false,
  });

  // ─── Aggregated data per supplier ────────────────────────────────────────
  const [aggregates, setAggregates] = useState<
    Record<number, { so_hoa_don_mua: number; tong_gia_tri_hoa_don_mua: number; tong_da_thanh_toan: number }>
  >({});

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // ─── Fetch supplier list ─────────────────────────────────────────────────
  const fetchNhaCungCap = useCallback(async () => {
    setLoading(true);
    try {
      const { data: rows, total } = await nhaCungCapApi.list({
        search: search.trim() || undefined,
        page: currentPage,
        limit: PAGE_SIZE,
      });

      setData((rows as NhaCungCap[]) || []);
      setTotalCount(total || 0);

      // Fetch aggregate data for current page suppliers
      if (rows && rows.length > 0) {
        const nccIds = rows.map((r) => r.id);
        fetchAggregates(nccIds);
      }
    } catch (err) {
      console.error('Lỗi tải danh sách nhà cung cấp:', err);
      addToast('error', 'Không thể tải danh sách nhà cung cấp');
    } finally {
      setLoading(false);
    }
  }, [currentPage, search, addToast]);

  // ─── Fetch aggregate data (so HD mua, tong gia tri, tong da thanh toan) ──
  async function fetchAggregates(nccIds: number[]) {
    try {
      // Fetch hop_dong_mua for each nha_cung_cap using nhaCungCapApi.hopDongMua
      const aggMap: Record<number, { so_hoa_don_mua: number; tong_gia_tri_hoa_don_mua: number; tong_da_thanh_toan: number }> = {};

      for (const id of nccIds) {
        aggMap[id] = { so_hoa_don_mua: 0, tong_gia_tri_hoa_don_mua: 0, tong_da_thanh_toan: 0 };
      }

      // Fetch all hop_dong_mua and dong_tien for these nccIds
      const hdmPromises = nccIds.map((id) => nhaCungCapApi.hopDongMua(id));
      const dtPromises = nccIds.map((id) => dongTienApi.list({ nha_cung_cap_id: String(id), limit: 99999 }));

      const [hdmResults, dtResults] = await Promise.all([
        Promise.all(hdmPromises),
        Promise.all(dtPromises),
      ]);

      for (let i = 0; i < nccIds.length; i++) {
        const nccId = nccIds[i];
        const hdmData = hdmResults[i].data || [];
        aggMap[nccId].so_hoa_don_mua = hdmData.length;
        aggMap[nccId].tong_gia_tri_hoa_don_mua = hdmData.reduce((sum, r) => sum + (r.tong_gia_tri || 0), 0);

        const dtData = dtResults[i].data || [];
        aggMap[nccId].tong_da_thanh_toan = dtData.reduce((sum, r) => sum + (r.ghi_co || 0), 0);
      }

      setAggregates((prev) => ({ ...prev, ...aggMap }));
    } catch (err) {
      console.error('Lỗi tải thống kê nhà cung cấp:', err);
    }
  }

  useEffect(() => {
    fetchNhaCungCap();
  }, [fetchNhaCungCap]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  // ─── Load tai_khoan list for payment modal ───────────────────────────────
  useEffect(() => {
    taiKhoanApi.list().then(({ data }) => {
      setTaiKhoanList(data as TaiKhoan[]);
    });
  }, []);

  // ─── Load hop_dong_mua for the selected nha_cung_cap when payment modal opens
  useEffect(() => {
    if (paymentForm.nha_cung_cap_id) {
      nhaCungCapApi.hopDongMua(Number(paymentForm.nha_cung_cap_id))
        .then(({ data }) => {
          setHopDongMuaByNcc(data as HopDongMua[]);
        });
    } else {
      setHopDongMuaByNcc([]);
    }
  }, [paymentForm.nha_cung_cap_id]);

  // ─── Add/Edit modal handlers ─────────────────────────────────────────────
  function openAddModal() {
    setEditingId(null);
    setForm(emptyForm);
    setModalOpen(true);
  }

  function openEditModal(ncc: NhaCungCap) {
    setEditingId(ncc.id);
    setForm({
      ten_nha_cung_cap: ncc.ten_nha_cung_cap || '',
      dien_thoai: ncc.dien_thoai || '',
      dia_chi: ncc.dia_chi || '',
    });
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.ten_nha_cung_cap.trim()) {
      addToast('warning', 'Vui lòng nhập tên nhà cung cấp');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ten_nha_cung_cap: form.ten_nha_cung_cap.trim(),
        dien_thoai: form.dien_thoai.trim() || null,
        dia_chi: form.dia_chi.trim() || null,
      };

      if (editingId) {
        await nhaCungCapApi.update(editingId, payload);
        addToast('success', 'Cập nhật nhà cung cấp thành công');
      } else {
        await nhaCungCapApi.create(payload);
        addToast('success', 'Thêm nhà cung cấp thành công');
      }

      setModalOpen(false);
      fetchNhaCungCap();
    } catch (err) {
      console.error('Lỗi lưu nhà cung cấp:', err);
      addToast('error', 'Không thể lưu nhà cung cấp');
    } finally {
      setSaving(false);
    }
  }

  // ─── Delete handler ─────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await nhaCungCapApi.delete(deleteTarget.id);
      addToast('success', 'Xóa nhà cung cấp thành công');
      fetchNhaCungCap();
    } catch (err) {
      console.error('Lỗi xóa nhà cung cấp:', err);
      addToast('error', 'Không thể xóa nhà cung cấp');
    } finally {
      setDeleteTarget(null);
    }
  }

  // ─── Payment modal handlers ─────────────────────────────────────────────
  function openPaymentModal(nccId: number) {
    const ncc = data.find((n) => n.id === nccId);
    setPaymentForm({
      ...emptyPaymentForm,
      nha_cung_cap_id: String(nccId),
      mo_ta_giao_dich: ncc ? `Thanh toán cho NCC: ${ncc.ten_nha_cung_cap}` : '',
    });
    setPaymentModalOpen(true);
  }

  async function handlePaymentSave() {
    if (!paymentForm.tai_khoan_id) {
      addToast('warning', 'Vui lòng chọn tài khoản');
      return;
    }
    if (!paymentForm.ghi_co || Number(paymentForm.ghi_co) <= 0) {
      addToast('warning', 'Vui lòng nhập số tiền thanh toán');
      return;
    }
    if (!paymentForm.mo_ta_giao_dich.trim()) {
      addToast('warning', 'Vui lòng nhập mô tả giao dịch');
      return;
    }

    setPaymentSaving(true);
    try {
      const taiKhoanId = Number(paymentForm.tai_khoan_id);

      // Calculate current so_du for this tai_khoan
      const { data: latest } = await dongTienApi.list({ tai_khoan_id: String(taiKhoanId), limit: 1 });

      let currentSoDu = 0;
      if (latest && latest.length > 0 && latest[0].so_du != null) {
        currentSoDu = latest[0].so_du;
      } else {
        const { data: allRows } = await dongTienApi.list({ tai_khoan_id: String(taiKhoanId), limit: 99999 });
        if (allRows) {
          currentSoDu = allRows.reduce((acc, r) => acc + (r.ghi_no || 0) - (r.ghi_co || 0), 0);
        }
      }

      const soDuMoi = currentSoDu - Number(paymentForm.ghi_co);

      const payload = {
        ngay_gio_giao_dich: paymentForm.ngay_gio_giao_dich,
        tai_khoan_id: taiKhoanId,
        mo_ta_giao_dich: paymentForm.mo_ta_giao_dich.trim(),
        ghi_no: 0,
        ghi_co: Number(paymentForm.ghi_co),
        so_du: soDuMoi,
        nha_cung_cap_id: Number(paymentForm.nha_cung_cap_id),
        hop_dong_mua_id: paymentForm.hop_dong_mua_id ? Number(paymentForm.hop_dong_mua_id) : null,
        ghi_chu: paymentForm.ghi_chu.trim() || null,
      };

      await dongTienApi.create(payload);

      addToast('success', 'Tạo dòng tiền thanh toán thành công');
      setPaymentModalOpen(false);
      fetchNhaCungCap();

      // Refresh expanded data if this supplier is expanded
      if (expandedId === Number(paymentForm.nha_cung_cap_id)) {
        fetchExpandedData(Number(paymentForm.nha_cung_cap_id));
      }
    } catch (err) {
      console.error('Lỗi tạo dòng tiền thanh toán:', err);
      addToast('error', 'Không thể tạo dòng tiền thanh toán');
    } finally {
      setPaymentSaving(false);
    }
  }

  // ─── Expanded row handlers ───────────────────────────────────────────────
  async function fetchExpandedData(nccId: number) {
    setExpandedData((prev) => ({ ...prev, loading: true }));

    try {
      const [hdmRes, hdnRes, dtRes] = await Promise.all([
        nhaCungCapApi.hopDongMua(nccId),
        nhaCungCapApi.hoaDonNhap(nccId),
        dongTienApi.list({ nha_cung_cap_id: String(nccId), limit: 99999 }),
      ]);

      setExpandedData({
        hop_dong_mua: (hdmRes.data as HopDongMua[]) || [],
        hoa_don_nhap: (hdnRes.data as HoaDonNhap[]) || [],
        dong_tien: ((dtRes.data as DongTien[]) || []),
        loading: false,
      });
    } catch (err) {
      console.error('Lỗi tải dữ liệu chi tiết:', err);
      addToast('error', 'Không thể tải dữ liệu chi tiết');
      setExpandedData({ hop_dong_mua: [], hoa_don_nhap: [], dong_tien: [], loading: false });
    }
  }

  function toggleExpand(nccId: number) {
    if (expandedId === nccId) {
      setExpandedId(null);
      setExpandedData({ hop_dong_mua: [], hoa_don_nhap: [], dong_tien: [], loading: false });
    } else {
      setExpandedId(nccId);
      fetchExpandedData(nccId);
    }
  }

  // ─── Helper: get tai_khoan name from dong_tien row ──────────────────────
  function getTaiKhoanName(dt: DongTien): string {
    const tk = dt.tai_khoan as TaiKhoan | undefined;
    if (tk) return tk.ten_tai_khoan;
    const found = taiKhoanList.find((t) => t.id === dt.tai_khoan_id);
    return found ? found.ten_tai_khoan : '--';
  }

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Nhà cung cấp</h1>
          <p className="mt-1 text-sm text-gray-500">Quản lý danh sách nhà cung cấp</p>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={openAddModal}>
          <Plus className="w-4 h-4" />
          Thêm nhà cung cấp
        </button>
      </div>

      {/* Search */}
      <div className="flex items-center gap-4">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Tìm theo tên, điện thoại, địa chỉ..."
        />
      </div>

      {/* Data Table or Empty State */}
      {loading || data.length > 0 ? (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-header w-10"></th>
                  <th className="table-header">Tên NCC</th>
                  <th className="table-header">Điện thoại</th>
                  <th className="table-header">Địa chỉ</th>
                  <th className="table-header text-right">Số HĐ mua</th>
                  <th className="table-header text-right">Tổng giá trị HĐ mua</th>
                  <th className="table-header text-right">Tổng đã thanh toán</th>
                  <th className="table-header w-28"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
                        <p className="text-sm text-gray-500">Đang tải...</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  data.map((ncc) => {
                    const agg = aggregates[ncc.id] || { so_hoa_don_mua: 0, tong_gia_tri_hoa_don_mua: 0, tong_da_thanh_toan: 0 };
                    const isExpanded = expandedId === ncc.id;

                    return (
                      <>
                        <tr
                          key={ncc.id}
                          className="hover:bg-gray-50 transition-colors"
                        >
                          <td className="table-cell">
                            <button
                              onClick={() => toggleExpand(ncc.id)}
                              className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                              title={isExpanded ? 'Thu gọn' : 'Mở rộng'}
                            >
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4" />
                              ) : (
                                <ChevronRight className="w-4 h-4" />
                              )}
                            </button>
                          </td>
                          <td className="table-cell">
                            <span className="font-medium text-gray-900">{ncc.ten_nha_cung_cap}</span>
                          </td>
                          <td className="table-cell">{ncc.dien_thoai || '--'}</td>
                          <td className="table-cell">{ncc.dia_chi || '--'}</td>
                          <td className="table-cell text-right">{agg.so_hoa_don_mua}</td>
                          <td className="table-cell text-right whitespace-nowrap">
                            {formatVND(agg.tong_gia_tri_hoa_don_mua)}
                          </td>
                          <td className="table-cell text-right whitespace-nowrap">
                            {formatVND(agg.tong_da_thanh_toan)}
                          </td>
                          <td className="table-cell">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => openPaymentModal(ncc.id)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors"
                                title="Thanh toán"
                              >
                                <Banknote className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => openEditModal(ncc)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                                title="Sửa"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              {isAdmin() && (
                                <button
                                  onClick={() => setDeleteTarget(ncc)}
                                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                  title="Xóa"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>

                        {/* Expanded row */}
                        {isExpanded && (
                          <tr key={`${ncc.id}-expanded`}>
                            <td colSpan={8} className="p-0">
                              <div className="bg-gray-50 px-6 py-4 border-t border-gray-100">
                                {expandedData.loading ? (
                                  <div className="flex items-center justify-center py-8">
                                    <div className="w-6 h-6 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
                                    <span className="ml-2 text-sm text-gray-500">Đang tải dữ liệu chi tiết...</span>
                                  </div>
                                ) : (
                                  <div className="space-y-6">
                                    {/* Hợp đồng mua */}
                                    <div>
                                      <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                                        <Building2 className="w-4 h-4 text-gray-500" />
                                        Hợp đồng mua
                                      </h4>
                                      {expandedData.hop_dong_mua.length > 0 ? (
                                        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                                          <table className="w-full">
                                            <thead>
                                              <tr>
                                                <th className="table-header text-xs">Số hợp đồng</th>
                                                <th className="table-header text-xs">Ngày ký</th>
                                                <th className="table-header text-xs text-right">Tổng giá trị</th>
                                                <th className="table-header text-xs">Ghi chú</th>
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-200">
                                              {expandedData.hop_dong_mua.map((hdm) => (
                                                <tr key={hdm.id} className="hover:bg-gray-50 transition-colors">
                                                  <td className="table-cell text-xs font-medium text-gray-900">{hdm.so_hop_dong}</td>
                                                  <td className="table-cell text-xs text-gray-500">{formatDate(hdm.ngay_ky)}</td>
                                                  <td className="table-cell text-xs text-right whitespace-nowrap font-medium text-gray-900">{formatVND(hdm.tong_gia_tri)}</td>
                                                  <td className="table-cell text-xs text-gray-500 max-w-[200px] truncate">{hdm.ghi_chu || '--'}</td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      ) : (
                                        <p className="text-sm text-gray-400 italic">Chưa có hợp đồng mua</p>
                                      )}
                                    </div>

                                    {/* Hóa đơn nhập */}
                                    <div>
                                      <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                                        <Search className="w-4 h-4 text-gray-500" />
                                        Hóa đơn nhập
                                      </h4>
                                      {expandedData.hoa_don_nhap.length > 0 ? (
                                        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                                          <table className="w-full">
                                            <thead>
                                              <tr>
                                                <th className="table-header text-xs">Số hóa đơn</th>
                                                <th className="table-header text-xs">Ngày nhập</th>
                                                <th className="table-header text-xs text-right">Tổng tiền</th>
                                                <th className="table-header text-xs">Ghi chú</th>
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-200">
                                              {expandedData.hoa_don_nhap.map((hdn) => (
                                                <tr key={hdn.id} className="hover:bg-gray-50 transition-colors">
                                                  <td className="table-cell text-xs font-medium text-gray-900">{hdn.so_hoa_don}</td>
                                                  <td className="table-cell text-xs text-gray-500">{formatDate(hdn.ngay_nhap)}</td>
                                                  <td className="table-cell text-xs text-right whitespace-nowrap font-medium text-gray-900">{formatVND(hdn.tong_tien)}</td>
                                                  <td className="table-cell text-xs text-gray-500 max-w-[200px] truncate">{hdn.ghi_chu || '--'}</td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      ) : (
                                        <p className="text-sm text-gray-400 italic">Chưa có hóa đơn nhập</p>
                                      )}
                                    </div>

                                    {/* Dòng tiền thanh toán */}
                                    <div>
                                      <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                                        <Banknote className="w-4 h-4 text-gray-500" />
                                        Dòng tiền thanh toán
                                      </h4>
                                      {expandedData.dong_tien.length > 0 ? (
                                        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                                          <table className="w-full">
                                            <thead>
                                              <tr>
                                                <th className="table-header text-xs">Ngày</th>
                                                <th className="table-header text-xs">Mô tả</th>
                                                <th className="table-header text-xs">Tài khoản</th>
                                                <th className="table-header text-xs text-right">Số tiền</th>
                                                <th className="table-header text-xs">Ghi chú</th>
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-200">
                                              {expandedData.dong_tien.map((dt) => (
                                                <tr key={dt.id} className="hover:bg-gray-50 transition-colors">
                                                  <td className="table-cell text-xs text-gray-500 whitespace-nowrap">{formatDate(dt.ngay_gio_giao_dich)}</td>
                                                  <td className="table-cell text-xs font-medium text-gray-900">{dt.mo_ta_giao_dich}</td>
                                                  <td className="table-cell text-xs text-gray-700">{getTaiKhoanName(dt)}</td>
                                                  <td className="table-cell text-xs text-right whitespace-nowrap font-semibold text-red-600">{formatVND(dt.ghi_co)}</td>
                                                  <td className="table-cell text-xs text-gray-500 max-w-[200px] truncate">{dt.ghi_chu || '--'}</td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      ) : (
                                        <p className="text-sm text-gray-400 italic">Chưa có dòng tiền thanh toán</p>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
            />
          )}
        </div>
      ) : (
        <EmptyState
          icon={Building2}
          title="Chưa có nhà cung cấp"
          description="Bắt đầu thêm nhà cung cấp để quản lý thông tin"
          action={{ label: 'Thêm nhà cung cấp', onClick: openAddModal }}
        />
      )}

      {/* Add/Edit Modal */}
      <Modal
        open={modalOpen}
        onOpenChange={setModalOpen}
        title={editingId ? 'Sửa nhà cung cấp' : 'Thêm nhà cung cấp'}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Hủy
            </button>
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Đang lưu...' : 'Lưu'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tên nhà cung cấp <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.ten_nha_cung_cap}
              onChange={(e) => setForm((f) => ({ ...f, ten_nha_cung_cap: e.target.value }))}
              className="input-field w-full"
              placeholder="Nhập tên nhà cung cấp"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Điện thoại</label>
            <input
              type="text"
              value={form.dien_thoai}
              onChange={(e) => setForm((f) => ({ ...f, dien_thoai: e.target.value }))}
              className="input-field w-full"
              placeholder="Nhập số điện thoại"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Địa chỉ</label>
            <input
              type="text"
              value={form.dia_chi}
              onChange={(e) => setForm((f) => ({ ...f, dia_chi: e.target.value }))}
              className="input-field w-full"
              placeholder="Nhập địa chỉ"
            />
          </div>
        </div>
      </Modal>

      {/* Payment Modal */}
      <Modal
        open={paymentModalOpen}
        onOpenChange={setPaymentModalOpen}
        title="Tạo dòng tiền thanh toán"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setPaymentModalOpen(false)} disabled={paymentSaving}>
              Hủy
            </button>
            <button className="btn-primary" onClick={handlePaymentSave} disabled={paymentSaving}>
              {paymentSaving ? 'Đang lưu...' : 'Lưu'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Ngày thực hiện <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={paymentForm.ngay_gio_giao_dich}
              onChange={(e) => setPaymentForm((f) => ({ ...f, ngay_gio_giao_dich: e.target.value }))}
              className="input-field w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tài khoản <span className="text-red-500">*</span>
            </label>
            <select
              value={paymentForm.tai_khoan_id}
              onChange={(e) => setPaymentForm((f) => ({ ...f, tai_khoan_id: e.target.value }))}
              className="select-field w-full"
            >
              <option value="">-- Chọn tài khoản --</option>
              {taiKhoanList.map((tk) => (
                <option key={tk.id} value={tk.id}>{tk.ten_tai_khoan}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nhà cung cấp</label>
            <input
              type="text"
              value={data.find((n) => n.id === Number(paymentForm.nha_cung_cap_id))?.ten_nha_cung_cap || ''}
              className="input-field w-full bg-gray-50"
              disabled
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Hợp đồng mua</label>
            <select
              value={paymentForm.hop_dong_mua_id}
              onChange={(e) => setPaymentForm((f) => ({ ...f, hop_dong_mua_id: e.target.value }))}
              className="select-field w-full"
            >
              <option value="">-- Chọn hợp đồng mua (tùy chọn) --</option>
              {hopDongMuaByNcc.map((hdm) => (
                <option key={hdm.id} value={hdm.id}>{hdm.so_hop_dong}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Mô tả giao dịch <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={paymentForm.mo_ta_giao_dich}
              onChange={(e) => setPaymentForm((f) => ({ ...f, mo_ta_giao_dich: e.target.value }))}
              className="input-field w-full"
              placeholder="Nhập mô tả giao dịch"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Số tiền thanh toán <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={paymentForm.ghi_co}
              onChange={(e) => setPaymentForm((f) => ({ ...f, ghi_co: e.target.value }))}
              className="input-field w-full"
              min={0}
              placeholder="0"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú</label>
            <textarea
              value={paymentForm.ghi_chu}
              onChange={(e) => setPaymentForm((f) => ({ ...f, ghi_chu: e.target.value }))}
              className="input-field w-full"
              rows={2}
              placeholder="Ghi chú (tùy chọn)"
            />
          </div>
        </div>
      </Modal>

      {/* Delete Confirm Dialog */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Xóa nhà cung cấp"
        description={`Bạn có chắc muốn xóa nhà cung cấp "${deleteTarget?.ten_nha_cung_cap}"? Hành động này không thể hoàn tác.`}
        onConfirm={handleDelete}
        confirmText="Xóa"
        cancelText="Hủy"
        variant="danger"
      />
    </div>
  );
}
