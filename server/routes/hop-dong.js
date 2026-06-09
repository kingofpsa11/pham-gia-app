import { Router } from 'express';
import { query, queryOne } from '../db.js';
import { dbErrorResponse } from '../utils/errors.js';
import { parsePaging, sqlLimitOffset } from '../utils/pagination.js';
import {
  parseNamFromDate,
  findHopDongTrungSo,
  messageHopDongTrung,
} from '../utils/soTrungNam.js';
import { calcTongThanhToanHopDong } from '../utils/baoGiaCalc.js';

const router = Router();

function insertId(result) {
  return Number(result?.insertId ?? result?.[0]?.insertId);
}

const HD_JOIN_SELECT = `
  SELECT hd.*, kh.ten_cong_ty
  FROM hop_dong hd
  LEFT JOIN khach_hang kh ON hd.khach_hang_id = kh.id
`;

function shapeHopDong(row, chiTiet) {
  const shaped = {
    ...row,
    khach_hang: row.ten_cong_ty
      ? { id: row.khach_hang_id, ten_cong_ty: row.ten_cong_ty }
      : undefined,
  };
  if (chiTiet !== undefined) shaped.chi_tiet = chiTiet;
  return shaped;
}

async function loadHopDongJoined(id) {
  return queryOne(`${HD_JOIN_SELECT} WHERE hd.id = ?`, [id]);
}

function mergeHopDongUpdate(existing, body) {
  return {
    khach_hang_id: body.khach_hang_id ?? existing.khach_hang_id,
    ten_du_an: body.ten_du_an !== undefined ? (body.ten_du_an || '') : (existing.ten_du_an || ''),
    so_hop_dong: body.so_hop_dong ?? existing.so_hop_dong,
    ngay_hop_dong: body.ngay_hop_dong ?? existing.ngay_hop_dong,
    file_hop_dong_id: body.file_hop_dong_id !== undefined ? (body.file_hop_dong_id || '') : (existing.file_hop_dong_id || ''),
    mo_ta_noi_dung: body.mo_ta_noi_dung !== undefined ? (body.mo_ta_noi_dung || '') : (existing.mo_ta_noi_dung || ''),
    trang_thai: body.trang_thai ?? existing.trang_thai ?? 'Hieu luc',
    phi_van_chuyen: body.phi_van_chuyen ?? existing.phi_van_chuyen ?? 0,
    che_do_van_chuyen: body.che_do_van_chuyen ?? existing.che_do_van_chuyen ?? 0,
  };
}

