import { useState, useEffect, useMemo, useCallback } from 'react';
import { dongTienMoiApi, taiKhoanTienApi, hangMucThuChiApi } from '../../lib/api';
import { useToastStore } from '../../store/toast';
import { formatVND, formatNumber, formatDate, cn } from '../../lib/utils';
import EmptyState from '../../components/ui/EmptyState';
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  ArrowLeftRight,
  Filter,
  RefreshCw,
  BarChart3,
  ChevronRight,
  ChevronLeft,
  LayoutDashboard,
  LineChart,
  CreditCard,
} from 'lucide-react';
import type { DongTienMoi, TaiKhoanTien, HangMucThuChi, PhamViHangMuc } from '../../types';

type ReportTab = 'tong-quan' | 'chi-phi' | 'thu' | 'xu-huong' | 'tai-khoan';

const TABS: { id: ReportTab; label: string; icon: typeof BarChart3 }[] = [
  { id: 'tong-quan', label: 'Tổng quan', icon: LayoutDashboard },
  { id: 'chi-phi', label: 'Chi phí', icon: TrendingDown },
  { id: 'thu', label: 'Thu', icon: TrendingUp },
  { id: 'xu-huong', label: 'Xu hướng', icon: LineChart },
  { id: 'tai-khoan', label: 'Tài khoản', icon: CreditCard },
];

const PHAM_VI_LABELS: Record<PhamViHangMuc, string> = {
  cong_ty: 'Công ty',
  ca_nhan: 'Cá nhân',
  oto: 'Ô tô',
  vay_no: 'Vay nợ',
  khac: 'Khác',
};

const PHAM_VI_ORDER: PhamViHangMuc[] = ['cong_ty', 'ca_nhan', 'oto', 'vay_no', 'khac'];

type Direction = 'thu' | 'chi' | 'noi_bo' | 'khac';

function txnDirection(dt: DongTienMoi): Direction {
  if (dt.loai_giao_dich === 'thu') return 'thu';
  if (dt.loai_giao_dich === 'chi') return 'chi';
  if (dt.loai_giao_dich === 'chuyen_khoan_noi_bo') return 'noi_bo';
  return 'khac';
}

function effectiveDir(dt: DongTienMoi): 'thu' | 'chi' | null {
  const dir = txnDirection(dt);
  if (dir === 'noi_bo') return null;
  if (dir === 'khac') return null;
  if (dir === 'thu') return 'thu';
  if (dir === 'chi') return 'chi';
  return dt.chieu_tien === 'thu' ? 'thu' : 'chi';
}

