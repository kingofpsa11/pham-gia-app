import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { phuLucHopDongApi } from '../../lib/api';
import { useToastStore } from '../../store/toast';
import { formatDate, formatNumber, formatVND } from '../../lib/utils';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { ArrowLeft, FileText, Trash2 } from 'lucide-react';
import type { PhuLucHopDong, PhuLucHopDongChiTiet } from '../../types';

export default function PhuLucDetail() {
  const { id, plId } = useParams<{ id: string; plId: string }>();
  const navigate = useNavigate();
  const addToast = useToastStore((s) => s.addToast);
  const [pl, setPl] = useState<(PhuLucHopDong & { chi_tiet?: PhuLucHopDongChiTiet[] }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!plId) return;
    (async () => {
      setLoading(true);
      try {
        const res = await phuLucHopDongApi.get(Number(plId));
        if (!res.data) {
          addToast('error', 'Không tìm thấy phụ lục');
          navigate(`/hop-dong/${id}`);
          return;
        }
        setPl(res.data);
      } catch {
        addToast('error', 'Không thể tải phụ lục');
      } finally {
        setLoading(false);
      }
    })();
  }, [plId, id]);

  async function handleExport() {
    if (!pl) return;
    setExporting(true);
    try {
      const token = localStorage.getItem('token');
      const resp = await fetch('/api/xuat-phu-luc-word', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ phu_luc_id: pl.id }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Lỗi không xác định' }));
        throw new Error(err.message || err.error || 'Xuất Word thất bại');
      }
      const blob = await resp.blob();
      const cd = resp.headers.get('Content-Disposition') || '';
      const match = cd.match(/filename="([^"]+)"/);
      const fileName = match?.[1] || `PLHD_${pl.so_phu_luc}.docx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
      addToast('success', 'Xuất phụ lục Word thành công');
    } catch (err: unknown) {
      addToast('error', err instanceof Error ? err.message : 'Không thể xuất Word');
    } finally {
      setExporting(false);
    }
  }

  async function handleDelete() {
    if (!pl) return;
    setDeleting(true);
    try {
      await phuLucHopDongApi.delete(pl.id);
      addToast('success', 'Đã xóa phụ lục và hoàn tác khối lượng hợp đồng');
      navigate(`/hop-dong/${pl.hop_dong_id}`);
    } catch (err: unknown) {
      addToast('error', err instanceof Error ? err.message : 'Không thể xóa phụ lục');
    } finally {
      setDeleting(false);
      setShowDelete(false);
    }
  }

  if (loading || !pl) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
      </div>
    );
  }

  const chiTiet = pl.chi_tiet || [];
  const loaiLabel: Record<string, string> = { tang: 'Tăng', giam: 'Giảm', moi: 'Hàng mới' };

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <button
          onClick={() => navigate(`/hop-dong/${pl.hop_dong_id}`)}
          className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 shrink-0"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-gray-900">Phụ lục hợp đồng {pl.so_phu_luc}</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            <Link to={`/hop-dong/${pl.hop_dong_id}`} className="text-primary-600 hover:underline">
              {pl.so_hop_dong}
            </Link>
            {pl.ten_cong_ty ? ` — ${pl.ten_cong_ty}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <button className="btn-secondary flex items-center gap-2" onClick={handleExport} disabled={exporting}>
            <FileText className="w-4 h-4" />
            {exporting ? 'Đang xuất...' : 'Xuất Word'}
          </button>
          <button
            className="btn-secondary text-red-600 hover:bg-red-50 flex items-center gap-2"
            onClick={() => setShowDelete(true)}
          >
            <Trash2 className="w-4 h-4" />
            Xóa / hoàn tác
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-body grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-gray-500">Số phụ lục</p>
            <p className="text-sm font-semibold">{pl.so_phu_luc}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Ngày ký</p>
            <p className="text-sm font-semibold">{formatDate(pl.ngay_ky) || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Giá trị PL (sau thuế)</p>
            <p className={`text-sm font-semibold ${Number(pl.gia_tri_phu_luc) >= 0 ? 'text-blue-700' : 'text-red-600'}`}>
              {formatVND(pl.gia_tri_phu_luc)}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Giá trị HĐ sau PL</p>
            <p className="text-sm font-semibold text-primary-600">{formatVND(pl.gia_tri_hd_sau)}</p>
          </div>
          {pl.ly_do && (
            <div className="sm:col-span-2 lg:col-span-4">
              <p className="text-xs text-gray-500">Lý do</p>
              <p className="text-sm text-gray-800">{pl.ly_do}</p>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="text-lg font-semibold">Chi tiết điều chỉnh</h2>
        </div>
        <div className="card-body p-0 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-header">Loại</th>
                <th className="table-header">Sản phẩm</th>
                <th className="table-header">ĐV</th>
                <th className="table-header text-right">SL cũ</th>
                <th className="table-header text-right">SL +/-</th>
                <th className="table-header text-right">SL mới</th>
                <th className="table-header text-right">Đơn giá HĐ</th>
                <th className="table-header text-right">Thuế</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {chiTiet.map((ct) => (
                <tr key={ct.id}>
                  <td className="table-cell">
                    <span className={`text-xs font-semibold ${
                      ct.loai === 'giam' ? 'text-red-600' : ct.loai === 'moi' ? 'text-blue-700' : 'text-green-700'
                    }`}>
                      {loaiLabel[ct.loai] || ct.loai}
                    </span>
                  </td>
                  <td className="table-cell font-medium">{ct.ten_san_pham}</td>
                  <td className="table-cell text-gray-500">{ct.don_vi}</td>
                  <td className="table-cell text-right">{formatNumber(ct.so_luong_cu, 2)}</td>
                  <td className={`table-cell text-right font-semibold ${Number(ct.so_luong_thay_doi) < 0 ? 'text-red-600' : 'text-green-700'}`}>
                    {Number(ct.so_luong_thay_doi) > 0 ? '+' : ''}{formatNumber(ct.so_luong_thay_doi, 2)}
                  </td>
                  <td className="table-cell text-right">{formatNumber(ct.so_luong_moi, 2)}</td>
                  <td className="table-cell text-right">{formatVND(ct.gia_hop_dong)}</td>
                  <td className="table-cell text-right">{ct.thue_suat}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-body space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Giá trị HĐ trước PL</span>
            <span className="font-semibold">{formatVND(pl.gia_tri_hd_truoc)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Giá trị phụ lục</span>
            <span className="font-semibold">{formatVND(pl.gia_tri_phu_luc)}</span>
          </div>
          <div className="flex justify-between border-t pt-2">
            <span className="font-semibold">Giá trị HĐ + PL</span>
            <span className="text-lg font-bold text-primary-600">{formatVND(pl.gia_tri_hd_sau)}</span>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={showDelete}
        onOpenChange={setShowDelete}
        title="Xóa phụ lục"
        description={`Xóa PLHĐ ${pl.so_phu_luc} và hoàn tác khối lượng về trước khi lập phụ lục? Chỉ xóa được phụ lục mới nhất.`}
        onConfirm={handleDelete}
        confirmText={deleting ? 'Đang xóa...' : 'Xóa và hoàn tác'}
        variant="danger"
      />
    </div>
  );
}
