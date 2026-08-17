import { Router } from 'express';
import { optionalAuth } from '../middleware/auth.js';
import { generateHopDongDocx } from '../utils/hopDongWord.js';

const router = Router();

router.post('/xuat-hop-dong-word', optionalAuth, async (req, res) => {
  try {
    const hopDongId = req.body?.hop_dong_id;
    if (!hopDongId) {
      return res.status(400).json({ error: 'Thiếu hop_dong_id' });
    }

    const { buffer, fileName } = await generateHopDongDocx(hopDongId);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    return res.send(buffer);
  } catch (err) {
    console.error('POST /api/xuat-hop-dong-word error:', err.message);
    return res.status(500).json({
      error: 'Xuất Word thất bại',
      message: err.message,
    });
  }
});

export default router;
