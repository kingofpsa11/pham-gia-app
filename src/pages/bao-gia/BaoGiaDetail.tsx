import { useState, useEffect, useMemo } from 'react';
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
  applyVanChuyenToChiTiet,
  calcTongGiaVonCoVanChuyen,
  calcLoiNhuanGop,
  driveFolderUrl,
} from '../../lib/utils';
import EntityInfoPanel from '../../components/shared/EntityInfoPanel';
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
  const [driveEmail, setDriveEmail] = useState('');

  useEffect(() => {
    if (id) fetchBaoGia();
  }, [id]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    fetch('/api/google-drive/status', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.connected && data.google_email) setDriveEmail(data.google_email);
      })
      .catch(() => {});
  }, []);

  const cheDoVC = Number(baoGia?.che_do_van_chuyen ?? 1);
  const phiVC = Number(baoGia?.phi_van_chuyen || 0);

  const withVCItems = useMemo(
    () => (baoGia ? applyVanChuyenToChiTiet(chiTiet, cheDoVC, phiVC) : []),
    [chiTiet, cheDoVC, phiVC, baoGia]
  );

  const calcItems = useMemo(
    () =>
      withVCItems.map((ct) => ({
        so_luong: ct.so_luong,
        gia_ban_thuc_te: ct.gia_ban_thuc_te,
        thue_suat: ct.thue_suat,
        don_gia_von: ct.don_gia_von,
      })),
    [withVCItems]
  );

  const tongTruocVAT = useMemo(() => calcTongTruocVAT(calcItems), [calcItems]);
  const tongVAT = useMemo(() => calcTongVAT(calcItems), [calcItems]);
  const tongThanhToan = useMemo(
    () => calcTongThanhToan(tongTruocVAT, tongVAT, cheDoVC === 0 ? phiVC : 0),
    [tongTruocVAT, tongVAT, cheDoVC, phiVC]
  );

  const vat8 = useMemo(
    () =>
      withVCItems
        .filter((r) => Number(r.thue_suat) === 8)
        .reduce((s, r) => s + calcVAT(calcThanhTienBan(Number(r.so_luong), r.gia_ban_thuc_te), 8), 0),
    [withVCItems]
  );

  const vat10 = useMemo(
    () =>
      withVCItems
        .filter((r) => Number(r.thue_suat) === 10)
        .reduce((s, r) => s + calcVAT(calcThanhTienBan(Number(r.so_luong), r.gia_ban_thuc_te), 10), 0),
    [withVCItems]
  );

  async function fetchBaoGia() {
    setLoading(true);
    try {
      const bgId = Number(id);
      const bgRes = await baoGiaApi.get(bgId);
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

      try {
        const fileRes = await tepDinhKemApi.list('bao_gia', bgId);
        setFileList((fileRes.data as TepDinhKem[]) || []);
      } catch {
        setFileList([]);
      }
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
      const token = localStorage.getItem('token');
      const resp = await fetch('/api/xuat-bao-gia-excel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          bao_gia_id: baoGia.id,
          mau_key: mauKey(baoGia.mau_bao_gia),
        }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Lỗi không xác định' }));
        throw new Error(err.message || err.error || 'Xuất Excel thất bại');
      }
      const blob = await resp.blob();
      const fileName = `${baoGia.so_bao_gia}.xlsx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);

      const link = resp.headers.get('X-Drive-Link');
      if (link) {
        setDriveLink(link);
        addToast('success', 'Đã tải file Excel (.xlsx) và lưu bản sao lên Google Drive');
      } else {
        setDriveLink(null);
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

  const tongGiaVonThuan = calcItems.reduce((s, item) => {
    const sl = typeof item.so_luong === 'string' ? parseFloat(item.so_luong) || 0 : (item.so_luong ?? 0);
    const gv = typeof item.don_gia_von === 'string' ? parseFloat(item.don_gia_von) || 0 : (item.don_gia_von ?? 0);
    return s + sl * gv;
  }, 0);
  const tongGiaVon = calcTongGiaVonCoVanChuyen(tongGiaVonThuan, phiVC, cheDoVC);
  const vcHoTro = cheDoVC === 2;
  const loiNhuanGop = calcLoiNhuanGop(calcItems, cheDoVC, phiVC);
  const tyLeLoiNhuan = tongTruocVAT > 0 ? Math.round((loiNhuanGop / tongTruocVAT) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <button
          onClick={() => navigate('/bao-gia')}
          className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors shrink-0"
          title="Quay lại"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0 space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-gray-900 truncate">{baoGia.so_bao_gia}</h1>
              <p className="mt-0.5 text-sm text-gray-500 truncate">
                {baoGia.khach_hang?.ten_cong_ty}
                {baoGia.ten_du_an ? ` — ${baoGia.ten_du_an}` : ''}
              </p>
            </div>
            {!editMode && (
              <div className="flex flex-wrap items-center gap-2 shrink-0">
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
                className="btn-secondary flex items-center gap-2 shrink-0"
              >
                <X className="w-4 h-4" />
                Thoát chỉnh sửa
              </button>
            )}
          </div>
          {!editMode && (
            <EntityInfoPanel
              embedded
              fields={[
                { label: 'Ngày báo giá', value: formatDate(baoGia.ngay_bao_gia) },
                { label: 'Phiên bản', value: `PB${baoGia.phien_ban}` },
                { label: 'Mẫu BG', value: baoGia.mau_bao_gia || '--' },
                { label: 'Chế độ VC', value: cheDoVanChuyenLabel(baoGia.che_do_van_chuyen) },
                { label: 'Phí VC', value: formatVND(baoGia.phi_van_chuyen) },
                {
                  label: 'Thư mục Drive',
                  value: baoGia.id_folder_du_an ? (
                    <a
                      href={driveFolderUrl(baoGia.id_folder_du_an, driveEmail)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-semibold text-blue-700 hover:underline inline-flex items-center gap-1"
                    >
                      <HardDrive className="w-3.5 h-3.5" />
                      {baoGia.ten_folder_du_an || 'Mở folder'}
                    </a>
                  ) : (
                    <span className="text-gray-400">Chưa tạo</span>
                  ),
                },
                {
                  label: 'Trạng thái',
                  value: baoGia.hop_dong_id ? (
                    <span className="badge-success">Đã chuyển HĐ</span>
                  ) : (
                    <span className="badge-warning">Chưa chuyển</span>
                  ),
                },
              ]}
            />
          )}
        </div>
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
                      {withVCItems.map((ct) => {
                        const thanhTien = calcThanhTienBan(ct.so_luong, ct.gia_ban_thuc_te);
                        const vat = calcVAT(thanhTien, ct.thue_suat);
                        const giaChua = Number(ct.gia_ban_chua_van_chuyen) || 0;
                        return (
                          <tr key={ct.id} className="hover:bg-gray-50 transition-colors">
                            <td className="table-cell font-medium text-gray-900 break-words whitespace-normal">{ct.ten_san_pham}</td>
                            <td className="table-cell text-gray-500">{ct.don_vi}</td>
                            <td className="table-cell text-right">{formatNumber(ct.so_luong)}</td>
                            <td className="table-cell text-right">{formatVND(ct.don_gia_von)}</td>
                            <td className="table-cell text-right">{formatPercent(ct.lai_suat_phan_tram)}</td>
                            <td className="table-cell text-right">
                              <div>{formatVND(ct.gia_ban_thuc_te)}</div>
                              {cheDoVC === 1 && ct.chi_phi_van_chuyen_phan_bo > 0 && (
                                <div className="text-xs text-orange-600">
                                  gốc {formatVND(giaChua)} + VC {formatVND(ct.chi_phi_van_chuyen_phan_bo)}
                                </div>
                              )}
                            </td>
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
            <div className="rounded-xl border border-green-200 bg-green-50 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-green-800 tracking-wide uppercase">Lợi nhuận gộp dự kiến</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${tyLeLoiNhuan >= 0 ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'}`}>
                  {tyLeLoiNhuan}%
                </span>
              </div>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">{vcHoTro ? 'Giá vốn hàng:' : 'Tổng giá vốn:'}</span>
                  <span className="font-medium text-red-600">
                    {tongGiaVonThuan > 0 ? formatVND(tongGiaVonThuan) : <span className="text-red-400">0</span>}
                  </span>
                </div>
                {vcHoTro && phiVC > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Chi phí VC (hỗ trợ):</span>
                    <span className="font-medium text-orange-700">{formatVND(phiVC)}</span>
                  </div>
                )}
                {vcHoTro && (
                  <div className="flex justify-between font-medium">
                    <span className="text-gray-700">Tổng giá vốn (gồm VC):</span>
                    <span className="text-red-600">
                      {tongGiaVon > 0 ? formatVND(tongGiaVon) : <span className="text-red-400">0</span>}
                    </span>
                  </div>
                )}
                {!vcHoTro && cheDoVC === 0 && phiVC > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Chi phí vận chuyển (thu riêng):</span>
                    <span className="font-medium text-orange-700">{formatVND(phiVC)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-600">Tổng giá bán:</span>
                  <span className="font-medium text-gray-900">
                    {tongTruocVAT > 0 ? formatVND(tongTruocVAT) : '0'}
                  </span>
                </div>
                <div className="border-t border-green-200 pt-2 mt-2 flex justify-between items-center">
                  <span className="font-bold text-green-800 uppercase text-xs tracking-wide">Lợi nhuận:</span>
                  <span className={`text-lg font-bold ${loiNhuanGop >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                    {formatVND(loiNhuanGop)}
                  </span>
                </div>
              </div>
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
