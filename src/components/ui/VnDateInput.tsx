import { Calendar } from 'lucide-react';
import { isoToVN, vnToISO } from '../../lib/utils';

interface VnDateInputProps {
  value: string;
  onChange: (vnDate: string) => void;
  className?: string;
  placeholder?: string;
}

/** Nhập dd/mm/yyyy hoặc chọn từ lịch (lưu định dạng Việt Nam). */
export default function VnDateInput({
  value,
  onChange,
  className = 'input-field text-sm w-full',
  placeholder = 'dd/mm/yyyy',
}: VnDateInputProps) {
  const isoValue = vnToISO(value);

  function onPickerChange(iso: string) {
    if (!iso) return;
    onChange(isoToVN(iso));
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={className}
        placeholder={placeholder}
        maxLength={10}
        inputMode="numeric"
      />
      <div className="relative shrink-0">
        <input
          type="date"
          value={isoValue}
          onChange={(e) => onPickerChange(e.target.value)}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          title="Chọn ngày"
        />
        <span className="flex items-center justify-center w-10 h-10 rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:border-primary-400 pointer-events-none">
          <Calendar className="w-4 h-4" />
        </span>
      </div>
    </div>
  );
}
