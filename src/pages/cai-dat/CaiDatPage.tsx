import { useState, useEffect, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/auth';
import { useToastStore } from '../../store/toast';
import { formatDate, formatVND } from '../../lib/utils';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Modal from '../../components/ui/Modal';
import { taiKhoanTienApi, hangMucThuChiApi } from '../../lib/api';
import { TaiKhoanTien, HangMucThuChi, PhamViTaiKhoan, PhamViHangMuc, LoaiGiaoDich } from '../../types';
import { Settings, Users, Shield, Key, Trash2, User, FileSpreadsheet, Upload, CheckCircle, X, HardDrive, Link2, LogOut, Wallet, ListTree, Plus, Pencil, ChevronRight, Database, RefreshCw, AlertCircle, ChevronDown } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface UserProfileRow {
  id: string;
  email: string;
  ten?: string;
  role: 'admin' | 'staff';
  created_at: string;
}

interface TemplateMeta {
  name: string;
  url: string;
}

const BUCKET = 'templates';

const MAU_KEYS: { key: string; label: string }[] = [
  { key: 'mau_bao_gia_hapulico', label: 'Mẫu Hapulico' },
  { key: 'mau_bao_gia_phamgia', label: 'Mẫu Phạm Gia' },
  { key: 'mau_bao_gia_litec', label: 'Mẫu Litec' },
];

// ─── Template Upload Card ─────────────────────────────────────────────────────

function TemplateUploadCard({ configKey, label }: { configKey: string; label: string }) {
  const addToast = useToastStore((s) => s.addToast);
  const inputRef = useRef<HTMLInputElement>(null);
  const [meta, setMeta] = useState<TemplateMeta | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [loadingMeta, setLoadingMeta] = useState(true);

  const fetchMeta = useCallback(async () => {
    setLoadingMeta(true);
    try {
      const { data } = await supabase
        .from('cau_hinh')
        .select('value, updated_at')
        .eq('key', configKey)
        .maybeSingle();
      if (data?.value) {
        setMeta(JSON.parse(data.value) as TemplateMeta);
        setUpdatedAt(data.updated_at);
      } else {
        setMeta(null);
        setUpdatedAt(null);
      }
    } catch {
      setMeta(null);
    } finally {
      setLoadingMeta(false);
    }
  }, [configKey]);

  useEffect(() => { fetchMeta(); }, [fetchMeta]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      addToast('warning', 'Vui lòng chọn file Excel (.xlsx hoặc .xls)');
      return;
    }

    setUploading(true);
    try {
      const safeName = file.name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/gi, 'd')
        .replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${configKey}/${Date.now()}_${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { upsert: true });
      if (uploadError) {
        console.error('Storage upload error:', uploadError);
        throw new Error(`Upload file thất bại: ${uploadError.message}`);
      }

      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);

      const value = JSON.stringify({ name: file.name, url: urlData.publicUrl });
      const now = new Date().toISOString();

      const { data: existing } = await supabase
        .from('cau_hinh')
        .select('key')
        .eq('key', configKey)
        .maybeSingle();

      let saveError;
      if (existing) {
        const { error } = await supabase
          .from('cau_hinh')
          .update({ value, updated_at: now })
          .eq('key', configKey);
        saveError = error;
      } else {
        const { error } = await supabase
          .from('cau_hinh')
          .insert({ key: configKey, value, updated_at: now });
        saveError = error;
      }
      if (saveError) {
        console.error('DB save error:', saveError);
        throw new Error(`Lưu DB thất bại: ${saveError.message}`);
      }

      addToast('success', `Đã upload mẫu "${label}" thành công`);
      fetchMeta();
    } catch (err: any) {
      console.error('Loi upload template:', err);
      addToast('error', err.message || 'Không thể upload file');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function handleRemove() {
    try {
      await supabase.from('cau_hinh').delete().eq('key', configKey);
      setMeta(null);
      setUpdatedAt(null);
      addToast('success', `Đã xóa mẫu "${label}"`);
    } catch {
      addToast('error', 'Không thể xóa mẫu');
    }
  }

  return (
    <div className="flex items-center justify-between p-4 rounded-xl border border-gray-200 bg-gray-50 hover:border-blue-200 transition-colors">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
          <FileSpreadsheet className="w-5 h-5 text-green-700" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-800">{label}</p>
          {loadingMeta ? (
            <p className="text-xs text-gray-400">Đang tải...</p>
          ) : meta ? (
            <div className="flex items-center gap-1.5 mt-0.5">
              <CheckCircle className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
              <a
                href={meta.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:underline truncate max-w-[220px]"
                title={meta.name}
              >
                {meta.name}
              </a>
              {updatedAt && (
                <span className="text-xs text-gray-400 flex-shrink-0">· {formatDate(updatedAt)}</span>
              )}
            </div>
          ) : (
            <p className="text-xs text-gray-400 mt-0.5">Chưa có file mẫu — chỉ chấp nhận .xlsx, .xls</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 ml-4 flex-shrink-0">
        {meta && (
          <button
            onClick={handleRemove}
            className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
            title="Xóa mẫu"
          >
            <X className="w-4 h-4" />
          </button>
        )}
        <label className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
          uploading
            ? 'bg-gray-100 text-gray-400 cursor-not-allowed pointer-events-none'
            : 'bg-blue-600 text-white hover:bg-blue-700 cursor-pointer'
        }`}>
          <Upload className="w-3.5 h-3.5" />
          {uploading ? 'Đang tải...' : meta ? 'Cập nhật' : 'Upload'}
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleFileChange}
            disabled={uploading}
          />
        </label>
      </div>
    </div>
  );
}

// ─── Google Drive Card ────────────────────────────────────────────────────────

function GoogleDriveCard() {
  const addToast = useToastStore((s) => s.addToast);
  const [driveEmail, setDriveEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const fetchDriveStatus = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('google_drive_tokens')
        .select('google_email')
        .maybeSingle();
      setDriveEmail(data?.google_email || null);
    } catch {
      setDriveEmail(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDriveStatus();
    // Handle redirect back from OAuth
    const params = new URLSearchParams(window.location.search);
    if (params.get('drive_connected') === '1') {
      addToast('success', 'Đã kết nối Google Drive thành công');
      window.history.replaceState({}, '', window.location.pathname);
      fetchDriveStatus();
    } else if (params.get('drive_error')) {
      addToast('error', 'Kết nối Google Drive thất bại. Vui lòng thử lại.');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [fetchDriveStatus, addToast]);

  async function handleConnect() {
    setConnecting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const appOrigin = window.location.origin;
      const resp = await fetch(
        `${supabaseUrl}/functions/v1/google-drive-auth?redirect=/cai-dat&app_origin=${encodeURIComponent(appOrigin)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await resp.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('Không thể lấy link xác thực');
      }
    } catch (err: any) {
      addToast('error', err.message || 'Không thể kết nối Google Drive');
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      await supabase.from('google_drive_tokens').delete().neq('user_id', '');
      setDriveEmail(null);
      addToast('success', 'Đã ngắt kết nối Google Drive');
    } catch {
      addToast('error', 'Không thể ngắt kết nối');
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <HardDrive className="w-5 h-5 text-blue-600" />
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Google Drive</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Khi kết nối, file Excel xuất ra sẽ tự động lưu vào Google Drive của bạn
            </p>
          </div>
        </div>
      </div>
      <div className="px-6 py-5">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <div className="w-4 h-4 border-2 border-gray-200 border-t-gray-400 rounded-full animate-spin" />
            Đang kiểm tra kết nối...
          </div>
        ) : driveEmail ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">Đã kết nối</p>
                <p className="text-xs text-gray-500 flex items-center gap-1">
                  <Link2 className="w-3 h-3" />
                  {driveEmail}
                </p>
              </div>
            </div>
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 transition-colors disabled:opacity-50"
            >
              <LogOut className="w-3.5 h-3.5" />
              {disconnecting ? 'Đang ngắt...' : 'Ngắt kết nối'}
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                <HardDrive className="w-5 h-5 text-gray-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">Chưa kết nối</p>
                <p className="text-xs text-gray-500">Kết nối để tự động lưu file Excel vào Drive</p>
              </div>
            </div>
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              <HardDrive className="w-4 h-4" />
              {connecting ? 'Đang chuyển hướng...' : 'Kết nối Google Drive'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Constants ───────────────────────────────────────────────────────────────

const LOAI_TK_OPTIONS = [
  { value: 'tien_mat', label: 'Tiền mặt' },
  { value: 'ngan_hang', label: 'Ngân hàng' },
  { value: 'vi_dien_tu', label: 'Ví điện tử' },
  { value: 'the_tin_dung', label: 'Thẻ tín dụng' },
  { value: 'khac', label: 'Khác' },
];

const PHAM_VI_TK_OPTIONS: { value: PhamViTaiKhoan; label: string }[] = [
  { value: 'cong_ty', label: 'Công ty' },
  { value: 'ca_nhan', label: 'Cá nhân' },
  { value: 'dung_chung', label: 'Dùng chung' },
];

const PHAM_VI_HM_OPTIONS: { value: PhamViHangMuc; label: string }[] = [
  { value: 'cong_ty', label: 'Công ty' },
  { value: 'ca_nhan', label: 'Cá nhân' },
  { value: 'oto', label: 'Ô tô' },
  { value: 'vay_no', label: 'Vay nợ' },
  { value: 'khac', label: 'Khác' },
];

const LOAI_GD_HM_OPTIONS: { value: LoaiGiaoDich | 'tat_ca'; label: string }[] = [
  { value: 'tat_ca', label: 'Tất cả' },
  { value: 'thu', label: 'Thu' },
  { value: 'chi', label: 'Chi' },
  { value: 'chuyen_khoan_noi_bo', label: 'CK nội bộ' },
  { value: 'dieu_chinh_so_du', label: 'Điều chỉnh số dư' },
];

function loaiTkLabel(v: string) {
  return LOAI_TK_OPTIONS.find((o) => o.value === v)?.label ?? v;
}
function phamViTkLabel(v: string) {
  return PHAM_VI_TK_OPTIONS.find((o) => o.value === v)?.label ?? v;
}
function loaiGdHmLabel(v: string) {
  return LOAI_GD_HM_OPTIONS.find((o) => o.value === v)?.label ?? v;
}
function phamViHmLabel(v: string) {
  return PHAM_VI_HM_OPTIONS.find((o) => o.value === v)?.label ?? v;
}

// ─── TaiKhoanTien Management ─────────────────────────────────────────────────

function TaiKhoanTienSection() {
  const addToast = useToastStore((s) => s.addToast);
  const [items, setItems] = useState<TaiKhoanTien[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TaiKhoanTien | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TaiKhoanTien | null>(null);
  const [form, setForm] = useState({
    ten_tai_khoan: '', loai_tai_khoan: 'ngan_hang', ngan_hang: '',
    so_tai_khoan: '', chu_tai_khoan: '', pham_vi: 'cong_ty' as PhamViTaiKhoan,
    so_du_dau_ky: 0, ngay_so_du_dau_ky: '', ghi_chu: '', trang_thai: 'hoat_dong',
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await taiKhoanTienApi.list();
      setItems(res.data ?? []);
    } catch { addToast('error', 'Không thể tải tài khoản tiền'); }
    finally { setLoading(false); }
  }, [addToast]);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditing(null);
    setForm({ ten_tai_khoan: '', loai_tai_khoan: 'ngan_hang', ngan_hang: '', so_tai_khoan: '', chu_tai_khoan: '', pham_vi: 'cong_ty', so_du_dau_ky: 0, ngay_so_du_dau_ky: '', ghi_chu: '', trang_thai: 'hoat_dong' });
    setModalOpen(true);
  }

  function openEdit(item: TaiKhoanTien) {
    setEditing(item);
    setForm({
      ten_tai_khoan: item.ten_tai_khoan, loai_tai_khoan: item.loai_tai_khoan,
      ngan_hang: item.ngan_hang ?? '', so_tai_khoan: item.so_tai_khoan ?? '',
      chu_tai_khoan: item.chu_tai_khoan ?? '', pham_vi: item.pham_vi,
      so_du_dau_ky: item.so_du_dau_ky, ngay_so_du_dau_ky: item.ngay_so_du_dau_ky ?? '',
      ghi_chu: item.ghi_chu ?? '', trang_thai: item.trang_thai,
    });
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.ten_tai_khoan.trim()) { addToast('warning', 'Vui lòng nhập tên tài khoản'); return; }
    setSaving(true);
    try {
      if (editing) {
        await taiKhoanTienApi.update(editing.id, form);
        addToast('success', 'Đã cập nhật tài khoản tiền');
      } else {
        await taiKhoanTienApi.create(form);
        addToast('success', 'Đã thêm tài khoản tiền');
      }
      setModalOpen(false);
      load();
    } catch { addToast('error', 'Không thể lưu tài khoản tiền'); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await taiKhoanTienApi.delete(deleteTarget.id);
      addToast('success', 'Đã xóa tài khoản tiền');
      setDeleteTarget(null);
      load();
    } catch { addToast('error', 'Không thể xóa tài khoản tiền'); }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wallet className="w-5 h-5 text-blue-600" />
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Tài khoản tiền</h2>
            <p className="text-xs text-gray-500 mt-0.5">Quản lý tài khoản ngân hàng, tiền mặt, ví điện tử</p>
          </div>
        </div>
        <button onClick={openCreate} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors">
          <Plus className="w-4 h-4" />
          Thêm tài khoản
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10"><LoadingSpinner /></div>
      ) : items.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm">Chưa có tài khoản tiền nào</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-header">Tên tài khoản</th>
                <th className="table-header">Loại</th>
                <th className="table-header">Ngân hàng / Số TK</th>
                <th className="table-header">Phạm vi</th>
                <th className="table-header text-right">Số dư đầu kỳ</th>
                <th className="table-header">Trạng thái</th>
                <th className="table-header text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                  <td className="table-cell font-medium text-gray-900">{item.ten_tai_khoan}</td>
                  <td className="table-cell text-sm text-gray-600">{loaiTkLabel(item.loai_tai_khoan)}</td>
                  <td className="table-cell text-sm text-gray-600">
                    {item.ngan_hang && <span>{item.ngan_hang}</span>}
                    {item.ngan_hang && item.so_tai_khoan && <span className="text-gray-400"> · </span>}
                    {item.so_tai_khoan && <span className="font-mono text-xs">{item.so_tai_khoan}</span>}
                    {!item.ngan_hang && !item.so_tai_khoan && <span className="text-gray-300">—</span>}
                  </td>
                  <td className="table-cell text-sm text-gray-600">{phamViTkLabel(item.pham_vi)}</td>
                  <td className="table-cell text-right text-sm font-medium">{formatVND(item.so_du_dau_ky)}</td>
                  <td className="table-cell">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${item.trang_thai === 'hoat_dong' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {item.trang_thai === 'hoat_dong' ? 'Hoạt động' : 'Không HĐ'}
                    </span>
                  </td>
                  <td className="table-cell text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(item)} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => setDeleteTarget(item)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modalOpen} onOpenChange={setModalOpen} title={editing ? 'Chỉnh sửa tài khoản tiền' : 'Thêm tài khoản tiền'}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tên tài khoản <span className="text-red-500">*</span></label>
            <input className="input-field w-full" value={form.ten_tai_khoan} onChange={(e) => setForm((f) => ({ ...f, ten_tai_khoan: e.target.value }))} placeholder="VD: Vietcombank công ty" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Loại tài khoản</label>
              <select className="input-field w-full" value={form.loai_tai_khoan} onChange={(e) => setForm((f) => ({ ...f, loai_tai_khoan: e.target.value }))}>
                {LOAI_TK_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phạm vi</label>
              <select className="input-field w-full" value={form.pham_vi} onChange={(e) => setForm((f) => ({ ...f, pham_vi: e.target.value as PhamViTaiKhoan }))}>
                {PHAM_VI_TK_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ngân hàng</label>
              <input className="input-field w-full" value={form.ngan_hang} onChange={(e) => setForm((f) => ({ ...f, ngan_hang: e.target.value }))} placeholder="VD: Vietcombank" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Số tài khoản</label>
              <input className="input-field w-full font-mono" value={form.so_tai_khoan} onChange={(e) => setForm((f) => ({ ...f, so_tai_khoan: e.target.value }))} placeholder="0123456789" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Chủ tài khoản</label>
            <input className="input-field w-full" value={form.chu_tai_khoan} onChange={(e) => setForm((f) => ({ ...f, chu_tai_khoan: e.target.value }))} placeholder="Tên chủ tài khoản" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Số dư đầu kỳ</label>
              <input type="number" className="input-field w-full" value={form.so_du_dau_ky} onChange={(e) => setForm((f) => ({ ...f, so_du_dau_ky: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ngày số dư đầu kỳ</label>
              <input type="date" className="input-field w-full" value={form.ngay_so_du_dau_ky} onChange={(e) => setForm((f) => ({ ...f, ngay_so_du_dau_ky: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Trạng thái</label>
              <select className="input-field w-full" value={form.trang_thai} onChange={(e) => setForm((f) => ({ ...f, trang_thai: e.target.value }))}>
                <option value="hoat_dong">Hoạt động</option>
                <option value="khong_hoat_dong">Không hoạt động</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú</label>
              <input className="input-field w-full" value={form.ghi_chu} onChange={(e) => setForm((f) => ({ ...f, ghi_chu: e.target.value }))} placeholder="Tuỳ chọn" />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setModalOpen(false)} className="btn-secondary">Hủy</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary">{saving ? 'Đang lưu...' : 'Lưu'}</button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}
        title="Xóa tài khoản tiền"
        description={`Xóa tài khoản "${deleteTarget?.ten_tai_khoan}"? Lưu ý: các giao dịch liên kết sẽ không bị xóa.`}
        onConfirm={handleDelete}
        confirmText="Xóa"
        cancelText="Hủy"
        variant="danger"
      />
    </div>
  );
}

// ─── HangMucThuChi Management ─────────────────────────────────────────────────

function HangMucThuChiSection() {
  const addToast = useToastStore((s) => s.addToast);
  const [items, setItems] = useState<HangMucThuChi[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<HangMucThuChi | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<HangMucThuChi | null>(null);
  const [form, setForm] = useState({
    ma_hang_muc: '', ten_hang_muc: '', loai_giao_dich: 'tat_ca' as LoaiGiaoDich | 'tat_ca',
    pham_vi: 'cong_ty' as PhamViHangMuc, parent_id: '' as string | number,
    trang_thai: 'hoat_dong', ghi_chu: '',
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await hangMucThuChiApi.list();
      setItems(res.data ?? []);
    } catch { addToast('error', 'Không thể tải hạng mục thu chi'); }
    finally { setLoading(false); }
  }, [addToast]);

  useEffect(() => { load(); }, [load]);

  const rootItems = items.filter((i) => !i.parent_id);

  function getChildren(parentId: number) {
    return items.filter((i) => i.parent_id === parentId);
  }

  function openCreate() {
    setEditing(null);
    setForm({ ma_hang_muc: '', ten_hang_muc: '', loai_giao_dich: 'tat_ca', pham_vi: 'cong_ty', parent_id: '', trang_thai: 'hoat_dong', ghi_chu: '' });
    setModalOpen(true);
  }

  function openEdit(item: HangMucThuChi) {
    setEditing(item);
    setForm({
      ma_hang_muc: item.ma_hang_muc, ten_hang_muc: item.ten_hang_muc,
      loai_giao_dich: item.loai_giao_dich, pham_vi: item.pham_vi,
      parent_id: item.parent_id ?? '', trang_thai: item.trang_thai, ghi_chu: '',
    });
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.ten_hang_muc.trim()) { addToast('warning', 'Vui lòng nhập tên hạng mục'); return; }
    setSaving(true);
    try {
      const payload = { ...form, parent_id: form.parent_id === '' ? null : Number(form.parent_id) };
      if (editing) {
        await hangMucThuChiApi.update(editing.id, payload);
        addToast('success', 'Đã cập nhật hạng mục');
      } else {
        await hangMucThuChiApi.create(payload);
        addToast('success', 'Đã thêm hạng mục');
      }
      setModalOpen(false);
      load();
    } catch { addToast('error', 'Không thể lưu hạng mục'); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await hangMucThuChiApi.delete(deleteTarget.id);
      addToast('success', 'Đã xóa hạng mục');
      setDeleteTarget(null);
      load();
    } catch { addToast('error', 'Không thể xóa hạng mục'); }
  }

  function renderRow(item: HangMucThuChi, depth: number): ReactNode {
    const children = getChildren(item.id);
    return (
      <>
        <tr key={item.id} className="hover:bg-gray-50 transition-colors">
          <td className="table-cell">
            <div className="flex items-center" style={{ paddingLeft: `${depth * 20}px` }}>
              {depth > 0 && <ChevronRight className="w-3.5 h-3.5 text-gray-300 mr-1 flex-shrink-0" />}
              <span className={depth === 0 ? 'font-semibold text-gray-900' : 'text-gray-700'}>{item.ten_hang_muc}</span>
            </div>
          </td>
          <td className="table-cell text-xs font-mono text-gray-500">{item.ma_hang_muc}</td>
          <td className="table-cell text-sm text-gray-600">{loaiGdHmLabel(item.loai_giao_dich)}</td>
          <td className="table-cell text-sm text-gray-600">{phamViHmLabel(item.pham_vi)}</td>
          <td className="table-cell">
            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${item.trang_thai === 'hoat_dong' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
              {item.trang_thai === 'hoat_dong' ? 'Hoạt động' : 'Ẩn'}
            </span>
          </td>
          <td className="table-cell text-right">
            <div className="flex items-center justify-end gap-1">
              <button onClick={() => openEdit(item)} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                <Pencil className="w-4 h-4" />
              </button>
              <button onClick={() => setDeleteTarget(item)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </td>
        </tr>
        {children.map((child) => renderRow(child, depth + 1))}
      </>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ListTree className="w-5 h-5 text-emerald-600" />
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Hạng mục thu chi</h2>
            <p className="text-xs text-gray-500 mt-0.5">Phân loại dòng tiền theo nhóm và hạng mục</p>
          </div>
        </div>
        <button onClick={openCreate} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors">
          <Plus className="w-4 h-4" />
          Thêm hạng mục
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10"><LoadingSpinner /></div>
      ) : items.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm">Chưa có hạng mục nào</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-header">Tên hạng mục</th>
                <th className="table-header">Mã</th>
                <th className="table-header">Loại giao dịch</th>
                <th className="table-header">Phạm vi</th>
                <th className="table-header">Trạng thái</th>
                <th className="table-header text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rootItems.map((item) => renderRow(item, 0))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modalOpen} onOpenChange={setModalOpen} title={editing ? 'Chỉnh sửa hạng mục' : 'Thêm hạng mục thu chi'}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mã hạng mục</label>
              <input className="input-field w-full font-mono" value={form.ma_hang_muc} onChange={(e) => setForm((f) => ({ ...f, ma_hang_muc: e.target.value }))} placeholder="VD: CHI.LUONG" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Hạng mục cha</label>
              <select className="input-field w-full" value={String(form.parent_id)} onChange={(e) => setForm((f) => ({ ...f, parent_id: e.target.value }))}>
                <option value="">— Hạng mục gốc —</option>
                {items.filter((i) => !i.parent_id && (!editing || i.id !== editing.id)).map((i) => (
                  <option key={i.id} value={String(i.id)}>{i.ten_hang_muc}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tên hạng mục <span className="text-red-500">*</span></label>
            <input className="input-field w-full" value={form.ten_hang_muc} onChange={(e) => setForm((f) => ({ ...f, ten_hang_muc: e.target.value }))} placeholder="VD: Chi lương nhân viên" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Loại giao dịch</label>
              <select className="input-field w-full" value={form.loai_giao_dich} onChange={(e) => setForm((f) => ({ ...f, loai_giao_dich: e.target.value as LoaiGiaoDich | 'tat_ca' }))}>
                {LOAI_GD_HM_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phạm vi</label>
              <select className="input-field w-full" value={form.pham_vi} onChange={(e) => setForm((f) => ({ ...f, pham_vi: e.target.value as PhamViHangMuc }))}>
                {PHAM_VI_HM_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Trạng thái</label>
            <select className="input-field w-full" value={form.trang_thai} onChange={(e) => setForm((f) => ({ ...f, trang_thai: e.target.value }))}>
              <option value="hoat_dong">Hoạt động</option>
              <option value="an">Ẩn</option>
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setModalOpen(false)} className="btn-secondary">Hủy</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary">{saving ? 'Đang lưu...' : 'Lưu'}</button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}
        title="Xóa hạng mục"
        description={`Xóa hạng mục "${deleteTarget?.ten_hang_muc}"? Các hạng mục con (nếu có) sẽ không bị xóa.`}
        onConfirm={handleDelete}
        confirmText="Xóa"
        cancelText="Hủy"
        variant="danger"
      />
    </div>
  );
}

// ─── Migration Section ───────────────────────────────────────────────────────

type MigStep = 'idle' | 'running' | 'done' | 'error';

interface StepResult {
  label: string;
  status: 'ok' | 'error' | 'skipped';
  detail?: string;
}

interface MigStepState {
  status: MigStep;
  results: StepResult[];
  expanded: boolean;
}

const MIGRATE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mysql-migrate`;

function MigrationSection() {
  const addToast = useToastStore((s) => s.addToast);
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<{ schema: MigStepState; seed: MigStepState; migrate: MigStepState }>({
    schema:  { status: 'idle', results: [], expanded: false },
    seed:    { status: 'idle', results: [], expanded: false },
    migrate: { status: 'idle', results: [], expanded: false },
  });
  const [migrateOffset, setMigrateOffset] = useState(0);
  const [migrateTotal, setMigrateTotal] = useState<number | null>(null);
  const [migrateDone, setMigrateDone] = useState(false);

  function updateStep(key: keyof typeof steps, patch: Partial<MigStepState>) {
    setSteps((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  async function callMigrate(action: string, extra = '') {
    const res = await fetch(`${MIGRATE_URL}?action=${action}${extra}`, { method: 'GET' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function runAll() {
    setRunning(true);
    setMigrateOffset(0);
    setMigrateTotal(null);
    setMigrateDone(false);
    setSteps({
      schema:  { status: 'idle', results: [], expanded: false },
      seed:    { status: 'idle', results: [], expanded: false },
      migrate: { status: 'idle', results: [], expanded: false },
    });

    // Step 1: schema
    updateStep('schema', { status: 'running' });
    try {
      const data = await callMigrate('schema');
      const results: StepResult[] = (data.results ?? []).map((r: any) => ({
        label: r.sql ?? r.item ?? String(r),
        status: r.status === 'ok' ? 'ok' : 'error',
        detail: r.error,
      }));
      const hasError = results.some((r) => r.status === 'error');
      updateStep('schema', { status: hasError ? 'error' : 'done', results });
      if (hasError) { addToast('warning', 'Tạo schema có lỗi, xem chi tiết bên dưới'); }
    } catch (e: any) {
      updateStep('schema', { status: 'error', results: [{ label: 'Kết nối thất bại', status: 'error', detail: e.message }] });
      addToast('error', 'Không thể tạo schema: ' + e.message);
      setRunning(false);
      return;
    }

    // Step 2: seed
    updateStep('seed', { status: 'running' });
    try {
      const data = await callMigrate('seed');
      const results: StepResult[] = (data.results ?? []).map((r: any) => ({
        label: r.item ?? String(r),
        status: r.status === 'ok' ? 'ok' : r.status === 'skipped (already has data)' || String(r.status).startsWith('skipped') ? 'skipped' : 'error',
        detail: r.error,
      }));
      updateStep('seed', { status: 'done', results });
    } catch (e: any) {
      updateStep('seed', { status: 'error', results: [{ label: 'Seed thất bại', status: 'error', detail: e.message }] });
      addToast('error', 'Không thể seed dữ liệu: ' + e.message);
      setRunning(false);
      return;
    }

    // Step 3: migrate (batch until done)
    updateStep('migrate', { status: 'running' });
    let offset = 0;
    const allResults: StepResult[] = [];
    let totalSuccess = 0;
    let totalErrors = 0;
    try {
      while (true) {
        const data = await callMigrate('migrate', `&offset=${offset}&batch_size=500`);
        if (data.total !== undefined) setMigrateTotal(data.total);
        totalSuccess += data.success ?? 0;
        totalErrors += data.errors ?? 0;
        offset += data.rows_processed ?? 0;
        setMigrateOffset(offset);

        if ((data.errors ?? 0) > 0 && data.error_details) {
          for (const e of data.error_details.slice(0, 5)) {
            allResults.push({ label: `ID ${e.id}: ${e.error}`, status: 'error' });
          }
        }

        if (data.rows_processed === 0 || (data.total !== undefined && offset >= data.total)) break;
      }
      allResults.unshift({ label: `Đã migrate ${totalSuccess} bản ghi, ${totalErrors} lỗi`, status: totalErrors > 0 ? 'error' : 'ok' });
      updateStep('migrate', { status: 'done', results: allResults });
      setMigrateDone(true);
      addToast('success', `Migration hoàn tất! ${totalSuccess} giao dịch đã chuyển.`);
    } catch (e: any) {
      updateStep('migrate', { status: 'error', results: [{ label: 'Migration thất bại', status: 'error', detail: e.message }] });
      addToast('error', 'Migration thất bại: ' + e.message);
    }
    setRunning(false);
  }

  const STEP_LABELS = { schema: 'Tạo bảng mới', seed: 'Seed dữ liệu gốc', migrate: 'Chuyển dòng tiền cũ' };

  function StepCard({ stepKey }: { stepKey: keyof typeof steps }) {
    const step = steps[stepKey];
    const icon = step.status === 'running' ? (
      <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />
    ) : step.status === 'done' ? (
      <CheckCircle className="w-4 h-4 text-emerald-500" />
    ) : step.status === 'error' ? (
      <AlertCircle className="w-4 h-4 text-red-500" />
    ) : (
      <div className="w-4 h-4 rounded-full border-2 border-gray-300" />
    );

    return (
      <div className={`rounded-lg border ${step.status === 'error' ? 'border-red-200 bg-red-50' : step.status === 'done' ? 'border-emerald-200 bg-emerald-50' : step.status === 'running' ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-gray-50'}`}>
        <button
          className="w-full flex items-center gap-3 px-4 py-3 text-left"
          onClick={() => updateStep(stepKey, { expanded: !step.expanded })}
          disabled={step.results.length === 0}
        >
          {icon}
          <span className="flex-1 text-sm font-medium text-gray-800">{STEP_LABELS[stepKey]}</span>
          {stepKey === 'migrate' && step.status === 'running' && migrateTotal !== null && (
            <span className="text-xs text-blue-600 font-mono">{migrateOffset}/{migrateTotal}</span>
          )}
          {step.status === 'done' && (
            <span className="text-xs text-emerald-600 font-medium">
              {step.results.filter((r) => r.status === 'ok').length} OK
              {step.results.filter((r) => r.status === 'error').length > 0 && ` · ${step.results.filter((r) => r.status === 'error').length} lỗi`}
            </span>
          )}
          {step.results.length > 0 && <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${step.expanded ? 'rotate-180' : ''}`} />}
        </button>
        {step.expanded && step.results.length > 0 && (
          <div className="border-t border-gray-200 px-4 py-3 space-y-1 max-h-48 overflow-y-auto">
            {step.results.map((r, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className={`text-xs mt-0.5 font-mono ${r.status === 'ok' ? 'text-emerald-600' : r.status === 'skipped' ? 'text-amber-600' : 'text-red-600'}`}>
                  {r.status === 'ok' ? '✓' : r.status === 'skipped' ? '~' : '✗'}
                </span>
                <div className="text-xs text-gray-600 min-w-0">
                  <span className="truncate block">{r.label}</span>
                  {r.detail && <span className="text-red-500 block">{r.detail}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database className="w-5 h-5 text-orange-500" />
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Migration dữ liệu</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Chuyển dữ liệu từ bảng cũ (tai_khoan, dong_tien) sang bảng mới (tai_khoan_tien, dong_tien_moi)
            </p>
          </div>
        </div>
        <button
          onClick={runAll}
          disabled={running}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
            running ? 'bg-gray-100 text-gray-400 cursor-not-allowed' :
            migrateDone ? 'bg-emerald-600 text-white hover:bg-emerald-700' :
            'bg-orange-500 text-white hover:bg-orange-600'
          }`}
        >
          {running ? <RefreshCw className="w-4 h-4 animate-spin" /> : migrateDone ? <CheckCircle className="w-4 h-4" /> : <Database className="w-4 h-4" />}
          {running ? 'Đang chạy...' : migrateDone ? 'Chạy lại' : 'Chạy Migration'}
        </button>
      </div>

      <div className="px-6 py-5 space-y-3">
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-amber-700">
            Migration sẽ tạo các bảng mới, seed danh mục, rồi chuyển toàn bộ dữ liệu từ bảng cũ sang. Quá trình có thể mất vài phút tùy lượng dữ liệu. Dữ liệu cũ không bị xóa.
          </p>
        </div>
        <StepCard stepKey="schema" />
        <StepCard stepKey="seed" />
        <StepCard stepKey="migrate" />
      </div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function CaiDatPage() {
  const addToast = useToastStore((s) => s.addToast);
  const currentUser = useAuthStore((s) => s.user);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const setUser = useAuthStore((s) => s.setUser);

  const [users, setUsers] = useState<UserProfileRow[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<UserProfileRow | null>(null);
  const [changingRole, setChangingRole] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, email, ten, role, created_at')
        .order('created_at', { ascending: true });
      if (error) throw error;
      setUsers((data as UserProfileRow[]) || []);
    } catch (err) {
      console.error('Loi tai danh sach nguoi dung:', err);
      addToast('error', 'Không thể tải danh sách người dùng');
    } finally {
      setLoadingUsers(false);
    }
  }, [addToast]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  useEffect(() => {
    if (currentUser?.ten) setDisplayName(currentUser.ten);
  }, [currentUser]);

  async function handleChangeRole(user: UserProfileRow) {
    const newRole = user.role === 'admin' ? 'staff' : 'admin';
    setChangingRole(user.id);
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({ role: newRole })
        .eq('id', user.id);
      if (error) throw error;
      addToast('success', `Đã chuyển vai trò của ${user.ten || user.email} thành ${newRole === 'admin' ? 'Quản trị' : 'Nhân viên'}`);
      fetchUsers();
      if (currentUser && user.id === currentUser.id) setUser({ ...currentUser, role: newRole });
    } catch (err) {
      console.error('Loi thay doi vai tro:', err);
      addToast('error', 'Không thể thay đổi vai trò');
    } finally {
      setChangingRole(null);
    }
  }

  function openDeleteDialog(user: UserProfileRow) {
    if (currentUser && user.id === currentUser.id) {
      addToast('warning', 'Bạn không thể xóa chính mình');
      return;
    }
    setDeleteTarget(user);
    setDeleteDialogOpen(true);
  }

  async function handleDeleteUser() {
    if (!deleteTarget) return;
    try {
      const { error } = await supabase.auth.admin.deleteUser(deleteTarget.id);
      if (error) throw error;
      addToast('success', `Đã xóa người dùng ${deleteTarget.ten || deleteTarget.email}`);
      fetchUsers();
    } catch (err) {
      console.error('Loi xoa nguoi dung:', err);
      addToast('error', 'Không thể xóa người dùng');
    }
  }

  async function handleSaveName() {
    if (!displayName.trim()) { addToast('warning', 'Vui lòng nhập tên hiển thị'); return; }
    if (!currentUser) return;
    setSavingName(true);
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({ ten: displayName.trim() })
        .eq('id', currentUser.id);
      if (error) throw error;
      setUser({ ...currentUser, ten: displayName.trim() });
      addToast('success', 'Đã cập nhật tên hiển thị');
      fetchUsers();
    } catch (err) {
      console.error('Loi cap nhat ten:', err);
      addToast('error', 'Không thể cập nhật tên hiển thị');
    } finally {
      setSavingName(false);
    }
  }

  async function handleChangePassword() {
    if (!newPassword) { addToast('warning', 'Vui lòng nhập mật khẩu mới'); return; }
    if (newPassword.length < 6) { addToast('warning', 'Mật khẩu mới phải có ít nhất 6 ký tự'); return; }
    if (newPassword !== confirmPassword) { addToast('warning', 'Mật khẩu xác nhận không khớp'); return; }
    setSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      addToast('success', 'Đã thay đổi mật khẩu thành công');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      console.error('Loi thay doi mat khau:', err);
      addToast('error', err.message || 'Không thể thay đổi mật khẩu');
    } finally {
      setSavingPassword(false);
    }
  }

  function roleLabel(role: string): string {
    return role === 'admin' ? 'Quản trị' : 'Nhân viên';
  }

  function roleBadgeClass(role: string): string {
    return role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700';
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
          <Settings className="w-5 h-5 text-gray-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cài đặt</h1>
          <p className="mt-1 text-sm text-gray-500">Quản lý tài khoản và thiết lập hệ thống</p>
        </div>
      </div>

      {/* ─── Template Upload (Admin only) ──────────────────────────────────── */}
      {isAdmin() && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-green-600" />
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Mẫu báo giá Excel</h2>
                <p className="text-xs text-gray-500 mt-0.5">Upload file Excel mẫu để xuất báo giá theo từng loại</p>
              </div>
            </div>
          </div>
          <div className="px-6 py-5 space-y-3">
            {MAU_KEYS.map((m) => (
              <TemplateUploadCard key={m.key} configKey={m.key} label={m.label} />
            ))}
          </div>
        </div>
      )}

      {/* ─── Google Drive ──────────────────────────────────────────────────── */}
      <GoogleDriveCard />

      {/* ─── Migration (Admin only) ────────────────────────────────────────── */}
      {isAdmin() && <MigrationSection />}

      {/* ─── TaiKhoanTien Management (Admin only) ──────────────────────────── */}
      {isAdmin() && <TaiKhoanTienSection />}

      {/* ─── HangMucThuChi Management (Admin only) ─────────────────────────── */}
      {isAdmin() && <HangMucThuChiSection />}

      {/* ─── User Management (Admin only) ──────────────────────────────────── */}
      {isAdmin() && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-2">
            <Users className="w-5 h-5 text-gray-500" />
            <h2 className="text-lg font-semibold text-gray-900">Quản lý người dùng</h2>
          </div>

          {currentUser && (
            <div className="px-6 py-4 bg-primary-50 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
                  <User className="w-5 h-5 text-primary-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {currentUser.ten || 'Chưa cập nhật tên'}{' '}
                    <span className="text-xs font-normal text-gray-500">(Bạn)</span>
                  </p>
                  <p className="text-xs text-gray-500">{currentUser.email}</p>
                </div>
                <span className={`ml-auto px-2 py-0.5 rounded-full text-xs font-medium ${roleBadgeClass(currentUser.role)}`}>
                  {roleLabel(currentUser.role)}
                </span>
              </div>
            </div>
          )}

          {loadingUsers ? (
            <div className="flex items-center justify-center py-12">
              <LoadingSpinner />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="table-header">Email</th>
                    <th className="table-header">Tên</th>
                    <th className="table-header">Vai trò</th>
                    <th className="table-header">Ngày tạo</th>
                    <th className="table-header text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                      <td className="table-cell">
                        <span className="font-medium text-gray-900">{u.email}</span>
                      </td>
                      <td className="table-cell">
                        {u.ten || <span className="text-gray-400 italic">Chưa cập nhật</span>}
                      </td>
                      <td className="table-cell">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${roleBadgeClass(u.role)}`}>
                          {roleLabel(u.role)}
                        </span>
                      </td>
                      <td className="table-cell whitespace-nowrap">{formatDate(u.created_at)}</td>
                      <td className="table-cell text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleChangeRole(u)}
                            disabled={changingRole === u.id}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-purple-600 bg-purple-50 hover:bg-purple-100 transition-colors disabled:opacity-50"
                          >
                            <Shield className="w-3.5 h-3.5" />
                            {changingRole === u.id ? '...' : u.role === 'admin' ? 'Xuống NV' : 'Lên QT'}
                          </button>
                          <button
                            onClick={() => openDeleteDialog(u)}
                            disabled={currentUser?.id === u.id}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Xóa
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── Account Settings ──────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-2">
          <User className="w-5 h-5 text-gray-500" />
          <h2 className="text-lg font-semibold text-gray-900">Thiết lập tài khoản</h2>
        </div>
        <div className="px-6 py-5 space-y-6">
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <User className="w-4 h-4" />
              Thay đổi tên hiển thị
            </h3>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">Tên hiển thị</label>
                <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                  className="input-field w-full" placeholder="Nhập tên hiển thị" />
              </div>
              <button onClick={handleSaveName} disabled={savingName} className="btn-primary shrink-0">
                {savingName ? 'Đang lưu...' : 'Lưu tên'}
              </button>
            </div>
          </div>

          <div className="border-t border-gray-200" />

          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <Key className="w-4 h-4" />
              Thay đổi mật khẩu
            </h3>
            <div className="space-y-3 max-w-md">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mật khẩu mới</label>
                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                  className="input-field w-full" placeholder="Nhập mật khẩu mới (ít nhất 6 ký tự)"
                  autoComplete="new-password" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Xác nhận mật khẩu mới</label>
                <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                  className="input-field w-full" placeholder="Nhập lại mật khẩu mới"
                  autoComplete="new-password" />
              </div>
              <button onClick={handleChangePassword} disabled={savingPassword} className="btn-primary">
                {savingPassword ? 'Đang thay đổi...' : 'Thay đổi mật khẩu'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ─── System Info ───────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-2">
          <Settings className="w-5 h-5 text-gray-500" />
          <h2 className="text-lg font-semibold text-gray-900">Thông tin hệ thống</h2>
        </div>
        <div className="px-6 py-5">
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2 border-b border-gray-100">
              <span className="text-sm text-gray-500">Tên ứng dụng</span>
              <span className="text-sm font-medium text-gray-900">Quản lý kinh doanh Phạm Gia</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-gray-100">
              <span className="text-sm text-gray-500">Phiên bản</span>
              <span className="text-sm font-medium text-gray-900">1.0.0</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-gray-500">Cơ sở dữ liệu</span>
              <span className="text-sm font-medium text-gray-900">Supabase PostgreSQL</span>
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Xác nhận xóa người dùng"
        description={`Bạn có chắc chắn muốn xóa người dùng "${deleteTarget?.ten || deleteTarget?.email}"? Hành động này không thể hoàn tác.`}
        onConfirm={handleDeleteUser}
        confirmText="Xóa"
        cancelText="Hủy"
        variant="danger"
      />
    </div>
  );
}
