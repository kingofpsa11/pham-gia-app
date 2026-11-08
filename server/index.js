import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { ensureSchema } from './utils/ensureSchema.js';
import { createApp } from './app.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dirname, '../dist');
const isProduction = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT) || 3000;
const app = createApp({ distPath, isProduction });

app.listen(PORT, async () => {
  try {
    await ensureSchema();
  } catch (err) {
    console.error('Schema ensure failed:', err.message);
  }
  console.log(`Phạm Gia API listening on http://localhost:${PORT}`);
  console.log(`  Health:  http://localhost:${PORT}/api/health`);
  console.log(`  Tables:  http://localhost:${PORT}/api/tables`);
  console.log(`  Login:   POST http://localhost:${PORT}/api/auth/login`);
  console.log(`  Stats:   http://localhost:${PORT}/api/dashboard-stats`);
  console.log(`  Báo giá: http://localhost:${PORT}/api/bao-gia`);
  console.log(`  Hợp đồng: http://localhost:${PORT}/api/hop-dong`);
  console.log(`  PGH:     http://localhost:${PORT}/api/phieu-giao-hang`);
  console.log(`  PGH/HĐ:  http://localhost:${PORT}/api/phieu-giao-hang-by?hop_dong_id=...`);
  console.log(`  Dòng tiền: http://localhost:${PORT}/api/dong-tien-moi`);
  console.log(`  Dòng tiền/HĐ: http://localhost:${PORT}/api/dong-tien-by?hop_dong_id=...`);
  console.log(`  BG/KH:   http://localhost:${PORT}/api/bao-gia-by?khach_hang_id=...`);
  console.log(`  HĐ/KH:   http://localhost:${PORT}/api/hop-dong-by?khach_hang_id=...`);
});
