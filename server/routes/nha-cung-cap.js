import { Router } from 'express';
import { query, queryOne } from '../db.js';
import { dbErrorResponse } from '../utils/errors.js';
import { parsePaging, sqlLimitOffset } from '../utils/pagination.js';

const router = Router();

function insertId(result) {
  return Number(result?.insertId ?? result?.[0]?.insertId);
}

router.get('/nha-cung-cap', async (req, res) => {
  try {
    const search = String(req.query.search || '');
    const { page, limit, offset } = parsePaging(req.query);

    let where = '';
    const params = [];
    if (search) {
      where = 'WHERE ten_nha_cung_cap LIKE ? OR dien_thoai LIKE ? OR dia_chi LIKE ?';
      const s = `%${search}%`;
      params.push(s, s, s);
    }

    const countRow = await queryOne(`SELECT COUNT(*) AS total FROM nha_cung_cap ${where}`, params);
    const rows = await query(
      `SELECT * FROM nha_cung_cap ${where} ORDER BY id DESC ${sqlLimitOffset(limit, offset)}`,
      params
    );
    return res.json({ data: rows, total: countRow?.total || 0, page, limit });
  } catch (err) {
    return dbErrorResponse(res, err, 'Không thể tải nhà cung cấp');
  }
});

router.post('/nha-cung-cap', async (req, res) => {
  try {
    const body = req.body || {};
    const result = await query(
      'INSERT INTO nha_cung_cap (ten_nha_cung_cap, dien_thoai, dia_chi) VALUES (?, ?, ?)',
      [body.ten_nha_cung_cap, body.dien_thoai || '', body.dia_chi || '']
    );
    const id = insertId(result);
    const newRow = await queryOne('SELECT * FROM nha_cung_cap WHERE id = ?', [id]);
    return res.json({ data: newRow });
  } catch (err) {
    return dbErrorResponse(res, err, 'Không thể tạo nhà cung cấp');
  }
});

router.put('/nha-cung-cap/:id', async (req, res) => {
  try {
    const body = req.body || {};
    await query('UPDATE nha_cung_cap SET ten_nha_cung_cap=?, dien_thoai=?, dia_chi=? WHERE id=?', [
      body.ten_nha_cung_cap,
      body.dien_thoai || '',
      body.dia_chi || '',
      req.params.id,
    ]);
    return res.json({ success: true });
  } catch (err) {
    return dbErrorResponse(res, err, 'Không thể cập nhật nhà cung cấp');
  }
});

router.delete('/nha-cung-cap/:id', async (req, res) => {
  try {
    await query('DELETE FROM nha_cung_cap WHERE id = ?', [req.params.id]);
    return res.json({ success: true });
  } catch (err) {
    return dbErrorResponse(res, err, 'Không thể xóa nhà cung cấp');
  }
});

export default router;
