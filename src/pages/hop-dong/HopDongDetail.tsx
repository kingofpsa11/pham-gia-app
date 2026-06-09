import { useState, useEffect } from 'react';
import { hopDongApi, phieuGiaoHangApi, dongTienApi, tepDinhKemApi } from '../../lib/api';
import { useToastStore } from '../../store/toast';
import { useNavigate, useParams } from 'react-router-dom';
import {
  formatVND,
  formatDate,
  formatNumber,
  formatPercent,
  cheDoVanChuyenLabel,
  trangThaiHopDongLabel,
  trangThaiHopDongColor,
} from '../../lib/utils';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import HopDongForm from './HopDongForm';
import {
  ArrowLeft,
  Pencil,
  X,
  Paperclip,
  CreditCard,
  AlertTriangle,
  Package,
} from 'lucide-react';
import type {
  HopDong,
  HopDongChiTiet,
  KhachHang,
  PhieuGiaoHang,
  DongTien,
  TepDinhKem,
} from '../../types';

interface HopDongFull extends HopDong {
  khach_hang?: KhachHang;
  chi_tiet?: HopDongChiTiet[];
}

export default function HopDongDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const addToast = useToastStore((s) => s.addToast);

  const [hopDong, setHopDong] = useState<HopDongFull | null>(null);
  const [chiTiet, setChiTiet] = useState<HopDongChiTiet[]>([]);
  const [phieuGiaoList, setPhieuGiaoList] = useState<PhieuGiaoHang[]>([]);
  const [dongTienList, setDongTienList] = useState<DongTien[]>([]);
  const [fileList, setFileList] = useState<TepDinhKem[]>([]);
  const [congNo, setCongNo] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);

  // Status change dialogs
  const [showThanhLy, setShowThanhLy] = useState(false);
  const [showHuy, setShowHuy] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);

  useEffect(() => {
    if (id) fetchHopDong();
  }, [id]);

  async function fetchHopDong() {
    setLoading(true);
    try {
      const hdId = Number(id);

      const [hdRes, pghRes, dtRes, fileRes] = await Promise.all([
        hopDongApi.get(hdId),
        phieuGiaoHangApi.byHopDong(hdId),
        dongTienApi.byEntity({ hop_dong_id: String(hdId) }),
        tepDinhKemApi.list('hop_dong', hdId),
      ]);

      const hdData = hdRes.data;
      if (!hdData) {
        addToast('error', 'Không tìm thấy hợp đồng');
        navigate('/hop-dong');
        return;
      }

      setHopDong(hdData as HopDongFull);
      setChiTiet((hdData as any).chi_tiet || []);
      setPhieuGiaoList((pghRes.data as PhieuGiaoHang[]) || []);
      setDongTienList((dtRes.data as DongTien[]) || []);
      setFileList((fileRes.data as TepDinhKem[]) || []);

      // Calculate cong no: total gia_tri_ghi_no from phieu_giao_hang minus total ghi_no from dong_tien
      const tongGhiNo = ((pghRes.data as PhieuGiaoHang[]) || []).reduce(
        (sum, pgh) => sum + (pgh.gia_tri_ghi_no || 0),
        0
      );
      const tongDaThu = ((dtRes.data as DongTien[]) || []).reduce(
        (sum, dt) => sum + (dt.ghi_no || 0),
        0
      );
      setCongNo(tongGhiNo - tongDaThu);
    } catch (err) {
      console.error('Loi tai hop dong:', err);
      addToast('error', 'Không thể tải thông tin hợp đồng');
    } finally {
      setLoading(false);
    }
  }

  async function handleChangeStatus(newStatus: string) {
    if (!hopDong) return;
    setChangingStatus(true);
    try {
      await hopDongApi.update(hopDong.id, {
        khach_hang_id: hopDong.khach_hang_id,
        ten_du_an: hopDong.ten_du_an || '',
        so_hop_dong: hopDong.so_hop_dong,
        ngay_hop_dong: hopDong.ngay_hop_dong,
        file_hop_dong_id: hopDong.file_hop_dong_id || '',
        mo_ta_noi_dung: hopDong.mo_ta_noi_dung || '',
        trang_thai: newStatus,
        phi_van_chuyen: hopDong.phi_van_chuyen || 0,
        che_do_van_chuyen: hopDong.che_do_van_chuyen || 0,
      });

      addToast('success', `Đổi trạng thái hợp đồng thành ${trangThaiHopDongLabel(newStatus)}`);
      setShowThanhLy(false);
      setShowHuy(false);
      fetchHopDong();
    } catch (err) {
      console.error('Loi doi trang thai:', err);
      addToast('error', 'Không thể đổi trạng thái hợp đồng');
    } finally {
      setChangingStatus(false);
    }
  }

  function formatFileSize(bytes?: number | null): string {
    if (!bytes) return '--';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Đang tải thông tin hợp đồng...</p>
        </div>
      </div>
    );
  }

  if (!hopDong) return null;

  // Calculate summary from chi tiet
  const tongTruocVAT = chiTiet.reduce((sum, ct) => sum + Number(ct.so_luong || 0) * Number(ct.gia_hop_dong || 0), 0);
  const vat8 = chiTiet
    .filter((ct) => Number(ct.thue_suat) === 8)
    .reduce((sum, ct) => sum + Number(ct.so_luong || 0) * Number(ct.gia_hop_dong || 0) * 0.08, 0);
  const vat10 = chiTiet
    .filter((ct) => Number(ct.thue_suat) === 10)
    .reduce((sum, ct) => sum + Number(ct.so_luong || 0) * Number(ct.gia_hop_dong || 0) * 0.1, 0);
  const tongVAT = vat8 + vat10;
  const cheDoVC = Number(hopDong.che_do_van_chuyen ?? 0);
  const phiVC = Number(hopDong.phi_van_chuyen || 0);
  // Mode=0 (Riêng): cộng phí VC vào tổng; mode=1/2: VC đã tính vào giá bán/giá vốn
  const tongThanhToan = tongTruocVAT + tongVAT + (cheDoVC === 0 ? phiVC : 0);
  // Lãi gộp: doanh thu trước VAT trừ giá vốn + VC (nếu mode=1/2)
  const tongGiaVon = chiTiet.reduce((sum, ct) => sum + Number(ct.so_luong || 0) * Number(ct.don_gia_von || 0), 0)
    + (cheDoVC !== 0 ? phiVC : 0);
  const loiNhuanGop = tongTruocVAT - tongGiaVon;
  const tyLeLoiNhuan = tongTruocVAT > 0 ? Math.round((loiNhuanGop / tongTruocVAT) * 100) : 0;

  const canChangeStatus = hopDong.trang_thai === 'Hieu luc';

  if (isEditing && hopDong) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setIsEditing(false)}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
            title="Quay lại"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Chỉnh sửa hợp đồng</h1>
            <p className="mt-0.5 text-sm text-gray-500">{hopDong.so_hop_dong}</p>
          </div>
          <button
            onClick={() => setIsEditing(false)}
            className="ml-auto p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <HopDongForm
          mode="edit"
          hopDongId={hopDong.id}
          initialData={{ ...hopDong, chi_tiet: chiTiet }}
          onSaved={() => { setIsEditing(false); fetchHopDong(); }}
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
          onClick={() => navigate('/hop-dong')}
          className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
          title="Quay lại"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 truncate">{hopDong.so_hop_dong}</h1>
          <p className="mt-0.5 text-sm text-gray-500 truncate">
            {hopDong.khach_hang?.ten_cong_ty}
            {hopDong.ten_du_an ? ` - ${hopDong.ten_du_an}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsEditing(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Pencil className="w-4 h-4" />
            Chỉnh sửa
          </button>
          {canChangeStatus && (
            <>
              <button
                onClick={() => setShowThanhLy(true)}
                className="btn-secondary flex items-center gap-2"
              >
                Thanh lý
              </button>
              <button
                onClick={() => setShowHuy(true)}
                className="btn-secondary text-red-600 hover:bg-red-50 flex items-center gap-2"
              >
                Hủy
              </button>
            </>
          )}
        </div>
      </div>

      {/* Thong tin hop dong */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-lg font-semibold text-gray-900">Thông tin hợp đồng</h2>
        </div>
        <div className="card-body">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <div>
              <p className="text-xs font-medium text-gray-500">Số hợp đồng</p>
              <p className="text-sm font-semibold text-gray-900">{hopDong.so_hop_dong}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">Ngày hợp đồng</p>
              <p className="text-sm font-semibold text-gray-900">{formatDate(hopDong.ngay_hop_dong)}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">Khách hàng</p>
              <p className="text-sm font-semibold text-gray-900">{hopDong.khach_hang?.ten_cong_ty || '--'}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">Dự án</p>
              <p className="text-sm font-semibold text-gray-900">{hopDong.ten_du_an || '--'}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">Trạng thái</p>
              <span className={trangThaiHopDongColor(hopDong.trang_thai)}>
                {trangThaiHopDongLabel(hopDong.trang_thai)}
              </span>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">Chế độ vận chuyển</p>
              <p className="text-sm font-semibold text-gray-900">{cheDoVanChuyenLabel(hopDong.che_do_van_chuyen)}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">Phí vận chuyển</p>
              <p className="text-sm font-semibold text-gray-900">{formatVND(hopDong.phi_van_chuyen)}</p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-xs font-medium text-gray-500">Mô tả nội dung</p>
              <p className="text-sm font-semibold text-gray-900">{hopDong.mo_ta_noi_dung || '--'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Chi tiet hop dong */}
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
                    <th className="table-header text-right">Đơn giá vốn</th>
                    <th className="table-header text-right">Giá bán thực tế</th>
                    <th className="table-header text-right">Lãi (%)</th>
                    <th className="table-header text-right">Thuế (%)</th>
                    <th className="table-header text-right">Chênh lệch (%)</th>
                    <th className="table-header text-right">Giá hợp đồng</th>
                    <th className="table-header text-right">Thành tiền</th>
                    <th className="table-header text-right">Lãi thực tế</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {chiTiet.map((ct) => {
                    const sl = Number(ct.so_luong || 0);
                    const giaHD = Number(ct.gia_hop_dong || 0);
                    const giaBan = Number(ct.gia_ban_thuc_te || 0);
                    const giaVon = Number(ct.don_gia_von || 0);
                    const thanhTien = sl * giaHD;
                    const laiDonGia = giaBan - giaVon;
                    const laiThucTe = sl * laiDonGia;
                    const laiPct = giaVon > 0 ? Math.round((laiDonGia / giaVon) * 100 * 10) / 10 : 0;
                    return (
                      <tr key={ct.id} className="hover:bg-gray-50 transition-colors">
                        <td className="table-cell font-medium text-gray-900">{ct.ten_san_pham}</td>
                        <td className="table-cell text-gray-500">{ct.don_vi}</td>
                        <td className="table-cell text-right">{formatNumber(ct.so_luong)}</td>
                        <td className="table-cell text-right">{formatVND(ct.don_gia_von)}</td>
                        <td className="table-cell text-right">{formatVND(ct.gia_ban_thuc_te)}</td>
                        <td className={`table-cell text-right font-medium ${laiPct >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                          {laiPct}%
                        </td>
                        <td className="table-cell text-right">{formatPercent(ct.thue_suat)}</td>
                        <td className="table-cell text-right">{formatPercent(ct.chenh_lech_phan_tram)}</td>
                        <td className="table-cell text-right">{formatVND(ct.gia_hop_dong)}</td>
                        <td className="table-cell text-right font-semibold text-gray-900">{formatVND(thanhTien)}</td>
                        <td className={`table-cell text-right font-semibold ${laiThucTe >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatVND(laiThucTe)}
                        </td>
                      </tr>
                    );
                  })}
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Lãi gộp */}
            <div className="rounded-xl p-4 bg-green-50 border border-green-200">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-green-800 uppercase tracking-wide">Lãi gộp hợp đồng</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${tyLeLoiNhuan >= 0 ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'}`}>
                  {tyLeLoiNhuan}%
                </span>
              </div>
              <div className="text-sm text-gray-600 space-y-1.5 mb-3">
                <div className="flex justify-between">
                  <span>Doanh thu (trước VAT):</span>
                  <span className="font-medium text-gray-900">{formatVND(tongTruocVAT)}</span>
                </div>
                <div className="flex justify-between">
                  <span>
                    Tổng giá vốn
                    {cheDoVC === 1 && <span className="text-xs text-orange-500 ml-1">(+VC phân bổ)</span>}
                    {cheDoVC === 2 && <span className="text-xs text-orange-500 ml-1">(+VC hỗ trợ)</span>}
                    :
                  </span>
                  <span className="font-medium text-red-600">{formatVND(tongGiaVon)}</span>
                </div>
              </div>
              <div className={`text-2xl font-bold ${loiNhuanGop >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                {formatVND(loiNhuanGop)}
              </div>
            </div>

            {/* Tổng thanh toán */}
            <div className="rounded-xl p-4 bg-white border border-gray-200">
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Tiền hàng (chưa VAT)</span>
                  <span className="font-semibold text-gray-900">{formatVND(tongTruocVAT)}</span>
                </div>
                {vat8 > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-red-500">Thuế VAT 8%</span>
                    <span className="font-semibold text-red-500">{formatVND(vat8)}</span>
                  </div>
                )}
                {vat10 > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-red-500">Thuế VAT 10%</span>
                    <span className="font-semibold text-red-500">{formatVND(vat10)}</span>
                  </div>
                )}
                {cheDoVC === 0 && phiVC > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Phí vận chuyển (riêng)</span>
                    <span className="font-semibold text-gray-900">{formatVND(phiVC)}</span>
                  </div>
                )}
                <div className="border-t border-gray-200 pt-2 mt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-base font-semibold text-gray-900">Tổng thanh toán</span>
                    <span className="text-lg font-bold text-primary-600">{formatVND(tongThanhToan)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Phieu giao hang */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Package className="w-5 h-5 text-primary-600" />
            Phiếu giao hàng
          </h2>
        </div>
        <div className="card-body p-0">
          {phieuGiaoList.length === 0 ? (
            <p className="px-6 py-4 text-sm text-gray-500">Chưa có phiếu giao hàng nào</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="table-header">Số phiếu</th>
                    <th className="table-header">Ngày giao</th>
                    <th className="table-header">Nội dung</th>
                    <th className="table-header text-right">Giá trị ghi nợ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {phieuGiaoList.map((pgh) => (
                    <tr
                      key={pgh.id}
                      className="hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={() => navigate(`/phieu-giao-hang/${pgh.id}`)}
                    >
                      <td className="table-cell font-medium text-gray-900">{pgh.so_phieu}</td>
                      <td className="table-cell text-gray-500">{formatDate(pgh.ngay_giao)}</td>
                      <td className="table-cell text-gray-700">{pgh.noi_dung || '--'}</td>
                      <td className="table-cell text-right font-semibold text-gray-900">{formatVND(pgh.gia_tri_ghi_no)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Dong tien */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-primary-600" />
            Dòng tiền
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
                    <th className="table-header">Ngày thực hiện</th>
                    <th className="table-header">Mô tả giao dịch</th>
                    <th className="table-header text-right">Ghi nợ</th>
                    <th className="table-header text-right">Ghi có</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {dongTienList.map((dt) => (
                    <tr key={dt.id} className="hover:bg-gray-50 transition-colors">
                      <td className="table-cell text-gray-500">{formatDate(dt.ngay_gio_giao_dich)}</td>
                      <td className="table-cell text-gray-700">{dt.mo_ta_giao_dich || '--'}</td>
                      <td className="table-cell text-right font-semibold text-gray-900">{formatVND(dt.ghi_no)}</td>
                      <td className="table-cell text-right font-semibold text-gray-900">{formatVND(dt.ghi_co)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Cong no con lai */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Công nợ còn lại
          </h2>
        </div>
        <div className="card-body">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Tổng giá trị ghi nợ từ phiếu giao hàng trừ đi dòng tiền đã thu</p>
            </div>
            <span className="text-xl font-bold text-amber-600">{formatVND(congNo)}</span>
          </div>
        </div>
      </div>

      {/* File dinh kem */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Paperclip className="w-5 h-5 text-primary-600" />
            File đính kèm
          </h2>
        </div>
        <div className="card-body p-0">
          {fileList.length === 0 ? (
            <p className="px-6 py-4 text-sm text-gray-500">Chưa có file đính kèm nào</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {fileList.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between px-6 py-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <Paperclip className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{file.ten_file}</p>
                      <p className="text-xs text-gray-500">{formatFileSize(file.file_size)}</p>
                    </div>
                  </div>
                  <div className="ml-4 flex items-center gap-2">
                    {file.drive_url && (
                      <a
                        href={file.drive_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary-600 hover:text-primary-700 font-medium"
                      >
                        Mở
                      </a>
                    )}
                    <span className="text-xs text-gray-400 whitespace-nowrap">
                      {formatDate(file.created_at)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Thanh ly Confirm Dialog */}
      <ConfirmDialog
        open={showThanhLy}
        onOpenChange={setShowThanhLy}
        title="Thanh lý hợp đồng"
        description={`Bạn có chắc muốn thanh lý hợp đồng "${hopDong.so_hop_dong}"? Hợp đồng sẽ chuyển sang trạng thái "Thanh lý".`}
        onConfirm={() => handleChangeStatus('Thanh ly')}
        confirmText={changingStatus ? 'Đang xử lý...' : 'Thanh lý'}
        cancelText="Hủy"
        variant="danger"
      />

      {/* Huy Confirm Dialog */}
      <ConfirmDialog
        open={showHuy}
        onOpenChange={setShowHuy}
        title="Hủy hợp đồng"
        description={`Bạn có chắc muốn hủy hợp đồng "${hopDong.so_hop_dong}"? Hành động này không thể hoàn tác.`}
        onConfirm={() => handleChangeStatus('Huy')}
        confirmText={changingStatus ? 'Đang xử lý...' : 'Hủy hợp đồng'}
        cancelText="Hủy"
        variant="danger"
      />
    </div>
  );
}
