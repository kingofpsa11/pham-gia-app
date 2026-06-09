import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuthStore } from '../../store/auth';
import { useToastStore } from '../../store/toast';
import { formatDate, formatVND } from '../../lib/utils';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Modal from '../../components/ui/Modal';
import { taiKhoanTienApi, hangMucThuChiApi, cauHinhApi, usersApi } from '../../lib/api';
import { TaiKhoanTien, HangMucThuChi, PhamViTaiKhoan, PhamViHangMuc, LoaiGiaoDich } from '../../types';
import { Settings, Users, Shield, Key, Trash2, User, FileSpreadsheet, Upload, CheckCircle, X, HardDrive, Link2, LogOut, Wallet, ListTree, Plus, Pencil, ChevronRight } from 'lucide-react';

function authHeaders(json = false): Record<string, string> {
  const token = localStorage.getItem('token');
  const h: Record<string, string> = {};
  if (token) h.Authorization = `Bearer ${token}`;
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

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
      const res = await cauHinhApi.get(configKey);
      if (res.data?.value) {
        setMeta(JSON.parse(res.data.value) as TemplateMeta);
        setUpdatedAt(res.data.updated_at);
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
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`/api/cau-hinh/${configKey}/upload`, {
        method: 'POST',
        headers: authHeaders(),
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || data.message || 'Upload thất bại');

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
      await cauHinhApi.delete(configKey);
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

const DRIVE_ERROR_LABELS: Record<string, string> = {
  access_denied: 'Bạn đã từ chối quyền truy cập Google Drive',
  invalid_state: 'Phiên kết nối không hợp lệ hoặc đã hết hạn',
  not_configured: 'Server chưa cấu hình Google OAuth (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)',
  server_error: 'Lỗi server khi lưu token Google Drive',
};

function GoogleDriveCard() {
  const addToast = useToastStore((s) => s.addToast);
  const [driveEmail, setDriveEmail] = useState<string | null>(null);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const authHeaders = useCallback(() => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const fetchDriveStatus = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetch('/api/google-drive/status', { headers: authHeaders() });
      if (!resp.ok) throw new Error('Không thể kiểm tra trạng thái');
      const data = await resp.json();
      setConfigured(data.configured !== false);
      setDriveEmail(data.connected ? (data.google_email || 'Đã kết nối') : null);
    } catch {
      setDriveEmail(null);
      setConfigured(true);
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    fetchDriveStatus();
    const params = new URLSearchParams(window.location.search);
    if (params.get('drive_connected') === '1') {
      addToast('success', 'Đã kết nối Google Drive thành công');
      window.history.replaceState({}, '', window.location.pathname);
      fetchDriveStatus();
    } else if (params.get('drive_error')) {
      const code = params.get('drive_error') || '';
      const detail = params.get('detail') || '';
      const label = DRIVE_ERROR_LABELS[code] || 'Kết nối Google Drive thất bại';
      addToast('error', detail ? `${label}: ${detail}` : label);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [fetchDriveStatus, addToast]);

  async function handleConnect() {
    setConnecting(true);
    try {
      const appOrigin = window.location.origin;
      const resp = await fetch(
        `/api/google-drive/auth-url?redirect=/cai-dat&app_origin=${encodeURIComponent(appOrigin)}`,
        { headers: authHeaders() },
      );
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(data.message || data.error || 'Không thể lấy link xác thực');
      }
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
      const resp = await fetch('/api/google-drive/disconnect', {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (!resp.ok) throw new Error('Ngắt kết nối thất bại');
      setDriveEmail(null);
      addToast('success', 'Đã ngắt kết nối Google Drive');
    } catch (err: any) {
      addToast('error', err.message || 'Không thể ngắt kết nối');
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
      <div className="px-6 py-5 space-y-4">
        {!configured && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-semibold">Chưa cấu hình Google OAuth trên server</p>
            <p className="mt-1 text-xs text-amber-800">
              Tạo OAuth Client trên Google Cloud Console, thêm redirect URI{' '}
              <code className="bg-amber-100 px-1 rounded">http://localhost:3000/api/google-drive/callback</code>,{' '}
              rồi điền <code className="bg-amber-100 px-1 rounded">GOOGLE_CLIENT_ID</code> và{' '}
              <code className="bg-amber-100 px-1 rounded">GOOGLE_CLIENT_SECRET</code> vào file <code className="bg-amber-100 px-1 rounded">.env</code>.
            </p>
          </div>
        )}
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
              disabled={connecting || !configured}
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

const CAP_DO_LABEL: Record<number, string> = {
  1: 'Cấp 1 — Nhóm lớn',
  2: 'Cấp 2 — Nhóm nhỏ',
  3: 'Cấp 3 — Chi tiết (nhập GD)',
};

const LOAI_PREFIX: Record<string, string> = {
  thu: 'THU',
  chi: 'CHI',
  chuyen_khoan_noi_bo: 'CK',
  dieu_chinh_so_du: 'DC',
  tat_ca: 'HM',
};

function removeVietnameseAccents(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd');
}

function slugFromTenHangMuc(ten: string): string {
  const plain = removeVietnameseAccents(ten)
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .trim();
  if (!plain) return 'HM';
  const words = plain.split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].toUpperCase().slice(0, 10);
  return words.map((w) => w[0] || '').join('').toUpperCase().slice(0, 10);
}

function getHangMucCapDo(items: HangMucThuChi[], item: HangMucThuChi): number {
  let depth = 1;
  let cur: HangMucThuChi | undefined = item;
  while (cur?.parent_id) {
    const parent = items.find((i) => i.id === cur!.parent_id);
    if (!parent) break;
    depth += 1;
    cur = parent;
  }
  return depth;
}

function isHangMucDescendant(items: HangMucThuChi[], ancestorId: number, maybeDescendantId: number): boolean {
  let cur = items.find((i) => i.id === maybeDescendantId);
  while (cur?.parent_id) {
    if (cur.parent_id === ancestorId) return true;
    cur = items.find((i) => i.id === cur!.parent_id);
  }
  return false;
}

function previewMaHangMuc(
  items: HangMucThuChi[],
  ten: string,
  parentId: string | number,
  loaiGiaoDich: LoaiGiaoDich | 'tat_ca',
): string {
  const parent = parentId !== '' && parentId != null
    ? items.find((i) => i.id === Number(parentId))
    : null;
  const slug = slugFromTenHangMuc(ten);
  if (!slug || slug === 'HM') return '';
  const base = parent
    ? `${parent.ma_hang_muc}.${slug}`
    : `${LOAI_PREFIX[loaiGiaoDich] || 'HM'}.${slug}`;
  const existing = new Set(items.map((i) => i.ma_hang_muc));
  if (!existing.has(base)) return base;
  let seq = 2;
  while (existing.has(`${base}${seq}`)) seq += 1;
  return `${base}${seq}`;
}

interface ParentOption {
  id: number;
  label: string;
  depth: number;
  ma_hang_muc: string;
  loai_giao_dich: HangMucThuChi['loai_giao_dich'];
  pham_vi: PhamViHangMuc;
}

function sortHangMucSiblings(list: HangMucThuChi[]): HangMucThuChi[] {
  return [...list].sort(
    (a, b) => (a.thu_tu ?? 0) - (b.thu_tu ?? 0) || a.ten_hang_muc.localeCompare(b.ten_hang_muc, 'vi'),
  );
}

/** Dropdown cha: duyệt cây cha → con (cấp 1 rồi cấp 2 ngay bên dưới). */
function buildParentOptions(items: HangMucThuChi[], editingId?: number): ParentOption[] {
  const eligibleIds = new Set(
    items
      .filter((i) => i.id !== editingId)
      .filter((i) => !editingId || !isHangMucDescendant(items, editingId, i.id))
      .filter((i) => getHangMucCapDo(items, i) < 3)
      .map((i) => i.id),
  );

  const childrenByParent = new Map<number | 'root', HangMucThuChi[]>();
  const bucket = (key: number | 'root') => {
    if (!childrenByParent.has(key)) childrenByParent.set(key, []);
    return childrenByParent.get(key)!;
  };

  for (const hm of items) {
    if (!eligibleIds.has(hm.id)) continue;
    const parentKey = hm.parent_id && eligibleIds.has(hm.parent_id) ? hm.parent_id : 'root';
    bucket(parentKey).push(hm);
  }

  for (const list of childrenByParent.values()) {
    sortHangMucSiblings(list);
  }

  const result: ParentOption[] = [];
  const walk = (parentKey: number | 'root', depth: number) => {
    for (const hm of childrenByParent.get(parentKey) || []) {
      result.push({
        id: hm.id,
        label: hm.ten_hang_muc,
        depth,
        ma_hang_muc: hm.ma_hang_muc,
        loai_giao_dich: hm.loai_giao_dich,
        pham_vi: hm.pham_vi,
      });
      walk(hm.id, depth + 1);
    }
  };
  walk('root', 1);
  return result;
}

function renderParentSelectOptions(options: ParentOption[]) {
  return options.map((o) => (
    <option key={o.id} value={String(o.id)}>
      {'\u00A0'.repeat((o.depth - 1) * 3)}
      {o.depth === 1 ? '▸ ' : '   › '}
      {o.label}
      {o.ma_hang_muc ? ` (${o.ma_hang_muc})` : ''}
    </option>
  ));
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
  const parentOptions = useMemo(
    () => buildParentOptions(items, editing?.id),
    [items, editing?.id],
  );

  const newCapDo = useMemo(() => {
    if (form.parent_id === '' || form.parent_id == null) return 1;
    const parent = items.find((i) => i.id === Number(form.parent_id));
    return parent ? getHangMucCapDo(items, parent) + 1 : 1;
  }, [form.parent_id, items]);

  const previewMa = useMemo(() => {
    if (editing) return editing.ma_hang_muc;
    return previewMaHangMuc(items, form.ten_hang_muc, form.parent_id, form.loai_giao_dich);
  }, [editing, items, form.ten_hang_muc, form.parent_id, form.loai_giao_dich]);

  function getChildren(parentId: number) {
    return items.filter((i) => i.parent_id === parentId);
  }

  function applyParentDefaults(parentId: string | number) {
    if (parentId === '' || parentId == null) return;
    const parent = items.find((i) => i.id === Number(parentId));
    if (!parent) return;
    setForm((f) => ({
      ...f,
      parent_id: parentId,
      loai_giao_dich: parent.loai_giao_dich,
      pham_vi: parent.pham_vi,
    }));
  }

  function openCreate(parentId?: number) {
    setEditing(null);
    const parent = parentId ? items.find((i) => i.id === parentId) : null;
    setForm({
      ma_hang_muc: '',
      ten_hang_muc: '',
      loai_giao_dich: parent?.loai_giao_dich ?? 'chi',
      pham_vi: parent?.pham_vi ?? 'cong_ty',
      parent_id: parentId ?? '',
      trang_thai: 'hoat_dong',
      ghi_chu: '',
    });
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
    if (newCapDo > 3) {
      addToast('warning', 'Chỉ hỗ trợ tối đa 3 cấp hạng mục');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        parent_id: form.parent_id === '' ? null : Number(form.parent_id),
        cap_do: newCapDo,
        ...(!editing ? { ma_hang_muc: previewMa || undefined } : {}),
      };
      if (editing) {
        await hangMucThuChiApi.update(editing.id, payload);
        addToast('success', 'Đã cập nhật hạng mục');
      } else {
        await hangMucThuChiApi.create(payload);
        addToast('success', 'Đã thêm hạng mục');
      }
      setModalOpen(false);
      load();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể lưu hạng mục';
      addToast('error', msg);
    } finally { setSaving(false); }
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

  function renderRow(item: HangMucThuChi, depth: number) {
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
          <td className="table-cell text-sm text-gray-600">
            <span className="inline-flex px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-xs" title={CAP_DO_LABEL[getHangMucCapDo(items, item)]}>
              Cấp {getHangMucCapDo(items, item)}
            </span>
          </td>
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
            <p className="text-xs text-gray-500 mt-0.5">
              Cấu trúc 3 cấp: nhóm lớn → nhóm nhỏ → chi tiết (gắn vào giao dịch)
            </p>
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
                <th className="table-header">Cấp</th>
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
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-600">
            <strong>Quy trình:</strong> Chọn hạng mục cha (nếu có) → đặt tên → hệ thống sinh mã.
            Cấp 1–2 là <em>nhóm</em>; cấp 3 là <em>chi tiết</em> dùng khi nhập sao kê.
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Hạng mục cha</label>
            <select
              className="input-field w-full"
              value={String(form.parent_id)}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '') {
                  setForm((f) => ({ ...f, parent_id: '' }));
                } else {
                  applyParentDefaults(v);
                }
              }}
            >
              <option value="">— Cấp 1: Hạng mục gốc (nhóm lớn) —</option>
              {renderParentSelectOptions(parentOptions)}
            </select>
            <p className="mt-1 text-xs text-gray-500">
              Chỉ hiện hạng mục cấp 1 và 2 — có thể chọn nhóm nhỏ làm cha cho chi tiết cấp 3.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tên hạng mục <span className="text-red-500">*</span></label>
            <input
              className="input-field w-full"
              value={form.ten_hang_muc}
              onChange={(e) => setForm((f) => ({ ...f, ten_hang_muc: e.target.value }))}
              placeholder={newCapDo === 3 ? 'VD: Lương nhân viên' : newCapDo === 2 ? 'VD: Chi phí vận hành công ty' : 'VD: Chi phí công ty'}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cấp độ</label>
              <div className="input-field w-full bg-gray-50 text-gray-700 text-sm">
                {CAP_DO_LABEL[newCapDo] ?? `Cấp ${newCapDo}`}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mã hạng mục</label>
              <div className="input-field w-full bg-gray-50 font-mono text-sm text-gray-700">
                {editing ? form.ma_hang_muc : (previewMa || '— Tự sinh khi lưu —')}
              </div>
              {!editing && (
                <p className="mt-1 text-xs text-gray-500">Mã tự động từ tên + mã cha (VD: CHI.CT.VH.LUNG)</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Loại giao dịch</label>
              <select
                className="input-field w-full"
                value={form.loai_giao_dich}
                onChange={(e) => setForm((f) => ({ ...f, loai_giao_dich: e.target.value as LoaiGiaoDich | 'tat_ca' }))}
                disabled={form.parent_id !== ''}
              >
                {LOAI_GD_HM_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {form.parent_id !== '' && (
                <p className="mt-1 text-xs text-violet-600">Kế thừa từ hạng mục cha</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phạm vi</label>
              <select className="input-field w-full" value={form.pham_vi} onChange={(e) => setForm((f) => ({ ...f, pham_vi: e.target.value as PhamViHangMuc }))}>
                {PHAM_VI_HM_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <p className="mt-1 text-xs text-gray-500">Nên trùng phạm vi với nhánh cha (công ty / cá nhân / ô tô…)</p>
            </div>
          </div>

          {newCapDo < 3 && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              Đây là hạng mục nhóm — khi nhập dòng tiền hãy chọn hạng mục <strong>cấp 3</strong> (lá) bên dưới nhóm này.
            </p>
          )}
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

// ─── Settings tabs ───────────────────────────────────────────────────────────

type CaiDatTab =
  | 'mau-bao-gia'
  | 'google-drive'
  | 'tai-khoan-tien'
  | 'hang-muc'
  | 'nguoi-dung'
  | 'tai-khoan'
  | 'he-thong';

const CAI_DAT_TABS: { id: CaiDatTab; label: string; icon: typeof Settings; adminOnly?: boolean }[] = [
  { id: 'mau-bao-gia', label: 'Mẫu báo giá', icon: FileSpreadsheet, adminOnly: true },
  { id: 'google-drive', label: 'Google Drive', icon: HardDrive },
  { id: 'tai-khoan-tien', label: 'Tài khoản tiền', icon: Wallet, adminOnly: true },
  { id: 'hang-muc', label: 'Hạng mục thu chi', icon: ListTree, adminOnly: true },
  { id: 'nguoi-dung', label: 'Người dùng', icon: Users, adminOnly: true },
  { id: 'tai-khoan', label: 'Tài khoản', icon: User },
  { id: 'he-thong', label: 'Hệ thống', icon: Settings },
];

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
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const visibleTabs = CAI_DAT_TABS.filter((t) => !t.adminOnly || isAdmin());
  const [activeTab, setActiveTab] = useState<CaiDatTab>('google-drive');

  useEffect(() => {
    if (!visibleTabs.some((t) => t.id === activeTab)) {
      setActiveTab(visibleTabs[0]?.id ?? 'google-drive');
    }
  }, [activeTab, visibleTabs]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('drive_connected') === '1' || params.get('drive_error')) {
      setActiveTab('google-drive');
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const res = await usersApi.list();
      setUsers((res.data as UserProfileRow[]) || []);
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
      await usersApi.update(user.id, { role: newRole });
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
      await usersApi.delete(deleteTarget.id);
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
      await usersApi.update(currentUser.id, { ten: displayName.trim() });
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
    if (!currentPassword) { addToast('warning', 'Vui lòng nhập mật khẩu hiện tại'); return; }
    if (!newPassword) { addToast('warning', 'Vui lòng nhập mật khẩu mới'); return; }
    if (newPassword.length < 6) { addToast('warning', 'Mật khẩu mới phải có ít nhất 6 ký tự'); return; }
    if (newPassword !== confirmPassword) { addToast('warning', 'Mật khẩu xác nhận không khớp'); return; }
    setSavingPassword(true);
    try {
      await usersApi.changePassword({ currentPassword, newPassword });
      addToast('success', 'Đã thay đổi mật khẩu thành công');
      setCurrentPassword('');
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

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="border-b border-gray-200">
          <nav className="flex gap-0 overflow-x-auto px-2" aria-label="Cài đặt">
            {visibleTabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                    activeTab === tab.id
                      ? 'border-primary-600 text-primary-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 'mau-bao-gia' && isAdmin() && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Mẫu báo giá Excel</h2>
                <p className="text-xs text-gray-500 mt-0.5">Upload file Excel mẫu để xuất báo giá theo từng loại</p>
              </div>
              <div className="space-y-3">
                {MAU_KEYS.map((m) => (
                  <TemplateUploadCard key={m.key} configKey={m.key} label={m.label} />
                ))}
              </div>
            </div>
          )}

          {activeTab === 'google-drive' && <GoogleDriveCard />}

          {activeTab === 'tai-khoan-tien' && isAdmin() && <TaiKhoanTienSection />}

          {activeTab === 'hang-muc' && isAdmin() && <HangMucThuChiSection />}

          {activeTab === 'nguoi-dung' && isAdmin() && (
        <div>
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

          {activeTab === 'tai-khoan' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Thiết lập tài khoản</h2>
            <p className="text-xs text-gray-500 mt-0.5">Cập nhật tên hiển thị và mật khẩu đăng nhập</p>
          </div>
          <div className="space-y-6">
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Mật khẩu hiện tại</label>
                <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)}
                  className="input-field w-full" placeholder="Nhập mật khẩu hiện tại"
                  autoComplete="current-password" />
              </div>
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
          )}

          {activeTab === 'he-thong' && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Thông tin hệ thống</h2>
            <p className="text-xs text-gray-500 mt-0.5">Phiên bản và thông tin ứng dụng</p>
          </div>
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
              <span className="text-sm font-medium text-gray-900">MySQL / MariaDB</span>
            </div>
          </div>
        </div>
          )}
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
