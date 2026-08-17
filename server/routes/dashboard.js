import { Router } from 'express';
import { query, queryOne } from '../db.js';

const router = Router();

router.get('/dashboard-stats', async (_req, res) => {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = `${year}-${String(month).padStart(2, '0')}-${String(
      new Date(year, month, 0).getDate()
    ).padStart(2, '0')}`;

    const [
      baoGiaCount,
      hopDongHieuLuc,
      dongTienAgg,
      phieuGiaoGhiNo,
      accountBalances,
      hopDongRecent,
      dongTienRecent,
    ] = await Promise.all([
      queryOne(
        `SELECT COUNT(*) AS total FROM bao_gia WHERE ngay_bao_gia >= ? AND ngay_bao_gia <= ?`,
        [firstDay, lastDay]
      ),
      queryOne(`SELECT COUNT(*) AS total FROM hop_dong WHERE trang_thai = 'Hieu luc'`),
      queryOne(
        `SELECT
           COALESCE(SUM(ghi_no), 0) AS tong_thu,
           COALESCE(SUM(ghi_co), 0) AS tong_chi,
           COALESCE(SUM(CASE WHEN loai_chi_phi_id IS NOT NULL THEN ghi_co ELSE 0 END), 0) AS tong_chi_phi,
           COALESCE(SUM(CASE WHEN khach_hang_id IS NOT NULL THEN ghi_no ELSE 0 END), 0) AS tong_da_thu
         FROM dong_tien
         WHERE DATE(ngay_gio_giao_dich) >= ? AND DATE(ngay_gio_giao_dich) <= ?`,
        [firstDay, lastDay]
      ),
      queryOne(
        `SELECT COALESCE(SUM(pghct.so_luong_giao * COALESCE(hdct.gia_hop_dong, 0)), 0) AS tong
         FROM phieu_giao_hang_chi_tiet pghct
         LEFT JOIN hop_dong_chi_tiet hdct ON hdct.id = pghct.hop_dong_chi_tiet_id`
      ),
      query(
        `SELECT tk.id AS tai_khoan_id, tk.ten_tai_khoan,
                COALESCE(SUM(COALESCE(dt.ghi_no, 0) - COALESCE(dt.ghi_co, 0)), 0) AS so_du
         FROM tai_khoan tk
         LEFT JOIN dong_tien dt ON dt.tai_khoan_id = tk.id
         GROUP BY tk.id, tk.ten_tai_khoan
         ORDER BY tk.ten_tai_khoan`
      ),
      query(
        `SELECT hd.*, kh.ten_cong_ty FROM hop_dong hd
         LEFT JOIN khach_hang kh ON hd.khach_hang_id = kh.id
         ORDER BY hd.id DESC LIMIT 5`
      ),
      query(
        `SELECT dt.*, tk.ten_tai_khoan FROM dong_tien dt
         LEFT JOIN tai_khoan tk ON dt.tai_khoan_id = tk.id
         ORDER BY dt.id DESC LIMIT 5`
      ),
    ]);

    const tongThu = Number(dongTienAgg?.tong_thu) || 0;
    const tongChi = Number(dongTienAgg?.tong_chi) || 0;
    const tongChiPhi = Number(dongTienAgg?.tong_chi_phi) || 0;
    const tongDaThu = Number(dongTienAgg?.tong_da_thu) || 0;
    const tongGhiNo = Number(phieuGiaoGhiNo?.tong) || 0;

    return res.json({
      tong_bao_gia_thang: baoGiaCount?.total || 0,
      tong_hop_dong_hieu_luc: hopDongHieuLuc?.total || 0,
      tong_tien_da_thu: tongThu,
      tong_tien_da_chi: tongChi,
      cong_no_phai_thu: tongGhiNo - tongDaThu,
      tong_chi_phi_thang: tongChiPhi,
      so_du_tai_khoan: (accountBalances || []).map((r) => ({
        tai_khoan_id: r.tai_khoan_id,
        ten_tai_khoan: r.ten_tai_khoan,
        so_du: Number(r.so_du) || 0,
      })),
      hop_dong_moi_nhat: hopDongRecent,
      dong_tien_moi_nhat: dongTienRecent,
    });
  } catch (err) {
    console.error('GET /api/dashboard-stats error:', err.message);
    return res.status(500).json({
      error: 'Không thể tải thống kê dashboard',
      message: err.message,
    });
  }
});

export default router;
