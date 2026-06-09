import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { query, queryOne } from '../db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { findUserTable, getUserColumns, pickColumn } from '../utils/userTable.js';

const router = Router();

async function getUserMeta() {
  const tableName = await findUserTable();
  if (!tableName) return null;
  const columns = await getUserColumns(tableName);
  return {
    tableName,
    columns,
    idCol: pickColumn(columns, ['id', 'user_id']),
    emailCol: pickColumn(columns, ['email', 'username', 'ten_dang_nhap']),
    passwordCol: pickColumn(columns, ['password_hash', 'mat_khau_hash', 'password', 'mat_khau']),
    nameCol: pickColumn(columns, ['name', 'ten', 'ho_ten', 'full_name']),
    roleCol: pickColumn(columns, ['role', 'vai_tro']),
    createdCol: pickColumn(columns, ['createdAt', 'created_at']),
    updatedCol: pickColumn(columns, ['updatedAt', 'updated_at']),
  };
}

function mapUser(row, meta) {
  const { idCol, emailCol, nameCol, roleCol, createdCol } = meta;
  return {
    id: row[idCol],
    email: row[emailCol],
    ten: nameCol ? row[nameCol] : '',
    name: nameCol ? row[nameCol] : '',
    role: roleCol ? row[roleCol] : 'admin',
    created_at: createdCol ? row[createdCol] : null,
  };
}

router.get('/users', requireAdmin, async (_req, res) => {
  try {
    const meta = await getUserMeta();
    if (!meta?.idCol || !meta.emailCol) {
      return res.status(503).json({ error: 'Không tìm thấy bảng người dùng' });
    }
    const cols = [`\`${meta.idCol}\``, `\`${meta.emailCol}\``];
    if (meta.nameCol) cols.push(`\`${meta.nameCol}\``);
    if (meta.roleCol) cols.push(`\`${meta.roleCol}\``);
    if (meta.createdCol) cols.push(`\`${meta.createdCol}\``);
    const orderCol = meta.createdCol || meta.idCol;
    const rows = await query(
      `SELECT ${cols.join(', ')} FROM \`${meta.tableName}\` ORDER BY \`${orderCol}\` ASC`,
    );
    return res.json({ data: rows.map((r) => mapUser(r, meta)) });
  } catch (err) {
    console.error('GET /api/users error:', err.message);
    return res.status(500).json({ error: 'Không thể tải danh sách người dùng', message: err.message });
  }
});

router.post('/users', requireAdmin, async (req, res) => {
  try {
    const meta = await getUserMeta();
    if (!meta?.idCol || !meta.emailCol || !meta.passwordCol) {
      return res.status(503).json({ error: 'Bảng người dùng thiếu cột cần thiết' });
    }
    const { email, password, ten, name, role } = req.body ?? {};
    const displayName = (ten || name || '').trim();
    if (!email || !password) {
      return res.status(400).json({ error: 'Email và mật khẩu là bắt buộc' });
    }
    const hash = await bcrypt.hash(password, 10);
    const id = randomUUID();
    const fields = [`\`${meta.idCol}\``, `\`${meta.emailCol}\``, `\`${meta.passwordCol}\``];
    const vals = [id, email, hash];
    if (meta.nameCol) { fields.push(`\`${meta.nameCol}\``); vals.push(displayName); }
    if (meta.roleCol) { fields.push(`\`${meta.roleCol}\``); vals.push(role || 'staff'); }
    await query(
      `INSERT INTO \`${meta.tableName}\` (${fields.join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`,
      vals,
    );
    return res.status(201).json({ data: { id, email, ten: displayName, role: role || 'staff' } });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Email đã tồn tại' });
    }
    console.error('POST /api/users error:', err.message);
    return res.status(500).json({ error: 'Không thể tạo người dùng', message: err.message });
  }
});

router.put('/users/:id', requireAuth, async (req, res) => {
  try {
    const meta = await getUserMeta();
    if (!meta?.idCol) return res.status(503).json({ error: 'Không tìm thấy bảng người dùng' });
    const isSelf = String(req.params.id) === String(req.user.id);
    if (!isSelf && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const { ten, name, email, role } = req.body ?? {};
    const sets = [];
    const vals = [];
    if (meta.nameCol && (ten != null || name != null)) {
      sets.push(`\`${meta.nameCol}\` = ?`);
      vals.push((ten || name || '').trim());
    }
    if (req.user.role === 'admin' && meta.emailCol && email != null) {
      sets.push(`\`${meta.emailCol}\` = ?`);
      vals.push(email);
    }
    if (req.user.role === 'admin' && meta.roleCol && role != null) {
      sets.push(`\`${meta.roleCol}\` = ?`);
      vals.push(role);
    }
    if (!sets.length) return res.status(400).json({ error: 'Không có dữ liệu cập nhật' });
    if (meta.updatedCol) sets.push(`\`${meta.updatedCol}\` = NOW(3)`);
    vals.push(req.params.id);
    await query(
      `UPDATE \`${meta.tableName}\` SET ${sets.join(', ')} WHERE \`${meta.idCol}\` = ?`,
      vals,
    );
    return res.json({ success: true });
  } catch (err) {
    console.error('PUT /api/users/:id error:', err.message);
    return res.status(500).json({ error: 'Không thể cập nhật người dùng', message: err.message });
  }
});

router.put('/users/me/password', requireAuth, async (req, res) => {
  try {
    const meta = await getUserMeta();
    if (!meta?.idCol || !meta.passwordCol) {
      return res.status(503).json({ error: 'Không tìm thấy bảng người dùng' });
    }
    const { currentPassword, newPassword } = req.body ?? {};
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Mật khẩu mới phải có ít nhất 6 ký tự' });
    }
    const row = await queryOne(
      `SELECT \`${meta.passwordCol}\` AS pw FROM \`${meta.tableName}\` WHERE \`${meta.idCol}\` = ?`,
      [req.user.id],
    );
    if (!row) return res.status(404).json({ error: 'Không tìm thấy tài khoản' });
    const stored = row.pw;
    const ok = typeof stored === 'string' && stored.startsWith('$2')
      ? await bcrypt.compare(currentPassword || '', stored)
      : stored === currentPassword;
    if (!ok) return res.status(401).json({ error: 'Mật khẩu hiện tại không đúng' });
    const hash = await bcrypt.hash(newPassword, 10);
    const sets = [`\`${meta.passwordCol}\` = ?`];
    const vals = [hash];
    if (meta.updatedCol) { sets.push(`\`${meta.updatedCol}\` = NOW(3)`); }
    vals.push(req.user.id);
    await query(
      `UPDATE \`${meta.tableName}\` SET ${sets.join(', ')} WHERE \`${meta.idCol}\` = ?`,
      vals,
    );
    return res.json({ success: true });
  } catch (err) {
    console.error('PUT /api/users/me/password error:', err.message);
    return res.status(500).json({ error: 'Không thể đổi mật khẩu', message: err.message });
  }
});

router.delete('/users/:id', requireAdmin, async (req, res) => {
  try {
    const meta = await getUserMeta();
    if (!meta?.idCol) return res.status(503).json({ error: 'Không tìm thấy bảng người dùng' });
    if (String(req.params.id) === String(req.user.id)) {
      return res.status(400).json({ error: 'Không thể xóa chính mình' });
    }
    await query(
      `DELETE FROM \`${meta.tableName}\` WHERE \`${meta.idCol}\` = ?`,
      [req.params.id],
    );
    return res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/users/:id error:', err.message);
    return res.status(500).json({ error: 'Không thể xóa người dùng', message: err.message });
  }
});

export default router;
