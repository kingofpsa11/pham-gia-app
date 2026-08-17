import { useState, useEffect, useCallback } from 'react';
import { congNoApi, dongTienApi, taiKhoanApi, hopDongApi, phieuGiaoHangApi } from '../../lib/api';
import { useToastStore } from '../../store/toast';
import { formatVND, formatDate, formatNumber, getTodayInputValue } from '../../lib/utils';
import Modal from '../../components/ui/Modal';
import SearchInput from '../../components/ui/SearchInput';
import EmptyState from '../../components/ui/EmptyState';
import { Receipt, ArrowUpRight, ChevronDown, ChevronRight, Users } from 'lucide-react';
import type { TaiKhoan, HopDong, PhieuGiaoHang, DongTien } from '../../types';

// ─── Types ───────────────────────────────────────────────────────────────────

interface CustomerDebt {
  khach_hang_id: number;
  ten_cong_ty: string;
  tong_gia_tri_ghi_no: number;
  tong_da_thanh_toan: number;
  con_phai_thu: number;
}

interface PaymentFormValues {
  ngay_gio_giao_dich: string;
  tai_khoan_id: string;
  ghi_no: string;
  khach_hang_id: string;
  hop_dong_id: string;
  mo_ta_giao_dich: string;
}

const emptyPaymentForm: PaymentFormValues = {
  ngay_gio_giao_dich: getTodayInputValue(),
  tai_khoan_id: '',
  ghi_no: '',
  khach_hang_id: '',
  hop_dong_id: '',
  mo_ta_giao_dich: '',
};

type FilterMode = 'all' | 'debt' | 'paid';

// ─── Main component ──────────────────────────────────────────────────────────

