import { Router } from 'express';
import { query, queryOne } from '../db.js';
import { dbErrorResponse } from '../utils/errors.js';
import { parsePaging, sqlLimitOffset } from '../utils/pagination.js';
import { calcTongThanhToanBaoGia, calcTongThanhToanHopDong } from '../utils/baoGiaCalc.js';
import {
  parseNamFromDate,
  findBaoGiaTrungSo,
  messageBaoGiaTrung,
} from '../utils/soTrungNam.js';
import { nextSoChungTu, nextSoHopDongBan } from '../utils/soChungTu.js';

const router = Router();

function insertId(result) {
  return Number(result?.insertId ?? result?.[0]?.insertId);
}

router.get('/bao-gia', async (req, res) => {
  try {
    const search = String(req.query.search || '');
    const khachHangId = String(req.query.khach_hang_id || '');
    const mauBaoGia = String(req.query.mau_bao_gia || '');
    const dateFrom = String(req.query.date_from || '');
    const dateTo = String(req.query.date_to || '');
    const { page, limit, offset } = parsePaging(req.query);

    const conditions = [];
    const params = [];

    if (search) {
      conditions.push('(bg.so_bao_gia LIKE ? OR bg.ten_du_an LIKE ? OR kh.ten_cong_ty LIKE ?)');
      const s = `%${search}%`;
      params.push(s, s, s);
    }
    if (khachHangId) {
      conditions.push('bg.khach_hang_id = ?');
      params.push(khachHangId);
    }
    if (mauBaoGia) {
      conditions.push('bg.mau_bao_gia = ?');
      params.push(mauBaoGia);
    }
    if (dateFrom) {
      conditions.push('bg.ngay_bao_gia >= ?');
      params.push(dateFrom);
    }
    if (dateTo) {
      conditions.push('bg.ngay_bao_gia <= ?');
      params.push(dateTo);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRow = await queryOne(
      `SELECT COUNT(*) AS total FROM bao_gia bg
       LEFT JOIN khach_hang kh ON bg.khach_hang_id = kh.id ${where}`,
      params
    );
    const rows = await query(
      `SELECT bg.*, kh.ten_cong_ty FROM bao_gia bg
       LEFT JOIN khach_hang kh ON bg.khach_hang_id = kh.id
       ${where} ORDER BY UNIX_TIMESTAMP(bg.ngay_bao_gia) DESC, bg.id DESC ${sqlLimitOffset(limit, offset)}`,
      params
    );

    if (rows.length > 0) {
      const ids = rows.map((r) => r.id);
      const placeholders = ids.map(() => '?').join(',');
      const allChiTiet = await query(
        `SELECT * FROM bao_gia_chi_tiet WHERE bao_gia_id IN (${placeholders})`,
        ids
      );
      const chiTietByBg = new Map();
      for (const ct of allChiTiet) {
        const list = chiTietByBg.get(ct.bao_gia_id) || [];
        list.push(ct);
        chiTietByBg.set(ct.bao_gia_id, list);
      }
      for (const row of rows) {
        row.tong_thanh_toan = calcTongThanhToanBaoGia(
          chiTietByBg.get(row.id) || [],
          row.che_do_van_chuyen,
          row.phi_van_chuyen
        );
      }
    }

    return res.json({ data: rows, total: countRow?.total || 0, page, limit });
  } catch (err) {
    return dbErrorResponse(res, err, 'Không thể tải báo giá');
  }
});

router.get('/bao-gia/so-tiep-theo', async (req, res) => {
  try {
    const nam = parseInt(String(req.query.nam || ''), 10) || new Date().getFullYear();
    const so = await nextSoChungTu(query, {
      table: 'bao_gia',
      column: 'so_bao_gia',
      dateColumn: 'ngay_bao_gia',
      kyHieu: 'BG',
      nam,
    });
    return res.json({ data: { so, nam } });
  } catch (err) {
    return dbErrorResponse(res, err, 'Không thể lấy số báo giá tiếp theo');
  }
});

router.get('/bao-gia/kiem-tra-so', async (req, res) => {
  try {
    const so = String(req.query.so_bao_gia || req.query.so || '').trim();
    const nam = parseInt(String(req.query.nam || ''), 10) || parseNamFromDate(req.query.ngay_bao_gia);
    const excludeId = req.query.exclude_id ? Number(req.query.exclude_id) : null;
    if (!so) return res.json({ exists: false });
    const row = await findBaoGiaTrungSo(queryOne, so, nam, excludeId);
    return res.json({ exists: !!row, data: row || null });
  } catch (err) {
    return dbErrorResponse(res, err, 'Không thể kiểm tra số báo giá');
  }
});

router.get('/bao-gia/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const bg = await queryOne(
      `SELECT bg.*, kh.ten_cong_ty FROM bao_gia bg
       LEFT JOIN khach_hang kh ON bg.khach_hang_id = kh.id WHERE bg.id = ?`,
      [id]
    );
    if (!bg) return res.status(404).json({ error: 'Not found' });
    const chiTiet = await query('SELECT * FROM bao_gia_chi_tiet WHERE bao_gia_id = ?', [id]);
    return res.json({ data: { ...bg, chi_tiet: chiTiet } });
  } catch (err) {
    console.error('GET /api/bao-gia/:id error:', err.message);
    return res.status(500).json({ error: 'Không thể tải báo giá', message: err.message });
  }
});

