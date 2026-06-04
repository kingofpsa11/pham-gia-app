import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { hopDongMuaApi, nhaCungCapApi, dongTienMoiApi, taiKhoanApi } from '../../lib/api';
import { useToastStore } from '../../store/toast';
import { useAuthStore } from '../../store/auth';
import {
  formatVND,
  formatDate,
  formatNumber,
  formatPercent,
  getTodayInputValue,
} from '../../lib/utils';
import Modal from '../../components/ui/Modal';
import SearchInput from '../../components/ui/SearchInput';
import Pagination from '../../components/ui/Pagination';
import EmptyState from '../../components/ui/EmptyState';
import NumInput from '../../components/ui/NumInput';
import {
  BookMarked,
  Plus,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronRight,
  Banknote,
  ExternalLink,
} from 'lucide-react';
import type { HopDongMua, NhaCungCap, TaiKhoan } from '../../types';
import ConfirmDialog from '../../components/ui/ConfirmDialog';

const PAGE_SIZE = 10;

// ── Payment form ──────────────────────────────────────────────────────────────
interface PaymentFormValues {
  ngay_giao_dich: string;
  tai_khoan_tien_id: string;
  mo_ta_giao_dich: string;
  so_tien: number;
  ghi_chu: string;
  hop_dong_mua_id: string;
  nha_cung_cap_id: string;
}

const emptyPaymentForm = (): PaymentFormValues => ({
  ngay_giao_dich: getTodayInputValue(),
  tai_khoan_tien_id: '',
  mo_ta_giao_dich: '',
  so_tien: 0,
  ghi_chu: '',
  hop_dong_mua_id: '',
  nha_cung_cap_id: '',
});

// ── Expanded row data ─────────────────────────────────────────────────────────
interface ExpandedData {
  chi_tiet: any[];
  dong_tien: any[];
  loading: boolean;
}

