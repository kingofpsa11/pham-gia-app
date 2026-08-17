import { Router } from 'express';
import { optionalAuth } from '../middleware/auth.js';
import { generateBbbgExcel } from '../utils/bbbgExcel.js';

const router = Router();

router.post('/xuat-bbbg-excel', optionalAuth, async (req, res) => {
  try {
    const phieuId = req.body?.phieu_giao_hang_id;
    if (!phieuId) {
      return res.status(400).json({ error: 'Thiếu phieu_giao_hang_id' });
    }

    const { buffer, fileName } = await generateBbbgExcel(phieuId, {
      nguoi_giao: req.body?.nguoi_giao,
      chuc_vu_giao: req.body?.chuc_vu_giao,
      nguoi_nhan: req.body?.nguoi_nhan,
      chuc_vu_nhan: req.body?.chuc_vu_nhan,
      so_bbbg: req.body?.so_bbbg,
    });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    return res.send(buffer);
  } catch (err) {
    console.error('POST /api/xuat-bbbg-excel error:', err.message);
    return res.status(500).json({
      error: 'Xuất biên bản bàn giao thất bại',
      message: err.message,
    });
  }
});

export default router;
