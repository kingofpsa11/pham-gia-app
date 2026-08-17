/**
 * Chuẩn bị mẫu Word đề nghị tạm ứng / thanh toán.
 * Tách 2 trang trong file mẫu thành 2 file riêng và chèn placeholder.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import PizZip from 'pizzip';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultIn = String.raw`g:\My Drive\00 Phạm Gia\2026\Hợp đồng\19 Pidi - LĐ 146\Đầu ra\Đề nghị thanh toán.docx`;
const outDir = process.argv[3] || path.join(__dirname, '../templates');
const input = process.argv[2] || defaultIn;

fs.mkdirSync(outDir, { recursive: true });

function replaceAcrossRuns(xml, from, to) {
  if (xml.includes(from)) return xml.split(from).join(to);
  const chars = [...from];
  let pattern = '';
  for (let i = 0; i < chars.length; i++) {
    pattern += chars[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (i < chars.length - 1) pattern += '(?:<(?!/w:p)[^>]+>)*';
  }
  const re = new RegExp(pattern, 'g');
  const next = xml.replace(re, () => to);
  if (next === xml) console.warn('NOT FOUND:', from.slice(0, 70));
  return next;
}

function applyPlaceholders(xml) {
  let out = xml;
  const pairs = [
    ['19/HĐMB/2026/PG-PD', '{{so_hop_dong}}'],
    ['Hà Nội, ngày 10 tháng 07 năm 2026', 'Hà Nội, ngày {{ngay}} tháng {{thang}} năm {{nam}}'],
    ['Hà Nội, ngày 08 tháng 07 năm 2026', 'Hà Nội, ngày {{ngay}} tháng {{thang}} năm {{nam}}'],
    ['CÔNG TY CỔ PHẦN ĐẦU TƯ VÀ XÂY LẮP KỸ THUẬT HẠ TẦNG PIDI', '{{ten_cong_ty}}'],
    ['Công Ty Cổ Phần Đầu Tư Và Xây Lắp Kỹ Thuật Hạ Tầng PIDI', '{{ten_cong_ty}}'],
    ['ký ngày 10/07/2026', 'ký ngày {{ngay_hop_dong}}'],
    ['ký ngày 09/06/2026', 'ký ngày {{ngay_hop_dong}}'],
    ['559.000.000', '{{so_tien}}'],
    ['71.312.800', '{{so_tien}}'],
    ['Năm trăm năm mươi chín triệu đồng.', '{{so_tien_bang_chu}}'],
    ['Bảy mươi mốt triệu, ba trăm mười hai nghìn, tám trăm đồng.', '{{so_tien_bang_chu}}'],
    ['ngày 13/07/2026', 'ngày {{ngay_ban_giao}}'],
    ['Số: 1007/2026/PG', 'Số: {{so_van_ban}}'],
    ['Số: 0807/2026/PG', 'Số: {{so_van_ban}}'],
    ['V/v: Đề nghị tạm ứng', 'V/v: {{tieu_de}}'],
    ['V/v: Đề nghị thanh toán và thông báo giao hàng', 'V/v: {{tieu_de}}'],
    ['Phạm Mạnh Hà', '{{nguoi_ky}}'],
  ];
  for (const [from, to] of pairs) out = replaceAcrossRuns(out, from, to);
  return out;
}

function splitBodyXml(xml) {
  const bodyMatch = xml.match(/<w:body>([\s\S]*)<\/w:body>/);
  if (!bodyMatch) throw new Error('No w:body');
  const body = bodyMatch[1];
  const parts = [];
  let pos = 0;
  while (pos < body.length) {
    if (body.startsWith('<w:sectPr', pos)) {
      parts.push({ type: 'sect', xml: body.slice(pos), text: '' });
      break;
    }
    if (body.startsWith('<w:p', pos) || body.startsWith('<w:tbl', pos)) {
      const tag = body.startsWith('<w:p', pos) ? 'p' : 'tbl';
      const close = `</w:${tag}>`;
      const end = body.indexOf(close, pos);
      if (end === -1) throw new Error('unclosed ' + tag);
      const full = body.slice(pos, end + close.length);
      parts.push({
        type: tag,
        xml: full,
        text: [...full.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(''),
      });
      pos = end + close.length;
    } else {
      pos += 1;
    }
  }

  let headerHits = 0;
  let splitAt = -1;
  for (let i = 0; i < parts.length; i++) {
    const t = parts[i].text || '';
    if (/CÔNG TY TNHH ĐTXD/i.test(t) && /CỘNG HÒA XÃ HỘI/i.test(t)) {
      headerHits += 1;
      if (headerHits === 2) {
        splitAt = i;
        break;
      }
    }
  }
  if (splitAt < 0) throw new Error('Cannot find start of second letter');

  const sect = parts.find((p) => p.type === 'sect')?.xml || '<w:sectPr/>';
  const letter1 = parts.slice(0, splitAt).filter((p) => p.type !== 'sect').map((p) => p.xml).join('') + sect;
  const letter2 = parts.slice(splitAt).filter((p) => p.type !== 'sect').map((p) => p.xml).join('') + sect;
  return { letter1, letter2 };
}

const buf = fs.readFileSync(input);
const zip = new PizZip(buf);
const xmlPath = 'word/document.xml';
const xml = zip.file(xmlPath).asText();
const { letter1, letter2 } = splitBodyXml(xml);

function wrapBody(bodyInner) {
  return xml.replace(/<w:body>[\s\S]*<\/w:body>/, `<w:body>${bodyInner}</w:body>`);
}

function writeDoc(name, bodyInner) {
  const z = new PizZip(buf);
  const prepared = applyPlaceholders(wrapBody(bodyInner));
  z.file(xmlPath, prepared);
  const out = path.join(outDir, name);
  fs.writeFileSync(out, z.generate({ type: 'nodebuffer' }));
  const plain = [...prepared.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('');
  const ph = [...new Set([...plain.matchAll(/\{\{[^}]+\}\}/g)].map((m) => m[0]))];
  console.log('Wrote', name);
  console.log('  placeholders:', ph.join(', ') || '(none)');
  if (/19\/HĐMB/.test(plain)) console.warn('  WARNING: leftover HĐ number');
  console.log('  preview:', plain.slice(0, 220).replace(/\s+/g, ' '));
}

writeDoc('mau_de_nghi_tam_ung.docx', letter1);
writeDoc('mau_de_nghi_thanh_toan.docx', letter2);
