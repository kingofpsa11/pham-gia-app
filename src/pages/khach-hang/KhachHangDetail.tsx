import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { khachHangApi, baoGiaApi, hopDongApi, phieuGiaoHangApi, dongTienApi, tepDinhKemApi } from '../../lib/api';
import { useToastStore } from '../../store/toast';
import { formatVND, formatDate, trangThaiHopDongLabel, trangThaiHopDongColor } from '../../lib/utils';
import Modal from '../../components/ui/Modal';
import {
  ArrowLeft,
  Pencil,
  Users,
  FileText,
  BookOpen,
  Receipt,
  Banknote,
  CircleDollarSign,
  Paperclip,
  Phone,
  Mail,
  MapPin,
  Briefcase,
  CreditCard,
  User,
} from 'lucide-react';
import type {
  KhachHang,
  BaoGia,
  HopDong,
  PhieuGiaoHang,
  DongTien,
  TepDinhKem,
} from '../../types';

interface FormValues {
  ten_cong_ty: string;
  ma_so_thue: string;
  dia_chi: string;
  dien_thoai: string;
  email: string;
  tai_khoan_ngan_hang: string;
  nguoi_dai_dien: string;
  chuc_vu: string;
}

const emptyForm: FormValues = {
  ten_cong_ty: '',
  ma_so_thue: '',
  dia_chi: '',
  dien_thoai: '',
  email: '',
  tai_khoan_ngan_hang: '',
  nguoi_dai_dien: '',
  chuc_vu: '',
};

type TabKey = 'bao-gia' | 'hop-dong' | 'phieu-giao-hang' | 'dong-tien' | 'cong-no' | 'file-dinh-kem';

interface TabItem {
  key: TabKey;
  label: string;
  icon: React.ReactNode;
}

