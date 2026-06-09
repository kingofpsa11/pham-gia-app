/** DB lưu ngay_giao_dich đúng giờ người dùng nhập (không chuyển UTC). */

function pad2(n) {
  return String(n).padStart(2, '0');
}

function wallClockToDbString(y, mo, day, h = 0, mi = 0, se = 0) {
  return `${y}-${pad2(mo)}-${pad2(day)} ${pad2(h)}:${pad2(mi)}:${pad2(se)}`;
}

function nowWallClockString() {
  const now = new Date();
  return wallClockToDbString(
    now.getFullYear(),
    now.getMonth() + 1,
    now.getDate(),
    now.getHours(),
    now.getMinutes(),
    now.getSeconds(),
  );
}

function parseWallClockParts(d, m, y, h, mi, se) {
  const mo = parseInt(m, 10);
  const day = parseInt(d, 10);
  const year = parseInt(y, 10);
  if (mo < 1 || mo > 12 || day < 1 || day > 31) return null;
  return wallClockToDbString(
    year,
    mo,
    day,
    h != null ? parseInt(h, 10) : 0,
    mi != null ? parseInt(mi, 10) : 0,
    se != null ? parseInt(se, 10) : 0,
  );
}

/** yyyy-mm-dd HH:mm:ss trong DB → dd/mm/yyyy [HH:mm:ss] (không đổi múi giờ). */
export function formatNgayGiaoDichUtcToVn(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const isoT = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  if (isoT) {
    return `${isoT[3]}/${isoT[2]}/${isoT[1]} ${isoT[4]}:${isoT[5]}:${isoT[6]}`;
  }
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?/);
  if (!m) return s;
  const base = `${m[3]}/${m[2]}/${m[1]}`;
  return m[4] !== undefined ? `${base} ${m[4]}:${m[5]}:${m[6]}` : base;
}

/** Ngày hạch toán (yyyy-mm-dd) từ giá trị người dùng nhập. */
export function parseNgayHachToan(raw) {
  const s = String(raw || '').trim();
  const dmySlash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmySlash) return `${dmySlash[3]}-${pad2(dmySlash[2])}-${pad2(dmySlash[1])}`;
  const dmyDash = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (dmyDash) return `${dmyDash[3]}-${pad2(dmyDash[2])}-${pad2(dmyDash[1])}`;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return parseNgayGiaoDich(raw).slice(0, 10);
}

/** Giá trị người nhập → lưu DB (yyyy-mm-dd HH:mm:ss), giữ nguyên giờ. */
export function parseNgayGiaoDich(raw) {
  const s = String(raw || '').trim();
  if (!s) return nowWallClockString();

  const dmySlash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?/);
  if (dmySlash) {
    const parsed = parseWallClockParts(dmySlash[1], dmySlash[2], dmySlash[3], dmySlash[4], dmySlash[5], dmySlash[6]);
    if (parsed) return parsed;
  }

  const dmyDash = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?/);
  if (dmyDash) {
    const parsed = parseWallClockParts(dmyDash[1], dmyDash[2], dmyDash[3], dmyDash[4], dmyDash[5], dmyDash[6]);
    if (parsed) return parsed;
  }

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?/);
  if (iso) {
    const parsed = parseWallClockParts(iso[3], iso[2], iso[1], iso[4], iso[5], iso[6]);
    if (parsed) return parsed;
  }

  return nowWallClockString();
}
