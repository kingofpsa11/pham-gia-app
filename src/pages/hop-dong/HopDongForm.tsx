import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
  applyVanChuyenToChiTiet,
  giaBanChuaVanChuyenFromBg,
  calcLaiPhanTramTuGiaBan,
  giaBanThuanChoLoiNhuan,
  calcLoiNhuanGop,
  todayVN,
  isoToVN,
  vnToISO,
  isValidVNDate,
  parseTSV,
  isChiTietRowTrong,
  namTuNgay,
  trangThaiHopDongLabel,
} from '../../lib/utils';
import { Save, Plus, Trash2, ClipboardList, ClipboardPaste, FileSpreadsheet, RefreshCw, Search, X } from 'lucide-react';
import ChiTietSttCell from '../../components/shared/ChiTietSttCell';
import LoiNhuanGopSummary from '../../components/shared/LoiNhuanGopSummary';
import KhachHangFilterField from '../../components/shared/KhachHangFilterField';
import NumInput from '../../components/ui/NumInput';
import VnDateInput from '../../components/ui/VnDateInput';
import {
  EntityFormMetaSection,
  EntityFormMetaRow,
  EntityFormField,
} from '../../components/shared/EntityFormMeta';
import type { KhachHang, HopDong, HopDongChiTiet, BaoGia } from '../../types';

