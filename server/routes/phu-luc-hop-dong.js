import { Router } from 'express';
import { query, queryOne } from '../db.js';
import { dbErrorResponse } from '../utils/errors.js';
import { calcTongThanhToanHopDong } from '../utils/baoGiaCalc.js';
import {
  padSoPhuLuc,
  withTx,
  q,
  qOne,
  loadDaGiaoMap,
  normalizeChiTietInput,
  calcGiaTriPhuLuc,
} from '../utils/phuLucHopDong.js';

const router = Router();

function insertId(result) {
  return Number(result?.insertId ?? result?.[0]?.insertId);
}

function shapePhuLuc(row, chiTiet) {
  const shaped = { ...row };
  if (chiTiet !== undefined) shaped.chi_tiet = chiTiet;
  return shaped;
}

router.get('/hop-dong/:hopDongId/phu-luc', async (req, res) => {
  try {
    const hopDongId = Number(req.params.hopDongId);
    const hd = await queryOne('SELECT id FROM hop_dong WHERE id = ?', [hopDongId]);
    if (!hd) return res.status(404).json({ error: 'Không tìm thấy hợp đồng' });
    const rows = await query(
      `SELECT * FROM phu_luc_hop_dong WHERE hop_dong_id = ? ORDER BY id ASC`,
      [hopDongId],
    );
    return res.json({ data: rows });
  } catch (err) {
    return dbErrorResponse(res, err, 'Không thể tải phụ lục hợp đồng');
  }
});

router.get('/phu-luc-hop-dong/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const row = await queryOne(
      `SELECT pl.*, hd.so_hop_dong, hd.ten_du_an, hd.ngay_hop_dong, kh.ten_cong_ty
       FROM phu_luc_hop_dong pl
       JOIN hop_dong hd ON hd.id = pl.hop_dong_id
       LEFT JOIN khach_hang kh ON kh.id = hd.khach_hang_id
       WHERE pl.id = ?`,
      [id],
    );
    if (!row) return res.status(404).json({ error: 'Không tìm thấy phụ lục' });
    const chiTiet = await query(
      'SELECT * FROM phu_luc_hop_dong_chi_tiet WHERE phu_luc_id = ? ORDER BY id',
      [id],
    );
    return res.json({ data: shapePhuLuc(row, chiTiet) });
  } catch (err) {
    return dbErrorResponse(res, err, 'Không thể tải phụ lục hợp đồng');
  }
});