export default function CongNoPage() {
  const addToast = useToastStore((s) => s.addToast);

  // Summary
  const [tongCongNoPhaiThu, setTongCongNoPhaiThu] = useState(0);
  const [soKhachHangDangNo, setSoKhachHangDangNo] = useState(0);
  const [tongDaThuThangNay, setTongDaThuThangNay] = useState(0);

  // Customer debt list
  const [customerDebts, setCustomerDebts] = useState<CustomerDebt[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & filter
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');

  // Expanded row
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [phieuGiaoHangDetails, setPhieuGiaoHangDetails] = useState<PhieuGiaoHang[]>([]);
  const [dongTienDetails, setDongTienDetails] = useState<DongTien[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Payment modal
  const [modalOpen, setModalOpen] = useState(false);
  const [paymentForm, setPaymentForm] = useState<PaymentFormValues>(emptyPaymentForm);
  const [saving, setSaving] = useState(false);

  // Lookup lists
  const [taiKhoanList, setTaiKhoanList] = useState<TaiKhoan[]>([]);
  const [hopDongList, setHopDongList] = useState<HopDong[]>([]);

  // ─── Load lookup data ──────────────────────────────────────────────────────
  useEffect(() => {
    taiKhoanApi.list().then(({ data }) => { setTaiKhoanList(data as TaiKhoan[]); });
    hopDongApi.list({ limit: 1000 }).then(({ data }) => { setHopDongList(data as HopDong[]); });
  }, []);

  // ─── Fetch data ─────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await congNoApi.list();
      setTongCongNoPhaiThu(Number(res.tong_cong_no_phai_thu) || 0);
      setSoKhachHangDangNo(Number(res.so_khach_hang_dang_no) || 0);
      setTongDaThuThangNay(Number(res.tong_da_thu_thang_nay) || 0);
      setCustomerDebts((res.data || []) as CustomerDebt[]);
    } catch (err) {
      console.error('Lỗi tải dữ liệu công nợ:', err);
      addToast('error', 'Không thể tải dữ liệu công nợ');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ─── Filtered list ─────────────────────────────────────────────────────────
  const filteredDebts = customerDebts.filter((d) => {
    // Search filter
    if (search.trim()) {
      const term = search.trim().toLowerCase();
      const matchName = d.ten_cong_ty.toLowerCase().includes(term);
      const matchCompany = d.ten_cong_ty.toLowerCase().includes(term);
      if (!matchName && !matchCompany) return false;
    }

    // Filter mode
    if (filterMode === 'debt' && d.con_phai_thu <= 0) return false;
    if (filterMode === 'paid' && d.con_phai_thu > 0) return false;

    return true;
  });

  // ─── Expand row ────────────────────────────────────────────────────────────
  async function handleExpand(khachHangId: number) {
    if (expandedId === khachHangId) {
      setExpandedId(null);
      setPhieuGiaoHangDetails([]);
      setDongTienDetails([]);
      return;
    }

    setExpandedId(khachHangId);
    setLoadingDetails(true);
    setPhieuGiaoHangDetails([]);
    setDongTienDetails([]);

    try {
      const [phieuRes, dongTienRes] = await Promise.all([
        phieuGiaoHangApi.list({ khach_hang_id: String(khachHangId), limit: 500 }),
        dongTienApi.list({ khach_hang_id: String(khachHangId), limit: 500 }),
      ]);

      setPhieuGiaoHangDetails((phieuRes.data as PhieuGiaoHang[]) || []);
      setDongTienDetails((dongTienRes.data as DongTien[]) || []);
    } catch (err) {
      console.error('Lỗi tải chi tiết công nợ:', err);
      addToast('error', 'Không thể tải chi tiết công nợ');
    } finally {
      setLoadingDetails(false);
    }
  }

  // ─── Payment modal ─────────────────────────────────────────────────────────
  function openPaymentModal(khachHangId?: number) {
    setPaymentForm({
      ...emptyPaymentForm,
      khach_hang_id: khachHangId ? String(khachHangId) : '',
    });
    setModalOpen(true);
  }

  // Filter hop_dong by selected khach_hang
  const filteredHopDong = paymentForm.khach_hang_id
    ? hopDongList.filter((hd) => hd.khach_hang_id === Number(paymentForm.khach_hang_id))
    : hopDongList;

  async function handleSavePayment() {
    if (!paymentForm.khach_hang_id) {
      addToast('warning', 'Vui lòng chọn khách hàng');
      return;
    }
    if (!paymentForm.tai_khoan_id) {
      addToast('warning', 'Vui lòng chọn tài khoản');
      return;
    }
    if (!paymentForm.ghi_no || Number(paymentForm.ghi_no) <= 0) {
      addToast('warning', 'Vui lòng nhập số tiền thu');
      return;
    }
    if (!paymentForm.mo_ta_giao_dich.trim()) {
      addToast('warning', 'Vui lòng nhập mô tả giao dịch');
      return;
    }

    setSaving(true);
    try {
      const taiKhoanId = Number(paymentForm.tai_khoan_id);

      // Calculate so_du
      const { data: latest } = await dongTienApi.list({ tai_khoan_id: String(taiKhoanId), limit: 1 });

      let currentSoDu = 0;
      if (latest && latest.length > 0 && latest[0].so_du != null) {
        currentSoDu = latest[0].so_du;
      } else {
        const { data: allRows } = await dongTienApi.list({ tai_khoan_id: String(taiKhoanId), limit: 500 });
        if (allRows) {
          currentSoDu = allRows.reduce((acc, r) => acc + (r.ghi_no || 0) - (r.ghi_co || 0), 0);
        }
      }

      const soDuMoi = currentSoDu + Number(paymentForm.ghi_no);

      const payload = {
        ngay_gio_giao_dich: paymentForm.ngay_gio_giao_dich,
        tai_khoan_id: taiKhoanId,
        mo_ta_giao_dich: paymentForm.mo_ta_giao_dich.trim(),
        ghi_no: Number(paymentForm.ghi_no),
        ghi_co: 0,
        so_du: soDuMoi,
        khach_hang_id: Number(paymentForm.khach_hang_id),
        hop_dong_id: paymentForm.hop_dong_id ? Number(paymentForm.hop_dong_id) : null,
      };

      await dongTienApi.create(payload);

      addToast('success', 'Ghi nhận thanh toán thành công');
      setModalOpen(false);
      fetchData();
    } catch (err) {
      console.error('Lỗi ghi thanh toán:', err);
      addToast('error', 'Không thể ghi nhận thanh toán');
    } finally {
      setSaving(false);
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Công nợ phải thu</h1>
          <p className="mt-1 text-sm text-gray-500">Quản lý công nợ khách hàng</p>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={() => openPaymentModal()}>
          <ArrowUpRight className="w-4 h-4" />
          Ghi thanh toán
        </button>
      </div>

      {/* ─── Summary Cards ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center">
              <Receipt className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Tổng công nợ phải thu</p>
              <p className="text-lg font-bold text-gray-900">{formatVND(tongCongNoPhaiThu)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Số khách hàng đang nợ</p>
              <p className="text-lg font-bold text-gray-900">{formatNumber(soKhachHangDangNo)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
              <ArrowUpRight className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Tổng đã thu tháng này</p>
              <p className="text-lg font-bold text-green-600">{formatVND(tongDaThuThangNay)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Search & Filter ──────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Tìm theo tên khách hàng, công ty..."
        />

        <div className="flex items-center gap-2">
          {(['all', 'debt', 'paid'] as FilterMode[]).map((mode) => {
            const labels: Record<FilterMode, string> = {
              all: 'Tất cả',
              debt: 'Đang nợ',
              paid: 'Đã thanh toán',
            };
            return (
              <button
                key={mode}
                onClick={() => setFilterMode(mode)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  filterMode === mode
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {labels[mode]}
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── Customer Debt Table ──────────────────────────────────────────── */}
      {loading || filteredDebts.length > 0 ? (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-header w-10"></th>
                  <th className="table-header">Tên khách hàng</th>
                  <th className="table-header">Tên công ty</th>
                  <th className="table-header text-right">Tổng giá trị ghi nợ</th>
                  <th className="table-header text-right">Đã thanh toán</th>
                  <th className="table-header text-right">Còn phải thu</th>
                  <th className="table-header w-24"></th>
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
                  filteredDebts.map((debt) => (
                    <>
                      <tr
                        key={debt.khach_hang_id}
                        className="hover:bg-gray-50 transition-colors cursor-pointer"
                        onClick={() => handleExpand(debt.khach_hang_id)}
                      >
                        <td className="table-cell">
                          {expandedId === debt.khach_hang_id ? (
                            <ChevronDown className="w-4 h-4 text-gray-500" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-gray-500" />
                          )}
                        </td>
                        <td className="table-cell">
                          <span className="font-medium text-gray-900">{debt.ten_cong_ty}</span>
                        </td>
                        <td className="table-cell text-gray-700">{debt.ten_cong_ty || '--'}</td>
                        <td className="table-cell text-right whitespace-nowrap font-medium text-gray-900">
                          {formatVND(debt.tong_gia_tri_ghi_no)}
                        </td>
                        <td className="table-cell text-right whitespace-nowrap text-green-600">
                          {formatVND(debt.tong_da_thanh_toan)}
                        </td>
                        <td className="table-cell text-right whitespace-nowrap">
                          <span className={`font-semibold ${debt.con_phai_thu > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                            {formatVND(debt.con_phai_thu)}
                          </span>
                        </td>
                        <td className="table-cell">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openPaymentModal(debt.khach_hang_id);
                            }}
                            className="px-2.5 py-1 rounded-lg text-xs font-medium text-primary-600 bg-primary-50 hover:bg-primary-100 transition-colors"
                          >
                            Ghi thu
                          </button>
                        </td>
                      </tr>

                      {/* ─── Expanded Details ────────────────────────────────── */}
                      {expandedId === debt.khach_hang_id && (
                        <tr key={`${debt.khach_hang_id}-detail`}>
                          <td colSpan={7} className="px-4 py-0">
                            <div className="bg-gray-50 rounded-lg p-4 my-2">
                              {loadingDetails ? (
                                <div className="flex items-center justify-center py-4">
                                  <div className="w-6 h-6 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
                                  <span className="ml-2 text-sm text-gray-500">Đang tải chi tiết...</span>
                                </div>
                              ) : (
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                  {/* Phieu giao hang */}
                                  <div>
                                    <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                                      <Receipt className="w-4 h-4 text-amber-500" />
                                      Phiếu giao hàng
                                    </h4>
                                    {phieuGiaoHangDetails.length === 0 ? (
                                      <p className="text-sm text-gray-400 italic">Chưa có phiếu giao hàng</p>
                                    ) : (
                                      <div className="overflow-x-auto rounded border border-gray-200">
                                        <table className="w-full text-sm">
                                          <thead>
                                            <tr className="bg-white">
                                              <th className="px-3 py-2 text-left font-medium text-gray-600">Số phiếu</th>
                                              <th className="px-3 py-2 text-left font-medium text-gray-600">Ngày giao</th>
                                              <th className="px-3 py-2 text-right font-medium text-gray-600">Giá trị ghi nợ</th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-gray-100">
                                            {phieuGiaoHangDetails.map((pgh) => (
                                              <tr key={pgh.id} className="bg-white">
                                                <td className="px-3 py-1.5 text-gray-900">{pgh.so_phieu}</td>
                                                <td className="px-3 py-1.5 text-gray-600">{formatDate(pgh.ngay_giao)}</td>
                                                <td className="px-3 py-1.5 text-right font-medium text-gray-900">
                                                  {formatVND(pgh.gia_tri_ghi_no)}
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    )}
                                  </div>

                                  {/* Dong tien thanh toan */}
                                  <div>
                                    <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                                      <ArrowUpRight className="w-4 h-4 text-green-500" />
                                      Thanh toán
                                    </h4>
                                    {dongTienDetails.length === 0 ? (
                                      <p className="text-sm text-gray-400 italic">Chưa có thanh toán</p>
                                    ) : (
                                      <div className="overflow-x-auto rounded border border-gray-200">
                                        <table className="w-full text-sm">
                                          <thead>
                                            <tr className="bg-white">
                                              <th className="px-3 py-2 text-left font-medium text-gray-600">Ngày thực hiện</th>
                                              <th className="px-3 py-2 text-left font-medium text-gray-600">Mô tả</th>
                                              <th className="px-3 py-2 text-right font-medium text-gray-600">Ghi nợ</th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-gray-100">
                                            {dongTienDetails.map((dt) => (
                                              <tr key={dt.id} className="bg-white">
                                                <td className="px-3 py-1.5 text-gray-600">{formatDate(dt.ngay_gio_giao_dich)}</td>
                                                <td className="px-3 py-1.5 text-gray-900 max-w-[200px] truncate">{dt.mo_ta_giao_dich}</td>
                                                <td className="px-3 py-1.5 text-right font-medium text-green-600">
                                                  {formatVND(dt.ghi_no)}
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <EmptyState
          icon={Receipt}
          title="Không có công nợ"
          description="Chưa có dữ liệu công nợ phải thu"
          action={{ label: 'Ghi thanh toán', onClick: () => openPaymentModal() }}
        />
      )}

      {/* ─── Payment Modal ────────────────────────────────────────────────── */}
      <Modal
        open={modalOpen}
        onOpenChange={setModalOpen}
        title="Ghi nhận thanh toán"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Hủy
            </button>
            <button className="btn-primary" onClick={handleSavePayment} disabled={saving}>
              {saving ? 'Đang lưu...' : 'Lưu'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Ngày giao dịch <span className="text-red-500">*</span>
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
              Khách hàng <span className="text-red-500">*</span>
            </label>
            <select
              value={paymentForm.khach_hang_id}
              onChange={(e) => setPaymentForm((f) => ({ ...f, khach_hang_id: e.target.value, hop_dong_id: '' }))}
              className="select-field w-full"
            >
              <option value="">-- Chọn khách hàng --</option>
              {customerDebts.map((kh) => (
                <option key={kh.khach_hang_id} value={kh.khach_hang_id}>{kh.ten_cong_ty}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Hợp đồng</label>
            <select
              value={paymentForm.hop_dong_id}
              onChange={(e) => setPaymentForm((f) => ({ ...f, hop_dong_id: e.target.value }))}
              className="select-field w-full"
            >
              <option value="">-- Chọn hợp đồng --</option>
              {filteredHopDong.map((hd) => (
                <option key={hd.id} value={hd.id}>
                  {hd.so_hop_dong}{hd.ten_du_an ? ` - ${hd.ten_du_an}` : ''}
                </option>
              ))}
            </select>
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
              Số tiền thu <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={paymentForm.ghi_no}
              onChange={(e) => setPaymentForm((f) => ({ ...f, ghi_no: e.target.value }))}
              className="input-field w-full"
              min={0}
              placeholder="0"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
