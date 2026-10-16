import assert from 'node:assert/strict';
import test from 'node:test';
import jwt from 'jsonwebtoken';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';

const { app } = await import('./index.js');
const { mergeDongTienUpdate } = await import('./routes/dong-tien-moi.js');
const { deleteHopDongCascade } = await import('./routes/hop-dong.js');
const { mergePhieuGiaoHangUpdate } = await import('./routes/phieu-giao-hang.js');
const { normalizeChiTietInput } = await import('./utils/phuLucHopDong.js');

async function request(path, options = {}) {
  const server = app.listen(0);
  try {
    await new Promise((resolve) => server.once('listening', resolve));
    const { port } = server.address();
    return await fetch(`http://127.0.0.1:${port}${path}`, {
      redirect: 'manual',
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    });
  } finally {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

function token(role = 'staff') {
  return jwt.sign({ id: 'user-1', email: 'user@example.com', role }, process.env.JWT_SECRET);
}

test('global API auth blocks unauthenticated data routes before handlers run', async () => {
  assert.equal((await request('/api/bao-gia')).status, 401);
  assert.equal((await request('/api/bao-gia/123', { method: 'DELETE' })).status, 401);
  assert.equal((await request('/api/xuat-bao-gia-excel', {
    method: 'POST',
    body: JSON.stringify({ bao_gia_id: 1, mau_key: 'default' }),
  })).status, 401);
});

test('public auth and Google callback routes remain reachable', async () => {
  const login = await request('/api/auth/login', { method: 'POST', body: JSON.stringify({}) });
  assert.equal(login.status, 400);

  const callback = await request('/api/google/callback');
  assert.equal(callback.status, 302);
  assert.match(callback.headers.get('location') || '', /drive_error=invalid_state/);
});

test('/api/tables requires admin privileges', async () => {
  const unauthenticated = await request('/api/tables');
  assert.equal(unauthenticated.status, 401);

  const staff = await request('/api/tables', {
    headers: { Authorization: `Bearer ${token('staff')}` },
  });
  assert.equal(staff.status, 403);
});

test('cashflow updates preserve omitted imported-bank fields and transaction time', () => {
  const existing = {
    ngay_giao_dich: '2026-08-24 14:15:16',
    ngay_hach_toan: '2026-08-24',
    loai_giao_dich: 'chuyen_khoan_noi_bo',
    chieu_tien: 'thu',
    tai_khoan_tien_id: 10,
    tai_khoan_nhan_id: 11,
    so_tien: 500000,
    doi_tuong_id: 7,
    khach_hang_id: 8,
    nha_cung_cap_id: null,
    hop_dong_id: 9,
    hop_dong_mua_id: null,
    hang_muc_thu_chi_id: 12,
    mo_ta_giao_dich: 'Imported bank row',
    so_tai_khoan_doi_ung: '012345',
    ten_tai_khoan_doi_ung: 'Counterparty',
    so_du_sau_giao_dich: 1234567,
    ma_giao_dich_ngan_hang: 'BANK-001',
    ghi_chu: 'old',
    trang_thai: 'hoan_thanh',
  };

  const merged = mergeDongTienUpdate(existing, {
    ngay_giao_dich: '2026-08-25',
    ghi_chu: 'edited',
  });

  assert.equal(merged.ngay_giao_dich, '2026-08-25 14:15:16');
  assert.equal(merged.chieu_tien, 'thu');
  assert.equal(merged.doi_tuong_id, 7);
  assert.equal(merged.so_du_sau_giao_dich, 1234567);
  assert.equal(merged.ma_giao_dich_ngan_hang, 'BANK-001');
  assert.equal(merged.ghi_chu, 'edited');
});

test('delivery-note updates preserve omitted header fields and debt value', () => {
  const existing = {
    so_phieu: 'GH001',
    ngay_giao: '2026-08-24',
    khach_hang_id: 4,
    hop_dong_id: 5,
    gia_tri_ghi_no: 900000,
    noi_dung: 'old note',
    nguoi_tao: 'Admin',
  };

  const partial = mergePhieuGiaoHangUpdate(existing, { noi_dung: 'new note' }, 4, null);
  assert.deepEqual(partial, {
    so_phieu: 'GH001',
    ngay_giao: '2026-08-24',
    khach_hang_id: 4,
    hop_dong_id: 5,
    gia_tri_ghi_no: 900000,
    noi_dung: 'new note',
    nguoi_tao: 'Admin',
  });

  const clearedDetails = mergePhieuGiaoHangUpdate(existing, { chi_tiet: [] }, 4, 0);
  assert.equal(clearedDetails.gia_tri_ghi_no, 0);
});

test('phu luc rejects duplicate existing contract lines before quantity updates', () => {
  const hdChiTiet = [{
    id: 10,
    ten_san_pham: 'Panel',
    don_vi: 'cai',
    so_luong: 100,
    don_gia_von: 1,
    gia_ban_thuc_te: 1,
    thue_suat: 10,
    chenh_lech_phan_tram: 0,
    gia_hop_dong: 1,
  }];

  assert.throws(
    () => normalizeChiTietInput([
      { hop_dong_chi_tiet_id: 10, so_luong_thay_doi: 10 },
      { hop_dong_chi_tiet_id: 10, so_luong_thay_doi: 5 },
    ], hdChiTiet),
    /bị trùng/,
  );
});

test('contract delete removes phu luc rows before contract detail rows', async () => {
  const calls = [];
  await deleteHopDongCascade(async (sql, params) => {
    calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
  }, 42);

  assert.equal(calls.length, 4);
  assert.match(calls[0].sql, /^DELETE FROM phu_luc_hop_dong_chi_tiet/);
  assert.match(calls[0].sql, /phu_luc_hop_dong WHERE hop_dong_id = \?/);
  assert.equal(calls[1].sql, 'DELETE FROM phu_luc_hop_dong WHERE hop_dong_id = ?');
  assert.equal(calls[2].sql, 'DELETE FROM hop_dong_chi_tiet WHERE hop_dong_id = ?');
  assert.equal(calls[3].sql, 'DELETE FROM hop_dong WHERE id = ?');
  assert.deepEqual(calls.map((c) => c.params), [[42], [42], [42], [42]]);
});