router.post('/hop-dong/:hopDongId/phu-luc', async (req, res) => {
  try {
    const hopDongId = Number(req.params.hopDongId);
    const body = req.body || {};
    const created = await withTx(async (conn) => {
      const hd = await qOne(conn, 'SELECT * FROM hop_dong WHERE id = ?', [hopDongId]);
      if (!hd) {
        const err = new Error('Không tìm thấy hợp đồng');
        err.status = 404;
        throw err;
      }

      const hdChiTiet = await q(
        conn,
        'SELECT * FROM hop_dong_chi_tiet WHERE hop_dong_id = ? ORDER BY id',
        [hopDongId],
      );
      const lines = normalizeChiTietInput(body.chi_tiet, hdChiTiet);
      const daGiaoMap = await loadDaGiaoMap(conn, hopDongId);

      for (const line of lines) {
        if (!line.hop_dong_chi_tiet_id) continue;
        const daGiao = daGiaoMap[String(line.hop_dong_chi_tiet_id)] || 0;
        if (line.so_luong_moi + 1e-9 < daGiao) {
          const err = new Error(
            `"${line.ten_san_pham}": số lượng mới (${line.so_luong_moi}) nhỏ hơn đã giao (${daGiao})`,
          );
          err.status = 400;
          throw err;
        }
      }

      const last = await qOne(
        conn,
        'SELECT so_phu_luc FROM phu_luc_hop_dong WHERE hop_dong_id = ? ORDER BY id DESC LIMIT 1',
        [hopDongId],
      );
      const nextNo = last ? (parseInt(String(last.so_phu_luc), 10) || 0) + 1 : 1;
      const soPhuLuc = String(body.so_phu_luc || '').trim() || padSoPhuLuc(nextNo);

      const giaTriHdTruoc = calcTongThanhToanHopDong(
        hdChiTiet,
        hd.che_do_van_chuyen,
        hd.phi_van_chuyen,
      );
      const giaTriPhuLuc = calcGiaTriPhuLuc(lines);
      const giaTriHdSau = giaTriHdTruoc + giaTriPhuLuc;

      const insertResult = await q(
        conn,
        `INSERT INTO phu_luc_hop_dong
          (hop_dong_id, so_phu_luc, ngay_ky, tieu_de, ly_do, ghi_chu,
           gia_tri_hd_truoc, gia_tri_phu_luc, gia_tri_hd_sau, nguoi_tao)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          hopDongId,
          soPhuLuc,
          body.ngay_ky || null,
          body.tieu_de || '',
          body.ly_do || '',
          body.ghi_chu || '',
          giaTriHdTruoc,
          giaTriPhuLuc,
          giaTriHdSau,
          body.nguoi_tao || '',
        ],
      );
      const phuLucId = insertId(insertResult);

      for (const line of lines) {
        let hdctId = line.hop_dong_chi_tiet_id;
        if (hdctId) {
          await q(conn, 'UPDATE hop_dong_chi_tiet SET so_luong = ? WHERE id = ?', [
            line.so_luong_moi,
            hdctId,
          ]);
        } else {
          const ins = await q(
            conn,
            `INSERT INTO hop_dong_chi_tiet
              (hop_dong_id, ten_san_pham, don_vi, so_luong, don_gia_von, gia_ban_thuc_te, thue_suat, chenh_lech_phan_tram, gia_hop_dong)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              hopDongId,
              line.ten_san_pham,
              line.don_vi,
              line.so_luong_moi,
              line.don_gia_von,
              line.gia_ban_thuc_te,
              line.thue_suat,
              line.chenh_lech_phan_tram,
              line.gia_hop_dong,
            ],
          );
          hdctId = insertId(ins);
        }

        await q(
          conn,
          `INSERT INTO phu_luc_hop_dong_chi_tiet
            (phu_luc_id, hop_dong_chi_tiet_id, loai, ten_san_pham, don_vi,
             so_luong_cu, so_luong_thay_doi, so_luong_moi,
             don_gia_von, gia_ban_thuc_te, thue_suat, chenh_lech_phan_tram, gia_hop_dong)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            phuLucId,
            hdctId,
            line.loai,
            line.ten_san_pham,
            line.don_vi,
            line.so_luong_cu,
            line.so_luong_thay_doi,
            line.so_luong_moi,
            line.don_gia_von,
            line.gia_ban_thuc_te,
            line.thue_suat,
            line.chenh_lech_phan_tram,
            line.gia_hop_dong,
          ],
        );
      }

      return phuLucId;
    });

    const row = await queryOne('SELECT * FROM phu_luc_hop_dong WHERE id = ?', [created]);
    const chiTiet = await query(
      'SELECT * FROM phu_luc_hop_dong_chi_tiet WHERE phu_luc_id = ? ORDER BY id',
      [created],
    );
    return res.json({ data: shapePhuLuc(row, chiTiet) });
  } catch (err) {
    if (err.status === 404) return res.status(404).json({ error: err.message });
    if (err.status === 400) return res.status(400).json({ error: err.message });
    if (err?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Số phụ lục đã tồn tại trên hợp đồng này' });
    }
    return dbErrorResponse(res, err, 'Không thể tạo phụ lục hợp đồng');
  }
});

router.delete('/phu-luc-hop-dong/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    await withTx(async (conn) => {
      const pl = await qOne(conn, 'SELECT * FROM phu_luc_hop_dong WHERE id = ?', [id]);
      if (!pl) {
        const err = new Error('Không tìm thấy phụ lục');
        err.status = 404;
        throw err;
      }
      const latest = await qOne(
        conn,
        'SELECT id FROM phu_luc_hop_dong WHERE hop_dong_id = ? ORDER BY id DESC LIMIT 1',
        [pl.hop_dong_id],
      );
      if (Number(latest.id) !== id) {
        const err = new Error('Chỉ được xóa phụ lục mới nhất để hoàn tác khối lượng');
        err.status = 400;
        throw err;
      }

      const lines = await q(
        conn,
        'SELECT * FROM phu_luc_hop_dong_chi_tiet WHERE phu_luc_id = ? ORDER BY id DESC',
        [id],
      );
      const daGiaoMap = await loadDaGiaoMap(conn, pl.hop_dong_id);

      for (const line of lines) {
        const hdctId = line.hop_dong_chi_tiet_id;
        if (!hdctId) continue;
        const daGiao = daGiaoMap[String(hdctId)] || 0;
        if (line.loai === 'moi') {
          if (daGiao > 0) {
            const err = new Error(
              `Không thể xóa: "${line.ten_san_pham}" đã có phiếu giao hàng`,
            );
            err.status = 400;
            throw err;
          }
          await q(conn, 'DELETE FROM hop_dong_chi_tiet WHERE id = ?', [hdctId]);
        } else {
          if (Number(line.so_luong_cu) + 1e-9 < daGiao) {
            const err = new Error(
              `Không thể hoàn tác "${line.ten_san_pham}": đã giao ${daGiao}, SL cũ là ${line.so_luong_cu}`,
            );
            err.status = 400;
            throw err;
          }
          await q(conn, 'UPDATE hop_dong_chi_tiet SET so_luong = ? WHERE id = ?', [
            line.so_luong_cu,
            hdctId,
          ]);
        }
      }

      await q(conn, 'DELETE FROM phu_luc_hop_dong_chi_tiet WHERE phu_luc_id = ?', [id]);
      await q(conn, 'DELETE FROM phu_luc_hop_dong WHERE id = ?', [id]);
    });
    return res.json({ success: true });
  } catch (err) {
    if (err.status === 404) return res.status(404).json({ error: err.message });
    if (err.status === 400) return res.status(400).json({ error: err.message });
    return dbErrorResponse(res, err, 'Không thể xóa phụ lục hợp đồng');
  }
});

export default router;
