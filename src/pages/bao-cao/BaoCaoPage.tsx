import { useState, useEffect, useCallback } from 'react';
import { baoGiaApi, hopDongApi, phieuGiaoHangApi, dongTienApi, khachHangApi, nhaCungCapApi, taiKhoanApi, loaiChiPhiApi, chiPhiApi, hopDongMuaApi, vatTuApi } from '../../lib/api';
import { formatVND, formatDate, formatNumber, formatPercent, trangThaiHopDongLabel, trangThaiHopDongColor } from '../../lib/utils';
import EmptyState from '../../components/ui/EmptyState';
import { BarChart3, FileText, BookOpen, Receipt, Banknote, CircleDollarSign, Package } from 'lucide-react';
import type { KhachHang, NhaCungCap, TaiKhoan, LoaiChiPhi, VatTu } from '../../types';

// ─── Tab type ────────────────────────────────────────────────────────────────
type ReportTab = 'bao-gia' | 'hop-dong' | 'cong-no' | 'dong-tien' | 'chi-phi' | 'mua-hang';

const TABS: { key: ReportTab; label: string; icon: typeof BarChart3 }[] = [
  { key: 'bao-gia', label: 'Báo giá', icon: FileText },
  { key: 'hop-dong', label: 'Hợp đồng', icon: BookOpen },
  { key: 'cong-no', label: 'Công nợ', icon: Receipt },
  { key: 'dong-tien', label: 'Dòng tiền', icon: Banknote },
  { key: 'chi-phi', label: 'Chi phí', icon: CircleDollarSign },
  { key: 'mua-hang', label: 'Mua hàng', icon: Package },
];

// ─── Bao gia row ──────────────────────────────────────────────────────────────
interface BaoGiaRow {
  id: number;
  so_bao_gia: string;
  ngay_bao_gia: string;
  khach_hang_id: number;
  ten_du_an: string | null;
  tong_gia_tri: number;
  hop_dong_id: number | null;
  ten_cong_ty: string;
}

// ─── Hop dong row ────────────────────────────────────────────────────────────
interface HopDongRow {
  id: number;
  so_hop_dong: string;
  ngay_hop_dong: string;
  khach_hang_id: number;
  ten_du_an: string | null;
  trang_thai: string;
  tong_gia_tri: number;
  phi_van_chuyen: number;
  ten_cong_ty: string;
}

// ─── Cong no row ─────────────────────────────────────────────────────────────
interface CongNoRow {
  khach_hang_id: number;
  ten_cong_ty: string;
  tong_ghi_no: number;
  tong_da_thu: number;
  con_phai_thu: number;
}

// ─── Dong tien row ────────────────────────────────────────────────────────────
interface DongTienRow {
  id: number;
  ngay_gio_giao_dich: string;
  mo_ta_giao_dich: string;
  ten_tai_khoan: string;
  ghi_no: number;
  ghi_co: number;
}

// ─── Chi phi row ─────────────────────────────────────────────────────────────
interface ChiPhiGroupRow {
  loai_chi_phi_id: number;
  ten_loai_chi_phi: string;
  chi_tiet: { ten_chi_phi: string; so_tien: number }[];
  tong_tien: number;
}

// ─── Mua hang row ────────────────────────────────────────────────────────────
interface MuaHangRow {
  nha_cung_cap_id: number;
  ten_nha_cung_cap: string;
  so_hop_dong_mua: number;
  tong_gia_tri: number;
  da_thanh_toan: number;
}

