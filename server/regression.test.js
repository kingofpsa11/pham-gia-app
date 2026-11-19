import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { DEFAULT_JWT_SECRET, getJwtSecret } from './utils/jwtSecret.js';
import { mergeDongTienUpdate } from './routes/dong-tien-moi.js';
import { mergePhieuGiaoHangUpdate } from './routes/phieu-giao-hang.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('JWT default secret is refused in production', () => {
  assert.equal(getJwtSecret({ env: { NODE_ENV: 'development' } }), DEFAULT_JWT_SECRET);
  assert.equal(
    getJwtSecret({ env: { NODE_ENV: 'production', JWT_SECRET: 'production-secret' } }),
    'production-secret',
  );
  assert.throws(
    () => getJwtSecret({ env: { NODE_ENV: 'production' } }),
    /JWT_SECRET must be set/,
  );
  assert.throws(
    () => getJwtSecret({ env: { NODE_ENV: 'production', JWT_SECRET: DEFAULT_JWT_SECRET } }),
    /JWT_SECRET must be set/,
  );
});

test('server mounts the API auth gate after public auth and OAuth callback routes', () => {
  const source = readFileSync(path.join(__dirname, 'index.js'), 'utf8');
  const authRouter = source.indexOf("app.use('/api/auth', authRouter)");
  const googleDriveRouter = source.indexOf("app.use('/api', googleDriveRouter)");
  const authGate = source.indexOf("app.use('/api', requireAuth)");
  const firstProtectedRouter = source.indexOf("app.use('/api', dashboardRouter)");

  assert.ok(source.includes("app.get('/api/tables', requireAdmin"), '/api/tables must be admin-only');
  assert.ok(authRouter >= 0, 'auth router should be public');
  assert.ok(googleDriveRouter >= 0, 'Google OAuth callback router should be public');
  assert.ok(authGate >= 0, 'global /api auth gate is required');
  assert.ok(authRouter < authGate, 'login must remain before the auth gate');
  assert.ok(googleDriveRouter < authGate, 'OAuth callback must remain before the auth gate');
  assert.ok(authGate < firstProtectedRouter, 'protected routers must be mounted after the auth gate');
});

test('cashflow sparse updates preserve omitted persisted fields', () => {
  const existing = {
    ngay_giao_dich: '2026-11-19 08:15:30',
    loai_giao_dich: 'thu',
    chieu_tien: 'thu',
    tai_khoan_tien_id: 7,
    tai_khoan_nhan_id: 8,
    so_tien: 1000,
    doi_tuong_id: 9,
    khach_hang_id: 10,
    nha_cung_cap_id: 11,
    hop_dong_id: 12,
    hop_dong_mua_id: 13,
    hang_muc_thu_chi_id: 14,
    mo_ta_giao_dich: 'old description',
    so_tai_khoan_doi_ung: '123456',
    ten_tai_khoan_doi_ung: 'Partner',
    so_du_sau_giao_dich: 5000,
    ma_giao_dich_ngan_hang: 'BANK-REF',
    ghi_chu: 'old note',
    trang_thai: 'nhap',
  };

  const merged = mergeDongTienUpdate(existing, { so_tien: 2000, ghi_chu: '' });

  assert.equal(merged.so_tien, 2000);
  assert.equal(merged.ghi_chu, null);
  assert.equal(merged.ngay_giao_dich, existing.ngay_giao_dich);
  assert.equal(merged.so_du_sau_giao_dich, existing.so_du_sau_giao_dich);
  assert.equal(merged.ma_giao_dich_ngan_hang, existing.ma_giao_dich_ngan_hang);
  assert.equal(merged.doi_tuong_id, existing.doi_tuong_id);
  assert.equal(merged.chieu_tien, existing.chieu_tien);
});

test('delivery-note sparse updates preserve omitted header and debt fields', () => {
  const existing = {
    so_phieu: 'PGH-001',
    ngay_giao: '2026-11-18',
    khach_hang_id: 3,
    hop_dong_id: 4,
    gia_tri_ghi_no: 123456,
    noi_dung: 'existing content',
    nguoi_tao: 'Nguyen Van A',
  };

  const merged = mergePhieuGiaoHangUpdate(existing, { noi_dung: 'changed' }, {
    khachHangId: existing.khach_hang_id,
    giaTriGhiNo: existing.gia_tri_ghi_no,
  });

  assert.equal(merged.noi_dung, 'changed');
  assert.equal(merged.so_phieu, existing.so_phieu);
  assert.equal(merged.ngay_giao, existing.ngay_giao);
  assert.equal(merged.nguoi_tao, existing.nguoi_tao);
  assert.equal(merged.gia_tri_ghi_no, existing.gia_tri_ghi_no);
});

test('contract Drive folder reuse no longer matches unrelated folders by STT prefix only', () => {
  const source = readFileSync(path.join(__dirname, 'utils', 'hopDongDrive.js'), 'utf8');
  assert.ok(
    source.includes('const exact = (siblings || []).find((f) => f.name === wantedName);'),
    'Drive reuse should require an exact folder name match',
  );
  assert.ok(!source.includes('findFolderByStt'), 'STT-only folder reuse must not be present');
  assert.ok(!source.includes('existingByStt'), 'STT-only folder reuse must not be present');
});
