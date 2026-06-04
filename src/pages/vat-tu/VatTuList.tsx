import { useState, useEffect, useCallback } from 'react';
import { vatTuApi } from '../../lib/api';
import { useToastStore } from '../../store/toast';
import { useAuthStore } from '../../store/auth';
import Modal from '../../components/ui/Modal';
import SearchInput from '../../components/ui/SearchInput';
import Pagination from '../../components/ui/Pagination';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import EmptyState from '../../components/ui/EmptyState';
import { Package, Plus, Pencil, Trash2 } from 'lucide-react';
import { formatNumber } from '../../lib/utils';
import type { VatTu } from '../../types';

const PAGE_SIZE = 10;

// ─── Add/Edit form ────────────────────────────────────────────────────────────
interface FormValues {
  ma_vat_tu: string;
  ten_vat_tu: string;
  don_vi_tinh: string;
  ton_kho: number;
}

const emptyForm: FormValues = {
  ma_vat_tu: '',
  ten_vat_tu: '',
  don_vi_tinh: '',
  ton_kho: 0,
};

export default function VatTuList() {
  const addToast = useToastStore((s) => s.addToast);
  const isAdmin = useAuthStore((s) => s.isAdmin);

  // ─── Materials list state ──────────────────────────────────────────────────
  const [data, setData] = useState<VatTu[]>([]);
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
  const [deleteTarget, setDeleteTarget] = useState<VatTu | null>(null);

  // ─── Summary state ────────────────────────────────────────────────────────
  const [summary, setSummary] = useState({
    tongSoVatTu: 0,
    soVatTuConTonKho: 0,
    soVatTuHetHang: 0,
  });

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // ─── Fetch materials list ─────────────────────────────────────────────────
  const fetchVatTu = useCallback(async () => {
    setLoading(true);
    try {
      const { data: rows, total } = await vatTuApi.list({
        search: search.trim() || undefined,
        page: currentPage,
        limit: PAGE_SIZE,
      });

      setData((rows as VatTu[]) || []);
      setTotalCount(total || 0);
    } catch (err) {
      console.error('Lỗi tải danh sách vật tư:', err);
      addToast('error', 'Không thể tải danh sách vật tư');
    } finally {
      setLoading(false);
    }
  }, [currentPage, search, addToast]);

  // ─── Fetch summary data ──────────────────────────────────────────────────
  const fetchSummary = useCallback(async () => {
    try {
      const { data: allVatTu } = await vatTuApi.list({ limit: 99999 });

      const tongSo = allVatTu.length;
      const soConTon = allVatTu.filter((v) => (v.ton_kho || 0) > 0).length;
      const soHetHang = allVatTu.filter((v) => (v.ton_kho || 0) === 0).length;

      setSummary({
        tongSoVatTu: tongSo,
        soVatTuConTonKho: soConTon,
        soVatTuHetHang: soHetHang,
      });
    } catch (err) {
      console.error('Lỗi tải thống kê vật tư:', err);
    }
  }, []);

  useEffect(() => {
    fetchVatTu();
  }, [fetchVatTu]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  // ─── Add/Edit modal handlers ─────────────────────────────────────────────
  function openAddModal() {
    setEditingId(null);
    setForm(emptyForm);
    setModalOpen(true);
  }

  function openEditModal(vt: VatTu) {
    setEditingId(vt.id);
    setForm({
      ma_vat_tu: vt.ma_vat_tu || '',
      ten_vat_tu: vt.ten_vat_tu || '',
      don_vi_tinh: vt.don_vi_tinh || '',
      ton_kho: vt.ton_kho ?? 0,
    });
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.ma_vat_tu.trim()) {
      addToast('warning', 'Vui lòng nhập mã vật tư');
      return;
    }
    if (!form.ten_vat_tu.trim()) {
      addToast('warning', 'Vui lòng nhập tên vật tư');
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        await vatTuApi.update(editingId, {
          ma_vat_tu: form.ma_vat_tu.trim(),
          ten_vat_tu: form.ten_vat_tu.trim(),
          don_vi_tinh: form.don_vi_tinh.trim() || null,
        });
        addToast('success', 'Cập nhật vật tư thành công');
      } else {
        await vatTuApi.create({
          ma_vat_tu: form.ma_vat_tu.trim(),
          ten_vat_tu: form.ten_vat_tu.trim(),
          don_vi_tinh: form.don_vi_tinh.trim() || null,
          ton_kho: 0,
        });
        addToast('success', 'Thêm vật tư thành công');
      }

      setModalOpen(false);
      fetchVatTu();
      fetchSummary();
    } catch (err) {
      console.error('Lỗi lưu vật tư:', err);
      addToast('error', 'Không thể lưu vật tư');
    } finally {
      setSaving(false);
    }
  }

  // ─── Delete handler ─────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await vatTuApi.delete(deleteTarget.id);
      addToast('success', 'Xóa vật tư thành công');
      fetchVatTu();
      fetchSummary();
    } catch (err) {
      console.error('Lỗi xóa vật tư:', err);
      addToast('error', 'Không thể xóa vật tư');
    } finally {
      setDeleteTarget(null);
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Vật tư</h1>
          <p className="mt-1 text-sm text-gray-500">Quản lý danh sách vật tư và tồn kho</p>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={openAddModal}>
          <Plus className="w-4 h-4" />
          Thêm vật tư
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <Package className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Tổng số vật tư</p>
              <p className="text-xl font-semibold text-gray-900">{formatNumber(summary.tongSoVatTu)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
              <Package className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Còn tồn kho</p>
              <p className="text-xl font-semibold text-green-600">{formatNumber(summary.soVatTuConTonKho)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center">
              <Package className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Hết hàng</p>
              <p className="text-xl font-semibold text-red-600">{formatNumber(summary.soVatTuHetHang)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-4">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Tìm theo mã vật tư, tên vật tư..."
        />
      </div>

      {/* Data Table or Empty State */}
      {loading || data.length > 0 ? (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-header">Mã vật tư</th>
                  <th className="table-header">Tên vật tư</th>
                  <th className="table-header">Đơn vị tính</th>
                  <th className="table-header text-right">Tồn kho</th>
                  <th className="table-header w-28"></th>
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
                  data.map((vt) => (
                    <tr
                      key={vt.id}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <td className="table-cell">
                        <span className="font-medium text-gray-900">{vt.ma_vat_tu}</span>
                      </td>
                      <td className="table-cell">{vt.ten_vat_tu}</td>
                      <td className="table-cell">{vt.don_vi_tinh || '--'}</td>
                      <td className="table-cell text-right">
                        <span
                          className={
                            vt.ton_kho > 0
                              ? 'text-green-600 font-semibold'
                              : 'text-red-600 font-semibold'
                          }
                        >
                          {formatNumber(vt.ton_kho ?? 0)}
                        </span>
                      </td>
                      <td className="table-cell">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEditModal(vt)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                            title="Sửa"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          {isAdmin() && (
                            <button
                              onClick={() => setDeleteTarget(vt)}
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
          icon={Package}
          title="Chưa có vật tư"
          description="Bắt đầu thêm vật tư để quản lý tồn kho"
          action={{ label: 'Thêm vật tư', onClick: openAddModal }}
        />
      )}

      {/* Add/Edit Modal */}
      <Modal
        open={modalOpen}
        onOpenChange={setModalOpen}
        title={editingId ? 'Sửa vật tư' : 'Thêm vật tư'}
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
              Mã vật tư <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.ma_vat_tu}
              onChange={(e) => setForm((f) => ({ ...f, ma_vat_tu: e.target.value }))}
              className="input-field w-full"
              placeholder="Nhập mã vật tư"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tên vật tư <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.ten_vat_tu}
              onChange={(e) => setForm((f) => ({ ...f, ten_vat_tu: e.target.value }))}
              className="input-field w-full"
              placeholder="Nhập tên vật tư"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Đơn vị tính</label>
            <input
              type="text"
              value={form.don_vi_tinh}
              onChange={(e) => setForm((f) => ({ ...f, don_vi_tinh: e.target.value }))}
              className="input-field w-full"
              placeholder="Nhập đơn vị tính"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tồn kho</label>
            <input
              type="number"
              value={editingId ? form.ton_kho : 0}
              className="input-field w-full bg-gray-50"
              disabled
              readOnly
            />
            {editingId && (
              <p className="mt-1 text-xs text-gray-400">
                Tồn kho được quản lý từ hóa đơn nhập
              </p>
            )}
          </div>
        </div>
      </Modal>

      {/* Delete Confirm Dialog */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Xóa vật tư"
        description={`Bạn có chắc muốn xóa vật tư "${deleteTarget?.ten_vat_tu}"? Hành động này không thể hoàn tác.`}
        onConfirm={handleDelete}
        confirmText="Xóa"
        cancelText="Hủy"
        variant="danger"
      />
    </div>
  );
}
