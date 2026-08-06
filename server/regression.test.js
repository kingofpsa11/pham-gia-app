import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import jwt from 'jsonwebtoken';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'regression-test-secret';

const [{ default: app }, { mergeDongTienUpdate }, { mergePhieuGiaoHangUpdate }, { getJwtSecret }] =
  await Promise.all([
    import('./index.js'),
    import('./routes/dong-tien-moi.js'),
    import('./routes/phieu-giao-hang.js'),
    import('./utils/jwtSecret.js'),
  ]);

async function request(path, options = {}) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, options);
    return {
      status: response.status,
      headers: response.headers,
      body: await response.text(),
    };
  } finally {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

function bearerToken(payload) {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '1h' });
}

test('protected API routes reject anonymous requests before handlers run', async () => {
  const khachHang = await request('/api/khach-hang');
  assert.equal(khachHang.status, 401);

  const tables = await request('/api/tables');
  assert.equal(tables.status, 401);

  const excel = await request('/api/xuat-bao-gia-excel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bao_gia_id: 1, mau_key: 'mau_bao_gia_hapulico' }),
  });
  assert.equal(excel.status, 401);
});

test('/api/tables requires an admin token', async () => {
  const token = bearerToken({ id: 7, email: 'staff@example.com', role: 'staff' });
  const response = await request('/api/tables', {
    headers: { Authorization: `Bearer ${token}` },
  });

  assert.equal(response.status, 403);
});

test('Google Drive OAuth callback remains public', async () => {
  const response = await request('/api/google-drive/callback?state=bad');

  assert.equal(response.status, 302);
  assert.match(response.headers.get('location') || '', /drive_error=invalid_state/);
});

test('delivery-note updates preserve omitted persisted fields', async () => {
  const existing = {
    so_phieu: 'PGH-001',
    ngay_giao: '2026-08-01',
    khach_hang_id: 10,
    hop_dong_id: 20,
    gia_tri_ghi_no: 500000,
    noi_dung: 'old',
    nguoi_tao: 'admin',
  };

  const merged = await mergePhieuGiaoHangUpdate(existing, {
    ngay_giao: '2026-08-06',
    noi_dung: 'updated',
  });

  assert.equal(merged.so_phieu, 'PGH-001');
  assert.equal(merged.nguoi_tao, 'admin');
  assert.equal(merged.gia_tri_ghi_no, 500000);
  assert.equal(merged.hop_dong_id, 20);
  assert.equal(merged.khach_hang_id, 10);
  assert.equal(merged.ngay_giao, '2026-08-06');
  assert.equal(merged.noi_dung, 'updated');
});

test('cashflow updates preserve omitted bank metadata and balances', () => {
  const existing = {
    ngay_giao_dich: '2026-08-01 09:30:00',
    loai_giao_dich: 'chi',
    chieu_tien: 'out',
    tai_khoan_tien_id: 3,
    tai_khoan_nhan_id: 4,
    so_tien: 250000,
    doi_tuong_id: 9,
    khach_hang_id: 11,
    nha_cung_cap_id: 12,
    hop_dong_id: 13,
    hop_dong_mua_id: 14,
    hang_muc_thu_chi_id: 15,
    mo_ta_giao_dich: 'old description',
    so_tai_khoan_doi_ung: '123456',
    ten_tai_khoan_doi_ung: 'Counterparty',
    so_du_sau_giao_dich: 750000,
    ma_giao_dich_ngan_hang: 'BANK-REF-1',
    ghi_chu: 'old note',
    trang_thai: 'hoan_thanh',
  };

  const merged = mergeDongTienUpdate(existing, {
    mo_ta_giao_dich: 'updated description',
  });

  assert.equal(merged.ngay_giao_dich, '2026-08-01 09:30:00');
  assert.equal(merged.chieu_tien, 'out');
  assert.equal(merged.tai_khoan_nhan_id, 4);
  assert.equal(merged.so_tien, 250000);
  assert.equal(merged.doi_tuong_id, 9);
  assert.equal(merged.so_du_sau_giao_dich, 750000);
  assert.equal(merged.ma_giao_dich_ngan_hang, 'BANK-REF-1');
  assert.equal(merged.ghi_chu, 'old note');
  assert.equal(merged.mo_ta_giao_dich, 'updated description');
});