router.post('/bao-gia', async (req, res) => {
  try {
    const body = req.body;
    const nam = parseNamFromDate(body.ngay_bao_gia);
    const dup = await findBaoGiaTrungSo(queryOne, body.so_bao_gia, nam, null);
    if (dup) {
      return res.status(409).json({ error: messageBaoGiaTrung(String(body.so_bao_gia).trim(), nam) });
    }
    const result = await query(
      `INSERT INTO bao_gia (so_bao_gia, ngay_bao_gia, khach_hang_id, ten_du_an, phien_ban, mau_bao_gia, che_do_van_chuyen, phi_van_chuyen, ten_folder_du_an, id_folder_du_an, hop_dong_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        body.so_bao_gia,
        body.ngay_bao_gia,
        body.khach_hang_id,
        body.ten_du_an || '',
        body.phien_ban || 1,
        body.mau_bao_gia || 'Hapulico',
        body.che_do_van_chuyen || 0,
        body.phi_van_chuyen || 0,
        body.ten_folder_du_an || '',
        body.id_folder_du_an || '',
        body.hop_dong_id || null,
      ]
    );
    const baoGiaId = insertId(result);

    if (body.chi_tiet?.length) {
      for (const ct of body.chi_tiet) {
        const giaChuaVC =
          ct.gia_ban_chua_van_chuyen ?? ct.gia_ban_co_ban ?? ct.gia_ban_thuc_te ?? 0;
        const chiPhiVC = ct.chi_phi_van_chuyen_phan_bo ?? 0;
        await query(
          `INSERT INTO bao_gia_chi_tiet (bao_gia_id, ten_san_pham, don_vi, so_luong, don_gia_von, lai_suat_phan_tram, gia_ban_chua_van_chuyen, chi_phi_van_chuyen_phan_bo, gia_ban_thuc_te, thue_suat)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            baoGiaId,
            ct.ten_san_pham,
            ct.don_vi || '',
            ct.so_luong || 0,
            ct.don_gia_von || 0,
            ct.lai_suat_phan_tram || 0,
            giaChuaVC,
            chiPhiVC,
            giaChuaVC + chiPhiVC,
            ct.thue_suat || 10,
          ]
        );
      }
    }

    const newRow = await queryOne('SELECT * FROM bao_gia WHERE id = ?', [baoGiaId]);
    return res.json({ data: newRow });
  } catch (err) {
    console.error('POST /api/bao-gia error:', err.message);
    return res.status(500).json({ error: 'Không thể tạo báo giá', message: err.message });
  }
});

