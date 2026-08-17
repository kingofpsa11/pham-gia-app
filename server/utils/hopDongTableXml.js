function escXml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtNum(n) {
  return new Intl.NumberFormat('vi-VN').format(Math.round(Number(n) || 0));
}

function cell(text, { bold = false, align = 'left', colspan } = {}) {
  const jc = align === 'center' ? 'center' : align === 'right' ? 'right' : 'left';
  const tcPrParts = [];
  if (colspan) tcPrParts.push(`<w:gridSpan w:val="${colspan}"/>`);
  tcPrParts.push('<w:tcMar><w:top w:w="60" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tcMar>');
  const tcPr = `<w:tcPr>${tcPrParts.join('')}</w:tcPr>`;
  const rPr = bold ? '<w:b/><w:bCs/>' : '';
  const sz = '<w:sz w:val="22"/><w:szCs w:val="22"/>';
  return `<w:tc>${tcPr}<w:p><w:pPr><w:jc w:val="${jc}"/></w:pPr><w:r><w:rPr>${rPr}${sz}</w:rPr><w:t xml:space="preserve">${escXml(text)}</w:t></w:r></w:p></w:tc>`;
}

function row(cells) {
  return `<w:tr>${cells.join('')}</w:tr>`;
}

function summaryRow(label, value) {
  return row([
    cell(label, { bold: true, align: 'center', colspan: 5 }),
    cell(fmtNum(value), { bold: true, align: 'right' }),
    cell('', {}),
  ]);
}

function vatRowsByRate(items) {
  const map = new Map();
  for (const item of items) {
    const rate = Number(item.thue_suat) || 0;
    if (!rate) continue;
    const base = Number(item.so_luong) * (Number(item.gia_hop_dong) || 0);
    map.set(rate, (map.get(rate) || 0) + (base * rate) / 100);
  }
  return [...map.entries()].sort((a, b) => b[0] - a[0]);
}

/** Tạo bảng Word XML: TT | Các thiết bị | ĐV | SL | ĐG | TT | Thuế suất + tổng */
export function buildHopDongChiTietTableXml(items) {
  const header = row([
    cell('TT', { bold: true, align: 'center' }),
    cell('Các thiết bị', { bold: true, align: 'center' }),
    cell('ĐV', { bold: true, align: 'center' }),
    cell('Số lượng', { bold: true, align: 'center' }),
    cell('Đơn giá (VNĐ)', { bold: true, align: 'center' }),
    cell('Thành tiền (VNĐ)', { bold: true, align: 'center' }),
    cell('Thuế suất', { bold: true, align: 'center' }),
  ]);

  const dataRows = (items || []).map((item, idx) => {
    const sl = Number(item.so_luong) || 0;
    const gia = Number(item.gia_hop_dong) || 0;
    const tt = sl * gia;
    const thue = Number(item.thue_suat);
    return row([
      cell(String(idx + 1), { align: 'center' }),
      cell(item.ten_san_pham || '', { align: 'left' }),
      cell(item.don_vi || '', { align: 'center' }),
      cell(fmtNum(sl), { align: 'right' }),
      cell(fmtNum(gia), { align: 'right' }),
      cell(fmtNum(tt), { align: 'right' }),
      cell(thue ? `${thue}%` : '', { align: 'center' }),
    ]);
  });

  const tongTruocThue = (items || []).reduce(
    (s, i) => s + Number(i.so_luong) * (Number(i.gia_hop_dong) || 0),
    0,
  );
  const vatLines = vatRowsByRate(items || []);
  const tongVat = vatLines.reduce((s, [, amt]) => s + amt, 0);
  const tongSauThue = tongTruocThue + tongVat;

  const footer = [
    summaryRow('Tổng giá trị trước thuế', tongTruocThue),
    ...vatLines.map(([rate, amt]) => summaryRow(`Thuế VAT ${rate}%`, amt)),
    summaryRow('Tổng giá trị sau thuế', tongSauThue),
  ];

  const borders =
    '<w:tblBorders>' +
    '<w:top w:val="single" w:sz="4" w:space="0" w:color="000000"/>' +
    '<w:left w:val="single" w:sz="4" w:space="0" w:color="000000"/>' +
    '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/>' +
    '<w:right w:val="single" w:sz="4" w:space="0" w:color="000000"/>' +
    '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="000000"/>' +
    '<w:insideV w:val="single" w:sz="4" w:space="0" w:color="000000"/>' +
    '</w:tblBorders>';

  const grid =
    '<w:tblGrid>' +
    '<w:gridCol w:w="520"/>' +
    '<w:gridCol w:w="3600"/>' +
    '<w:gridCol w:w="700"/>' +
    '<w:gridCol w:w="900"/>' +
    '<w:gridCol w:w="1300"/>' +
    '<w:gridCol w:w="1400"/>' +
    '<w:gridCol w:w="900"/>' +
    '</w:tblGrid>';

  return (
    '<w:tbl>' +
    '<w:tblPr><w:tblW w:w="5000" w:type="pct"/>' +
    borders +
    '</w:tblPr>' +
    grid +
    header +
    dataRows.join('') +
    footer.join('') +
    '</w:tbl>'
  );
}

const MARKER = '{{BANG_CHI_TIET}}';
const P_OPEN_RE = /<w:p(?:\s|>)/g;

/** Tìm đúng 1 đoạn <w:p> chứa marker (không nuốt từ đầu document). */
function findParagraphBounds(documentXml, markerIdx) {
  let pStart = -1;
  let m;
  P_OPEN_RE.lastIndex = 0;
  while ((m = P_OPEN_RE.exec(documentXml)) !== null) {
    if (m.index > markerIdx) break;
    pStart = m.index;
  }
  if (pStart === -1) return null;

  const pEnd = documentXml.indexOf('</w:p>', markerIdx);
  if (pEnd === -1) return null;

  return { pStart, pEnd: pEnd + '</w:p>'.length };
}

/** Thay đoạn {{BANG_CHI_TIET}} trong document.xml bằng bảng Word */
export function injectChiTietTable(documentXml, tableXml) {
  const markerIdx = documentXml.indexOf(MARKER);
  if (markerIdx === -1) {
    throw new Error('Không tìm thấy {{BANG_CHI_TIET}} trong mẫu Word');
  }

  const bounds = findParagraphBounds(documentXml, markerIdx);
  if (!bounds) {
    throw new Error('Không xác định được đoạn chứa {{BANG_CHI_TIET}}');
  }

  return documentXml.slice(0, bounds.pStart) + tableXml + documentXml.slice(bounds.pEnd);
}
