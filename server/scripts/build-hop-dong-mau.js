/**
 * Tạo file mẫu hợp đồng Word có placeholder từ file gốc của user.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import PizZip from 'pizzip';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const input = process.argv[2] || 'c:/Users/ASUS/Downloads/Hợp đồng mẫu.docx';
const output = path.join(__dirname, '../../uploads/templates/Mau-hop-dong-Pham-Gia.docx');

const buf = fs.readFileSync(input);
const zip = new PizZip(buf);

const xmlPatches = [
  ['Cung cấp vật tư thiết bị chiếu sáng', '{{TEN_DU_AN}}'],
  [
    ': Bốn trăm mười hai triệu, bốn trăm chín mươi tám nghìn, năm trăm đồng./.)',
    ': {{TONG_BANG_CHU}}./.)',
  ],
];

function patchXml(xml) {
  let out = xml;
  for (const [from, to] of xmlPatches) {
    out = out.split(from).join(to);
  }
  return out;
}

const docPath = 'word/document.xml';
const orig = zip.file(docPath).asText();
zip.file(docPath, patchXml(orig));

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }));
console.log('Created:', output);
