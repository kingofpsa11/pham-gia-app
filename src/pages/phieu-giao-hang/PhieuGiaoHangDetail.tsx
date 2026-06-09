import { useState, useEffect } from 'react';
import { phieuGiaoHangApi, dongTienApi, tepDinhKemApi, khachHangApi, hopDongApi } from '../../lib/api';
import { useToastStore } from '../../store/toast';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  formatVND,
  formatDate,
  formatNumber,
  toInputDateValue,
} from '../../lib/utils';
import Modal from '../../components/ui/Modal';
import NumInput from '../../components/ui/NumInput';
import {
  ArrowLeft,
  Pencil,
  Paperclip,
  Truck,
  CreditCard,
  Plus,
  X,
} from 'lucide-react';
import type {
  PhieuGiaoHang,
  PhieuGiaoHangChiTiet,
  KhachHang,
  HopDong,
  DongTien,
  TepDinhKem,
  HopDongChiTiet,
} from '../../types';

interface PhieuGiaoHangFull extends PhieuGiaoHang {
  khach_hang?: KhachHang;
  hop_dong?: HopDong;
  chi_tiet?: PhieuGiaoHangChiTiet[];
}

interface LineItem {
  key: string;
  id?: number;
  hop_dong_chi_tiet_id?: number;
  ten_san_pham: string;
  don_vi: string;
  so_luong_hop_dong?: number;
  da_giao_khac?: number;
  so_luong_giao: number;
  ghi_chu: string;
}

interface EditFormValues {
  ngay_giao: string;
  khach_hang_id: string;
  hop_dong_id: string;
  noi_dung: string;
  line_items: LineItem[];
}

function makeEmptyLineItem(): LineItem {
  return {
    key: crypto.randomUUID(),
    ten_san_pham: '',
    don_vi: '',
    so_luong_giao: 0,
    ghi_chu: '',
  };
}

