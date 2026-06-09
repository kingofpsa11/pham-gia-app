import { queryOne } from '../db.js';

const LOAI_PREFIX = {
  thu: 'THU',
  chi: 'CHI',
  chuyen_khoan_noi_bo: 'CK',
  dieu_chinh_so_du: 'DC',
  tat_ca: 'HM',
};

export function removeVietnameseAccents(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd');
}

/** Tạo token mã từ tên hạng mục (VD: "Chi lương" → "LUNG"). */
export function slugFromTenHangMuc(ten) {
  const plain = removeVietnameseAccents(ten)
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .trim();
  if (!plain) return 'HM';

  const words = plain.split(/\s+/).filter(Boolean);
  if (words.length === 1) {
    return words[0].toUpperCase().slice(0, 10);
  }
  return words
    .map((w) => w[0] || '')
    .join('')
    .toUpperCase()
    .slice(0, 10);
}

export async function maHangMucExists(ma) {
  const row = await queryOne('SELECT id FROM hang_muc_thu_chi WHERE ma_hang_muc = ? LIMIT 1', [ma]);
  return !!row;
}

/** Sinh mã duy nhất: CHA.SLUG hoặc THU.SLUG (cấp 1). */
export async function generateMaHangMuc({ parentId, tenHangMuc, loaiGiaoDich }) {
  const parent = parentId
    ? await queryOne('SELECT ma_hang_muc, loai_giao_dich FROM hang_muc_thu_chi WHERE id = ?', [parentId])
    : null;
  const slug = slugFromTenHangMuc(tenHangMuc);
  const prefix = LOAI_PREFIX[loaiGiaoDich] || LOAI_PREFIX.tat_ca;
  const base = parent ? `${parent.ma_hang_muc}.${slug}` : `${prefix}.${slug}`;

  let candidate = base;
  let seq = 2;
  while (await maHangMucExists(candidate)) {
    candidate = `${base}${seq}`;
    seq += 1;
  }
  return candidate;
}

export async function getHangMucParent(parentId) {
  if (!parentId) return null;
  return queryOne('SELECT * FROM hang_muc_thu_chi WHERE id = ?', [parentId]);
}

export async function nextThuTu(parentId) {
  if (parentId) {
    const row = await queryOne(
      'SELECT COALESCE(MAX(thu_tu), 0) AS m FROM hang_muc_thu_chi WHERE parent_id = ?',
      [parentId],
    );
    return Number(row?.m || 0) + 1;
  }
  const row = await queryOne(
    'SELECT COALESCE(MAX(thu_tu), 0) AS m FROM hang_muc_thu_chi WHERE parent_id IS NULL',
  );
  return Number(row?.m || 0) + 1;
}

/** Tối đa 3 cấp: cha phải có cap_do <= 2. */
export async function assertValidParent(parentId) {
  if (!parentId) return { capDo: 1, parent: null };
  const parent = await getHangMucParent(parentId);
  if (!parent) {
    const err = new Error('Hạng mục cha không tồn tại');
    err.status = 400;
    throw err;
  }
  if (Number(parent.cap_do) >= 3) {
    const err = new Error('Hạng mục cấp 3 không thể có hạng mục con (tối đa 3 cấp)');
    err.status = 400;
    throw err;
  }
  return { capDo: Number(parent.cap_do) + 1, parent };
}

export async function assertNotDescendant(itemId, newParentId) {
  if (!itemId || !newParentId || Number(itemId) === Number(newParentId)) {
    const err = new Error('Không thể chọn chính nó hoặc hạng mục con làm cha');
    err.status = 400;
    throw err;
  }
  let cur = await getHangMucParent(newParentId);
  while (cur) {
    if (Number(cur.id) === Number(itemId)) {
      const err = new Error('Không thể chọn hạng mục con làm cha');
      err.status = 400;
      throw err;
    }
    cur = cur.parent_id ? await getHangMucParent(cur.parent_id) : null;
  }
}
