import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { baoGiaApi, khachHangApi } from '../../lib/api';
import { useToastStore } from '../../store/toast';
import {
  formatVND,
  generateSoBaoGia,
  calcGiaBanGoiY,
  calcThanhTienBan,
  calcVAT,
  calcTongTruocVAT,
  calcTongVAT,
  calcTongThanhToan,
  applyVanChuyenToChiTiet,
  giaBanThuanChoLoiNhuan,
  calcLoiNhuanGop,
  todayVN,
  isoToVN,
  vnToISO,
  isValidVNDate,
  parseTSV,
  isChiTietRowTrong,
  namTuNgay,
  buildTenFolderBaoGia,
  driveFolderUrl,
} from '../../lib/utils';
import { Save, Plus, Trash2, ClipboardPaste, FileSpreadsheet, RefreshCw, Search, X, ExternalLink } from 'lucide-react';
import ChiTietSttCell from '../../components/shared/ChiTietSttCell';
import LoiNhuanGopSummary from '../../components/shared/LoiNhuanGopSummary';
import NumInput from '../../components/ui/NumInput';
import VnDateInput from '../../components/ui/VnDateInput';
import {
  EntityFormMetaSection,
  EntityFormMetaRow,
  EntityFormField,
  EntityFormVersionBadge,
} from '../../components/shared/EntityFormMeta';
import type { KhachHang, BaoGia, BaoGiaChiTiet } from '../../types';

interface ChiTietRow extends BaoGiaChiTiet {
  tempId: string;
  isNew: boolean;
  deleted?: boolean;
}

interface BaoGiaFormProps {
  mode: 'create' | 'edit';
  baoGiaId?: number;
  initialData?: BaoGia & { chi_tiet?: BaoGiaChiTiet[] };
  onSaved: (savedId: number) => void;
  onCancel: () => void;
}

const toChiTietRow = (ct: BaoGiaChiTiet): ChiTietRow => {
  const giaChuaVC = Number(ct.gia_ban_chua_van_chuyen) || Number(ct.gia_ban_thuc_te) || 0;
  const vcPhanBo = Number(ct.chi_phi_van_chuyen_phan_bo) || 0;
  const giaThucTe = Number(ct.gia_ban_thuc_te) || giaChuaVC + vcPhanBo;
  return {
    ...ct,
    tempId: ct.id ? `existing-${ct.id}` : crypto.randomUUID(),
    isNew: !ct.id,
    so_luong: Number(ct.so_luong) || 1,
    don_gia_von: Number(ct.don_gia_von) || 0,
    lai_suat_phan_tram: Number(ct.lai_suat_phan_tram) || 0,
    gia_ban_chua_van_chuyen: giaChuaVC,
    chi_phi_van_chuyen_phan_bo: vcPhanBo,
    gia_ban_thuc_te: giaThucTe,
    thue_suat: Number(ct.thue_suat) || 10,
  };
};

const emptyChiTiet = (): ChiTietRow => ({
  tempId: crypto.randomUUID(),
  isNew: true,
  ten_san_pham: '',
  don_vi: '',
  so_luong: 1,
  don_gia_von: 0,
  lai_suat_phan_tram: 5,
  gia_ban_chua_van_chuyen: 0,
  chi_phi_van_chuyen_phan_bo: 0,
  gia_ban_thuc_te: 0,
  thue_suat: 10,
});

const inputCls = 'w-full px-2 py-1 text-sm border border-transparent rounded focus:border-blue-400 focus:ring-1 focus:ring-blue-400 focus:outline-none bg-transparent hover:bg-white hover:border-gray-300 transition-all';

