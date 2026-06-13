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
import { requireAuth } from './middleware/auth.js';
import { ensureSchema } from './utils/ensureSchema.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, '../dist');
const isProduction = process.env.NODE_ENV === 'production';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

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

app.get('/api/tables', requireAuth, async (_req, res) => {
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

app.use('/api/auth', authRouter);
app.use('/api', googleDriveRouter);
app.use('/api', requireAuth);
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

export function startServer(port = PORT) {
  return app.listen(port, async () => {
    try {
      await ensureSchema();
    } catch (err) {
      console.error('Schema ensure failed:', err.message);
    }
    console.log(`Phạm Gia API listening on http://localhost:${port}`);
    console.log(`  Health:  http://localhost:${port}/api/health`);
    console.log(`  Tables:  http://localhost:${port}/api/tables`);
    console.log(`  Login:   POST http://localhost:${port}/api/auth/login`);
    console.log(`  Stats:   http://localhost:${port}/api/dashboard-stats`);
    console.log(`  Báo giá: http://localhost:${port}/api/bao-gia`);
    console.log(`  Hợp đồng: http://localhost:${port}/api/hop-dong`);
    console.log(`  PGH:     http://localhost:${port}/api/phieu-giao-hang`);
    console.log(`  PGH/HĐ:  http://localhost:${port}/api/phieu-giao-hang-by?hop_dong_id=...`);
    console.log(`  Dòng tiền: http://localhost:${port}/api/dong-tien-moi`);
    console.log(`  Dòng tiền/HĐ: http://localhost:${port}/api/dong-tien-by?hop_dong_id=...`);
    console.log(`  BG/KH:   http://localhost:${port}/api/bao-gia-by?khach_hang_id=...`);
    console.log(`  HĐ/KH:   http://localhost:${port}/api/hop-dong-by?khach_hang_id=...`);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  startServer();
}

export default app;
