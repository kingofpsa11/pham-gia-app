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

    const [baoGiaCount, hopDongHieuLuc, dongTienMonth, phieuGiaoGhiNo, taiKhoanAll] =
      await Promise.all([
        queryOne(
          `SELECT COUNT(*) AS total FROM bao_gia WHERE ngay_bao_gia >= ? AND ngay_bao_gia <= ?`,
          [firstDay, lastDay]
        ),
        queryOne(`SELECT COUNT(*) AS total FROM hop_dong WHERE trang_thai = 'Hieu luc'`),
        query(
          `SELECT ghi_no, ghi_co, khach_hang_id, loai_chi_phi_id FROM dong_tien
           WHERE DATE(ngay_gio_giao_dich) >= ? AND DATE(ngay_gio_giao_dich) <= ?`,
          [firstDay, lastDay]
        ),
        queryOne(
          `SELECT SUM(pghct.so_luong_giao * COALESCE(hdct.gia_hop_dong, 0)) AS tong
           FROM phieu_giao_hang_chi_tiet pghct
           LEFT JOIN hop_dong_chi_tiet hdct ON hdct.id = pghct.hop_dong_chi_tiet_id`
        ),
        query(`SELECT id, ten_tai_khoan FROM tai_khoan`),
      ]);

    const tongThu = dongTienMonth.reduce((s, d) => s + Number(d.ghi_no || 0), 0);
    const tongChi = dongTienMonth.reduce((s, d) => s + Number(d.ghi_co || 0), 0);
    const tongChiPhi = dongTienMonth
      .filter((d) => d.loai_chi_phi_id)
      .reduce((s, d) => s + Number(d.ghi_co || 0), 0);
    const tongGhiNo = Number(phieuGiaoGhiNo?.tong || 0);
    const tongDaThu = dongTienMonth
      .filter((d) => d.khach_hang_id)
      .reduce((s, d) => s + Number(d.ghi_no || 0), 0);

    const allDongTien = await query('SELECT ghi_no, ghi_co, tai_khoan_id FROM dong_tien');
    const accountBalances = taiKhoanAll.map((tk) => {
      const balance = allDongTien
        .filter((d) => d.tai_khoan_id === tk.id)
        .reduce((s, d) => s + Number(d.ghi_no || 0) - Number(d.ghi_co || 0), 0);
      return { tai_khoan_id: tk.id, ten_tai_khoan: tk.ten_tai_khoan, so_du: balance };
    });

    const [hopDongRecent, dongTienRecent] = await Promise.all([
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

    return res.json({
      tong_bao_gia_thang: baoGiaCount?.total || 0,
      tong_hop_dong_hieu_luc: hopDongHieuLuc?.total || 0,
      tong_tien_da_thu: tongThu,
      tong_tien_da_chi: tongChi,
      cong_no_phai_thu: tongGhiNo - tongDaThu,
      tong_chi_phi_thang: tongChiPhi,
      so_du_tai_khoan: accountBalances,
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
