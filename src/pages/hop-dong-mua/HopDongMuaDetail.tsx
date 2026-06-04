import { useState, useEffect } from 'react';
import { hopDongMuaApi, dongTienMoiApi } from '../../lib/api';
import { useToastStore } from '../../store/toast';
import { useNavigate, useParams } from 'react-router-dom';
import { formatVND, formatDate, formatNumber, formatPercent } from '../../lib/utils';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import HopDongMuaForm from './HopDongMuaForm';
import { ArrowLeft, Pencil, X, Banknote, CreditCard } from 'lucide-react';

export default function HopDongMuaDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const addToast = useToastStore((s) => s.addToast);

  const [hdm, setHdm] = useState<any | null>(null);
  const [chiTiet, setChiTiet] = useState<any[]>([]);
  const [dongTienList, setDongTienList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (id) fetchData();
  }, [id]);

  async function fetchData() {
    setLoading(true);
    try {
      const hdmId = Number(id);
      const [hdmRes, dtRes] = await Promise.all([
        hopDongMuaApi.get(hdmId),
        dongTienMoiApi.list({ hop_dong_mua_id: String(hdmId), limit: 9999 }),
      ]);

      const hdmData = hdmRes.data as any;
      if (!hdmData) {
        addToast('error', 'Không tìm thấy hợp đồng mua');
        navigate('/hop-dong-mua');
        return;
      }

      setHdm(hdmData);
      setChiTiet(hdmData.chi_tiet || []);
      setDongTienList(dtRes.data || []);
    } catch {
      addToast('error', 'Không thể tải thông tin hợp đồng mua');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!hdm) return;
    setDeleting(true);
    try {
      await hopDongMuaApi.delete(hdm.id);
      addToast('success', 'Xóa hợp đồng mua thành công');
      navigate('/hop-dong-mua');
    } catch {
      addToast('error', 'Không thể xóa hợp đồng mua');
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Đang tải thông tin hợp đồng mua...</p>
        </div>
      </div>
    );
  }

  if (!hdm) return null;

  // Totals
  const tongTruocVAT = chiTiet.reduce((s: number, ct: any) => s + (ct.so_luong || 0) * (ct.don_gia || 0), 0);
  const tongVAT = chiTiet.reduce((s: number, ct: any) => s + (ct.so_luong || 0) * (ct.don_gia || 0) * ((ct.thue_suat || 0) / 100), 0);
  const tongThanhToan = tongTruocVAT + tongVAT;
  const tongDaThanhToan = dongTienList.reduce((s: number, dt: any) => s + (dt.so_tien || 0), 0);
  const conLai = tongThanhToan - tongDaThanhToan;

  if (isEditing) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setIsEditing(false)}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Chỉnh sửa hợp đồng mua</h1>
            <p className="mt-0.5 text-sm text-gray-500">{hdm.so_hop_dong}</p>
          </div>
          <button
            onClick={() => setIsEditing(false)}
            className="ml-auto p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <HopDongMuaForm
          mode="edit"
          hopDongMuaId={hdm.id}
          initialData={{ ...hdm, chi_tiet: chiTiet }}
          onSaved={() => { setIsEditing(false); fetchData(); }}
          onCancel={() => setIsEditing(false)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/hop-dong-mua')}
          className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
          title="Quay lại"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 truncate">{hdm.so_hop_dong}</h1>
          <p className="mt-0.5 text-sm text-gray-500">{hdm.ten_nha_cung_cap || '--'}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsEditing(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Pencil className="w-4 h-4" />
            Chỉnh sửa
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="px-4 py-2 text-sm font-semibold text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
          >
            Xóa
          </button>
        </div>
      </div>

      {/* Thong tin */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-lg font-semibold text-gray-900">Thông tin hợp đồng mua</h2>
        </div>
        <div className="card-body">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <div>
              <p className="text-xs font-medium text-gray-500">Số hợp đồng</p>
              <p className="text-sm font-semibold text-gray-900">{hdm.so_hop_dong}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">Ngày ký</p>
              <p className="text-sm font-semibold text-gray-900">{formatDate(hdm.ngay_ky)}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">Nhà cung cấp</p>
              <p className="text-sm font-semibold text-gray-900">{hdm.ten_nha_cung_cap || '--'}</p>
            </div>
            {hdm.ghi_chu && (
              <div className="sm:col-span-2">
                <p className="text-xs font-medium text-gray-500">Ghi chú</p>
                <p className="text-sm font-semibold text-gray-900">{hdm.ghi_chu}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Chi tiet */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-lg font-semibold text-gray-900">Chi tiết hợp đồng</h2>
        </div>
        <div className="card-body p-0">
          {chiTiet.length === 0 ? (
            <p className="px-6 py-4 text-sm text-gray-500">Chưa có sản phẩm nào</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="table-header">Tên sản phẩm</th>
                    <th className="table-header">Đơn vị</th>
                    <th className="table-header text-right">Số lượng</th>
                    <th className="table-header text-right">Đơn giá</th>
                    <th className="table-header text-right">Thuế (%)</th>
                    <th className="table-header text-right">Thành tiền</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {chiTiet.map((ct: any) => (
                    <tr key={ct.id} className="hover:bg-gray-50 transition-colors">
                      <td className="table-cell font-medium text-gray-900">{ct.ten_san_pham}</td>
                      <td className="table-cell text-gray-500">{ct.don_vi || '--'}</td>
                      <td className="table-cell text-right">{formatNumber(ct.so_luong)}</td>
                      <td className="table-cell text-right whitespace-nowrap">{formatVND(ct.don_gia)}</td>
                      <td className="table-cell text-right">{formatPercent(ct.thue_suat)}</td>
                      <td className="table-cell text-right whitespace-nowrap font-semibold text-gray-900">{formatVND(ct.thanh_tien)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-lg font-semibold text-gray-900">Tổng cộng</h2>
        </div>
        <div className="card-body">
          <div className="max-w-sm ml-auto space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Tiền hàng (chưa VAT):</span>
              <span className="font-medium text-gray-900">{formatVND(tongTruocVAT)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Thuế VAT:</span>
              <span className="font-medium text-gray-900">{formatVND(tongVAT)}</span>
            </div>
            <div className="border-t border-gray-200 pt-2 flex justify-between items-center">
              <span className="font-bold text-gray-800">Tổng thanh toán:</span>
              <span className="text-lg font-bold text-blue-700">{formatVND(tongThanhToan)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Đã thanh toán:</span>
              <span className="font-medium text-green-600">{formatVND(tongDaThanhToan)}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-semibold text-gray-700">Còn lại:</span>
              <span className={`font-bold text-base ${conLai > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                {formatVND(conLai)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Dong tien thanh toan */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Banknote className="w-5 h-5 text-primary-600" />
            Dòng tiền thanh toán
          </h2>
        </div>
        <div className="card-body p-0">
          {dongTienList.length === 0 ? (
            <p className="px-6 py-4 text-sm text-gray-500">Chưa có dòng tiền nào</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="table-header">Ngày</th>
                    <th className="table-header">Mô tả</th>
                    <th className="table-header">Tài khoản</th>
                    <th className="table-header text-right">Số tiền</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {dongTienList.map((dt: any) => (
                    <tr key={dt.id} className="hover:bg-gray-50 transition-colors">
                      <td className="table-cell text-gray-500 whitespace-nowrap">
                        {dt.ngay_giao_dich
                          ? dt.ngay_giao_dich.slice(0, 10).split('-').reverse().join('/')
                          : '--'}
                      </td>
                      <td className="table-cell text-gray-700">{dt.mo_ta_giao_dich || '--'}</td>
                      <td className="table-cell text-gray-700">{dt.ten_tai_khoan || '--'}</td>
                      <td className="table-cell text-right whitespace-nowrap font-semibold text-red-600">
                        {formatVND(dt.so_tien)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Cong no */}
      {conLai > 0 && (
        <div className="card border-amber-200">
          <div className="card-body">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-amber-500" />
                <span className="text-sm font-semibold text-gray-700">Công nợ còn phải thanh toán</span>
              </div>
              <span className="text-xl font-bold text-amber-600">{formatVND(conLai)}</span>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={(open) => { if (!open) setShowDeleteConfirm(false); }}
        title="Xóa hợp đồng mua"
        description={`Bạn có chắc muốn xóa hợp đồng mua "${hdm.so_hop_dong}"? Hành động này không thể hoàn tác.`}
        onConfirm={handleDelete}
        confirmText={deleting ? 'Đang xóa...' : 'Xóa'}
        cancelText="Hủy"
        variant="danger"
      />
    </div>
  );
}
