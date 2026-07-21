import test from 'node:test';
import assert from 'node:assert/strict';
import app from './index.js';
import pool from './db.js';
import { DEFAULT_JWT_SECRET, getJwtSecret } from './middleware/auth.js';
import { buildDongTienUpdateValues } from './routes/dong-tien-moi.js';
import { buildPhieuGiaoHangUpdateValues } from './routes/phieu-giao-hang.js';

function listen(appToStart) {
  return new Promise((resolve) => {
    const server = appToStart.listen(0, () => resolve(server));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

test('business API endpoints reject requests without a bearer token', async (t) => {
  const server = await listen(app);
  t.after(() => close(server));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  const customerResponse = await fetch(`${baseUrl}/api/khach-hang`);
  assert.equal(customerResponse.status, 401);

  const tablesResponse = await fetch(`${baseUrl}/api/tables`);
  assert.equal(tablesResponse.status, 401);

  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(loginResponse.status, 400);
});

test('production refuses to use the public default JWT secret', () => {
  const oldNodeEnv = process.env.NODE_ENV;
  const oldJwtSecret = process.env.JWT_SECRET;

  try {
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;
    assert.throws(() => getJwtSecret(), /JWT_SECRET/);

    process.env.JWT_SECRET = 'a-production-secret';
    assert.equal(getJwtSecret(), 'a-production-secret');
  } finally {
    if (oldNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = oldNodeEnv;

    if (oldJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = oldJwtSecret;
  }

  assert.equal(DEFAULT_JWT_SECRET, 'phamgia_jwt_secret_change_this_2026');
});

test('cashflow partial updates preserve omitted persisted fields', () => {
  const existing = {
    ngay_giao_dich: '2026-07-20 10:11:12',
    loai_giao_dich: 'chuyen_khoan_noi_bo',
    chieu_tien: 'chi',
    tai_khoan_tien_id: 1,
    tai_khoan_nhan_id: 2,
    so_tien: '1000.00',
    doi_tuong_id: 9,
    khach_hang_id: 3,
    nha_cung_cap_id: null,
    hop_dong_id: 4,
    hop_dong_mua_id: null,
    hang_muc_thu_chi_id: 5,
    mo_ta_giao_dich: 'old description',
    so_tai_khoan_doi_ung: '123456',
    ten_tai_khoan_doi_ung: 'Counterparty',
    so_du_sau_giao_dich: '5000.00',
    ma_giao_dich_ngan_hang: 'BANK-001',
    ghi_chu: 'old note',
    trang_thai: 'hoan_thanh',
  };

  const values = buildDongTienUpdateValues({ so_tien: 2000, ghi_chu: 'new note' }, existing);

  assert.equal(values[3], 'chi');
  assert.equal(values[7], 9);
  assert.equal(values[16], '5000.00');
  assert.equal(values[17], 'BANK-001');
  assert.equal(values[18], 'new note');
});

test('delivery note partial updates preserve omitted header and credit fields', () => {
  const existing = {
    so_phieu: 'PGH-2026-001',
    ngay_giao: '2026-07-20',
    khach_hang_id: 10,
    hop_dong_id: 20,
    gia_tri_ghi_no: '7500000.00',
    noi_dung: 'old content',
    nguoi_tao: 'Nguyen Van A',
  };

  const values = buildPhieuGiaoHangUpdateValues(
    { noi_dung: 'updated content' },
    existing,
    existing.khach_hang_id,
    existing.hop_dong_id,
    existing.gia_tri_ghi_no,
  );

  assert.equal(values[0], 'PGH-2026-001');
  assert.equal(values[4], '7500000.00');
  assert.equal(values[5], 'updated content');
  assert.equal(values[6], 'Nguyen Van A');
});

test.after(async () => {
  await pool.end();
});
