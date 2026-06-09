import { useState, useEffect, useCallback } from 'react';
import { hoaDonNhapApi, nhaCungCapApi, hopDongMuaApi, vatTuApi } from '../../lib/api';
import { useToastStore } from '../../store/toast';
import { useAuthStore } from '../../store/auth';
import {
  formatVND,
  formatDate,
  formatNumber,
  toInputDateValue,
  getTodayInputValue,
  generateSoHoaDonNhap,
} from '../../lib/utils';
import Modal from '../../components/ui/Modal';
import SearchInput from '../../components/ui/SearchInput';
import Pagination from '../../components/ui/Pagination';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import EmptyState from '../../components/ui/EmptyState';
import {
  FileInput,
  Plus,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import type {
  HoaDonNhap,
  HoaDonNhapChiTiet,
  NhaCungCap,
  HopDongMua,
  VatTu,
} from '../../types';

const PAGE_SIZE = 10;

// Supabase returns joined relations as arrays; these local types match the raw shape
interface HoaDonNhapRow extends HoaDonNhap {
  nha_cung_cap?: NhaCungCap;
  hop_dong_mua?: HopDongMua;
}


// ─── Form values for create/edit ─────────────────────────────────────────────
interface FormValues {
  so_hoa_don: string;
  ngay_nhap: string;
  nha_cung_cap_id: string;
  hop_dong_mua_id: string;
  ghi_chu: string;
  chi_tiet: ChiTietForm[];
}

interface ChiTietForm {
  vat_tu_id: string;
  so_luong: string;
  don_gia: string;
  thanh_tien: number;
}

const emptyChiTiet = (): ChiTietForm => ({
  vat_tu_id: '',
  so_luong: '',
  don_gia: '',
  thanh_tien: 0,
});

const emptyForm: FormValues = {
  so_hoa_don: '',
  ngay_nhap: getTodayInputValue(),
  nha_cung_cap_id: '',
  hop_dong_mua_id: '',
  ghi_chu: '',
  chi_tiet: [emptyChiTiet()],
};

// ─── Expanded row data ───────────────────────────────────────────────────────
interface ExpandedData {
  chi_tiet: (HoaDonNhapChiTiet & { vat_tu?: VatTu })[];
  loading: boolean;
}

// ─── Helper: calculate tong_tien from chi_tiet items ─────────────────────────
function calcTongTien(items: ChiTietForm[]): number {
  return items.reduce((sum, item) => sum + item.thanh_tien, 0);
}

export default function HoaDonNhapList() {
  const addToast = useToastStore((s) => s.addToast);
  const isAdmin = useAuthStore((s) => s.isAdmin);

  // ─── List state ────────────────────────────────────────────────────────────
  const [data, setData] = useState<HoaDonNhapRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // ─── Filters ───────────────────────────────────────────────────────────────
  const [nhaCungCapList, setNhaCungCapList] = useState<NhaCungCap[]>([]);
  const [hopDongMuaList, setHopDongMuaList] = useState<HopDongMua[]>([]);
  const [vatTuList, setVatTuList] = useState<VatTu[]>([]);
  const [filterNhaCungCap, setFilterNhaCungCap] = useState('');
  const [filterHopDongMua, setFilterHopDongMua] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  // ─── Create/Edit modal ────────────────────────────────────────────────────
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormValues>(emptyForm);
  const [saving, setSaving] = useState(false);

  // ─── Delete confirm ───────────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<HoaDonNhap | null>(null);

  // ─── Expanded rows ────────────────────────────────────────────────────────
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [expandedData, setExpandedData] = useState<ExpandedData>({
    chi_tiet: [],
    loading: false,
  });

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // ─── Load reference lists ──────────────────────────────────────────────────
  useEffect(() => {
    nhaCungCapApi.list({ limit: 1000 }).then(({ data }) => {
      setNhaCungCapList(data as NhaCungCap[]);
    });

    hopDongMuaApi.list({ limit: 1000 }).then(({ data }) => {
      setHopDongMuaList(data as HopDongMua[]);
    });

    vatTuApi.list({ limit: 1000 }).then(({ data }) => {
      setVatTuList(data as VatTu[]);
    });
  }, []);

  // ─── Fetch hoa_don_nhap list ─────────────────────────────────────────────
  const fetchHoaDonNhap = useCallback(async () => {
    setLoading(true);
    try {
      const { data: rows, total } = await hoaDonNhapApi.list({
        search: search.trim() || undefined,
        nha_cung_cap_id: filterNhaCungCap || undefined,
        hop_dong_mua_id: filterHopDongMua || undefined,
        date_from: filterDateFrom || undefined,
        date_to: filterDateTo || undefined,
        page: currentPage,
        limit: PAGE_SIZE,
      });

      setData(rows as HoaDonNhapRow[]);
      setTotalCount(total || 0);
    } catch (err) {
      console.error('Lỗi tải danh sách hóa đơn nhập:', err);
      addToast('error', 'Không thể tải danh sách hóa đơn nhập');
    } finally {
      setLoading(false);
    }
  }, [currentPage, search, filterNhaCungCap, filterHopDongMua, filterDateFrom, filterDateTo, addToast]);

  useEffect(() => {
    fetchHoaDonNhap();
  }, [fetchHoaDonNhap]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, filterNhaCungCap, filterHopDongMua, filterDateFrom, filterDateTo]);

  // ─── Update chi_tiet thanh_tien when so_luong/don_gia change ──────────────
  function updateChiTiet(index: number, field: keyof ChiTietForm, value: string) {
    setForm((prev) => {
      const items = [...prev.chi_tiet];
      items[index] = { ...items[index], [field]: value };

      // Recalculate thanh_tien
      const soLuong = Number(items[index].so_luong) || 0;
      const donGia = Number(items[index].don_gia) || 0;
      items[index].thanh_tien = soLuong * donGia;

      return { ...prev, chi_tiet: items };
    });
  }

  function addChiTietRow() {
    setForm((prev) => ({ ...prev, chi_tiet: [...prev.chi_tiet, emptyChiTiet()] }));
  }

  function removeChiTietRow(index: number) {
    setForm((prev) => ({
      ...prev,
      chi_tiet: prev.chi_tiet.filter((_, i) => i !== index),
    }));
  }

  // ─── Modal handlers ──────────────────────────────────────────────────────
  function openAddModal() {
    setEditingId(null);
    setForm({ ...emptyForm, so_hoa_don: generateSoHoaDonNhap() });
    setModalOpen(true);
  }

  async function openEditModal(hdn: HoaDonNhap) {
    setEditingId(hdn.id);
    setModalOpen(true);

    // Fetch existing chi_tiet for this hoa_don_nhap
    const { data: hdnDetail } = await hoaDonNhapApi.get(hdn.id);
    const ctList = ((hdnDetail as any).chi_tiet as HoaDonNhapChiTiet[]) || [];

    setForm({
      so_hoa_don: hdn.so_hoa_don,
      ngay_nhap: toInputDateValue(hdn.ngay_nhap) || getTodayInputValue(),
      nha_cung_cap_id: String(hdn.nha_cung_cap_id),
      hop_dong_mua_id: hdn.hop_dong_mua_id ? String(hdn.hop_dong_mua_id) : '',
      ghi_chu: hdn.ghi_chu || '',
      chi_tiet:
        ctList.length > 0
          ? ctList.map((ct) => ({
              vat_tu_id: String(ct.vat_tu_id),
              so_luong: String(ct.so_luong),
              don_gia: String(ct.don_gia),
              thanh_tien: ct.thanh_tien,
            }))
          : [emptyChiTiet()],
    });
  }

  async function handleSave() {
    if (!form.nha_cung_cap_id) {
      addToast('warning', 'Vui lòng chọn nhà cung cấp');
      return;
    }

    const validItems = form.chi_tiet.filter(
      (ct) => ct.vat_tu_id && Number(ct.so_luong) > 0 && Number(ct.don_gia) > 0
    );

    if (validItems.length === 0) {
      addToast('warning', 'Vui lòng thêm ít nhất một dòng vật tư');
      return;
    }

    // Check for duplicate vat_tu_id in line items
    const vatTuIds = validItems.map((ct) => ct.vat_tu_id);
    if (new Set(vatTuIds).size !== vatTuIds.length) {
      addToast('warning', 'Không được chọn trùng vật tư trong cùng hóa đơn');
      return;
    }

    setSaving(true);
    try {
      const tongTien = calcTongTien(validItems);

      if (editingId) {
        // ─── Update hoa_don_nhap ────────────────────────────────────────────
        await hoaDonNhapApi.update(editingId, {
          ngay_nhap: form.ngay_nhap,
          nha_cung_cap_id: Number(form.nha_cung_cap_id),
          hop_dong_mua_id: form.hop_dong_mua_id ? Number(form.hop_dong_mua_id) : null,
          tong_tien: tongTien,
          ghi_chu: form.ghi_chu.trim() || null,
          chi_tiet: validItems.map((ct) => ({
            vat_tu_id: Number(ct.vat_tu_id),
            so_luong: Number(ct.so_luong),
            don_gia: Number(ct.don_gia),
            thanh_tien: ct.thanh_tien,
          })),
        });

        addToast('success', 'Cập nhật hóa đơn nhập thành công');
      } else {
        // ─── Insert hoa_don_nhap ────────────────────────────────────────────
        await hoaDonNhapApi.create({
          so_hoa_don: form.so_hoa_don,
          ngay_nhap: form.ngay_nhap,
          nha_cung_cap_id: Number(form.nha_cung_cap_id),
          hop_dong_mua_id: form.hop_dong_mua_id ? Number(form.hop_dong_mua_id) : null,
          tong_tien: tongTien,
          ghi_chu: form.ghi_chu.trim() || null,
          chi_tiet: validItems.map((ct) => ({
            vat_tu_id: Number(ct.vat_tu_id),
            so_luong: Number(ct.so_luong),
            don_gia: Number(ct.don_gia),
            thanh_tien: ct.thanh_tien,
          })),
        });

        addToast('success', 'Tạo hóa đơn nhập thành công');
      }

      setModalOpen(false);
      fetchHoaDonNhap();

      // Refresh expanded data if the edited row is currently expanded
      if (editingId && expandedId === editingId) {
        fetchExpandedData(editingId);
      }
    } catch (err) {
      console.error('Lỗi lưu hóa đơn nhập:', err);
      addToast('error', 'Không thể lưu hóa đơn nhập');
    } finally {
      setSaving(false);
    }
  }

  // ─── Delete handler ──────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await hoaDonNhapApi.delete(deleteTarget.id);

      addToast('success', 'Xóa hóa đơn nhập thành công');
      fetchHoaDonNhap();

      if (expandedId === deleteTarget.id) {
        setExpandedId(null);
        setExpandedData({ chi_tiet: [], loading: false });
      }
    } catch (err) {
      console.error('Lỗi xóa hóa đơn nhập:', err);
      addToast('error', 'Không thể xóa hóa đơn nhập');
    } finally {
      setDeleteTarget(null);
    }
  }

  // ─── Expanded row handlers ───────────────────────────────────────────────
  async function fetchExpandedData(hdnId: number) {
    setExpandedData((prev) => ({ ...prev, loading: true }));

    try {
      const hdnDetail = await hoaDonNhapApi.get(hdnId);

      const rawChiTiet = ((hdnDetail.data as any).chi_tiet || []) as (HoaDonNhapChiTiet & { vat_tu?: VatTu })[];
      setExpandedData({
        chi_tiet: rawChiTiet,
        loading: false,
      });
    } catch (err) {
      console.error('Lỗi tải dữ liệu chi tiết:', err);
      addToast('error', 'Không thể tải dữ liệu chi tiết');
      setExpandedData({ chi_tiet: [], loading: false });
    }
  }

  function toggleExpand(hdnId: number) {
    if (expandedId === hdnId) {
      setExpandedId(null);
      setExpandedData({ chi_tiet: [], loading: false });
    } else {
      setExpandedId(hdnId);
      fetchExpandedData(hdnId);
    }
  }

  // ─── Clear filters ──────────────────────────────────────────────────────
  function clearFilters() {
    setFilterNhaCungCap('');
    setFilterHopDongMua('');
    setFilterDateFrom('');
    setFilterDateTo('');
  }

  const hasFilters = filterNhaCungCap || filterHopDongMua || filterDateFrom || filterDateTo;

  const tongTienForm = calcTongTien(form.chi_tiet);

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Hóa đơn nhập</h1>
          <p className="mt-1 text-sm text-gray-500">Quản lý danh sách hóa đơn nhập kho</p>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={openAddModal}>
          <Plus className="w-4 h-4" />
          Thêm hóa đơn nhập
        </button>
      </div>

      {/* Search & Filters */}
      <div className="space-y-4">
        <div className="flex items-center gap-4 flex-wrap">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Tìm theo số hóa đơn..."
          />
        </div>

        <div className="flex items-end gap-4 flex-wrap">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Từ ngày</label>
            <input
              type="date"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Đến ngày</label>
            <input
              type="date"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Nhà cung cấp</label>
            <select
              value={filterNhaCungCap}
              onChange={(e) => setFilterNhaCungCap(e.target.value)}
              className="select-field"
            >
              <option value="">Tất cả</option>
              {nhaCungCapList.map((ncc) => (
                <option key={ncc.id} value={ncc.id}>
                  {ncc.ten_nha_cung_cap}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Hợp đồng mua</label>
            <select
              value={filterHopDongMua}
              onChange={(e) => setFilterHopDongMua(e.target.value)}
              className="select-field"
            >
              <option value="">Tất cả</option>
              {hopDongMuaList.map((hdm) => (
                <option key={hdm.id} value={hdm.id}>
                  {hdm.so_hop_dong}
                </option>
              ))}
            </select>
          </div>
          {hasFilters && (
            <button onClick={clearFilters} className="btn-secondary text-sm">
              Xóa bộ lọc
            </button>
          )}
        </div>
      </div>

      {/* Data Table or Empty State */}
      {loading || data.length > 0 ? (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-header w-10"></th>
                  <th className="table-header">Số HĐ</th>
                  <th className="table-header">Ngày nhập</th>
                  <th className="table-header">Nhà cung cấp</th>
                  <th className="table-header">Hợp đồng mua</th>
                  <th className="table-header text-right">Tổng tiền</th>
                  <th className="table-header">Ghi chú</th>
                  <th className="table-header w-24"></th>
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
                  data.map((hdn) => {
                    const ncc = hdn.nha_cung_cap as NhaCungCap | undefined;
                    const hdm = hdn.hop_dong_mua as HopDongMua | undefined;
                    const isExpanded = expandedId === hdn.id;

                    return (
                      <>
                        <tr
                          key={hdn.id}
                          className="hover:bg-gray-50 transition-colors"
                        >
                          <td className="table-cell">
                            <button
                              onClick={() => toggleExpand(hdn.id)}
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
                            <span className="font-medium text-gray-900">{hdn.so_hoa_don}</span>
                          </td>
                          <td className="table-cell text-gray-500">{formatDate(hdn.ngay_nhap)}</td>
                          <td className="table-cell text-gray-700">{ncc?.ten_nha_cung_cap || '--'}</td>
                          <td className="table-cell text-gray-700">{hdm?.so_hop_dong || '--'}</td>
                          <td className="table-cell text-right whitespace-nowrap font-semibold text-gray-900">
                            {formatVND(hdn.tong_tien)}
                          </td>
                          <td className="table-cell text-gray-500 max-w-[200px] truncate">
                            {hdn.ghi_chu || '--'}
                          </td>
                          <td className="table-cell">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => openEditModal(hdn)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                                title="Sửa"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              {isAdmin() && (
                                <button
                                  onClick={() => setDeleteTarget(hdn)}
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
                          <tr key={`${hdn.id}-expanded`}>
                            <td colSpan={8} className="p-0">
                              <div className="bg-gray-50 px-6 py-4 border-t border-gray-100">
                                {expandedData.loading ? (
                                  <div className="flex items-center justify-center py-8">
                                    <div className="w-6 h-6 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
                                    <span className="ml-2 text-sm text-gray-500">Đang tải dữ liệu chi tiết...</span>
                                  </div>
                                ) : (
                                  <div>
                                    <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                                      <FileInput className="w-4 h-4 text-gray-500" />
                                      Chi tiết hóa đơn nhập
                                    </h4>
                                    {expandedData.chi_tiet.length > 0 ? (
                                      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                                        <table className="w-full">
                                          <thead>
                                            <tr>
                                              <th className="table-header text-xs">Mã vật tư</th>
                                              <th className="table-header text-xs">Tên vật tư</th>
                                              <th className="table-header text-xs">Đơn vị tính</th>
                                              <th className="table-header text-xs text-right">Số lượng</th>
                                              <th className="table-header text-xs text-right">Đơn giá</th>
                                              <th className="table-header text-xs text-right">Thành tiền</th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-gray-200">
                                            {expandedData.chi_tiet.map((ct) => {
                                              const vt = ct.vat_tu as VatTu | undefined;
                                              return (
                                                <tr key={ct.id} className="hover:bg-gray-50 transition-colors">
                                                  <td className="table-cell text-xs font-medium text-gray-900">{vt?.ma_vat_tu || '--'}</td>
                                                  <td className="table-cell text-xs font-medium text-gray-900">{vt?.ten_vat_tu || '--'}</td>
                                                  <td className="table-cell text-xs text-gray-500">{vt?.don_vi_tinh || '--'}</td>
                                                  <td className="table-cell text-xs text-right text-gray-700">{formatNumber(ct.so_luong)}</td>
                                                  <td className="table-cell text-xs text-right whitespace-nowrap text-gray-700">{formatVND(ct.don_gia)}</td>
                                                  <td className="table-cell text-xs text-right whitespace-nowrap font-semibold text-gray-900">{formatVND(ct.thanh_tien)}</td>
                                                </tr>
                                              );
                                            })}
                                          </tbody>
                                        </table>
                                      </div>
                                    ) : (
                                      <p className="text-sm text-gray-400 italic">Chưa có chi tiết hóa đơn nhập</p>
                                    )}
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
          icon={FileInput}
          title="Chưa có hóa đơn nhập"
          description="Bắt đầu tạo hóa đơn nhập để quản lý nhập kho"
          action={{ label: 'Thêm hóa đơn nhập', onClick: openAddModal }}
        />
      )}

      {/* Create/Edit Modal */}
      <Modal
        open={modalOpen}
        onOpenChange={setModalOpen}
        title={editingId ? 'Sửa hóa đơn nhập' : 'Tạo hóa đơn nhập mới'}
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
        <div className="space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Số hóa đơn (read-only, auto-generated) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Số hóa đơn</label>
            <input
              type="text"
              value={form.so_hoa_don}
              className="input-field w-full bg-gray-50"
              disabled
            />
          </div>

          {/* Ngày nhập */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ngày nhập</label>
            <input
              type="date"
              value={form.ngay_nhap}
              onChange={(e) => setForm((f) => ({ ...f, ngay_nhap: e.target.value }))}
              className="input-field w-full"
            />
          </div>

          {/* Nhà cung cấp */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nhà cung cấp <span className="text-red-500">*</span>
            </label>
            <select
              value={form.nha_cung_cap_id}
              onChange={(e) => setForm((f) => ({ ...f, nha_cung_cap_id: e.target.value }))}
              className="select-field w-full"
            >
              <option value="">-- Chọn nhà cung cấp --</option>
              {nhaCungCapList.map((ncc) => (
                <option key={ncc.id} value={ncc.id}>
                  {ncc.ten_nha_cung_cap}
                </option>
              ))}
            </select>
          </div>

          {/* Hợp đồng mua (optional) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Hợp đồng mua</label>
            <select
              value={form.hop_dong_mua_id}
              onChange={(e) => setForm((f) => ({ ...f, hop_dong_mua_id: e.target.value }))}
              className="select-field w-full"
            >
              <option value="">-- Chọn hợp đồng mua (tùy chọn) --</option>
              {hopDongMuaList.map((hdm) => (
                <option key={hdm.id} value={hdm.id}>
                  {hdm.so_hop_dong}
                </option>
              ))}
            </select>
          </div>

          {/* Ghi chú */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú</label>
            <textarea
              value={form.ghi_chu}
              onChange={(e) => setForm((f) => ({ ...f, ghi_chu: e.target.value }))}
              className="input-field w-full"
              rows={2}
              placeholder="Ghi chú (tùy chọn)"
            />
          </div>

          {/* Chi tiết hóa đơn nhập - Dynamic line items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">
                Chi tiết hóa đơn nhập
              </label>
              <button
                type="button"
                onClick={addChiTietRow}
                className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                Thêm dòng
              </button>
            </div>

            <div className="space-y-3">
              {form.chi_tiet.map((ct, idx) => (
                <div
                  key={idx}
                  className="border border-gray-200 rounded-lg p-3 bg-gray-50 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-500">Dòng {idx + 1}</span>
                    {form.chi_tiet.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeChiTietRow(idx)}
                        className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Xóa dòng"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2">
                      <select
                        value={ct.vat_tu_id}
                        onChange={(e) => updateChiTiet(idx, 'vat_tu_id', e.target.value)}
                        className="select-field w-full text-sm"
                      >
                        <option value="">-- Chọn vật tư --</option>
                        {vatTuList.map((vt) => (
                          <option key={vt.id} value={vt.id}>
                            {vt.ma_vat_tu} - {vt.ten_vat_tu}
                          </option>
                        ))}
                      </select>
                    </div>
                    <input
                      type="number"
                      value={ct.so_luong}
                      onChange={(e) => updateChiTiet(idx, 'so_luong', e.target.value)}
                      className="input-field w-full text-sm"
                      placeholder="Số lượng"
                      min={0}
                    />
                    <input
                      type="number"
                      value={ct.don_gia}
                      onChange={(e) => updateChiTiet(idx, 'don_gia', e.target.value)}
                      className="input-field w-full text-sm"
                      placeholder="Đơn giá"
                      min={0}
                    />
                  </div>

                  <div className="text-right">
                    <span className="text-xs text-gray-500">Thành tiền: </span>
                    <span className="text-sm font-semibold text-gray-900">{formatVND(ct.thanh_tien)}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Tổng tiền */}
            <div className="mt-3 pt-3 border-t border-gray-200 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Tổng tiền hóa đơn</span>
              <span className="text-base font-bold text-gray-900">{formatVND(tongTienForm)}</span>
            </div>
          </div>
        </div>
      </Modal>

      {/* Delete Confirm Dialog */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Xóa hóa đơn nhập"
        description={`Bạn có chắc muốn xóa hóa đơn nhập "${deleteTarget?.so_hoa_don}"? Tồn kho vật tư sẽ được cập nhật lại. Hành động này không thể hoàn tác.`}
        onConfirm={handleDelete}
        confirmText="Xóa"
        cancelText="Hủy"
        variant="danger"
      />
    </div>
  );
}
