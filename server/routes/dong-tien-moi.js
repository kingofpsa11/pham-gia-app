import { Router } from 'express';
import { query, queryOne } from '../db.js';
import { dbErrorResponse } from '../utils/errors.js';
import { parsePaging, sqlLimitOffset } from '../utils/pagination.js';
import { parseNgayGiaoDich, parseNgayHachToan } from '../utils/dongTienDate.js';
import { mergeMissingFields } from '../utils/patchMerge.js';

const router = Router();

function insertId(result) {
  return Number(result?.insertId ?? result?.[0]?.insertId);
}

const LIST_SELECT = `
  SELECT dt.*,
    tkt.ten_tai_khoan, tkt.loai_tai_khoan, tkt.ngan_hang,
    tkn.ten_tai_khoan AS ten_tai_khoan_nhan,
    hm.ten_hang_muc, hm.pham_vi AS pham_vi_hang_muc, hm.loai_giao_dich AS loai_hang_muc,
    hm.parent_id AS hang_muc_parent_id,
    kh.ten_cong_ty,
    ncc.ten_nha_cung_cap,
    hd.so_hop_dong,
    hdm.so_hop_dong AS so_hop_dong_mua,
    dt2.ten_doi_tuong
  FROM dong_tien_moi dt
  LEFT JOIN tai_khoan_tien tkt ON tkt.id = dt.tai_khoan_tien_id
  LEFT JOIN tai_khoan_tien tkn ON tkn.id = dt.tai_khoan_nhan_id
  LEFT JOIN hang_muc_thu_chi hm ON hm.id = dt.hang_muc_thu_chi_id
  LEFT JOIN khach_hang kh ON kh.id = dt.khach_hang_id
  LEFT JOIN nha_cung_cap ncc ON ncc.id = dt.nha_cung_cap_id
  LEFT JOIN hop_dong hd ON hd.id = dt.hop_dong_id
  LEFT JOIN hop_dong_mua hdm ON hdm.id = dt.hop_dong_mua_id
  LEFT JOIN doi_tuong dt2 ON dt2.id = dt.doi_tuong_id
`;

const DONG_TIEN_UPDATE_FIELDS = [
  'ngay_giao_dich',
  'loai_giao_dich',
  'chieu_tien',
  'tai_khoan_tien_id',
  'tai_khoan_nhan_id',
  'so_tien',
  'doi_tuong_id',
  'khach_hang_id',
  'nha_cung_cap_id',
  'hop_dong_id',
  'hop_dong_mua_id',
  'hang_muc_thu_chi_id',
  'mo_ta_giao_dich',
  'so_tai_khoan_doi_ung',
  'ten_tai_khoan_doi_ung',
  'so_du_sau_giao_dich',
  'ma_giao_dich_ngan_hang',
  'ghi_chu',
  'trang_thai',
];