function monthKey(raw?: string): string {
  if (!raw) return '';
  const s = String(raw).trim();
  const iso = s.match(/^(\d{4})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}`;
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}`;
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  return '';
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-');
  if (!y || !m) return key;
  return `${m}/${y}`;
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function startOfYearISO(): string {
  return `${new Date().getFullYear()}-01-01`;
}

interface NamedTotal {
  key: string;
  label: string;
  total: number;
  count: number;
  id?: number;
  hasChildren?: boolean;
}

function buildHangMucMaps(list: HangMucThuChi[]) {
  const byId = new Map<number, HangMucThuChi>();
  const childrenOf = new Map<number, HangMucThuChi[]>();
  for (const hm of list) {
    byId.set(hm.id, hm);
    const pk = hm.parent_id ?? 0;
    if (!childrenOf.has(pk)) childrenOf.set(pk, []);
    childrenOf.get(pk)!.push(hm);
  }
  for (const kids of childrenOf.values()) {
    kids.sort((a, b) => (a.thu_tu ?? 0) - (b.thu_tu ?? 0));
  }
  return { byId, childrenOf };
}

function groupChiNode(
  hmId: number | null | undefined,
  viewParentId: number | null,
  byId: Map<number, HangMucThuChi>,
): { id: number | 'none' | 'direct'; label: string } {
  if (!hmId) return { id: 'none', label: 'Chưa phân loại' };
  let cur = byId.get(hmId);
  if (!cur) return { id: hmId, label: `Hạng mục #${hmId}` };

  if (viewParentId == null) {
    while (cur.parent_id) {
      const parent = byId.get(cur.parent_id);
      if (!parent) break;
      cur = parent;
    }
    return { id: cur.id, label: cur.ten_hang_muc };
  }

  // Giao dịch gắn thẳng vào nhóm cha — không hiển thị trùng tên nhóm cha
  if (cur.id === viewParentId) {
    return { id: 'direct', label: 'Chưa phân chi tiết' };
  }

  while (cur) {
    if (cur.parent_id === viewParentId) return { id: cur.id, label: cur.ten_hang_muc };
    if (!cur.parent_id) break;
    cur = byId.get(cur.parent_id);
  }
  return { id: 'none', label: 'Khác' };
}

function isUnderNhom(
  hmId: number | null | undefined,
  ancestorId: number | null,
  byId: Map<number, HangMucThuChi>,
): boolean {
  if (ancestorId == null) return true;
  if (!hmId) return false;
  let cur = byId.get(hmId);
  while (cur) {
    if (cur.id === ancestorId) return true;
    if (!cur.parent_id) return false;
    cur = byId.get(cur.parent_id);
  }
  return false;
}

function buildChiNhomTotals(
  chiRows: DongTienMoi[],
  viewParentId: number | null,
  byId: Map<number, HangMucThuChi>,
  childrenOf: Map<number, HangMucThuChi[]>,
): NamedTotal[] {
  const scopedRows =
    viewParentId == null
      ? chiRows
      : chiRows.filter((dt) => isUnderNhom(dt.hang_muc_thu_chi_id, viewParentId, byId));

  const totals = new Map<string, NamedTotal>();

  for (const dt of scopedRows) {
    const node = groupChiNode(dt.hang_muc_thu_chi_id, viewParentId, byId);
    if (viewParentId != null && (node.id === 'none' || node.id === 'direct')) continue;
    const key = node.id === 'direct' ? 'direct' : String(node.id);
    const hasChildren =
      node.id !== 'none'
      && node.id !== 'direct'
      && (childrenOf.get(node.id as number)?.length ?? 0) > 0;
    const e = totals.get(key) || {
      key,
      id: typeof node.id === 'number' ? node.id : undefined,
      label: node.label,
      total: 0,
      count: 0,
      hasChildren,
    };
    e.total += Number(dt.so_tien) || 0;
    e.count++;
    totals.set(key, e);
  }

  return [...totals.values()].sort((a, b) => b.total - a.total);
}

function chiNhomBreadcrumb(
  selectedId: number | null,
  byId: Map<number, HangMucThuChi>,
): { id: number | null; label: string }[] {
  const trail: { id: number | null; label: string }[] = [{ id: null, label: 'Tất cả nhóm lớn' }];
  if (selectedId == null) return trail;

  const chain: HangMucThuChi[] = [];
  let cur = byId.get(selectedId);
  while (cur) {
    chain.unshift(cur);
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }
  for (const hm of chain) {
    trail.push({ id: hm.id, label: hm.ten_hang_muc });
  }
  return trail;
}

function bumpNamed(map: Map<string, NamedTotal>, key: string, label: string, amount: number) {
  const e = map.get(key) || { key, label, total: 0, count: 0 };
  e.total += amount;
  e.count++;
  map.set(key, e);
}

// ─── Shared UI ───────────────────────────────────────────────────────────────

function KpiCards({ tongThu, tongChi, net, countThu, countChi }: {
  tongThu: number; tongChi: number; net: number; countThu: number; countChi: number;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div className="card p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-gray-500">Tổng thu</p>
          <TrendingUp className="w-4 h-4 text-green-500" />
        </div>
        <p className="text-xl font-bold text-green-600 mt-1">{formatVND(tongThu)}</p>
        <p className="text-xs text-gray-400 mt-1">{countThu} giao dịch</p>
      </div>
      <div className="card p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-gray-500">Tổng chi</p>
          <TrendingDown className="w-4 h-4 text-red-500" />
        </div>
        <p className="text-xl font-bold text-red-600 mt-1">{formatVND(tongChi)}</p>
        <p className="text-xs text-gray-400 mt-1">{countChi} giao dịch</p>
      </div>
      <div className="card p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-gray-500">Dòng tiền thuần</p>
          <Wallet className={`w-4 h-4 ${net >= 0 ? 'text-green-500' : 'text-red-500'}`} />
        </div>
        <p className={`text-xl font-bold mt-1 ${net >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          {formatVND(net)}
        </p>
        <p className="text-xs text-gray-400 mt-1">Thu − Chi</p>
      </div>
    </div>
  );
}

function NamedTotalTable({
  rows,
  total,
  color,
  onRowClick,
  showCount = true,
  selectedKey,
}: {
  rows: NamedTotal[];
  total: number;
  color: 'green' | 'red';
  onRowClick?: (row: NamedTotal) => void;
  showCount?: boolean;
  selectedKey?: string | null;
}) {
  const amountCls = color === 'green' ? 'text-green-600' : 'text-red-600';
  if (rows.length === 0) {
    return <p className="text-sm text-gray-500 py-4">Không có dữ liệu</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>
            <th className="table-header">Hạng mục</th>
            {showCount && <th className="table-header text-right w-24">Số GD</th>}
            <th className="table-header text-right w-28">Tỷ lệ</th>
            <th className="table-header text-right w-40">Số tiền</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r) => {
            const pct = total > 0 ? (r.total / total) * 100 : 0;
            const clickable = !!onRowClick && r.id != null;
            const isSelected = selectedKey != null && r.key === selectedKey;
            return (
              <tr
                key={r.key}
                className={cn(
                  clickable && 'cursor-pointer',
                  isSelected ? 'bg-red-50' : 'hover:bg-gray-50',
                )}
                onClick={() => clickable && onRowClick?.(r)}
              >
                <td className="table-cell font-medium text-gray-900">
                  <span className="flex items-center gap-1">
                    {r.label}
                    {r.hasChildren && <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
                  </span>
                </td>
                {showCount && <td className="table-cell text-right text-gray-500">{r.count}</td>}
                <td className="table-cell text-right text-gray-500">{formatNumber(pct, 1)}%</td>
                <td className={`table-cell text-right font-semibold whitespace-nowrap ${amountCls}`}>
                  {formatVND(r.total)}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="bg-gray-50 font-semibold">
            <td className="table-cell" colSpan={showCount ? 3 : 2}>Tổng cộng</td>
            <td className={`table-cell text-right whitespace-nowrap ${amountCls}`}>{formatVND(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function PhanTichDongTienPage() {
  const addToast = useToastStore((s) => s.addToast);

  const [activeTab, setActiveTab] = useState<ReportTab>('tong-quan');
  const [dateFrom, setDateFrom] = useState(startOfYearISO());
  const [dateTo, setDateTo] = useState(todayISO());
  const [taiKhoanId, setTaiKhoanId] = useState('');
  const [phamVi, setPhamVi] = useState('');
  const [includeNoiBo, setIncludeNoiBo] = useState(false);

  const [taiKhoanList, setTaiKhoanList] = useState<TaiKhoanTien[]>([]);
  const [hangMucList, setHangMucList] = useState<HangMucThuChi[]>([]);
  const [rows, setRows] = useState<DongTienMoi[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedChiNhomId, setSelectedChiNhomId] = useState<number | null>(null);
  const [selectedTxnNhomId, setSelectedTxnNhomId] = useState<number | null>(null);

  useEffect(() => {
    taiKhoanTienApi.list({ trang_thai: 'hoat_dong' })
      .then((res) => setTaiKhoanList((res.data as TaiKhoanTien[]) || []))
      .catch(() => setTaiKhoanList([]));
    hangMucThuChiApi.list({ trang_thai: 'hoat_dong' })
      .then((res) => setHangMucList((res.data as HangMucThuChi[]) || []))
      .catch(() => setHangMucList([]));
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const limit = 5000;
      let page = 1;
      const all: DongTienMoi[] = [];
      while (true) {
        const res = await dongTienMoiApi.list({
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
          tai_khoan_tien_id: taiKhoanId || undefined,
          pham_vi: phamVi || undefined,
          page,
          limit,
        });
        const batch = (res.data as DongTienMoi[]) || [];
        all.push(...batch);
        if (all.length >= (res.total || 0) || batch.length < limit) break;
        page++;
      }
      setRows(all);
    } catch {
      addToast('error', 'Không thể tải dữ liệu dòng tiền');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, taiKhoanId, phamVi, addToast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    setSelectedChiNhomId(null);
    setSelectedTxnNhomId(null);
  }, [dateFrom, dateTo, taiKhoanId, phamVi, includeNoiBo]);

  const { byId: hmById, childrenOf: hmChildrenOf } = useMemo(
    () => buildHangMucMaps(hangMucList),
    [hangMucList],
  );

  const tkPhamViMap = useMemo(() => {
    const m = new Map<number, string>();
    for (const tk of taiKhoanList) m.set(tk.id, tk.pham_vi);
    return m;
  }, [taiKhoanList]);

  function applyPreset(preset: 'thang_nay' | 'thang_truoc' | 'quy_nay' | 'nam_nay') {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const pad = (n: number) => String(n).padStart(2, '0');
    const iso = (yy: number, mm: number, dd: number) => `${yy}-${pad(mm + 1)}-${pad(dd)}`;
    const lastDay = (yy: number, mm: number) => new Date(yy, mm + 1, 0).getDate();
    if (preset === 'thang_nay') {
      setDateFrom(iso(y, m, 1));
      setDateTo(iso(y, m, lastDay(y, m)));
    } else if (preset === 'thang_truoc') {
      const pm = m === 0 ? 11 : m - 1;
      const py = m === 0 ? y - 1 : y;
      setDateFrom(iso(py, pm, 1));
      setDateTo(iso(py, pm, lastDay(py, pm)));
    } else if (preset === 'quy_nay') {
      const qStart = Math.floor(m / 3) * 3;
      setDateFrom(iso(y, qStart, 1));
      setDateTo(iso(y, qStart + 2, lastDay(y, qStart + 2)));
    } else {
      setDateFrom(`${y}-01-01`);
      setDateTo(`${y}-12-31`);
    }
  }

  const analysis = useMemo(() => {
    let tongThu = 0;
    let tongChi = 0;
    let tongNoiBo = 0;
    let countThu = 0;
    let countChi = 0;
    const byMonth = new Map<string, { thu: number; chi: number }>();
    const thuByHangMuc = new Map<string, NamedTotal>();
    const thuByKhachHang = new Map<string, NamedTotal>();
    const thuByHopDong = new Map<string, NamedTotal>();
    const chiByPhamVi = new Map<string, NamedTotal>();
    const byTaiKhoan = new Map<string, {
      id: number;
      label: string;
      phamVi: string;
      thu: number;
      chi: number;
      noiBo: number;
    }>();
    const chiTxnRows: DongTienMoi[] = [];
    const thuTxnRows: DongTienMoi[] = [];

    for (const dt of rows) {
      const dir = txnDirection(dt);
      const tien = Number(dt.so_tien) || 0;

      if (dir === 'noi_bo') {
        tongNoiBo += tien;
        const tkKey = String(dt.tai_khoan_tien_id ?? 'none');
        const tkEntry = byTaiKhoan.get(tkKey) || {
          id: dt.tai_khoan_tien_id || 0,
          label: dt.ten_tai_khoan || '--',
          phamVi: tkPhamViMap.get(dt.tai_khoan_tien_id) || 'khac',
          thu: 0, chi: 0, noiBo: 0,
        };
        tkEntry.noiBo += tien;
        byTaiKhoan.set(tkKey, tkEntry);
        if (!includeNoiBo) continue;
      }

      const eff = effectiveDir(dt);
      if (!eff) continue;

      const mKey = monthKey(dt.ngay_giao_dich);
      const mEntry = byMonth.get(mKey) || { thu: 0, chi: 0 };
      const tkKey = String(dt.tai_khoan_tien_id ?? 'none');
      const tkEntry = byTaiKhoan.get(tkKey) || {
        id: dt.tai_khoan_tien_id || 0,
        label: dt.ten_tai_khoan || '--',
        phamVi: tkPhamViMap.get(dt.tai_khoan_tien_id) || 'khac',
        thu: 0, chi: 0, noiBo: 0,
      };

      if (eff === 'thu') {
        tongThu += tien;
        countThu++;
        mEntry.thu += tien;
        tkEntry.thu += tien;
        thuTxnRows.push(dt);
        bumpNamed(thuByHangMuc, String(dt.hang_muc_thu_chi_id ?? 'none'), dt.ten_hang_muc || 'Chưa phân loại', tien);
        if (dt.khach_hang_id) {
          bumpNamed(thuByKhachHang, String(dt.khach_hang_id), dt.ten_cong_ty || `KH #${dt.khach_hang_id}`, tien);
        }
        if (dt.hop_dong_id) {
          bumpNamed(thuByHopDong, String(dt.hop_dong_id), dt.so_hop_dong || `HĐ #${dt.hop_dong_id}`, tien);
        }
      } else {
        tongChi += tien;
        countChi++;
        mEntry.chi += tien;
        tkEntry.chi += tien;
        chiTxnRows.push(dt);
        const pv = (dt.pham_vi_hang_muc || 'khac') as PhamViHangMuc;
        bumpNamed(chiByPhamVi, pv, PHAM_VI_LABELS[pv] || pv, tien);
      }
      byMonth.set(mKey, mEntry);
      byTaiKhoan.set(tkKey, tkEntry);
    }

    const months = [...byMonth.entries()]
      .filter(([k]) => k)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, v]) => ({
        key,
        label: monthLabel(key),
        ...v,
        net: v.thu - v.chi,
        chiPctThu: v.thu > 0 ? (v.chi / v.thu) * 100 : 0,
      }));

    const chiPhamViRows = PHAM_VI_ORDER
      .map((pv) => chiByPhamVi.get(pv))
      .filter((r): r is NamedTotal => !!r && r.total > 0);

    const unclassified = chiByPhamVi.get('khac');
    if (unclassified && !chiPhamViRows.some((r) => r.key === 'khac')) {
      chiPhamViRows.push(unclassified);
    }

    return {
      tongThu, tongChi, tongNoiBo, countThu, countChi,
      net: tongThu - tongChi,
      months,
      thuTop: [...thuByHangMuc.values()].sort((a, b) => b.total - a.total),
      thuByKhachHang: [...thuByKhachHang.values()].sort((a, b) => b.total - a.total),
      thuByHopDong: [...thuByHopDong.values()].sort((a, b) => b.total - a.total),
      chiPhamViRows,
      taiKhoanRows: [...byTaiKhoan.values()].sort((a, b) => b.thu + b.chi - (a.thu + a.chi)),
      chiTxnRows,
      thuTxnRows,
    };
  }, [rows, includeNoiBo, tkPhamViMap]);

  const chiNhomRows = useMemo(
    () => buildChiNhomTotals(analysis.chiTxnRows, selectedChiNhomId, hmById, hmChildrenOf),
    [analysis.chiTxnRows, selectedChiNhomId, hmById, hmChildrenOf],
  );

  const chiNhomTrail = useMemo(
    () => chiNhomBreadcrumb(selectedChiNhomId, hmById),
    [selectedChiNhomId, hmById],
  );

  const chiNhomSubtotal = useMemo(() => {
    if (selectedChiNhomId == null) return analysis.tongChi;
    return analysis.chiTxnRows
      .filter((dt) => isUnderNhom(dt.hang_muc_thu_chi_id, selectedChiNhomId, hmById))
      .reduce((s, dt) => s + (Number(dt.so_tien) || 0), 0);
  }, [analysis.chiTxnRows, analysis.tongChi, selectedChiNhomId, hmById]);

  const chiNhomShowBreakdown = selectedChiNhomId == null || chiNhomRows.length > 0;

  useEffect(() => {
    if (selectedChiNhomId != null && chiNhomRows.length === 0 && chiNhomSubtotal > 0) {
      setSelectedTxnNhomId(selectedChiNhomId);
    }
  }, [selectedChiNhomId, chiNhomRows.length, chiNhomSubtotal]);

  const selectedTxnNhomLabel = useMemo(() => {
    if (selectedTxnNhomId == null) return null;
    return hmById.get(selectedTxnNhomId)?.ten_hang_muc
      || chiNhomRows.find((r) => r.id === selectedTxnNhomId)?.label
      || null;
  }, [selectedTxnNhomId, hmById, chiNhomRows]);

  const chiDetailTxns = useMemo(() => {
    if (selectedTxnNhomId == null) return [];
    return analysis.chiTxnRows
      .filter((dt) => isUnderNhom(dt.hang_muc_thu_chi_id, selectedTxnNhomId, hmById))
      .sort((a, b) => (Number(b.so_tien) || 0) - (Number(a.so_tien) || 0));
  }, [analysis.chiTxnRows, selectedTxnNhomId, hmById]);

  const monthCompare = useMemo(() => {
    const ms = analysis.months;
    if (ms.length < 2) return null;
    const cur = ms[ms.length - 1];
    const prev = ms[ms.length - 2];
    const chiDelta = prev.chi > 0 ? ((cur.chi - prev.chi) / prev.chi) * 100 : 0;
    const thuDelta = prev.thu > 0 ? ((cur.thu - prev.thu) / prev.thu) * 100 : 0;
    return { cur, prev, chiDelta, thuDelta };
  }, [analysis.months]);

  const maxMonthBar = Math.max(1, ...analysis.months.map((m) => Math.max(m.thu, m.chi)));

  function goToChiTab(nhomId?: number | null) {
    setActiveTab('chi-phi');
    setSelectedChiNhomId(nhomId ?? null);
    setSelectedTxnNhomId(nhomId ?? null);
  }

  function handleChiNhomRowClick(r: NamedTotal) {
    if (r.id == null) return;
    setSelectedTxnNhomId(r.id);
    if (r.hasChildren) {
      setSelectedChiNhomId(r.id);
    } else if (selectedChiNhomId == null) {
      setSelectedChiNhomId(r.id);
    }
  }

  function navigateChiNhom(crumbId: number | null) {
    setSelectedChiNhomId(crumbId);
    setSelectedTxnNhomId(crumbId);
  }

  const filters = (
    <div className="card">
      <div className="card-body space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <Filter className="w-4 h-4" /> Bộ lọc
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Từ ngày</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              className="input-field text-sm w-full" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Đến ngày</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              className="input-field text-sm w-full" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Tài khoản</label>
            <select value={taiKhoanId} onChange={(e) => setTaiKhoanId(e.target.value)}
              className="input-field text-sm w-full">
              <option value="">Tất cả tài khoản</option>
              {taiKhoanList.map((tk) => (
                <option key={tk.id} value={tk.id}>{tk.ten_tai_khoan}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Phạm vi</label>
            <select value={phamVi} onChange={(e) => setPhamVi(e.target.value)}
              className="input-field text-sm w-full">
              <option value="">Tất cả phạm vi</option>
              {Object.entries(PHAM_VI_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
              <input type="checkbox" checked={includeNoiBo}
                onChange={(e) => setIncludeNoiBo(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
              Gồm CK nội bộ vào thu/chi
            </label>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {([
            ['thang_nay', 'Tháng này'],
            ['thang_truoc', 'Tháng trước'],
            ['quy_nay', 'Quý này'],
            ['nam_nay', 'Năm nay'],
          ] as const).map(([key, label]) => (
            <button key={key} onClick={() => applyPreset(key)}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const tabNav = (
    <div className="border-b border-gray-200 overflow-x-auto">
      <nav className="flex gap-1 min-w-max px-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
              activeTab === tab.id
                ? 'border-primary-600 text-primary-700'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
            )}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-primary-600" />
            Phân tích dòng tiền
          </h1>
          <p className="mt-1 text-sm text-gray-500">Báo cáo thu chi theo nhóm, nguồn và xu hướng</p>
        </div>
        <button onClick={fetchData} className="btn-secondary flex items-center gap-2 text-sm self-start">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Làm mới
        </button>
      </div>

      {filters}

      <div className="card overflow-hidden">
        {tabNav}

        <div className="p-4 sm:p-6">
          {loading ? (
            <div className="flex items-center justify-center min-h-[30vh]">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
                <p className="text-sm text-gray-500">Đang phân tích dữ liệu...</p>
              </div>
            </div>
          ) : rows.length === 0 ? (
            <EmptyState icon={BarChart3} title="Không có dữ liệu"
              description="Chưa có giao dịch nào trong khoảng thời gian đã chọn" />
          ) : (
            <>
              {/* ── Tab 1: Tổng quan ── */}
              {activeTab === 'tong-quan' && (
                <div className="space-y-6">
                  <KpiCards
                    tongThu={analysis.tongThu}
                    tongChi={analysis.tongChi}
                    net={analysis.net}
                    countThu={analysis.countThu}
                    countChi={analysis.countChi}
                  />

                  <div className="card border border-gray-200">
                    <div className="card-header flex items-center justify-between">
                      <div>
                        <h2 className="text-lg font-semibold text-gray-900">Chi phí theo phạm vi</h2>
                        <p className="text-xs text-gray-500 mt-0.5">Click nhóm để xem chi tiết ở tab Chi phí</p>
                      </div>
                      <button type="button" onClick={() => goToChiTab(null)}
                        className="text-xs text-primary-600 hover:underline font-medium">
                        Xem tất cả chi phí →
                      </button>
                    </div>
                    <div className="card-body p-0">
                      <NamedTotalTable
                        rows={analysis.chiPhamViRows}
                        total={analysis.tongChi}
                        color="red"
                        onRowClick={() => goToChiTab(null)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="card border border-gray-200">
                      <div className="card-header">
                        <h2 className="text-base font-semibold text-gray-900">Top thu (hạng mục)</h2>
                      </div>
                      <div className="card-body p-0">
                        <NamedTotalTable
                          rows={analysis.thuTop.slice(0, 5)}
                          total={analysis.tongThu}
                          color="green"
                          showCount={false}
                        />
                      </div>
                    </div>
                    <div className="card border border-gray-200">
                      <div className="card-header">
                        <h2 className="text-base font-semibold text-gray-900">Top chi (nhóm lớn)</h2>
                      </div>
                      <div className="card-body p-0">
                        <NamedTotalTable
                          rows={chiNhomRows.slice(0, 5)}
                          total={analysis.tongChi}
                          color="red"
                          onRowClick={(r) => r.id != null && goToChiTab(r.id)}
                        />
                      </div>
                    </div>
                  </div>

                  {analysis.tongNoiBo > 0 && (
                    <p className="text-xs text-gray-500 flex items-center gap-1">
                      <ArrowLeftRight className="w-3.5 h-3.5" />
                      Chuyển khoản nội bộ: {formatVND(analysis.tongNoiBo)}
                      {includeNoiBo ? ' (đã tính vào thu/chi)' : ' (không tính vào thu/chi)'}
                    </p>
                  )}
                </div>
              )}

              {/* ── Tab 2: Chi phí ── */}
              {activeTab === 'chi-phi' && (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                      <p className="text-sm text-gray-500">
                        {selectedChiNhomId != null ? 'Tổng chi trong nhóm đang xem' : 'Tổng chi kỳ đã chọn'}
                      </p>
                      <p className="text-2xl font-bold text-red-600">
                        {formatVND(selectedChiNhomId != null ? chiNhomSubtotal : analysis.tongChi)}
                      </p>
                    </div>
                    {selectedChiNhomId != null && (
                      <button type="button" onClick={() => {
                        if (chiNhomTrail.length <= 2) navigateChiNhom(null);
                        else navigateChiNhom(chiNhomTrail[chiNhomTrail.length - 2].id);
                      }}
                        className="btn-secondary text-xs flex items-center gap-1 self-start">
                        <ChevronLeft className="w-3.5 h-3.5" /> Quay lại
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1 text-xs border-b border-gray-100 pb-3">
                    {chiNhomTrail.map((crumb, i) => (
                      <span key={crumb.id ?? 'root'} className="flex items-center gap-1">
                        {i > 0 && <ChevronRight className="w-3 h-3 text-gray-300" />}
                        <button
                          type="button"
                          onClick={() => { if (i < chiNhomTrail.length - 1) navigateChiNhom(crumb.id); }}
                          disabled={i === chiNhomTrail.length - 1}
                          className={i === chiNhomTrail.length - 1
                            ? 'font-semibold text-red-700'
                            : 'text-primary-600 hover:underline'}
                        >
                          {crumb.label}
                        </button>
                      </span>
                    ))}
                  </div>

                  {chiNhomShowBreakdown ? (
                    <div className="card border border-gray-200">
                      <div className="card-body p-0">
                        <NamedTotalTable
                          rows={chiNhomRows}
                          total={selectedChiNhomId != null ? chiNhomSubtotal : analysis.tongChi}
                          color="red"
                          selectedKey={selectedTxnNhomId != null ? String(selectedTxnNhomId) : null}
                          onRowClick={handleChiNhomRowClick}
                        />
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 py-2">
                      {chiNhomSubtotal > 0
                        ? 'Nhóm này không có hạng mục con — xem danh sách giao dịch bên dưới.'
                        : 'Không có giao dịch trong nhóm này'}
                    </p>
                  )}

                  <p className="text-xs text-gray-500">
                    {selectedTxnNhomId == null
                      ? (chiNhomShowBreakdown
                        ? 'Chọn một nhóm trong bảng để xem danh sách giao dịch'
                        : '')
                      : `Đang xem ${chiDetailTxns.length} giao dịch thuộc nhóm «${selectedTxnNhomLabel}»`}
                  </p>

                  {selectedTxnNhomId != null && (
                    <div className="card border border-gray-200">
                      <div className="card-header">
                        <h2 className="text-base font-semibold text-gray-900">
                          Giao dịch — {selectedTxnNhomLabel}
                          <span className="ml-2 text-sm font-normal text-gray-500">
                            ({chiDetailTxns.length} giao dịch)
                          </span>
                        </h2>
                      </div>
                      <div className="card-body p-0 overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr>
                              <th className="table-header w-28">Ngày</th>
                              <th className="table-header">Mô tả</th>
                              <th className="table-header">Hạng mục</th>
                              <th className="table-header">Tài khoản</th>
                              <th className="table-header text-right w-36">Số tiền</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {chiDetailTxns.length === 0 ? (
                              <tr>
                                <td colSpan={5} className="table-cell text-center text-gray-500 py-6">
                                  Không có giao dịch trong nhóm này
                                </td>
                              </tr>
                            ) : chiDetailTxns.map((dt) => (
                              <tr key={dt.id} className="hover:bg-gray-50">
                                <td className="table-cell text-gray-600 whitespace-nowrap">
                                  {formatDate(dt.ngay_giao_dich)}
                                </td>
                                <td className="table-cell text-gray-800 max-w-[200px] truncate"
                                  title={dt.mo_ta_giao_dich}>
                                  {dt.mo_ta_giao_dich || '—'}
                                </td>
                                <td className="table-cell text-gray-600">{dt.ten_hang_muc || '—'}</td>
                                <td className="table-cell text-gray-600">{dt.ten_tai_khoan || '—'}</td>
                                <td className="table-cell text-right font-semibold text-red-600 whitespace-nowrap">
                                  {formatVND(dt.so_tien)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          {chiDetailTxns.length > 0 && (
                            <tfoot>
                              <tr className="bg-gray-50 font-semibold">
                                <td className="table-cell" colSpan={4}>Tổng nhóm</td>
                                <td className="table-cell text-right text-red-700 whitespace-nowrap">
                                  {formatVND(chiDetailTxns.reduce((s, d) => s + (Number(d.so_tien) || 0), 0))}
                                </td>
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Tab 3: Thu ── */}
              {activeTab === 'thu' && (
                <div className="space-y-6">
                  <div>
                    <p className="text-sm text-gray-500">Tổng thu kỳ đã chọn</p>
                    <p className="text-2xl font-bold text-green-600">{formatVND(analysis.tongThu)}</p>
                  </div>

                  <div className="card border border-gray-200">
                    <div className="card-header">
                      <h2 className="text-lg font-semibold text-gray-900">Thu theo hạng mục</h2>
                    </div>
                    <div className="card-body p-0">
                      <NamedTotalTable rows={analysis.thuTop} total={analysis.tongThu} color="green" />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="card border border-gray-200">
                      <div className="card-header">
                        <h2 className="text-base font-semibold text-gray-900">Thu theo khách hàng</h2>
                      </div>
                      <div className="card-body p-0">
                        {analysis.thuByKhachHang.length === 0 ? (
                          <p className="text-sm text-gray-500 p-4">Không có thu gắn khách hàng</p>
                        ) : (
                          <NamedTotalTable
                            rows={analysis.thuByKhachHang}
                            total={analysis.tongThu}
                            color="green"
                          />
                        )}
                      </div>
                    </div>
                    <div className="card border border-gray-200">
                      <div className="card-header">
                        <h2 className="text-base font-semibold text-gray-900">Thu theo hợp đồng</h2>
                      </div>
                      <div className="card-body p-0">
                        {analysis.thuByHopDong.length === 0 ? (
                          <p className="text-sm text-gray-500 p-4">Không có thu gắn hợp đồng</p>
                        ) : (
                          <NamedTotalTable
                            rows={analysis.thuByHopDong}
                            total={analysis.tongThu}
                            color="green"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Tab 4: Xu hướng ── */}
              {activeTab === 'xu-huong' && (
                <div className="space-y-6">
                  {monthCompare && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                        <p className="text-xs text-gray-500">Thu {monthCompare.cur.label} vs {monthCompare.prev.label}</p>
                        <p className={cn('text-lg font-bold mt-1',
                          monthCompare.thuDelta >= 0 ? 'text-green-600' : 'text-red-600')}>
                          {monthCompare.thuDelta >= 0 ? '+' : ''}{formatNumber(monthCompare.thuDelta, 1)}%
                        </p>
                      </div>
                      <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                        <p className="text-xs text-gray-500">Chi {monthCompare.cur.label} vs {monthCompare.prev.label}</p>
                        <p className={cn('text-lg font-bold mt-1',
                          monthCompare.chiDelta <= 0 ? 'text-green-600' : 'text-red-600')}>
                          {monthCompare.chiDelta >= 0 ? '+' : ''}{formatNumber(monthCompare.chiDelta, 1)}%
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="card border border-gray-200">
                    <div className="card-header">
                      <h2 className="text-lg font-semibold text-gray-900">Biểu đồ thu / chi theo tháng</h2>
                    </div>
                    <div className="card-body">
                      <div className="flex items-end gap-3 overflow-x-auto pb-2 min-h-[180px]">
                        {analysis.months.map((m) => (
                          <div key={m.key} className="flex flex-col items-center gap-1 min-w-[56px]">
                            <div className="flex items-end gap-0.5 h-32 w-full justify-center">
                              <div
                                className="w-3 bg-green-500 rounded-t"
                                style={{ height: `${(m.thu / maxMonthBar) * 100}%`, minHeight: m.thu > 0 ? 4 : 0 }}
                                title={`Thu: ${formatVND(m.thu)}`}
                              />
                              <div
                                className="w-3 bg-red-500 rounded-t"
                                style={{ height: `${(m.chi / maxMonthBar) * 100}%`, minHeight: m.chi > 0 ? 4 : 0 }}
                                title={`Chi: ${formatVND(m.chi)}`}
                              />
                            </div>
                            <span className="text-[10px] text-gray-500">{m.label}</span>
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-4 mt-3 text-xs text-gray-500">
                        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-500 rounded" /> Thu</span>
                        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-500 rounded" /> Chi</span>
                      </div>
                    </div>
                  </div>

                  <div className="card border border-gray-200">
                    <div className="card-header">
                      <h2 className="text-lg font-semibold text-gray-900">Bảng xu hướng theo tháng</h2>
                    </div>
                    <div className="card-body p-0 overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr>
                            <th className="table-header w-24">Tháng</th>
                            <th className="table-header text-right w-36">Thu</th>
                            <th className="table-header text-right w-36">Chi</th>
                            <th className="table-header text-right w-36">Thuần</th>
                            <th className="table-header text-right w-28">Chi/Thu</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {analysis.months.map((m) => (
                            <tr key={m.key} className="hover:bg-gray-50">
                              <td className="table-cell font-medium">{m.label}</td>
                              <td className="table-cell text-right text-green-600 font-medium whitespace-nowrap">
                                {formatVND(m.thu)}
                              </td>
                              <td className="table-cell text-right text-red-600 font-medium whitespace-nowrap">
                                {formatVND(m.chi)}
                              </td>
                              <td className={cn('table-cell text-right font-semibold whitespace-nowrap',
                                m.net >= 0 ? 'text-green-700' : 'text-red-700')}>
                                {formatVND(m.net)}
                              </td>
                              <td className="table-cell text-right text-gray-600">
                                {formatNumber(m.chiPctThu, 1)}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-gray-50 font-semibold">
                            <td className="table-cell">Tổng cộng</td>
                            <td className="table-cell text-right text-green-700 whitespace-nowrap">
                              {formatVND(analysis.tongThu)}
                            </td>
                            <td className="table-cell text-right text-red-700 whitespace-nowrap">
                              {formatVND(analysis.tongChi)}
                            </td>
                            <td className={cn('table-cell text-right whitespace-nowrap',
                              analysis.net >= 0 ? 'text-green-700' : 'text-red-700')}>
                              {formatVND(analysis.net)}
                            </td>
                            <td className="table-cell text-right text-gray-600">
                              {analysis.tongThu > 0
                                ? `${formatNumber((analysis.tongChi / analysis.tongThu) * 100, 1)}%`
                                : '—'}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Tab 5: Tài khoản ── */}
              {activeTab === 'tai-khoan' && (
                <div className="space-y-4">
                  <div className="card border border-gray-200">
                    <div className="card-header">
                      <h2 className="text-lg font-semibold text-gray-900">Dòng tiền theo tài khoản</h2>
                      <p className="text-xs text-gray-500 mt-0.5">
                        CK nội bộ hiển thị riêng, không tính vào thu/chi trừ khi bật checkbox ở bộ lọc
                      </p>
                    </div>
                    <div className="card-body p-0 overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr>
                            <th className="table-header">Tài khoản</th>
                            <th className="table-header w-24">Phạm vi</th>
                            <th className="table-header text-right w-32">Thu</th>
                            <th className="table-header text-right w-32">Chi</th>
                            <th className="table-header text-right w-32">CK nội bộ</th>
                            <th className="table-header text-right w-32">Thuần</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {analysis.taiKhoanRows.map((tk) => {
                            const net = tk.thu - tk.chi;
                            const pvLabel = PHAM_VI_LABELS[tk.phamVi as PhamViHangMuc] || tk.phamVi;
                            return (
                              <tr key={tk.id || tk.label} className="hover:bg-gray-50">
                                <td className="table-cell font-medium text-gray-900">{tk.label}</td>
                                <td className="table-cell text-gray-500 text-sm">{pvLabel}</td>
                                <td className="table-cell text-right text-green-600 whitespace-nowrap">
                                  {formatVND(tk.thu)}
                                </td>
                                <td className="table-cell text-right text-red-600 whitespace-nowrap">
                                  {formatVND(tk.chi)}
                                </td>
                                <td className="table-cell text-right text-gray-500 whitespace-nowrap">
                                  {tk.noiBo > 0 ? formatVND(tk.noiBo) : '—'}
                                </td>
                                <td className={cn('table-cell text-right font-semibold whitespace-nowrap',
                                  net >= 0 ? 'text-green-700' : 'text-red-700')}>
                                  {formatVND(net)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
