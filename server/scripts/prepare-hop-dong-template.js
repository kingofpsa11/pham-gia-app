/**
 * Chèn placeholder vào mẫu hợp đồng Word.
 * Usage: node server/scripts/prepare-hop-dong-template.js <input.docx> <output.docx>
 */
import fs from 'fs';
import PizZip from 'pizzip';

const input = process.argv[2];
const output = process.argv[3];
if (!input || !output) {
  console.error('Usage: node prepare-hop-dong-template.js <input.docx> <output.docx>');
  process.exit(1);
}

const buf = fs.readFileSync(input);
const zip = new PizZip(buf);

// Thay thế theo ngữ cảnh — từ cụ thể → chung, tránh thay nhầm
const replacements = [
  // Số HĐ / ngày tháng (pattern phổ biến trong mẫu VN)
  [/Số\s*:\s*[\d\/A-Za-z.-]+/gi, 'Số: {{so_hop_dong}}'],
  [/số\s*:\s*[\d\/A-Za-z.-]+/gi, 'số: {{so_hop_dong}}'],
  [/HĐ\s*[-–]?\s*[\d\/]+/gi, '{{so_hop_dong}}'],
  [/HD\s*[-–]?\s*[\d\/]+/gi, '{{so_hop_dong}}'],

  // Ngày ký
  [/ngày\s+\d{1,2}\s+tháng\s+\d{1,2}\s+năm\s+\d{4}/gi, 'ngày {{ngay}} tháng {{thang}} năm {{nam}}'],
  [/Ngày\s+\d{1,2}\s+tháng\s+\d{1,2}\s+năm\s+\d{4}/gi, 'Ngày {{ngay}} tháng {{thang}} năm {{nam}}'],
  [/ngày\s+…+\s+tháng\s+…+\s+năm\s+…+/gi, 'ngày {{ngay}} tháng {{thang}} năm {{nam}}'],
  [/Ngày\s+…+\s+tháng\s+…+\s+năm\s+…+/gi, 'Ngày {{ngay}} tháng {{thang}} năm {{nam}}'],

  // Bên mua / khách hàng
  [/Công ty\s+[^\n]{3,80}/gi, 'Công ty {{ten_cong_ty}}'],
  [/công ty\s+[^\n]{3,80}/gi, 'công ty {{ten_cong_ty}}'],
  [/Mã số thuế\s*:\s*[\d-]+/gi, 'Mã số thuế: {{ma_so_thue}}'],
  [/mã số thuế\s*:\s*[\d-]+/gi, 'mã số thuế: {{ma_so_thue}}'],
  [/Địa chỉ\s*:\s*[^\n]{5,120}/gi, 'Địa chỉ: {{dia_chi}}'],
  [/địa chỉ\s*:\s*[^\n]{5,120}/gi, 'địa chỉ: {{dia_chi}}'],
  [/Điện thoại\s*:\s*[\d\s.+()-]{8,20}/gi, 'Điện thoại: {{dien_thoai}}'],
  [/điện thoại\s*:\s*[\d\s.+()-]{8,20}/gi, 'điện thoại: {{dien_thoai}}'],
  [/Email\s*:\s*[^\s\n@]+@[^\s\n]+/gi, 'Email: {{email}}'],
  [/email\s*:\s*[^\s\n@]+@[^\s\n]+/gi, 'email: {{email}}'],
  [/Đại diện\s*:\s*(Ông|Bà|Mr|Mrs|Ms)?\s*[^\n]{3,60}/gi, 'Đại diện: {{nguoi_dai_dien}}'],
  [/Chức vụ\s*:\s*[^\n]{3,40}/gi, 'Chức vụ: {{chuc_vu}}'],
  [/Tài khoản\s*:\s*[\d\s-]{8,30}/gi, 'Tài khoản: {{tai_khoan_ngan_hang}}'],

  // Dự án / nội dung
  [/Dự án\s*:\s*[^\n]{3,80}/gi, 'Dự án: {{ten_du_an}}'],
  [/dự án\s*:\s*[^\n]{3,80}/gi, 'dự án: {{ten_du_an}}'],
  [/Tên dự án\s*:\s*[^\n]{3,80}/gi, 'Tên dự án: {{ten_du_an}}'],

  // Tổng tiền
  [/Tổng\s+cộng\s*:\s*[\d.,\s]+(\s*đồng)?/gi, 'Tổng cộng: {{tong_thanh_toan}} đồng'],
  [/Tổng\s+giá\s+trị\s*:\s*[\d.,\s]+/gi, 'Tổng giá trị: {{tong_thanh_toan}}'],
  [/Bằng\s+chữ\s*:\s*[^\n]{10,200}/gi, 'Bằng chữ: {{tong_bang_chu}}'],
  [/bằng\s+chữ\s*:\s*[^\n]{10,200}/gi, 'bằng chữ: {{tong_bang_chu}}'],
];

// Placeholder cho dòng hàng trong bảng (nếu có dòng STT mẫu)
const rowPlaceholders = {
  '{{stt}}': '{{stt}}',
  '{{ten_san_pham}}': '{{ten_san_pham}}',
  '{{don_vi}}': '{{don_vi}}',
  '{{so_luong}}': '{{so_luong}}',
  '{{don_gia}}': '{{don_gia}}',
  '{{thanh_tien}}': '{{thanh_tien}}',
  '{{thue_suat}}': '{{thue_suat}}',
};

function processXml(xml) {
  let text = xml;

  // Gộp các w:t bị tách để dễ replace (đơn giản: replace trên toàn xml)
  for (const [re, rep] of replacements) {
    text = text.replace(re, rep);
  }

  // Nếu bảng có dòng "1" đơn lẻ làm mẫu — chèn loop docxtemplater
  // Tìm pattern hàng đầu tiên sau header bảng (STT + tên SP)
  if (!text.includes('{{#chi_tiet}}')) {
    text = text.replace(
      /(<w:tr[^>]*>)([\s\S]*?)(<w:t[^>]*>1<\/w:t>)([\s\S]*?)(<\/w:tr>)/,
      '$1$2{{#chi_tiet}}$3$4{{/chi_tiet}}$5',
    );
    // Thay ô dữ liệu mẫu trong hàng loop
    const sampleProductPatterns = [
      [/(<w:t[^>]*>)([^<]{4,80})(<\/w:t>)/g, '$1{{ten_san_pham}}$3'],
    ];
    // chỉ trong vùng chi_tiet — bỏ qua nếu phức tạp
  }

  return text;
}

const xmlFiles = Object.keys(zip.files).filter(
  (k) => k.startsWith('word/') && k.endsWith('.xml') && !k.includes('_rels'),
);

let changed = 0;
for (const name of xmlFiles) {
  const file = zip.file(name);
  if (!file) continue;
  const orig = file.asText();
  const next = processXml(orig);
  if (next !== orig) {
    zip.file(name, next);
    changed++;
  }
}

fs.mkdirSync(output.split(/[/\\]/).slice(0, -1).join('/') || '.', { recursive: true });
fs.writeFileSync(output, zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }));
console.log(`Đã ghi: ${output} (sửa ${changed} file XML)`);

// In preview text
const docXml = zip.file('word/document.xml')?.asText() || '';
const preview = [...docXml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('');
console.log('\n--- Preview (800 ký tự đầu) ---\n');
console.log(preview.slice(0, 800));
