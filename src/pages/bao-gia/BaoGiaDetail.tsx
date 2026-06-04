import { useState, useEffect } from 'react';
import { baoGiaApi, tepDinhKemApi } from '../../lib/api';
import { useToastStore } from '../../store/toast';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  formatVND,
  formatDate,
  formatNumber,
  formatPercent,
  cheDoVanChuyenLabel,
  calcThanhTienBan,
  calcVAT,
  calcTongTruocVAT,
  calcTongVAT,
  calcTongThanhToan,
} from '../../lib/utils';
import BaoGiaForm from './BaoGiaForm';
import {
  ArrowLeft,
  Pencil,
  Copy,
  BookOpen,
  Paperclip,
  X,
  FileDown,
  HardDrive,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { BaoGia, BaoGiaChiTiet, KhachHang, TepDinhKem } from '../../types';

interface BaoGiaFull extends BaoGia {
  khach_hang?: KhachHang;
  chi_tiet?: BaoGiaChiTiet[];
}

export default function BaoGiaDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const addToast = useToastStore((s) => s.addToast);

  const [baoGia, setBaoGia] = useState<BaoGiaFull | null>(null);
  const [chiTiet, setChiTiet] = useState<BaoGiaChiTiet[]>([]);
  const [fileList, setFileList] = useState<TepDinhKem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);

  const [cloning, setCloning] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [driveLink, setDriveLink] = useState<string | null>(null);

  useEffect(() => {
    if (id) fetchBaoGia();
  }, [id]);

  async function fetchBaoGia() {
    setLoading(true);
    try {
      const bgId = Number(id);
      const [bgRes, fileRes] = await Promise.all([
        baoGiaApi.get(bgId),
        tepDinhKemApi.list('bao_gia', bgId),
      ]);
      if (!bgRes.data) {
        addToast('error', 'Không tìm thấy báo giá');
        navigate('/bao-gia');
        return;
      }
      const raw = bgRes.data as any;
      const enriched: BaoGiaFull = {
        ...raw,
        khach_hang: raw.ten_cong_ty ? { ten_cong_ty: raw.ten_cong_ty } as KhachHang : undefined,
      };
      setBaoGia(enriched);
      setChiTiet(raw.chi_tiet || []);
      setFileList((fileRes.data as TepDinhKem[]) || []);
    } catch (err) {
      console.error('Loi tai bao gia:', err);
      addToast('error', 'Không thể tải thông tin báo giá');
    } finally {
      setLoading(false);
    }
  }

  async function handleSaved() {
    setEditMode(false);
    await fetchBaoGia();
  }

  async function handleClone() {
    if (!baoGia) return;
    setCloning(true);
    try {
      const result = await baoGiaApi.clone(baoGia.id);
      const newPhienBan = (baoGia.phien_ban || 1) + 1;
      addToast('success', `Nhân bản báo giá thành công (PB${newPhienBan})`);
      navigate(`/bao-gia/${result.data.new_bao_gia_id}`);
    } catch (err) {
      console.error('Loi nhan ban bao gia:', err);
      addToast('error', 'Không thể nhân bản báo giá');
    } finally {
      setCloning(false);
    }
  }

  function mauKey(mau: string | undefined): string {
    switch (mau) {
      case 'Hapulico': return 'mau_bao_gia_hapulico';
      case 'PhamGia':  return 'mau_bao_gia_phamgia';
      case 'Litec':    return 'mau_bao_gia_litec';
      default:         return 'mau_bao_gia_hapulico';
    }
  }

  async function handleExportExcel() {
    if (!baoGia) return;
    setExporting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const resp = await fetch(`${supabaseUrl}/functions/v1/xuat-bao-gia-excel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ bao_gia_id: baoGia.id, mau_key: mauKey(baoGia.mau_bao_gia) }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Lỗi không xác định' }));
        throw new Error(err.error || 'Xuất Excel thất bại');
      }
      const link = resp.headers.get('X-Drive-Link');
      if (link) {
        setDriveLink(link);
        window.open(link, '_blank');
        addToast('success', 'Đã lưu vào Google Drive và mở file');
      } else {
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${baoGia.so_bao_gia}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
        addToast('success', 'Xuất file Excel thành công');
      }
    } catch (err: any) {
      console.error('Loi xuat excel:', err);
      addToast('error', err.message || 'Không thể xuất file Excel');
    } finally {
      setExporting(false);
    }
  }

  async function handleChuyenHopDong() {
    if (!baoGia) return;
    // Navigate sang form tạo hợp đồng với dữ liệu từ báo giá
    navigate('/hop-dong/tao-moi', {
      state: {
        fromBaoGia: {
          bao_gia_id: baoGia.id,
          so_bao_gia: baoGia.so_bao_gia,
          khach_hang_id: baoGia.khach_hang_id,
          ten_cong_ty: baoGia.khach_hang?.ten_cong_ty || '',
          ten_du_an: baoGia.ten_du_an || '',
          che_do_van_chuyen: baoGia.che_do_van_chuyen,
          phi_van_chuyen: baoGia.phi_van_chuyen,
          chi_tiet: chiTiet,
        },
      },
    });
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
          <p className="text-sm text-gray-500">Đang tải thông tin báo giá...</p>
        </div>
      </div>
    );
  }

  if (!baoGia) return null;

  const calcItems = chiTiet.map((ct) => ({
    so_luong: ct.so_luong,
    gia_ban_thuc_te: ct.gia_ban_thuc_te,
    thue_suat: ct.thue_suat,
    don_gia_von: ct.don_gia_von,
  }));
  const tongTruocVAT = calcTongTruocVAT(calcItems);
  const tongVAT = calcTongVAT(calcItems);
  const cheDoVC = Number(baoGia.che_do_van_chuyen ?? 1);
  const phiVC = Number(baoGia.phi_van_chuyen || 0);
  // mode=0 (Riêng): cộng VC vào tổng; mode=1/2: VC đã tính vào giá bán/giá vốn
  const tongThanhToan = calcTongThanhToan(tongTruocVAT, tongVAT, cheDoVC === 0 ? phiVC : 0);

  const tongGiaVonThuan = calcItems.reduce((s, item) => {
    const sl = typeof item.so_luong === 'string' ? parseFloat(item.so_luong) || 0 : (item.so_luong ?? 0);
    const gv = typeof item.don_gia_von === 'string' ? parseFloat(item.don_gia_von) || 0 : (item.don_gia_von ?? 0);
    return s + sl * gv;
  }, 0);
  // mode=1/2: phí VC do công ty chịu → cộng vào giá vốn để tính lợi nhuận thực
  const tongGiaVon = tongGiaVonThuan + (cheDoVC !== 0 ? phiVC : 0);
  const loiNhuanGop = tongTruocVAT - tongGiaVon;
  const tyLeLoiNhuan = tongTruocVAT > 0 ? Math.round((loiNhuanGop / tongTruocVAT) * 100) : 0;

  const vat8 = calcItems.reduce((s, item) => {
    const thue = typeof item.thue_suat === 'string' ? parseFloat(item.thue_suat) || 0 : (item.thue_suat ?? 0);
    if (thue !== 8) return s;
    const sl = typeof item.so_luong === 'string' ? parseFloat(item.so_luong) || 0 : (item.so_luong ?? 0);
    const gia = typeof item.gia_ban_thuc_te === 'string' ? parseFloat(item.gia_ban_thuc_te) || 0 : (item.gia_ban_thuc_te ?? 0);
    return s + sl * gia * 8 / 100;
  }, 0);
  const vat10 = calcItems.reduce((s, item) => {
    const thue = typeof item.thue_suat === 'string' ? parseFloat(item.thue_suat) || 0 : (item.thue_suat ?? 0);
    if (thue !== 10) return s;
    const sl = typeof item.so_luong === 'string' ? parseFloat(item.so_luong) || 0 : (item.so_luong ?? 0);
    const gia = typeof item.gia_ban_thuc_te === 'string' ? parseFloat(item.gia_ban_thuc_te) || 0 : (item.gia_ban_thuc_te ?? 0);
    return s + sl * gia * 10 / 100;
  }, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/bao-gia')}
          className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
          title="Quay lại"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 truncate">{baoGia.so_bao_gia}</h1>
          <p className="mt-0.5 text-sm text-gray-500 truncate">
            {baoGia.khach_hang?.ten_cong_ty}
            {baoGia.ten_du_an ? ` - ${baoGia.ten_du_an}` : ''}
          </p>
        </div>
        {!editMode && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setEditMode(true)}
              className="btn-primary flex items-center gap-2"
            >
              <Pencil className="w-4 h-4" />
              Chỉnh sửa
            </button>
            <button
              onClick={handleClone}
              disabled={cloning}
              className="btn-secondary flex items-center gap-2"
            >
              <Copy className="w-4 h-4" />
              {cloning ? 'Đang nhân bản...' : 'Nhân bản'}
            </button>
            <button
              onClick={handleExportExcel}
              disabled={exporting || !baoGia.mau_bao_gia}
              title={!baoGia.mau_bao_gia ? 'Báo giá chưa chọn mẫu' : 'Xuất file Excel theo mẫu'}
              className="btn-secondary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FileDown className="w-4 h-4" />
              {exporting ? 'Đang xuất...' : 'Xuất Excel'}
            </button>
            {driveLink && (
              <a
                href={driveLink}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary flex items-center gap-2 text-blue-600 border-blue-200 hover:bg-blue-50"
                title="Mở file trên Google Drive"
              >
                <HardDrive className="w-4 h-4" />
                Xem trên Drive
              </a>
            )}
            {!baoGia.hop_dong_id && (
              <button
                onClick={handleChuyenHopDong}
                className="btn-secondary flex items-center gap-2"
              >
                <BookOpen className="w-4 h-4" />
                Chuyển thành hợp đồng
              </button>
            )}
            {baoGia.hop_dong_id && (
              <Link
                to={`/hop-dong/${baoGia.hop_dong_id}`}
                className="badge-success flex items-center gap-1 px-3 py-2"
              >
                <BookOpen className="w-4 h-4" />
                Xem hợp đồng
              </Link>
            )}
          </div>
        )}
        {editMode && (
          <button
            onClick={() => setEditMode(false)}
            className="btn-secondary flex items-center gap-2"
          >
            <X className="w-4 h-4" />
            Thoát chỉnh sửa
          </button>
        )}
      </div>

      {/* Edit mode: inline form */}
      {editMode && (
        <BaoGiaForm
          mode="edit"
          baoGiaId={baoGia.id}
          initialData={baoGia}
          onSaved={handleSaved}
          onCancel={() => setEditMode(false)}
        />
      )}

      {/* View mode */}
      {!editMode && (
        <>
          {/* Thong tin bao gia */}
          <div className="card">
            <div className="card-header">
              <h2 className="text-lg font-semibold text-gray-900">Thông tin báo giá</h2>
            </div>
            <div className="card-body">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                <div>
                  <p className="text-xs font-medium text-gray-500">Số báo giá</p>
                  <p className="text-sm font-semibold text-gray-900">{baoGia.so_bao_gia}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500">Ngày báo giá</p>
                  <p className="text-sm font-semibold text-gray-900">{formatDate(baoGia.ngay_bao_gia)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500">Khách hàng</p>
                  <p className="text-sm font-semibold text-gray-900">{baoGia.khach_hang?.ten_cong_ty || '--'}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500">Dự án</p>
                  <p className="text-sm font-semibold text-gray-900">{baoGia.ten_du_an || '--'}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500">Phiên bản</p>
                  <p className="text-sm font-semibold text-gray-900">PB{baoGia.phien_ban}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500">Mẫu báo giá</p>
                  <p className="text-sm font-semibold text-gray-900">{baoGia.mau_bao_gia || '--'}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500">Chế độ vận chuyển</p>
                  <p className="text-sm font-semibold text-gray-900">{cheDoVanChuyenLabel(baoGia.che_do_van_chuyen)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500">Phí vận chuyển</p>
                  <p className="text-sm font-semibold text-gray-900">{formatVND(baoGia.phi_van_chuyen)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500">Trạng thái</p>
                  {baoGia.hop_dong_id ? (
                    <span className="badge-success">Đã chuyển HĐ</span>
                  ) : (
                    <span className="badge-warning">Chưa chuyển</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Chi tiet bao gia */}
          <div className="card">
            <div className="card-header">
              <h2 className="text-lg font-semibold text-gray-900">Chi tiết báo giá</h2>
            </div>
            <div className="card-body p-0">
              {chiTiet.length === 0 ? (
                <p className="px-6 py-4 text-sm text-gray-500">Chưa có sản phẩm nào</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th className="table-header w-64 max-w-xs">Tên sản phẩm</th>
                        <th className="table-header w-16">Đơn vị</th>
                        <th className="table-header w-20 text-right">Số lượng</th>
                        <th className="table-header w-32 text-right">Đơn giá vốn</th>
                        <th className="table-header w-24 text-right">Lãi suất (%)</th>
                        <th className="table-header w-32 text-right">Giá bán thực tế</th>
                        <th className="table-header w-16 text-right">Thuế (%)</th>
                        <th className="table-header w-32 text-right">Thành tiền</th>
                        <th className="table-header w-28 text-right">VAT</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {chiTiet.map((ct) => {
                        const thanhTien = calcThanhTienBan(ct.so_luong, ct.gia_ban_thuc_te);
                        const vat = calcVAT(thanhTien, ct.thue_suat);
                        return (
                          <tr key={ct.id} className="hover:bg-gray-50 transition-colors">
                            <td className="table-cell font-medium text-gray-900 break-words whitespace-normal">{ct.ten_san_pham}</td>
                            <td className="table-cell text-gray-500">{ct.don_vi}</td>
                            <td className="table-cell text-right">{formatNumber(ct.so_luong)}</td>
                            <td className="table-cell text-right">{formatVND(ct.don_gia_von)}</td>
                            <td className="table-cell text-right">{formatPercent(ct.lai_suat_phan_tram)}</td>
                            <td className="table-cell text-right">{formatVND(ct.gia_ban_thuc_te)}</td>
                            <td className="table-cell text-right">{formatPercent(ct.thue_suat)}</td>
                            <td className="table-cell text-right font-semibold text-gray-900">{formatVND(thanhTien)}</td>
                            <td className="table-cell text-right text-gray-500">{formatVND(vat)}</td>
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Loi nhuan gop */}
            <div className="rounded-xl border border-green-200 bg-green-50 p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-green-800 tracking-wide uppercase">Lợi nhuận gộp dự kiến</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${tyLeLoiNhuan >= 0 ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'}`}>
                  {tyLeLoiNhuan}%
                </span>
              </div>
              <div className={`text-3xl font-bold ${loiNhuanGop >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                {formatVND(loiNhuanGop)}
              </div>
              <p className="text-xs text-green-600 mt-2">
                Tiền hàng: {formatVND(tongTruocVAT)} &nbsp;·&nbsp; Giá vốn: {formatVND(tongGiaVon)}
              </p>
            </div>

            {/* Tong thanh toan */}
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <div className="divide-y divide-gray-100">
                <div className="flex items-center justify-between px-5 py-3 text-sm">
                  <span className="text-gray-500">Tiền hàng (Chưa VAT)</span>
                  <span className="font-semibold text-gray-900">{formatVND(tongTruocVAT)}</span>
                </div>
                <div className="flex items-center justify-between px-5 py-3 text-sm">
                  <span className="text-red-500">Thuế VAT 8%</span>
                  <span className="font-semibold text-red-500">{formatVND(vat8)}</span>
                </div>
                <div className="flex items-center justify-between px-5 py-3 text-sm">
                  <span className="text-red-500">Thuế VAT 10%</span>
                  <span className="font-semibold text-red-500">{formatVND(vat10)}</span>
                </div>
                {(baoGia.phi_van_chuyen ?? 0) > 0 && (
                  <div className="flex items-center justify-between px-5 py-3 text-sm">
                    <span className="text-gray-500">Phí vận chuyển</span>
                    <span className="font-semibold text-gray-900">{formatVND(baoGia.phi_van_chuyen)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between px-5 py-4 bg-blue-50">
                  <span className="text-sm font-bold text-gray-900 uppercase tracking-wide">Tổng thanh toán</span>
                  <span className="text-xl font-bold text-blue-600">{formatVND(tongThanhToan)}</span>
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
                    <div key={file.id}
                      className="flex items-center justify-between px-6 py-3 hover:bg-gray-50 transition-colors">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <Paperclip className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{file.ten_file}</p>
                          <p className="text-xs text-gray-500">{formatFileSize(file.file_size)}</p>
                        </div>
                      </div>
                      <div className="ml-4 flex items-center gap-2">
                        {file.drive_url && (
                          <a href={file.drive_url} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-primary-600 hover:text-primary-700 font-medium">
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

    </div>
  );
}
