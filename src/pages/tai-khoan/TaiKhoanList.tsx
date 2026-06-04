import { useState, useEffect, useCallback } from 'react';
import { taiKhoanTienApi, dongTienMoiApi } from '../../lib/api';
import { useToastStore } from '../../store/toast';
import { useAuthStore } from '../../store/auth';
import { formatVND, formatDate } from '../../lib/utils';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import EmptyState from '../../components/ui/EmptyState';
import { CreditCard, Plus, Pencil, Trash2, ChevronDown, ChevronRight, Wallet, Banknote, Smartphone } from 'lucide-react';
import type { TaiKhoanTien, DongTienMoi } from '../../types';

interface TaiKhoanWithBalance extends TaiKhoanTien {
  so_du_hien_tai: number;
}

interface FormValues {
  ten_tai_khoan: string;
  loai_tai_khoan: string;
  ngan_hang: string;
  so_tai_khoan: string;
  chu_tai_khoan: string;
  pham_vi: string;
  so_du_dau_ky: string;
  ngay_so_du_dau_ky: string;
  ghi_chu: string;
  trang_thai: string;
}

const emptyForm: FormValues = {
  ten_tai_khoan: '', loai_tai_khoan: 'ngan_hang', ngan_hang: '',
  so_tai_khoan: '', chu_tai_khoan: '', pham_vi: 'cong_ty',
  so_du_dau_ky: '0', ngay_so_du_dau_ky: '', ghi_chu: '', trang_thai: 'hoat_dong',
};

const LOAI_TK_OPTIONS = [
  { value: 'tien_mat', label: 'Tiền mặt' },
  { value: 'ngan_hang', label: 'Ngân hàng' },
  { value: 'vi_dien_tu', label: 'Ví điện tử' },
  { value: 'the_tin_dung', label: 'Thẻ tín dụng' },
  { value: 'khac', label: 'Khác' },
];

const PHAM_VI_OPTIONS = [
  { value: 'cong_ty', label: 'Công ty' },
  { value: 'ca_nhan', label: 'Cá nhân' },
  { value: 'dung_chung', label: 'Dùng chung' },
];

function loaiTkLabel(v: string) {
  return LOAI_TK_OPTIONS.find((o) => o.value === v)?.label ?? v;
}

function loaiTkIcon(v: string) {
  if (v === 'tien_mat') return <Banknote className="w-4 h-4 text-emerald-600" />;
  if (v === 'vi_dien_tu') return <Smartphone className="w-4 h-4 text-blue-600" />;
  return <CreditCard className="w-4 h-4 text-gray-500" />;
}

