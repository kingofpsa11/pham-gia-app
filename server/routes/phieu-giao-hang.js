import { Router } from 'express';
import { query, queryOne } from '../db.js';
import { dbErrorResponse } from '../utils/errors.js';
import { parsePaging, sqlLimitOffset } from '../utils/pagination.js';
import {
  CHI_TIET_SELECT,
  calcGiaTriGhiNoFromChiTiet,
  enrichPhieuChiTietRows,
  loadHopDongChiTietOrdered,
} from '../utils/phieuGiaoHangChiTiet.js';

const router = Router();

function insertId(result) {
  return Number(result?.insertId ?? result?.[0]?.insertId);
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function fieldOrExisting(body, existing, key) {
  return hasOwn(body, key) ? body[key] : existing[key];
}

export async function mergePhieuGiaoHangUpdate(existing, body) {
  const hopDongId = fieldOrExisting(body, existing, 'hop_dong_id');
  const khachHangId = hasOwn(body, 'khach_hang_id')
    ? body.khach_hang_id
    : existing.khach_hang_id || (await khachHangIdFromHopDong(hopDongId));
  const giaTriGhiNo = hasOwn(body, 'chi_tiet')
    ? body.chi_tiet?.length
      ? await calcGiaTriGhiNoFromChiTiet(body.chi_tiet, hopDongId)
      : 0
    : existing.gia_tri_ghi_no;

  return {
    so_phieu: fieldOrExisting(body, existing, 'so_phieu'),
    ngay_giao: fieldOrExisting(body, existing, 'ngay_giao'),
    khach_hang_id: khachHangId,
    hop_dong_id: hopDongId || null,
    gia_tri_ghi_no: giaTriGhiNo,
    noi_dung: fieldOrExisting(body, existing, 'noi_dung') || '',
    nguoi_tao: fieldOrExisting(body, existing, 'nguoi_tao') || '',
  };
}

const PGH_JOIN_SELECT = `
  SELECT pgh.*, kh.ten_cong_ty,
         hd.so_hop_dong, hd.ten_du_an, hd.khach_hang_id AS hd_khach_hang_id
  FROM phieu_giao_hang pgh
  LEFT JOIN hop_dong hd ON pgh.hop_dong_id = hd.id
  LEFT JOIN khach_hang kh ON kh.id = COALESCE(pgh.khach_hang_id, hd.khach_hang_id)
`;

function shapePhieuGiaoHang(row, chiTiet) {
  const khachHangId = row.khach_hang_id || row.hd_khach_hang_id;
  const shaped = {
    ...row,
    khach_hang_id: khachHangId ?? row.khach_hang_id,
    khach_hang: row.ten_cong_ty
      ? { id: khachHangId, ten_cong_ty: row.ten_cong_ty }
      : undefined,
    hop_dong: row.hop_dong_id
      ? {
          id: row.hop_dong_id,
          so_hop_dong: row.so_hop_dong || '',
          ten_du_an: row.ten_du_an || '',
        }
      : undefined,
  };
  if (chiTiet !== undefined) shaped.chi_tiet = chiTiet;
  return shaped;
}

async function loadPhieuGiaoHangJoined(id) {
  return queryOne(`${PGH_JOIN_SELECT} WHERE pgh.id = ?`, [id]);
}

/** Phiếu cũ có thể thiếu hop_dong_id — suy ra từ dòng chi tiết. */
async function enrichHopDongFromChiTiet(pgh, chiTietRaw) {
  if (pgh.hop_dong_id || !chiTietRaw?.length) return pgh;
  const refId = chiTietRaw.find((c) => c.hop_dong_chi_tiet_id)?.hop_dong_chi_tiet_id;
  if (!refId) return pgh;
  const hd = await queryOne(
    `SELECT hd.id AS hop_dong_id, hd.so_hop_dong, hd.ten_du_an, hd.khach_hang_id AS hd_khach_hang_id,
            kh.ten_cong_ty
     FROM hop_dong_chi_tiet hdct
     JOIN hop_dong hd ON hd.id = hdct.hop_dong_id
     LEFT JOIN khach_hang kh ON kh.id = hd.khach_hang_id
     WHERE hdct.id = ?`,
    [refId],
  );
  if (!hd) return pgh;
  return {
    ...pgh,
    hop_dong_id: hd.hop_dong_id,
    so_hop_dong: hd.so_hop_dong,
    ten_du_an: hd.ten_du_an,
    hd_khach_hang_id: hd.hd_khach_hang_id,
    ten_cong_ty: pgh.ten_cong_ty || hd.ten_cong_ty,
    khach_hang_id: pgh.khach_hang_id || hd.hd_khach_hang_id,
  };
}

async function khachHangIdFromHopDong(hopDongId) {
  if (!hopDongId) return null;
  const hd = await queryOne('SELECT khach_hang_id FROM hop_dong WHERE id = ?', [hopDongId]);
  return hd?.khach_hang_id ?? null;
}

router.get('/phieu-giao-hang', async (req, res) => {
  try {
    const search = String(req.query.search || '');
    const khachHangId = String(req.query.khach_hang_id || '');
    const hopDongId = String(req.query.hop_dong_id || '');
    const dateFrom = String(req.query.date_from || '');
    const dateTo = String(req.query.date_to || '');
    const { page, limit, offset } = parsePaging(req.query);

    const conditions = [];
    const params = [];

    if (search) {
      conditions.push('(pgh.so_phieu LIKE ? OR pgh.noi_dung LIKE ?)');
      const s = `%${search}%`;
      params.push(s, s);
    }
    if (khachHangId) {
      conditions.push('pgh.khach_hang_id = ?');
      params.push(khachHangId);
    }
    if (hopDongId) {
      conditions.push('pgh.hop_dong_id = ?');
      params.push(hopDongId);
    }
    if (dateFrom) {
      conditions.push('pgh.ngay_giao >= ?');
      params.push(dateFrom);
    }
    if (dateTo) {
      conditions.push('pgh.ngay_giao <= ?');
      params.push(dateTo);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRow = await queryOne(
      `SELECT COUNT(*) AS total FROM phieu_giao_hang pgh ${where}`,
      params
    );
    const rows = await query(
      `${PGH_JOIN_SELECT} ${where} ORDER BY pgh.id DESC ${sqlLimitOffset(limit, offset)}`,
      params
    );

    return res.json({
      data: rows.map((r) => shapePhieuGiaoHang(r)),
      total: countRow?.total || 0,
      page,
      limit,
    });
  } catch (err) {
    return dbErrorResponse(res, err, 'Không thể tải phiếu giao hàng');
  }
});

router.get('/phieu-giao-hang/:id', async (req, res) => {
  try {
    const id = req.params.id;
    let pgh = await loadPhieuGiaoHangJoined(id);
    if (!pgh) return res.status(404).json({ error: 'Not found' });
    const chiTietRaw = await query(
      `${CHI_TIET_SELECT} WHERE pghct.phieu_giao_hang_id = ? ORDER BY pghct.id`,
      [id],
    );
    pgh = await enrichHopDongFromChiTiet(pgh, chiTietRaw);
    const hdRows = await loadHopDongChiTietOrdered(pgh.hop_dong_id);
    const chiTiet = enrichPhieuChiTietRows(chiTietRaw, hdRows);
    return res.json({ data: shapePhieuGiaoHang(pgh, chiTiet) });
  } catch (err) {
    return dbErrorResponse(res, err, 'Không thể tải phiếu giao hàng');
  }
});

router.post('/phieu-giao-hang', async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.hop_dong_id) {
      return res.status(400).json({ error: 'Phiếu giao hàng phải liên kết với hợp đồng' });
    }
    const khachHangId = body.khach_hang_id || await khachHangIdFromHopDong(body.hop_dong_id);
    const giaTriGhiNo =
      body.chi_tiet?.length && body.hop_dong_id
        ? await calcGiaTriGhiNoFromChiTiet(body.chi_tiet, body.hop_dong_id)
        : 0;

    const result = await query(
      `INSERT INTO phieu_giao_hang
       (so_phieu, ngay_giao, khach_hang_id, hop_dong_id, gia_tri_ghi_no, noi_dung, nguoi_tao)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        body.so_phieu,
        body.ngay_giao,
        khachHangId,
        body.hop_dong_id || null,
        giaTriGhiNo,
        body.noi_dung || '',
        body.nguoi_tao || '',
      ]
    );
    const pghId = insertId(result);

    if (body.chi_tiet?.length) {
      for (const ct of body.chi_tiet) {
        await query(
          `INSERT INTO phieu_giao_hang_chi_tiet
           (phieu_giao_hang_id, hop_dong_chi_tiet_id, don_vi, so_luong_giao, ghi_chu)
           VALUES (?, ?, ?, ?, ?)`,
          [
            pghId,
            ct.hop_dong_chi_tiet_id || null,
            ct.don_vi || '',
            ct.so_luong_giao || 0,
            ct.ghi_chu || '',
          ]
        );
      }
    }

    const newRow = await queryOne('SELECT * FROM phieu_giao_hang WHERE id = ?', [pghId]);
    return res.json({ data: newRow });
  } catch (err) {
    return dbErrorResponse(res, err, 'Không thể tạo phiếu giao hàng');
  }
});

router.put('/phieu-giao-hang/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const body = req.body || {};
    const existing = await queryOne('SELECT * FROM phieu_giao_hang WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const merged = await mergePhieuGiaoHangUpdate(existing, body);
    if (!merged.hop_dong_id) {
      return res.status(400).json({ error: 'Phiếu giao hàng phải liên kết với hợp đồng' });
    }

    await query(
      `UPDATE phieu_giao_hang
       SET so_phieu=?, ngay_giao=?, khach_hang_id=?, hop_dong_id=?, gia_tri_ghi_no=?, noi_dung=?, nguoi_tao=?
       WHERE id=?`,
      [
        merged.so_phieu,
        merged.ngay_giao,
        merged.khach_hang_id,
        merged.hop_dong_id,
        merged.gia_tri_ghi_no,
        merged.noi_dung,
        merged.nguoi_tao,
        id,
      ]
    );

    if (body.chi_tiet) {
      await query('DELETE FROM phieu_giao_hang_chi_tiet WHERE phieu_giao_hang_id = ?', [id]);
      for (const ct of body.chi_tiet) {
        await query(
          `INSERT INTO phieu_giao_hang_chi_tiet
           (phieu_giao_hang_id, hop_dong_chi_tiet_id, don_vi, so_luong_giao, ghi_chu)
           VALUES (?, ?, ?, ?, ?)`,
          [
            id,
            ct.hop_dong_chi_tiet_id || null,
            ct.don_vi || '',
            ct.so_luong_giao || 0,
            ct.ghi_chu || '',
          ]
        );
      }
    }

    const updated = await queryOne('SELECT * FROM phieu_giao_hang WHERE id = ?', [id]);
    return res.json({ data: updated });
  } catch (err) {
    return dbErrorResponse(res, err, 'Không thể cập nhật phiếu giao hàng');
  }
});

router.delete('/phieu-giao-hang/:id', async (req, res) => {
  try {
    const id = req.params.id;
    await query('DELETE FROM phieu_giao_hang_chi_tiet WHERE phieu_giao_hang_id = ?', [id]);
    await query('DELETE FROM phieu_giao_hang WHERE id = ?', [id]);
    return res.json({ success: true });
  } catch (err) {
    return dbErrorResponse(res, err, 'Không thể xóa phiếu giao hàng');
  }
});

export default router;
