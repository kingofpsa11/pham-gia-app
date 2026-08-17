import { Router } from 'express';
import { optionalAuth } from '../middleware/auth.js';
import { generateDeNghiDocx } from '../utils/deNghiWord.js';

const router = Router();

router.post('/xuat-de-nghi-word', optionalAuth, async (req, res) => {
  try {
    const hopDongId = req.body?.hop_dong_id;
    const loai = req.body?.loai;
    if (!hopDongId) {
      return res.status(400).json({ error: 'Thiếu hop_dong_id' });
    }
    if (loai !== 'tam_ung' && loai !== 'thanh_toan') {
      return res.status(400).json({ error: 'loai phải là tam_ung hoặc thanh_toan' });
    }

    const { buffer, fileName } = await generateDeNghiDocx(hopDongId, loai, {
      so_van_ban: req.body?.so_van_ban,
      ngay_van_ban: req.body?.ngay_van_ban,
      so_tien: req.body?.so_tien,
      ngay_ban_giao: req.body?.ngay_ban_giao,
      nguoi_ky: req.body?.nguoi_ky,
      tieu_de: req.body?.tieu_de,
    });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    return res.send(buffer);
  } catch (err) {
    console.error('POST /api/xuat-de-nghi-word error:', err.message);
    return res.status(500).json({
      error: 'Xuất đề nghị thất bại',
      message: err.message,
    });
  }
});

export default router;