export default function TaiKhoanList() {
  const addToast = useToastStore((s) => s.addToast);
  const isAdmin = useAuthStore((s) => s.isAdmin);

  const [data, setData] = useState<TaiKhoanWithBalance[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormValues>(emptyForm);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<TaiKhoanWithBalance | null>(null);

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<DongTienMoi[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(false);

  const fetchTaiKhoan = useCallback(async () => {
    setLoading(true);
    try {
      const { data: accounts } = await taiKhoanTienApi.list();
      const list = (accounts || []) as TaiKhoanTien[];

      const withBalance: TaiKhoanWithBalance[] = await Promise.all(
        list.map(async (tk) => {
          const { data: rows } = await dongTienMoiApi.list({ tai_khoan_tien_id: String(tk.id), limit: 99999 });
          const so_du_hien_tai = (rows || []).reduce((sum, dt) => {
            const amt = Number(dt.so_tien) || 0;
            if (dt.loai_giao_dich === 'thu') return sum + amt;
            if (dt.loai_giao_dich === 'chi') return sum - amt;
            if (dt.loai_giao_dich === 'chuyen_khoan_noi_bo') {
              if (String(dt.tai_khoan_tien_id) === String(tk.id)) return sum - amt;
              if (String(dt.tai_khoan_nhan_id) === String(tk.id)) return sum + amt;
            }
            return sum;
          }, Number(tk.so_du_dau_ky) || 0);
          return { ...tk, so_du_hien_tai };
        })
      );

      setData(withBalance);
    } catch (err) {
      console.error('Lỗi tải danh sách tài khoản:', err);
      addToast('error', 'Không thể tải danh sách tài khoản');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { fetchTaiKhoan(); }, [fetchTaiKhoan]);

  async function fetchTransactions(taiKhoanId: number) {
    setTransactionsLoading(true);
    try {
      const { data: rows } = await dongTienMoiApi.list({ tai_khoan_tien_id: String(taiKhoanId), limit: 99999 });
      setTransactions((rows as DongTienMoi[]) || []);
    } catch {
      addToast('error', 'Không thể tải lịch sử giao dịch');
    } finally {
      setTransactionsLoading(false);
    }
  }

  function toggleExpand(id: number) {
    if (expandedId === id) {
      setExpandedId(null);
      setTransactions([]);
    } else {
      setExpandedId(id);
      fetchTransactions(id);
    }
  }

  function openAddModal() {
    setEditingId(null);
    setForm(emptyForm);
    setModalOpen(true);
  }

  function openEditModal(tk: TaiKhoanWithBalance) {
    setEditingId(tk.id);
    setForm({
      ten_tai_khoan: tk.ten_tai_khoan,
      loai_tai_khoan: tk.loai_tai_khoan,
      ngan_hang: tk.ngan_hang ?? '',
      so_tai_khoan: tk.so_tai_khoan ?? '',
      chu_tai_khoan: tk.chu_tai_khoan ?? '',
      pham_vi: tk.pham_vi,
      so_du_dau_ky: String(tk.so_du_dau_ky ?? 0),
      ngay_so_du_dau_ky: tk.ngay_so_du_dau_ky ?? '',
      ghi_chu: tk.ghi_chu ?? '',
      trang_thai: tk.trang_thai,
    });
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.ten_tai_khoan.trim()) {
      addToast('warning', 'Vui lòng nhập tên tài khoản');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ten_tai_khoan: form.ten_tai_khoan.trim(),
        loai_tai_khoan: form.loai_tai_khoan,
        ngan_hang: form.ngan_hang.trim() || null,
        so_tai_khoan: form.so_tai_khoan.trim() || null,
        chu_tai_khoan: form.chu_tai_khoan.trim() || null,
        pham_vi: form.pham_vi,
        so_du_dau_ky: Number(form.so_du_dau_ky) || 0,
        ngay_so_du_dau_ky: form.ngay_so_du_dau_ky || null,
        ghi_chu: form.ghi_chu.trim() || null,
        trang_thai: form.trang_thai,
      };
      if (editingId) {
        await taiKhoanTienApi.update(editingId, payload);
        addToast('success', 'Cập nhật tài khoản thành công');
      } else {
        await taiKhoanTienApi.create(payload);
        addToast('success', 'Thêm tài khoản thành công');
      }
      setModalOpen(false);
      fetchTaiKhoan();
    } catch {
      addToast('error', 'Không thể lưu tài khoản');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await taiKhoanTienApi.delete(deleteTarget.id);
      addToast('success', 'Xóa tài khoản thành công');
      if (expandedId === deleteTarget.id) { setExpandedId(null); setTransactions([]); }
      fetchTaiKhoan();
    } catch {
      addToast('error', 'Không thể xóa tài khoản');
    } finally {
      setDeleteTarget(null);
    }
  }

  const tongSoDu = data.reduce((sum, tk) => sum + tk.so_du_hien_tai, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tài khoản</h1>
          <p className="mt-1 text-sm text-gray-500">Quản lý tài khoản ngân hàng và tiền mặt</p>
        </div>
        {isAdmin() && (
          <button className="btn-primary flex items-center gap-2" onClick={openAddModal}>
            <Plus className="w-4 h-4" />
            Thêm tài khoản
          </button>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-primary-50">
              <Wallet className="w-5 h-5 text-primary-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Tổng số dư tất cả tài khoản</p>
              <p className={`text-xl font-bold ${tongSoDu >= 0 ? 'text-gray-900' : 'text-red-600'}`}>{formatVND(tongSoDu)}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-blue-50">
              <CreditCard className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Số tài khoản</p>
              <p className="text-xl font-bold text-gray-900">{data.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Account List */}
      {loading || data.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-header w-10"></th>
                <th className="table-header">Tên tài khoản</th>
                <th className="table-header">Loại</th>
                <th className="table-header">Ngân hàng / Số TK</th>
                <th className="table-header">Phạm vi</th>
                <th className="table-header text-right">Số dư đầu kỳ</th>
                <th className="table-header text-right">Số dư hiện tại</th>
                <th className="table-header w-20"></th>
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
                data.map((tk) => (
                  <>
                    <tr
                      key={tk.id}
                      className="hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={() => toggleExpand(tk.id)}
                    >
                      <td className="table-cell">
                        {expandedId === tk.id
                          ? <ChevronDown className="w-4 h-4 text-gray-400" />
                          : <ChevronRight className="w-4 h-4 text-gray-400" />}
                      </td>
                      <td className="table-cell">
                        <div className="flex items-center gap-2">
                          {loaiTkIcon(tk.loai_tai_khoan)}
                          <span className="font-medium text-gray-900">{tk.ten_tai_khoan}</span>
                          {tk.trang_thai !== 'hoat_dong' && (
                            <span className="px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-400">Không HĐ</span>
                          )}
                        </div>
                      </td>
                      <td className="table-cell text-sm text-gray-600">{loaiTkLabel(tk.loai_tai_khoan)}</td>
                      <td className="table-cell text-sm text-gray-600">
                        {tk.ngan_hang && <span>{tk.ngan_hang}</span>}
                        {tk.ngan_hang && tk.so_tai_khoan && <span className="text-gray-300 mx-1">·</span>}
                        {tk.so_tai_khoan && <span className="font-mono text-xs">{tk.so_tai_khoan}</span>}
                        {!tk.ngan_hang && !tk.so_tai_khoan && <span className="text-gray-300">--</span>}
                      </td>
                      <td className="table-cell text-sm text-gray-600">
                        {PHAM_VI_OPTIONS.find((o) => o.value === tk.pham_vi)?.label ?? tk.pham_vi}
                      </td>
                      <td className="table-cell text-right text-sm text-gray-500">{formatVND(tk.so_du_dau_ky)}</td>
                      <td className="table-cell text-right">
                        <span className={`font-semibold ${tk.so_du_hien_tai >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatVND(tk.so_du_hien_tai)}
                        </span>
                      </td>
                      <td className="table-cell">
                        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          {isAdmin() && (
                            <button
                              onClick={() => openEditModal(tk)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          )}
                          {isAdmin() && (
                            <button
                              onClick={() => setDeleteTarget(tk)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {expandedId === tk.id && (
                      <tr key={`${tk.id}-detail`}>
                        <td colSpan={8} className="p-0">
                          <div className="bg-gray-50 px-6 py-4">
                            <h3 className="text-sm font-semibold text-gray-700 mb-3">
                              Lịch sử giao dịch — {tk.ten_tai_khoan}
                            </h3>
                            {transactionsLoading ? (
                              <div className="flex items-center justify-center py-6">
                                <div className="w-6 h-6 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
                                <span className="ml-2 text-sm text-gray-500">Đang tải...</span>
                              </div>
                            ) : transactions.length === 0 ? (
                              <p className="text-sm text-gray-400 py-4 text-center">Không có giao dịch nào</p>
                            ) : (
                              <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                                <table className="w-full">
                                  <thead>
                                    <tr>
                                      <th className="table-header">Ngày</th>
                                      <th className="table-header">Loại</th>
                                      <th className="table-header">Mô tả</th>
                                      <th className="table-header">Hạng mục</th>
                                      <th className="table-header text-right">Thu</th>
                                      <th className="table-header text-right">Chi</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-200">
                                    {transactions.map((dt) => (
                                      <tr key={dt.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="table-cell whitespace-nowrap text-sm">{formatDate(dt.ngay_giao_dich)}</td>
                                        <td className="table-cell">
                                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                                            dt.loai_giao_dich === 'thu' ? 'bg-green-100 text-green-700' :
                                            dt.loai_giao_dich === 'chi' ? 'bg-red-100 text-red-700' :
                                            'bg-blue-100 text-blue-700'
                                          }`}>
                                            {dt.loai_giao_dich === 'thu' ? 'Thu' :
                                             dt.loai_giao_dich === 'chi' ? 'Chi' :
                                             dt.loai_giao_dich === 'chuyen_khoan_noi_bo' ? 'CK nội bộ' : 'Điều chỉnh'}
                                          </span>
                                        </td>
                                        <td className="table-cell text-sm">{dt.mo_ta_giao_dich || '—'}</td>
                                        <td className="table-cell text-sm text-gray-500">{dt.ten_hang_muc || '—'}</td>
                                        <td className="table-cell text-right text-sm font-medium text-green-600">
                                          {dt.loai_giao_dich === 'thu' ? formatVND(dt.so_tien) : '—'}
                                        </td>
                                        <td className="table-cell text-right text-sm font-medium text-red-600">
                                          {dt.loai_giao_dich === 'chi' ? formatVND(dt.so_tien) : '—'}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
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
      ) : (
        <EmptyState
          icon={CreditCard}
          title="Chưa có tài khoản"
          description="Bắt đầu thêm tài khoản tiền để quản lý dòng tiền"
          action={isAdmin() ? { label: 'Thêm tài khoản', onClick: openAddModal } : undefined}
        />
      )}

      <Modal
        open={modalOpen}
        onOpenChange={setModalOpen}
        title={editingId ? 'Sửa tài khoản' : 'Thêm tài khoản'}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setModalOpen(false)} disabled={saving}>Hủy</button>
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Đang lưu...' : 'Lưu'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tên tài khoản <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.ten_tai_khoan}
              onChange={(e) => setForm((f) => ({ ...f, ten_tai_khoan: e.target.value }))}
              className="input-field w-full"
              placeholder="VD: Vietcombank công ty"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Loại tài khoản</label>
              <select className="input-field w-full" value={form.loai_tai_khoan} onChange={(e) => setForm((f) => ({ ...f, loai_tai_khoan: e.target.value }))}>
                {LOAI_TK_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phạm vi</label>
              <select className="input-field w-full" value={form.pham_vi} onChange={(e) => setForm((f) => ({ ...f, pham_vi: e.target.value }))}>
                {PHAM_VI_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ngân hàng</label>
              <input
                type="text"
                value={form.ngan_hang}
                onChange={(e) => setForm((f) => ({ ...f, ngan_hang: e.target.value }))}
                className="input-field w-full"
                placeholder="VD: Vietcombank"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Số tài khoản</label>
              <input
                type="text"
                value={form.so_tai_khoan}
                onChange={(e) => setForm((f) => ({ ...f, so_tai_khoan: e.target.value }))}
                className="input-field w-full font-mono"
                placeholder="0123456789"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Chủ tài khoản</label>
            <input
              type="text"
              value={form.chu_tai_khoan}
              onChange={(e) => setForm((f) => ({ ...f, chu_tai_khoan: e.target.value }))}
              className="input-field w-full"
              placeholder="Tên chủ tài khoản"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Số dư đầu kỳ</label>
              <input
                type="number"
                value={form.so_du_dau_ky}
                onChange={(e) => setForm((f) => ({ ...f, so_du_dau_ky: e.target.value }))}
                className="input-field w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ngày số dư đầu kỳ</label>
              <input
                type="date"
                value={form.ngay_so_du_dau_ky}
                onChange={(e) => setForm((f) => ({ ...f, ngay_so_du_dau_ky: e.target.value }))}
                className="input-field w-full"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Trạng thái</label>
              <select className="input-field w-full" value={form.trang_thai} onChange={(e) => setForm((f) => ({ ...f, trang_thai: e.target.value }))}>
                <option value="hoat_dong">Hoạt động</option>
                <option value="khong_hoat_dong">Không hoạt động</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú</label>
              <input
                type="text"
                value={form.ghi_chu}
                onChange={(e) => setForm((f) => ({ ...f, ghi_chu: e.target.value }))}
                className="input-field w-full"
                placeholder="Tuỳ chọn"
              />
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Xóa tài khoản"
        description={`Xóa tài khoản "${deleteTarget?.ten_tai_khoan}"? Các giao dịch liên kết sẽ không bị xóa.`}
        onConfirm={handleDelete}
        confirmText="Xóa"
        cancelText="Hủy"
        variant="danger"
      />
    </div>
  );
}
