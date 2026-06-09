import { useState, useEffect, useRef, useCallback } from 'react';
import { hopDongApi } from '../../lib/api';
import { hopDongLabel, locHopDongConHang } from '../../lib/hopDongGiaoHang';
import { useToastStore } from '../../store/toast';
import { Search, X } from 'lucide-react';
import type { HopDong } from '../../types';

interface HopDongFilterFieldProps {
  value: string;
  onChange: (hopDongId: string) => void;
  /** Lọc theo khách hàng (chuỗi rỗng = tìm tất cả khi cho phép) */
  khachHangId?: string;
  /** Chỉ hiện HĐ còn hàng cần giao (ẩn HĐ đã giao hết) */
  chiConHang?: boolean;
  /** Bắt buộc chọn KH trước */
  requireKhachHang?: boolean;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export default function HopDongFilterField({
  value,
  onChange,
  khachHangId = '',
  chiConHang = false,
  requireKhachHang = false,
  placeholder = 'Tìm số hợp đồng, dự án...',
  className = 'min-w-[220px] sm:min-w-[280px]',
  disabled = false,
}: HopDongFilterFieldProps) {
  const addToast = useToastStore((s) => s.addToast);
  const [hdSearch, setHdSearch] = useState('');
  const [hdResults, setHdResults] = useState<HopDong[]>([]);
  const [hdDropOpen, setHdDropOpen] = useState(false);
  const [hdSearching, setHdSearching] = useState(false);
  const hdDropRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedLabelRef = useRef('');

  const blocked = disabled || (requireKhachHang && !khachHangId);

  const searchHopDong = useCallback(
    (q: string) => {
      if (searchRef.current) clearTimeout(searchRef.current);
      if (blocked) {
        setHdResults([]);
        return;
      }
      searchRef.current = setTimeout(async () => {
        setHdSearching(true);
        try {
          const res = await hopDongApi.list({
            search: q.trim() || undefined,
            khach_hang_id: khachHangId || undefined,
            limit: 40,
          });
          let list = (res.data as HopDong[]) || [];
          if (chiConHang && list.length > 0) {
            list = await locHopDongConHang(list);
          }
          setHdResults(list);
        } catch (err) {
          console.error('Loi tim hop dong:', err);
          setHdResults([]);
          addToast('error', err instanceof Error ? err.message : 'Không thể tìm hợp đồng');
        } finally {
          setHdSearching(false);
        }
      }, 250);
    },
    [khachHangId, chiConHang, blocked, addToast]
  );

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (hdDropRef.current && !hdDropRef.current.contains(e.target as Node)) {
        setHdDropOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    if (!value) {
      setHdSearch('');
      selectedLabelRef.current = '';
    }
  }, [value]);

  useEffect(() => {
    if (value) return;
    setHdSearch('');
    selectedLabelRef.current = '';
    setHdResults([]);
  }, [khachHangId, value]);

  function selectHopDong(hd: HopDong) {
    const label = hopDongLabel(hd);
    selectedLabelRef.current = label;
    setHdSearch(label);
    onChange(String(hd.id));
    setHdDropOpen(false);
    setHdResults([]);
  }

  function clearSelection() {
    selectedLabelRef.current = '';
    setHdSearch('');
    onChange('');
    setHdResults([]);
    setHdDropOpen(false);
  }

  const placeholderText = blocked && requireKhachHang
    ? 'Chọn khách hàng trước'
    : placeholder;

  return (
    <div className={`relative ${className}`} ref={hdDropRef}>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={hdSearch}
          disabled={blocked}
          onChange={(e) => {
            const v = e.target.value;
            setHdSearch(v);
            if (value && v !== selectedLabelRef.current) onChange('');
            setHdDropOpen(true);
            searchHopDong(v);
          }}
          onFocus={() => {
            if (blocked) return;
            setHdDropOpen(true);
            searchHopDong(hdSearch);
          }}
          className={`input-field text-sm pl-8 pr-8 w-full disabled:bg-gray-50 disabled:text-gray-400 ${
            value ? 'border-green-400 ring-1 ring-green-400/25' : ''
          }`}
          placeholder={placeholderText}
        />
        {hdSearch && !blocked && (
          <button
            type="button"
            onClick={clearSelection}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            title="Xóa lọc hợp đồng"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {hdDropOpen && !blocked && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
          {hdSearching ? (
            <div className="px-3 py-2 text-xs text-gray-400">Đang tìm...</div>
          ) : hdResults.length === 0 ? (
            <div className="px-3 py-2 text-xs text-gray-400">
              {chiConHang ? 'Không còn hợp đồng cần giao' : 'Không tìm thấy hợp đồng'}
            </div>
          ) : (
            hdResults.map((hd) => (
              <button
                key={hd.id}
                type="button"
                className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors ${
                  String(hd.id) === value ? 'bg-blue-50 font-medium' : ''
                }`}
                onClick={() => selectHopDong(hd)}
              >
                {hopDongLabel(hd)}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
