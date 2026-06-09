import type { ReactNode } from 'react';

/** Vùng meta phía trên form báo giá / hợp đồng */
export function EntityFormMetaSection({ children }: { children: ReactNode }) {
  return (
    <div className="px-4 py-4 sm:px-5 sm:py-5 border-b border-gray-100 bg-gray-50/40">
      <div className="space-y-4">{children}</div>
    </div>
  );
}

/** Một hàng field — lưới 12 cột trên màn hình lớn */
export function EntityFormMetaRow({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-x-4 gap-y-3 lg:items-end">
      {children}
    </div>
  );
}

interface EntityFormFieldProps {
  label: string;
  required?: boolean;
  /** Ví dụ: lg:col-span-5 */
  className?: string;
  children: ReactNode;
}

export function EntityFormField({ label, required, className = 'lg:col-span-3', children }: EntityFormFieldProps) {
  return (
    <div className={`min-w-0 ${className}`}>
      <label className="block text-xs font-medium text-gray-600 mb-1.5">
        {label}
        {required ? <span className="text-red-500 ml-0.5">*</span> : null}
      </label>
      {children}
    </div>
  );
}

/** Ô phiên bản chỉ đọc */
export function EntityFormVersionBadge({ value }: { value: string | number }) {
  return (
    <div
      className="h-10 flex items-center justify-center rounded-lg border border-gray-200 bg-white text-sm font-semibold text-primary-700 tabular-nums"
      title="Phiên bản"
    >
      PB{value}
    </div>
  );
}
