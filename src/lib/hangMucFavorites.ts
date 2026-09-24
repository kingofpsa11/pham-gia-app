const STORAGE_KEY = 'dong_tien_hang_muc_hay_dung';

function sanitizeIds(ids: unknown): number[] {
  if (!Array.isArray(ids)) return [];
  const seen = new Set<number>();
  const result: number[] = [];
  for (const raw of ids) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0 || seen.has(n)) continue;
    seen.add(n);
    result.push(n);
  }
  return result;
}

export function loadHangMucHayDung(): number[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return sanitizeIds(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function saveHangMucHayDung(ids: number[]): number[] {
  const unique = sanitizeIds(ids);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(unique));
  return unique;
}

export function toggleHangMucHayDung(ids: number[], id: number): number[] {
  if (ids.includes(id)) return saveHangMucHayDung(ids.filter((x) => x !== id));
  return saveHangMucHayDung([...ids, id]);
}
