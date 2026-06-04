import { useState, useEffect, useRef, useCallback } from 'react';
import { hopDongMuaApi, nhaCungCapApi } from '../../lib/api';
import { useToastStore } from '../../store/toast';
import {
  formatVND,
  generateSoHopDongMua,
} from '../../lib/utils';
import { Save, Plus, Trash2, Search, X } from 'lucide-react';
import NumInput from '../../components/ui/NumInput';
import type { NhaCungCap } from '../../types';

// ── Date helpers (dd/mm/yyyy) ────────────────────────────────────────────────
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

// ── Types ────────────────────────────────────────────────────────────────────
interface ChiTietRow {
  tempId: string;
  id?: number;
  ten_san_pham: string;
  don_vi: string;
  so_luong: number;
  don_gia: number;
  thue_suat: number;
  thanh_tien: number;
}

function calcThanhTien(soLuong: number, donGia: number, thueSuat: number): number {
  return soLuong * donGia * (1 + thueSuat / 100);
}

function emptyRow(): ChiTietRow {
  return {
    tempId: crypto.randomUUID(),
    ten_san_pham: '',
    don_vi: '',
    so_luong: 1,
    don_gia: 0,
    thue_suat: 10,
    thanh_tien: 0,
  };
}

interface HopDongMuaFormProps {
  mode: 'create' | 'edit';
  hopDongMuaId?: number;
  initialData?: any;
  onSaved: (savedId: number) => void;
  onCancel: () => void;
}

const inputCls = 'w-full px-2 py-1 text-sm border border-transparent rounded focus:border-blue-400 focus:ring-1 focus:ring-blue-400 focus:outline-none bg-transparent hover:bg-white hover:border-gray-300 transition-all';

