const DON_VI = ['', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
const CAP = ['', 'nghìn', 'triệu', 'tỷ'];

function docBaSo(n) {
  const tram = Math.floor(n / 100);
  const chuc = Math.floor((n % 100) / 10);
  const don = n % 10;
  let s = '';
  if (tram > 0) s += `${DON_VI[tram]} trăm`;
  if (chuc === 0 && don > 0 && tram > 0) s += ' lẻ';
  if (chuc === 1) s += `${s ? ' ' : ''}mười`;
  else if (chuc > 1) s += `${s ? ' ' : ''}${DON_VI[chuc]} mươi`;
  if (don === 1 && chuc > 1) s += ' mốt';
  else if (don === 5 && chuc > 0) s += ' lăm';
  else if (don > 0) s += `${s ? ' ' : ''}${DON_VI[don]}`;
  return s.trim();
}

function docNhom(n, showZeroHundred) {
  if (n === 0) return showZeroHundred ? 'không' : '';
  return docBaSo(n);
}

/** Đọc số nguyên (VND) thành chữ tiếng Việt. */
export function soBangChu(n) {
  const num = Math.round(Number(n) || 0);
  if (num === 0) return 'không đồng';
  if (num < 0) return `âm ${soBangChu(-num)}`;

  const groups = [];
  let rest = num;
  while (rest > 0) {
    groups.push(rest % 1000);
    rest = Math.floor(rest / 1000);
  }

  const parts = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i];
    if (g === 0) continue;
    const text = docNhom(g, i < groups.length - 1 && groups.slice(i + 1).some((x) => x > 0 && x < 100));
    if (!text) continue;
    parts.push(`${text}${CAP[i] ? ` ${CAP[i]}` : ''}`);
  }

  const body = parts.join(' ').replace(/\s+/g, ' ').trim();
  return `${body.charAt(0).toUpperCase()}${body.slice(1)} đồng`;
}