export default function HopDongMuaList() {
  const navigate = useNavigate();
  const addToast = useToastStore((s) => s.addToast);
  const isAdmin = useAuthStore((s) => s.isAdmin);

  // ── List state ──────────────────────────────────────────────────────────────
  const [data, setData] = useState<HopDongMua[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // ── Filters ─────────────────────────────────────────────────────────────────
  const [nhaCungCapList, setNhaCungCapList] = useState<NhaCungCap[]>([]);
  const [taiKhoanList, setTaiKhoanList] = useState<TaiKhoan[]>([]);
  const [filterNhaCungCap, setFilterNhaCungCap] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  // ── Delete confirm ──────────────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<HopDongMua | null>(null);

  // ── Payment modal ───────────────────────────────────────────────────────────
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentForm, setPaymentForm] = useState<PaymentFormValues>(emptyPaymentForm());
  const [paymentSaving, setPaymentSaving] = useState(false);

  // ── Expanded rows ───────────────────────────────────────────────────────────
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [expandedData, setExpandedData] = useState<ExpandedData>({ chi_tiet: [], dong_tien: [], loading: false });

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  useEffect(() => {
    nhaCungCapApi.list({ limit: 1000 }).then(({ data: d }) => setNhaCungCapList(d as NhaCungCap[]));
    taiKhoanApi.list().then(({ data: d }) => setTaiKhoanList(d as TaiKhoan[]));
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: rows, total } = await hopDongMuaApi.list({
        search: search.trim() || undefined,
        nha_cung_cap_id: filterNhaCungCap || undefined,
        date_from: filterDateFrom || undefined,
        date_to: filterDateTo || undefined,
        page: currentPage,
        limit: PAGE_SIZE,
      });
      setData(rows as HopDongMua[]);
      setTotalCount(total || 0);
    } catch {
      addToast('error', 'Không thể tải danh sách hợp đồng mua');
    } finally {
      setLoading(false);
    }
  }, [currentPage, search, filterNhaCungCap, filterDateFrom, filterDateTo, addToast]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { setCurrentPage(1); }, [search, filterNhaCungCap, filterDateFrom, filterDateTo]);

  // ── Delete ───────────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await hopDongMuaApi.delete(deleteTarget.id);
      addToast('success', 'Xóa hợp đồng mua thành công');
      fetchData();
      if (expandedId === deleteTarget.id) {
        setExpandedId(null);
        setExpandedData({ chi_tiet: [], dong_tien: [], loading: false });
      }
    } catch {
      addToast('error', 'Không thể xóa hợp đồng mua');
    } finally {
      setDeleteTarget(null);
    }
  }

  // ── Payment ──────────────────────────────────────────────────────────────────
  function openPaymentModal(hdm: HopDongMua) {
    const ncc = hdm.nha_cung_cap as NhaCungCap | undefined;
    setPaymentForm({
      ...emptyPaymentForm(),
      nha_cung_cap_id: String(hdm.nha_cung_cap_id),
      hop_dong_mua_id: String(hdm.id),
      mo_ta_giao_dich: ncc
        ? `Thanh toán HĐM ${hdm.so_hop_dong} - NCC: ${ncc.ten_nha_cung_cap}`
        : `Thanh toán HĐM ${hdm.so_hop_dong}`,
    });
    setPaymentModalOpen(true);
  }

  async function handlePaymentSave() {
    if (!paymentForm.tai_khoan_tien_id) { addToast('warning', 'Vui lòng chọn tài khoản'); return; }
    if (!paymentForm.so_tien || paymentForm.so_tien <= 0) { addToast('warning', 'Vui lòng nhập số tiền thanh toán'); return; }
    if (!paymentForm.mo_ta_giao_dich.trim()) { addToast('warning', 'Vui lòng nhập mô tả giao dịch'); return; }

    setPaymentSaving(true);
    try {
      await dongTienMoiApi.create({
        loai_giao_dich: 'chi',
        ngay_giao_dich: paymentForm.ngay_giao_dich,
        tai_khoan_tien_id: Number(paymentForm.tai_khoan_tien_id),
        so_tien: paymentForm.so_tien,
        mo_ta_giao_dich: paymentForm.mo_ta_giao_dich.trim(),
        nha_cung_cap_id: Number(paymentForm.nha_cung_cap_id) || null,
        hop_dong_mua_id: Number(paymentForm.hop_dong_mua_id) || null,
        ghi_chu: paymentForm.ghi_chu.trim() || null,
        nguon_du_lieu: 'manual',
      });

      addToast('success', 'Tạo dòng tiền thanh toán thành công');
      setPaymentModalOpen(false);
      fetchData();
      if (expandedId === Number(paymentForm.hop_dong_mua_id)) {
        fetchExpandedData(Number(paymentForm.hop_dong_mua_id));
      }
    } catch {
      addToast('error', 'Không thể tạo dòng tiền thanh toán');
    } finally {
      setPaymentSaving(false);
    }
  }

  // ── Expand ───────────────────────────────────────────────────────────────────
  async function fetchExpandedData(hdmId: number) {
    setExpandedData((prev) => ({ ...prev, loading: true }));
    try {
      const [ctRes, dtRes] = await Promise.all([
        hopDongMuaApi.get(hdmId),
        dongTienMoiApi.list({ hop_dong_mua_id: String(hdmId), limit: 9999 }),
      ]);
      setExpandedData({
        chi_tiet: (ctRes.data as any).chi_tiet || [],
        dong_tien: dtRes.data || [],
        loading: false,
      });
    } catch {
      addToast('error', 'Không thể tải dữ liệu chi tiết');
      setExpandedData({ chi_tiet: [], dong_tien: [], loading: false });
    }
  }

  function toggleExpand(hdmId: number) {
    if (expandedId === hdmId) {
      setExpandedId(null);
      setExpandedData({ chi_tiet: [], dong_tien: [], loading: false });
    } else {
      setExpandedId(hdmId);
      fetchExpandedData(hdmId);
    }
  }

  const hasFilters = filterNhaCungCap || filterDateFrom || filterDateTo;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Hợp đồng mua</h1>
          <p className="mt-1 text-sm text-gray-500">Quản lý danh sách hợp đồng mua</p>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={() => navigate('/hop-dong-mua/tao-moi')}>
          <Plus className="w-4 h-4" />
          Thêm hợp đồng mua
        </button>
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Tìm theo số hợp đồng..." />
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Từ ngày</label>
            <input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Đến ngày</label>
            <input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Nhà cung cấp</label>
            <select value={filterNhaCungCap} onChange={(e) => setFilterNhaCungCap(e.target.value)} className="select-field">
              <option value="">Tất cả</option>
              {nhaCungCapList.map((ncc) => (
                <option key={ncc.id} value={ncc.id}>{ncc.ten_nha_cung_cap}</option>
              ))}
            </select>
          </div>
          {hasFilters && (
            <button onClick={() => { setFilterNhaCungCap(''); setFilterDateFrom(''); setFilterDateTo(''); }} className="btn-secondary text-sm">
              Xóa bộ lọc
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      {loading || data.length > 0 ? (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-header w-10"></th>
                  <th className="table-header">Số HĐ</th>
                  <th className="table-header">Ngày ký</th>
                  <th className="table-header">Nhà cung cấp</th>
                  <th className="table-header text-right">Tổng giá trị</th>
                  <th className="table-header">Ghi chú</th>
                  <th className="table-header w-32"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
                        <p className="text-sm text-gray-500">Đang tải...</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  data.map((hdm) => {
                    const ncc = hdm.nha_cung_cap as NhaCungCap | undefined;
                    const isExpanded = expandedId === hdm.id;
                    return (
                      <>
                        <tr key={hdm.id} className="hover:bg-gray-50 transition-colors">
                          <td className="table-cell">
                            <button
                              onClick={() => toggleExpand(hdm.id)}
                              className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                            >
                              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            </button>
                          </td>
                          <td className="table-cell">
                            <button
                              onClick={() => navigate(`/hop-dong-mua/${hdm.id}`)}
                              className="font-medium text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                            >
                              {hdm.so_hop_dong}
                            </button>
                          </td>
                          <td className="table-cell text-gray-500">{formatDate(hdm.ngay_ky)}</td>
                          <td className="table-cell text-gray-700">{ncc?.ten_nha_cung_cap || '--'}</td>
                          <td className="table-cell text-right whitespace-nowrap font-semibold text-gray-900">
                            {formatVND(hdm.tong_gia_tri)}
                          </td>
                          <td className="table-cell text-gray-500 max-w-[200px] truncate">{hdm.ghi_chu || '--'}</td>
                          <td className="table-cell">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => navigate(`/hop-dong-mua/${hdm.id}`)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                title="Xem chi tiết"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => openPaymentModal(hdm)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors"
                                title="Thanh toán"
                              >
                                <Banknote className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => navigate(`/hop-dong-mua/${hdm.id}`)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                                title="Sửa"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              {isAdmin() && (
                                <button
                                  onClick={() => setDeleteTarget(hdm)}
                                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                  title="Xóa"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr key={`${hdm.id}-exp`}>
                            <td colSpan={7} className="p-0">
                              <div className="bg-gray-50 px-6 py-4 border-t border-gray-100">
                                {expandedData.loading ? (
                                  <div className="flex items-center justify-center py-8">
                                    <div className="w-6 h-6 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
                                    <span className="ml-2 text-sm text-gray-500">Đang tải...</span>
                                  </div>
                                ) : (
                                  <div className="space-y-5">
                                    {/* Chi tiet */}
                                    <div>
                                      <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                                        <BookMarked className="w-4 h-4 text-gray-500" />
                                        Chi tiết hợp đồng
                                      </h4>
                                      {expandedData.chi_tiet.length > 0 ? (
                                        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                                          <table className="w-full">
                                            <thead>
                                              <tr>
                                                <th className="table-header text-xs">Tên sản phẩm</th>
                                                <th className="table-header text-xs">Đơn vị</th>
                                                <th className="table-header text-xs text-right">Số lượng</th>
                                                <th className="table-header text-xs text-right">Đơn giá</th>
                                                <th className="table-header text-xs text-right">Thuế (%)</th>
                                                <th className="table-header text-xs text-right">Thành tiền</th>
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-200">
                                              {expandedData.chi_tiet.map((ct: any) => (
                                                <tr key={ct.id}>
                                                  <td className="table-cell text-xs font-medium text-gray-900">{ct.ten_san_pham}</td>
                                                  <td className="table-cell text-xs text-gray-500">{ct.don_vi}</td>
                                                  <td className="table-cell text-xs text-right">{formatNumber(ct.so_luong)}</td>
                                                  <td className="table-cell text-xs text-right whitespace-nowrap">{formatVND(ct.don_gia)}</td>
                                                  <td className="table-cell text-xs text-right">{formatPercent(ct.thue_suat)}</td>
                                                  <td className="table-cell text-xs text-right whitespace-nowrap font-semibold">{formatVND(ct.thanh_tien)}</td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      ) : (
                                        <p className="text-sm text-gray-400 italic">Chưa có chi tiết</p>
                                      )}
                                    </div>

                                    {/* Dong tien */}
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
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-200">
                                              {expandedData.dong_tien.map((dt: any) => (
                                                <tr key={dt.id}>
                                                  <td className="table-cell text-xs text-gray-500 whitespace-nowrap">
                                                    {dt.ngay_giao_dich
                                                      ? dt.ngay_giao_dich.slice(0, 10).split('-').reverse().join('/')
                                                      : '--'}
                                                  </td>
                                                  <td className="table-cell text-xs text-gray-700">{dt.mo_ta_giao_dich || '--'}</td>
                                                  <td className="table-cell text-xs text-gray-700">{dt.ten_tai_khoan || '--'}</td>
                                                  <td className="table-cell text-xs text-right whitespace-nowrap font-semibold text-red-600">
                                                    {formatVND(dt.so_tien)}
                                                  </td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      ) : (
                                        <p className="text-sm text-gray-400 italic">Chưa có dòng tiền</p>
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
            <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
          )}
        </div>
      ) : (
        <EmptyState
          icon={BookMarked}
          title="Chưa có hợp đồng mua"
          description="Bắt đầu tạo hợp đồng mua để quản lý"
          action={{ label: 'Thêm hợp đồng mua', onClick: () => navigate('/hop-dong-mua/tao-moi') }}
        />
      )}

      {/* Payment Modal */}
      <Modal
        open={paymentModalOpen}
        onOpenChange={setPaymentModalOpen}
        title="Tạo dòng tiền thanh toán"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setPaymentModalOpen(false)} disabled={paymentSaving}>Hủy</button>
            <button className="btn-primary" onClick={handlePaymentSave} disabled={paymentSaving}>
              {paymentSaving ? 'Đang lưu...' : 'Lưu'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ngày thanh toán <span className="text-red-500">*</span></label>
            <input
              type="date"
              value={paymentForm.ngay_giao_dich}
              onChange={(e) => setPaymentForm((f) => ({ ...f, ngay_giao_dich: e.target.value }))}
              className="input-field w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tài khoản <span className="text-red-500">*</span></label>
            <select
              value={paymentForm.tai_khoan_tien_id}
              onChange={(e) => setPaymentForm((f) => ({ ...f, tai_khoan_tien_id: e.target.value }))}
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
              value={nhaCungCapList.find((n) => n.id === Number(paymentForm.nha_cung_cap_id))?.ten_nha_cung_cap || ''}
              className="input-field w-full bg-gray-50"
              disabled
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Hợp đồng mua</label>
            <input
              type="text"
              value={data.find((h) => h.id === Number(paymentForm.hop_dong_mua_id))?.so_hop_dong || ''}
              className="input-field w-full bg-gray-50"
              disabled
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả giao dịch <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={paymentForm.mo_ta_giao_dich}
              onChange={(e) => setPaymentForm((f) => ({ ...f, mo_ta_giao_dich: e.target.value }))}
              className="input-field w-full"
              placeholder="Nhập mô tả giao dịch"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Số tiền thanh toán <span className="text-red-500">*</span></label>
            <NumInput
              value={paymentForm.so_tien}
              onChange={(v) => setPaymentForm((f) => ({ ...f, so_tien: v }))}
              className="input-field w-full text-right"
              min={0}
              isInteger
              format="money"
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

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Xóa hợp đồng mua"
        description={`Bạn có chắc muốn xóa hợp đồng mua "${deleteTarget?.so_hop_dong}"? Hành động này không thể hoàn tác.`}
        onConfirm={handleDelete}
        confirmText="Xóa"
        cancelText="Hủy"
        variant="danger"
      />
    </div>
  );
}