interface ChiTietRow extends HopDongChiTiet {
  tempId: string;
  isNew: boolean;
  deleted?: boolean;
  gia_ban_chua_van_chuyen?: number;
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

const toChiTietRow = (ct: HopDongChiTiet): ChiTietRow => {
  const giaChua = Number((ct as ChiTietRow).gia_ban_chua_van_chuyen) || Number(ct.gia_ban_thuc_te) || 0;
  return {
    ...ct,
    gia_ban_chua_van_chuyen: giaChua,
    gia_ban_thuc_te: giaChua,
    tempId: ct.id ? `existing-${ct.id}` : crypto.randomUUID(),
    isNew: !ct.id,
  };
};

function buildChiTietRowFromBaoGia(ct: any): ChiTietRow {
  const giaChua = giaBanChuaVanChuyenFromBg(ct);
  const giaBanBg = Number(ct.gia_ban_thuc_te) || giaChua;
  const soLuong = Number(ct.so_luong) || 1;
  const gv = Number(ct.don_gia_von) || 0;
  const lai = gv > 0 ? calcLaiPhanTramTuGiaBan(giaBanBg, gv) : Number(ct.lai_suat_phan_tram) || 5;

  return {
    tempId: crypto.randomUUID(),
    isNew: true,
    ten_san_pham: ct.ten_san_pham || '',
    don_vi: ct.don_vi || '',
    so_luong: soLuong,
    don_gia_von: gv,
    lai_suat_phan_tram: lai,
    gia_ban_chua_van_chuyen: giaChua,
    gia_ban_thuc_te: giaChua,
    thue_suat: Number(ct.thue_suat) || 10,
    chenh_lech_phan_tram: 0,
    gia_hop_dong: giaBanBg,
  };
}

function roundGia1K(value: number): number {
  return Math.round(value / 1000) * 1000;
}

function giaHopDongFromBanVaChenh(giaBanCoVc: number, chenhPct: number): number {
  return roundGia1K(calcGiaBanGoiY(giaBanCoVc, Number(chenhPct) || 0));
}

function rowsForVanChuyen(rows: ChiTietRow[]): ChiTietRow[] {
  return rows.map((r) => ({
    ...r,
    gia_ban_chua_van_chuyen: r.gia_ban_chua_van_chuyen ?? r.gia_ban_thuc_te ?? 0,
  }));
}

function getGiaBanCoVcForRow(
  row: ChiTietRow,
  activeRows: ChiTietRow[],
  cheDo: number,
  phi: number
): number {
  const vcRow = applyVanChuyenToChiTiet(rowsForVanChuyen(activeRows), cheDo, phi).find(
    (x) => x.tempId === row.tempId
  );
  return vcRow?.gia_ban_thuc_te ?? (Number(row.gia_ban_chua_van_chuyen) || 0);
}

/** Từ giá bán đã gồm VC (chế độ phân bổ) suy ra giá chưa VC. */
function giaChuaTuGiaBanCoVc(
  targetBanCoVc: number,
  row: ChiTietRow,
  activeRows: ChiTietRow[],
  cheDo: number,
  phi: number
): number {
  const target = roundGia1K(Math.max(0, Number(targetBanCoVc) || 0));
  if (cheDo !== 1 || phi <= 0) return target;

  let giaChua = target;
  for (let i = 0; i < 5; i++) {
    const rows = activeRows.map((r) => {
      const base =
        r.tempId === row.tempId
          ? giaChua
          : Number(r.gia_ban_chua_van_chuyen ?? r.gia_ban_thuc_te) || 0;
      return { ...r, gia_ban_chua_van_chuyen: base, gia_ban_thuc_te: base };
    });
    const vcRow = applyVanChuyenToChiTiet(rows, cheDo, phi).find((x) => x.tempId === row.tempId);
    if (!vcRow) break;
    const vcDon = Number(vcRow.chi_phi_van_chuyen_phan_bo) || 0;
    const next = roundGia1K(Math.max(0, target - vcDon));
    if (next === giaChua) break;
    giaChua = next;
  }
  return giaChua;
}

function getGiaBanChoTinhLai(
  row: ChiTietRow,
  activeRows: ChiTietRow[],
  cheDo: number,
  phi: number
): number {
  if (cheDo === 1) {
    return giaBanThuanChoLoiNhuan(
      {
        gia_ban_chua_van_chuyen: row.gia_ban_chua_van_chuyen,
        gia_ban_thuc_te: row.gia_ban_thuc_te,
      },
      1
    );
  }
  return getGiaBanCoVcForRow(row, activeRows, cheDo, phi);
}

/** Lãi % = (giá bán thuần − giá vốn) / giá vốn; chế độ phân bổ: giá thuần = giá chưa VC. */
function syncLaiTuGiaBan(
  row: ChiTietRow,
  activeRows: ChiTietRow[],
  cheDo: number,
  phi: number
): ChiTietRow {
  const giaBan = getGiaBanChoTinhLai(row, activeRows, cheDo, phi);
  const gv = Number(row.don_gia_von) || 0;
  return {
    ...row,
    lai_suat_phan_tram: gv > 0 ? calcLaiPhanTramTuGiaBan(giaBan, gv) : row.lai_suat_phan_tram ?? 0,
  };
}

const emptyChiTiet = (): ChiTietRow => ({
  tempId: crypto.randomUUID(),
  isNew: true,
  ten_san_pham: '',
  don_vi: '',
  so_luong: 1,
  don_gia_von: 0,
  lai_suat_phan_tram: 5,
  gia_ban_chua_van_chuyen: 0,
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
  const [trangThai, setTrangThai] = useState('Hieu luc');

  // KH search dropdown
  const [khSearch, setKhSearch] = useState('');
  const [khResults, setKhResults] = useState<KhachHang[]>([]);
  const [khDropOpen, setKhDropOpen] = useState(false);
  const [khSearching, setKhSearching] = useState(false);
  const khDropRef = useRef<HTMLDivElement>(null);

  const [chiTiet, setChiTiet] = useState<ChiTietRow[]>([emptyChiTiet()]);
  const [saving, setSaving] = useState(false);
  const [showExcelPaste, setShowExcelPaste] = useState(false);
  const [excelText, setExcelText] = useState('');
  const excelTextareaRef = useRef<HTMLTextAreaElement>(null);
  const phiVCNum = Number(phiVanChuyen) || 0;

  // Inherit from bao gia modal
  const [showInheritModal, setShowInheritModal] = useState(false);
  const [inheritKhachHangFilter, setInheritKhachHangFilter] = useState('');
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
      } catch (err) {
        console.error('Loi tim khach hang:', err);
        setKhResults([]);
        addToast(
          'error',
          err instanceof Error ? err.message : 'Không thể tìm khách hàng. Kiểm tra kết nối API / SSH tunnel.'
        );
      } finally {
        setKhSearching(false);
      }
    }, 250);
  }, [addToast]);

  useEffect(() => {
    if (mode === 'create' && fromBaoGia) {
      setSoHopDong(generateSoHopDong());
      setKhachHangId(String(fromBaoGia.khach_hang_id));
      setKhachHangName(fromBaoGia.ten_cong_ty);
      setKhSearch(fromBaoGia.ten_cong_ty);
      setTenDuAn(fromBaoGia.ten_du_an);
      setCheDoVanChuyen(fromBaoGia.che_do_van_chuyen);
      setPhiVanChuyen(Number(fromBaoGia.phi_van_chuyen) || 0);
      const rows: ChiTietRow[] = (fromBaoGia.chi_tiet || []).map(buildChiTietRowFromBaoGia);
      setChiTiet(rows.length > 0 ? rows : [emptyChiTiet()]);
    } else if (mode === 'create') {
      setSoHopDong(generateSoHopDong());
    } else if (initialData) {
      populateFromData(initialData);
    }
  }, [mode, initialData, fromBaoGia]);

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

  function populateFromData(hd: HopDong & { chi_tiet?: HopDongChiTiet[] }) {
    setKhachHangId(String(hd.khach_hang_id));
    setKhachHangName((hd as any).ten_cong_ty || (hd as any).khach_hang?.ten_cong_ty || '');
    setKhSearch((hd as any).ten_cong_ty || (hd as any).khach_hang?.ten_cong_ty || '');
    setSoHopDong(hd.so_hop_dong || '');
    setNgayHopDong(isoToVN(hd.ngay_hop_dong as string));
    setTenDuAn(hd.ten_du_an || '');
    const cheDo = hd.che_do_van_chuyen ?? 0;
    const phi = Number(hd.phi_van_chuyen) || 0;
    setCheDoVanChuyen(cheDo);
    setPhiVanChuyen(phi);
    setMoTaNoiDung(hd.mo_ta_noi_dung || '');
    setTenFolder((hd as any).ten_folder_du_an || '');
    setTrangThai(hd.trang_thai || 'Hieu luc');
    const baseRows = ((hd.chi_tiet as HopDongChiTiet[]) || []).map(toChiTietRow);
    const rowsSynced = baseRows.map((row) => syncLaiTuGiaBan(row, baseRows, cheDo, phi));
    const rows = rowsSynced.map((r) => {
      const giaBanCoVc = getGiaBanCoVcForRow(r, baseRows, cheDo, phi);
      const giaHD = Number(r.gia_hop_dong) || giaHopDongFromBanVaChenh(giaBanCoVc, Number(r.chenh_lech_phan_tram) || 0);
      const chenh =
        giaBanCoVc > 0
          ? Math.round(((giaHD - giaBanCoVc) / giaBanCoVc) * 100 * 100) / 100
          : Number(r.chenh_lech_phan_tram) || 0;
      return { ...r, chenh_lech_phan_tram: chenh };
    });
    setChiTiet(rows.length > 0 ? rows : [emptyChiTiet()]);
  }

  async function inheritFromBaoGia(bg: BaoGia & { ten_cong_ty?: string }) {
    try {
      const res = await baoGiaApi.get(bg.id);
      const bgFull = res.data as any;
      const rows: ChiTietRow[] = (bgFull.chi_tiet || []).map(buildChiTietRowFromBaoGia);

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
        setPhiVanChuyen(Number(bgFull.phi_van_chuyen) || 0);
        addToast('success', `Đã kế thừa ${rows.length} sản phẩm từ báo giá ${bg.so_bao_gia}`);
      } else {
        addToast('warning', 'Báo giá này không có sản phẩm');
      }
    } catch {
      addToast('error', 'Không thể tải báo giá');
    }
    setShowInheritModal(false);
  }

  function insertRowBefore(beforeTempId: string) {
    const newRow = emptyChiTiet();
    setChiTiet((prev) => {
      const idx = prev.findIndex((r) => r.tempId === beforeTempId);
      if (idx < 0) return prev;
      const next = [...prev];
      next.splice(idx, 0, newRow);
      return next;
    });
  }

  function insertRowAfter(afterTempId: string | null) {
    const newRow = emptyChiTiet();
    setChiTiet((prev) => {
      if (afterTempId === null) return [newRow, ...prev];
      const idx = prev.findIndex((r) => r.tempId === afterTempId);
      if (idx < 0) return [...prev, newRow];
      const next = [...prev];
      next.splice(idx + 1, 0, newRow);
      return next;
    });
  }

  function handlePasteFromExcel() {
    if (!excelText.trim()) {
      addToast('warning', 'Vui lòng dán dữ liệu từ Excel vào ô trên');
      return;
    }
    const records = parseTSV(excelText.trim()).filter((cols) => cols.some((c) => c.trim()));
    const rows: ChiTietRow[] = [];
    for (const cols of records) {
      const tenSanPham = cols[0]?.trim().replace(/\n/g, ' ').replace(/\s+/g, ' ') || '';
      if (!tenSanPham) continue;
      const donVi = (cols[2] || '').trim();
      const soLuongRaw = (cols[3] || '1').trim().replace(/[^0-9.,]/g, '').replace(/\./g, '').replace(',', '.');
      const donGiaVonRaw = (cols[4] || '0').trim().replace(/[^0-9.,]/g, '').replace(/\./g, '').replace(',', '.');
      const soLuong = parseFloat(soLuongRaw) || 1;
      const donGiaVon = parseFloat(donGiaVonRaw) || 0;
      const laiSuat = 5;
      const giaBan = roundGia1K(calcGiaBanGoiY(donGiaVon, laiSuat));
      rows.push({
        tempId: crypto.randomUUID(),
        isNew: true,
        ten_san_pham: tenSanPham,
        don_vi: donVi,
        so_luong: soLuong,
        don_gia_von: donGiaVon,
        lai_suat_phan_tram: laiSuat,
        gia_ban_chua_van_chuyen: giaBan,
        gia_ban_thuc_te: giaBan,
        thue_suat: 10,
        chenh_lech_phan_tram: 0,
        gia_hop_dong: giaBan,
      });
    }
    if (rows.length === 0) {
      addToast('warning', 'Không tìm thấy dữ liệu hợp lệ');
      return;
    }
    setChiTiet((prev) => {
      const kept = prev.filter((r) => r.deleted || !isChiTietRowTrong(r.ten_san_pham));
      const merged = [...kept, ...rows];
      const active = merged.filter((r) => !r.deleted);
      return merged.map((row) =>
        row.deleted ? row : syncLaiTuGiaBan(row, active, cheDoVanChuyen, phiVCNum)
      );
    });
    setShowExcelPaste(false);
    setExcelText('');
    addToast('success', `Đã thêm ${rows.length} dòng từ Excel`);
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

  function updateChiTiet(
    tempId: string,
    field: keyof ChiTietRow | 'gia_ban_co_vc',
    value: string | number
  ) {
    setChiTiet((prev) => {
      const active = prev.filter((r) => !r.deleted);
      return prev.map((row) => {
        if (row.tempId !== tempId) return row;

        let updated: ChiTietRow =
          field === 'gia_ban_co_vc' ? { ...row } : { ...row, [field]: value };

        if (field === 'don_gia_von' || field === 'lai_suat_phan_tram') {
          const gv =
            field === 'don_gia_von' ? Number(value) : Number(updated.don_gia_von) || 0;
          const lai =
            field === 'lai_suat_phan_tram' ? Number(value) : Number(updated.lai_suat_phan_tram) || 0;
          updated.don_gia_von = gv;
          updated.lai_suat_phan_tram = lai;
          const giaChua = roundGia1K(calcGiaBanGoiY(gv, lai));
          updated.gia_ban_chua_van_chuyen = giaChua;
          updated.gia_ban_thuc_te = giaChua;
        }

        if (field === 'gia_ban_co_vc') {
          const banCoVc = Math.max(0, Number(value) || 0);
          if (banCoVc === 0) {
            updated.gia_ban_chua_van_chuyen = 0;
            updated.gia_ban_thuc_te = 0;
            updated.lai_suat_phan_tram = 0;
          } else {
            const giaChua = giaChuaTuGiaBanCoVc(
              banCoVc,
              updated,
              active,
              cheDoVanChuyen,
              phiVCNum
            );
            updated.gia_ban_chua_van_chuyen = giaChua;
            updated.gia_ban_thuc_te = giaChua;
            const activeWith = active.map((r) => (r.tempId === tempId ? updated : r));
            updated = syncLaiTuGiaBan(updated, activeWith, cheDoVanChuyen, phiVCNum);
          }
        }

        if (field === 'gia_ban_thuc_te' || field === 'gia_ban_chua_van_chuyen') {
          const giaChua = roundGia1K(Number(value));
          updated.gia_ban_chua_van_chuyen = giaChua;
          updated.gia_ban_thuc_te = giaChua;
          const activeWith = active.map((r) => (r.tempId === tempId ? updated : r));
          updated = syncLaiTuGiaBan(updated, activeWith, cheDoVanChuyen, phiVCNum);
        }

        if (field === 'so_luong') {
          updated.so_luong = Number(value) || 1;
          const activeWith = active.map((r) => (r.tempId === tempId ? updated : r));
          updated = syncLaiTuGiaBan(updated, activeWith, cheDoVanChuyen, phiVCNum);
        }

        if (field === 'gia_hop_dong') {
          updated.gia_hop_dong = Number(value);
          const activeWith = active.map((r) => (r.tempId === tempId ? updated : r));
          const giaBanCoVc = getGiaBanCoVcForRow(updated, activeWith, cheDoVanChuyen, phiVCNum);
          if (giaBanCoVc > 0) {
            updated.chenh_lech_phan_tram = Math.round(
              ((Number(updated.gia_hop_dong) - giaBanCoVc) / giaBanCoVc) * 100 * 100
            ) / 100;
          }
        }

        return updated;
      });
    });
  }

  // Đổi phí VC / chế độ VC → giá bán đổi theo phân bổ → tính lại lãi %
  useEffect(() => {
    setChiTiet((prev) => {
      const active = prev.filter((r) => !r.deleted);
      if (active.length === 0) return prev;
      return prev.map((row) => {
        if (row.deleted) return row;
        const activeWith = active.map((r) => (r.tempId === row.tempId ? row : r));
        return syncLaiTuGiaBan(row, activeWith, cheDoVanChuyen, phiVCNum);
      });
    });
  }, [cheDoVanChuyen, phiVCNum]);

  const activeChiTiet = useMemo(() => chiTiet.filter((r) => !r.deleted), [chiTiet]);

  const withVCItems = useMemo(
    () =>
      applyVanChuyenToChiTiet(
        activeChiTiet.map((r) => ({
          ...r,
          gia_ban_chua_van_chuyen: r.gia_ban_chua_van_chuyen ?? r.gia_ban_thuc_te ?? 0,
        })),
        cheDoVanChuyen,
        phiVCNum
      ),
    [activeChiTiet, cheDoVanChuyen, phiVCNum]
  );

  const profitRows = withVCItems.map((r) => ({
    so_luong: r.so_luong,
    gia_ban_thuc_te: giaBanThuanChoLoiNhuan(r, cheDoVanChuyen),
    don_gia_von: r.don_gia_von,
  }));

  const calcItemsHD = activeChiTiet.map((r) => {
    const vcRow = withVCItems.find((x) => x.tempId === r.tempId);
    const giaBanCoVc = vcRow?.gia_ban_thuc_te ?? (Number(r.gia_ban_chua_van_chuyen) || 0);
    const giaHD = giaHopDongFromBanVaChenh(giaBanCoVc, Number(r.chenh_lech_phan_tram) || 0);
    return {
      so_luong: r.so_luong,
      gia_ban_thuc_te: giaHD,
      thue_suat: r.thue_suat,
    };
  });

  const tongTruocVAT = calcTongTruocVAT(calcItemsHD);
  const tongVAT = calcTongVAT(calcItemsHD);
  const phiVCRieng = cheDoVanChuyen === 0 ? phiVCNum : 0;
  const tongThanhToan = calcTongThanhToan(tongTruocVAT, tongVAT, phiVCRieng);

  const tongGiaVonThuan = activeChiTiet.reduce(
    (s, r) => s + Number(r.so_luong) * Number(r.don_gia_von),
    0
  );
  const loiNhuanGop = calcLoiNhuanGop(profitRows, cheDoVanChuyen, phiVCNum);
  const tyLeLoiNhuan =
    tongTruocVAT > 0 ? Math.round((loiNhuanGop / tongTruocVAT) * 100) : 0;

  const vat8 = activeChiTiet.reduce((s, r, i) => {
    if (r.thue_suat !== 8) return s;
    const item = calcItemsHD[i];
    return s + calcVAT(calcThanhTienBan(item.so_luong, item.gia_ban_thuc_te), 8);
  }, 0);
  const vat10 = activeChiTiet.reduce((s, r, i) => {
    if (r.thue_suat !== 10) return s;
    const item = calcItemsHD[i];
    return s + calcVAT(calcThanhTienBan(item.so_luong, item.gia_ban_thuc_te), 10);
  }, 0);

  async function handleSave() {
    if (!khachHangId) { addToast('warning', 'Vui lòng chọn khách hàng'); return; }
    if (!soHopDong.trim()) { addToast('warning', 'Vui lòng nhập số hợp đồng'); return; }
    if (!isValidVNDate(ngayHopDong)) { addToast('warning', 'Ngày hợp đồng không hợp lệ (dd/mm/yyyy)'); return; }
    const validChiTiet = activeChiTiet.filter((r) => (r.ten_san_pham || '').trim());
    if (validChiTiet.length === 0) { addToast('warning', 'Vui lòng thêm ít nhất một sản phẩm'); return; }

    const withVCForSave = applyVanChuyenToChiTiet(
      validChiTiet.map((r) => ({
        ...r,
        gia_ban_chua_van_chuyen: r.gia_ban_chua_van_chuyen ?? r.gia_ban_thuc_te ?? 0,
      })),
      cheDoVanChuyen,
      phiVCNum
    );

    const ngayISO = vnToISO(ngayHopDong);
    const nam = namTuNgay(ngayHopDong, ngayISO);
    try {
      const dup = await hopDongApi.checkSoTrung({
        so_hop_dong: soHopDong.trim(),
        nam,
        ngay_hop_dong: ngayISO,
        exclude_id: mode === 'edit' && hopDongId ? hopDongId : undefined,
      });
      if (dup.exists) {
        addToast('error', `Số hợp đồng "${soHopDong.trim()}" đã tồn tại trong năm ${nam}. Vui lòng nhập số khác.`);
        return;
      }
    } catch (err) {
      console.error('Kiem tra so hop dong:', err);
      addToast('error', err instanceof Error ? err.message : 'Không thể kiểm tra số hợp đồng');
      return;
    }

    setSaving(true);
    try {
    const payload = {
        so_hop_dong: soHopDong.trim(),
        ngay_hop_dong: ngayISO,
        khach_hang_id: Number(khachHangId),
        ten_du_an: tenDuAn.trim() || null,
        trang_thai: mode === 'create' ? 'Hieu luc' : trangThai,
        che_do_van_chuyen: cheDoVanChuyen,
        phi_van_chuyen: phiVCNum,
        mo_ta_noi_dung: moTaNoiDung.trim() || null,
        chi_tiet: validChiTiet.map((r) => {
          const vcRow = withVCForSave.find((x) => x.tempId === r.tempId);
          const giaChua = Number(vcRow?.gia_ban_chua_van_chuyen ?? r.gia_ban_chua_van_chuyen ?? r.gia_ban_thuc_te) || 0;
          const giaBanCoVc = vcRow?.gia_ban_thuc_te ?? giaChua;
          const giaHD = giaHopDongFromBanVaChenh(giaBanCoVc, Number(r.chenh_lech_phan_tram) || 0);
          return {
            ten_san_pham: (r.ten_san_pham || '').trim(),
            don_vi: (r.don_vi || '').trim(),
            so_luong: r.so_luong,
            don_gia_von: r.don_gia_von,
            lai_suat_phan_tram: r.lai_suat_phan_tram ?? 0,
            gia_ban_thuc_te: giaChua,
            thue_suat: r.thue_suat,
            chenh_lech_phan_tram: r.chenh_lech_phan_tram || 0,
            gia_hop_dong: giaHD,
          };
        }),
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
      const msg = err instanceof Error ? err.message : '';
      addToast(
        'error',
        msg || (mode === 'create' ? 'Không thể tạo hợp đồng' : 'Không thể cập nhật hợp đồng')
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <EntityFormMetaSection>
        <EntityFormMetaRow>
          <EntityFormField label="Số hợp đồng" required className="sm:col-span-1 lg:col-span-2">
            <input
              type="text"
              value={soHopDong}
              onChange={(e) => setSoHopDong(e.target.value)}
              className="input-field text-sm"
              placeholder="Số HĐ..."
            />
          </EntityFormField>

          <EntityFormField label="Ngày ký" className="sm:col-span-1 lg:col-span-2">
            <VnDateInput value={ngayHopDong} onChange={setNgayHopDong} />
          </EntityFormField>

          {mode === 'edit' && (
            <EntityFormField label="Trạng thái" className="sm:col-span-1 lg:col-span-2">
              <select
                value={trangThai}
                onChange={(e) => setTrangThai(e.target.value)}
                className="input-field text-sm w-full"
              >
                <option value="Hieu luc">{trangThaiHopDongLabel('Hieu luc')}</option>
                <option value="Thanh ly">{trangThaiHopDongLabel('Thanh ly')}</option>
                <option value="Huy">{trangThaiHopDongLabel('Huy')}</option>
              </select>
            </EntityFormField>
          )}

          <EntityFormField
            label="Khách hàng"
            required
            className={`sm:col-span-2 relative ${mode === 'edit' ? 'lg:col-span-3' : 'lg:col-span-4'}`}
          >
            <div className="relative" ref={khDropRef}>
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
                className={`input-field text-sm pl-7 pr-7 w-full ${khachHangId ? 'border-green-400 ring-1 ring-green-400/30' : ''}`}
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
            </div>
          </EntityFormField>

          <EntityFormField
            label="Tên dự án"
            className={`sm:col-span-2 ${mode === 'edit' ? 'lg:col-span-3' : 'lg:col-span-4'}`}
          >
            <input
              type="text"
              value={tenDuAn}
              onChange={(e) => setTenDuAn(e.target.value)}
              className="input-field text-sm"
              placeholder="Tên dự án..."
            />
          </EntityFormField>
        </EntityFormMetaRow>

        <EntityFormMetaRow>
          <EntityFormField label="Mô tả nội dung" className="sm:col-span-2 lg:col-span-4">
            <input
              type="text"
              value={moTaNoiDung}
              onChange={(e) => setMoTaNoiDung(e.target.value)}
              className="input-field text-sm"
              placeholder="Mô tả ngắn..."
            />
          </EntityFormField>

          <EntityFormField label="Thư mục Drive" className="sm:col-span-2 lg:col-span-4 min-w-0">
            <div className="flex gap-2">
              <input
                type="text"
                value={tenFolder}
                onChange={(e) => setTenFolder(e.target.value)}
                className="input-field text-sm flex-1 min-w-0"
                placeholder="Tên folder..."
              />
              <button
                type="button"
                className="h-10 shrink-0 px-4 bg-primary-600 text-white rounded-lg text-xs font-semibold hover:bg-primary-700 transition-colors"
              >
                Tạo
              </button>
            </div>
          </EntityFormField>

          <EntityFormField label="Chế độ vận chuyển" className="sm:col-span-1 lg:col-span-2">
            <select
              value={cheDoVanChuyen}
              onChange={(e) => setCheDoVanChuyen(Number(e.target.value))}
              className="select-field text-sm w-full"
            >
              <option value={0}>Riêng</option>
              <option value={1}>Phân bổ vào giá bán</option>
              <option value={2}>Hỗ trợ</option>
            </select>
          </EntityFormField>

          <EntityFormField label="Phí vận chuyển (giá vốn)" className="sm:col-span-1 lg:col-span-2">
            <NumInput
              value={phiVanChuyen}
              onChange={setPhiVanChuyen}
              className="input-field text-sm text-right w-full"
              min={0}
              isInteger
              format="money"
            />
          </EntityFormField>
        </EntityFormMetaRow>
      </EntityFormMetaSection>

      {/* Chi tiet table */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <span className="text-xs font-bold text-gray-600 uppercase tracking-widest">Chi tiết sản phẩm hợp đồng</span>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setShowExcelPaste(true)}
              className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg text-xs font-bold hover:bg-green-700 transition-colors shadow-sm"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              DÁN TỪ EXCEL
            </button>
            <button
              type="button"
              onClick={() => setShowInheritModal(true)}
              className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors shadow-sm"
            >
              <ClipboardList className="w-3.5 h-3.5" />
              KẾ THỪA BÁO GIÁ
            </button>
          </div>
        </div>

        {showExcelPaste && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <ClipboardPaste className="w-4 h-4 text-green-700 shrink-0" />
              <span className="text-sm font-semibold text-green-800">Dán dữ liệu từ Excel</span>
              <span className="text-xs text-green-600">
                — Cột 1: Tên SP · Cột 3: Đơn vị · Cột 4: SL · Cột 5: Giá vốn · Xóa dòng trống rồi thêm vào cuối
              </span>
            </div>
            <textarea
              ref={excelTextareaRef}
              value={excelText}
              onChange={(e) => setExcelText(e.target.value)}
              className="w-full h-32 px-3 py-2 text-sm border border-green-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 font-mono resize-none"
              placeholder="Ctrl+C từ Excel rồi Ctrl+V vào đây..."
              autoFocus
            />
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={handlePasteFromExcel}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Nhập dữ liệu
              </button>
              <button
                type="button"
                onClick={() => { setShowExcelPaste(false); setExcelText(''); }}
                className="px-4 py-2 bg-white text-gray-600 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors"
              >
                Hủy
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-2 py-2.5 text-center text-xs font-bold text-slate-600 w-[3.75rem]">STT</th>
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
                const vcRow = withVCItems.find((x) => x.tempId === row.tempId);
                const giaBanCoVc = vcRow?.gia_ban_thuc_te ?? (Number(row.gia_ban_chua_van_chuyen) || 0);
                const giaHD = giaHopDongFromBanVaChenh(giaBanCoVc, Number(row.chenh_lech_phan_tram) || 0);
                const thanhTien = calcThanhTienBan(row.so_luong, giaHD);
                return (
                  <tr key={row.tempId} className="group border-b border-gray-100 hover:bg-blue-50/30 transition-colors">
                    <ChiTietSttCell
                      index={idx + 1}
                      onInsertBefore={() => insertRowBefore(row.tempId)}
                      onInsertAfter={() => insertRowAfter(row.tempId)}
                    />
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
                      <NumInput
                        value={giaBanCoVc}
                        onChange={(v) => updateChiTiet(row.tempId, 'gia_ban_co_vc', v)}
                        className={`${inputCls} text-right text-gray-700`}
                        min={0}
                        isInteger
                        format="money"
                      />
                      {cheDoVanChuyen === 1 &&
                        giaBanCoVc !== (row.gia_ban_chua_van_chuyen ?? 0) && (
                          <div className="text-[10px] text-orange-500 leading-none text-right pr-1">
                            gốc: {formatVND(row.gia_ban_chua_van_chuyen ?? 0)}
                          </div>
                        )}
                    </td>
                    <td className="px-1 py-1">
                      <NumInput value={row.chenh_lech_phan_tram || 0} onChange={(v) => updateChiTiet(row.tempId, 'chenh_lech_phan_tram', v)}
                        className={`${inputCls} text-right text-orange-600 font-medium`} min={-100} isInteger format="number" />
                    </td>
                    <td className="px-1 py-1">
                      <NumInput value={giaHD} onChange={(v) => updateChiTiet(row.tempId, 'gia_hop_dong', v)}
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
        <LoiNhuanGopSummary
          tongGiaVonChuaVc={tongGiaVonThuan}
          phiVanChuyen={phiVCNum}
          giaBanChuaThue={tongTruocVAT}
          loiNhuan={loiNhuanGop}
          tyLeLai={tyLeLoiNhuan}
        />

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
              <KhachHangFilterField
                value={inheritKhachHangFilter}
                onChange={setInheritKhachHangFilter}
                placeholder="Tìm khách hàng..."
                className="w-full"
              />
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
