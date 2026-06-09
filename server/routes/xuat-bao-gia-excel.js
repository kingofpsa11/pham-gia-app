import { Router } from 'express';
import { optionalAuth } from '../middleware/auth.js';
import { uploadExcelToUserDrive } from '../utils/googleDrive.js';
import { generateBaoGiaExcel } from '../utils/baoGiaExcel.js';

const router = Router();

router.post('/xuat-bao-gia-excel', optionalAuth, async (req, res) => {
  try {
    const { bao_gia_id, mau_key } = req.body ?? {};
    if (!bao_gia_id || !mau_key) {
      return res.status(400).json({ error: 'Thiếu bao_gia_id hoặc mau_key' });
    }

    const { buffer, fileName } = await generateBaoGiaExcel(bao_gia_id, mau_key);

    let driveLink = null;
    if (req.user?.id) {
      try {
        driveLink = await uploadExcelToUserDrive(req.user.id, fileName, buffer);
      } catch (driveErr) {
        console.error('Drive upload error:', driveErr.message);
      }
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    if (driveLink) res.setHeader('X-Drive-Link', driveLink);
    return res.send(buffer);
  } catch (err) {
    console.error('POST /api/xuat-bao-gia-excel error:', err.message);
    return res.status(500).json({
      error: 'Xuất Excel thất bại',
      message: err.message,
    });
  }
});

export default router;
