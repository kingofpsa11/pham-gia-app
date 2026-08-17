/**
 * Đặt lại mật khẩu admin (bcrypt).
 * Usage: node server/scripts/reset-admin-password.js <email> <mat_khau_moi>
 * Ví dụ: node server/scripts/reset-admin-password.js phamgia.co.info@gmail.com 'MatKhauMoi'
 */
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';

dotenv.config();

import { findUserTable, getUserColumns, pickColumn } from '../utils/userTable.js';

const email = process.argv[2];
const newPassword = process.argv[3];

if (!email || !newPassword) {
  console.error('Usage: node server/scripts/reset-admin-password.js <email> <mat_khau_moi>');
  process.exit(1);
}

const tableName = await findUserTable();
if (!tableName) {
  console.error('Không tìm thấy bảng Admin / users / nguoi_dung / tai_khoan_he_thong');
  process.exit(1);
}

const columns = await getUserColumns(tableName);
const emailCol = pickColumn(columns, ['email', 'username', 'ten_dang_nhap']);
const passwordCol = pickColumn(columns, ['password_hash', 'mat_khau_hash', 'password', 'mat_khau']);
const idCol = pickColumn(columns, ['id', 'user_id']);
const roleCol = pickColumn(columns, ['role', 'vai_tro']);

if (!emailCol || !passwordCol || !idCol) {
  console.error(`Bảng ${tableName} thiếu cột cần thiết`);
  process.exit(1);
}

let users = await query(
  `SELECT \`${idCol}\` AS id, \`${emailCol}\` AS login FROM \`${tableName}\` WHERE \`${emailCol}\` = ? LIMIT 1`,
  [email],
);

if (!users[0] && roleCol) {
  users = await query(
    `SELECT \`${idCol}\` AS id, \`${emailCol}\` AS login FROM \`${tableName}\` WHERE \`${roleCol}\` = 'admin' ORDER BY \`${idCol}\` ASC LIMIT 1`,
  );
}

if (!users[0]) {
  console.error(`Không tìm thấy tài khoản với email "${email}" (và không có admin nào khác)`);
  process.exit(1);
}

const target = users[0];
const hash = await bcrypt.hash(newPassword, 10);
const sets = [`\`${passwordCol}\` = ?`, `\`${emailCol}\` = ?`];
const params = [hash, email];
const updatedCol = pickColumn(columns, ['updatedAt', 'updated_at']);
if (updatedCol) {
  sets.push(`\`${updatedCol}\` = NOW(3)`);
}
params.push(target.id);

await query(
  `UPDATE \`${tableName}\` SET ${sets.join(', ')} WHERE \`${idCol}\` = ?`,
  params,
);

console.log(`Đã cập nhật mật khẩu (bcrypt) cho tài khoản id=${target.id}`);
console.log(`Email đăng nhập: ${email}`);
if (target.login !== email) {
  console.log(`(Trước đó: ${target.login})`);
}

process.exit(0);
