import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import pool from './db.js';
import { createApp } from './app.js';
import { DEFAULT_JWT_SECRET, getJwtSecret } from './utils/jwtSecret.js';
import { buildDongTienUpdatePayload } from './routes/dong-tien-moi.js';
import { buildPhieuGiaoHangUpdatePayload } from './routes/phieu-giao-hang.js';
import { selectReusableContractFolder } from './utils/hopDongDrive.js';

after(async () => {
  await pool.end();
});

async function withServer(fn) {
  const app = createApp({ isProduction: false });
  const server = await new Promise((resolve) => {
    const running = app.listen(0, () => resolve(running));
  });
  const { port } = server.address();
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

test('private API routes require auth and tables require admin', async () => {
  await withServer(async (baseUrl) => {
    const unauthenticatedBaoGia = await fetch(`${baseUrl}/api/bao-gia`);
    assert.equal(unauthenticatedBaoGia.status, 401);

    const unauthenticatedTables = await fetch(`${baseUrl}/api/tables`);
    assert.equal(unauthenticatedTables.status, 401);

    const staffToken = jwt.sign(
      { id: 1, email: 'staff@example.com', role: 'staff' },
      DEFAULT_JWT_SECRET,
    );
    const staffTables = await fetch(`${baseUrl}/api/tables`, {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert.equal(staffTables.status, 403);

    const googleCallback = await fetch(`${baseUrl}/api/google-drive/callback`, {
      redirect: 'manual',
    });
    assert.equal(googleCallback.status, 302);
    assert.match(googleCallback.headers.get('location') || '', /drive_error=invalid_state/);
  });
});

test('production rejects the default JWT secret', () => {
  const oldNodeEnv = process.env.NODE_ENV;
  const oldJwtSecret = process.env.JWT_SECRET;
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;
    assert.throws(() => getJwtSecret(), /JWT_SECRET must be set/);

    process.env.JWT_SECRET = 'not-the-default-secret';
    assert.equal(getJwtSecret(), 'not-the-default-secret');
  } finally {
    if (oldNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = oldNodeEnv;

    if (oldJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = oldJwtSecret;
  }
});

test('cashflow updates preserve omitted reconciliation fields and existing time', () => {
  const existing = {
    ngay_giao_dich: '2026-09-01 13:45:30',
    loai_giao_dich: 'chuyen_khoan_noi_bo',
    chieu_tien: 'thu',
    tai_khoan_tien_id: 1,
    tai_khoan_nhan_id: 2,
    so_tien: 100000,
    doi_tuong_id: 7,
    khach_hang_id: 8,
    nha_cung_cap_id: null,
    hop_dong_id: 9,
    hop_dong_mua_id: null,
    hang_muc_thu_chi_id: 10,
    mo_ta_giao_dich: 'Imported bank row',
    so_tai_khoan_doi_ung: '123456',
    ten_tai_khoan_doi_ung: 'Counterparty',
    so_du_sau_giao_dich: 5000000,
    ma_giao_dich_ngan_hang: 'BNK123',
    ghi_chu: 'bank note',
    trang_thai: 'hoan_thanh',
  };

  const payload = buildDongTienUpdatePayload(existing, {
    ngay_giao_dich: '2026-09-01',
    hang_muc_thu_chi_id: 11,
  });

  assert.equal(payload.ngay_giao_dich, '2026-09-01 13:45:30');
  assert.equal(payload.chieu_tien, 'thu');
  assert.equal(payload.tai_khoan_nhan_id, 2);
  assert.equal(payload.doi_tuong_id, 7);
  assert.equal(payload.so_du_sau_giao_dich, 5000000);
  assert.equal(payload.ma_giao_dich_ngan_hang, 'BNK123');
  assert.equal(payload.hang_muc_thu_chi_id, 11);

  const cleared = buildDongTienUpdatePayload(existing, { ma_giao_dich_ngan_hang: null });
  assert.equal(cleared.ma_giao_dich_ngan_hang, null);
});

test('delivery note sparse updates preserve numbering, creator, and debt value', () => {
  const existing = {
    so_phieu: '01/GH/2026',
    ngay_giao: '2026-09-01',
    khach_hang_id: 3,
    hop_dong_id: 4,
    gia_tri_ghi_no: 1234567,
    noi_dung: 'old',
    nguoi_tao: 'Nguyen Van A',
  };

  const payload = buildPhieuGiaoHangUpdatePayload(existing, { noi_dung: 'new' }, {
    khachHangId: existing.khach_hang_id,
    giaTriGhiNo: existing.gia_tri_ghi_no,
  });

  assert.equal(payload.so_phieu, '01/GH/2026');
  assert.equal(payload.nguoi_tao, 'Nguyen Van A');
  assert.equal(payload.gia_tri_ghi_no, 1234567);
  assert.equal(payload.noi_dung, 'new');
});

test('contract Drive folder reuse only accepts the exact intended folder name', () => {
  const siblings = [
    { id: 'wrong-project', name: '03 Khach A - Old project' },
    { id: 'right-project', name: '03 Khach A - New project' },
  ];

  assert.equal(
    selectReusableContractFolder(siblings, '03 Khach A - New project')?.id,
    'right-project',
  );
  assert.equal(selectReusableContractFolder(siblings, '03 Khach A - Other project'), undefined);
});
