import { Router } from 'express';
import { query, queryOne } from '../db.js';
import { dbErrorResponse } from '../utils/errors.js';
import { parsePaging, sqlLimitOffset } from '../utils/pagination.js';

const router = Router();

function insertId(result) {
  return Number(result?.insertId ?? result?.[0]?.insertId);
}

router.get('/hop-dong-mua', async (req, res) => {
  try {
    const search = String(req.query.search || '');
    const nccId = String(req.query.nha_cung_cap_id || '');
    const dateFrom = String(req.query.date_from || '');
    const dateTo = String(req.query.date_to || '');
    const { page, limit, offset } = parsePaging(req.query);

    const conditions = [];
    const params = [];
    if (search) {
      conditions.push('hdm.so_hop_dong LIKE ?');
      params.push(`%${search}%`);
    }
    if (nccId) {
      conditions.push('hdm.nha_cung_cap_id = ?');
      params.push(nccId);
    }
    if (dateFrom) {
      conditions.push('hdm.ngay_ky >= ?');
      params.push(dateFrom);
    }
    if (dateTo) {
      conditions.push('hdm.ngay_ky <= ?');
      params.push(dateTo);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const countRow = await queryOne(
      `SELECT COUNT(*) AS total FROM hop_dong_mua hdm ${where}`,
      params
    );
    const rows = await query(
      `SELECT hdm.*, ncc.ten_nha_cung_cap
       FROM hop_dong_mua hdm
       LEFT JOIN nha_cung_cap ncc ON hdm.nha_cung_cap_id = ncc.id
       ${where} ORDER BY UNIX_TIMESTAMP(hdm.ngay_ky) DESC, hdm.id DESC ${sqlLimitOffset(limit, offset)}`,
      params
    );
    return res.json({ data: rows, total: countRow?.total || 0, page, limit });
  } catch (err) {
    return dbErrorResponse(res, err, 'Không thể tải hợp đồng mua');
  }
});

router.get('/hop-dong-mua/:id', async (req, res) => {
  try {
    const hdm = await queryOne(
      `SELECT hdm.*, ncc.ten_nha_cung_cap FROM hop_dong_mua hdm
       LEFT JOIN nha_cung_cap ncc ON hdm.nha_cung_cap_id = ncc.id WHERE hdm.id = ?`,
      [req.params.id]
    );
    if (!hdm) return res.status(404).json({ error: 'Not found' });
    const chiTiet = await query('SELECT * FROM hop_dong_mua_chi_tiet WHERE hop_dong_mua_id = ?', [
      req.params.id,
    ]);
    return res.json({ data: { ...hdm, chi_tiet: chiTiet } });
  } catch (err) {
    return dbErrorResponse(res, err, 'Không thể tải hợp đồng mua');
  }
});

router.post('/hop-dong-mua', async (req, res) => {
  try {
    const body = req.body || {};
    const result = await query(
      'INSERT INTO hop_dong_mua (so_hop_dong, ngay_ky, nha_cung_cap_id, tong_gia_tri, ghi_chu) VALUES (?, ?, ?, ?, ?)',
      [
        body.so_hop_dong,
        body.ngay_ky,
        body.nha_cung_cap_id,
        body.tong_gia_tri || 0,
        body.ghi_chu || '',
      ]
    );
    const hdmId = insertId(result);
    if (body.chi_tiet?.length) {
      for (const ct of body.chi_tiet) {
        await query(
          `INSERT INTO hop_dong_mua_chi_tiet (hop_dong_mua_id, ten_san_pham, don_vi, so_luong, don_gia, thue_suat, thanh_tien)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            hdmId,
            ct.ten_san_pham,
            ct.don_vi || '',
            ct.so_luong || 0,
            ct.don_gia || 0,
            ct.thue_suat || 10,
            ct.thanh_tien || 0,
          ]
        );
      }
    }
    const newRow = await queryOne('SELECT * FROM hop_dong_mua WHERE id = ?', [hdmId]);
    return res.json({ data: newRow });
  } catch (err) {
    return dbErrorResponse(res, err, 'Không thể tạo hợp đồng mua');
  }
});

router.put('/hop-dong-mua/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const body = req.body || {};
    await query(
      'UPDATE hop_dong_mua SET so_hop_dong=?, ngay_ky=?, nha_cung_cap_id=?, tong_gia_tri=?, ghi_chu=? WHERE id=?',
      [
        body.so_hop_dong,
        body.ngay_ky,
        body.nha_cung_cap_id,
        body.tong_gia_tri || 0,
        body.ghi_chu || '',
        id,
      ]
    );
    if (body.chi_tiet) {
      await query('DELETE FROM hop_dong_mua_chi_tiet WHERE hop_dong_mua_id = ?', [id]);
      for (const ct of body.chi_tiet) {
        await query(
          `INSERT INTO hop_dong_mua_chi_tiet (hop_dong_mua_id, ten_san_pham, don_vi, so_luong, don_gia, thue_suat, thanh_tien)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            ct.ten_san_pham,
            ct.don_vi || '',
            ct.so_luong || 0,
            ct.don_gia || 0,
            ct.thue_suat || 10,
            ct.thanh_tien || 0,
          ]
        );
      }
    }
    return res.json({ success: true });
  } catch (err) {
    return dbErrorResponse(res, err, 'Không thể cập nhật hợp đồng mua');
  }
});

router.delete('/hop-dong-mua/:id', async (req, res) => {
  try {
    const id = req.params.id;
    await query('DELETE FROM hop_dong_mua_chi_tiet WHERE hop_dong_mua_id = ?', [id]);
    await query('DELETE FROM hop_dong_mua WHERE id = ?', [id]);
    return res.json({ success: true });
  } catch (err) {
    return dbErrorResponse(res, err, 'Không thể xóa hợp đồng mua');
  }
});

export default router;
