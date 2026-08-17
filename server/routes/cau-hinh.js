import { Router } from 'express';
import fs from 'fs/promises';
import path from 'path';
import multer from 'multer';
import { query, queryOne } from '../db.js';
import { requireAdmin } from '../middleware/auth.js';
import { TEMPLATES_UPLOAD_DIR } from '../utils/uploadPaths.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const key = req.params.key || '';
    const wordKeys = new Set([
      'mau_hop_dong',
      'mau_de_nghi_tam_ung',
      'mau_de_nghi_thanh_toan',
      'mau_phu_luc_hop_dong',
    ]);
    const isWord = wordKeys.has(key);
    const ok = isWord
      ? /\.docx$/i.test(file.originalname)
      : /\.xlsx?$/i.test(file.originalname);
    const msg = isWord ? 'Chỉ chấp nhận file Word (.docx)' : 'Chỉ chấp nhận file Excel';
    cb(ok ? null : new Error(msg), ok);
  },
});

router.get('/cau-hinh/:key', requireAdmin, async (req, res) => {
  try {
    const row = await queryOne(
      'SELECT `key`, value, updated_at FROM cau_hinh WHERE `key` = ?',
      [req.params.key],
    );
    if (!row) return res.json({ data: null });
    return res.json({ data: row });
  } catch (err) {
    console.error('GET /api/cau-hinh/:key error:', err.message);
    return res.status(500).json({ error: 'Không thể tải cấu hình', message: err.message });
  }
});

router.post('/cau-hinh/:key/upload', requireAdmin, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Thiếu file upload' });
    const configKey = req.params.key;
    const safeName = req.file.originalname
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/gi, 'd')
      .replace(/[^a-zA-Z0-9._-]/g, '_');
    const relPath = `${configKey}/${Date.now()}_${safeName}`;
    const absPath = path.join(TEMPLATES_UPLOAD_DIR, relPath);
    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, req.file.buffer);

    const value = JSON.stringify({ name: req.file.originalname, path: relPath });
    const existing = await queryOne('SELECT `key` FROM cau_hinh WHERE `key` = ?', [configKey]);
    if (existing) {
      await query('UPDATE cau_hinh SET value = ?, updated_at = NOW() WHERE `key` = ?', [value, configKey]);
    } else {
      await query('INSERT INTO cau_hinh (`key`, value, updated_at) VALUES (?, ?, NOW())', [configKey, value]);
    }
    const row = await queryOne(
      'SELECT `key`, value, updated_at FROM cau_hinh WHERE `key` = ?',
      [configKey],
    );
    return res.json({ data: row });
  } catch (err) {
    console.error('POST /api/cau-hinh/:key/upload error:', err.message);
    return res.status(500).json({ error: 'Không thể upload mẫu', message: err.message });
  }
});

router.delete('/cau-hinh/:key', requireAdmin, async (req, res) => {
  try {
    const row = await queryOne('SELECT value FROM cau_hinh WHERE `key` = ?', [req.params.key]);
    if (row?.value) {
      try {
        const meta = JSON.parse(row.value);
        if (meta.path) {
          await fs.unlink(path.join(TEMPLATES_UPLOAD_DIR, meta.path)).catch(() => {});
        }
      } catch { /* ignore */ }
    }
    await query('DELETE FROM cau_hinh WHERE `key` = ?', [req.params.key]);
    return res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/cau-hinh/:key error:', err.message);
    return res.status(500).json({ error: 'Không thể xóa mẫu', message: err.message });
  }
});

export default router;
