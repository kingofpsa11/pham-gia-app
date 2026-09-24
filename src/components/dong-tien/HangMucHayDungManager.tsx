import { useMemo, useState } from 'react';
import { Search, Star, X } from 'lucide-react';
import type { HangMucThuChi } from '../../types';

interface HangMucHayDungManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hangMucList: HangMucThuChi[];
  pinnedIds: number[];
  onChange: (ids: number[]) => void;
}

interface TreeNode {
  item: HangMucThuChi;
  children: TreeNode[];
}

function matchesSearch(hm: HangMucThuChi, q: string): boolean {
  if (!q) return true;
  const hay = `${hm.ten_hang_muc} ${hm.ma_hang_muc}`.toLowerCase();
  return hay.includes(q);
}

function nodeOrDescendantMatches(node: TreeNode, q: string): boolean {
  if (matchesSearch(node.item, q)) return true;
  return node.children.some((c) => nodeOrDescendantMatches(c, q));
}

export default function HangMucHayDungManager({
  open,
  onOpenChange,
  hangMucList,
  pinnedIds,
  onChange,
}: HangMucHayDungManagerProps) {
  const [search, setSearch] = useState('');
  const q = search.trim().toLowerCase();

  const byId = useMemo(
    () => new Map(hangMucList.map((h) => [h.id, h])),
    [hangMucList],
  );

  const roots = useMemo(() => {
    const childrenOf = new Map<number | 'root', HangMucThuChi[]>();
    for (const hm of hangMucList) {
      if (hm.trang_thai === 'an') continue;
      const key = hm.parent_id ?? 'root';
      const arr = childrenOf.get(key) || [];
      arr.push(hm);
      childrenOf.set(key, arr);
    }
    for (const arr of childrenOf.values()) {
      arr.sort((a, b) => (a.thu_tu ?? 0) - (b.thu_tu ?? 0));
    }
    const walk = (parentId: number | 'root'): TreeNode[] =>
      (childrenOf.get(parentId) || []).map((item) => ({
        item,
        children: walk(item.id),
      }));
    return walk('root');
  }, [hangMucList]);

  const pinnedItems = pinnedIds
    .map((id) => byId.get(id))
    .filter((h): h is HangMucThuChi => !!h && h.trang_thai !== 'an');

  function pathLabel(hm: HangMucThuChi): string {
    const names: string[] = [];
    let cur: HangMucThuChi | undefined = hm;
    const seen = new Set<number>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      names.unshift(cur.ten_hang_muc);
      cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
    }
    return names.join(' › ');
  }

  function toggle(id: number) {
    onChange(
      pinnedIds.includes(id)
        ? pinnedIds.filter((x) => x !== id)
        : [...pinnedIds, id],
    );
  }

  if (!open) return null;

  function renderNode(node: TreeNode, depth: number) {
    if (q && !nodeOrDescendantMatches(node, q)) return null;
    const hm = node.item;
    const pinned = pinnedIds.includes(hm.id);
    const highlight = q && matchesSearch(hm, q);
    return (
      <div key={hm.id}>
        <button
          type="button"
          onClick={() => toggle(hm.id)}
          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-sm transition-colors ${
            pinned ? 'bg-amber-50 hover:bg-amber-100' : 'hover:bg-gray-50'
          }`}
          style={{ paddingLeft: 8 + depth * 16 }}
        >
          <Star
            className={`w-4 h-4 flex-shrink-0 ${
              pinned ? 'fill-amber-400 text-amber-500' : 'text-gray-300'
            }`}
          />
          <span className={`flex-1 min-w-0 ${hm.parent_id ? 'text-gray-800' : 'font-semibold text-teal-800'} ${highlight ? 'underline decoration-amber-400' : ''}`}>
            {hm.ten_hang_muc}
          </span>
          {!hm.parent_id && (
            <span className="text-[10px] uppercase tracking-wide text-gray-400 flex-shrink-0">Nhóm lớn</span>
          )}
        </button>
        {node.children.map((c) => renderNode(c, depth + 1))}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={() => onOpenChange(false)} aria-hidden="true" />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Hạng mục hay dùng</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Chọn mục thường dùng để hiện trên đầu danh sách — vẫn giữ phân nhóm hạng mục lớn bên dưới
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            aria-label="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-gray-100 flex-shrink-0 space-y-3">
          {pinnedItems.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {pinnedItems.map((hm) => (
                <button
                  key={hm.id}
                  type="button"
                  onClick={() => toggle(hm.id)}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-50 text-amber-800 text-xs font-medium border border-amber-200 hover:bg-amber-100"
                  title="Bỏ ghim"
                >
                  <Star className="w-3 h-3 fill-amber-400 text-amber-500" />
                  {pathLabel(hm)}
                  <X className="w-3 h-3 text-amber-500" />
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400">Chưa ghim mục nào — bấm ngôi sao trong danh sách bên dưới.</p>
          )}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm hạng mục..."
              className="input-field w-full pl-9 text-sm"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2">
          {roots.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Chưa có hạng mục</p>
          ) : (
            roots.map((root) => {
              if (q && !nodeOrDescendantMatches(root, q)) return null;
              return (
                <div key={root.item.id} className="mb-3">
                  <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-teal-700 bg-teal-50 rounded-md mb-1">
                    {root.item.ten_hang_muc}
                  </div>
                  {renderNode(root, 0)}
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200 flex-shrink-0">
          <span className="text-xs text-gray-500">{pinnedItems.length} mục đã ghim</span>
          <button type="button" className="btn-primary text-sm" onClick={() => onOpenChange(false)}>
            Xong
          </button>
        </div>
      </div>
    </div>
  );
}
