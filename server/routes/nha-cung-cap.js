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

/** Aggregate cho danh sách NCC hiện tại — 2 query thay vì 2×N. */
router.get('/nha-cung-cap/aggregates', async (req, res) => {
  try {
    const ids = String(req.query.ids || '')
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (!ids.length) return res.json({ data: {} });

    const placeholders = ids.map(() => '?').join(',');
    const [hdmRows, dtRows] = await Promise.all([
      query(
        `SELECT nha_cung_cap_id,
                COUNT(*) AS so_hoa_don_mua,
                COALESCE(SUM(tong_gia_tri), 0) AS tong_gia_tri_hoa_don_mua
         FROM hop_dong_mua
         WHERE nha_cung_cap_id IN (${placeholders})
         GROUP BY nha_cung_cap_id`,
        ids
      ),
      query(
        `SELECT nha_cung_cap_id, COALESCE(SUM(ghi_co), 0) AS tong_da_thanh_toan
         FROM dong_tien
         WHERE nha_cung_cap_id IN (${placeholders})
         GROUP BY nha_cung_cap_id`,
        ids
      ),
    ]);

    const data = {};
    for (const id of ids) {
      data[id] = { so_hoa_don_mua: 0, tong_gia_tri_hoa_don_mua: 0, tong_da_thanh_toan: 0 };
    }
    for (const r of hdmRows || []) {
      const id = Number(r.nha_cung_cap_id);
      if (!data[id]) data[id] = { so_hoa_don_mua: 0, tong_gia_tri_hoa_don_mua: 0, tong_da_thanh_toan: 0 };
      data[id].so_hoa_don_mua = Number(r.so_hoa_don_mua) || 0;
      data[id].tong_gia_tri_hoa_don_mua = Number(r.tong_gia_tri_hoa_don_mua) || 0;
    }
    for (const r of dtRows || []) {
      const id = Number(r.nha_cung_cap_id);
      if (!data[id]) data[id] = { so_hoa_don_mua: 0, tong_gia_tri_hoa_don_mua: 0, tong_da_thanh_toan: 0 };
      data[id].tong_da_thanh_toan = Number(r.tong_da_thanh_toan) || 0;
    }
    return res.json({ data });
  } catch (err) {
    return dbErrorResponse(res, err, 'Không thể tải thống kê nhà cung cấp');
  }
});

router.get('/hop-dong-mua-by', async (req, res) => {
  try {
    const nccId = String(req.query.nha_cung_cap_id || '');
    if (!nccId) return res.json({ data: [] });
    const rows = await query(
      `SELECT hdm.*, ncc.ten_nha_cung_cap
       FROM hop_dong_mua hdm
       LEFT JOIN nha_cung_cap ncc ON hdm.nha_cung_cap_id = ncc.id
       WHERE hdm.nha_cung_cap_id = ?
       ORDER BY UNIX_TIMESTAMP(hdm.ngay_ky) DESC, hdm.id DESC`,
      [nccId]
    );
    return res.json({ data: rows });
  } catch (err) {
    return dbErrorResponse(res, err, 'Không thể tải hợp đồng mua theo NCC');
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