router.get('/dong-tien-moi', async (req, res) => {
  try {
    const { page, limit, offset } = parsePaging(req.query);
    const dateFrom = String(req.query.date_from || '');
    const dateTo = String(req.query.date_to || '');
    const loaiGD = String(req.query.loai_giao_dich || '');
    const taiKhoanId = String(req.query.tai_khoan_tien_id || '');
    const phamVi = String(req.query.pham_vi || '');
    const hangMucId = String(req.query.hang_muc_thu_chi_id || '');
    const khachHangId = String(req.query.khach_hang_id || '');
    const nhaCungCapId = String(req.query.nha_cung_cap_id || '');
    const hopDongId = String(req.query.hop_dong_id || '');
    const hopDongMuaId = String(req.query.hop_dong_mua_id || '');
    const search = String(req.query.search || '');
    const trangThai = String(req.query.trang_thai || '');
    const ngayGDExact = String(req.query.ngay_giao_dich || '');

    const conditions = [];
    const params = [];
    if (ngayGDExact) {
      conditions.push('DATE(dt.ngay_giao_dich) = ?');
      params.push(ngayGDExact.slice(0, 10));
    }
    if (dateFrom) {
      conditions.push('DATE(dt.ngay_giao_dich) >= ?');
      params.push(dateFrom);
    }
    if (dateTo) {
      conditions.push('DATE(dt.ngay_giao_dich) <= ?');
      params.push(dateTo);
    }
    if (loaiGD) {
      conditions.push('dt.loai_giao_dich = ?');
      params.push(loaiGD);
    }
    if (taiKhoanId) {
      conditions.push('(dt.tai_khoan_tien_id = ? OR dt.tai_khoan_nhan_id = ?)');
      params.push(taiKhoanId, taiKhoanId);
    }
    if (hangMucId) {
      conditions.push('dt.hang_muc_thu_chi_id = ?');
      params.push(hangMucId);
    }
    if (khachHangId) {
      conditions.push('dt.khach_hang_id = ?');
      params.push(khachHangId);
    }
    if (nhaCungCapId) {
      conditions.push('dt.nha_cung_cap_id = ?');
      params.push(nhaCungCapId);
    }
    if (hopDongId) {
      conditions.push('dt.hop_dong_id = ?');
      params.push(hopDongId);
    }
    if (hopDongMuaId) {
      conditions.push('dt.hop_dong_mua_id = ?');
      params.push(hopDongMuaId);
    }
    if (trangThai) {
      conditions.push('dt.trang_thai = ?');
      params.push(trangThai);
    }
    if (phamVi) {
      conditions.push('hm.pham_vi = ?');
      params.push(phamVi);
    }
    if (search) {
      conditions.push('(dt.mo_ta_giao_dich LIKE ? OR dt.ghi_chu LIKE ? OR dt.ma_giao_dich LIKE ? OR dt.ma_giao_dich_ngan_hang LIKE ?)');
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const wantSummary = String(req.query.summary || '') === '1';

    const countRow = await queryOne(
      `SELECT COUNT(*) AS total FROM dong_tien_moi dt
       LEFT JOIN hang_muc_thu_chi hm ON hm.id = dt.hang_muc_thu_chi_id
       ${where}`,
      params
    );

    let summary = null;
    if (wantSummary) {
      summary = await queryOne(
        `SELECT
           COALESCE(SUM(CASE WHEN dt.loai_giao_dich = 'thu' THEN dt.so_tien ELSE 0 END), 0) AS tong_thu,
           COALESCE(SUM(CASE WHEN dt.loai_giao_dich = 'chi' THEN dt.so_tien ELSE 0 END), 0) AS tong_chi
         FROM dong_tien_moi dt
         LEFT JOIN hang_muc_thu_chi hm ON hm.id = dt.hang_muc_thu_chi_id
         ${where}`,
        params
      );
    }

    const rows = await query(
      `${LIST_SELECT} ${where}
       ORDER BY dt.ngay_giao_dich DESC, dt.id DESC ${sqlLimitOffset(limit, offset)}`,
      params
    );

    const payload = { data: rows, total: countRow?.total || 0, page, limit };
    if (wantSummary) {
      payload.tong_thu = Number(summary?.tong_thu) || 0;
      payload.tong_chi = Number(summary?.tong_chi) || 0;
    }
    return res.json(payload);
  } catch (err) {
    return dbErrorResponse(res, err, 'Không thể tải dòng tiền');
  }
});

router.post('/dong-tien-moi', async (req, res) => {
  try {
    const body = req.body || {};
    const ngayGD = parseNgayGiaoDich(body.ngay_giao_dich);
    const ngayHT = parseNgayHachToan(body.ngay_giao_dich);
    const now = new Date();
    const maGD =
      body.ma_giao_dich ||
      `GD${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getTime()).slice(-6)}`;

    let soDuSau = body.so_du_sau_giao_dich ?? null;
    if (soDuSau === null && body.tai_khoan_tien_id) {
      const lastRow = await queryOne(
        'SELECT so_du_sau_giao_dich FROM dong_tien_moi WHERE tai_khoan_tien_id = ? ORDER BY ngay_giao_dich DESC, id DESC LIMIT 1',
        [body.tai_khoan_tien_id]
      );
      const prev =
        lastRow?.so_du_sau_giao_dich != null ? Number(lastRow.so_du_sau_giao_dich) : null;
      if (prev !== null) {
        const soTien = Number(body.so_tien) || 0;
        if (body.loai_giao_dich === 'thu') soDuSau = prev + soTien;
        else if (body.loai_giao_dich === 'chi') soDuSau = prev - soTien;
        else soDuSau = prev;
      }
    }

    const result = await query(
      `INSERT INTO dong_tien_moi (ma_giao_dich, ngay_giao_dich, ngay_hach_toan, loai_giao_dich, chieu_tien, tai_khoan_tien_id, tai_khoan_nhan_id, so_tien, doi_tuong_id, khach_hang_id, nha_cung_cap_id, hop_dong_id, hop_dong_mua_id, hang_muc_thu_chi_id, mo_ta_giao_dich, so_tai_khoan_doi_ung, ten_tai_khoan_doi_ung, so_du_sau_giao_dich, nguon_du_lieu, ma_tham_chieu, ma_giao_dich_ngan_hang, ghi_chu, trang_thai)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        maGD,
        ngayGD,
        ngayHT,
        body.loai_giao_dich,
        body.chieu_tien || null,
        body.tai_khoan_tien_id,
        body.tai_khoan_nhan_id || null,
        Number(body.so_tien) || 0,
        body.doi_tuong_id || null,
        body.khach_hang_id || null,
        body.nha_cung_cap_id || null,
        body.hop_dong_id || null,
        body.hop_dong_mua_id || null,
        body.hang_muc_thu_chi_id || null,
        body.mo_ta_giao_dich || null,
        body.so_tai_khoan_doi_ung || null,
        body.ten_tai_khoan_doi_ung || null,
        soDuSau,
        body.nguon_du_lieu || 'nhap_tay',
        body.ma_tham_chieu || null,
        body.ma_giao_dich_ngan_hang || null,
        body.ghi_chu || null,
        body.trang_thai || 'hoan_thanh',
      ]
    );
    const id = insertId(result);
    const newRow = await queryOne('SELECT * FROM dong_tien_moi WHERE id = ?', [id]);
    return res.json({ data: newRow });
  } catch (err) {
    return dbErrorResponse(res, err, 'Không thể tạo dòng tiền');
  }
});

router.post('/dong-tien-moi/bulk-update', async (req, res) => {
  try {
    const items = req.body?.items;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Thiếu danh sách items' });
    }

    let updated = 0;
    let created = 0;
    let failed = 0;
    const errors = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i] || {};
      const excelRow = item._excelRow || i + 2;
      try {
        if (item.id) {
          const existing = await queryOne('SELECT * FROM dong_tien_moi WHERE id = ?', [item.id]);
          if (!existing) throw new Error(`Không tìm thấy ID ${item.id}`);
          const merged = mergeMissingFields(existing, item, DONG_TIEN_UPDATE_FIELDS);
          const ngayGD = parseNgayGiaoDich(merged.ngay_giao_dich);
          const ngayHT = parseNgayHachToan(merged.ngay_giao_dich);
          const soTien = Number(merged.so_tien) || 0;
          if (!merged.loai_giao_dich || !merged.tai_khoan_tien_id || soTien <= 0) {
            throw new Error('Thiếu loại GD, tài khoản hoặc số tiền');
          }

          await query(
            `UPDATE dong_tien_moi SET
              ngay_giao_dich=?, ngay_hach_toan=?, loai_giao_dich=?, chieu_tien=?, tai_khoan_tien_id=?, tai_khoan_nhan_id=?,
              so_tien=?, hang_muc_thu_chi_id=?, mo_ta_giao_dich=?, khach_hang_id=?, nha_cung_cap_id=?,
              hop_dong_id=?, hop_dong_mua_id=?, so_tai_khoan_doi_ung=?, ten_tai_khoan_doi_ung=?,
              so_du_sau_giao_dich=?, ma_giao_dich_ngan_hang=?, ghi_chu=?, trang_thai=?
             WHERE id=?`,
            [
              ngayGD,
              ngayHT,
              merged.loai_giao_dich,
              merged.chieu_tien || null,
              merged.tai_khoan_tien_id,
              merged.tai_khoan_nhan_id || null,
              soTien,
              merged.hang_muc_thu_chi_id || null,
              merged.mo_ta_giao_dich || null,
              merged.khach_hang_id || null,
              merged.nha_cung_cap_id || null,
              merged.hop_dong_id || null,
              merged.hop_dong_mua_id || null,
              merged.so_tai_khoan_doi_ung || null,
              merged.ten_tai_khoan_doi_ung || null,
              merged.so_du_sau_giao_dich ?? null,
              merged.ma_giao_dich_ngan_hang || null,
              merged.ghi_chu || null,
              merged.trang_thai || 'hoan_thanh',
              item.id,
            ]
          );
          updated++;
        } else {
          const ngayGD = parseNgayGiaoDich(item.ngay_giao_dich);
          const ngayHT = parseNgayHachToan(item.ngay_giao_dich);
          const soTien = Number(item.so_tien) || 0;
          if (!item.loai_giao_dich || !item.tai_khoan_tien_id || soTien <= 0) {
            throw new Error('Thiếu loại GD, tài khoản hoặc số tiền');
          }
          const now = new Date();
          const maGD = `GD${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getTime()).slice(-6)}${i}`;
          await query(
            `INSERT INTO dong_tien_moi (ma_giao_dich, ngay_giao_dich, ngay_hach_toan, loai_giao_dich, chieu_tien, tai_khoan_tien_id, tai_khoan_nhan_id, so_tien, hang_muc_thu_chi_id, mo_ta_giao_dich, khach_hang_id, nha_cung_cap_id, hop_dong_id, hop_dong_mua_id, so_tai_khoan_doi_ung, ten_tai_khoan_doi_ung, so_du_sau_giao_dich, nguon_du_lieu, ma_giao_dich_ngan_hang, ghi_chu, trang_thai)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              maGD,
              ngayGD,
              ngayHT,
              item.loai_giao_dich,
              item.chieu_tien || null,
              item.tai_khoan_tien_id,
              item.tai_khoan_nhan_id || null,
              soTien,
              item.hang_muc_thu_chi_id || null,
              item.mo_ta_giao_dich || null,
              item.khach_hang_id || null,
              item.nha_cung_cap_id || null,
              item.hop_dong_id || null,
              item.hop_dong_mua_id || null,
              item.so_tai_khoan_doi_ung || null,
              item.ten_tai_khoan_doi_ung || null,
              item.so_du_sau_giao_dich ?? null,
              'import_excel',
              item.ma_giao_dich_ngan_hang || null,
              item.ghi_chu || null,
              item.trang_thai || 'hoan_thanh',
            ]
          );
          created++;
        }
      } catch (err) {
        failed++;
        errors.push({ excelRow, message: err.message || 'Lỗi không xác định' });
      }
    }

    return res.json({ updated, created, failed, errors });
  } catch (err) {
    return dbErrorResponse(res, err, 'Không thể cập nhật hàng loạt');
  }
});