router.get('/hop-dong', async (req, res) => {
  try {
    const search = String(req.query.search || '');
    const khachHangId = String(req.query.khach_hang_id || '');
    const trangThai = String(req.query.trang_thai || '');
    const dateFrom = String(req.query.date_from || '');
    const dateTo = String(req.query.date_to || '');
    const { page, limit, offset } = parsePaging(req.query);

    const conditions = [];
    const params = [];

    if (search) {
      conditions.push('(hd.so_hop_dong LIKE ? OR hd.ten_du_an LIKE ? OR kh.ten_cong_ty LIKE ?)');
      const s = `%${search}%`;
      params.push(s, s, s);
    }
    if (khachHangId) {
      conditions.push('hd.khach_hang_id = ?');
      params.push(khachHangId);
    }
    if (trangThai) {
      conditions.push('hd.trang_thai = ?');
      params.push(trangThai);
    }
    if (dateFrom) {
      conditions.push('hd.ngay_hop_dong >= ?');
      params.push(dateFrom);
    }
    if (dateTo) {
      conditions.push('hd.ngay_hop_dong <= ?');
      params.push(dateTo);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRow = await queryOne(
      `SELECT COUNT(*) AS total FROM hop_dong hd
       LEFT JOIN khach_hang kh ON hd.khach_hang_id = kh.id ${where}`,
      params
    );
    const rows = await query(
      `${HD_JOIN_SELECT}
       ${where} ORDER BY UNIX_TIMESTAMP(hd.ngay_hop_dong) DESC, hd.id DESC ${sqlLimitOffset(limit, offset)}`,
      params
    );

    if (rows.length > 0) {
      const ids = rows.map((r) => r.id);
      const placeholders = ids.map(() => '?').join(',');
      const allChiTiet = await query(
        `SELECT * FROM hop_dong_chi_tiet WHERE hop_dong_id IN (${placeholders})`,
        ids
      );
      const chiTietByHd = new Map();
      for (const ct of allChiTiet) {
        const list = chiTietByHd.get(ct.hop_dong_id) || [];
        list.push(ct);
        chiTietByHd.set(ct.hop_dong_id, list);
      }
      for (const row of rows) {
        row.tong_gia_tri = calcTongThanhToanHopDong(
          chiTietByHd.get(row.id) || [],
          row.che_do_van_chuyen,
          row.phi_van_chuyen
        );
      }
    }

    return res.json({
      data: rows.map((r) => shapeHopDong(r)),
      total: countRow?.total || 0,
      page,
      limit,
    });
  } catch (err) {
    return dbErrorResponse(res, err, 'Không thể tải hợp đồng');
  }
});

router.get('/hop-dong/kiem-tra-so', async (req, res) => {
  try {
    const so = String(req.query.so_hop_dong || req.query.so || '').trim();
    const nam = parseInt(String(req.query.nam || ''), 10) || parseNamFromDate(req.query.ngay_hop_dong);
    const excludeId = req.query.exclude_id ? Number(req.query.exclude_id) : null;
    if (!so) return res.json({ exists: false });
    const row = await findHopDongTrungSo(queryOne, so, nam, excludeId);
    return res.json({ exists: !!row, data: row || null });
  } catch (err) {
    return dbErrorResponse(res, err, 'Không thể kiểm tra số hợp đồng');
  }
});

router.patch('/hop-dong/:id/trang-thai', async (req, res) => {
  try {
    const id = req.params.id;
    const trangThai = req.body?.trang_thai;
    if (!trangThai) {
      return res.status(400).json({ error: 'Thiếu trạng thái hợp đồng' });
    }
    const existing = await queryOne('SELECT id FROM hop_dong WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    await query('UPDATE hop_dong SET trang_thai = ? WHERE id = ?', [trangThai, id]);
    const updated = await loadHopDongJoined(id);
    const chiTiet = await query('SELECT * FROM hop_dong_chi_tiet WHERE hop_dong_id = ?', [id]);
    return res.json({ data: shapeHopDong(updated, chiTiet) });
  } catch (err) {
    return dbErrorResponse(res, err, 'Không thể cập nhật trạng thái hợp đồng');
  }
});

router.get('/hop-dong/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const hd = await loadHopDongJoined(id);
    if (!hd) return res.status(404).json({ error: 'Not found' });
    const chiTiet = await query('SELECT * FROM hop_dong_chi_tiet WHERE hop_dong_id = ?', [id]);
    return res.json({ data: shapeHopDong(hd, chiTiet) });
  } catch (err) {
    return dbErrorResponse(res, err, 'Không thể tải hợp đồng');
  }
});

router.post('/hop-dong', async (req, res) => {
  try {
    const body = req.body;
    const nam = parseNamFromDate(body.ngay_hop_dong);
    const dup = await findHopDongTrungSo(queryOne, body.so_hop_dong, nam, null);
    if (dup) {
      return res.status(409).json({ error: messageHopDongTrung(String(body.so_hop_dong).trim(), nam) });
    }
    const result = await query(
      `INSERT INTO hop_dong (khach_hang_id, ten_du_an, so_hop_dong, ngay_hop_dong, file_hop_dong_id, mo_ta_noi_dung, trang_thai, phi_van_chuyen, che_do_van_chuyen)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        body.khach_hang_id,
        body.ten_du_an || '',
        body.so_hop_dong,
        body.ngay_hop_dong,
        body.file_hop_dong_id || '',
        body.mo_ta_noi_dung || '',
        body.trang_thai || 'Hieu luc',
        body.phi_van_chuyen || 0,
        body.che_do_van_chuyen || 0,
      ]
    );
    const hopDongId = insertId(result);

    if (body.chi_tiet?.length) {
      for (const ct of body.chi_tiet) {
        await query(
          `INSERT INTO hop_dong_chi_tiet (hop_dong_id, ten_san_pham, don_vi, so_luong, don_gia_von, gia_ban_thuc_te, thue_suat, chenh_lech_phan_tram, gia_hop_dong)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            hopDongId,
            ct.ten_san_pham,
            ct.don_vi || '',
            ct.so_luong || 0,
            ct.don_gia_von || 0,
            ct.gia_ban_thuc_te || 0,
            ct.thue_suat || 10,
            ct.chenh_lech_phan_tram || 0,
            ct.gia_hop_dong || 0,
          ]
        );
      }
    }

    const newRow = await queryOne('SELECT * FROM hop_dong WHERE id = ?', [hopDongId]);
    return res.json({ data: newRow });
  } catch (err) {
    if (err?.code === 'ER_DUP_ENTRY' && String(err.message).includes('so_hop_dong')) {
      const nam = parseNamFromDate(req.body?.ngay_hop_dong);
      return res.status(409).json({
        error: messageHopDongTrung(String(req.body?.so_hop_dong || '').trim(), nam),
      });
    }
    return dbErrorResponse(res, err, 'Không thể tạo hợp đồng');
  }
});

