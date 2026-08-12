import { useState, useEffect } from 'react';
import { hopDongApi, phieuGiaoHangApi, dongTienMoiApi, tepDinhKemApi } from '../../lib/api';
import { useToastStore } from '../../store/toast';
import { useNavigate, useParams } from 'react-router-dom';
import {
  formatVND,
  formatDate,
  formatDateTime,
  formatNumber,
  formatPercent,
  cheDoVanChuyenLabel,
  calcLoiNhuanGop,
  applyVanChuyenToChiTiet,
  giaBanThuanChoLoiNhuan,
  trangThaiHopDongLabel,
  trangThaiHopDongColor,
} from '../../lib/utils';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import LoiNhuanGopSummary from '../../components/shared/LoiNhuanGopSummary';
import HopDongForm from './HopDongForm';
import {
  ArrowLeft,
  Pencil,
  X,
  Paperclip,
  CreditCard,
  AlertTriangle,
  Package,
  FileText,
  Wallet,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';

type TabKey = 'chi-tiet' | 'tai-chinh';
import { giaTriGhiNoPhieu } from '../../lib/phieuGiaoHangTotals';
import type {
  HopDong,
  HopDongChiTiet,
  KhachHang,
  PhieuGiaoHang,
  DongTienMoi,
  TepDinhKem,
} from '../../types';

function isDongTienThu(dt: DongTienMoi): boolean {
  if (dt.loai_giao_dich === 'thu') return true;
  if (dt.loai_giao_dich === 'chuyen_khoan_noi_bo' && dt.chieu_tien === 'thu') return true;
  return false;
}

function isDongTienChi(dt: DongTienMoi): boolean {
  if (dt.loai_giao_dich === 'chi') return true;
  if (dt.loai_giao_dich === 'chuyen_khoan_noi_bo' && dt.chieu_tien === 'chi') return true;
  return false;
}

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
  const [dongTienList, setDongTienList] = useState<DongTienMoi[]>([]);
  const [fileList, setFileList] = useState<TepDinhKem[]>([]);
  const [congNo, setCongNo] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('chi-tiet');

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

      const hdRes = await hopDongApi.get(hdId);
      const hdData = hdRes.data;
      if (!hdData) {
        addToast('error', 'Không tìm thấy hợp đồng');
        navigate('/hop-dong');
        return;
      }

      const hd = hdData as HopDongFull & { ten_cong_ty?: string };
      setHopDong({
        ...hd,
        khach_hang: hd.khach_hang ?? (hd.ten_cong_ty ? { ten_cong_ty: hd.ten_cong_ty } as KhachHang : undefined),
      });
      setChiTiet(hd.chi_tiet || []);

      let pghRows: PhieuGiaoHang[] = [];
      let dtRows: DongTienMoi[] = [];
      let files: TepDinhKem[] = [];

      try {
        const pghRes = await phieuGiaoHangApi.byHopDong(hdId);
        pghRows = (pghRes.data as PhieuGiaoHang[]) || [];
      } catch (e) {
        console.error('Loi tai phieu giao hang:', e);
      }

      try {
        const dtRes = await dongTienMoiApi.list({ hop_dong_id: String(hdId), limit: 9999 });
        dtRows = (dtRes.data as DongTienMoi[]) || [];
      } catch (e) {
        console.error('Loi tai dong tien:', e);
      }

      try {
        const fileRes = await tepDinhKemApi.list('hop_dong', hdId);
        files = (fileRes.data as TepDinhKem[]) || [];
      } catch (e) {
        console.error('Loi tai tep dinh kem:', e);
      }

      setPhieuGiaoList(pghRows);
      setDongTienList(dtRows);
      setFileList(files);

      const tongGhiNo = pghRows.reduce((sum, pgh) => sum + giaTriGhiNoPhieu(pgh), 0);
      const tongDaThu = dtRows
        .filter(isDongTienThu)
        .reduce((sum, dt) => sum + (Number(dt.so_tien) || 0), 0);
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
      await hopDongApi.updateStatus(hopDong.id, newStatus);

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
  const tongGiaVonThuan = chiTiet.reduce(
    (sum, ct) => sum + Number(ct.so_luong || 0) * Number(ct.don_gia_von || 0),
    0
  );
  const withVCChiTiet = applyVanChuyenToChiTiet(
    chiTiet.map((ct) => ({
      ...ct,
      gia_ban_chua_van_chuyen:
        Number((ct as { gia_ban_chua_van_chuyen?: number }).gia_ban_chua_van_chuyen) ||
        Number(ct.gia_ban_thuc_te) ||
        0,
    })),
    cheDoVC,
    phiVC
  );
  const profitRows = withVCChiTiet.map((ct) => ({
    so_luong: ct.so_luong,
    gia_ban_thuc_te: giaBanThuanChoLoiNhuan(ct, cheDoVC),
    don_gia_von: ct.don_gia_von,
  }));
  const loiNhuanGop = calcLoiNhuanGop(profitRows, cheDoVC, phiVC);
  const tyLeLoiNhuan =
    tongTruocVAT > 0 ? Math.round((loiNhuanGop / tongTruocVAT) * 100) : 0;

  const thuDongTien = dongTienList.filter(isDongTienThu);
  const chiDongTien = dongTienList.filter(isDongTienChi);
  const tongThuThucTe = thuDongTien.reduce((s, dt) => s + (Number(dt.so_tien) || 0), 0);
  const tongChiPhi = chiDongTien.reduce((s, dt) => s + (Number(dt.so_tien) || 0), 0);
  const loiThucTe = tongThuThucTe - tongChiPhi;
  const tongGhiNoPGH = phieuGiaoList.reduce((s, pgh) => s + giaTriGhiNoPhieu(pgh), 0);

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

  const khachHangTen =
    hopDong.khach_hang?.ten_cong_ty || (hopDong as HopDongFull & { ten_cong_ty?: string }).ten_cong_ty || '';

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-4">
        <button
          onClick={() => navigate('/hop-dong')}
          className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors shrink-0"
          title="Quay lại"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0 space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-gray-900 truncate">
                {hopDong.so_hop_dong || `Hợp đồng #${hopDong.id}`}
              </h1>
              <p className="mt-0.5 text-sm text-gray-500 truncate">
                {[khachHangTen, hopDong.ten_du_an].filter(Boolean).join(' — ') || 'Chưa có thông tin khách hàng / dự án'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
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
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <p className="text-xs font-medium text-gray-500">Số hợp đồng</p>
                <p className="text-sm font-semibold text-gray-900">{hopDong.so_hop_dong || '--'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500">Khách hàng</p>
                <p className="text-sm font-semibold text-gray-900">{khachHangTen || '--'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500">Dự án</p>
                <p className="text-sm font-semibold text-gray-900">{hopDong.ten_du_an || '--'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500">Ngày hợp đồng</p>
                <p className="text-sm font-semibold text-gray-900">{formatDate(hopDong.ngay_hop_dong) || '--'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1.5">Trạng thái</p>
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold ${trangThaiHopDongColor(hopDong.trang_thai)}`}>
                  {trangThaiHopDongLabel(hopDong.trang_thai)}
                </span>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500">Chế độ VC</p>
                <p className="text-sm font-semibold text-gray-900">{cheDoVanChuyenLabel(hopDong.che_do_van_chuyen)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500">Phí VC</p>
                <p className="text-sm font-semibold text-gray-900">{formatVND(hopDong.phi_van_chuyen)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500">Tỷ lệ tạm ứng</p>
                <p className="text-sm font-semibold text-gray-900">
                  {hopDong.ty_le_tam_ung != null ? `${Number(hopDong.ty_le_tam_ung)}%` : '30%'}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500">Giá trị tạm ứng</p>
                <p className="text-sm font-semibold text-gray-900">{formatVND(hopDong.gia_tri_tam_ung || 0)}</p>
              </div>
              <div className="sm:col-span-2 lg:col-span-1">
                <p className="text-xs font-medium text-gray-500">Mô tả</p>
                <p className="text-sm font-semibold text-gray-900">{hopDong.mo_ta_noi_dung || '--'}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="border-b border-gray-200">
        <nav className="flex gap-0 overflow-x-auto" aria-label="Tabs">
          <button
            type="button"
            onClick={() => setActiveTab('chi-tiet')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
              activeTab === 'chi-tiet'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <FileText className="w-4 h-4" />
            Nội dung hợp đồng
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('tai-chinh')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
              activeTab === 'tai-chinh'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Wallet className="w-4 h-4" />
            Dòng tiền & công nợ
          </button>
        </nav>
      </div>

      {activeTab === 'chi-tiet' && (
      <>
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
            <LoiNhuanGopSummary
              tongGiaVonChuaVc={tongGiaVonThuan}
              phiVanChuyen={phiVC}
              giaBanChuaThue={tongTruocVAT}
              loiNhuan={loiNhuanGop}
              tyLeLai={tyLeLoiNhuan}
            />

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
                <div className="border-t border-gray-200 pt-2 mt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-base font-semibold text-gray-900">Tổng thanh toán</span>
                    <span className="text-lg font-bold text-primary-600">{formatVND(tongThanhToan)}</span>
                  </div>
                </div>
                <div className="border-t border-dashed border-gray-200 pt-2 mt-2 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Tỷ lệ tạm ứng</span>
                    <span className="font-semibold text-gray-900">
                      {hopDong.ty_le_tam_ung != null ? `${Number(hopDong.ty_le_tam_ung)}%` : '30%'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Giá trị tạm ứng</span>
                    <span className="font-semibold text-amber-700">{formatVND(hopDong.gia_tri_tam_ung || 0)}</span>
                  </div>
                </div>
              </div>
            </div>
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
      </>
      )}

      {activeTab === 'tai-chinh' && (
      <div className="space-y-6">
        {/* Tổng quan tài chính */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="card p-4">
            <p className="text-xs font-medium text-gray-500 mb-1">Đã thu (dòng tiền)</p>
            <p className="text-xl font-bold text-green-600">{formatVND(tongThuThucTe)}</p>
            <p className="text-xs text-gray-400 mt-1">{thuDongTien.length} giao dịch thu</p>
          </div>
          <div className="card p-4">
            <p className="text-xs font-medium text-gray-500 mb-1">Chi phí thực tế</p>
            <p className="text-xl font-bold text-red-600">{formatVND(tongChiPhi)}</p>
            <p className="text-xs text-gray-400 mt-1">{chiDongTien.length} giao dịch chi</p>
          </div>
          <div className="card p-4">
            <p className="text-xs font-medium text-gray-500 mb-1">Lãi thực tế</p>
            <p className={`text-xl font-bold flex items-center gap-1.5 ${loiThucTe >= 0 ? 'text-green-700' : 'text-red-600'}`}>
              {loiThucTe >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
              {formatVND(loiThucTe)}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              = Thu − Chi (Kế hoạch: {formatVND(loiNhuanGop)})
            </p>
          </div>
          <div className="card p-4">
            <p className="text-xs font-medium text-gray-500 mb-1">Ghi nợ PGH (sau VAT)</p>
            <p className="text-xl font-bold text-gray-900">{formatVND(tongGhiNoPGH)}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs font-medium text-gray-500 mb-1">Công nợ còn lại</p>
            <p className={`text-xl font-bold ${congNo > 0 ? 'text-amber-600' : 'text-green-600'}`}>
              {formatVND(congNo)}
            </p>
            <p className="text-xs text-gray-400 mt-1">Ghi nợ PGH − Đã thu</p>
          </div>
          <div className="card p-4">
            <p className="text-xs font-medium text-gray-500 mb-1">Giá trị hợp đồng</p>
            <p className="text-xl font-bold text-primary-600">{formatVND(tongThanhToan)}</p>
          </div>
        </div>

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
                      <th className="table-header text-right">Ghi nợ (sau VAT)</th>
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
                        <td className="table-cell text-right font-semibold text-gray-900">{formatVND(giaTriGhiNoPhieu(pgh))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-green-600" />
              Dòng tiền thu
            </h2>
          </div>
          <div className="card-body p-0">
            {thuDongTien.length === 0 ? (
              <p className="px-6 py-4 text-sm text-gray-500">Chưa có dòng tiền thu nào gắn hợp đồng này</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="table-header">Ngày GD</th>
                      <th className="table-header">Mô tả</th>
                      <th className="table-header">Hạng mục</th>
                      <th className="table-header">Tài khoản</th>
                      <th className="table-header text-right">Số tiền</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {thuDongTien.map((dt) => (
                      <tr key={dt.id} className="hover:bg-gray-50 transition-colors">
                        <td className="table-cell text-gray-500 whitespace-nowrap">{formatDateTime(dt.ngay_giao_dich)}</td>
                        <td className="table-cell text-gray-700">{dt.mo_ta_giao_dich || '--'}</td>
                        <td className="table-cell text-gray-500">{dt.ten_hang_muc || '--'}</td>
                        <td className="table-cell text-gray-700">{dt.ten_tai_khoan || '--'}</td>
                        <td className="table-cell text-right font-semibold text-green-600 whitespace-nowrap">
                          {formatVND(dt.so_tien)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-green-50">
                      <td colSpan={4} className="table-cell text-right font-semibold text-gray-700">Tổng thu</td>
                      <td className="table-cell text-right font-bold text-green-700">{formatVND(tongThuThucTe)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <TrendingDown className="w-5 h-5 text-red-500" />
              Chi phí
            </h2>
          </div>
          <div className="card-body p-0">
            {chiDongTien.length === 0 ? (
              <p className="px-6 py-4 text-sm text-gray-500">Chưa có chi phí nào gắn hợp đồng này</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="table-header">Ngày GD</th>
                      <th className="table-header">Mô tả</th>
                      <th className="table-header">Hạng mục</th>
                      <th className="table-header">Tài khoản</th>
                      <th className="table-header text-right">Số tiền</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {chiDongTien.map((dt) => (
                      <tr key={dt.id} className="hover:bg-gray-50 transition-colors">
                        <td className="table-cell text-gray-500 whitespace-nowrap">{formatDateTime(dt.ngay_giao_dich)}</td>
                        <td className="table-cell text-gray-700">{dt.mo_ta_giao_dich || '--'}</td>
                        <td className="table-cell text-gray-500">{dt.ten_hang_muc || '--'}</td>
                        <td className="table-cell text-gray-700">{dt.ten_tai_khoan || '--'}</td>
                        <td className="table-cell text-right font-semibold text-red-600 whitespace-nowrap">
                          {formatVND(dt.so_tien)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-red-50">
                      <td colSpan={4} className="table-cell text-right font-semibold text-gray-700">Tổng chi phí</td>
                      <td className="table-cell text-right font-bold text-red-700">{formatVND(tongChiPhi)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="card border-amber-200">
          <div className="card-header">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Công nợ & lãi thực tế
            </h2>
          </div>
          <div className="card-body space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Ghi nợ PGH (sau VAT)</span>
              <span className="font-semibold text-gray-900">{formatVND(tongGhiNoPGH)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Đã thu (dòng tiền)</span>
              <span className="font-semibold text-green-600">− {formatVND(tongThuThucTe)}</span>
            </div>
            <div className="border-t border-gray-200 pt-3 flex items-center justify-between">
              <span className="font-semibold text-gray-800">Công nợ còn lại</span>
              <span className={`text-xl font-bold ${congNo > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                {formatVND(congNo)}
              </span>
            </div>
            <div className="border-t border-gray-200 pt-3 flex items-center justify-between">
              <div>
                <p className="font-semibold text-gray-800">Lãi thực tế</p>
                <p className="text-xs text-gray-500">Tổng thu − Tổng chi phí (từ dòng tiền Excel)</p>
              </div>
              <span className={`text-xl font-bold ${loiThucTe >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                {formatVND(loiThucTe)}
              </span>
            </div>
          </div>
        </div>
      </div>
      )}

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
