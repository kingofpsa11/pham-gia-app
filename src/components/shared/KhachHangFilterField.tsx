import { useState, useEffect, useRef, useCallback } from 'react';
import { khachHangApi } from '../../lib/api';
import { useToastStore } from '../../store/toast';
import { Search, X } from 'lucide-react';
import type { KhachHang } from '../../types';

interface KhachHangFilterFieldProps {
  /** ID khách hàng đang lọc (chuỗi rỗng = tất cả) */
  value: string;
  onChange: (khachHangId: string) => void;
  placeholder?: string;
  className?: string;
}

/** Ô lọc khách hàng có tìm kiếm — dùng trên danh sách báo giá, hợp đồng, ... */
export default function KhachHangFilterField({
  value,
  onChange,
  placeholder = 'Tìm khách hàng...',
  className = 'min-w-[220px] sm:min-w-[280px]',
}: KhachHangFilterFieldProps) {
  const addToast = useToastStore((s) => s.addToast);
  const [khSearch, setKhSearch] = useState('');
  const [khResults, setKhResults] = useState<KhachHang[]>([]);
  const [khDropOpen, setKhDropOpen] = useState(false);
  const [khSearching, setKhSearching] = useState(false);
  const khDropRef = useRef<HTMLDivElement>(null);
  const searchKhRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedNameRef = useRef('');

  const searchKhachHang = useCallback((q: string) => {
    if (searchKhRef.current) clearTimeout(searchKhRef.current);
    if (!q.trim()) {
      setKhResults([]);
      return;
    }
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
    function handleClick(e: MouseEvent) {
      if (khDropRef.current && !khDropRef.current.contains(e.target as Node)) {
        setKhDropOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    if (!value) {
      setKhSearch('');
      selectedNameRef.current = '';
    }
  }, [value]);

  function selectKhachHang(kh: KhachHang) {
    selectedNameRef.current = kh.ten_cong_ty;
    setKhSearch(kh.ten_cong_ty);
    onChange(String(kh.id));
    setKhDropOpen(false);
    setKhResults([]);
  }

  function clearSelection() {
    selectedNameRef.current = '';
    setKhSearch('');
    onChange('');
    setKhResults([]);
    setKhDropOpen(false);
  }

  return (
    <div className={`relative ${className}`} ref={khDropRef}>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={khSearch}
          onChange={(e) => {
            const v = e.target.value;
            setKhSearch(v);
            if (value && v !== selectedNameRef.current) {
              onChange('');
            }
            setKhDropOpen(true);
            searchKhachHang(v);
          }}
          onFocus={() => {
            setKhDropOpen(true);
            if (khSearch.trim()) searchKhachHang(khSearch);
          }}
          className={`input-field text-sm pl-8 pr-8 w-full ${value ? 'border-green-400 ring-1 ring-green-400/25' : ''}`}
          placeholder={placeholder}
        />
        {khSearch && (
          <button
            type="button"
            onClick={clearSelection}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            title="Xóa lọc khách hàng"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {khDropOpen && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
          {!khSearch.trim() ? (
            <div className="px-3 py-2 text-xs text-gray-400">Nhập tên để tìm khách hàng</div>
          ) : khSearching ? (
            <div className="px-3 py-2 text-xs text-gray-400">Đang tìm...</div>
          ) : khResults.length === 0 ? (
            <div className="px-3 py-2 text-xs text-gray-400">Không tìm thấy khách hàng</div>
          ) : (
            khResults.map((kh) => (
              <button
                key={kh.id}
                type="button"
                className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors ${
                  String(kh.id) === value ? 'bg-blue-50 font-medium' : ''
                }`}
                onClick={() => selectKhachHang(kh)}
              >
                {kh.ten_cong_ty}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
