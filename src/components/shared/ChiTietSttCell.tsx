import { ArrowUp, Plus } from 'lucide-react';

interface ChiTietSttCellProps {
  index: number;
  onInsertBefore: () => void;
  onInsertAfter: () => void;
}

/** Cột STT: 2 nút thêm dòng xếp dọc (trái) · số thứ tự (phải). */
export default function ChiTietSttCell({ index, onInsertBefore, onInsertAfter }: ChiTietSttCellProps) {
  const btnCls =
    'p-1 rounded-md border opacity-0 group-hover:opacity-100 transition-opacity shadow-sm';

  return (
    <td className="px-1.5 py-1 align-middle w-[3.75rem]">
      <div className="flex items-center justify-center gap-1">
        <div className="flex flex-col items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={onInsertBefore}
            title="Thêm dòng phía trên"
            className={`${btnCls} bg-sky-100 text-sky-700 border-sky-200/80 hover:bg-sky-200 hover:text-sky-800`}
          >
            <ArrowUp className="w-3.5 h-3.5" strokeWidth={2.5} />
          </button>
          <button
            type="button"
            onClick={onInsertAfter}
            title="Thêm dòng bên dưới"
            className={`${btnCls} bg-emerald-100 text-emerald-700 border-emerald-200/80 hover:bg-emerald-200 hover:text-emerald-800`}
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
          </button>
        </div>
        <span className="shrink-0 inline-flex items-center justify-center min-w-[1.5rem] h-7 px-1.5 rounded-md bg-slate-100 text-slate-800 border border-slate-200 text-xs font-bold tabular-nums">
          {index}
        </span>
      </div>
    </td>
  );
}
