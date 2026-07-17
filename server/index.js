import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { pingDatabase, query } from './db.js';
import authRouter from './routes/auth.js';
import dashboardRouter from './routes/dashboard.js';
import khachHangRouter from './routes/khach-hang.js';
import baoGiaRouter from './routes/bao-gia.js';
import tepDinhKemRouter from './routes/tep-dinh-kem.js';
import hopDongRouter from './routes/hop-dong.js';
import phieuGiaoHangRouter from './routes/phieu-giao-hang.js';
import xuatBaoGiaExcelRouter from './routes/xuat-bao-gia-excel.js';
import relationQueriesRouter from './routes/relation-queries.js';
import taiKhoanTienRouter from './routes/tai-khoan-tien.js';
import hangMucThuChiRouter from './routes/hang-muc-thu-chi.js';
import nhaCungCapRouter from './routes/nha-cung-cap.js';
import hopDongMuaRouter from './routes/hop-dong-mua.js';
import dongTienMoiRouter from './routes/dong-tien-moi.js';
import googleDriveRouter from './routes/google-drive.js';
import cauHinhRouter from './routes/cau-hinh.js';
import usersRouter from './routes/users.js';
import { ensureSchema } from './utils/ensureSchema.js';
import { getJwtSecret, requireAuth, requireAdmin } from './middleware/auth.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dirname, '../dist');
const isProduction = process.env.NODE_ENV === 'production';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

try {
  getJwtSecret();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

app.use(cors());
app.use(express.json());

app.get('/api/health', async (_req, res) => {
  try {
    await pingDatabase();
    return res.json({
      status: 'ok',
      service: 'pham-gia-api',
      environment: process.env.NODE_ENV || 'development',
      database: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(503).json({
      status: 'error',
      service: 'pham-gia-api',
      environment: process.env.NODE_ENV || 'development',
      database: 'disconnected',
      message: err.message,
      timestamp: new Date().toISOString(),
    });
  }
});

app.use('/api/auth', authRouter);
app.use('/api', googleDriveRouter);
app.use('/api', requireAuth);

app.get('/api/tables', requireAdmin, async (_req, res) => {
  try {
    const rows = await query(
      `SELECT TABLE_NAME AS table_name
       FROM information_schema.tables
       WHERE table_schema = DATABASE()
       ORDER BY TABLE_NAME`
    );
    const tables = rows.map((row) => row.table_name);
    return res.json({ tables, count: tables.length });
  } catch (err) {
    console.error('GET /api/tables error:', err.message);
    return res.status(500).json({ error: 'Không thể lấy danh sách bảng', message: err.message });
  }
});

app.use('/api', dashboardRouter);
app.use('/api', khachHangRouter);
app.use('/api', baoGiaRouter);
app.use('/api', tepDinhKemRouter);
app.use('/api', hopDongRouter);
app.use('/api', phieuGiaoHangRouter);
app.use('/api', xuatBaoGiaExcelRouter);
app.use('/api', relationQueriesRouter);
app.use('/api', taiKhoanTienRouter);
app.use('/api', hangMucThuChiRouter);
app.use('/api', nhaCungCapRouter);
app.use('/api', hopDongMuaRouter);
app.use('/api', dongTienMoiRouter);
app.use('/api', cauHinhRouter);
app.use('/api', usersRouter);

if (isProduction) {
  app.use(express.static(distPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(distPath, 'index.html'), (err) => {
      if (err) next(err);
    });
  });
}

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

export default app;

export function startServer() {
  return app.listen(PORT, async () => {
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
}

if (process.env.NODE_ENV !== 'test') {
  startServer();
}
