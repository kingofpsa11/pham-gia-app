import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3307,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  connectTimeout: 10000,
  /** DATETIME trả về chuỗi yyyy-mm-dd HH:mm:ss — không chuyển qua Date/UTC. */
  dateStrings: true,
});

let queryImpl = async (sql, params = []) => {
  const [rows] = await pool.query(sql, params);
  return rows;
};

export async function query(sql, params = []) {
  return queryImpl(sql, params);
}

export async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] ?? null;
}

export async function pingDatabase() {
  await query('SELECT 1 AS ok');
}

export function setQueryImplementationForTest(fn) {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('setQueryImplementationForTest is only available in tests');
  }
  queryImpl = fn;
}

export function resetQueryImplementationForTest() {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('resetQueryImplementationForTest is only available in tests');
  }
  queryImpl = async (sql, params = []) => {
    const [rows] = await pool.query(sql, params);
    return rows;
  };
}

export default pool;