// ─── Main component ──────────────────────────────────────────────────────────
export default function BaoCaoPage() {
  const [activeTab, setActiveTab] = useState<ReportTab>('bao-gia');
  const [loading, setLoading] = useState(false);

  // ─── Lookup lists ──────────────────────────────────────────────────────────
  const [khachHangList, setKhachHangList] = useState<KhachHang[]>([]);
  const [nhaCungCapList, setNhaCungCapList] = useState<NhaCungCap[]>([]);
  const [taiKhoanList, setTaiKhoanList] = useState<TaiKhoan[]>([]);
  const [loaiChiPhiList, setLoaiChiPhiList] = useState<LoaiChiPhi[]>([]);

  // ─── Bao gia state ─────────────────────────────────────────────────────────
  const [baoGiaData, setBaoGiaData] = useState<BaoGiaRow[]>([]);
  const [baoGiaMonth, setBaoGiaMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [baoGiaKhachHang, setBaoGiaKhachHang] = useState('');
  const [baoGiaTongGiaTri, setBaoGiaTongGiaTri] = useState(0);
  const [baoGiaTyLeChuyenHD, setBaoGiaTyLeChuyenHD] = useState(0);

  // ─── Hop dong state ────────────────────────────────────────────────────────
  const [hopDongData, setHopDongData] = useState<HopDongRow[]>([]);
  const [hopDongMonth, setHopDongMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [hopDongKhachHang, setHopDongKhachHang] = useState('');
  const [hopDongTrangThai, setHopDongTrangThai] = useState('');
  const [hopDongTongGiaTri, setHopDongTongGiaTri] = useState(0);
  const [hopDongCountHieuLuc, setHopDongCountHieuLuc] = useState(0);
  const [hopDongCountThanhLy, setHopDongCountThanhLy] = useState(0);
  const [hopDongCountHuy, setHopDongCountHuy] = useState(0);

  // ─── Cong no state ─────────────────────────────────────────────────────────
  const [congNoData, setCongNoData] = useState<CongNoRow[]>([]);
  const [congNoKhachHang, setCongNoKhachHang] = useState('');
  const [congNoTongPhaiThu, setCongNoTongPhaiThu] = useState(0);

  // ─── Dong tien state ───────────────────────────────────────────────────────
  const [dongTienData, setDongTienData] = useState<DongTienRow[]>([]);
  const [dongTienMonth, setDongTienMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [dongTienTaiKhoan, setDongTienTaiKhoan] = useState('');
  const [dongTienKhachHang, setDongTienKhachHang] = useState('');
  const [dongTienNhaCungCap, setDongTienNhaCungCap] = useState('');
  const [dongTienTongThu, setDongTienTongThu] = useState(0);
  const [dongTienTongChi, setDongTienTongChi] = useState(0);
  const [dongTienSoDu, setDongTienSoDu] = useState(0);

  // ─── Chi phi state ─────────────────────────────────────────────────────────
  const [chiPhiData, setChiPhiData] = useState<ChiPhiGroupRow[]>([]);
  const [chiPhiMonth, setChiPhiMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [chiPhiLoai, setChiPhiLoai] = useState('');
  const [chiPhiTongTien, setChiPhiTongTien] = useState(0);
  const [chiPhiTopLonNhat, setChiPhiTopLonNhat] = useState<{ ten: string; so_tien: number }[]>([]);

  // ─── Mua hang state ────────────────────────────────────────────────────────
  const [muaHangData, setMuaHangData] = useState<MuaHangRow[]>([]);
  const [muaHangNhaCungCap, setMuaHangNhaCungCap] = useState('');
  const [muaHangMonth, setMuaHangMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [vatTuTonKho, setVatTuTonKho] = useState<VatTu[]>([]);

  // ─── Load lookup data ──────────────────────────────────────────────────────
  useEffect(() => {
    khachHangApi.list({ limit: 1000 }).then(({ data }) => { setKhachHangList(data as KhachHang[]); });
    nhaCungCapApi.list({ limit: 1000 }).then(({ data }) => { setNhaCungCapList(data as NhaCungCap[]); });
    taiKhoanApi.list().then(({ data }) => { setTaiKhoanList(data as TaiKhoan[]); });
    loaiChiPhiApi.list().then(({ data }) => { setLoaiChiPhiList(data as LoaiChiPhi[]); });
  }, []);

  // ─── Fetch bao gia report ──────────────────────────────────────────────────
  const fetchBaoGia = useCallback(async () => {
    setLoading(true);
    try {
      const [year, month] = baoGiaMonth.split('-');
      const startDate = `${year}-${month}-01`;
      const endDay = new Date(Number(year), Number(month), 0).getDate();
      const endDate = `${year}-${month}-${String(endDay).padStart(2, '0')}`;

      const { data: baoGiaRows } = await baoGiaApi.list({
        date_from: startDate,
        date_to: endDate,
        khach_hang_id: baoGiaKhachHang || undefined,
        limit: 99999,
      });

      const rows = baoGiaRows || [];

      // Fetch chi tiet for tong gia tri
      let chiTietMap: Record<number, number> = {};

      if (rows.length > 0) {
        // Each bao_gia may have chi_tiet embedded
        for (const bg of rows) {
          const chiTiet = (bg as any).chi_tiet || [];
          let total = 0;
          for (const ct of chiTiet) {
            const thanhTien = (ct.so_luong || 0) * (ct.gia_ban_thuc_te || 0);
            const vat = thanhTien * (ct.thue_suat || 0) / 100;
            total += thanhTien + vat;
          }
          chiTietMap[bg.id] = total;
        }
      }

      const mapped: BaoGiaRow[] = rows.map((r: Record<string, unknown>) => {
        const kh = r.khach_hang as KhachHang | undefined;
        return {
          id: r.id as number,
          so_bao_gia: r.so_bao_gia as string,
          ngay_bao_gia: r.ngay_bao_gia as string,
          khach_hang_id: r.khach_hang_id as number,
          ten_du_an: (r.ten_du_an as string) || null,
          tong_gia_tri: chiTietMap[r.id as number] || 0,
          hop_dong_id: (r.hop_dong_id as number | null) || null,
          ten_cong_ty: kh?.ten_cong_ty || '--',
        };
      });

      setBaoGiaData(mapped);

      const tongGiaTri = mapped.reduce((sum, r) => sum + r.tong_gia_tri, 0);
      setBaoGiaTongGiaTri(tongGiaTri);

      const tongSo = mapped.length;
      const soChuyenHD = mapped.filter((r) => r.hop_dong_id !== null).length;
      setBaoGiaTyLeChuyenHD(tongSo > 0 ? Math.round((soChuyenHD / tongSo) * 100) : 0);
    } catch (err) {
      console.error('Lỗi tải báo cáo báo giá:', err);
    } finally {
      setLoading(false);
    }
  }, [baoGiaMonth, baoGiaKhachHang]);

  // ─── Fetch hop dong report ─────────────────────────────────────────────────
  const fetchHopDong = useCallback(async () => {
    setLoading(true);
    try {
      const [year, month] = hopDongMonth.split('-');
      const startDate = `${year}-${month}-01`;
      const endDay = new Date(Number(year), Number(month), 0).getDate();
      const endDate = `${year}-${month}-${String(endDay).padStart(2, '0')}`;

      const { data: hopDongRows } = await hopDongApi.list({
        date_from: startDate,
        date_to: endDate,
        khach_hang_id: hopDongKhachHang || undefined,
        trang_thai: hopDongTrangThai || undefined,
        limit: 99999,
      });

      const rows = hopDongRows || [];

      // Fetch chi tiet for tong gia tri
      const hopDongIds = rows.map((r: { id: number }) => r.id);
      let chiTietMap: Record<number, number> = {};

      if (hopDongIds.length > 0) {
        // Each hop_dong may have chi_tiet embedded
        for (const hd of rows) {
          const chiTiet = (hd as any).chi_tiet || [];
          let total = 0;
          for (const ct of chiTiet) {
            const thanhTien = (ct.so_luong || 0) * (ct.gia_hop_dong || 0);
            const vat = thanhTien * (ct.thue_suat || 0) / 100;
            total += thanhTien + vat;
          }
          chiTietMap[hd.id] = total;
        }
      }

      const mapped: HopDongRow[] = rows.map((r: Record<string, unknown>) => {
        const kh = r.khach_hang as KhachHang | undefined;
        const phiVanChuyen = (r.phi_van_chuyen as number) || 0;
        return {
          id: r.id as number,
          so_hop_dong: r.so_hop_dong as string,
          ngay_hop_dong: r.ngay_hop_dong as string,
          khach_hang_id: r.khach_hang_id as number,
          ten_du_an: (r.ten_du_an as string) || null,
          trang_thai: r.trang_thai as string,
          phi_van_chuyen: phiVanChuyen,
          tong_gia_tri: (chiTietMap[r.id as number] || 0) + phiVanChuyen,
          ten_cong_ty: kh?.ten_cong_ty || '--',
        };
      });

      setHopDongData(mapped);

      const tongGiaTri = mapped.reduce((sum, r) => sum + r.tong_gia_tri, 0);
      setHopDongTongGiaTri(tongGiaTri);

      setHopDongCountHieuLuc(mapped.filter((r) => r.trang_thai === 'Hieu luc').length);
      setHopDongCountThanhLy(mapped.filter((r) => r.trang_thai === 'Thanh ly').length);
      setHopDongCountHuy(mapped.filter((r) => r.trang_thai === 'Huy').length);
    } catch (err) {
      console.error('Lỗi tải báo cáo hợp đồng:', err);
    } finally {
      setLoading(false);
    }
  }, [hopDongMonth, hopDongKhachHang, hopDongTrangThai]);

  // ─── Fetch cong no report ──────────────────────────────────────────────────
  const fetchCongNo = useCallback(async () => {
    setLoading(true);
    try {
      // Get all phieu_giao_hang grouped by khach_hang_id
      const { data: phieuData } = await phieuGiaoHangApi.list({
        khach_hang_id: congNoKhachHang || undefined,
        limit: 99999,
      });

      // Get all dong_tien payments (ghi_no) grouped by khach_hang_id
      const { data: dongTienData } = await dongTienApi.list({
        khach_hang_id: congNoKhachHang || undefined,
        limit: 99999,
      });

      // Group phieu_giao_hang by khach_hang_id
      const phieuByKhachHang: Record<number, number> = {};
      (phieuData || []).forEach((p) => {
        if (p.khach_hang_id) {
          phieuByKhachHang[p.khach_hang_id] = (phieuByKhachHang[p.khach_hang_id] || 0) + (p.gia_tri_ghi_no || 0);
        }
      });

      // Group dong_tien by khach_hang_id (only those with khach_hang_id)
      const thanhToanByKhachHang: Record<number, number> = {};
      (dongTienData || []).filter((d) => d.khach_hang_id != null).forEach((d) => {
        if (d.khach_hang_id) {
          thanhToanByKhachHang[d.khach_hang_id] = (thanhToanByKhachHang[d.khach_hang_id] || 0) + (d.ghi_no || 0);
        }
      });

      // Get all unique khach_hang_ids
      const allIds = [...new Set([
        ...Object.keys(phieuByKhachHang).map(Number),
        ...Object.keys(thanhToanByKhachHang).map(Number),
      ])];

      // Use khachHangList for names
      const khMap = Object.fromEntries(khachHangList.map((kh) => [kh.id, kh.ten_cong_ty]));

      const result: CongNoRow[] = allIds.map((id) => ({
        khach_hang_id: id,
        ten_cong_ty: khMap[id] || '--',
        tong_ghi_no: phieuByKhachHang[id] || 0,
        tong_da_thu: thanhToanByKhachHang[id] || 0,
        con_phai_thu: (phieuByKhachHang[id] || 0) - (thanhToanByKhachHang[id] || 0),
      }));

      result.sort((a, b) => b.con_phai_thu - a.con_phai_thu);
      setCongNoData(result);

      const tongPhaiThu = result.reduce((sum, r) => sum + r.con_phai_thu, 0);
      setCongNoTongPhaiThu(tongPhaiThu);
    } catch (err) {
      console.error('Lỗi tải báo cáo công nợ:', err);
    } finally {
      setLoading(false);
    }
  }, [congNoKhachHang, khachHangList]);

  // ─── Fetch dong tien report ────────────────────────────────────────────────
  const fetchDongTien = useCallback(async () => {
    setLoading(true);
    try {
      const [year, month] = dongTienMonth.split('-');
      const startDate = `${year}-${month}-01`;
      const endDay = new Date(Number(year), Number(month), 0).getDate();
      const endDate = `${year}-${month}-${String(endDay).padStart(2, '0')}`;

      const { data: rows } = await dongTienApi.list({
        date_from: startDate,
        date_to: endDate,
        tai_khoan_id: dongTienTaiKhoan || undefined,
        khach_hang_id: dongTienKhachHang || undefined,
        nha_cung_cap_id: dongTienNhaCungCap || undefined,
        limit: 99999,
      });

      const tkMap = Object.fromEntries(taiKhoanList.map((tk) => [tk.id, tk.ten_tai_khoan]));

      const mapped: DongTienRow[] = (rows || []).map((r: Record<string, unknown>) => {
        const tk = r.tai_khoan as TaiKhoan | undefined;
        return {
          id: r.id as number,
          ngay_gio_giao_dich: (r.ngay_gio_giao_dich as string) || '',
          mo_ta_giao_dich: (r.mo_ta_giao_dich as string) || '',
          ten_tai_khoan: tk?.ten_tai_khoan || tkMap[r.tai_khoan_id as number] || '--',
          ghi_no: (r.ghi_no as number) || 0,
          ghi_co: (r.ghi_co as number) || 0,
        };
      });

      setDongTienData(mapped);

      const tongThu = mapped.reduce((sum, r) => sum + r.ghi_no, 0);
      const tongChi = mapped.reduce((sum, r) => sum + r.ghi_co, 0);
      setDongTienTongThu(tongThu);
      setDongTienTongChi(tongChi);
      setDongTienSoDu(tongThu - tongChi);
    } catch (err) {
      console.error('Lỗi tải báo cáo dòng tiền:', err);
    } finally {
      setLoading(false);
    }
  }, [dongTienMonth, dongTienTaiKhoan, dongTienKhachHang, dongTienNhaCungCap, taiKhoanList]);

  // ─── Fetch chi phi report ──────────────────────────────────────────────────
  const fetchChiPhi = useCallback(async () => {
    setLoading(true);
    try {
      const [year, month] = chiPhiMonth.split('-');
      const startDate = `${year}-${month}-01`;
      const endDay = new Date(Number(year), Number(month), 0).getDate();
      const endDate = `${year}-${month}-${String(endDay).padStart(2, '0')}`;

      const { data: rows } = await dongTienApi.list({
        date_from: startDate,
        date_to: endDate,
        loai_chi_phi_id: chiPhiLoai || undefined,
        limit: 99999,
      });

      // Filter to only chi phi records (ghi_co > 0 and loai_chi_phi_id not null)
      const records = (rows || []).filter((r) => r.ghi_co > 0 && r.loai_chi_phi_id != null);

      // Group by loai_chi_phi_id, then by chi_phi_id
      const byLoai: Record<number, { chi_phi: Record<number, number>; tong: number }> = {};

      for (const r of records) {
        const loaiId = r.loai_chi_phi_id as number;
        const chiPhiId = r.chi_phi_id as number | null;
        const soTien = (r.ghi_co as number) || 0;

        if (!byLoai[loaiId]) {
          byLoai[loaiId] = { chi_phi: {}, tong: 0 };
        }
        byLoai[loaiId].tong += soTien;
        if (chiPhiId) {
          byLoai[loaiId].chi_phi[chiPhiId] = (byLoai[loaiId].chi_phi[chiPhiId] || 0) + soTien;
        }
      }

      // Use loaiChiPhiList for names (already loaded as lookup data)
      const loaiIds = Object.keys(byLoai).map(Number);
      const loaiMap = Object.fromEntries(loaiChiPhiList.map((l) => [l.id, l.ten_loai_chi_phi]));

      // Fetch chi_phi names
      const allChiPhiIds = [...new Set(loaiIds.flatMap((id) => Object.keys(byLoai[id].chi_phi).map(Number)))];
      let chiPhiMap: Record<number, string> = {};
      if (allChiPhiIds.length > 0) {
        const { data: chiPhiNames } = await chiPhiApi.list();
        chiPhiMap = Object.fromEntries((chiPhiNames || []).map((c) => [c.id, c.ten_chi_phi]));
      }

      const result: ChiPhiGroupRow[] = loaiIds.map((id) => ({
        loai_chi_phi_id: id,
        ten_loai_chi_phi: loaiMap[id] || '--',
        chi_tiet: Object.entries(byLoai[id].chi_phi).map(([cpId, soTien]) => ({
          ten_chi_phi: chiPhiMap[Number(cpId)] || '--',
          so_tien: soTien,
        })),
        tong_tien: byLoai[id].tong,
      }));

      result.sort((a, b) => b.tong_tien - a.tong_tien);
      setChiPhiData(result);

      const tongTien = result.reduce((sum, r) => sum + r.tong_tien, 0);
      setChiPhiTongTien(tongTien);

      // Top chi phi lon nhat - flatten all chi_phi items
      const allItems: { ten: string; so_tien: number }[] = [];
      for (const group of result) {
        for (const ct of group.chi_tiet) {
          allItems.push({ ten: ct.ten_chi_phi, so_tien: ct.so_tien });
        }
      }
      allItems.sort((a, b) => b.so_tien - a.so_tien);
      setChiPhiTopLonNhat(allItems.slice(0, 5));
    } catch (err) {
      console.error('Lỗi tải báo cáo chi phí:', err);
    } finally {
      setLoading(false);
    }
  }, [chiPhiMonth, chiPhiLoai, loaiChiPhiList]);

  // ─── Fetch mua hang report ─────────────────────────────────────────────────
  const fetchMuaHang = useCallback(async () => {
    setLoading(true);
    try {
      const [year, month] = muaHangMonth.split('-');
      const startDate = `${year}-${month}-01`;
      const endDay = new Date(Number(year), Number(month), 0).getDate();
      const endDate = `${year}-${month}-${String(endDay).padStart(2, '0')}`;

      const { data: hopDongMuaRows } = await hopDongMuaApi.list({
        date_from: startDate,
        date_to: endDate,
        nha_cung_cap_id: muaHangNhaCungCap || undefined,
        limit: 99999,
      });

      const rows = hopDongMuaRows || [];

      // Group by nha_cung_cap_id
      const byNcc: Record<number, { so_hop_dong: number; tong_gia_tri: number; ids: number[] }> = {};
      for (const r of rows) {
        const nccId = r.nha_cung_cap_id as number;
        if (!byNcc[nccId]) {
          byNcc[nccId] = { so_hop_dong: 0, tong_gia_tri: 0, ids: [] };
        }
        byNcc[nccId].so_hop_dong += 1;
        byNcc[nccId].tong_gia_tri += (r.tong_gia_tri as number) || 0;
        byNcc[nccId].ids.push(r.id as number);
      }

      // Use nhaCungCapList for names (already loaded as lookup data)
      const nccIds = Object.keys(byNcc).map(Number);
      const nccMap = Object.fromEntries(nhaCungCapList.map((n) => [n.id, n.ten_nha_cung_cap]));

      // Fetch da thanh toan (dong_tien ghi_co with hop_dong_mua_id)
      const allHdmIds = Object.values(byNcc).flatMap((v) => v.ids);
      let thanhToanMap: Record<number, number> = {};
      if (allHdmIds.length > 0) {
        // Fetch dong_tien with these hop_dong_mua_ids and filter client-side
        const { data: dongTienRows } = await dongTienApi.list({
          limit: 99999,
        });

        if (dongTienRows) {
          for (const dt of dongTienRows) {
            const hdmId = dt.hop_dong_mua_id;
            if (hdmId && allHdmIds.includes(hdmId) && (dt.ghi_co || 0) > 0) {
              thanhToanMap[hdmId] = (thanhToanMap[hdmId] || 0) + (dt.ghi_co || 0);
            }
          }
        }
      }

      const result: MuaHangRow[] = nccIds.map((id) => {
        const daThanhToan = byNcc[id].ids.reduce((sum, hdmId) => sum + (thanhToanMap[hdmId] || 0), 0);
        return {
          nha_cung_cap_id: id,
          ten_nha_cung_cap: nccMap[id] || '--',
          so_hop_dong_mua: byNcc[id].so_hop_dong,
          tong_gia_tri: byNcc[id].tong_gia_tri,
          da_thanh_toan: daThanhToan,
        };
      });

      result.sort((a, b) => b.tong_gia_tri - a.tong_gia_tri);
      setMuaHangData(result);

      // Fetch vat tu ton kho
      const { data: vatTuData } = await vatTuApi.list({ limit: 99999 });
      const vatTuWithStock = (vatTuData || []).filter((vt) => (vt.ton_kho || 0) > 0);
      setVatTuTonKho(vatTuWithStock as VatTu[]);
    } catch (err) {
      console.error('Lỗi tải báo cáo mua hàng:', err);
    } finally {
      setLoading(false);
    }
  }, [muaHangMonth, muaHangNhaCungCap, nhaCungCapList]);

  // ─── Fetch data on tab change ───────────────────────────────────────────────
  useEffect(() => {
    if (activeTab === 'bao-gia') fetchBaoGia();
    else if (activeTab === 'hop-dong') fetchHopDong();
    else if (activeTab === 'cong-no') fetchCongNo();
    else if (activeTab === 'dong-tien') fetchDongTien();
    else if (activeTab === 'chi-phi') fetchChiPhi();
    else if (activeTab === 'mua-hang') fetchMuaHang();
  }, [activeTab, fetchBaoGia, fetchHopDong, fetchCongNo, fetchDongTien, fetchChiPhi, fetchMuaHang]);

  // ─── Month selector helper ─────────────────────────────────────────────────
  function getMonthOptions(): { value: string; label: string }[] {
    const options: { value: string; label: string }[] = [];
    const now = new Date();
    for (let i = 0; i < 24; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = `Tháng ${d.getMonth() + 1}/${d.getFullYear()}`;
      options.push({ value, label });
    }
    return options;
  }

  const monthOptions = getMonthOptions();

  // ─── Loading spinner ───────────────────────────────────────────────────────
  function renderLoading() {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
        <span className="ml-2 text-sm text-gray-500">Đang tải...</span>
      </div>
    );
  }

  // ─── RENDER: Bao gia tab ────────────────────────────────────────────────────
  function renderBaoGia() {
    return (
      <div className="space-y-6">
        {/* Filters */}
        <div className="flex items-end gap-4 flex-wrap">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Tháng/Năm</label>
            <select
              value={baoGiaMonth}
              onChange={(e) => setBaoGiaMonth(e.target.value)}
              className="select-field"
            >
              {monthOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Khách hàng</label>
            <select
              value={baoGiaKhachHang}
              onChange={(e) => setBaoGiaKhachHang(e.target.value)}
              className="select-field"
            >
              <option value="">Tất cả</option>
              {khachHangList.map((kh) => (
                <option key={kh.id} value={kh.id}>{kh.ten_cong_ty}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                <FileText className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Tổng giá trị báo giá</p>
                <p className="text-lg font-bold text-gray-900">{formatVND(baoGiaTongGiaTri)}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Tỷ lệ chuyển thành HĐ</p>
                <p className="text-lg font-bold text-gray-900">{formatPercent(baoGiaTyLeChuyenHD)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Table */}
        {loading ? renderLoading() : baoGiaData.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-header">Khách hàng</th>
                  <th className="table-header">Số báo giá</th>
                  <th className="table-header">Ngày</th>
                  <th className="table-header">Dự án</th>
                  <th className="table-header text-right">Tổng giá trị</th>
                  <th className="table-header">Đã chuyển HĐ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {baoGiaData.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                    <td className="table-cell">
                      <span className="font-medium text-gray-900">{row.ten_cong_ty}</span>
                    </td>
                    <td className="table-cell text-gray-700">{row.so_bao_gia}</td>
                    <td className="table-cell text-gray-500">{formatDate(row.ngay_bao_gia)}</td>
                    <td className="table-cell text-gray-700">{row.ten_du_an || '--'}</td>
                    <td className="table-cell text-right whitespace-nowrap font-semibold text-gray-900">
                      {formatVND(row.tong_gia_tri)}
                    </td>
                    <td className="table-cell">
                      {row.hop_dong_id ? (
                        <span className="badge-success">Đã chuyển</span>
                      ) : (
                        <span className="badge-warning">Chưa chuyển</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={FileText}
            title="Không có dữ liệu"
            description="Chưa có báo giá trong khoảng thời gian này"
          />
        )}
      </div>
    );
  }

  // ─── RENDER: Hop dong tab ──────────────────────────────────────────────────
  function renderHopDong() {
    return (
      <div className="space-y-6">
        {/* Filters */}
        <div className="flex items-end gap-4 flex-wrap">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Tháng/Năm</label>
            <select
              value={hopDongMonth}
              onChange={(e) => setHopDongMonth(e.target.value)}
              className="select-field"
            >
              {monthOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Khách hàng</label>
            <select
              value={hopDongKhachHang}
              onChange={(e) => setHopDongKhachHang(e.target.value)}
              className="select-field"
            >
              <option value="">Tất cả</option>
              {khachHangList.map((kh) => (
                <option key={kh.id} value={kh.id}>{kh.ten_cong_ty}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Trạng thái</label>
            <select
              value={hopDongTrangThai}
              onChange={(e) => setHopDongTrangThai(e.target.value)}
              className="select-field"
            >
              <option value="">Tất cả</option>
              <option value="Hieu luc">Hiệu lực</option>
              <option value="Thanh ly">Thanh lý</option>
              <option value="Huy">Hủy</option>
            </select>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Tổng giá trị HĐ</p>
                <p className="text-lg font-bold text-gray-900">{formatVND(hopDongTongGiaTri)}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">HĐ hiệu lực</p>
                <p className="text-lg font-bold text-green-600">{formatNumber(hopDongCountHieuLuc)}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">HĐ thanh lý</p>
                <p className="text-lg font-bold text-amber-600">{formatNumber(hopDongCountThanhLy)}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">HĐ hủy</p>
                <p className="text-lg font-bold text-red-600">{formatNumber(hopDongCountHuy)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Table */}
        {loading ? renderLoading() : hopDongData.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-header">Khách hàng</th>
                  <th className="table-header">Số HĐ</th>
                  <th className="table-header">Ngày</th>
                  <th className="table-header">Dự án</th>
                  <th className="table-header">Trạng thái</th>
                  <th className="table-header text-right">Tổng giá trị</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {hopDongData.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                    <td className="table-cell">
                      <span className="font-medium text-gray-900">{row.ten_cong_ty}</span>
                    </td>
                    <td className="table-cell text-gray-700">{row.so_hop_dong}</td>
                    <td className="table-cell text-gray-500">{formatDate(row.ngay_hop_dong)}</td>
                    <td className="table-cell text-gray-700">{row.ten_du_an || '--'}</td>
                    <td className="table-cell">
                      <span className={trangThaiHopDongColor(row.trang_thai)}>
                        {trangThaiHopDongLabel(row.trang_thai)}
                      </span>
                    </td>
                    <td className="table-cell text-right whitespace-nowrap font-semibold text-gray-900">
                      {formatVND(row.tong_gia_tri)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={BookOpen}
            title="Không có dữ liệu"
            description="Chưa có hợp đồng trong khoảng thời gian này"
          />
        )}
      </div>
    );
  }

  // ─── RENDER: Cong no tab ───────────────────────────────────────────────────
  function renderCongNo() {
    return (
      <div className="space-y-6">
        {/* Filters */}
        <div className="flex items-end gap-4 flex-wrap">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Khách hàng</label>
            <select
              value={congNoKhachHang}
              onChange={(e) => setCongNoKhachHang(e.target.value)}
              className="select-field"
            >
              <option value="">Tất cả</option>
              {khachHangList.map((kh) => (
                <option key={kh.id} value={kh.id}>{kh.ten_cong_ty}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Summary card */}
        <div className="grid grid-cols-1 sm:grid-cols-1 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center">
                <Receipt className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Tổng công nợ phải thu</p>
                <p className="text-lg font-bold text-gray-900">{formatVND(congNoTongPhaiThu)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Table */}
        {loading ? renderLoading() : congNoData.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-header">Khách hàng</th>
                  <th className="table-header text-right">Tổng ghi nợ</th>
                  <th className="table-header text-right">Tổng đã thu</th>
                  <th className="table-header text-right">Còn phải thu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {congNoData.map((row) => (
                  <tr key={row.khach_hang_id} className="hover:bg-gray-50 transition-colors">
                    <td className="table-cell">
                      <span className="font-medium text-gray-900">{row.ten_cong_ty}</span>
                    </td>
                    <td className="table-cell text-right whitespace-nowrap font-medium text-gray-900">
                      {formatVND(row.tong_ghi_no)}
                    </td>
                    <td className="table-cell text-right whitespace-nowrap text-green-600">
                      {formatVND(row.tong_da_thu)}
                    </td>
                    <td className="table-cell text-right whitespace-nowrap">
                      <span className={`font-semibold ${row.con_phai_thu > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                        {formatVND(row.con_phai_thu)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={Receipt}
            title="Không có dữ liệu"
            description="Chưa có công nợ phải thu"
          />
        )}
      </div>
    );
  }

  // ─── RENDER: Dong tien tab ─────────────────────────────────────────────────
  function renderDongTien() {
    return (
      <div className="space-y-6">
        {/* Filters */}
        <div className="flex items-end gap-4 flex-wrap">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Tháng/Năm</label>
            <select
              value={dongTienMonth}
              onChange={(e) => setDongTienMonth(e.target.value)}
              className="select-field"
            >
              {monthOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Tài khoản</label>
            <select
              value={dongTienTaiKhoan}
              onChange={(e) => setDongTienTaiKhoan(e.target.value)}
              className="select-field"
            >
              <option value="">Tất cả</option>
              {taiKhoanList.map((tk) => (
                <option key={tk.id} value={tk.id}>{tk.ten_tai_khoan}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Khách hàng</label>
            <select
              value={dongTienKhachHang}
              onChange={(e) => setDongTienKhachHang(e.target.value)}
              className="select-field"
            >
              <option value="">Tất cả</option>
              {khachHangList.map((kh) => (
                <option key={kh.id} value={kh.id}>{kh.ten_cong_ty}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Nhà cung cấp</label>
            <select
              value={dongTienNhaCungCap}
              onChange={(e) => setDongTienNhaCungCap(e.target.value)}
              className="select-field"
            >
              <option value="">Tất cả</option>
              {nhaCungCapList.map((ncc) => (
                <option key={ncc.id} value={ncc.id}>{ncc.ten_nha_cung_cap}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
                <Banknote className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Tổng thu</p>
                <p className="text-lg font-bold text-green-600">{formatVND(dongTienTongThu)}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center">
                <Banknote className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Tổng chi</p>
                <p className="text-lg font-bold text-red-600">{formatVND(dongTienTongChi)}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center">
                <Banknote className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Số dư</p>
                <p className="text-lg font-bold text-gray-900">{formatVND(dongTienSoDu)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Table */}
        {loading ? renderLoading() : dongTienData.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-header">Ngày</th>
                  <th className="table-header">Mô tả</th>
                  <th className="table-header">Tài khoản</th>
                  <th className="table-header text-right">Ghi nợ</th>
                  <th className="table-header text-right">Ghi có</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {dongTienData.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                    <td className="table-cell text-gray-500 whitespace-nowrap">
                      {formatDate(row.ngay_gio_giao_dich)}
                    </td>
                    <td className="table-cell">
                      <span className="font-medium text-gray-900">{row.mo_ta_giao_dich}</span>
                    </td>
                    <td className="table-cell text-gray-700">{row.ten_tai_khoan}</td>
                    <td className="table-cell text-right whitespace-nowrap">
                      {row.ghi_no > 0 ? (
                        <span className="font-semibold text-green-600">{formatVND(row.ghi_no)}</span>
                      ) : (
                        <span className="text-gray-300">--</span>
                      )}
                    </td>
                    <td className="table-cell text-right whitespace-nowrap">
                      {row.ghi_co > 0 ? (
                        <span className="font-semibold text-red-600">{formatVND(row.ghi_co)}</span>
                      ) : (
                        <span className="text-gray-300">--</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={Banknote}
            title="Không có dữ liệu"
            description="Chưa có giao dịch trong khoảng thời gian này"
          />
        )}
      </div>
    );
  }

  // ─── RENDER: Chi phi tab ───────────────────────────────────────────────────
  function renderChiPhi() {
    return (
      <div className="space-y-6">
        {/* Filters */}
        <div className="flex items-end gap-4 flex-wrap">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Tháng/Năm</label>
            <select
              value={chiPhiMonth}
              onChange={(e) => setChiPhiMonth(e.target.value)}
              className="select-field"
            >
              {monthOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Loại chi phí</label>
            <select
              value={chiPhiLoai}
              onChange={(e) => setChiPhiLoai(e.target.value)}
              className="select-field"
            >
              <option value="">Tất cả</option>
              {loaiChiPhiList.map((lcp) => (
                <option key={lcp.id} value={lcp.id}>{lcp.ten_loai_chi_phi}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center">
                <CircleDollarSign className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Tổng chi phí</p>
                <p className="text-lg font-bold text-gray-900">{formatVND(chiPhiTongTien)}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center">
                <CircleDollarSign className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Top chi phí lớn nhất</p>
                <div className="mt-1 space-y-0.5">
                  {chiPhiTopLonNhat.length > 0 ? chiPhiTopLonNhat.map((item, idx) => (
                    <p key={idx} className="text-xs text-gray-700">
                      {item.ten}: <span className="font-semibold">{formatVND(item.so_tien)}</span>
                    </p>
                  )) : (
                    <p className="text-xs text-gray-400">--</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Table grouped by loai_chi_phi */}
        {loading ? renderLoading() : chiPhiData.length > 0 ? (
          <div className="space-y-4">
            {chiPhiData.map((group) => (
              <div key={group.loai_chi_phi_id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-900">{group.ten_loai_chi_phi}</h3>
                  <span className="text-sm font-bold text-gray-900">{formatVND(group.tong_tien)}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th className="table-header">Loại chi phí</th>
                        <th className="table-header">Chi phí</th>
                        <th className="table-header text-right">Số tiền</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {group.chi_tiet.map((ct, idx) => (
                        <tr key={idx} className="hover:bg-gray-50 transition-colors">
                          <td className="table-cell text-gray-700">{group.ten_loai_chi_phi}</td>
                          <td className="table-cell">
                            <span className="font-medium text-gray-900">{ct.ten_chi_phi}</span>
                          </td>
                          <td className="table-cell text-right whitespace-nowrap font-semibold text-red-600">
                            {formatVND(ct.so_tien)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={CircleDollarSign}
            title="Không có dữ liệu"
            description="Chưa có chi phí trong khoảng thời gian này"
          />
        )}
      </div>
    );
  }

  // ─── RENDER: Mua hang tab ──────────────────────────────────────────────────
  function renderMuaHang() {
    return (
      <div className="space-y-6">
        {/* Filters */}
        <div className="flex items-end gap-4 flex-wrap">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Nhà cung cấp</label>
            <select
              value={muaHangNhaCungCap}
              onChange={(e) => setMuaHangNhaCungCap(e.target.value)}
              className="select-field"
            >
              <option value="">Tất cả</option>
              {nhaCungCapList.map((ncc) => (
                <option key={ncc.id} value={ncc.id}>{ncc.ten_nha_cung_cap}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Tháng/Năm</label>
            <select
              value={muaHangMonth}
              onChange={(e) => setMuaHangMonth(e.target.value)}
              className="select-field"
            >
              {monthOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Hop dong mua table */}
        {loading ? renderLoading() : muaHangData.length > 0 ? (
          <div className="space-y-6">
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="table-header">Nhà cung cấp</th>
                    <th className="table-header text-right">Số HĐ mua</th>
                    <th className="table-header text-right">Tổng giá trị</th>
                    <th className="table-header text-right">Đã thanh toán</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {muaHangData.map((row) => (
                    <tr key={row.nha_cung_cap_id} className="hover:bg-gray-50 transition-colors">
                      <td className="table-cell">
                        <span className="font-medium text-gray-900">{row.ten_nha_cung_cap}</span>
                      </td>
                      <td className="table-cell text-right text-gray-700">{formatNumber(row.so_hop_dong_mua)}</td>
                      <td className="table-cell text-right whitespace-nowrap font-semibold text-gray-900">
                        {formatVND(row.tong_gia_tri)}
                      </td>
                      <td className="table-cell text-right whitespace-nowrap text-green-600">
                        {formatVND(row.da_thanh_toan)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Vat tu ton kho table */}
            {vatTuTonKho.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                  <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                    <Package className="w-4 h-4 text-blue-600" />
                    Vật tư tồn kho
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th className="table-header">Mã VT</th>
                        <th className="table-header">Tên VT</th>
                        <th className="table-header">Đơn vị</th>
                        <th className="table-header text-right">Tồn kho</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {vatTuTonKho.map((vt) => (
                        <tr key={vt.id} className="hover:bg-gray-50 transition-colors">
                          <td className="table-cell text-gray-700">{vt.ma_vat_tu}</td>
                          <td className="table-cell">
                            <span className="font-medium text-gray-900">{vt.ten_vat_tu}</span>
                          </td>
                          <td className="table-cell text-gray-500">{vt.don_vi_tinh}</td>
                          <td className="table-cell text-right font-semibold text-gray-900">{formatNumber(vt.ton_kho)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : (
          <EmptyState
            icon={Package}
            title="Không có dữ liệu"
            description="Chưa có hợp đồng mua trong khoảng thời gian này"
          />
        )}
      </div>
    );
  }

  // ─── RENDER: Main ──────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <BarChart3 className="w-7 h-7 text-primary-600" />
          Báo cáo
        </h1>
        <p className="mt-1 text-sm text-gray-500">Tổng hợp báo cáo hoạt động kinh doanh</p>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-0 -mb-px overflow-x-auto">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                  isActive
                    ? 'border-primary-600 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'bao-gia' && renderBaoGia()}
      {activeTab === 'hop-dong' && renderHopDong()}
      {activeTab === 'cong-no' && renderCongNo()}
      {activeTab === 'dong-tien' && renderDongTien()}
      {activeTab === 'chi-phi' && renderChiPhi()}
      {activeTab === 'mua-hang' && renderMuaHang()}
    </div>
  );
}
