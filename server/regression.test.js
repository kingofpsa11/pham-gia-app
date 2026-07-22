import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import pool from './db.js';
import { createApp } from './index.js';
import { mergeDongTienUpdate } from './routes/dong-tien-moi.js';
import { mergePhieuGiaoHangUpdate } from './routes/phieu-giao-hang.js';

after(async () => {
  await pool.end();
});

function listen(app) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1');
    server.once('listening', () => resolve(server));
    server.once('error', reject);
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

test('protected API routes require a token while login and OAuth callback stay public', async (t) => {
  const server = await listen(createApp());
  t.after(() => close(server));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  const protectedRes = await fetch(`${base}/api/khach-hang`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ten_cong_ty: 'ACME' }),
  });
  assert.equal(protectedRes.status, 401);

  const tablesRes = await fetch(`${base}/api/tables`);
  assert.equal(tablesRes.status, 401);

  const loginRes = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(loginRes.status, 400);

  const callbackRes = await fetch(`${base}/api/google-drive/callback`, { redirect: 'manual' });
  assert.equal(callbackRes.status, 302);
  assert.match(callbackRes.headers.get('location') || '', /drive_error=invalid_state/);
});

test('delivery note updates preserve omitted generated fields', () => {
  const existing = {
    so_phieu: 'PGH-001',
    ngay_giao: '2026-07-20',
    khach_hang_id: 10,
    hop_dong_id: 20,
    gia_tri_ghi_no: 1250000,
    noi_dung: 'Original',
    nguoi_tao: 'Admin',
  };

  const merged = mergePhieuGiaoHangUpdate(existing, {
    ngay_giao: '2026-07-21',
    noi_dung: null,
  });

  assert.equal(merged.so_phieu, 'PGH-001');
  assert.equal(merged.nguoi_tao, 'Admin');
  assert.equal(merged.gia_tri_ghi_no, 1250000);
  assert.equal(merged.ngay_giao, '2026-07-21');
  assert.equal(merged.noi_dung, null);
});

test('cashflow updates preserve omitted bank and balance metadata', () => {
  const existing = {
    ngay_giao_dich: '2026-07-20 09:00:00',
    loai_giao_dich: 'chuyen_khoan_noi_bo',
    chieu_tien: 'thu',
    tai_khoan_tien_id: 1,
    tai_khoan_nhan_id: 2,
    so_tien: 500000,
    doi_tuong_id: 7,
    khach_hang_id: 8,
    nha_cung_cap_id: null,
    hop_dong_id: 9,
    hop_dong_mua_id: null,
    hang_muc_thu_chi_id: 3,
    mo_ta_giao_dich: 'Bank import',
    so_tai_khoan_doi_ung: '0123',
    ten_tai_khoan_doi_ung: 'Counterparty',
    so_du_sau_giao_dich: 123456789,
    ma_giao_dich_ngan_hang: 'BANK-ABC-123',
    ghi_chu: 'Original note',
    trang_thai: 'hoan_thanh',
  };

  const merged = mergeDongTienUpdate(existing, {
    hang_muc_thu_chi_id: 4,
    ghi_chu: null,
  });

  assert.equal(merged.chieu_tien, 'thu');
  assert.equal(merged.doi_tuong_id, 7);
  assert.equal(merged.so_du_sau_giao_dich, 123456789);
  assert.equal(merged.ma_giao_dich_ngan_hang, 'BANK-ABC-123');
  assert.equal(merged.hang_muc_thu_chi_id, 4);
  assert.equal(merged.ghi_chu, null);
});
