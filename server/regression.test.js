import assert from 'node:assert/strict';
import http from 'node:http';
import { test } from 'node:test';
import jwt from 'jsonwebtoken';
import { FOLDER_MIME } from './utils/googleDrive.js';
import { DEFAULT_JWT_SECRET, getJwtSecret } from './utils/jwtSecret.js';
import { mergeDongTienUpdate } from './routes/dong-tien-moi.js';
import { mergePhieuGiaoHangUpdate } from './routes/phieu-giao-hang.js';
import { findDirectYearFolder } from './utils/hopDongDrive.js';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
const { default: app } = await import('./index.js');

function listen(appToTest) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(appToTest);
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function withServer(fn) {
  const server = await listen(app);
  try {
    const { port } = server.address();
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

test('private API routes reject unauthenticated requests while public auth/callback routes stay reachable', async () => {
  await withServer(async (baseUrl) => {
    let res = await fetch(`${baseUrl}/api/bao-gia`);
    assert.equal(res.status, 401);

    res = await fetch(`${baseUrl}/api/xuat-bao-gia-excel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bao_gia_id: 1, mau_key: 'Hapulico' }),
    });
    assert.equal(res.status, 401);

    const staffToken = jwt.sign({ id: 7, email: 'staff@example.com', role: 'staff' }, getJwtSecret());
    res = await fetch(`${baseUrl}/api/tables`, {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert.equal(res.status, 403);

    res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);

    res = await fetch(`${baseUrl}/api/google-drive/callback?state=invalid`, {
      redirect: 'manual',
    });
    assert.equal(res.status, 302);
    assert.match(res.headers.get('location') || '', /drive_error=invalid_state/);
  });
});

test('production refuses to use the bundled JWT fallback secret', () => {
  const oldNodeEnv = process.env.NODE_ENV;
  const oldJwtSecret = process.env.JWT_SECRET;
  process.env.NODE_ENV = 'production';
  delete process.env.JWT_SECRET;
  try {
    assert.equal(DEFAULT_JWT_SECRET, 'phamgia_jwt_secret_change_this_2026');
    assert.throws(() => getJwtSecret(), /JWT_SECRET must be configured/);
  } finally {
    process.env.NODE_ENV = oldNodeEnv;
    process.env.JWT_SECRET = oldJwtSecret;
  }
});

test('cashflow updates preserve omitted accounting metadata', () => {
  const existing = {
    ngay_giao_dich: '2026-09-15 08:30:00',
    ngay_hach_toan: '2026-09-15',
    loai_giao_dich: 'thu',
    chieu_tien: 'vao',
    tai_khoan_tien_id: 2,
    tai_khoan_nhan_id: 3,
    so_tien: 1000000,
    doi_tuong_id: 44,
    khach_hang_id: 55,
    nha_cung_cap_id: null,
    hop_dong_id: 66,
    hop_dong_mua_id: null,
    hang_muc_thu_chi_id: 77,
    mo_ta_giao_dich: 'old description',
    so_tai_khoan_doi_ung: '012345',
    ten_tai_khoan_doi_ung: 'Counterparty',
    so_du_sau_giao_dich: 5000000,
    ma_giao_dich_ngan_hang: 'BANK-123',
    ghi_chu: 'old note',
    trang_thai: 'hoan_thanh',
  };

  const merged = mergeDongTienUpdate(existing, {
    so_tien: 1200000,
    ghi_chu: '',
  });

  assert.equal(merged.so_tien, 1200000);
  assert.equal(merged.ghi_chu, null);
  assert.equal(merged.ngay_giao_dich, existing.ngay_giao_dich);
  assert.equal(merged.chieu_tien, existing.chieu_tien);
  assert.equal(merged.doi_tuong_id, existing.doi_tuong_id);
  assert.equal(merged.so_du_sau_giao_dich, existing.so_du_sau_giao_dich);
  assert.equal(merged.ma_giao_dich_ngan_hang, existing.ma_giao_dich_ngan_hang);
});

test('delivery-note updates preserve omitted document fields and debt value', () => {
  const existing = {
    so_phieu: 'GH-2026-001',
    ngay_giao: '2026-09-15',
    khach_hang_id: 5,
    hop_dong_id: 6,
    gia_tri_ghi_no: 2500000,
    noi_dung: 'old content',
    nguoi_tao: 'Nguyen Van A',
  };

  const merged = mergePhieuGiaoHangUpdate(existing, {
    noi_dung: 'new content',
  });

  assert.equal(merged.noi_dung, 'new content');
  assert.equal(merged.so_phieu, existing.so_phieu);
  assert.equal(merged.nguoi_tao, existing.nguoi_tao);
  assert.equal(merged.gia_tri_ghi_no, existing.gia_tri_ghi_no);

  const clearedDetails = mergePhieuGiaoHangUpdate(existing, { chi_tiet: [] }, { giaTriGhiNo: 0 });
  assert.equal(clearedDetails.gia_tri_ghi_no, 0);
});

test('contract Drive year lookup ignores same-named folders outside the company root', () => {
  const external = {
    id: 'outside-2026',
    name: '2026',
    mimeType: FOLDER_MIME,
    parents: ['personal-root'],
  };
  const direct = {
    id: 'company-2026',
    name: '2026',
    mimeType: FOLDER_MIME,
    parents: ['pham-gia-root'],
  };

  assert.equal(findDirectYearFolder([external], '2026', 'pham-gia-root'), undefined);
  assert.equal(findDirectYearFolder([external, direct], '2026', 'pham-gia-root')?.id, 'company-2026');
});