router.put('/dong-tien-moi/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const body = req.body || {};
    const existing = await queryOne('SELECT * FROM dong_tien_moi WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const merged = mergeMissingFields(existing, body, DONG_TIEN_UPDATE_FIELDS);
    const ngayGD = parseNgayGiaoDich(merged.ngay_giao_dich);
    const ngayHT = parseNgayHachToan(merged.ngay_giao_dich);
    await query(
      `UPDATE dong_tien_moi SET ngay_giao_dich=?, ngay_hach_toan=?, loai_giao_dich=?, chieu_tien=?, tai_khoan_tien_id=?, tai_khoan_nhan_id=?, so_tien=?, doi_tuong_id=?, khach_hang_id=?, nha_cung_cap_id=?, hop_dong_id=?, hop_dong_mua_id=?, hang_muc_thu_chi_id=?, mo_ta_giao_dich=?, so_tai_khoan_doi_ung=?, ten_tai_khoan_doi_ung=?, so_du_sau_giao_dich=?, ma_giao_dich_ngan_hang=?, ghi_chu=?, trang_thai=? WHERE id=?`,
      [
        ngayGD,
        ngayHT,
        merged.loai_giao_dich,
        merged.chieu_tien || null,
        merged.tai_khoan_tien_id,
        merged.tai_khoan_nhan_id || null,
        Number(merged.so_tien) || 0,
        merged.doi_tuong_id || null,
        merged.khach_hang_id || null,
        merged.nha_cung_cap_id || null,
        merged.hop_dong_id || null,
        merged.hop_dong_mua_id || null,
        merged.hang_muc_thu_chi_id || null,
        merged.mo_ta_giao_dich || null,
        merged.so_tai_khoan_doi_ung || null,
        merged.ten_tai_khoan_doi_ung || null,
        merged.so_du_sau_giao_dich ?? null,
        merged.ma_giao_dich_ngan_hang ?? null,
        merged.ghi_chu || null,
        merged.trang_thai || 'hoan_thanh',
        id,
      ]
    );
    const updated = await queryOne('SELECT * FROM dong_tien_moi WHERE id = ?', [id]);
    return res.json({ data: updated });
  } catch (err) {
    return dbErrorResponse(res, err, 'Không thể cập nhật dòng tiền');
  }
});

router.delete('/dong-tien-moi/:id', async (req, res) => {
  try {
    await query('DELETE FROM dong_tien_moi WHERE id = ?', [req.params.id]);
    return res.json({ success: true });
  } catch (err) {
    return dbErrorResponse(res, err, 'Không thể xóa dòng tiền');
  }
});

export default router;
