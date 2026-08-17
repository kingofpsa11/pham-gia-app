import { Router } from 'express';
import { query, queryOne } from '../db.js';
import { dbErrorResponse } from '../utils/errors.js';

const router = Router();

/**
 * Công nợ phải thu theo khách hàng — aggregate SQL, không dump full bảng.
 * GET /api/cong-no
 */
router.get('/cong-no', async (_req, res) => {
  try {
    const now = new Date();
    const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

    const [ghiNoRows, thanhToanRows, daThuThang] = await Promise.all([
      query(
        `SELECT COALESCE(pgh.khach_hang_id, hd.khach_hang_id) AS khach_hang_id,
                COALESCE(kh.ten_cong_ty, '') AS ten_cong_ty,
                SUM(COALESCE(pgh.gia_tri_ghi_no, 0)) AS tong_gia_tri_ghi_no
         FROM phieu_giao_hang pgh
         LEFT JOIN hop_dong hd ON hd.id = pgh.hop_dong_id
         LEFT JOIN khach_hang kh ON kh.id = COALESCE(pgh.khach_hang_id, hd.khach_hang_id)
         WHERE COALESCE(pgh.khach_hang_id, hd.khach_hang_id) IS NOT NULL
         GROUP BY COALESCE(pgh.khach_hang_id, hd.khach_hang_id), kh.ten_cong_ty`
      ),
      query(
        `SELECT khach_hang_id, SUM(COALESCE(ghi_no, 0)) AS tong_da_thanh_toan
         FROM dong_tien
         WHERE khach_hang_id IS NOT NULL
         GROUP BY khach_hang_id`
      ),
      queryOne(
        `SELECT COALESCE(SUM(ghi_no), 0) AS tong
         FROM dong_tien
         WHERE khach_hang_id IS NOT NULL
           AND DATE(ngay_gio_giao_dich) >= ?`,
        [startOfMonth]
      ),
    ]);

    const paidMap = new Map(
      (thanhToanRows || []).map((r) => [Number(r.khach_hang_id), Number(r.tong_da_thanh_toan) || 0])
    );

    const customers = (ghiNoRows || []).map((r) => {
      const khId = Number(r.khach_hang_id);
      const tongGhiNo = Number(r.tong_gia_tri_ghi_no) || 0;
      const daThanhToan = paidMap.get(khId) || 0;
      return {
        khach_hang_id: khId,
        ten_cong_ty: r.ten_cong_ty || '',
        tong_gia_tri_ghi_no: tongGhiNo,
        tong_da_thanh_toan: daThanhToan,
        con_phai_thu: tongGhiNo - daThanhToan,
      };
    });

    customers.sort((a, b) => b.con_phai_thu - a.con_phai_thu);

    const tongCongNoPhaiThu = customers.reduce((s, c) => s + c.con_phai_thu, 0);
    const soKhachHangDangNo = customers.filter((c) => c.con_phai_thu > 0).length;

    return res.json({
      data: customers,
      tong_cong_no_phai_thu: tongCongNoPhaiThu,
      so_khach_hang_dang_no: soKhachHangDangNo,
      tong_da_thu_thang_nay: Number(daThuThang?.tong) || 0,
    });
  } catch (err) {
    return dbErrorResponse(res, err, 'Không thể tải công nợ');
  }
});

export default router;