export default function KhachHangDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const addToast = useToastStore((s) => s.addToast);

  const [khachHang, setKhachHang] = useState<KhachHang | null>(null);
  const [loading, setLoading] = useState(true);

  const [baoGiaList, setBaoGiaList] = useState<BaoGia[]>([]);
  const [hopDongList, setHopDongList] = useState<HopDong[]>([]);
  const [phieuGiaoHangList, setPhieuGiaoHangList] = useState<PhieuGiaoHang[]>([]);
  const [dongTienList, setDongTienList] = useState<DongTien[]>([]);
  const [fileList, setFileList] = useState<TepDinhKem[]>([]);

  const [congNoPhaiThu, setCongNoPhaiThu] = useState(0);
  const [tongGhiNoPhieuGiao, setTongGhiNoPhieuGiao] = useState(0);
  const [tongGhiNoDongTien, setTongGhiNoDongTien] = useState(0);

  const [activeTab, setActiveTab] = useState<TabKey>('bao-gia');

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [form, setForm] = useState<FormValues>(emptyForm);
  const [saving, setSaving] = useState(false);

  const tabs: TabItem[] = [
    { key: 'bao-gia', label: 'Báo giá', icon: <FileText className="w-4 h-4" /> },
    { key: 'hop-dong', label: 'Hợp đồng', icon: <BookOpen className="w-4 h-4" /> },
    { key: 'phieu-giao-hang', label: 'Phiếu giao hàng', icon: <Receipt className="w-4 h-4" /> },
    { key: 'dong-tien', label: 'Dòng tiền', icon: <Banknote className="w-4 h-4" /> },
    { key: 'cong-no', label: 'Công nợ', icon: <CircleDollarSign className="w-4 h-4" /> },
    { key: 'file-dinh-kem', label: 'File đính kèm', icon: <Paperclip className="w-4 h-4" /> },
  ];

  useEffect(() => {
    if (id) fetchAll();
  }, [id]);

  async function fetchAll() {
    setLoading(true);
    try {
      const khId = Number(id);

      const [
        khRes,
        bgRes,
        hdRes,
        pghRes,
        dtRes,
        fileRes,
      ] = await Promise.all([
        khachHangApi.get(khId),
        baoGiaApi.byKhachHang(khId),
        hopDongApi.byKhachHang(khId),
        phieuGiaoHangApi.byKhachHang(khId),
        dongTienApi.byEntity({ khach_hang_id: khId }),
        tepDinhKemApi.list('khach_hang', khId),
      ]);

      if (!khRes.data) {
        addToast('error', 'Không tìm thấy khách hàng');
        navigate('/khach-hang');
        return;
      }

      setKhachHang(khRes.data as KhachHang);
      setBaoGiaList((bgRes.data as BaoGia[]) || []);
      setHopDongList((hdRes.data as HopDong[]) || []);
      setPhieuGiaoHangList((pghRes.data as PhieuGiaoHang[]) || []);
      setDongTienList((dtRes.data as DongTien[]) || []);
      setFileList((fileRes.data as TepDinhKem[]) || []);

      // Calculate cong no
      const pghData = (pghRes.data as PhieuGiaoHang[]) || [];
      const dtData = (dtRes.data as DongTien[]) || [];
      const tongGhiNoPGH = pghData.reduce(
        (sum, pgh) => sum + (pgh.gia_tri_ghi_no || 0), 0
      );
      const tongGhiNoDT = dtData.reduce(
        (sum, dt) => sum + (dt.ghi_no || 0), 0
      );
      setTongGhiNoPhieuGiao(tongGhiNoPGH);
      setTongGhiNoDongTien(tongGhiNoDT);
      setCongNoPhaiThu(tongGhiNoPGH - tongGhiNoDT);
    } catch (err) {
      console.error('Lỗi tải thông tin khách hàng:', err);
      addToast('error', 'Không thể tải thông tin khách hàng');
    } finally {
      setLoading(false);
    }
  }

  function openEditModal() {
    if (!khachHang) return;
    setForm({
      ten_cong_ty: khachHang.ten_cong_ty || '',
      ma_so_thue: khachHang.ma_so_thue || '',
      dia_chi: khachHang.dia_chi || '',
      dien_thoai: khachHang.dien_thoai || '',
      email: khachHang.email || '',
      tai_khoan_ngan_hang: khachHang.tai_khoan_ngan_hang || '',
      nguoi_dai_dien: khachHang.nguoi_dai_dien || '',
      chuc_vu: khachHang.chuc_vu || '',
    });
    setEditModalOpen(true);
  }

  async function handleSave() {
    if (!form.ten_cong_ty.trim()) {
      addToast('warning', 'Vui lòng nhập tên khách hàng');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ten_cong_ty: form.ten_cong_ty.trim(),
        ma_so_thue: form.ma_so_thue.trim() || null,
        dia_chi: form.dia_chi.trim() || null,
        dien_thoai: form.dien_thoai.trim() || null,
        email: form.email.trim() || null,
        tai_khoan_ngan_hang: form.tai_khoan_ngan_hang.trim() || null,
        nguoi_dai_dien: form.nguoi_dai_dien.trim() || null,
        chuc_vu: form.chuc_vu.trim() || null,
      };

      await khachHangApi.update(khachHang!.id, payload);
      addToast('success', 'Cập nhật khách hàng thành công');
      setEditModalOpen(false);
      fetchAll();
    } catch (err) {
      console.error('Lỗi cập nhật khách hàng:', err);
      addToast('error', 'Không thể cập nhật khách hàng');
    } finally {
      setSaving(false);
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
          <p className="text-sm text-gray-500">Đang tải thông tin khách hàng...</p>
        </div>
      </div>
    );
  }

  if (!khachHang) return null;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/khach-hang')}
          className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
          title="Quay lại"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 truncate">{khachHang.ten_cong_ty}</h1>
          {khachHang.ten_cong_ty && (
            <p className="mt-0.5 text-sm text-gray-500 truncate">{khachHang.ten_cong_ty}</p>
          )}
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={openEditModal}>
          <Pencil className="w-4 h-4" />
          Sửa thông tin
        </button>
      </div>

      {/* Customer Info Card */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-primary-600" />
            Thông tin khách hàng
          </h2>
        </div>
        <div className="card-body">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                <Briefcase className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500">Tên công ty</p>
                <p className="text-sm font-semibold text-gray-900">{khachHang.ten_cong_ty}</p>
              </div>
            </div>

            {khachHang.ma_so_thue && (
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center">
                  <FileText className="w-4 h-4 text-purple-600" />
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500">Mã số thuế</p>
                  <p className="text-sm font-semibold text-gray-900">{khachHang.ma_so_thue}</p>
                </div>
              </div>
            )}

            {khachHang.dia_chi && (
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                  <MapPin className="w-4 h-4 text-emerald-600" />
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500">Địa chỉ</p>
                  <p className="text-sm font-semibold text-gray-900">{khachHang.dia_chi}</p>
                </div>
              </div>
            )}

            {khachHang.dien_thoai && (
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
                  <Phone className="w-4 h-4 text-amber-600" />
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500">Điện thoại</p>
                  <p className="text-sm font-semibold text-gray-900">{khachHang.dien_thoai}</p>
                </div>
              </div>
            )}

            {khachHang.email && (
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
                  <Mail className="w-4 h-4 text-red-600" />
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500">Email</p>
                  <p className="text-sm font-semibold text-gray-900">{khachHang.email}</p>
                </div>
              </div>
            )}

            {khachHang.tai_khoan_ngan_hang && (
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-cyan-50 flex items-center justify-center">
                  <CreditCard className="w-4 h-4 text-cyan-600" />
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500">Tài khoản ngân hàng</p>
                  <p className="text-sm font-semibold text-gray-900">{khachHang.tai_khoan_ngan_hang}</p>
                </div>
              </div>
            )}

            {khachHang.nguoi_dai_dien && (
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
                  <User className="w-4 h-4 text-indigo-600" />
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500">Người đại diện</p>
                  <p className="text-sm font-semibold text-gray-900">
                    {khachHang.nguoi_dai_dien}
                    {khachHang.chuc_vu ? ` - ${khachHang.chuc_vu}` : ''}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-0 overflow-x-auto" aria-label="Tabs">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                activeTab === tab.key
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div>
        {/* Báo giá */}
        {activeTab === 'bao-gia' && (
          <div className="card">
            <div className="card-header">
              <h3 className="text-base font-semibold text-gray-900">Danh sách báo giá</h3>
            </div>
            <div className="card-body p-0">
              {baoGiaList.length === 0 ? (
                <p className="px-6 py-4 text-sm text-gray-500">Chưa có báo giá nào</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {baoGiaList.map((bg) => (
                    <div
                      key={bg.id}
                      className="flex items-center justify-between px-6 py-3 hover:bg-gray-50 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 truncate">{bg.so_bao_gia}</p>
                        <p className="text-xs text-gray-500 truncate">{bg.ten_du_an || '--'}</p>
                      </div>
                      <div className="ml-4 flex items-center gap-3">
                        <span className="text-xs text-gray-400 whitespace-nowrap">
                          {formatDate(bg.ngay_bao_gia)}
                        </span>
                        <span className="badge-info">PB{bg.phien_ban}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Hợp đồng */}
        {activeTab === 'hop-dong' && (
          <div className="card">
            <div className="card-header">
              <h3 className="text-base font-semibold text-gray-900">Danh sách hợp đồng</h3>
            </div>
            <div className="card-body p-0">
              {hopDongList.length === 0 ? (
                <p className="px-6 py-4 text-sm text-gray-500">Chưa có hợp đồng nào</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {hopDongList.map((hd) => (
                    <div
                      key={hd.id}
                      className="flex items-center justify-between px-6 py-3 hover:bg-gray-50 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 truncate">{hd.so_hop_dong}</p>
                        <p className="text-xs text-gray-500 truncate">{hd.ten_du_an || '--'}</p>
                      </div>
                      <div className="ml-4 flex items-center gap-3">
                        <span className={trangThaiHopDongColor(hd.trang_thai)}>
                          {trangThaiHopDongLabel(hd.trang_thai)}
                        </span>
                        <span className="text-xs text-gray-400 whitespace-nowrap">
                          {formatDate(hd.ngay_hop_dong)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Phiếu giao hàng */}
        {activeTab === 'phieu-giao-hang' && (
          <div className="card">
            <div className="card-header">
              <h3 className="text-base font-semibold text-gray-900">Danh sách phiếu giao hàng</h3>
            </div>
            <div className="card-body p-0">
              {phieuGiaoHangList.length === 0 ? (
                <p className="px-6 py-4 text-sm text-gray-500">Chưa có phiếu giao hàng nào</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {phieuGiaoHangList.map((pgh) => (
                    <div
                      key={pgh.id}
                      className="flex items-center justify-between px-6 py-3 hover:bg-gray-50 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 truncate">{pgh.so_phieu}</p>
                        <p className="text-xs text-gray-500 truncate">{pgh.noi_dung || '--'}</p>
                      </div>
                      <div className="ml-4 flex items-center gap-3">
                        <span className="text-sm font-semibold text-gray-900 whitespace-nowrap">
                          {formatVND(pgh.gia_tri_ghi_no)}
                        </span>
                        <span className="text-xs text-gray-400 whitespace-nowrap">
                          {formatDate(pgh.ngay_giao)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Dòng tiền */}
        {activeTab === 'dong-tien' && (
          <div className="card">
            <div className="card-header">
              <h3 className="text-base font-semibold text-gray-900">Danh sách dòng tiền</h3>
            </div>
            <div className="card-body p-0">
              {dongTienList.length === 0 ? (
                <p className="px-6 py-4 text-sm text-gray-500">Chưa có giao dịch nào</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {dongTienList.map((dt) => (
                    <div
                      key={dt.id}
                      className="flex items-center justify-between px-6 py-3 hover:bg-gray-50 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 truncate">{dt.mo_ta_giao_dich}</p>
                      </div>
                      <div className="ml-4 flex items-center gap-3">
                        {dt.ghi_no > 0 ? (
                          <span className="text-sm font-semibold text-emerald-600 whitespace-nowrap">
                            +{formatVND(dt.ghi_no)}
                          </span>
                        ) : (
                          <span className="text-sm font-semibold text-red-600 whitespace-nowrap">
                            -{formatVND(dt.ghi_co)}
                          </span>
                        )}
                        <span className="text-xs text-gray-400 whitespace-nowrap">
                          {formatDate(dt.ngay_gio_giao_dich)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Công nợ */}
        {activeTab === 'cong-no' && (
          <div className="card">
            <div className="card-header">
              <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <CircleDollarSign className="w-5 h-5 text-primary-600" />
                Công nợ
              </h3>
            </div>
            <div className="card-body">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <div className="p-4 bg-blue-50 rounded-lg">
                  <p className="text-xs font-medium text-gray-500 mb-1">Tổng ghi no (Phiếu giao hàng)</p>
                  <p className="text-lg font-bold text-blue-700">{formatVND(tongGhiNoPhieuGiao)}</p>
                </div>
                <div className="p-4 bg-emerald-50 rounded-lg">
                  <p className="text-xs font-medium text-gray-500 mb-1">Tổng đã thu (Dòng tiền ghi no)</p>
                  <p className="text-lg font-bold text-emerald-700">{formatVND(tongGhiNoDongTien)}</p>
                </div>
                <div className="p-4 bg-red-50 rounded-lg">
                  <p className="text-xs font-medium text-gray-500 mb-1">Công nợ phải thu</p>
                  <p className={`text-lg font-bold ${congNoPhaiThu >= 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                    {formatVND(congNoPhaiThu)}
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-gray-700">Chi tiết phiếu giao hàng (ghi no)</h4>
                {phieuGiaoHangList.length === 0 ? (
                  <p className="text-sm text-gray-500">Chưa có phiếu giao hàng nào</p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="w-full">
                      <thead>
                        <tr>
                          <th className="table-header">Số phiếu</th>
                          <th className="table-header">Ngày giao</th>
                          <th className="table-header">Nội dung</th>
                          <th className="table-header text-right">Giá trị ghi no</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {phieuGiaoHangList.map((pgh) => (
                          <tr key={pgh.id} className="hover:bg-gray-50 transition-colors">
                            <td className="table-cell font-medium text-gray-900">{pgh.so_phieu}</td>
                            <td className="table-cell text-gray-500">{formatDate(pgh.ngay_giao)}</td>
                            <td className="table-cell text-gray-500">{pgh.noi_dung || '--'}</td>
                            <td className="table-cell text-right font-semibold text-gray-900">
                              {formatVND(pgh.gia_tri_ghi_no)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <h4 className="text-sm font-semibold text-gray-700 pt-2">Chi tiết dòng tiền thu (ghi no)</h4>
                {dongTienList.length === 0 ? (
                  <p className="text-sm text-gray-500">Chưa có giao dịch nào</p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="w-full">
                      <thead>
                        <tr>
                          <th className="table-header">Ngày giao dịch</th>
                          <th className="table-header">Mô tả</th>
                          <th className="table-header text-right">Ghi no</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {dongTienList.filter((dt) => dt.ghi_no > 0).map((dt) => (
                          <tr key={dt.id} className="hover:bg-gray-50 transition-colors">
                            <td className="table-cell text-gray-500">{formatDate(dt.ngay_gio_giao_dich)}</td>
                            <td className="table-cell font-medium text-gray-900">{dt.mo_ta_giao_dich}</td>
                            <td className="table-cell text-right font-semibold text-emerald-600">
                              +{formatVND(dt.ghi_no)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* File đính kèm */}
        {activeTab === 'file-dinh-kem' && (
          <div className="card">
            <div className="card-header">
              <h3 className="text-base font-semibold text-gray-900">File đính kèm</h3>
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
        )}
      </div>

      {/* Edit Modal */}
      <Modal
        open={editModalOpen}
        onOpenChange={setEditModalOpen}
        title="Sửa thông tin khách hàng"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setEditModalOpen(false)} disabled={saving}>
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
              Tên công ty <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.ten_cong_ty}
              onChange={(e) => setForm((f) => ({ ...f, ten_cong_ty: e.target.value }))}
              className="input-field w-full"
              placeholder="Nhập tên công ty"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mã số thuế</label>
            <input
              type="text"
              value={form.ma_so_thue}
              onChange={(e) => setForm((f) => ({ ...f, ma_so_thue: e.target.value }))}
              className="input-field w-full"
              placeholder="Nhập mã số thuế"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Địa chỉ</label>
            <input
              type="text"
              value={form.dia_chi}
              onChange={(e) => setForm((f) => ({ ...f, dia_chi: e.target.value }))}
              className="input-field w-full"
              placeholder="Nhập địa chỉ"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Điện thoại</label>
              <input
                type="text"
                value={form.dien_thoai}
                onChange={(e) => setForm((f) => ({ ...f, dien_thoai: e.target.value }))}
                className="input-field w-full"
                placeholder="Nhập số điện thoại"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="input-field w-full"
                placeholder="Nhập email"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tài khoản ngân hàng</label>
            <input
              type="text"
              value={form.tai_khoan_ngan_hang}
              onChange={(e) => setForm((f) => ({ ...f, tai_khoan_ngan_hang: e.target.value }))}
              className="input-field w-full"
              placeholder="Nhập tài khoản ngân hàng"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Người đại diện</label>
              <input
                type="text"
                value={form.nguoi_dai_dien}
                onChange={(e) => setForm((f) => ({ ...f, nguoi_dai_dien: e.target.value }))}
                className="input-field w-full"
                placeholder="Nhập tên người đại diện"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Chức vụ</label>
              <input
                type="text"
                value={form.chuc_vu}
                onChange={(e) => setForm((f) => ({ ...f, chuc_vu: e.target.value }))}
                className="input-field w-full"
                placeholder="Nhập chức vụ"
              />
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