export default function HopDongMuaForm({ mode, hopDongMuaId, initialData, onSaved, onCancel }: HopDongMuaFormProps) {
  const addToast = useToastStore((s) => s.addToast);

  const [soHopDong, setSoHopDong] = useState('');
  const [ngayKy, setNgayKy] = useState(todayVN());
  const [ghiChu, setGhiChu] = useState('');
  const [chiTiet, setChiTiet] = useState<ChiTietRow[]>([emptyRow()]);
  const [saving, setSaving] = useState(false);

  // NCC search
  const [nccId, setNccId] = useState('');
  const [nccName, setNccName] = useState('');
  const [nccSearch, setNccSearch] = useState('');
  const [nccResults, setNccResults] = useState<NhaCungCap[]>([]);
  const [nccDropOpen, setNccDropOpen] = useState(false);
  const [nccSearching, setNccSearching] = useState(false);
  const nccDropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (nccDropRef.current && !nccDropRef.current.contains(e.target as Node)) {
        setNccDropOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const searchNccRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchNCC = useCallback((q: string) => {
    if (searchNccRef.current) clearTimeout(searchNccRef.current);
    if (!q.trim()) { setNccResults([]); return; }
    searchNccRef.current = setTimeout(async () => {
      setNccSearching(true);
      try {
        const res = await nhaCungCapApi.list({ search: q.trim(), limit: 20 });
        setNccResults((res.data as NhaCungCap[]) || []);
      } finally {
        setNccSearching(false);
      }
    }, 250);
  }, []);

  useEffect(() => {
    if (mode === 'create') {
      setSoHopDong(generateSoHopDongMua());
    } else if (initialData) {
      populate(initialData);
    }
  }, [mode, initialData]);

  function populate(data: any) {
    setSoHopDong(data.so_hop_dong || '');
    setNgayKy(isoToVN(data.ngay_ky));
    setGhiChu(data.ghi_chu || '');
    setNccId(String(data.nha_cung_cap_id || ''));
    const name = data.ten_nha_cung_cap || data.nha_cung_cap?.ten_nha_cung_cap || '';
    setNccName(name);
    setNccSearch(name);
    const rows: ChiTietRow[] = (data.chi_tiet || []).map((ct: any) => ({
      tempId: crypto.randomUUID(),
      id: ct.id,
      ten_san_pham: ct.ten_san_pham || '',
      don_vi: ct.don_vi || '',
      so_luong: ct.so_luong || 1,
      don_gia: ct.don_gia || 0,
      thue_suat: ct.thue_suat ?? 10,
      thanh_tien: ct.thanh_tien || 0,
    }));
    setChiTiet(rows.length > 0 ? rows : [emptyRow()]);
  }

  function updateRow(tempId: string, field: keyof ChiTietRow, value: string | number) {
    setChiTiet((prev) =>
      prev.map((row) => {
        if (row.tempId !== tempId) return row;
        const updated = { ...row, [field]: value };
        updated.thanh_tien = calcThanhTien(
          Number(updated.so_luong),
          Number(updated.don_gia),
          Number(updated.thue_suat)
        );
        return updated;
      })
    );
  }

  function insertRowAfter(afterTempId: string | null) {
    const newRow = emptyRow();
    setChiTiet((prev) => {
      if (afterTempId === null) return [newRow, ...prev];
      const idx = prev.findIndex((r) => r.tempId === afterTempId);
      const next = [...prev];
      next.splice(idx + 1, 0, newRow);
      return next;
    });
  }

  function removeRow(tempId: string) {
    setChiTiet((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((r) => r.tempId !== tempId);
    });
  }

  // ── Totals ───────────────────────────────────────────────────────────────
  const tongTruocVAT = chiTiet.reduce((s, r) => s + r.so_luong * r.don_gia, 0);
  const tongVAT = chiTiet.reduce((s, r) => s + r.so_luong * r.don_gia * (r.thue_suat / 100), 0);
  const tongThanhToan = tongTruocVAT + tongVAT;

  const vat8 = chiTiet
    .filter((r) => r.thue_suat === 8)
    .reduce((s, r) => s + r.so_luong * r.don_gia * 0.08, 0);
  const vat10 = chiTiet
    .filter((r) => r.thue_suat === 10)
    .reduce((s, r) => s + r.so_luong * r.don_gia * 0.1, 0);

  // ── Save ─────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!nccId) { addToast('warning', 'Vui lòng chọn nhà cung cấp'); return; }
    if (!soHopDong.trim()) { addToast('warning', 'Vui lòng nhập số hợp đồng'); return; }
    if (!isValidVNDate(ngayKy)) { addToast('warning', 'Ngày ký không hợp lệ (dd/mm/yyyy)'); return; }
    const validRows = chiTiet.filter((r) => r.ten_san_pham.trim() && r.so_luong > 0 && r.don_gia > 0);
    if (validRows.length === 0) { addToast('warning', 'Vui lòng thêm ít nhất một sản phẩm'); return; }

    setSaving(true);
    try {
      const payload = {
        so_hop_dong: soHopDong.trim(),
        ngay_ky: vnToISO(ngayKy),
        nha_cung_cap_id: Number(nccId),
        tong_gia_tri: tongThanhToan,
        ghi_chu: ghiChu.trim() || null,
        chi_tiet: validRows.map((r) => ({
          ten_san_pham: r.ten_san_pham.trim(),
          don_vi: r.don_vi.trim(),
          so_luong: r.so_luong,
          don_gia: r.don_gia,
          thue_suat: r.thue_suat,
          thanh_tien: r.thanh_tien,
        })),
      };

      if (mode === 'create') {
        const result = await hopDongMuaApi.create(payload);
        addToast('success', 'Tạo hợp đồng mua thành công');
        onSaved(result.data.id);
      } else {
        await hopDongMuaApi.update(hopDongMuaId!, payload);
        addToast('success', 'Cập nhật hợp đồng mua thành công');
        onSaved(hopDongMuaId!);
      }
    } catch {
      addToast('error', mode === 'create' ? 'Không thể tạo hợp đồng mua' : 'Không thể cập nhật hợp đồng mua');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      {/* Header info */}
      <div className="p-4 border-b border-gray-100">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 items-end">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Số Hợp đồng <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={soHopDong}
              onChange={(e) => setSoHopDong(e.target.value)}
              className="input-field text-sm"
              placeholder="Số HĐ..."
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Ngày ký</label>
            <input
              type="text"
              value={ngayKy}
              onChange={(e) => setNgayKy(e.target.value)}
              className="input-field text-sm"
              placeholder="dd/mm/yyyy"
              maxLength={10}
            />
          </div>

          <div className="lg:col-span-2 relative" ref={nccDropRef}>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Nhà cung cấp <span className="text-red-500">*</span></label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={nccSearch}
                onChange={(e) => {
                  const v = e.target.value;
                  setNccSearch(v);
                  if (nccId && v !== nccName) { setNccId(''); setNccName(''); }
                  setNccDropOpen(true);
                  searchNCC(v);
                }}
                onFocus={() => {
                  setNccDropOpen(true);
                  if (!nccId) searchNCC(nccSearch);
                }}
                className="input-field text-sm pl-7 pr-7 w-full"
                placeholder="Tìm nhà cung cấp..."
              />
              {nccSearch && (
                <button
                  type="button"
                  onClick={() => { setNccSearch(''); setNccId(''); setNccName(''); setNccResults([]); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {nccDropOpen && (nccSearching || nccResults.length > 0) && (
              <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                {nccSearching ? (
                  <div className="px-3 py-2 text-xs text-gray-400">Đang tìm...</div>
                ) : (
                  nccResults.map((ncc) => (
                    <button
                      key={ncc.id}
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors"
                      onClick={() => {
                        setNccId(String(ncc.id));
                        setNccName(ncc.ten_nha_cung_cap);
                        setNccSearch(ncc.ten_nha_cung_cap);
                        setNccDropOpen(false);
                      }}
                    >
                      <span className="font-medium text-gray-900">{ncc.ten_nha_cung_cap}</span>
                    </button>
                  ))
                )}
              </div>
            )}
            {nccId && (
              <div className="mt-1 text-xs text-green-600 font-medium">✓ {nccName}</div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Ghi chú</label>
            <input
              type="text"
              value={ghiChu}
              onChange={(e) => setGhiChu(e.target.value)}
              className="input-field text-sm"
              placeholder="Ghi chú..."
            />
          </div>
        </div>
      </div>

      {/* Chi tiết table */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold text-gray-600 uppercase tracking-widest">Chi tiết sản phẩm hợp đồng</span>
        </div>

        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-2 py-2.5 text-center text-xs font-bold text-gray-600 w-10">STT</th>
                <th className="px-2 py-2.5 text-left text-xs font-bold text-gray-600">TÊN SẢN PHẨM</th>
                <th className="px-2 py-2.5 text-center text-xs font-bold text-gray-600 w-16">ĐV</th>
                <th className="px-2 py-2.5 text-center text-xs font-bold text-gray-600 w-16">SL</th>
                <th className="px-2 py-2.5 text-right text-xs font-bold text-gray-600 w-32">ĐƠN GIÁ</th>
                <th className="px-2 py-2.5 text-right text-xs font-bold text-gray-600 w-32">THÀNH TIỀN</th>
                <th className="px-2 py-2.5 text-center text-xs font-bold text-gray-600 w-20">VAT</th>
                <th className="w-16"></th>
              </tr>
            </thead>
            <tbody>
              {chiTiet.map((row, idx) => (
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
                    <input
                      type="text"
                      value={row.ten_san_pham}
                      onChange={(e) => updateRow(row.tempId, 'ten_san_pham', e.target.value)}
                      className={inputCls}
                      placeholder="Tên sản phẩm..."
                    />
                  </td>
                  <td className="px-1 py-1">
                    <input
                      type="text"
                      value={row.don_vi}
                      onChange={(e) => updateRow(row.tempId, 'don_vi', e.target.value)}
                      className={`${inputCls} text-center`}
                      placeholder="ĐV"
                    />
                  </td>
                  <td className="px-1 py-1">
                    <NumInput
                      value={row.so_luong}
                      onChange={(v) => updateRow(row.tempId, 'so_luong', v)}
                      className={`${inputCls} text-center`}
                      min={1}
                      isInteger
                      format="number"
                    />
                  </td>
                  <td className="px-1 py-1">
                    <NumInput
                      value={row.don_gia}
                      onChange={(v) => updateRow(row.tempId, 'don_gia', v)}
                      className={`${inputCls} text-right text-blue-700`}
                      min={0}
                      isInteger
                      format="money"
                    />
                  </td>
                  <td className="px-2 py-1 text-right text-sm font-semibold text-gray-800 whitespace-nowrap">
                    {row.thanh_tien > 0 ? formatVND(row.thanh_tien) : <span className="text-gray-400">0</span>}
                  </td>
                  <td className="px-1 py-1">
                    <select
                      value={row.thue_suat}
                      onChange={(e) => updateRow(row.tempId, 'thue_suat', Number(e.target.value))}
                      className="w-full px-1 py-1 text-xs text-center border border-gray-200 rounded focus:border-blue-400 focus:ring-1 focus:ring-blue-400 focus:outline-none bg-white"
                    >
                      <option value={0}>0%</option>
                      <option value={8}>8%</option>
                      <option value={10}>10%</option>
                    </select>
                  </td>
                  <td className="px-1 py-1 text-center">
                    <button
                      onClick={() => removeRow(row.tempId)}
                      disabled={chiTiet.length <= 1}
                      className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                      title="Xóa dòng"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button
          onClick={() => insertRowAfter(chiTiet[chiTiet.length - 1]?.tempId ?? null)}
          className="mt-3 w-full py-2 border-2 border-dashed border-gray-300 text-gray-500 rounded-lg text-sm hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-all font-medium"
        >
          + THÊM SẢN PHẨM
        </button>
      </div>

      {/* Summary */}
      <div className="px-4 pb-4">
        <div className="rounded-xl p-4 bg-white border border-gray-200 max-w-sm ml-auto">
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

      {/* Footer */}
      <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 rounded-b-xl flex items-center justify-between">
        <button
          onClick={onCancel}
          className="px-5 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
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
    </div>
  );
}
