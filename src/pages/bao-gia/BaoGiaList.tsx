import { useState, useEffect, useCallback } from 'react';
import { baoGiaApi } from '../../lib/api';
import { useToastStore } from '../../store/toast';
import { useAuthStore } from '../../store/auth';
import { useNavigate, Link } from 'react-router-dom';
import { formatDate, formatVND, sortTheoNgayMoiNhat } from '../../lib/utils';
import SearchInput from '../../components/ui/SearchInput';
import KhachHangFilterField from '../../components/shared/KhachHangFilterField';
import Pagination from '../../components/ui/Pagination';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import EmptyState from '../../components/ui/EmptyState';
import { Plus, Trash2, FileText } from 'lucide-react';
import type { BaoGia, KhachHang } from '../../types';

const PAGE_SIZE = 10;

interface BaoGiaRow extends BaoGia {
  khach_hang?: KhachHang;
  tong_thanh_toan?: number;
}

export default function BaoGiaList() {
  const navigate = useNavigate();
  const addToast = useToastStore((s) => s.addToast);
  const isAdmin = useAuthStore((s) => s.isAdmin);

  const [data, setData] = useState<BaoGiaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const [filterKhachHang, setFilterKhachHang] = useState('');
  const [filterMauBaoGia, setFilterMauBaoGia] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<BaoGiaRow | null>(null);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const fetchBaoGia = useCallback(async () => {
    setLoading(true);
    try {
      const result = await baoGiaApi.list({
        search: search.trim() || undefined,
        khach_hang_id: filterKhachHang || undefined,
        mau_bao_gia: filterMauBaoGia || undefined,
        date_from: filterDateFrom || undefined,
        date_to: filterDateTo || undefined,
        page: currentPage,
        limit: PAGE_SIZE,
      });

      const mappedRows: BaoGiaRow[] = (result.data || []).map((r: any) => ({
        ...r,
        khach_hang: r.khach_hang ?? (r.ten_cong_ty ? { ten_cong_ty: r.ten_cong_ty } : undefined),
      }));
      setData(sortTheoNgayMoiNhat(mappedRows, (r) => r.ngay_bao_gia));
      setTotalCount(result.total || 0);
    } catch (err) {
      console.error('Loi tai danh sach bao gia:', err);
      addToast('error', 'Không thể tải danh sách báo giá');
    } finally {
      setLoading(false);
    }
  }, [currentPage, search, filterKhachHang, filterMauBaoGia, filterDateFrom, filterDateTo, addToast]);

  useEffect(() => {
    fetchBaoGia();
  }, [fetchBaoGia]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, filterKhachHang, filterMauBaoGia, filterDateFrom, filterDateTo]);

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await baoGiaApi.delete(deleteTarget.id);
      addToast('success', 'Xóa báo giá thành công');
      fetchBaoGia();
    } catch (err) {
      console.error('Loi xoa bao gia:', err);
      addToast('error', 'Không thể xóa báo giá');
    } finally {
      setDeleteTarget(null);
    }
  }

  function clearFilters() {
    setFilterKhachHang('');
    setFilterMauBaoGia('');
    setFilterDateFrom('');
    setFilterDateTo('');
  }

  const hasFilters = filterKhachHang || filterMauBaoGia || filterDateFrom || filterDateTo;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Báo giá</h1>
          <p className="mt-1 text-sm text-gray-500">Quản lý danh sách báo giá</p>
        </div>
        <Link to="/bao-gia/tao-moi" className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Thêm báo giá
        </Link>
      </div>

      {/* Search & Filters */}
      <div className="space-y-4">
        <div className="flex items-center gap-4 flex-wrap">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Tìm theo số báo giá, dự án..."
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
            <label className="block text-xs font-medium text-gray-500 mb-1">Khách hàng</label>
            <KhachHangFilterField
              value={filterKhachHang}
              onChange={setFilterKhachHang}
              placeholder="Tìm khách hàng..."
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Mẫu báo giá</label>
            <select
              value={filterMauBaoGia}
              onChange={(e) => setFilterMauBaoGia(e.target.value)}
              className="select-field"
            >
              <option value="">Tất cả</option>
              <option value="Hapulico">Hapulico</option>
              <option value="Khac">Khác</option>
            </select>
          </div>
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="btn-secondary text-sm"
            >
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
                  <th className="table-header">Số báo giá</th>
                  <th className="table-header">Ngày</th>
                  <th className="table-header">Khách hàng</th>
                  <th className="table-header">Dự án</th>
                  <th className="table-header">Phiên bản</th>
                  <th className="table-header">Mẫu</th>
                  <th className="table-header text-right">Tổng (gồm thuế)</th>
                  <th className="table-header">Trạng thái</th>
                  <th className="table-header w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
                        <p className="text-sm text-gray-500">Đang tải...</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  data.map((bg) => (
                    <tr
                      key={bg.id}
                      className="hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={() => navigate(`/bao-gia/${bg.id}`)}
                    >
                      <td className="table-cell">
                        <span className="font-medium text-gray-900">{bg.so_bao_gia}</span>
                      </td>
                      <td className="table-cell text-gray-500">{formatDate(bg.ngay_bao_gia)}</td>
                      <td className="table-cell text-gray-700">{bg.khach_hang?.ten_cong_ty || '--'}</td>
                      <td className="table-cell text-gray-700">{bg.ten_du_an || '--'}</td>
                      <td className="table-cell">
                        <span className="badge-info">PB{bg.phien_ban}</span>
                      </td>
                      <td className="table-cell text-gray-500">{bg.mau_bao_gia || '--'}</td>
                      <td className="table-cell text-right font-medium text-gray-900 whitespace-nowrap">
                        {formatVND(Number(bg.tong_thanh_toan) || 0)}
                      </td>
                      <td className="table-cell">
                        {bg.hop_dong_id ? (
                          <span className="badge-success">Đã chuyển HĐ</span>
                        ) : (
                          <span className="badge-warning">Chưa chuyển</span>
                        )}
                      </td>
                      <td className="table-cell">
                        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          {isAdmin() && (
                            <button
                              onClick={() => setDeleteTarget(bg)}
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
          icon={FileText}
          title="Chưa có báo giá"
          description="Bắt đầu tạo báo giá để quản lý"
          action={{ label: 'Thêm báo giá', onClick: () => navigate('/bao-gia/tao-moi') }}
        />
      )}

      {/* Delete Confirm Dialog */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Xóa báo giá"
        description={`Bạn có chắc muốn xóa báo giá "${deleteTarget?.so_bao_gia}"? Hành động này không thể hoàn tác.`}
        onConfirm={handleDelete}
        confirmText="Xóa"
        cancelText="Hủy"
        variant="danger"
      />
    </div>
  );
}
