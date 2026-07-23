import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { requireAdmin, requireAuth } from './middleware/auth.js';
import { DEFAULT_JWT_SECRET, getJwtSecret } from './utils/jwtSecret.js';
import { mergeDongTienUpdate } from './routes/dong-tien-moi.js';
import { mergePhieuGiaoHangUpdate } from './routes/phieu-giao-hang.js';

function withEnv(env, fn) {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    JWT_SECRET: process.env.JWT_SECRET,
  };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test('requireAuth rejects requests without a bearer token', () => {
  const req = { headers: {} };
  const res = mockRes();
  let nextCalled = false;

  requireAuth(req, res, () => {
    nextCalled = true;
  });

  assert.equal(res.statusCode, 401);
  assert.equal(nextCalled, false);
});

test('requireAuth accepts valid tokens and attaches the user payload', () => {
  withEnv({ NODE_ENV: 'test', JWT_SECRET: 'test-secret' }, () => {
    const token = jwt.sign({ id: 7, email: 'user@example.com', role: 'staff' }, getJwtSecret());
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    let nextCalled = false;

    requireAuth(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.deepEqual(req.user, { id: 7, email: 'user@example.com', role: 'staff' });
  });
});

test('requireAdmin rejects non-admin tokens', () => {
  withEnv({ NODE_ENV: 'test', JWT_SECRET: 'test-secret' }, () => {
    const token = jwt.sign({ id: 7, email: 'user@example.com', role: 'staff' }, getJwtSecret());
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    let nextCalled = false;

    requireAdmin(req, res, () => {
      nextCalled = true;
    });

    assert.equal(res.statusCode, 403);
    assert.equal(nextCalled, false);
  });
});

test('production rejects the built-in JWT secret', () => {
  withEnv({ NODE_ENV: 'production', JWT_SECRET: undefined }, () => {
    assert.equal(DEFAULT_JWT_SECRET, 'phamgia_jwt_secret_change_this_2026');
    assert.throws(() => getJwtSecret(), /JWT_SECRET must be configured/);
  });
});

test('delivery-note updates preserve omitted persisted fields', () => {
  const existing = {
    so_phieu: 'PGH-001',
    ngay_giao: '2026-07-20',
    khach_hang_id: 3,
    hop_dong_id: 8,
    gia_tri_ghi_no: 1250000,
    noi_dung: 'Giao dot 1',
    nguoi_tao: 'Lan',
  };
  const body = {
    ngay_giao: '2026-07-22',
    khach_hang_id: 3,
    hop_dong_id: 8,
  };

  const update = mergePhieuGiaoHangUpdate(
    existing,
    body,
    body.khach_hang_id,
    body.hop_dong_id,
    existing.gia_tri_ghi_no,
  );

  assert.equal(update.so_phieu, 'PGH-001');
  assert.equal(update.nguoi_tao, 'Lan');
  assert.equal(update.gia_tri_ghi_no, 1250000);
  assert.equal(update.ngay_giao, '2026-07-22');
});

test('cashflow updates preserve bank metadata and balance when omitted', () => {
  const existing = {
    ngay_giao_dich: '2026-07-20 09:30:00',
    ngay_hach_toan: '2026-07-20',
    loai_giao_dich: 'chuyen_khoan_noi_bo',
    chieu_tien: 'thu',
    tai_khoan_tien_id: 2,
    tai_khoan_nhan_id: 4,
    so_tien: 500000,
    doi_tuong_id: 99,
    khach_hang_id: 10,
    nha_cung_cap_id: null,
    hop_dong_id: 17,
    hop_dong_mua_id: null,
    hang_muc_thu_chi_id: 6,
    mo_ta_giao_dich: 'Thu tien',
    so_tai_khoan_doi_ung: '123456',
    ten_tai_khoan_doi_ung: 'Cong ty A',
    so_du_sau_giao_dich: 9200000,
    ma_giao_dich_ngan_hang: 'BANK-ABC-1',
    ghi_chu: 'Imported',
    trang_thai: 'hoan_thanh',
  };
  const body = {
    loai_giao_dich: 'thu',
    tai_khoan_tien_id: 2,
    so_tien: 600000,
    mo_ta_giao_dich: 'Thu tien cap nhat',
  };

  const update = mergeDongTienUpdate(
    existing,
    body,
    existing.ngay_giao_dich,
    existing.ngay_hach_toan,
  );

  assert.equal(update.so_tien, 600000);
  assert.equal(update.chieu_tien, 'thu');
  assert.equal(update.doi_tuong_id, 99);
  assert.equal(update.so_du_sau_giao_dich, 9200000);
  assert.equal(update.ma_giao_dich_ngan_hang, 'BANK-ABC-1');
});
