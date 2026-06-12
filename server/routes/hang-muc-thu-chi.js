import { Router } from 'express';
import { query, queryOne } from '../db.js';
import { dbErrorResponse } from '../utils/errors.js';
import {
  assertNotDescendant,
  assertValidParent,
  generateMaHangMuc,
  nextThuTu,
} from '../utils/hangMucThuChi.js';

const router = Router();

function insertId(result) {
  return Number(result?.insertId ?? result?.[0]?.insertId);
}

function coerceBooleanField(body, current, field) {
  if (Object.prototype.hasOwnProperty.call(body, field)) {
    return body[field] ? 1 : 0;
  }
  return current[field] ? 1 : 0;
}

router.get('/hang-muc-thu-chi', async (req, res) => {
  try {
    const loai = String(req.query.loai_giao_dich || '');
    const phamVi = String(req.query.pham_vi || '');
    const trangThai = String(req.query.trang_thai || 'hoat_dong');
    const conditions = [];
    const params = [];
    if (loai) {
      conditions.push("(loai_giao_dich = ? OR loai_giao_dich = 'tat_ca')");
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
    const rows = await query(
      `SELECT * FROM hang_muc_thu_chi ${where} ORDER BY cap_do, thu_tu, ten_hang_muc`,
      params
    );
    return res.json({ data: rows });
  } catch (err) {
    return dbErrorResponse(res, err, 'Không thể tải hạng mục thu chi');
  }
});

router.post('/hang-muc-thu-chi', async (req, res) => {
  try {
    const body = req.body || {};
    if (!String(body.ten_hang_muc || '').trim()) {
      return res.status(400).json({ error: 'Vui lòng nhập tên hạng mục' });
    }

    const parentId = body.parent_id ? Number(body.parent_id) : null;
    const { capDo, parent } = await assertValidParent(parentId);

    const loaiGiaoDich = body.loai_giao_dich || parent?.loai_giao_dich || 'chi';
    const phamVi = body.pham_vi || parent?.pham_vi || 'cong_ty';
    const maHangMuc = String(body.ma_hang_muc || '').trim() || await generateMaHangMuc({
      parentId,
      tenHangMuc: body.ten_hang_muc,
      loaiGiaoDich,
    });
    const thuTu = body.thu_tu != null ? Number(body.thu_tu) : await nextThuTu(parentId);

    const result = await query(
      `INSERT INTO hang_muc_thu_chi (ma_hang_muc, ten_hang_muc, loai_giao_dich, pham_vi, parent_id, cap_do, tinh_chat, ap_dung_cho_hop_dong, ap_dung_cho_nha_cung_cap, ap_dung_cho_nhan_vien, thu_tu, trang_thai)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        maHangMuc,
        body.ten_hang_muc.trim(),
        loaiGiaoDich,
        phamVi,
        parentId,
        capDo,
        body.tinh_chat || parent?.tinh_chat || 'khac',
        body.ap_dung_cho_hop_dong ? 1 : 0,
        body.ap_dung_cho_nha_cung_cap ? 1 : 0,
        body.ap_dung_cho_nhan_vien ? 1 : 0,
        thuTu,
        body.trang_thai || 'hoat_dong',
      ]
    );
    const id = insertId(result);
    const newRow = await queryOne('SELECT * FROM hang_muc_thu_chi WHERE id = ?', [id]);
    return res.json({ data: newRow });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    return dbErrorResponse(res, err, 'Không thể tạo hạng mục thu chi');
  }
});

router.put('/hang-muc-thu-chi/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = req.body || {};
    const current = await queryOne('SELECT * FROM hang_muc_thu_chi WHERE id = ?', [id]);
    if (!current) return res.status(404).json({ error: 'Không tìm thấy hạng mục' });

    const parentId = body.parent_id ? Number(body.parent_id) : null;
    await assertNotDescendant(id, parentId);
    const { capDo } = await assertValidParent(parentId);

    await query(
      `UPDATE hang_muc_thu_chi SET ten_hang_muc=?, loai_giao_dich=?, pham_vi=?, parent_id=?, cap_do=?, tinh_chat=?, ap_dung_cho_hop_dong=?, ap_dung_cho_nha_cung_cap=?, ap_dung_cho_nhan_vien=?, thu_tu=?, trang_thai=? WHERE id=?`,
      [
        body.ten_hang_muc,
        body.loai_giao_dich,
        body.pham_vi,
        parentId,
        capDo,
        body.tinh_chat || current.tinh_chat || 'khac',
        coerceBooleanField(body, current, 'ap_dung_cho_hop_dong'),
        coerceBooleanField(body, current, 'ap_dung_cho_nha_cung_cap'),
        coerceBooleanField(body, current, 'ap_dung_cho_nhan_vien'),
        body.thu_tu != null ? Number(body.thu_tu) : current.thu_tu,
        body.trang_thai || 'hoat_dong',
        id,
      ]
    );
    const updated = await queryOne('SELECT * FROM hang_muc_thu_chi WHERE id = ?', [id]);
    return res.json({ data: updated });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    return dbErrorResponse(res, err, 'Không thể cập nhật hạng mục thu chi');
  }
});

router.delete('/hang-muc-thu-chi/:id', async (req, res) => {
  try {
    await query("UPDATE hang_muc_thu_chi SET trang_thai = 'an' WHERE id = ?", [req.params.id]);
    return res.json({ success: true });
  } catch (err) {
    return dbErrorResponse(res, err, 'Không thể xóa hạng mục thu chi');
  }
});

export default router;
