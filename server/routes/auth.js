import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../db.js';
import { getJwtSecret } from '../middleware/auth.js';

const router = Router();

const USER_TABLE_CANDIDATES = ['Admin', 'users', 'nguoi_dung', 'tai_khoan_he_thong'];

async function findUserTable() {
  const placeholders = USER_TABLE_CANDIDATES.map(() => '?').join(', ');
  const rows = await query(
    `SELECT TABLE_NAME AS name
     FROM information_schema.tables
     WHERE table_schema = DATABASE()
       AND TABLE_NAME IN (${placeholders})`,
    USER_TABLE_CANDIDATES
  );
  const found = new Set(rows.map((r) => r.name));
  return USER_TABLE_CANDIDATES.find((name) => found.has(name)) ?? null;
}

async function getUserColumns(tableName) {
  const rows = await query(
    `SELECT COLUMN_NAME AS name
     FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ?`,
    [tableName]
  );
  return new Set(rows.map((r) => r.name));
}

function pickColumn(columns, candidates) {
  return candidates.find((name) => columns.has(name)) ?? null;
}

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body ?? {};

    if (!email || !password) {
      return res.status(400).json({ error: 'Email và mật khẩu là bắt buộc' });
    }

    const tableName = await findUserTable();
    if (!tableName) {
      return res.status(503).json({
        error: 'Không tìm thấy bảng người dùng (Admin / users / nguoi_dung / tai_khoan_he_thong)',
      });
    }

    const columns = await getUserColumns(tableName);
    const emailCol = pickColumn(columns, ['email', 'username', 'ten_dang_nhap']);
    const passwordCol = pickColumn(columns, [
      'password_hash',
      'mat_khau_hash',
      'password',
      'mat_khau',
    ]);
    const idCol = pickColumn(columns, ['id', 'user_id']);
    const roleCol = pickColumn(columns, ['role', 'vai_tro']);
    const nameCol = pickColumn(columns, ['ten', 'ho_ten', 'full_name', 'name']);

    if (!emailCol || !passwordCol || !idCol) {
      return res.status(503).json({
        error: `Bảng ${tableName} thiếu cột email hoặc mật khẩu cần thiết`,
      });
    }

    const users = await query(
      `SELECT * FROM \`${tableName}\` WHERE \`${emailCol}\` = ? LIMIT 1`,
      [email]
    );
    const user = users[0];

    if (!user) {
      return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng' });
    }

    const storedPassword = user[passwordCol];
    const passwordOk =
      typeof storedPassword === 'string' && storedPassword.startsWith('$2')
        ? await bcrypt.compare(password, storedPassword)
        : storedPassword === password;

    if (!passwordOk) {
      return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng' });
    }

    const role = roleCol ? user[roleCol] : (tableName === 'Admin' ? 'admin' : 'staff');
    const ten = nameCol ? user[nameCol] : '';
    const userId = user[idCol];

    const token = jwt.sign(
      { id: userId, email, role },
      getJwtSecret(),
      { expiresIn: '7d' }
    );

    return res.json({
      token,
      user: {
        id: userId,
        email,
        role,
        ten,
      },
    });
  } catch (err) {
    console.error('POST /api/auth/login error:', err.message);
    return res.status(500).json({ error: 'Đăng nhập thất bại', message: err.message });
  }
});

export default router;
