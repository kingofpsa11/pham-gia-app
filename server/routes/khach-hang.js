import { Router } from 'express';
import { query, queryOne } from '../db.js';
import { dbErrorResponse } from '../utils/errors.js';
import { parsePaging, sqlLimitOffset } from '../utils/pagination.js';

const router = Router();

router.get('/khach-hang', async (req, res) => {
  try {
    const search = String(req.query.search || '');
    const { page, limit, offset } = parsePaging(req.query);

    let where = '';
    const params = [];
    if (search) {
      where = 'WHERE ten_cong_ty LIKE ? OR ma_so_thue LIKE ? OR dien_thoai LIKE ?';
      const s = `%${search}%`;
      params.push(s, s, s);
    }

    const countRow = await queryOne(
      `SELECT COUNT(*) AS total FROM khach_hang ${where}`,
      params
    );
    const rows = await query(
      `SELECT * FROM khach_hang ${where} ORDER BY id DESC ${sqlLimitOffset(limit, offset)}`,
      params
    );

    return res.json({ data: rows, total: countRow?.total || 0, page, limit });
  } catch (err) {
    return dbErrorResponse(res, err, 'Không thể tải khách hàng');
  }
});

router.get('/khach-hang/:id', async (req, res) => {
  try {
    const row = await queryOne('SELECT * FROM khach_hang WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Not found' });
    return res.json({ data: row });
  } catch (err) {
    return dbErrorResponse(res, err, 'Không thể tải khách hàng');
  }
});

router.post('/khach-hang', async (req, res) => {
  try {
    const body = req.body;
    const result = await query(
      `INSERT INTO khach_hang (ten_cong_ty, ma_so_thue, dia_chi, dien_thoai, email, tai_khoan_ngan_hang, nguoi_dai_dien, chuc_vu)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        body.ten_cong_ty,
        body.ma_so_thue || '',
        body.dia_chi || '',
        body.dien_thoai || '',
        body.email || '',
        body.tai_khoan_ngan_hang || '',
        body.nguoi_dai_dien || '',
        body.chuc_vu || '',
      ]
    );
    const insertId = result.insertId ?? result[0]?.insertId;
    const newRow = await queryOne('SELECT * FROM khach_hang WHERE id = ?', [insertId]);
    return res.json({ data: newRow });
  } catch (err) {
    console.error('POST /api/khach-hang error:', err.message);
    return res.status(500).json({ error: 'Không thể tạo khách hàng', message: err.message });
  }
});

router.put('/khach-hang/:id', async (req, res) => {
  try {
    const body = req.body;
    const id = req.params.id;
    await query(
      `UPDATE khach_hang SET ten_cong_ty=?, ma_so_thue=?, dia_chi=?, dien_thoai=?, email=?, tai_khoan_ngan_hang=?, nguoi_dai_dien=?, chuc_vu=? WHERE id=?`,
      [
        body.ten_cong_ty,
        body.ma_so_thue || '',
        body.dia_chi || '',
        body.dien_thoai || '',
        body.email || '',
        body.tai_khoan_ngan_hang || '',
        body.nguoi_dai_dien || '',
        body.chuc_vu || '',
        id,
      ]
    );
    const updated = await queryOne('SELECT * FROM khach_hang WHERE id = ?', [id]);
    return res.json({ data: updated });
  } catch (err) {
    console.error('PUT /api/khach-hang/:id error:', err.message);
    return res.status(500).json({ error: 'Không thể cập nhật khách hàng', message: err.message });
  }
});

router.delete('/khach-hang/:id', async (req, res) => {
  try {
    await query('DELETE FROM khach_hang WHERE id = ?', [req.params.id]);
    return res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/khach-hang/:id error:', err.message);
    return res.status(500).json({ error: 'Không thể xóa khách hàng', message: err.message });
  }
});

export default router;
