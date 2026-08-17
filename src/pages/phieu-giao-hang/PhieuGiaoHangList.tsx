import { useState, useEffect, useCallback } from 'react';
import { phieuGiaoHangApi, hopDongApi } from '../../lib/api';
import { useToastStore } from '../../store/toast';
import { useAuthStore } from '../../store/auth';
import { useNavigate, Link } from 'react-router-dom';
import {
  formatVND,
  formatDate,
  formatNumber,
  getTodayInputValue,
  generateSoPhieu,
} from '../../lib/utils';
import SearchInput from '../../components/ui/SearchInput';
import KhachHangFilterField from '../../components/shared/KhachHangFilterField';
import HopDongFilterField from '../../components/shared/HopDongFilterField';
import Pagination from '../../components/ui/Pagination';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import EmptyState from '../../components/ui/EmptyState';
import NumInput from '../../components/ui/NumInput';
import { buildDaGiaoMapFromPhieuList } from '../../lib/hopDongGiaoHang';
import { Plus, Trash2, Truck, X, ArrowLeft, Save, PackageCheck } from 'lucide-react';
import type { PhieuGiaoHang, KhachHang, HopDong, HopDongChiTiet } from '../../types';

const PAGE_SIZE = 10;

interface PhieuGiaoHangRow extends PhieuGiaoHang {
  khach_hang?: KhachHang;
  hop_dong?: HopDong;
}

interface LineItem {
  key: string;
  hop_dong_chi_tiet_id?: number;
  ten_san_pham: string;
  don_vi: string;
  so_luong_hop_dong: number;
  da_giao: number;
  con_lai: number;
  so_luong_giao: number;
  ghi_chu: string;
}