export default function BaoGiaForm({ mode, baoGiaId, initialData, onSaved, onCancel }: BaoGiaFormProps) {
  const addToast = useToastStore((s) => s.addToast);
  const excelTextareaRef = useRef<HTMLTextAreaElement>(null);

  const [khachHangId, setKhachHangId] = useState('');
  const [khachHangName, setKhachHangName] = useState(''); // display name for selected
  const [soBaoGia, setSoBaoGia] = useState('');
  const [ngayBaoGia, setNgayBaoGia] = useState(todayVN());
  const [tenDuAn, setTenDuAn] = useState('');
  const [phienBan, setPhienBan] = useState(1);
  const [mauBaoGia, setMauBaoGia] = useState('Hapulico');
  const [cheDoVanChuyen, setCheDoVanChuyen] = useState<number>(1);
  const [phiVanChuyen, setPhiVanChuyen] = useState(0);
  const [tenFolder, setTenFolder] = useState('');
  const [idFolder, setIdFolder] = useState('');
  const [driveEmail, setDriveEmail] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const folderTouchedRef = useRef(false);

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
    if (mode === 'create') {
      const nam = namTuNgay(ngayBaoGia);
      baoGiaApi.soTiepTheo(nam)
        .then((res) => setSoBaoGia(res.data?.so || generateSoBaoGia(nam)))
        .catch(() => setSoBaoGia(generateSoBaoGia(nam)));
    } else if (initialData) {
      populateFromData(initialData);
    }
  }, [mode, initialData]);

  function populateFromData(bg: BaoGia & { chi_tiet?: BaoGiaChiTiet[] }) {
    setKhachHangId(String(bg.khach_hang_id));
    setKhachHangName((bg as any).ten_cong_ty || (bg as any).khach_hang?.ten_cong_ty || '');
    setKhSearch((bg as any).ten_cong_ty || (bg as any).khach_hang?.ten_cong_ty || '');
    setSoBaoGia(bg.so_bao_gia || '');
    setNgayBaoGia(isoToVN(bg.ngay_bao_gia as string));
    setTenDuAn(bg.ten_du_an || '');
    setPhienBan(bg.phien_ban || 1);
    setMauBaoGia(bg.mau_bao_gia || 'Hapulico');
    setCheDoVanChuyen(Number(bg.che_do_van_chuyen ?? 1));
    setPhiVanChuyen(Number(bg.phi_van_chuyen) || 0);
    setTenFolder((bg as any).ten_folder_du_an || '');
    setIdFolder((bg as any).id_folder_du_an || '');
    const rows = ((bg.chi_tiet as BaoGiaChiTiet[]) || []).map(toChiTietRow);
    setChiTiet(rows.length > 0 ? rows : [emptyChiTiet()]);
  }

  const tenFolderGoiY = useMemo(
    () => buildTenFolderBaoGia(khachHangName, tenDuAn),
    [khachHangName, tenDuAn]
  );

  useEffect(() => {
    if (folderTouchedRef.current || idFolder) return;
    if (tenFolderGoiY) setTenFolder(tenFolderGoiY);
  }, [tenFolderGoiY, idFolder]);

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
        if (field === 'don_gia_von' || field === 'lai_suat_phan_tram') {
          const giaMoi = Math.round(
            calcGiaBanGoiY(Number(updated.don_gia_von), Number(updated.lai_suat_phan_tram)) / 1000
          ) * 1000;
          updated.gia_ban_chua_van_chuyen = giaMoi;
          updated.chi_phi_van_chuyen_phan_bo = 0;
        }
        if (field === 'gia_ban_thuc_te') {
          updated.gia_ban_chua_van_chuyen = Number(value);
          updated.chi_phi_van_chuyen_phan_bo = 0;
          if (updated.don_gia_von > 0) {
            updated.lai_suat_phan_tram = Math.round(
              ((Number(value) - updated.don_gia_von) / updated.don_gia_von) * 100 * 100
            ) / 100;
          }
        }
        return updated;
      })
    );
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
      const giaBan = Math.round(calcGiaBanGoiY(donGiaVon, laiSuat) / 1000) * 1000;
      rows.push({
        tempId: crypto.randomUUID(),
        isNew: true,
        ten_san_pham: tenSanPham,
        don_vi: donVi,
        so_luong: soLuong,
        don_gia_von: donGiaVon,
        lai_suat_phan_tram: laiSuat,
        gia_ban_chua_van_chuyen: giaBan,
        chi_phi_van_chuyen_phan_bo: 0,
        gia_ban_thuc_te: giaBan,
        thue_suat: 10,
      });
    }
    if (rows.length === 0) {
      addToast('warning', 'Không tìm thấy dữ liệu hợp lệ');
      return;
    }
    setChiTiet((prev) => {
      const kept = prev.filter((r) => r.deleted || !isChiTietRowTrong(r.ten_san_pham));
      return [...kept, ...rows];
    });
    setShowExcelPaste(false);
    setExcelText('');
    addToast('success', `Đã thêm ${rows.length} dòng từ Excel`);
  }

  const activeChiTiet = useMemo(() => chiTiet.filter((r) => !r.deleted), [chiTiet]);
  const phiVCNum = Number(phiVanChuyen) || 0;

  const withVCItems = useMemo(
    () => applyVanChuyenToChiTiet(chiTiet.filter((r) => !r.deleted), cheDoVanChuyen, phiVCNum),
    [chiTiet, cheDoVanChuyen, phiVCNum]
  );

  const profitRows = withVCItems.map((r) => ({
    so_luong: r.so_luong,
    gia_ban_thuc_te: giaBanThuanChoLoiNhuan(r, cheDoVanChuyen),
    don_gia_von: r.don_gia_von,
  }));

  const calcItemsForVat = withVCItems.map((r) => ({
    so_luong: r.so_luong,
    gia_ban_thuc_te: r.gia_ban_thuc_te,
    thue_suat: r.thue_suat,
  }));

  const tongTruocVAT = calcTongTruocVAT(calcItemsForVat);
  const tongVAT = calcTongVAT(calcItemsForVat);
  const tongThanhToan = calcTongThanhToan(tongTruocVAT, tongVAT, cheDoVanChuyen === 0 ? phiVCNum : 0);
  const tongGiaVonThuan = activeChiTiet.reduce(
    (s, r) => s + Number(r.so_luong) * Number(r.don_gia_von),
    0
  );
  const loiNhuanGop = calcLoiNhuanGop(profitRows, cheDoVanChuyen, phiVCNum);
  const tyLeLoiNhuan = tongTruocVAT > 0 ? Math.round((loiNhuanGop / tongTruocVAT) * 100) : 0;

  const vat8 = withVCItems
    .filter((r) => r.thue_suat === 8)
    .reduce((s, r) => s + calcVAT(calcThanhTienBan(r.so_luong, r.gia_ban_thuc_te), 8), 0);
  const vat10 = withVCItems
    .filter((r) => r.thue_suat === 10)
    .reduce((s, r) => s + calcVAT(calcThanhTienBan(r.so_luong, r.gia_ban_thuc_te), 10), 0);

  async function handleTaoFolder() {
    if (mode !== 'edit' || !baoGiaId) {
      addToast('warning', 'Folder sẽ được tạo tự động khi bạn lưu báo giá.');
      return;
    }
    setCreatingFolder(true);
    try {
      const result = await baoGiaApi.taoFolder(baoGiaId, {
        ten_folder_du_an: tenFolder.trim() || undefined,
      });
      const folderId = result.data?.id_folder_du_an || result.drive?.id_folder || '';
      if (result.data?.ten_folder_du_an || result.drive?.ten_folder) {
        setTenFolder(result.data?.ten_folder_du_an || result.drive?.ten_folder || tenFolder);
      }
      if (folderId) setIdFolder(folderId);
      if (result.drive?.google_email) setDriveEmail(result.drive.google_email);
      if (result.drive_warning && !result.drive?.id_folder) {
        addToast('error', result.drive_warning);
        return;
      }
      addToast('success', `Đã tạo thư mục Drive: ${result.drive?.ten_folder || result.data?.ten_folder_du_an}`);
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Không tạo được thư mục Drive');
    } finally {
      setCreatingFolder(false);
    }
  }

  async function handleSave() {
    if (!khachHangId) { addToast('warning', 'Vui lòng chọn khách hàng'); return; }
    if (!soBaoGia.trim()) { addToast('warning', 'Vui lòng nhập số báo giá'); return; }
    if (!isValidVNDate(ngayBaoGia)) { addToast('warning', 'Ngày báo giá không hợp lệ (dd/mm/yyyy)'); return; }
    const validChiTiet = activeChiTiet.filter((r) => (r.ten_san_pham || '').trim());
    if (validChiTiet.length === 0) { addToast('warning', 'Vui lòng thêm ít nhất một sản phẩm'); return; }

    // Dùng activeChiTiet (không withVCItems) - chỉ lưu giá gốc, VC tính lại khi xuất
    const validWithVC = activeChiTiet.filter((r) => (r.ten_san_pham || '').trim());

    const ngayISO = vnToISO(ngayBaoGia);
    const nam = namTuNgay(ngayBaoGia, ngayISO);
    try {
      const dup = await baoGiaApi.checkSoTrung({
        so_bao_gia: soBaoGia.trim(),
        nam,
        ngay_bao_gia: ngayISO,
        exclude_id: mode === 'edit' && baoGiaId ? baoGiaId : undefined,
      });
      if (dup.exists) {
        addToast('error', `Số báo giá "${soBaoGia.trim()}" đã tồn tại trong năm ${nam}. Vui lòng nhập số khác.`);
        return;
      }
    } catch (err) {
      console.error('Kiem tra so bao gia:', err);
      addToast('error', err instanceof Error ? err.message : 'Không thể kiểm tra số báo giá');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        so_bao_gia: soBaoGia.trim(),
        ngay_bao_gia: ngayISO,
        khach_hang_id: Number(khachHangId),
        ten_du_an: tenDuAn.trim() || null,
        phien_ban: phienBan,
        mau_bao_gia: mauBaoGia || null,
        che_do_van_chuyen: cheDoVanChuyen,
        phi_van_chuyen: phiVCNum,
        ten_folder_du_an: tenFolder.trim() || null,
        id_folder_du_an: idFolder || null,
        chi_tiet: validWithVC.map((r) => {
          const vcRow = withVCItems.find((x) => x.tempId === r.tempId) ?? r;
          return {
            ten_san_pham: (r.ten_san_pham || '').trim(),
            don_vi: (r.don_vi || '').trim(),
            so_luong: r.so_luong,
            don_gia_von: r.don_gia_von,
            lai_suat_phan_tram: r.lai_suat_phan_tram,
            gia_ban_chua_van_chuyen: r.gia_ban_chua_van_chuyen,
            chi_phi_van_chuyen_phan_bo: vcRow.chi_phi_van_chuyen_phan_bo,
            gia_ban_thuc_te: vcRow.gia_ban_thuc_te,
            thue_suat: r.thue_suat,
          };
        }),
      };

      if (mode === 'create') {
        const result = await baoGiaApi.create(payload);
        if (result.data?.ten_folder_du_an) setTenFolder(result.data.ten_folder_du_an);
        if (result.data?.id_folder_du_an) setIdFolder(result.data.id_folder_du_an);
        if (result.drive?.google_email) setDriveEmail(result.drive.google_email);
        if (result.drive_warning) {
          addToast('warning', result.drive_warning);
        } else if (result.drive?.ten_folder) {
          addToast('success', `Đã tạo thư mục Drive: ${result.drive.ten_folder}`);
        }
        addToast('success', 'Tạo báo giá thành công');
        onSaved(result.data.id);
      } else {
        const result = await baoGiaApi.update(baoGiaId!, payload);
        if (result.data?.ten_folder_du_an) setTenFolder(result.data.ten_folder_du_an);
        if (result.data?.id_folder_du_an) setIdFolder(result.data.id_folder_du_an);
        if (result.drive?.google_email) setDriveEmail(result.drive.google_email);
        if (result.drive_warning) {
          addToast('warning', result.drive_warning);
        } else if (result.drive?.created && result.drive?.ten_folder) {
          addToast('success', `Đã tạo thư mục Drive: ${result.drive.ten_folder}`);
        }
        addToast('success', 'Cập nhật báo giá thành công');
        onSaved(baoGiaId!);
      }
    } catch (err) {
      console.error('Loi luu bao gia:', err);
      const msg = err instanceof Error ? err.message : '';
      addToast(
        'error',
        msg || (mode === 'create' ? 'Không thể tạo báo giá' : 'Không thể cập nhật báo giá')
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <EntityFormMetaSection>
        <EntityFormMetaRow>
          <EntityFormField label="Số báo giá" required className="sm:col-span-1 lg:col-span-2">
            <input
              type="text"
              value={soBaoGia}
              onChange={(e) => setSoBaoGia(e.target.value)}
              className="input-field text-sm"
              placeholder="01/BG/2026"
            />
          </EntityFormField>

          <EntityFormField label="Phiên bản" className="sm:col-span-1 lg:col-span-1">
            <EntityFormVersionBadge value={phienBan} />
          </EntityFormField>

          <EntityFormField label="Ngày báo giá" className="sm:col-span-1 lg:col-span-2">
            <VnDateInput value={ngayBaoGia} onChange={setNgayBaoGia} />
          </EntityFormField>

          <EntityFormField label="Khách hàng" required className="sm:col-span-2 lg:col-span-5 relative">
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

          <EntityFormField label="Tên dự án" className="sm:col-span-2 lg:col-span-2">
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
          <EntityFormField label="Thư mục Drive" className="sm:col-span-2 lg:col-span-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={tenFolder}
                onChange={(e) => {
                  folderTouchedRef.current = true;
                  setTenFolder(e.target.value);
                }}
                className="input-field text-sm flex-1 min-w-0"
                placeholder={tenFolderGoiY || 'Tên folder...'}
              />
              {idFolder && !creatingFolder ? (
                <a
                  href={driveFolderUrl(idFolder, driveEmail)}
                  target="_blank"
                  rel="noreferrer"
                  className="h-10 shrink-0 px-3 border border-gray-200 rounded-lg text-xs font-semibold text-gray-600 hover:bg-gray-50 inline-flex items-center gap-1"
                  title={driveEmail ? `Mở bằng tài khoản ${driveEmail}` : 'Mở trên Google Drive'}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Mở
                </a>
              ) : null}
              <button
                type="button"
                onClick={handleTaoFolder}
                disabled={creatingFolder}
                className="h-10 shrink-0 px-4 bg-primary-600 text-white rounded-lg text-xs font-semibold hover:bg-primary-700 transition-colors disabled:opacity-60"
              >
                {creatingFolder ? 'Đang tạo...' : idFolder ? 'Tạo lại' : 'Tạo'}
              </button>
            </div>
            <p className="mt-1 text-[11px] text-gray-400">
              00 Phạm Gia / 00 Báo giá / {namTuNgay(ngayBaoGia)} / STT 2 số từ folder Drive / {tenFolder.trim() || tenFolderGoiY || '...'}
              {driveEmail ? ` · Drive: ${driveEmail}` : ''}
            </p>
          </EntityFormField>

          <EntityFormField label="Chế độ vận chuyển" className="sm:col-span-1 lg:col-span-3">
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

          <EntityFormField label="Mẫu xuất Sheet" className="sm:col-span-2 lg:col-span-3">
            <select
              value={mauBaoGia}
              onChange={(e) => setMauBaoGia(e.target.value)}
              className="select-field text-sm w-full font-medium text-primary-700"
            >
              <option value="Hapulico">Mẫu Hapulico</option>
              <option value="PhamGia">Mẫu Phạm Gia</option>
              <option value="Litec">Mẫu Litec</option>
            </select>
          </EntityFormField>
        </EntityFormMetaRow>
      </EntityFormMetaSection>

      {/* Chi tiet table */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold text-gray-600 uppercase tracking-widest">Danh mục sản phẩm / thiết bị</span>
          <button
            onClick={() => setShowExcelPaste(true)}
            className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg text-xs font-bold hover:bg-green-700 transition-colors shadow-sm"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            DÁN TỪ EXCEL
          </button>
        </div>

        {showExcelPaste && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <ClipboardPaste className="w-4 h-4 text-green-700" />
              <span className="text-sm font-semibold text-green-800">Dán dữ liệu từ Excel</span>
              <span className="text-xs text-green-600 ml-2">— Cột 1: Tên SP · Cột 3: Đơn vị · Cột 4: SL · Cột 5: Giá vốn · Xóa dòng trống rồi thêm vào cuối</span>
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
              <button onClick={handlePasteFromExcel}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 transition-colors">
                <RefreshCw className="w-3.5 h-3.5" />
                Nhập dữ liệu
              </button>
              <button onClick={() => { setShowExcelPaste(false); setExcelText(''); }}
                className="px-4 py-2 bg-white text-gray-600 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors">
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
                <th className="px-2 py-2.5 text-right text-xs font-bold text-gray-600 w-20">LÃI(%)</th>
                <th className="px-2 py-2.5 text-right text-xs font-bold text-gray-600 w-28">GIÁ BÁN (1K)</th>
                <th className="px-2 py-2.5 text-right text-xs font-bold text-gray-600 w-28">THÀNH TIỀN</th>
                <th className="px-2 py-2.5 text-center text-xs font-bold text-gray-600 w-20">VAT</th>
                <th className="w-16"></th>
              </tr>
            </thead>
            <tbody>
              {activeChiTiet.map((row, idx) => {
                const vcRow = withVCItems.find((x) => x.tempId === row.tempId) ?? row;
                const thanhTien = calcThanhTienBan(vcRow.so_luong, vcRow.gia_ban_thuc_te);
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
                      <NumInput value={row.lai_suat_phan_tram} onChange={(v) => updateChiTiet(row.tempId, 'lai_suat_phan_tram', v)}
                        className={`${inputCls} text-right text-green-700 font-medium`} min={0} isInteger format="number" />
                    </td>
                    <td className="px-1 py-1">
                      {cheDoVanChuyen === 1 ? (
                        <div className="text-right">
                          <div className="px-2 py-1 text-sm font-semibold text-blue-700">
                            {formatVND(vcRow.gia_ban_thuc_te)}
                          </div>
                          {vcRow.gia_ban_thuc_te !== row.gia_ban_chua_van_chuyen && (
                            <div className="text-[10px] text-orange-500 leading-none">
                              gốc: {formatVND(row.gia_ban_chua_van_chuyen)}
                            </div>
                          )}
                        </div>
                      ) : (
                        <NumInput value={row.gia_ban_chua_van_chuyen} onChange={(v) => updateChiTiet(row.tempId, 'gia_ban_thuc_te', v)}
                          className={`${inputCls} text-right text-blue-700`} min={0} isInteger format="money" />
                      )}
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
          + THÊM DÒNG MỚI
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
          {saving ? 'Đang lưu...' : 'LƯU BÁO GIÁ'}
        </button>
      </div>
    </div>
  );
}