export default function PhieuGiaoHangDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const addToast = useToastStore((s) => s.addToast);

  const [phieuGiao, setPhieuGiao] = useState<PhieuGiaoHangFull | null>(null);
  const [chiTiet, setChiTiet] = useState<PhieuGiaoHangChiTiet[]>([]);
  const [dongTienList, setDongTienList] = useState<DongTien[]>([]);
  const [fileList, setFileList] = useState<TepDinhKem[]>([]);
  const [loading, setLoading] = useState(true);

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState<EditFormValues>({
    ngay_giao: '',
    khach_hang_id: '',
    hop_dong_id: '',
    noi_dung: '',
    line_items: [],
  });
  const [saving, setSaving] = useState(false);
  const [loadingHD, setLoadingHD] = useState(false);

  const [khachHangList, setKhachHangList] = useState<KhachHang[]>([]);
  const [hopDongList, setHopDongList] = useState<HopDong[]>([]);
  const [filteredHopDongList, setFilteredHopDongList] = useState<HopDong[]>([]);

  useEffect(() => {
    if (id) fetchPhieuGiao();
    khachHangApi.list({ limit: 1000 }).then((res) => setKhachHangList(res.data as KhachHang[]));
    hopDongApi.list({ limit: 1000 }).then((res) => setHopDongList(res.data as HopDong[]));
  }, [id]);

  useEffect(() => {
    if (editForm.khach_hang_id) {
      setFilteredHopDongList(hopDongList.filter((hd) => String(hd.khach_hang_id) === editForm.khach_hang_id));
    } else {
      setFilteredHopDongList([]);
    }
  }, [editForm.khach_hang_id, hopDongList]);

  async function fetchPhieuGiao() {
    setLoading(true);
    try {
      const pghId = Number(id);
      const [pghRes, fileRes] = await Promise.all([
        phieuGiaoHangApi.get(pghId),
        tepDinhKemApi.list('phieu_giao_hang', pghId),
      ]);

      const pghData = pghRes.data;
      if (!pghData) {
        addToast('error', 'Không tìm thấy phiếu giao hàng');
        navigate('/phieu-giao-hang');
        return;
      }

      setPhieuGiao(pghData as PhieuGiaoHangFull);
      setChiTiet((pghData as any).chi_tiet || []);

      if (pghData.khach_hang_id) {
        const dtRes = await dongTienApi.byEntity({ khach_hang_id: String(pghData.khach_hang_id) });
        setDongTienList((dtRes.data as DongTien[]) || []);
      } else {
        setDongTienList([]);
      }

      setFileList((fileRes.data as TepDinhKem[]) || []);
    } catch {
      addToast('error', 'Không thể tải thông tin phiếu giao hàng');
    } finally {
      setLoading(false);
    }
  }

  async function openEditModal() {
    if (!phieuGiao) return;

    // Base line items from current chi_tiet
    const baseItems: LineItem[] = chiTiet.length > 0
      ? chiTiet.map((ct) => ({
          key: crypto.randomUUID(),
          id: ct.id,
          hop_dong_chi_tiet_id: (ct as any).hop_dong_chi_tiet_id || undefined,
          ten_san_pham: ct.ten_san_pham,
          don_vi: ct.don_vi,
          so_luong_giao: ct.so_luong_giao,
          ghi_chu: ct.ghi_chu || '',
        }))
      : [makeEmptyLineItem()];

    setEditForm({
      ngay_giao: toInputDateValue(phieuGiao.ngay_giao),
      khach_hang_id: String(phieuGiao.khach_hang_id),
      hop_dong_id: phieuGiao.hop_dong_id ? String(phieuGiao.hop_dong_id) : '',
      noi_dung: phieuGiao.noi_dung || '',
      line_items: baseItems,
    });
    setEditModalOpen(true);

    // If linked to hop dong, enrich with HD data
    if (phieuGiao.hop_dong_id) {
      setLoadingHD(true);
      try {
        const [hdRes, pghRes] = await Promise.all([
          hopDongApi.get(phieuGiao.hop_dong_id),
          phieuGiaoHangApi.byHopDong(phieuGiao.hop_dong_id),
        ]);
        const chiTietHD: HopDongChiTiet[] = (hdRes.data as any)?.chi_tiet || [];
        const allPhieu: any[] = pghRes.data || [];

        // Sum delivered in OTHER phieu (exclude current)
        const daGiaoKhacMap: Record<number, number> = {};
        for (const p of allPhieu) {
          if (p.id === phieuGiao.id) continue;
          for (const ct of (p.chi_tiet || [])) {
            const ref = ct.hop_dong_chi_tiet_id;
            if (ref) daGiaoKhacMap[ref] = (daGiaoKhacMap[ref] || 0) + (ct.so_luong_giao || 0);
          }
        }

        // Merge HD info into line items
        setEditForm((prev) => ({
          ...prev,
          line_items: prev.line_items.map((item) => {
            if (!item.hop_dong_chi_tiet_id) return item;
            const hdCt = chiTietHD.find((c) => c.id === item.hop_dong_chi_tiet_id);
            if (!hdCt) return item;
            return {
              ...item,
              so_luong_hop_dong: hdCt.so_luong,
              da_giao_khac: daGiaoKhacMap[item.hop_dong_chi_tiet_id] || 0,
            };
          }),
        }));
      } finally {
        setLoadingHD(false);
      }
    }
  }


  function updateLineItem(index: number, field: keyof LineItem, value: string | number) {
    setEditForm((prev) => {
      const items = [...prev.line_items];
      items[index] = { ...items[index], [field]: value };
      return { ...prev, line_items: items };
    });
  }

  function addLineItem() {
    setEditForm((prev) => ({ ...prev, line_items: [...prev.line_items, makeEmptyLineItem()] }));
  }

  function removeLineItem(index: number) {
    setEditForm((prev) => ({ ...prev, line_items: prev.line_items.filter((_, i) => i !== index) }));
  }

  async function handleEditSave() {
    if (!phieuGiao) return;
    if (!editForm.khach_hang_id) { addToast('warning', 'Vui lòng chọn khách hàng'); return; }
    if (!editForm.ngay_giao) { addToast('warning', 'Vui lòng chọn ngày giao'); return; }

    const validItems = editForm.line_items.filter((item) => item.ten_san_pham.trim() !== '');
    if (validItems.length === 0) { addToast('warning', 'Vui lòng thêm ít nhất một sản phẩm'); return; }

    setSaving(true);
    try {
      await phieuGiaoHangApi.update(phieuGiao.id, {
        ngay_giao: editForm.ngay_giao,
        khach_hang_id: Number(editForm.khach_hang_id),
        hop_dong_id: editForm.hop_dong_id ? Number(editForm.hop_dong_id) : null,
        gia_tri_ghi_no: 0,
        noi_dung: editForm.noi_dung.trim() || null,
        chi_tiet: validItems.map((item) => ({
          hop_dong_chi_tiet_id: item.hop_dong_chi_tiet_id || null,
          ten_san_pham: item.ten_san_pham.trim(),
          don_vi: item.don_vi.trim(),
          so_luong_giao: item.so_luong_giao || 0,
          don_gia: 0,
          thanh_tien: 0,
          ghi_chu: item.ghi_chu?.trim() || '',
        })),
      });
      addToast('success', 'Cập nhật phiếu giao hàng thành công');
      setEditModalOpen(false);
      fetchPhieuGiao();
    } catch {
      addToast('error', 'Không thể cập nhật phiếu giao hàng');
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
          <p className="text-sm text-gray-500">Đang tải thông tin phiếu giao hàng...</p>
        </div>
      </div>
    );
  }

  if (!phieuGiao) return null;


  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/phieu-giao-hang')}
          className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors" title="Quay lại">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 truncate">{phieuGiao.so_phieu}</h1>
          <p className="mt-0.5 text-sm text-gray-500 truncate">{phieuGiao.khach_hang?.ten_cong_ty || ''}</p>
        </div>
        <button onClick={openEditModal} className="btn-primary flex items-center gap-2">
          <Pencil className="w-4 h-4" /> Chỉnh sửa
        </button>
      </div>

      {/* Thong tin phieu */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Truck className="w-5 h-5 text-primary-600" /> Thông tin phiếu giao hàng
          </h2>
        </div>
        <div className="card-body">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <div><p className="text-xs font-medium text-gray-500">Số phiếu</p><p className="text-sm font-semibold text-gray-900">{phieuGiao.so_phieu}</p></div>
            <div><p className="text-xs font-medium text-gray-500">Ngày giao</p><p className="text-sm font-semibold text-gray-900">{formatDate(phieuGiao.ngay_giao)}</p></div>
            <div><p className="text-xs font-medium text-gray-500">Khách hàng</p><p className="text-sm font-semibold text-gray-900">{phieuGiao.khach_hang?.ten_cong_ty || '--'}</p></div>
            <div>
              <p className="text-xs font-medium text-gray-500">Hợp đồng</p>
              {phieuGiao.hop_dong ? (
                <Link to={`/hop-dong/${phieuGiao.hop_dong_id}`}
                  className="text-sm font-semibold text-primary-600 hover:text-primary-700">
                  {phieuGiao.hop_dong.so_hop_dong}{phieuGiao.hop_dong.ten_du_an ? ` - ${phieuGiao.hop_dong.ten_du_an}` : ''}
                </Link>
              ) : <p className="text-sm font-semibold text-gray-900">--</p>}
            </div>
            <div><p className="text-xs font-medium text-gray-500">Giá trị ghi nợ</p><p className="text-sm font-semibold text-gray-900">{formatVND(phieuGiao.gia_tri_ghi_no)}</p></div>
            <div><p className="text-xs font-medium text-gray-500">Nội dung</p><p className="text-sm font-semibold text-gray-900">{phieuGiao.noi_dung || '--'}</p></div>
            <div><p className="text-xs font-medium text-gray-500">Người tạo</p><p className="text-sm font-semibold text-gray-900">{phieuGiao.nguoi_tao || '--'}</p></div>
            <div><p className="text-xs font-medium text-gray-500">Tạo lúc</p><p className="text-sm font-semibold text-gray-900">{formatDate(phieuGiao.tao_luc) || '--'}</p></div>
          </div>
        </div>
      </div>

      {/* Chi tiet san pham */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-lg font-semibold text-gray-900">Chi tiết sản phẩm giao hàng</h2>
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
                    <th className="table-header text-right">Số lượng giao</th>
                    <th className="table-header">Ghi chú</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {chiTiet.map((ct) => (
                    <tr key={ct.id} className="hover:bg-gray-50 transition-colors">
                      <td className="table-cell font-medium text-gray-900">{ct.ten_san_pham}</td>
                      <td className="table-cell text-gray-500">{ct.don_vi}</td>
                      <td className="table-cell text-right">{formatNumber(ct.so_luong_giao)}</td>
                      <td className="table-cell text-gray-500">{ct.ghi_chu || '—'}</td>
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
            <CreditCard className="w-5 h-5 text-primary-600" /> Dòng tiền liên quan
          </h2>
        </div>
        <div className="card-body p-0">
          {dongTienList.length === 0 ? (
            <p className="px-6 py-4 text-sm text-gray-500">Chưa có dòng tiền nào liên quan</p>
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

      {/* File dinh kem */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Paperclip className="w-5 h-5 text-primary-600" /> File đính kèm
          </h2>
        </div>
        <div className="card-body p-0">
          {fileList.length === 0 ? (
            <p className="px-6 py-4 text-sm text-gray-500">Chưa có file đính kèm nào</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {fileList.map((file) => (
                <div key={file.id} className="flex items-center justify-between px-6 py-3 hover:bg-gray-50 transition-colors">
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
                        className="text-xs text-primary-600 hover:text-primary-700 font-medium">Mở</a>
                    )}
                    <span className="text-xs text-gray-400 whitespace-nowrap">{formatDate(file.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      <Modal
        open={editModalOpen}
        onOpenChange={setEditModalOpen}
        title="Chỉnh sửa phiếu giao hàng"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setEditModalOpen(false)} disabled={saving}>Hủy</button>
            <button className="btn-primary" onClick={handleEditSave} disabled={saving}>
              {saving ? 'Đang lưu...' : 'Lưu'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ngày giao <span className="text-red-500">*</span></label>
              <input type="date" value={editForm.ngay_giao}
                onChange={(e) => setEditForm((f) => ({ ...f, ngay_giao: e.target.value }))}
                className="input-field w-full" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Khách hàng</label>
              <select value={editForm.khach_hang_id}
                onChange={(e) => setEditForm((f) => ({ ...f, khach_hang_id: e.target.value, hop_dong_id: '' }))}
                className="select-field w-full">
                <option value="">-- Chọn khách hàng --</option>
                {khachHangList.map((kh) => <option key={kh.id} value={kh.id}>{kh.ten_cong_ty}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Hợp đồng</label>
              <select value={editForm.hop_dong_id}
                onChange={(e) => setEditForm((f) => ({ ...f, hop_dong_id: e.target.value }))}
                className="select-field w-full" disabled={!editForm.khach_hang_id}>
                <option value="">-- Chọn hợp đồng --</option>
                {filteredHopDongList.map((hd) => (
                  <option key={hd.id} value={hd.id}>{hd.so_hop_dong}{hd.ten_du_an ? ` - ${hd.ten_du_an}` : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nội dung</label>
              <input type="text" value={editForm.noi_dung}
                onChange={(e) => setEditForm((f) => ({ ...f, noi_dung: e.target.value }))}
                className="input-field w-full" placeholder="Mô tả nội dung..." />
            </div>
          </div>

          {/* Line items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">Chi tiết sản phẩm</label>
              <button type="button" onClick={addLineItem}
                className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Thêm dòng
              </button>
            </div>

            {loadingHD && (
              <p className="text-xs text-gray-400 animate-pulse mb-2">Đang tải thông tin hợp đồng...</p>
            )}

            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Tên sản phẩm</th>
                    <th className="px-2 py-2 text-center text-xs font-semibold text-gray-500 w-16">ĐV</th>
                    <th className="px-2 py-2 text-right text-xs font-semibold text-orange-500 w-20">Đã giao khác</th>
                    <th className="px-2 py-2 text-right text-xs font-semibold text-green-600 w-20">Còn lại</th>
                    <th className="px-2 py-2 text-right text-xs font-semibold text-blue-600 w-24">SL giao</th>
                    <th className="px-2 py-2 text-left text-xs font-semibold text-gray-500">Ghi chú</th>
                    <th className="px-2 py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {editForm.line_items.map((item, index) => {
                    const hasHD = item.so_luong_hop_dong != null;
                    const conLai = hasHD ? Math.max(0, (item.so_luong_hop_dong || 0) - (item.da_giao_khac || 0)) : null;
                    return (
                      <tr key={item.key} className="hover:bg-gray-50 group">
                        <td className="px-3 py-1.5">
                          {hasHD ? (
                            <span className="text-sm text-gray-900">{item.ten_san_pham}</span>
                          ) : (
                            <input type="text" value={item.ten_san_pham}
                              onChange={(e) => updateLineItem(index, 'ten_san_pham', e.target.value)}
                              className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:border-blue-400 focus:outline-none"
                              placeholder="Tên sản phẩm" />
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          {hasHD ? (
                            <span className="text-sm text-gray-500">{item.don_vi}</span>
                          ) : (
                            <input type="text" value={item.don_vi}
                              onChange={(e) => updateLineItem(index, 'don_vi', e.target.value)}
                              className="w-full px-1 py-1 text-sm text-center border border-gray-200 rounded focus:border-blue-400 focus:outline-none"
                              placeholder="ĐV" />
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-right text-sm">
                          {hasHD ? (
                            <span className={item.da_giao_khac ? 'text-orange-500 font-medium' : 'text-gray-300'}>
                              {formatNumber(item.da_giao_khac || 0, 2)}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-2 py-1.5 text-right text-sm">
                          {conLai != null ? (
                            <span className={`font-semibold ${conLai === 0 ? 'text-gray-400' : 'text-green-600'}`}>
                              {formatNumber(conLai, 2)}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-2 py-1.5">
                          <NumInput value={item.so_luong_giao}
                            onChange={(v) => updateLineItem(index, 'so_luong_giao', v)}
                            className="w-full px-2 py-1 text-sm text-right border border-blue-300 bg-blue-50 text-blue-800 rounded focus:outline-none focus:border-blue-500"
                            min={0} />
                        </td>
                        <td className="px-2 py-1.5">
                          <input type="text" value={item.ghi_chu}
                            onChange={(e) => updateLineItem(index, 'ghi_chu', e.target.value)}
                            className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:border-blue-400 focus:outline-none"
                            placeholder="Ghi chú..." />
                        </td>
                        <td className="px-2 py-1.5">
                          {editForm.line_items.length > 1 && (
                            <button type="button" onClick={() => removeLineItem(index)}
                              className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </Modal>
    </div>
  );
}
