import { Router } from 'express';
import { query, queryOne } from '../db.js';
import { dbErrorResponse } from '../utils/errors.js';
import { computeTaiKhoanBalances } from '../utils/taiKhoanBalance.js';

const router = Router();

function insertId(result) {
  return Number(result?.insertId ?? result?.[0]?.insertId);
}

async function listTaiKhoanTien(req) {
  const loai = String(req.query.loai_tai_khoan || '');
  const phamVi = String(req.query.pham_vi || '');
  const trangThai = String(req.query.trang_thai || '');
  const conditions = [];
  const params = [];
  if (loai) {
    conditions.push('loai_tai_khoan = ?');
    params.push(loai);
  }
  if (phamVi) {
    conditions.push('pham_vi = ?');
    params.push(phamVi);
  }
  if (trangThai) {
    conditions.push('trang_thai = ?');
    params.push(trangThai);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return query(`SELECT * FROM tai_khoan_tien ${where} ORDER BY ten_tai_khoan`, params);
}

/** Một lần quét dong_tien_moi → số dư mọi tài khoản (thay N× limit 99999). */
router.get('/tai-khoan-tien/balances', async (req, res) => {
  try {
    const accounts = await listTaiKhoanTien(req);
    const txs = await query(
      `SELECT id, loai_giao_dich, so_tien, tai_khoan_tien_id, tai_khoan_nhan_id,
              chieu_tien, mo_ta_giao_dich, ngay_giao_dich, ten_tai_khoan, nguon_du_lieu
       FROM dong_tien_moi`
    );
    return res.json({ data: computeTaiKhoanBalances(accounts, txs) });
  } catch (err) {
    return dbErrorResponse(res, err, 'Không thể tải số dư tài khoản');
  }
});

router.get('/tai-khoan-tien', async (req, res) => {
  try {
    const rows = await listTaiKhoanTien(req);
    if (String(req.query.with_balance || '') === '1') {
      const txs = await query(
        `SELECT id, loai_giao_dich, so_tien, tai_khoan_tien_id, tai_khoan_nhan_id,
                chieu_tien, mo_ta_giao_dich, ngay_giao_dich, ten_tai_khoan, nguon_du_lieu
         FROM dong_tien_moi`
      );
      return res.json({ data: computeTaiKhoanBalances(rows, txs) });
    }
    return res.json({ data: rows });
  } catch (err) {
    return dbErrorResponse(res, err, 'Không thể tải tài khoản tiền');
  }
});

router.post('/tai-khoan-tien', async (req, res) => {
  try {
    const body = req.body || {};
    const result = await query(
      `INSERT INTO tai_khoan_tien (ten_tai_khoan, loai_tai_khoan, ngan_hang, so_tai_khoan, chu_tai_khoan, pham_vi, so_du_dau_ky, ngay_so_du_dau_ky, trang_thai, ghi_chu)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        body.ten_tai_khoan,
        body.loai_tai_khoan || 'ngan_hang',
        body.ngan_hang || null,
        body.so_tai_khoan || null,
        body.chu_tai_khoan || null,
        body.pham_vi || 'cong_ty',
        body.so_du_dau_ky || 0,
        body.ngay_so_du_dau_ky || null,
        body.trang_thai || 'hoat_dong',
        body.ghi_chu || null,
      ]
    );
    const id = insertId(result);
    const newRow = await queryOne('SELECT * FROM tai_khoan_tien WHERE id = ?', [id]);
    return res.json({ data: newRow });
  } catch (err) {
    return dbErrorResponse(res, err, 'Không thể tạo tài khoản tiền');
  }
});

router.put('/tai-khoan-tien/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const body = req.body || {};
    await query(
      `UPDATE tai_khoan_tien SET ten_tai_khoan=?, loai_tai_khoan=?, ngan_hang=?, so_tai_khoan=?, chu_tai_khoan=?, pham_vi=?, so_du_dau_ky=?, ngay_so_du_dau_ky=?, trang_thai=?, ghi_chu=? WHERE id=?`,
      [
        body.ten_tai_khoan,
        body.loai_tai_khoan,
        body.ngan_hang || null,
        body.so_tai_khoan || null,
        body.chu_tai_khoan || null,
        body.pham_vi,
        body.so_du_dau_ky || 0,
        body.ngay_so_du_dau_ky || null,
        body.trang_thai,
        body.ghi_chu || null,
        id,
      ]
    );
    const updated = await queryOne('SELECT * FROM tai_khoan_tien WHERE id = ?', [id]);
    return res.json({ data: updated });
  } catch (err) {
    return dbErrorResponse(res, err, 'Không thể cập nhật tài khoản tiền');
  }
});

router.delete('/tai-khoan-tien/:id', async (req, res) => {
  try {
    await query("UPDATE tai_khoan_tien SET trang_thai = 'khong_hoat_dong' WHERE id = ?", [
      req.params.id,
    ]);
    return res.json({ success: true });
  } catch (err) {
    return dbErrorResponse(res, err, 'Không thể xóa tài khoản tiền');
  }
});

export default router;
