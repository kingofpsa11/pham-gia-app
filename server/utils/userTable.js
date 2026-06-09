import { query } from '../db.js';

const USER_TABLE_CANDIDATES = ['Admin', 'users', 'nguoi_dung', 'tai_khoan_he_thong'];

export async function findUserTable() {
  const rows = await query(
    `SELECT TABLE_NAME AS name
     FROM information_schema.tables
     WHERE table_schema = DATABASE()
       AND TABLE_NAME IN (?, ?, ?, ?)`,
    USER_TABLE_CANDIDATES,
  );
  const found = new Set(rows.map((r) => r.name));
  return USER_TABLE_CANDIDATES.find((name) => found.has(name)) ?? null;
}

export async function getUserColumns(tableName) {
  const rows = await query(
    `SELECT COLUMN_NAME AS name
     FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ?`,
    [tableName],
  );
  return new Set(rows.map((r) => r.name));
}

export function pickColumn(columns, candidates) {
  return candidates.find((name) => columns.has(name)) ?? null;
}
