import { useState, useEffect, useRef, useCallback } from 'react';
import { hopDongApi, khachHangApi, baoGiaApi } from '../../lib/api';
import { useToastStore } from '../../store/toast';
import {
  formatVND,
  generateSoHopDong,
  calcGiaBanGoiY,
  calcThanhTienBan,
  calcVAT,
  calcTongTruocVAT,
  calcTongVAT,
  calcTongThanhToan,
} from '../../lib/utils';
import { Save, Plus, Trash2, ClipboardList, Search, X } from 'lucide-react';
import NumInput from '../../components/ui/NumInput';
import type { KhachHang, HopDong, HopDongChiTiet, BaoGia } from '../../types';

// ---- Date helpers (dd/mm/yyyy) ----
function todayVN(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function isoToVN(iso: string | null | undefined): string {
  if (!iso) return todayVN();
  const s = iso.includes('T') ? iso.split('T')[0] : iso;
  const [y, m, dd] = s.split('-');
  if (!y || !m || !dd) return todayVN();
  return `${dd}/${m}/${y}`;
}

function vnToISO(vn: string): string {
  const parts = vn.split('/');
  if (parts.length === 3) {
    const [dd, mm, yyyy] = parts;
    if (dd && mm && yyyy && yyyy.length === 4) return `${yyyy}-${mm}-${dd}`;
  }
  return vn;
}

function isValidVNDate(s: string): boolean {
  return /^\d{2}\/\d{2}\/\d{4}$/.test(s);
}

interface ChiTietRow extends HopDongChiTiet {
  tempId: string;
  isNew: boolean;
  deleted?: boolean;
}

interface HopDongFormProps {
  mode: 'create' | 'edit';
  hopDongId?: number;
  initialData?: HopDong & { chi_tiet?: HopDongChiTiet[] };
  fromBaoGia?: {
    bao_gia_id: number;
    so_bao_gia: string;
    khach_hang_id: number;
    ten_cong_ty: string;
    ten_du_an: string;
    che_do_van_chuyen: number;
    phi_van_chuyen: number;
    chi_tiet: any[];
  };
  onSaved: (savedId: number) => void;
  onCancel: () => void;
}

const toChiTietRow = (ct: HopDongChiTiet): ChiTietRow => ({
  ...ct,
  tempId: ct.id ? `existing-${ct.id}` : crypto.randomUUID(),
  isNew: !ct.id,
});

const emptyChiTiet = (): ChiTietRow => ({
  tempId: crypto.randomUUID(),
  isNew: true,
  ten_san_pham: '',
  don_vi: '',
  so_luong: 1,
  don_gia_von: 0,
  lai_suat_phan_tram: 5,
  gia_ban_thuc_te: 0,
  thue_suat: 10,
  chenh_lech_phan_tram: 0,
  gia_hop_dong: 0,
});

const inputCls = 'w-full px-2 py-1 text-sm border border-transparent rounded focus:border-blue-400 focus:ring-1 focus:ring-blue-400 focus:outline-none bg-transparent hover:bg-white hover:border-gray-300 transition-all';

export default function HopDongForm({ mode, hopDongId, initialData, fromBaoGia, onSaved, onCancel }: HopDongFormProps) {
  const addToast = useToastStore((s) => s.addToast);

  const [khachHangId, setKhachHangId] = useState('');
  const [khachHangName, setKhachHangName] = useState('');
  const [soHopDong, setSoHopDong] = useState('');
  const [ngayHopDong, setNgayHopDong] = useState(todayVN());
  const [tenDuAn, setTenDuAn] = useState('');
  const [cheDoVanChuyen, setCheDoVanChuyen] = useState<number>(0);
  const [phiVanChuyen, setPhiVanChuyen] = useState(0);
  const [moTaNoiDung, setMoTaNoiDung] = useState('');
  const [tenFolder, setTenFolder] = useState('');

  // KH search dropdown
  const [khSearch, setKhSearch] = useState('');
  const [khResults, setKhResults] = useState<KhachHang[]>([]);
  const [khDropOpen, setKhDropOpen] = useState(false);
  const [khSearching, setKhSearching] = useState(false);
  const khDropRef = useRef<HTMLDivElement>(null);

  const [chiTiet, setChiTiet] = useState<ChiTietRow[]>([emptyChiTiet()]);
  const [saving, setSaving] = useState(false);

  // Inherit from bao gia modal
  const [showInheritModal, setShowInheritModal] = useState(false);
  const [inheritKhachHangFilter, setInheritKhachHangFilter] = useState('');
  const [inheritKhachHangList, setInheritKhachHangList] = useState<KhachHang[]>([]);
  const [inheritBaoGiaList, setInheritBaoGiaList] = useState<(BaoGia & { ten_cong_ty?: string })[]>([]);
  const [inheritLoading, setInheritLoading] = useState(false);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (khDropRef.current && !khDropRef.current.contains(e.target as Node)) {
        setKhDropOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Debounced KH search
  const searchKhRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchKhachHang = useCallback((q: string) => {
    if (searchKhRef.current) clearTimeout(searchKhRef.current);
    if (!q.trim()) { setKhResults([]); return; }
    searchKhRef.current = setTimeout(async () => {
      setKhSearching(true);
      try {
        const res = await khachHangApi.list({ search: q.trim(), limit: 20 });
        setKhResults((res.data as KhachHang[]) || []);
      } finally {
        setKhSearching(false);
      }
    }, 250);
  }, []);

  useEffect(() => {
    if (mode === 'create' && fromBaoGia) {
      setSoHopDong(generateSoHopDong());
      setKhachHangId(String(fromBaoGia.khach_hang_id));
      setKhachHangName(fromBaoGia.ten_cong_ty);
      setKhSearch(fromBaoGia.ten_cong_ty);
      setTenDuAn(fromBaoGia.ten_du_an);
      setCheDoVanChuyen(fromBaoGia.che_do_van_chuyen);
      setPhiVanChuyen(fromBaoGia.phi_van_chuyen);
      const cheDoVC = Number(fromBaoGia.che_do_van_chuyen);
      const phiVC = Number(fromBaoGia.phi_van_chuyen) || 0;
      const ctList = fromBaoGia.chi_tiet;
      const tongChuaVC = ctList.reduce((s: number, ct: any) => s + (Number(ct.so_luong) || 1) * (Number(ct.gia_ban_chua_van_chuyen) || Number(ct.gia_ban_co_ban) || Number(ct.gia_ban_thuc_te) || 0), 0);
      const rows: ChiTietRow[] = ctList.map((ct: any) => {
        const giaChuaVC = Number(ct.gia_ban_chua_van_chuyen) || Number(ct.gia_ban_co_ban) || Number(ct.gia_ban_thuc_te) || 0;
        const soLuong = Number(ct.so_luong) || 1;
        const chiPhiVC = Number(ct.chi_phi_van_chuyen_phan_bo) > 0
          ? Number(ct.chi_phi_van_chuyen_phan_bo)
          : (cheDoVC === 1 && phiVC > 0 && tongChuaVC > 0 && soLuong > 0
            ? Math.round((phiVC * (soLuong * giaChuaVC) / tongChuaVC) / soLuong / 1000) * 1000
            : 0);
        const giaHopDong = giaChuaVC + chiPhiVC;
        return {
          tempId: crypto.randomUUID(),
          isNew: true,
          ten_san_pham: ct.ten_san_pham || '',
          don_vi: ct.don_vi || '',
          so_luong: soLuong,
          don_gia_von: Number(ct.don_gia_von) || 0,
          lai_suat_phan_tram: Number(ct.lai_suat_phan_tram) || 5,
          gia_ban_thuc_te: giaChuaVC,
          thue_suat: Number(ct.thue_suat) || 10,
          chenh_lech_phan_tram: giaChuaVC > 0 ? Math.round(((giaHopDong - giaChuaVC) / giaChuaVC) * 100 * 100) / 100 : 0,
          gia_hop_dong: giaHopDong,
        };
      });
      setChiTiet(rows.length > 0 ? rows : [emptyChiTiet()]);
    } else if (mode === 'create') {
      setSoHopDong(generateSoHopDong());
    } else if (initialData) {
      populateFromData(initialData);
    }
  }, [mode, initialData, fromBaoGia]);

  // Load khach hang list for inherit modal filter
  useEffect(() => {
    if (showInheritModal && inheritKhachHangList.length === 0) {
      khachHangApi.list({ limit: 1000 }).then((res) => {
        setInheritKhachHangList((res.data as KhachHang[]) || []);
      });
    }
  }, [showInheritModal]);

  // Load bao gia when filter changes
  useEffect(() => {
    if (!showInheritModal) return;
    setInheritLoading(true);
    baoGiaApi.list({
      khach_hang_id: inheritKhachHangFilter || undefined,
      limit: 50,
    }).then((res) => {
      setInheritBaoGiaList((res.data as any[]) || []);
    }).catch(() => {
      addToast('error', 'Không thể tải danh sách báo giá');
    }).finally(() => {
      setInheritLoading(false);
    });
  }, [showInheritModal, inheritKhachHangFilter]);

  function recalcDerivedFields(ct: HopDongChiTiet): ChiTietRow {
    const row = toChiTietRow(ct);
    const gv = Number(row.don_gia_von) || 0;
    const giaBan = Number(row.gia_ban_thuc_te) || 0;
    const giaHD = Number(row.gia_hop_dong) || 0;
    if (gv > 0 && giaBan > 0) {
      row.lai_suat_phan_tram = Math.round(((giaBan - gv) / gv) * 100 * 100) / 100;
    }
    if (giaBan > 0 && giaHD > 0) {
      row.chenh_lech_phan_tram = Math.round(((giaHD - giaBan) / giaBan) * 100 * 100) / 100;
    }
    return row;
  }

  function populateFromData(hd: HopDong & { chi_tiet?: HopDongChiTiet[] }) {
    setKhachHangId(String(hd.khach_hang_id));
    setKhachHangName((hd as any).ten_cong_ty || (hd as any).khach_hang?.ten_cong_ty || '');
    setKhSearch((hd as any).ten_cong_ty || (hd as any).khach_hang?.ten_cong_ty || '');
    setSoHopDong(hd.so_hop_dong || '');
    setNgayHopDong(isoToVN(hd.ngay_hop_dong as string));
    setTenDuAn(hd.ten_du_an || '');
    setCheDoVanChuyen(hd.che_do_van_chuyen ?? 0);
    setPhiVanChuyen(hd.phi_van_chuyen ?? 0);
    setMoTaNoiDung(hd.mo_ta_noi_dung || '');
    setTenFolder((hd as any).ten_folder_du_an || '');
    const rows = ((hd.chi_tiet as HopDongChiTiet[]) || []).map(recalcDerivedFields);
    setChiTiet(rows.length > 0 ? rows : [emptyChiTiet()]);
  }

  async function inheritFromBaoGia(bg: BaoGia & { ten_cong_ty?: string }) {
    try {
      const res = await baoGiaApi.get(bg.id);
      const bgFull = res.data as any;
      const bgChiTiet = bgFull.chi_tiet || [];
      const cheDoVC = Number(bgFull.che_do_van_chuyen) || 0;
      const phiVC = Number(bgFull.phi_van_chuyen) || 0;
      const tongChuaVC = bgChiTiet.reduce((s: number, ct: any) => s + (Number(ct.so_luong) || 1) * (Number(ct.gia_ban_chua_van_chuyen) || Number(ct.gia_ban_co_ban) || Number(ct.gia_ban_thuc_te) || 0), 0);

      const rows: ChiTietRow[] = bgChiTiet.map((ct: any) => {
        const giaChuaVC = Number(ct.gia_ban_chua_van_chuyen) || Number(ct.gia_ban_co_ban) || Number(ct.gia_ban_thuc_te) || 0;
        const soLuong = Number(ct.so_luong) || 1;
        const chiPhiVC = Number(ct.chi_phi_van_chuyen_phan_bo) > 0
          ? Number(ct.chi_phi_van_chuyen_phan_bo)
          : (cheDoVC === 1 && phiVC > 0 && tongChuaVC > 0 && soLuong > 0
            ? Math.round((phiVC * (soLuong * giaChuaVC) / tongChuaVC) / soLuong / 1000) * 1000
            : 0);
        const giaHopDong = giaChuaVC + chiPhiVC;
        return {
          tempId: crypto.randomUUID(),
          isNew: true,
          ten_san_pham: ct.ten_san_pham || '',
          don_vi: ct.don_vi || '',
          so_luong: soLuong,
          don_gia_von: Number(ct.don_gia_von) || 0,
          lai_suat_phan_tram: Number(ct.lai_suat_phan_tram) || 5,
          gia_ban_thuc_te: giaChuaVC,
          thue_suat: Number(ct.thue_suat) || 10,
          chenh_lech_phan_tram: giaChuaVC > 0 ? Math.round(((giaHopDong - giaChuaVC) / giaChuaVC) * 100 * 100) / 100 : 0,
          gia_hop_dong: giaHopDong,
        };
      });

      if (rows.length > 0) {
        setChiTiet(rows);
        // Pre-fill customer from bao gia
        if (!khachHangId && bgFull.khach_hang_id) {
          setKhachHangId(String(bgFull.khach_hang_id));
          const khName = bgFull.ten_cong_ty || bg.ten_cong_ty || '';
          setKhachHangName(khName);
          setKhSearch(khName);
        }
        if (!tenDuAn && bgFull.ten_du_an) setTenDuAn(bgFull.ten_du_an);
        setCheDoVanChuyen(bgFull.che_do_van_chuyen ?? 0);
        setPhiVanChuyen(bgFull.phi_van_chuyen ?? 0);
        addToast('success', `Đã kế thừa ${rows.length} sản phẩm từ báo giá ${bg.so_bao_gia}`);
      } else {
        addToast('warning', 'Báo giá này không có sản phẩm');
      }
    } catch {
      addToast('error', 'Không thể tải báo giá');
    }
    setShowInheritModal(false);
  }

  function insertRowAfter(afterTempId: string | null) {
    const newRow = emptyChiTiet();
    setChiTiet((prev) => {
      if (afterTempId === null) return [newRow, ...prev];
      const idx = prev.findIndex((r) => r.tempId === afterTempId);
      const next = [...prev];
      next.splice(idx + 1, 0, newRow);
      return next;
    });
  }

  function removeChiTietRow(tempId: string) {
    setChiTiet((prev) => {
      const row = prev.find((r) => r.tempId === tempId);
      if (row && !row.isNew) {
        return prev.map((r) => r.tempId === tempId ? { ...r, deleted: true } : r);
      }
      if (prev.filter((r) => !r.deleted).length <= 1) return prev;
      return prev.filter((r) => r.tempId !== tempId);
    });
  }

  function updateChiTiet(tempId: string, field: keyof ChiTietRow, value: string | number) {
    setChiTiet((prev) =>
      prev.map((row) => {
        if (row.tempId !== tempId) return row;
        const updated = { ...row, [field]: value };

        // Khi thay đổi giá vốn hoặc lãi% → tính xuôi giá bán và giá HĐ
        if (field === 'don_gia_von' || field === 'lai_suat_phan_tram') {
          const giaBan = Math.round(
            calcGiaBanGoiY(Number(updated.don_gia_von), Number(updated.lai_suat_phan_tram)) / 1000
          ) * 1000;
          updated.gia_ban_thuc_te = giaBan;
          updated.gia_hop_dong = Math.round(
            calcGiaBanGoiY(giaBan, Number(updated.chenh_lech_phan_tram)) / 1000
          ) * 1000;
        }

        // Khi nhập giá bán thực tế → tính ngược lãi% và cập nhật giá HĐ
        if (field === 'gia_ban_thuc_te') {
          const gv = Number(updated.don_gia_von);
          if (gv > 0) {
            updated.lai_suat_phan_tram = Math.round(
              ((Number(updated.gia_ban_thuc_te) - gv) / gv) * 100 * 100
            ) / 100;
          }
          updated.gia_hop_dong = Math.round(
            calcGiaBanGoiY(Number(updated.gia_ban_thuc_te), Number(updated.chenh_lech_phan_tram)) / 1000
          ) * 1000;
        }

        // Khi thay đổi chênh lệch% → tính xuôi giá HĐ
        if (field === 'chenh_lech_phan_tram') {
          updated.gia_hop_dong = Math.round(
            calcGiaBanGoiY(Number(updated.gia_ban_thuc_te), Number(updated.chenh_lech_phan_tram)) / 1000
          ) * 1000;
        }

        // Khi nhập giá hợp đồng → tính ngược chênh lệch%
        if (field === 'gia_hop_dong') {
          const giaBan = Number(updated.gia_ban_thuc_te);
          if (giaBan > 0) {
            updated.chenh_lech_phan_tram = Math.round(
              ((Number(updated.gia_hop_dong) - giaBan) / giaBan) * 100 * 100
            ) / 100;
          }
        }

        return updated;
      })
    );
  }

  const activeChiTiet = chiTiet.filter((r) => !r.deleted);

  const calcItems = activeChiTiet.map((r) => ({
    so_luong: r.so_luong,
    gia_ban_thuc_te: r.gia_hop_dong || r.gia_ban_thuc_te || 0,
    thue_suat: r.thue_suat,
  }));

  const tongTruocVAT = calcTongTruocVAT(calcItems);
  const tongVAT = calcTongVAT(calcItems);
  // mode=0 (Riêng): phí VC cộng vào tổng TT; mode=1/2: VC tính vào giá vốn
  const phiVCRieng = cheDoVanChuyen === 0 ? phiVanChuyen : 0;
  const tongThanhToan = calcTongThanhToan(tongTruocVAT, tongVAT, phiVCRieng);

  const tongGiaVonThuan = activeChiTiet.reduce((s, r) => s + Number(r.so_luong) * Number(r.don_gia_von), 0);
  // mode=1 (Phân bổ vào giá bán): VC do công ty chịu → cộng vào giá vốn
  // mode=2 (Hỗ trợ): VC do công ty chịu → cộng vào giá vốn
  // mode=0 (Riêng): VC tính riêng vào hóa đơn → không ảnh hưởng giá vốn
  const tongGiaVon = cheDoVanChuyen === 0
    ? tongGiaVonThuan
    : tongGiaVonThuan + phiVanChuyen;

  const loiNhuanGop = tongTruocVAT - tongGiaVon;
  const tyLeLoiNhuan = tongTruocVAT > 0 ? Math.round((loiNhuanGop / tongTruocVAT) * 100) : 0;

  const vat8 = activeChiTiet
    .filter((r) => r.thue_suat === 8)
    .reduce((s, r) => s + calcVAT(calcThanhTienBan(r.so_luong, r.gia_hop_dong || r.gia_ban_thuc_te || 0), 8), 0);
  const vat10 = activeChiTiet
    .filter((r) => r.thue_suat === 10)
    .reduce((s, r) => s + calcVAT(calcThanhTienBan(r.so_luong, r.gia_hop_dong || r.gia_ban_thuc_te || 0), 10), 0);

  async function handleSave() {
    if (!khachHangId) { addToast('warning', 'Vui lòng chọn khách hàng'); return; }
    if (!soHopDong.trim()) { addToast('warning', 'Vui lòng nhập số hợp đồng'); return; }
    if (!isValidVNDate(ngayHopDong)) { addToast('warning', 'Ngày hợp đồng không hợp lệ (dd/mm/yyyy)'); return; }
    const validChiTiet = activeChiTiet.filter((r) => (r.ten_san_pham || '').trim());
    if (validChiTiet.length === 0) { addToast('warning', 'Vui lòng thêm ít nhất một sản phẩm'); return; }

    setSaving(true);
    try {
    const payload = {
        so_hop_dong: soHopDong.trim(),
        ngay_hop_dong: vnToISO(ngayHopDong),
        khach_hang_id: Number(khachHangId),
        ten_du_an: tenDuAn.trim() || null,
        file_hop_dong_id: mode === 'edit' ? initialData?.file_hop_dong_id || '' : '',
        trang_thai: mode === 'create' ? 'Hieu luc' : initialData?.trang_thai || 'Hieu luc',
        che_do_van_chuyen: cheDoVanChuyen,
        phi_van_chuyen: phiVanChuyen,
        mo_ta_noi_dung: moTaNoiDung.trim() || null,
        chi_tiet: validChiTiet.map((r) => ({
          ten_san_pham: (r.ten_san_pham || '').trim(),
          don_vi: (r.don_vi || '').trim(),
          so_luong: r.so_luong,
          don_gia_von: r.don_gia_von,
          lai_suat_phan_tram: r.lai_suat_phan_tram ?? 0,
          gia_ban_thuc_te: r.gia_ban_thuc_te,
          thue_suat: r.thue_suat,
          chenh_lech_phan_tram: r.chenh_lech_phan_tram || 0,
          gia_hop_dong: r.gia_hop_dong || r.gia_ban_thuc_te,
        })),
      };

      if (mode === 'create') {
        const result = await hopDongApi.create(payload);
        addToast('success', 'Tạo hợp đồng thành công');
        onSaved(result.data.id);
      } else {
        await hopDongApi.update(hopDongId!, payload);
        addToast('success', 'Cập nhật hợp đồng thành công');
        onSaved(hopDongId!);
      }
    } catch (err) {
      console.error('Loi luu hop dong:', err);
      addToast('error', mode === 'create' ? 'Không thể tạo hợp đồng' : 'Không thể cập nhật hợp đồng');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      {/* Top info row */}
      <div className="p-4 border-b border-gray-100">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Số Hợp đồng <span className="text-red-500">*</span></label>
            <input type="text" value={soHopDong} onChange={(e) => setSoHopDong(e.target.value)}
              className="input-field text-sm" placeholder="Số HĐ..." />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Ngày ký</label>
            <input
              type="text"
              value={ngayHopDong}
              onChange={(e) => setNgayHopDong(e.target.value)}
              className="input-field text-sm"
              placeholder="dd/mm/yyyy"
              maxLength={10}
            />
          </div>

          <div className="lg:col-span-2 relative" ref={khDropRef}>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Khách hàng <span className="text-red-500">*</span></label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={khSearch}
                onChange={(e) => {
                  const v = e.target.value;
                  setKhSearch(v);
                  if (khachHangId && v !== khachHangName) {
                    setKhachHangId('');
                    setKhachHangName('');
                  }
                  setKhDropOpen(true);
                  searchKhachHang(v);
                }}
                onFocus={() => {
                  setKhDropOpen(true);
                  if (!khachHangId) searchKhachHang(khSearch);
                }}
                className="input-field text-sm pl-7 pr-7 w-full"
                placeholder="Tìm khách hàng..."
              />
              {khSearch && (
                <button
                  type="button"
                  onClick={() => { setKhSearch(''); setKhachHangId(''); setKhachHangName(''); setKhResults([]); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {khDropOpen && (khSearching || khResults.length > 0) && (
              <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                {khSearching ? (
                  <div className="px-3 py-2 text-xs text-gray-400">Đang tìm...</div>
                ) : (
                  khResults.map((kh) => (
                    <button
                      key={kh.id}
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors"
                      onClick={() => {
                        setKhachHangId(String(kh.id));
                        setKhachHangName(kh.ten_cong_ty);
                        setKhSearch(kh.ten_cong_ty);
                        setKhDropOpen(false);
                      }}
                    >
                      <span className="font-medium text-gray-900">{kh.ten_cong_ty}</span>
                    </button>
                  ))
                )}
              </div>
            )}
            {khachHangId && (
              <div className="mt-1 text-xs text-green-600 font-medium">
                ✓ {khachHangName}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Tên Dự Án</label>
            <input type="text" value={tenDuAn} onChange={(e) => setTenDuAn(e.target.value)}
              className="input-field text-sm" placeholder="Tên dự án..." />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Mô tả nội dung</label>
            <input type="text" value={moTaNoiDung} onChange={(e) => setMoTaNoiDung(e.target.value)}
              className="input-field text-sm" placeholder="Mô tả ngắn..." />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 items-end mt-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Thư mục Drive (Lưu File HĐ)</label>
            <div className="flex gap-1">
              <input type="text" value={tenFolder} onChange={(e) => setTenFolder(e.target.value)}
                className="input-field text-sm flex-1" placeholder="Tên folder..." />
              <button className="px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors whitespace-nowrap">
                TẠO
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Chế độ Vận chuyển</label>
            <select value={cheDoVanChuyen} onChange={(e) => setCheDoVanChuyen(Number(e.target.value))} className="select-field text-sm">
              <option value={0}>Riêng</option>
              <option value={1}>Phân bổ vào giá bán</option>
              <option value={2}>Hỗ trợ</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-red-600 mb-1">Tiền VC (Giá vốn)</label>
            <NumInput
              value={phiVanChuyen}
              onChange={setPhiVanChuyen}
              className="input-field text-sm text-right"
              min={0}
              isInteger
              format="money"
            />
          </div>
        </div>
      </div>

      {/* Chi tiet table */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold text-gray-600 uppercase tracking-widest">Chi tiết sản phẩm hợp đồng</span>
          <button
            onClick={() => setShowInheritModal(true)}
            className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors shadow-sm"
          >
            <ClipboardList className="w-3.5 h-3.5" />
            KẾ THỪA BÁO GIÁ
          </button>
        </div>

        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-2 py-2.5 text-center text-xs font-bold text-gray-600 w-10">STT</th>
                <th className="px-2 py-2.5 text-left text-xs font-bold text-gray-600">TÊN SẢN PHẨM</th>
                <th className="px-2 py-2.5 text-center text-xs font-bold text-gray-600 w-16">ĐV</th>
                <th className="px-2 py-2.5 text-center text-xs font-bold text-gray-600 w-16">SL</th>
                <th className="px-2 py-2.5 text-right text-xs font-bold text-gray-600 w-28">GIÁ VỐN</th>
                <th className="px-2 py-2.5 text-right text-xs font-bold text-green-700 w-16">LÃI(%)</th>
                <th className="px-2 py-2.5 text-right text-xs font-bold text-gray-600 w-28">GIÁ BÁN</th>
                <th className="px-2 py-2.5 text-right text-xs font-bold text-gray-600 w-16">CL(%)</th>
                <th className="px-2 py-2.5 text-right text-xs font-bold text-blue-700 w-28">GIÁ HĐ (1K)</th>
                <th className="px-2 py-2.5 text-right text-xs font-bold text-gray-600 w-28">THÀNH TIỀN</th>
                <th className="px-2 py-2.5 text-center text-xs font-bold text-gray-600 w-20">VAT</th>
                <th className="w-16"></th>
              </tr>
            </thead>
            <tbody>
              {activeChiTiet.map((row, idx) => {
                const giaHD = row.gia_hop_dong || row.gia_ban_thuc_te || 0;
                const thanhTien = calcThanhTienBan(row.so_luong, giaHD);
                return (
                  <tr key={row.tempId} className="group border-b border-gray-100 hover:bg-blue-50/30 transition-colors">
                    <td className="px-2 py-1 text-center">
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="text-xs text-gray-500 font-medium">{idx + 1}</span>
                        <button
                          onClick={() => insertRowAfter(row.tempId)}
                          title="Thêm dòng bên dưới"
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-100"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                    <td className="px-2 py-1">
                      <input type="text" value={row.ten_san_pham}
                        onChange={(e) => updateChiTiet(row.tempId, 'ten_san_pham', e.target.value)}
                        className={inputCls} placeholder="Tên sản phẩm..." />
                    </td>
                    <td className="px-1 py-1">
                      <input type="text" value={row.don_vi}
                        onChange={(e) => updateChiTiet(row.tempId, 'don_vi', e.target.value)}
                        className={`${inputCls} text-center`} placeholder="ĐV" />
                    </td>
                    <td className="px-1 py-1">
                      <NumInput value={row.so_luong} onChange={(v) => updateChiTiet(row.tempId, 'so_luong', v)}
                        className={`${inputCls} text-center`} min={1} isInteger format="number" />
                    </td>
                    <td className="px-1 py-1">
                      <NumInput value={row.don_gia_von} onChange={(v) => updateChiTiet(row.tempId, 'don_gia_von', v)}
                        className={`${inputCls} text-right text-blue-700`} min={0} isInteger format="money" />
                    </td>
                    <td className="px-1 py-1">
                      <NumInput value={row.lai_suat_phan_tram ?? 0} onChange={(v) => updateChiTiet(row.tempId, 'lai_suat_phan_tram', v)}
                        className={`${inputCls} text-right text-green-700 font-medium`} min={0} isInteger format="number" />
                    </td>
                    <td className="px-1 py-1">
                      <NumInput value={row.gia_ban_thuc_te} onChange={(v) => updateChiTiet(row.tempId, 'gia_ban_thuc_te', v)}
                        className={`${inputCls} text-right text-gray-700`} min={0} isInteger format="money" />
                    </td>
                    <td className="px-1 py-1">
                      <NumInput value={row.chenh_lech_phan_tram || 0} onChange={(v) => updateChiTiet(row.tempId, 'chenh_lech_phan_tram', v)}
                        className={`${inputCls} text-right text-orange-600 font-medium`} min={-100} isInteger format="number" />
                    </td>
                    <td className="px-1 py-1">
                      <NumInput value={row.gia_hop_dong || row.gia_ban_thuc_te || 0} onChange={(v) => updateChiTiet(row.tempId, 'gia_hop_dong', v)}
                        className={`${inputCls} text-right text-blue-700 font-semibold`} min={0} isInteger format="money" />
                    </td>
                    <td className="px-2 py-1 text-right text-sm font-semibold text-gray-800 whitespace-nowrap">
                      {thanhTien > 0 ? formatVND(thanhTien) : <span className="text-gray-400">0</span>}
                    </td>
                    <td className="px-1 py-1">
                      <select value={row.thue_suat}
                        onChange={(e) => updateChiTiet(row.tempId, 'thue_suat', Number(e.target.value))}
                        className="w-full px-1 py-1 text-xs text-center border border-gray-200 rounded focus:border-blue-400 focus:ring-1 focus:ring-blue-400 focus:outline-none bg-white">
                        <option value={0}>0%</option>
                        <option value={8}>8%</option>
                        <option value={10}>10%</option>
                      </select>
                    </td>
                    <td className="px-1 py-1 text-center">
                      <button
                        onClick={() => removeChiTietRow(row.tempId)}
                        disabled={activeChiTiet.length <= 1}
                        className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                        title="Xóa dòng"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <button
          onClick={() => insertRowAfter(activeChiTiet[activeChiTiet.length - 1]?.tempId ?? null)}
          className="mt-3 w-full py-2 border-2 border-dashed border-gray-300 text-gray-500 rounded-lg text-sm hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-all font-medium"
        >
          + THÊM SẢN PHẨM
        </button>
      </div>

      {/* Summary */}
      <div className="px-4 pb-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl p-4 bg-green-50 border border-green-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-green-800 uppercase tracking-wide">Lợi nhuận gộp:</span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${tyLeLoiNhuan >= 0 ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'}`}>
              {tyLeLoiNhuan}%
            </span>
          </div>
          <div className="text-sm text-gray-600 space-y-1 mb-2">
            <div className="flex justify-between">
              <span>Tổng giá bán (trước thuế):</span>
              <span className="font-medium">{tongTruocVAT > 0 ? formatVND(tongTruocVAT) : '0'}</span>
            </div>
            <div className="flex justify-between">
              <span>
                Tổng giá vốn
                {cheDoVanChuyen === 1 && <span className="text-xs text-orange-500 ml-1">(+VC phân bổ)</span>}
                {cheDoVanChuyen === 2 && <span className="text-xs text-orange-500 ml-1">(+VC hỗ trợ)</span>}
                :
              </span>
              <span className="text-red-600 font-medium">{tongGiaVon > 0 ? formatVND(tongGiaVon) : <span className="text-red-400">0</span>}</span>
            </div>
          </div>
          <div className={`text-2xl font-bold ${loiNhuanGop >= 0 ? 'text-green-700' : 'text-red-600'}`}>
            {formatVND(loiNhuanGop)}
          </div>
        </div>

        <div className="rounded-xl p-4 bg-white border border-gray-200">
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Tiền hàng (Chưa VAT):</span>
              <span className="font-medium text-gray-900">{tongTruocVAT > 0 ? formatVND(tongTruocVAT) : '0'}</span>
            </div>
            {vat8 > 0 && (
              <div className="flex justify-between">
                <span className="text-red-500">Thuế VAT 8%:</span>
                <span className="text-red-500">{formatVND(vat8)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-red-500">Thuế VAT 10%:</span>
              <span className="text-red-500">{vat10 > 0 ? formatVND(vat10) : '0'}</span>
            </div>
            {cheDoVanChuyen === 0 && phiVanChuyen > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">Phí vận chuyển (riêng):</span>
                <span className="font-medium text-gray-900">{formatVND(phiVanChuyen)}</span>
              </div>
            )}
            <div className="border-t border-gray-200 pt-2 mt-2 flex justify-between items-center">
              <span className="font-bold text-gray-800 uppercase text-xs tracking-wide">Tổng thanh toán:</span>
              <span className="text-lg font-bold text-blue-700">
                {tongThanhToan > 0 ? formatVND(tongThanhToan) : <span className="text-blue-400">0</span>}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer actions */}
      <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 rounded-b-xl flex items-center justify-between">
        <button onClick={onCancel}
          className="px-5 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
          {mode === 'create' ? 'QUAY LẠI' : 'HỦY'}
        </button>
        <button
          className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50"
          onClick={handleSave}
          disabled={saving}
        >
          <Save className="w-4 h-4" />
          {saving ? 'Đang lưu...' : 'LƯU HỢP ĐỒNG'}
        </button>
      </div>

      {/* Inherit from BaoGia Modal */}
      {showInheritModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h3 className="text-base font-bold text-gray-900">Kế thừa từ Báo giá</h3>
                <p className="text-xs text-gray-500 mt-0.5">Chọn một báo giá để nhập sản phẩm vào hợp đồng</p>
              </div>
              <button
                onClick={() => setShowInheritModal(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-5 py-3 border-b border-gray-100">
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Lọc theo khách hàng</label>
              <select
                value={inheritKhachHangFilter}
                onChange={(e) => setInheritKhachHangFilter(e.target.value)}
                className="select-field w-full text-sm"
              >
                <option value="">-- Tất cả khách hàng --</option>
                {inheritKhachHangList.map((kh) => (
                  <option key={kh.id} value={kh.id}>{kh.ten_cong_ty}</option>
                ))}
              </select>
            </div>

            <div className="flex-1 overflow-y-auto">
              {inheritLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                </div>
              ) : inheritBaoGiaList.length === 0 ? (
                <div className="text-center py-12 text-sm text-gray-400">Không có báo giá nào</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-xs font-bold text-gray-600">Số báo giá</th>
                      <th className="px-4 py-2.5 text-left text-xs font-bold text-gray-600">Ngày</th>
                      <th className="px-4 py-2.5 text-left text-xs font-bold text-gray-600">Khách hàng</th>
                      <th className="px-4 py-2.5 text-left text-xs font-bold text-gray-600">Dự án</th>
                      <th className="w-24"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {inheritBaoGiaList.map((bg) => (
                      <tr key={bg.id} className="hover:bg-blue-50 transition-colors">
                        <td className="px-4 py-2.5 font-medium text-gray-900">{bg.so_bao_gia}</td>
                        <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">
                          {bg.ngay_bao_gia ? bg.ngay_bao_gia.slice(0, 10).split('-').reverse().join('/') : '--'}
                        </td>
                        <td className="px-4 py-2.5 text-gray-700">
                          {(bg as any).ten_cong_ty || (bg.khach_hang as any)?.ten_cong_ty || '--'}
                        </td>
                        <td className="px-4 py-2.5 text-gray-500">{bg.ten_du_an || '--'}</td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            onClick={() => inheritFromBaoGia(bg)}
                            className="px-3 py-1 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition-colors"
                          >
                            Chọn
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
