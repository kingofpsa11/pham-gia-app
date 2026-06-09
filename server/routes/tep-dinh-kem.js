import { Router } from 'express';
import { query, queryOne } from '../db.js';

const router = Router();

function insertId(result) {
  return Number(result?.insertId ?? result?.[0]?.insertId);
}

router.get('/tep-dinh-kem', async (req, res) => {
  try {
    const relatedType = String(req.query.related_type || '');
    const relatedId = String(req.query.related_id || '');
    const conditions = [];
    const params = [];

    if (relatedType) {
      conditions.push('related_type = ?');
      params.push(relatedType);
    }
    if (relatedId) {
      conditions.push('related_id = ?');
      params.push(relatedId);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await query(
      `SELECT * FROM tep_dinh_kem ${where} ORDER BY id DESC`,
      params
    );
    return res.json({ data: rows });
  } catch (err) {
    console.error('GET /api/tep-dinh-kem error:', err.message);
    return res.json({ data: [] });
  }
});

router.post('/tep-dinh-kem', async (req, res) => {
  try {
    const body = req.body;
    const result = await query(
      `INSERT INTO tep_dinh_kem (related_type, related_id, ten_file, drive_file_id, drive_folder_id, drive_url, mime_type, file_size)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        body.related_type,
        body.related_id,
        body.ten_file,
        body.drive_file_id,
        body.drive_folder_id || '',
        body.drive_url || '',
        body.mime_type || '',
        body.file_size || 0,
      ]
    );
    const newRow = await queryOne('SELECT * FROM tep_dinh_kem WHERE id = ?', [insertId(result)]);
    return res.json({ data: newRow });
  } catch (err) {
    console.error('POST /api/tep-dinh-kem error:', err.message);
    return res.status(500).json({ error: 'Không thể lưu tệp đính kèm', message: err.message });
  }
});

router.delete('/tep-dinh-kem/:id', async (req, res) => {
  try {
    await query('DELETE FROM tep_dinh_kem WHERE id = ?', [req.params.id]);
    return res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/tep-dinh-kem/:id error:', err.message);
    return res.status(500).json({ error: 'Không thể xóa tệp đính kèm', message: err.message });
  }
});

export default router;
