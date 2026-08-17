import { Router } from 'express';
import { optionalAuth } from '../middleware/auth.js';
import { generatePhuLucDocx } from '../utils/phuLucWord.js';

const router = Router();

router.post('/xuat-phu-luc-word', optionalAuth, async (req, res) => {
  try {
    const phuLucId = req.body?.phu_luc_id;
    if (!phuLucId) {
      return res.status(400).json({ error: 'Thiếu phu_luc_id' });
    }
    const { buffer, fileName } = await generatePhuLucDocx(phuLucId);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    return res.send(buffer);
  } catch (err) {
    console.error('POST /api/xuat-phu-luc-word error:', err.message);
    return res.status(500).json({
      error: 'Xuất phụ lục Word thất bại',
      message: err.message,
    });
  }
});

export default router;
