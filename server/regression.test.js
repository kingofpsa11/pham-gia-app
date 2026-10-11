import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';

const { default: app } = await import('./index.js');
const { getJwtSecret } = await import('./utils/jwtSecret.js');
const { mergeDongTienPayload } = await import('./routes/dong-tien-moi.js');
const { mergePhieuGiaoHangUpdate } = await import('./routes/phieu-giao-hang.js');

async function withServer(fn) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

test('global API auth blocks protected routes before they hit the database', async () => {
  await withServer(async (baseUrl) => {
    const quoteList = await fetch(`${baseUrl}/api/bao-gia`);
    assert.equal(quoteList.status, 401);

    const tables = await fetch(`${baseUrl}/api/tables`);
    assert.equal(tables.status, 401);

    const exportExcel = await fetch(`${baseUrl}/api/xuat-bao-gia-excel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bao_gia_id: 1, mau_key: 'default' }),
    });
    assert.equal(exportExcel.status, 401);
  });
});

test('public login and Google OAuth callback remain reachable without Bearer auth', async () => {
  await withServer(async (baseUrl) => {
    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(login.status, 400);

    const callback = await fetch(`${baseUrl}/api/google/callback`, { redirect: 'manual' });
    assert.equal(callback.status, 302);
    assert.match(callback.headers.get('location') || '', /drive_error=invalid_state/);
  });
});

test('production refuses to use the built-in JWT secret', () => {
  const oldEnv = process.env.NODE_ENV;
  const oldSecret = process.env.JWT_SECRET;
  process.env.NODE_ENV = 'production';
  delete process.env.JWT_SECRET;
  assert.throws(() => getJwtSecret(), /JWT_SECRET must be set in production/);
  process.env.NODE_ENV = oldEnv;
  process.env.JWT_SECRET = oldSecret;
});

test('cashflow patch updates preserve omitted persisted fields', () => {
  const merged = mergeDongTienPayload(
    {
      ngay_giao_dich: '2026-10-05',
      so_tien: 2000000,
      ghi_chu: 'updated',
    },
    {
      ngay_giao_dich: '2026-10-05 14:30:45',
      ngay_hach_toan: '2026-10-05',
      loai_giao_dich: 'chuyen_khoan_noi_bo',
      chieu_tien: 'chi',
      tai_khoan_tien_id: 7,
      tai_khoan_nhan_id: 8,
      so_tien: 1000000,
      doi_tuong_id: 9,
      khach_hang_id: 10,
      nha_cung_cap_id: 11,
      hop_dong_id: 12,
      hop_dong_mua_id: 13,
      hang_muc_thu_chi_id: 14,
      mo_ta_giao_dich: 'old memo',
      so_tai_khoan_doi_ung: '012345',
      ten_tai_khoan_doi_ung: 'Counterparty',
      so_du_sau_giao_dich: 123456789,
      ma_giao_dich_ngan_hang: 'BANK-REF',
      ghi_chu: 'old',
      trang_thai: 'hoan_thanh',
    },
  );

  assert.equal(merged.ngay_giao_dich, '2026-10-05 14:30:45');
  assert.equal(merged.chieu_tien, 'chi');
  assert.equal(merged.tai_khoan_tien_id, 7);
  assert.equal(merged.tai_khoan_nhan_id, 8);
  assert.equal(merged.doi_tuong_id, 9);
  assert.equal(merged.so_du_sau_giao_dich, 123456789);
  assert.equal(merged.ma_giao_dich_ngan_hang, 'BANK-REF');
  assert.equal(merged.so_tien, 2000000);
  assert.equal(merged.ghi_chu, 'updated');
});

test('delivery-note patch updates preserve omitted document fields and debt value', async () => {
  const merged = await mergePhieuGiaoHangUpdate(
    {
      ngay_giao: '2026-10-11',
      noi_dung: 'updated',
    },
    {
      so_phieu: 'GH001',
      ngay_giao: '2026-10-10',
      khach_hang_id: 5,
      hop_dong_id: 6,
      gia_tri_ghi_no: 987654321,
      noi_dung: 'old',
      nguoi_tao: 'Nguyen Van A',
    },
  );

  assert.equal(merged.so_phieu, 'GH001');
  assert.equal(merged.ngay_giao, '2026-10-11');
  assert.equal(merged.khach_hang_id, 5);
  assert.equal(merged.hop_dong_id, 6);
  assert.equal(merged.gia_tri_ghi_no, 987654321);
  assert.equal(merged.noi_dung, 'updated');
  assert.equal(merged.nguoi_tao, 'Nguyen Van A');
});
