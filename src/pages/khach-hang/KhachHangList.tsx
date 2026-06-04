import { useState, useEffect, useCallback } from 'react';
import { khachHangApi } from '../../lib/api';
import { useToastStore } from '../../store/toast';
import { useAuthStore } from '../../store/auth';
import { useNavigate } from 'react-router-dom';
import Modal from '../../components/ui/Modal';
import SearchInput from '../../components/ui/SearchInput';
import Pagination from '../../components/ui/Pagination';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import EmptyState from '../../components/ui/EmptyState';
import { Plus, Pencil, Trash2, Users } from 'lucide-react';
import type { KhachHang } from '../../types';

const PAGE_SIZE = 10;

interface FormValues {
  ten_cong_ty: string;
  ma_so_thue: string;
  dia_chi: string;
  dien_thoai: string;
  email: string;
  tai_khoan_ngan_hang: string;
  nguoi_dai_dien: string;
  chuc_vu: string;
}

const emptyForm: FormValues = {
  ten_cong_ty: '',
  ma_so_thue: '',
  dia_chi: '',
  dien_thoai: '',
  email: '',
  tai_khoan_ngan_hang: '',
  nguoi_dai_dien: '',
  chuc_vu: '',
};

export default function KhachHangList() {
  const navigate = useNavigate();
  const addToast = useToastStore((s) => s.addToast);
  const isAdmin = useAuthStore((s) => s.isAdmin);

  const [data, setData] = useState<KhachHang[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormValues>(emptyForm);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<KhachHang | null>(null);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const fetchKhachHang = useCallback(async () => {
    setLoading(true);
    try {
      const result = await khachHangApi.list({
        search: search.trim() || undefined,
        page: currentPage,
        limit: PAGE_SIZE,
      });
      setData((result.data as KhachHang[]) || []);
      setTotalCount(result.total || 0);
    } catch (err) {
      console.error('Lỗi tải danh sách khách hàng:', err);
      addToast('error', 'Không thể tải danh sách khách hàng');
    } finally {
      setLoading(false);
    }
  }, [currentPage, search, addToast]);

  useEffect(() => {
    fetchKhachHang();
  }, [fetchKhachHang]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  function openAddModal() {
    setEditingId(null);
    setForm(emptyForm);
    setModalOpen(true);
  }

  function openEditModal(kh: KhachHang) {
    setEditingId(kh.id);
    setForm({
      ten_cong_ty: kh.ten_cong_ty || '',
      ma_so_thue: kh.ma_so_thue || '',
      dia_chi: kh.dia_chi || '',
      dien_thoai: kh.dien_thoai || '',
      email: kh.email || '',
      tai_khoan_ngan_hang: kh.tai_khoan_ngan_hang || '',
      nguoi_dai_dien: kh.nguoi_dai_dien || '',
      chuc_vu: kh.chuc_vu || '',
    });
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.ten_cong_ty.trim()) {
      addToast('warning', 'Vui lòng nhập tên khách hàng');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ten_cong_ty: form.ten_cong_ty.trim(),
        ma_so_thue: form.ma_so_thue.trim() || null,
        dia_chi: form.dia_chi.trim() || null,
        dien_thoai: form.dien_thoai.trim() || null,
        email: form.email.trim() || null,
        tai_khoan_ngan_hang: form.tai_khoan_ngan_hang.trim() || null,
        nguoi_dai_dien: form.nguoi_dai_dien.trim() || null,
        chuc_vu: form.chuc_vu.trim() || null,
      };

      if (editingId) {
        await khachHangApi.update(editingId, payload);
        addToast('success', 'Cập nhật khách hàng thành công');
      } else {
        await khachHangApi.create(payload);
        addToast('success', 'Thêm khách hàng thành công');
      }

      setModalOpen(false);
      fetchKhachHang();
    } catch (err) {
      console.error('Lỗi lưu khách hàng:', err);
      addToast('error', 'Không thể lưu khách hàng');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await khachHangApi.delete(deleteTarget.id);
      addToast('success', 'Xóa khách hàng thành công');
      fetchKhachHang();
    } catch (err) {
      console.error('Lỗi xóa khách hàng:', err);
      addToast('error', 'Không thể xóa khách hàng');
    } finally {
      setDeleteTarget(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Khách hàng</h1>
          <p className="mt-1 text-sm text-gray-500">Quản lý danh sách khách hàng</p>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={openAddModal}>
          <Plus className="w-4 h-4" />
          Thêm khách hàng
        </button>
      </div>

      {/* Search */}
      <div className="flex items-center gap-4">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Tìm theo tên, công ty, mã số thuế, điện thoại..."
        />
      </div>

      {/* Data Table or Empty State */}
      {loading || data.length > 0 ? (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-header">Tên công ty</th>
                  <th className="table-header">Điện thoại</th>
                  <th className="table-header">Email</th>
                  <th className="table-header">Mã số thuế</th>
                  <th className="table-header w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
                        <p className="text-sm text-gray-500">Đang tải...</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  data.map((kh) => (
                    <tr
                      key={kh.id}
                      className="hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={() => navigate(`/khach-hang/${kh.id}`)}
                    >
                      <td className="table-cell">
                        <span className="font-medium text-gray-900">{kh.ten_cong_ty}</span>
                      </td>
                      <td className="table-cell">{kh.dien_thoai || '--'}</td>
                      <td className="table-cell">{kh.email || '--'}</td>
                      <td className="table-cell">{kh.ma_so_thue || '--'}</td>
                      <td className="table-cell">
                        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => openEditModal(kh)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                            title="Sửa"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          {isAdmin() && (
                            <button
                              onClick={() => setDeleteTarget(kh)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                              title="Xóa"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
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
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
            />
          )}
        </div>
      ) : (
        <EmptyState
          icon={Users}
          title="Chưa có khách hàng"
          description="Bắt đầu thêm khách hàng để quản lý thông tin"
          action={{ label: 'Thêm khách hàng', onClick: openAddModal }}
        />
      )}

      {/* Add/Edit Modal */}
      <Modal
        open={modalOpen}
        onOpenChange={setModalOpen}
        title={editingId ? 'Sửa khách hàng' : 'Thêm khách hàng'}
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
              Tên công ty <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.ten_cong_ty}
              onChange={(e) => setForm((f) => ({ ...f, ten_cong_ty: e.target.value }))}
              className="input-field w-full"
              placeholder="Nhập tên công ty"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mã số thuế</label>
            <input
              type="text"
              value={form.ma_so_thue}
              onChange={(e) => setForm((f) => ({ ...f, ma_so_thue: e.target.value }))}
              className="input-field w-full"
              placeholder="Nhập mã số thuế"
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="input-field w-full"
                placeholder="Nhập email"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tài khoản ngân hàng</label>
            <input
              type="text"
              value={form.tai_khoan_ngan_hang}
              onChange={(e) => setForm((f) => ({ ...f, tai_khoan_ngan_hang: e.target.value }))}
              className="input-field w-full"
              placeholder="Nhập tài khoản ngân hàng"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Người đại diện</label>
              <input
                type="text"
                value={form.nguoi_dai_dien}
                onChange={(e) => setForm((f) => ({ ...f, nguoi_dai_dien: e.target.value }))}
                className="input-field w-full"
                placeholder="Nhập tên người đại diện"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Chức vụ</label>
              <input
                type="text"
                value={form.chuc_vu}
                onChange={(e) => setForm((f) => ({ ...f, chuc_vu: e.target.value }))}
                className="input-field w-full"
                placeholder="Nhập chức vụ"
              />
            </div>
          </div>
        </div>
      </Modal>

      {/* Delete Confirm Dialog */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Xóa khách hàng"
        description={`Bạn có chắc muốn xóa khách hàng "${deleteTarget?.ten_cong_ty}"? Hành động này không thể hoàn tác.`}
        onConfirm={handleDelete}
        confirmText="Xóa"
        cancelText="Hủy"
        variant="danger"
      />
    </div>
  );
}
