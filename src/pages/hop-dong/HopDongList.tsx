import { useState, useEffect, useCallback } from 'react';
import { hopDongApi } from '../../lib/api';
import { useToastStore } from '../../store/toast';
import { useAuthStore } from '../../store/auth';
import { useNavigate } from 'react-router-dom';
import {
  formatVND,
  formatDate,
  sortTheoNgayMoiNhat,
  trangThaiHopDongLabel,
  trangThaiHopDongColor,
} from '../../lib/utils';
import SearchInput from '../../components/ui/SearchInput';
import KhachHangFilterField from '../../components/shared/KhachHangFilterField';
import Pagination from '../../components/ui/Pagination';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import EmptyState from '../../components/ui/EmptyState';
import { Plus, Trash2, FileText } from 'lucide-react';
import type { HopDong, KhachHang } from '../../types';

const PAGE_SIZE = 10;

interface HopDongRow extends HopDong {
  khach_hang?: KhachHang;
  tong_gia_tri?: number;
}

export default function HopDongList() {
  const navigate = useNavigate();
  const addToast = useToastStore((s) => s.addToast);
  const isAdmin = useAuthStore((s) => s.isAdmin);

  const [data, setData] = useState<HopDongRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const [filterKhachHang, setFilterKhachHang] = useState('');
  const [filterTrangThai, setFilterTrangThai] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<HopDongRow | null>(null);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const fetchHopDong = useCallback(async () => {
    setLoading(true);
    try {
      const res = await hopDongApi.list({
        search: search.trim() || undefined,
        khach_hang_id: filterKhachHang || undefined,
        trang_thai: filterTrangThai || undefined,
        date_from: filterDateFrom || undefined,
        date_to: filterDateTo || undefined,
        page: currentPage,
        limit: PAGE_SIZE,
      });

      const hopDongRows: HopDongRow[] = (res.data || []).map((r: any) => ({
        ...r,
        khach_hang: r.khach_hang ?? (r.ten_cong_ty ? { ten_cong_ty: r.ten_cong_ty } : undefined),
        tong_gia_tri: r.tong_gia_tri,
      }));

      setData(sortTheoNgayMoiNhat(hopDongRows, (r) => r.ngay_hop_dong));
      setTotalCount(res.total || 0);
    } catch (err) {
      console.error('Loi tai danh sach hop dong:', err);
      addToast('error', 'Không thể tải danh sách hợp đồng');
    } finally {
      setLoading(false);
    }
  }, [currentPage, search, filterKhachHang, filterTrangThai, filterDateFrom, filterDateTo, addToast]);

  useEffect(() => {
    fetchHopDong();
  }, [fetchHopDong]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, filterKhachHang, filterTrangThai, filterDateFrom, filterDateTo]);

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await hopDongApi.delete(deleteTarget.id);
      addToast('success', 'Xóa hợp đồng thành công');
      fetchHopDong();
    } catch (err) {
      console.error('Loi xoa hop dong:', err);
      addToast('error', 'Không thể xóa hợp đồng');
    } finally {
      setDeleteTarget(null);
    }
  }

  function clearFilters() {
    setFilterKhachHang('');
    setFilterTrangThai('');
    setFilterDateFrom('');
    setFilterDateTo('');
  }

  const hasFilters = filterKhachHang || filterTrangThai || filterDateFrom || filterDateTo;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Hợp đồng bán</h1>
          <p className="mt-1 text-sm text-gray-500">Quản lý danh sách hợp đồng bán</p>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={() => navigate('/hop-dong/tao-moi')}>
          <Plus className="w-4 h-4" />
          Thêm hợp đồng
        </button>
      </div>

      {/* Search & Filters */}
      <div className="space-y-4">
        <div className="flex items-center gap-4 flex-wrap">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Tìm theo số hợp đồng, dự án..."
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
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Trạng thái</label>
            <select
              value={filterTrangThai}
              onChange={(e) => setFilterTrangThai(e.target.value)}
              className="select-field"
            >
              <option value="">Tất cả</option>
              <option value="Hieu luc">Hiệu lực</option>
              <option value="Thanh ly">Thanh lý</option>
              <option value="Huy">Hủy</option>
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
                  <th className="table-header">Số HĐ</th>
                  <th className="table-header">Ngày</th>
                  <th className="table-header">Khách hàng</th>
                  <th className="table-header">Dự án</th>
                  <th className="table-header">Trạng thái</th>
                  <th className="table-header text-right">Phí vận chuyển</th>
                  <th className="table-header text-right">Tổng giá trị</th>
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
                  data.map((hd) => (
                    <tr
                      key={hd.id}
                      className="hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={() => navigate(`/hop-dong/${hd.id}`)}
                    >
                      <td className="table-cell">
                        <span className="font-medium text-gray-900">{hd.so_hop_dong}</span>
                      </td>
                      <td className="table-cell text-gray-500">{formatDate(hd.ngay_hop_dong)}</td>
                      <td className="table-cell text-gray-700">{hd.khach_hang?.ten_cong_ty || '--'}</td>
                      <td className="table-cell text-gray-700">{hd.ten_du_an || '--'}</td>
                      <td className="table-cell">
                        <span className={trangThaiHopDongColor(hd.trang_thai)}>
                          {trangThaiHopDongLabel(hd.trang_thai)}
                        </span>
                      </td>
                      <td className="table-cell text-right">{formatVND(hd.phi_van_chuyen)}</td>
                      <td className="table-cell text-right font-semibold text-gray-900">
                        {formatVND(hd.tong_gia_tri)}
                      </td>
                      <td className="table-cell">
                        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          {isAdmin() && (
                            <button
                              onClick={() => setDeleteTarget(hd)}
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
          title="Chưa có hợp đồng"
          description="Bắt đầu tạo hợp đồng để quản lý"
          action={{ label: 'Thêm hợp đồng', onClick: () => navigate('/hop-dong/tao-moi') }}
        />
      )}

      {/* Delete Confirm Dialog */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Xóa hợp đồng"
        description={`Bạn có chắc muốn xóa hợp đồng "${deleteTarget?.so_hop_dong}"? Hành động này không thể hoàn tác.`}
        onConfirm={handleDelete}
        confirmText="Xóa"
        cancelText="Hủy"
        variant="danger"
      />
    </div>
  );
}