router.put('/bao-gia/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const body = req.body;
    const nam = parseNamFromDate(body.ngay_bao_gia);
    const dup = await findBaoGiaTrungSo(queryOne, body.so_bao_gia, nam, Number(id));
    if (dup) {
      return res.status(409).json({ error: messageBaoGiaTrung(String(body.so_bao_gia).trim(), nam) });
    }
    await query(
      `UPDATE bao_gia SET so_bao_gia=?, ngay_bao_gia=?, khach_hang_id=?, ten_du_an=?, phien_ban=?, mau_bao_gia=?, che_do_van_chuyen=?, phi_van_chuyen=?, ten_folder_du_an=?, id_folder_du_an=?, hop_dong_id=? WHERE id=?`,
      [
        body.so_bao_gia,
        body.ngay_bao_gia,
        body.khach_hang_id,
        body.ten_du_an || '',
        body.phien_ban || 1,
        body.mau_bao_gia || 'Hapulico',
        body.che_do_van_chuyen || 0,
        body.phi_van_chuyen || 0,
        body.ten_folder_du_an || '',
        body.id_folder_du_an || '',
        body.hop_dong_id || null,
        id,
      ]
    );

    if (body.chi_tiet) {
      await query('DELETE FROM bao_gia_chi_tiet WHERE bao_gia_id = ?', [id]);
      for (const ct of body.chi_tiet) {
        const giaChuaVC =
          ct.gia_ban_chua_van_chuyen ?? ct.gia_ban_co_ban ?? ct.gia_ban_thuc_te ?? 0;
        const chiPhiVC = ct.chi_phi_van_chuyen_phan_bo ?? 0;
        await query(
          `INSERT INTO bao_gia_chi_tiet (bao_gia_id, ten_san_pham, don_vi, so_luong, don_gia_von, lai_suat_phan_tram, gia_ban_chua_van_chuyen, chi_phi_van_chuyen_phan_bo, gia_ban_thuc_te, thue_suat)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            ct.ten_san_pham,
            ct.don_vi || '',
            ct.so_luong || 0,
            ct.don_gia_von || 0,
            ct.lai_suat_phan_tram || 0,
            giaChuaVC,
            chiPhiVC,
            giaChuaVC + chiPhiVC,
            ct.thue_suat || 10,
          ]
        );
      }
    }

    const updated = await queryOne('SELECT * FROM bao_gia WHERE id = ?', [id]);
    return res.json({ data: updated });
  } catch (err) {
    console.error('PUT /api/bao-gia/:id error:', err.message);
    return res.status(500).json({ error: 'Không thể cập nhật báo giá', message: err.message });
  }
});

router.post('/clone-bao-gia', async (req, res) => {
  try {
    const baoGiaId = req.body.bao_gia_id;
    const bg = await queryOne('SELECT * FROM bao_gia WHERE id = ?', [baoGiaId]);
    if (!bg) return res.status(404).json({ error: 'Bao gia not found' });

    const newPhienBan = (bg.phien_ban || 1) + 1;
    const result = await query(
      `INSERT INTO bao_gia (so_bao_gia, ngay_bao_gia, khach_hang_id, ten_du_an, phien_ban, mau_bao_gia, che_do_van_chuyen, phi_van_chuyen, ten_folder_du_an, id_folder_du_an)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        bg.so_bao_gia,
        new Date().toISOString().split('T')[0],
        bg.khach_hang_id,
        bg.ten_du_an,
        newPhienBan,
        bg.mau_bao_gia,
        bg.che_do_van_chuyen,
        bg.phi_van_chuyen,
        bg.ten_folder_du_an,
        bg.id_folder_du_an,
      ]
    );
    const newBaoGiaId = insertId(result);

    const chiTiet = await query('SELECT * FROM bao_gia_chi_tiet WHERE bao_gia_id = ?', [baoGiaId]);
    for (const ct of chiTiet) {
      await query(
        `INSERT INTO bao_gia_chi_tiet (bao_gia_id, ten_san_pham, don_vi, so_luong, don_gia_von, lai_suat_phan_tram, gia_ban_chua_van_chuyen, chi_phi_van_chuyen_phan_bo, gia_ban_thuc_te, thue_suat)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newBaoGiaId,
          ct.ten_san_pham,
          ct.don_vi,
          ct.so_luong,
          ct.don_gia_von,
          ct.lai_suat_phan_tram,
          ct.gia_ban_chua_van_chuyen ?? ct.gia_ban_thuc_te,
          ct.chi_phi_van_chuyen_phan_bo ?? 0,
          ct.gia_ban_thuc_te,
          ct.thue_suat,
        ]
      );
    }

    return res.json({ data: { new_bao_gia_id: newBaoGiaId } });
  } catch (err) {
    console.error('POST /api/clone-bao-gia error:', err.message);
    return res.status(500).json({ error: 'Không thể nhân bản báo giá', message: err.message });
  }
});

router.post('/convert-bao-gia', async (req, res) => {
  try {
    const baoGiaId = req.body.bao_gia_id;
    const bg = await queryOne('SELECT * FROM bao_gia WHERE id = ?', [baoGiaId]);
    if (!bg) return res.status(404).json({ error: 'Bao gia not found' });

    const soHopDong =
      req.body.so_hop_dong ||
      (await nextSoHopDongBan(query, new Date().getFullYear()));

    const result = await query(
      `INSERT INTO hop_dong (khach_hang_id, ten_du_an, so_hop_dong, ngay_hop_dong, mo_ta_noi_dung, trang_thai, phi_van_chuyen, che_do_van_chuyen, ty_le_tam_ung, gia_tri_tam_ung)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        bg.khach_hang_id,
        bg.ten_du_an,
        soHopDong,
        new Date().toISOString().split('T')[0],
        `Chuyển từ báo giá ${bg.so_bao_gia}`,
        'Hieu luc',
        bg.phi_van_chuyen,
        bg.che_do_van_chuyen,
        30,
        0,
      ]
    );
    const hopDongId = insertId(result);

    const chiTiet = await query('SELECT * FROM bao_gia_chi_tiet WHERE bao_gia_id = ?', [baoGiaId]);
    for (const ct of chiTiet) {
      const giaChuaVC = ct.gia_ban_chua_van_chuyen ?? ct.gia_ban_thuc_te;
      const giaHD = ct.gia_ban_thuc_te;
      const chenhLech =
        giaChuaVC > 0 ? Math.round(((giaHD - giaChuaVC) / giaChuaVC) * 100 * 100) / 100 : 0;
      await query(
        `INSERT INTO hop_dong_chi_tiet (hop_dong_id, ten_san_pham, don_vi, so_luong, don_gia_von, gia_ban_thuc_te, thue_suat, chenh_lech_phan_tram, gia_hop_dong)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          hopDongId,
          ct.ten_san_pham,
          ct.don_vi,
          ct.so_luong,
          ct.don_gia_von,
          giaChuaVC,
          ct.thue_suat,
          chenhLech,
          giaHD,
        ]
      );
    }

    await query('UPDATE bao_gia SET hop_dong_id = ? WHERE id = ?', [hopDongId, baoGiaId]);

    return res.json({ data: { hop_dong_id: hopDongId, so_hop_dong: soHopDong } });
  } catch (err) {
    console.error('POST /api/convert-bao-gia error:', err.message);
    return res.status(500).json({ error: 'Không thể chuyển báo giá sang hợp đồng', message: err.message });
  }
});

router.delete('/bao-gia/:id', async (req, res) => {
  try {
    const id = req.params.id;
    await query('DELETE FROM bao_gia_chi_tiet WHERE bao_gia_id = ?', [id]);
    await query('DELETE FROM bao_gia WHERE id = ?', [id]);
    return res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/bao-gia/:id error:', err.message);
    return res.status(500).json({ error: 'Không thể xóa báo giá', message: err.message });
  }
});

export default router;