router.put('/hop-dong/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const body = req.body || {};
    const existing = await queryOne('SELECT * FROM hop_dong WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const merged = mergeHopDongUpdate(existing, body);
    const nam = parseNamFromDate(merged.ngay_hop_dong);
    const dup = await findHopDongTrungSo(queryOne, merged.so_hop_dong, nam, Number(id));
    if (dup) {
      return res.status(409).json({ error: messageHopDongTrung(String(merged.so_hop_dong).trim(), nam) });
    }
    await query(
      `UPDATE hop_dong SET khach_hang_id=?, ten_du_an=?, so_hop_dong=?, ngay_hop_dong=?, file_hop_dong_id=?, mo_ta_noi_dung=?, trang_thai=?, phi_van_chuyen=?, che_do_van_chuyen=? WHERE id=?`,
      [
        merged.khach_hang_id,
        merged.ten_du_an,
        merged.so_hop_dong,
        merged.ngay_hop_dong,
        merged.file_hop_dong_id,
        merged.mo_ta_noi_dung,
        merged.trang_thai,
        merged.phi_van_chuyen,
        merged.che_do_van_chuyen,
        id,
      ]
    );

    if (body.chi_tiet !== undefined) {
      await query('DELETE FROM hop_dong_chi_tiet WHERE hop_dong_id = ?', [id]);
      for (const ct of body.chi_tiet) {
        await query(
          `INSERT INTO hop_dong_chi_tiet (hop_dong_id, ten_san_pham, don_vi, so_luong, don_gia_von, gia_ban_thuc_te, thue_suat, chenh_lech_phan_tram, gia_hop_dong)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            ct.ten_san_pham,
            ct.don_vi || '',
            ct.so_luong || 0,
            ct.don_gia_von || 0,
            ct.gia_ban_thuc_te || 0,
            ct.thue_suat || 10,
            ct.chenh_lech_phan_tram || 0,
            ct.gia_hop_dong || 0,
          ]
        );
      }
    }

    const updated = await loadHopDongJoined(id);
    const chiTiet = await query('SELECT * FROM hop_dong_chi_tiet WHERE hop_dong_id = ?', [id]);
    return res.json({ data: shapeHopDong(updated, chiTiet) });
  } catch (err) {
    if (err?.code === 'ER_DUP_ENTRY' && String(err.message).includes('so_hop_dong')) {
      const nam = parseNamFromDate(req.body?.ngay_hop_dong);
      return res.status(409).json({
        error: messageHopDongTrung(String(req.body?.so_hop_dong || '').trim(), nam),
      });
    }
    return dbErrorResponse(res, err, 'Không thể cập nhật hợp đồng');
  }
});

router.delete('/hop-dong/:id', async (req, res) => {
  try {
    const id = req.params.id;
    await query('DELETE FROM hop_dong_chi_tiet WHERE hop_dong_id = ?', [id]);
    await query('DELETE FROM hop_dong WHERE id = ?', [id]);
    return res.json({ success: true });
  } catch (err) {
    return dbErrorResponse(res, err, 'Không thể xóa hợp đồng');
  }
});

export default router;
