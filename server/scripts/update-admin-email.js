/**
 * Đổi tên đăng nhập admin (giữ nguyên mật khẩu).
 * Usage: node server/scripts/update-admin-email.js [ten_cu] [ten_moi]
 * Mặc định: Admin → phamgia.co.info@gmail.com
 */
import dotenv from 'dotenv';
import { query } from '../db.js';

dotenv.config();

import { findUserTable, getUserColumns, pickColumn } from '../utils/userTable.js';

const oldLogin = process.argv[2] || 'Admin';
const newLogin = process.argv[3] || 'phamgia.co.info@gmail.com';

const tableName = await findUserTable();
if (!tableName) {
  console.error('Không tìm thấy bảng Admin / users / nguoi_dung / tai_khoan_he_thong');
  process.exit(1);
}

const columns = await getUserColumns(tableName);
const loginCol = pickColumn(columns, ['email', 'username', 'ten_dang_nhap']);
const roleCol = pickColumn(columns, ['role', 'vai_tro']);
const nameCol = pickColumn(columns, ['ten', 'ho_ten', 'full_name', 'name']);
const idCol = pickColumn(columns, ['id', 'user_id']);

if (!loginCol || !idCol) {
  console.error(`Bảng ${tableName} thiếu cột đăng nhập hoặc id`);
  process.exit(1);
}

const existingNew = await query(
  `SELECT \`${idCol}\` AS id FROM \`${tableName}\` WHERE \`${loginCol}\` = ? LIMIT 1`,
  [newLogin],
);
if (existingNew.length > 0) {
  console.log(`Tài khoản ${newLogin} đã tồn tại (id=${existingNew[0].id}). Không cần đổi.`);
  process.exit(0);
}

async function findAdmin() {
  const byLogin = await query(
    `SELECT \`${idCol}\` AS id, \`${loginCol}\` AS login
     FROM \`${tableName}\` WHERE \`${loginCol}\` = ? LIMIT 1`,
    [oldLogin],
  );
  if (byLogin[0]) return byLogin[0];

  if (nameCol) {
    const byName = await query(
      `SELECT \`${idCol}\` AS id, \`${loginCol}\` AS login
       FROM \`${tableName}\` WHERE \`${nameCol}\` = ? LIMIT 1`,
      [oldLogin],
    );
    if (byName[0]) return byName[0];
  }

  if (roleCol) {
    const byRole = await query(
      `SELECT \`${idCol}\` AS id, \`${loginCol}\` AS login
       FROM \`${tableName}\` WHERE \`${roleCol}\` = 'admin' ORDER BY \`${idCol}\` ASC LIMIT 1`,
    );
    if (byRole[0]) return byRole[0];
  }

  return null;
}

const target = await findAdmin();

if (!target) {
  console.error(`Không tìm thấy tài khoản admin (tên cũ: ${oldLogin})`);
  process.exit(1);
}

const sets = [`\`${loginCol}\` = ?`];
const params = [newLogin];
const updatedCol = pickColumn(columns, ['updatedAt', 'updated_at']);
if (updatedCol) {
  sets.push(`\`${updatedCol}\` = NOW(3)`);
}
params.push(target.id);

await query(
  `UPDATE \`${tableName}\` SET ${sets.join(', ')} WHERE \`${idCol}\` = ?`,
  params,
);

console.log(`Đã đổi tên đăng nhập admin (id=${target.id}): ${target.login} → ${newLogin}`);
console.log('Mật khẩu giữ nguyên.');

process.exit(0);
