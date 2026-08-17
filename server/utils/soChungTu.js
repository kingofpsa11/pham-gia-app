/** Số chứng từ tuần tự theo năm: 01/BG/2026, 01/GH/2026 */

export function formatSoChungTu(stt, kyHieu, nam) {
  return `${String(stt).padStart(2, '0')}/${kyHieu}/${nam}`;
}

export function parseSoChungTu(so, kyHieu) {
  const m = String(so || '').trim().match(new RegExp(`^(\\d+)/${kyHieu}/(\\d{4})$`, 'i'));
  if (!m) return null;
  return { stt: parseInt(m[1], 10), nam: parseInt(m[2], 10) };
}

export function isSoChungTuAuto(so, kyHieu) {
  return !!parseSoChungTu(so, kyHieu);
}

export function nextSoFromList(values, kyHieu, nam) {
  let max = 0;
  for (const so of values || []) {
    const p = parseSoChungTu(so, kyHieu);
    if (p && p.nam === Number(nam)) max = Math.max(max, p.stt);
  }
  return formatSoChungTu(max + 1, kyHieu, nam);
}

export async function nextSoChungTu(queryFn, { table, column, dateColumn, kyHieu, nam }) {
  const year = Number(nam) || new Date().getFullYear();
  const rows = await queryFn(
    `SELECT \`${column}\` AS so FROM \`${table}\` WHERE YEAR(\`${dateColumn}\`) = ?`,
    [year],
  );
  return nextSoFromList((rows || []).map((r) => r.so), kyHieu, year);
}

/** Số HĐ bán: 23/HĐMB/2026/PG- — STT lấy max mọi số dạng n/HĐMB/năm/... trong năm */
export function formatSoHopDongBan(stt, nam) {
  return `${String(stt).padStart(2, '0')}/HĐMB/${nam}/PG-`;
}

export function parseSoHopDongBan(so) {
  const m = String(so || '').trim().match(/^(\d+)\/H[ĐD]MB\/(\d{4})/i);
  if (!m) return null;
  return { stt: parseInt(m[1], 10), nam: parseInt(m[2], 10) };
}

export async function nextSoHopDongBan(queryFn, nam) {
  const year = Number(nam) || new Date().getFullYear();
  const rows = await queryFn(
    'SELECT so_hop_dong AS so FROM hop_dong WHERE YEAR(ngay_hop_dong) = ?',
    [year],
  );
  let max = 0;
  for (const row of rows || []) {
    const p = parseSoHopDongBan(row.so);
    if (p && p.nam === year) max = Math.max(max, p.stt);
  }
  return formatSoHopDongBan(max + 1, year);
}
