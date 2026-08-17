import { Router } from 'express';
import { query } from '../db.js';
import { dbErrorResponse } from '../utils/errors.js';
import {
  CHI_TIET_SELECT,
  enrichPhieuChiTietRows,
  loadHopDongChiTietOrdered,
  calcTotalsFromPhieuChiTiet,
} from '../utils/phieuGiaoHangChiTiet.js';

const router = Router();

router.get('/dong-tien-by', async (req, res) => {
  try {
    const khachHangId = String(req.query.khach_hang_id || '');
    const nhaCungCapId = String(req.query.nha_cung_cap_id || '');
    const hopDongId = String(req.query.hop_dong_id || '');
    const hopDongMuaId = String(req.query.hop_dong_mua_id || '');
    const taiKhoanId = String(req.query.tai_khoan_id || '');

    const conditions = [];
    const params = [];
    if (khachHangId) {
      conditions.push('khach_hang_id = ?');
      params.push(khachHangId);
    }
    if (nhaCungCapId) {
      conditions.push('nha_cung_cap_id = ?');
      params.push(nhaCungCapId);
    }
    if (hopDongId) {
      conditions.push('hop_dong_id = ?');
      params.push(hopDongId);
    }
    if (hopDongMuaId) {
      conditions.push('hop_dong_mua_id = ?');
      params.push(hopDongMuaId);
    }
    if (taiKhoanId) {
      conditions.push('tai_khoan_id = ?');
      params.push(taiKhoanId);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await query(`SELECT * FROM dong_tien ${where} ORDER BY id DESC`, params);
    return res.json({ data: rows });
  } catch (err) {
    return dbErrorResponse(res, err, 'Không thể tải dòng tiền');
  }
});

router.get('/phieu-giao-hang-by', async (req, res) => {
  try {
    const khachHangId = String(req.query.khach_hang_id || '');
    const hopDongId = String(req.query.hop_dong_id || '');
    const conditions = [];
    const params = [];

    if (khachHangId) {
      conditions.push('pgh.khach_hang_id = ?');
      params.push(khachHangId);
    }
    if (hopDongId) {
      conditions.push('pgh.hop_dong_id = ?');
      params.push(hopDongId);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await query(
      `SELECT pgh.* FROM phieu_giao_hang pgh ${where} ORDER BY pgh.id DESC`,
      params
    );

    if (!rows.length) return res.json({ data: [] });

    const pghIds = rows.map((r) => r.id);
    const hdIds = [...new Set(rows.map((r) => r.hop_dong_id).filter(Boolean))];

    const placeholders = pghIds.map(() => '?').join(',');
    const chiTietAll = await query(
      `${CHI_TIET_SELECT} WHERE pghct.phieu_giao_hang_id IN (${placeholders}) ORDER BY pghct.id`,
      pghIds
    );

    const chiTietByPgh = new Map();
    for (const ct of chiTietAll) {
      const key = ct.phieu_giao_hang_id;
      if (!chiTietByPgh.has(key)) chiTietByPgh.set(key, []);
      chiTietByPgh.get(key).push(ct);
    }

    const hdChiTietByHd = new Map();
    await Promise.all(
      hdIds.map(async (hdId) => {
        hdChiTietByHd.set(hdId, await loadHopDongChiTietOrdered(hdId));
      })
    );

    for (const row of rows) {
      const chiTietRaw = chiTietByPgh.get(row.id) || [];
      const hdRows = hdChiTietByHd.get(row.hop_dong_id) || [];
      row.chi_tiet = enrichPhieuChiTietRows(chiTietRaw, hdRows);
      row.gia_tri_ghi_no = calcTotalsFromPhieuChiTiet(row.chi_tiet).tongSauThue;
    }

    return res.json({ data: rows });
  } catch (err) {
    return dbErrorResponse(res, err, 'Không thể tải phiếu giao hàng');
  }
});

router.get('/bao-gia-by', async (req, res) => {
  try {
    const khachHangId = String(req.query.khach_hang_id || '');
    if (!khachHangId) {
      return res.json({ data: [] });
    }
    const rows = await query(
      'SELECT * FROM bao_gia WHERE khach_hang_id = ? ORDER BY UNIX_TIMESTAMP(ngay_bao_gia) DESC, id DESC',
      [khachHangId]
    );
    return res.json({ data: rows });
  } catch (err) {
    return dbErrorResponse(res, err, 'Không thể tải báo giá theo khách hàng');
  }
});

router.get('/hop-dong-by', async (req, res) => {
  try {
    const khachHangId = String(req.query.khach_hang_id || '');
    if (!khachHangId) {
      return res.json({ data: [] });
    }
    const rows = await query(
      `SELECT hd.*, kh.ten_cong_ty
       FROM hop_dong hd
       LEFT JOIN khach_hang kh ON hd.khach_hang_id = kh.id
       WHERE hd.khach_hang_id = ?
       ORDER BY UNIX_TIMESTAMP(hd.ngay_hop_dong) DESC, hd.id DESC`,
      [khachHangId]
    );
    return res.json({ data: rows });
  } catch (err) {
    return dbErrorResponse(res, err, 'Không thể tải hợp đồng theo khách hàng');
  }
});

export default router;