export default function PhieuGiaoHangList() {
  const navigate = useNavigate();
  const addToast = useToastStore((s) => s.addToast);
  const isAdmin = useAuthStore((s) => s.isAdmin);

  const [data, setData] = useState<PhieuGiaoHangRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const [filterKhachHang, setFilterKhachHang] = useState('');
  const [filterHopDong, setFilterHopDong] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  // Form state (full-page form)
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form fields
  const [soPhieu, setSoPhieu] = useState('');
  const [ngayGiao, setNgayGiao] = useState(getTodayInputValue());
  const [khachHangId, setKhachHangId] = useState('');
  const [hopDongId, setHopDongId] = useState('');
  const [noiDung, setNoiDung] = useState('');
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [loadingHD, setLoadingHD] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<PhieuGiaoHangRow | null>(null);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // Load hop dong chi tiet + da giao when hop dong selected
  useEffect(() => {
    if (!hopDongId) {
      setLineItems([]);
      return;
    }
    setLoadingHD(true);
    Promise.all([
      hopDongApi.get(Number(hopDongId)),
      phieuGiaoHangApi.byHopDong(Number(hopDongId)),
    ]).then(([hdRes, pghRes]) => {
      const hdFull = hdRes.data as any;
      const chiTietHD: HopDongChiTiet[] = hdFull?.chi_tiet || [];
      const phieuList: any[] = pghRes.data || [];

      const daGiaoMap = buildDaGiaoMapFromPhieuList(phieuList);

      const rows: LineItem[] = chiTietHD.map((ct) => {
        const daGiao = ct.id ? (daGiaoMap[ct.id] || 0) : 0;
        const conLai = Math.max(0, (ct.so_luong || 0) - daGiao);
        return {
          key: crypto.randomUUID(),
          hop_dong_chi_tiet_id: ct.id,
          ten_san_pham: ct.ten_san_pham,
          don_vi: ct.don_vi,
          so_luong_hop_dong: ct.so_luong,
          da_giao: daGiao,
          con_lai: conLai,
          so_luong_giao: conLai,
          ghi_chu: '',
        };
      });
      setLineItems(rows);
    }).catch(() => {
      addToast('error', 'Không thể tải chi tiết hợp đồng');
    }).finally(() => setLoadingHD(false));
  }, [hopDongId]);

  const fetchPhieuGiaoHang = useCallback(async () => {
    setLoading(true);
    try {
      const res = await phieuGiaoHangApi.list({
        search: search.trim() || undefined,
        khach_hang_id: filterKhachHang || undefined,
        hop_dong_id: filterHopDong || undefined,
        date_from: filterDateFrom || undefined,
        date_to: filterDateTo || undefined,
        page: currentPage,
        limit: PAGE_SIZE,
      });
      setData(
        (res.data || []).map((r: any) => ({
          ...r,
          khach_hang: r.khach_hang ?? (r.ten_cong_ty ? { ten_cong_ty: r.ten_cong_ty } : undefined),
          hop_dong: r.hop_dong ?? (r.so_hop_dong ? { id: r.hop_dong_id, so_hop_dong: r.so_hop_dong } : undefined),
        }))
      );
      setTotalCount(res.total || 0);
    } catch {
      addToast('error', 'Không thể tải danh sách phiếu giao hàng');
    } finally {
      setLoading(false);
    }
  }, [currentPage, search, filterKhachHang, filterHopDong, filterDateFrom, filterDateTo, addToast]);

  useEffect(() => { fetchPhieuGiaoHang(); }, [fetchPhieuGiaoHang]);
  useEffect(() => { setCurrentPage(1); }, [search, filterKhachHang, filterHopDong, filterDateFrom, filterDateTo]);

  async function openForm() {
    const nam = Number((ngayGiao || getTodayInputValue()).slice(0, 4)) || new Date().getFullYear();
    let so = generateSoPhieu(nam);
    try {
      const res = await phieuGiaoHangApi.soTiepTheo(nam);
      if (res.data?.so) so = res.data.so;
    } catch { /* fallback local */ }
    setSoPhieu(so);
    setNgayGiao(getTodayInputValue());
    setKhachHangId('');
    setHopDongId('');
    setNoiDung('');
    setLineItems([]);
    setShowForm(true);
  }

  function updateLine(key: string, field: keyof LineItem, value: number | string) {
    setLineItems((prev) => prev.map((item) => {
      if (item.key !== key) return item;
      const updated = { ...item, [field]: value };
      if (field === 'so_luong_giao') {
        updated.con_lai = Math.max(0, item.so_luong_hop_dong - item.da_giao - Number(value));
      }
      return updated;
    }));
  }

  function removeLine(key: string) {
    setLineItems((prev) => prev.filter((i) => i.key !== key));
  }

  async function handleCreate() {
    if (!khachHangId) { addToast('warning', 'Vui lòng chọn khách hàng'); return; }
    if (!ngayGiao) { addToast('warning', 'Vui lòng chọn ngày giao'); return; }
    if (!hopDongId) { addToast('warning', 'Vui lòng chọn hợp đồng'); return; }
    const validItems = lineItems.filter((i) => i.hop_dong_chi_tiet_id && i.so_luong_giao > 0);
    if (validItems.length === 0) {
      addToast('warning', 'Vui lòng nhập số lượng giao cho ít nhất một dòng hợp đồng');
      return;
    }

    setSaving(true);
    try {
      await phieuGiaoHangApi.create({
        so_phieu: soPhieu,
        ngay_giao: ngayGiao,
        khach_hang_id: Number(khachHangId),
        hop_dong_id: hopDongId ? Number(hopDongId) : null,
        gia_tri_ghi_no: 0,
        noi_dung: noiDung.trim() || null,
        chi_tiet: validItems.map((i) => ({
          hop_dong_chi_tiet_id: i.hop_dong_chi_tiet_id || null,
          ten_san_pham: i.ten_san_pham.trim(),
          don_vi: i.don_vi.trim(),
          so_luong_giao: i.so_luong_giao,
          don_gia: 0,
          thanh_tien: 0,
          ghi_chu: i.ghi_chu.trim() || '',
        })),
      });
      addToast('success', 'Tạo phiếu giao hàng thành công');
      setShowForm(false);
      fetchPhieuGiaoHang();
    } catch {
      addToast('error', 'Không thể tạo phiếu giao hàng');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await phieuGiaoHangApi.delete(deleteTarget.id);
      addToast('success', 'Xóa phiếu giao hàng thành công');
      fetchPhieuGiaoHang();
    } catch {
      addToast('error', 'Không thể xóa phiếu giao hàng');
    } finally {
      setDeleteTarget(null);
    }
  }

  // ---- FORM VIEW ----
  if (showForm) {
    return (
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowForm(false)}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Tạo phiếu giao hàng mới</h1>
            <p className="text-sm text-gray-500">Kế thừa từ hợp đồng, tự động tính số lượng còn lại</p>
          </div>
        </div>

        {/* Info fields */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Số phiếu</label>
              <input
                value={soPhieu}
                onChange={(e) => setSoPhieu(e.target.value)}
                className="input-field text-sm w-full font-mono"
                placeholder="01/GH/2026"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Ngày giao <span className="text-red-500">*</span></label>
              <input type="date" value={ngayGiao} onChange={(e) => setNgayGiao(e.target.value)} className="input-field text-sm w-full" />
            </div>
            <div className="lg:col-span-2">
              <label className="block text-xs font-semibold text-gray-600 mb-1">Khách hàng <span className="text-red-500">*</span></label>
              <KhachHangFilterField
                value={khachHangId}
                onChange={(id) => {
                  setKhachHangId(id);
                  setHopDongId('');
                  setLineItems([]);
                }}
                placeholder="Tìm khách hàng..."
                className="w-full"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Hợp đồng <span className="text-red-500">*</span>
              </label>
              <HopDongFilterField
                value={hopDongId}
                onChange={setHopDongId}
                khachHangId={khachHangId}
                chiConHang
                requireKhachHang
                placeholder="Tìm hợp đồng còn hàng cần giao..."
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Nội dung</label>
              <input type="text" value={noiDung} onChange={(e) => setNoiDung(e.target.value)}
                className="input-field text-sm w-full" placeholder="Ghi chú nội dung giao hàng..." />
            </div>
          </div>
        </div>

        {/* Line items table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
            <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide">Chi tiết sản phẩm giao</h2>
            {loadingHD && (
              <span className="text-xs text-gray-400 animate-pulse">Đang tải hợp đồng...</span>
            )}
          </div>

          {lineItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-gray-400">
              <PackageCheck className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">{hopDongId ? 'Hợp đồng không có sản phẩm' : 'Chọn hợp đồng để tự động điền sản phẩm'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-8">#</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Tên sản phẩm</th>
                    <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide w-20">ĐV</th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide w-24">SL HĐ</th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold text-orange-500 uppercase tracking-wide w-24">Đã giao</th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold text-green-600 uppercase tracking-wide w-24">Còn lại</th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold text-blue-600 uppercase tracking-wide w-32">SL giao lần này</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Ghi chú</th>
                    <th className="px-2 py-2.5 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {lineItems.map((item, idx) => {
                    const isFromHD = !!item.hop_dong_chi_tiet_id;
                    const remainAfter = item.so_luong_hop_dong - item.da_giao - item.so_luong_giao;
                    return (
                      <tr key={item.key} className="hover:bg-blue-50/30 transition-colors group">
                        <td className="px-4 py-2 text-xs text-gray-400">{idx + 1}</td>
                        <td className="px-4 py-2">
                          {isFromHD ? (
                            <span className="text-sm font-medium text-gray-900">{item.ten_san_pham}</span>
                          ) : (
                            <input type="text" value={item.ten_san_pham}
                              onChange={(e) => updateLine(item.key, 'ten_san_pham', e.target.value)}
                              className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:border-blue-400 focus:outline-none"
                              placeholder="Tên sản phẩm" />
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {isFromHD ? (
                            <span className="text-sm text-gray-500">{item.don_vi}</span>
                          ) : (
                            <input type="text" value={item.don_vi}
                              onChange={(e) => updateLine(item.key, 'don_vi', e.target.value)}
                              className="w-full px-2 py-1 text-sm text-center border border-gray-200 rounded focus:border-blue-400 focus:outline-none"
                              placeholder="ĐV" />
                          )}
                        </td>
                        <td className="px-3 py-2 text-right text-sm text-gray-500">
                          {isFromHD ? formatNumber(item.so_luong_hop_dong, 2) : '—'}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {isFromHD ? (
                            <span className={`text-sm font-medium ${item.da_giao > 0 ? 'text-orange-500' : 'text-gray-300'}`}>
                              {formatNumber(item.da_giao, 2)}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {isFromHD ? (
                            <span className={`text-sm font-semibold ${remainAfter < 0 ? 'text-red-500' : remainAfter === 0 ? 'text-gray-400' : 'text-green-600'}`}>
                              {formatNumber(Math.max(0, item.con_lai), 2)}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <NumInput
                            value={item.so_luong_giao}
                            onChange={(v) => updateLine(item.key, 'so_luong_giao', v)}
                            className={`w-full px-2 py-1 text-sm text-right border rounded focus:outline-none ${
                              isFromHD && item.so_luong_giao > item.so_luong_hop_dong - item.da_giao
                                ? 'border-red-400 bg-red-50 text-red-700'
                                : 'border-blue-300 bg-blue-50 text-blue-800 focus:border-blue-500'
                            }`}
                            min={0}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input type="text" value={item.ghi_chu}
                            onChange={(e) => updateLine(item.key, 'ghi_chu', e.target.value)}
                            className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:border-blue-400 focus:outline-none"
                            placeholder="Ghi chú..." />
                        </td>
                        <td className="px-2 py-2 text-center">
                          <button type="button" onClick={() => removeLine(item.key)}
                            className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between pb-6">
          <button onClick={() => setShowForm(false)}
            className="px-5 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
            HỦY
          </button>
          <button onClick={handleCreate} disabled={saving}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50">
            <Save className="w-4 h-4" />
            {saving ? 'Đang lưu...' : 'LƯU PHIẾU GIAO HÀNG'}
          </button>
        </div>
      </div>
    );
  }

  // ---- LIST VIEW ----
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Phiếu giao hàng</h1>
          <p className="mt-1 text-sm text-gray-500">Quản lý danh sách phiếu giao hàng</p>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={openForm}>
          <Plus className="w-4 h-4" /> Thêm phiếu giao hàng
        </button>
      </div>

      <div className="space-y-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Tìm theo số phiếu, nội dung..." />
        <div className="flex items-end gap-4 flex-wrap">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Từ ngày</label>
            <input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Đến ngày</label>
            <input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Khách hàng</label>
            <KhachHangFilterField
              value={filterKhachHang}
              onChange={(id) => {
                setFilterKhachHang(id);
                setFilterHopDong('');
              }}
              placeholder="Tìm khách hàng..."
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Hợp đồng</label>
            <HopDongFilterField
              value={filterHopDong}
              onChange={setFilterHopDong}
              khachHangId={filterKhachHang}
              placeholder="Tìm số hợp đồng, dự án..."
            />
          </div>
          {(filterKhachHang || filterHopDong || filterDateFrom || filterDateTo) && (
            <button onClick={() => { setFilterKhachHang(''); setFilterHopDong(''); setFilterDateFrom(''); setFilterDateTo(''); }} className="btn-secondary text-sm">
              Xóa bộ lọc
            </button>
          )}
        </div>
      </div>

      {loading || data.length > 0 ? (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-header">Số phiếu</th>
                  <th className="table-header">Ngày giao</th>
                  <th className="table-header">Khách hàng</th>
                  <th className="table-header">Hợp đồng</th>
                  <th className="table-header text-right">Giá trị ghi nợ</th>
                  <th className="table-header">Nội dung</th>
                  <th className="table-header w-20"></th>
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
                  data.map((pgh) => (
                    <tr key={pgh.id} className="hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={() => navigate(`/phieu-giao-hang/${pgh.id}`)}>
                      <td className="table-cell"><span className="font-medium text-gray-900">{pgh.so_phieu}</span></td>
                      <td className="table-cell text-gray-500">{formatDate(pgh.ngay_giao)}</td>
                      <td className="table-cell text-gray-700">{pgh.khach_hang?.ten_cong_ty || '--'}</td>
                      <td className="table-cell text-gray-700">
                        {pgh.hop_dong ? (
                          <Link to={`/hop-dong/${pgh.hop_dong_id}`}
                            className="text-primary-600 hover:text-primary-700 font-medium"
                            onClick={(e) => e.stopPropagation()}>
                            {pgh.hop_dong.so_hop_dong}
                          </Link>
                        ) : '--'}
                      </td>
                      <td className="table-cell text-right font-semibold text-gray-900">{formatVND(pgh.gia_tri_ghi_no)}</td>
                      <td className="table-cell text-gray-700 max-w-xs truncate">{pgh.noi_dung || '--'}</td>
                      <td className="table-cell">
                        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          {isAdmin() && (
                            <button onClick={() => setDeleteTarget(pgh)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Xóa">
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
          {totalPages > 1 && <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />}
        </div>
      ) : (
        <EmptyState icon={Truck} title="Chưa có phiếu giao hàng" description="Bắt đầu tạo phiếu giao hàng để quản lý"
          action={{ label: 'Thêm phiếu giao hàng', onClick: openForm }} />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Xóa phiếu giao hàng"
        description={`Bạn có chắc muốn xóa phiếu giao hàng "${deleteTarget?.so_phieu}"? Hành động này không thể hoàn tác.`}
        onConfirm={handleDelete}
        confirmText="Xóa"
        cancelText="Hủy"
        variant="danger"
      />
    </div>
  );
}
