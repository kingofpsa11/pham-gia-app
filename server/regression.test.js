import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPhieuGiaoHangUpdateParams } from './routes/phieu-giao-hang.js';
import {
  buildDongTienBulkUpdateParams,
  buildDongTienUpdateParams,
} from './routes/dong-tien-moi.js';
import { getJwtSecret } from './utils/jwtSecret.js';

let server;
let baseUrl;
let pool;

before(async () => {
  process.env.NODE_ENV = 'test';
  const { app } = await import('./index.js');
  ({ default: pool } = await import('./db.js'));
  server = await new Promise((resolve) => {
    const listener = app.listen(0, () => resolve(listener));
  });
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
  if (pool) await pool.end();
});

function api(path, options = {}) {
  return fetch(`${baseUrl}${path}`, options);
}

test('global API auth protects data routes but leaves login and OAuth callback public', async () => {
  const protectedRequests = [
    ['/api/dashboard-stats'],
    ['/api/khach-hang'],
    ['/api/tables'],
    [
      '/api/xuat-bao-gia-excel',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bao_gia_id: 1, mau_key: 'default' }),
      },
    ],
  ];

  for (const [path, options] of protectedRequests) {
    const res = await api(path, options);
    assert.equal(res.status, 401, `${path} should require authentication`);
  }

  const login = await api('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(login.status, 400);

  const callback = await api('/api/google-drive/callback', { redirect: 'manual' });
  assert.equal(callback.status, 302);
  assert.match(callback.headers.get('location') || '', /drive_error=invalid_state/);
});

test('production refuses to sign or verify JWTs with the checked-in default secret', () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousJwtSecret = process.env.JWT_SECRET;
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;

    assert.throws(
      () => getJwtSecret(),
      /JWT_SECRET must be set to a non-default value in production/,
    );
  } finally {
    process.env.NODE_ENV = previousNodeEnv;
    if (previousJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousJwtSecret;
  }
});

test('delivery note updates preserve omitted persisted fields', () => {
  const existing = {
    so_phieu: 'PGH-001',
    ngay_giao: '2026-07-01',
    khach_hang_id: 7,
    hop_dong_id: 9,
    gia_tri_ghi_no: 123456,
    noi_dung: 'old note',
    nguoi_tao: 'Alice',
  };
  const body = {
    ngay_giao: '2026-07-02',
    khach_hang_id: 7,
    hop_dong_id: 9,
    noi_dung: 'updated note',
  };

  const params = buildPhieuGiaoHangUpdateParams(existing, body, {
    khachHangId: 7,
    hopDongId: 9,
    giaTriGhiNo: existing.gia_tri_ghi_no,
    id: 44,
  });

  assert.deepEqual(params, [
    'PGH-001',
    '2026-07-02',
    7,
    9,
    123456,
    'updated note',
    'Alice',
    44,
  ]);
});

test('single cashflow updates preserve omitted accounting fields', () => {
  const existing = {
    ngay_giao_dich: '2026-07-01 08:30:00',
    loai_giao_dich: 'chuyen_khoan_noi_bo',
    chieu_tien: 'chi',
    tai_khoan_tien_id: 3,
    tai_khoan_nhan_id: 4,
    so_tien: 500000,
    doi_tuong_id: 12,
    khach_hang_id: 2,
    nha_cung_cap_id: null,
    hop_dong_id: 8,
    hop_dong_mua_id: null,
    hang_muc_thu_chi_id: 6,
    mo_ta_giao_dich: 'old description',
    so_tai_khoan_doi_ung: '123',
    ten_tai_khoan_doi_ung: 'Counterparty',
    so_du_sau_giao_dich: 9000000,
    ma_giao_dich_ngan_hang: 'BANK-999',
    ghi_chu: 'old note',
    trang_thai: 'hoan_thanh',
  };
  const body = {
    ngay_giao_dich: '2026-07-02',
    loai_giao_dich: 'chuyen_khoan_noi_bo',
    tai_khoan_tien_id: 3,
    so_tien: 600000,
    ghi_chu: 'edited note',
  };

  const params = buildDongTienUpdateParams(existing, body, 77);

  assert.equal(params[3], 'chi');
  assert.equal(params[7], 12);
  assert.equal(params[16], 9000000);
  assert.equal(params[17], 'BANK-999');
  assert.equal(params[18], 'edited note');
  assert.equal(params[20], 77);
});

test('bulk cashflow updates preserve omitted accounting fields on existing rows', () => {
  const existing = {
    ngay_giao_dich: '2026-07-01 08:30:00',
    loai_giao_dich: 'chuyen_khoan_noi_bo',
    chieu_tien: 'thu',
    tai_khoan_tien_id: 5,
    tai_khoan_nhan_id: 9,
    so_tien: 700000,
    khach_hang_id: 3,
    nha_cung_cap_id: null,
    hop_dong_id: 11,
    hop_dong_mua_id: null,
    hang_muc_thu_chi_id: 6,
    mo_ta_giao_dich: 'bulk old',
    so_tai_khoan_doi_ung: '456',
    ten_tai_khoan_doi_ung: 'Bulk counterparty',
    so_du_sau_giao_dich: 12000000,
    ma_giao_dich_ngan_hang: 'BANK-BULK',
    ghi_chu: 'bulk old note',
    trang_thai: 'hoan_thanh',
  };
  const item = {
    id: 88,
    ngay_giao_dich: '2026-07-03',
    loai_giao_dich: 'chuyen_khoan_noi_bo',
    tai_khoan_tien_id: 5,
    so_tien: 800000,
  };

  const params = buildDongTienBulkUpdateParams(existing, item);

  assert.equal(params[3], 'thu');
  assert.equal(params[15], 12000000);
  assert.equal(params[16], 'BANK-BULK');
  assert.equal(params[19], 88);
});
