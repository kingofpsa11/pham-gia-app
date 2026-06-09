import type { ReactNode } from 'react';

export interface EntityInfoField {
  label: string;
  value: ReactNode;
}

interface EntityInfoPanelProps {
  /** Bỏ title khi thông tin đã có ở tiêu đề trang */
  title?: string;
  fields: EntityInfoField[];
  /** Gắn dưới header, không dùng card lớn */
  embedded?: boolean;
}

/** Khối thông tin dạng nhãn: giá trị trên một dòng, chiều cao thấp. */
export default function EntityInfoPanel({ title, fields, embedded = false }: EntityInfoPanelProps) {
  const body = (
    <div className={`flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm ${embedded ? 'px-3 py-2' : 'px-4 py-2.5'}`}>
      {fields.map((field, index) => (
        <div
          key={`${field.label}-${index}`}
          className="inline-flex items-center gap-1.5 min-w-0 max-w-full"
        >
          <span className="text-gray-500 whitespace-nowrap">{field.label}:</span>
          <span className="font-semibold text-gray-900 min-w-0">{field.value}</span>
        </div>
      ))}
    </div>
  );

  if (embedded) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50">
        {title ? (
          <div className="px-3 py-1.5 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
          </div>
        ) : null}
        {body}
      </div>
    );
  }

  return (
    <div className="card">
      {title ? (
        <div className="px-4 py-2 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        </div>
      ) : null}
      {body}
    </div>
  );
}
