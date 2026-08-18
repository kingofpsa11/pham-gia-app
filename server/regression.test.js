import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = 'regression_test_secret';

const { app } = await import('./index.js');
const {
  resetQueryImplementationForTest,
  setQueryImplementationForTest,
} = await import('./db.js');

afterEach(() => {
  resetQueryImplementationForTest();
});

function authHeader(role = 'staff') {
  const token = jwt.sign({ id: `user-${role}`, email: `${role}@example.com`, role }, process.env.JWT_SECRET);
  return { Authorization: `Bearer ${token}` };
}

async function withServer(fn) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

function installDb(handler) {
  const calls = [];
  setQueryImplementationForTest(async (sql, params = []) => {
    calls.push({ sql, params });
    return handler(sql, params, calls);
  });
  return calls;
}

test('business APIs require auth and tables require admin before DB access', async () => {
  const calls = installDb(() => {
    throw new Error('DB should not be reached by rejected auth requests');
  });

  await withServer(async (base) => {
    const customerRes = await fetch(`${base}/api/khach-hang`);
    assert.equal(customerRes.status, 401);

    const exportRes = await fetch(`${base}/api/xuat-bao-gia-excel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bao_gia_id: 1, mau_key: 'mau_bao_gia_hapulico' }),
    });
    assert.equal(exportRes.status, 401);

    const tablesRes = await fetch(`${base}/api/tables`, {
      headers: authHeader('staff'),
    });
    assert.equal(tablesRes.status, 403);
  });

  assert.equal(calls.length, 0);
});

test('admin can read schema table list after auth', async () => {
  installDb((sql) => {
    if (sql.includes('FROM information_schema.tables')) {
      return [{ table_name: 'khach_hang' }, { table_name: 'bao_gia' }];
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });

  await withServer(async (base) => {
    const res = await fetch(`${base}/api/tables`, {
      headers: authHeader('admin'),
    });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {
      tables: ['khach_hang', 'bao_gia'],
      count: 2,
    });
  });
});

test('login discovers all configured user table candidates', async () => {
  let tableParams;
  installDb((sql, params) => {
    if (sql.includes('FROM information_schema.tables')) {
      tableParams = params;
      return [{ name: 'tai_khoan_he_thong' }];
    }
    if (sql.includes('FROM information_schema.columns')) {
      return [
        { name: 'id' },
        { name: 'email' },
        { name: 'password' },
        { name: 'role' },
        { name: 'ten' },
      ];
    }
    if (sql.includes('FROM `tai_khoan_he_thong`')) {
      return [{ id: 'u1', email: 'admin@example.com', password: 'pw', role: 'admin', ten: 'Admin' }];
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });

  await withServer(async (base) => {
    const res = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.com', password: 'pw' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.user.role, 'admin');
    assert.ok(body.token);
  });

  assert.deepEqual(tableParams, ['Admin', 'users', 'nguoi_dung', 'tai_khoan_he_thong']);
});

test('delivery note PUT preserves fields omitted by edit payloads', async () => {
  const existing = {
    id: 10,
    so_phieu: 'PGH-001',
    ngay_giao: '2026-08-01',
    khach_hang_id: 7,
    hop_dong_id: 8,
    gia_tri_ghi_no: 123456,
    noi_dung: 'old note',
    nguoi_tao: 'original creator',
  };
  const calls = installDb((sql) => {
    if (sql.includes('SELECT * FROM phieu_giao_hang WHERE id = ?')) {
      return [existing];
    }
    if (sql.includes('UPDATE phieu_giao_hang')) {
      return { affectedRows: 1 };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });

  await withServer(async (base) => {
    const res = await fetch(`${base}/api/phieu-giao-hang/10`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ ngay_giao: '2026-08-12', noi_dung: 'updated note' }),
    });
    assert.equal(res.status, 200);
  });

  const update = calls.find((call) => call.sql.includes('UPDATE phieu_giao_hang'));
  assert.ok(update);
  assert.equal(update.params[0], 'PGH-001');
  assert.equal(update.params[4], 123456);
  assert.equal(update.params[6], 'original creator');
});

test('cashflow PUT preserves omitted financial metadata', async () => {
  const existing = {
    id: 42,
    ngay_giao_dich: '2026-08-01 09:30:00',
    ngay_hach_toan: '2026-08-01',
    loai_giao_dich: 'chuyen_khoan_noi_bo',
    chieu_tien: 'thu',
    tai_khoan_tien_id: 3,
    tai_khoan_nhan_id: 4,
    so_tien: 5000,
    doi_tuong_id: 9,
    khach_hang_id: 11,
    nha_cung_cap_id: null,
    hop_dong_id: 12,
    hop_dong_mua_id: null,
    hang_muc_thu_chi_id: 15,
    mo_ta_giao_dich: 'old transfer',
    so_tai_khoan_doi_ung: '123',
    ten_tai_khoan_doi_ung: 'Counterparty',
    so_du_sau_giao_dich: 987654,
    ma_giao_dich_ngan_hang: 'BANK-REF-1',
    ghi_chu: 'old note',
    trang_thai: 'hoan_thanh',
  };
  const calls = installDb((sql) => {
    if (sql.includes('SELECT * FROM dong_tien_moi WHERE id = ?')) {
      return [existing];
    }
    if (sql.includes('UPDATE dong_tien_moi SET')) {
      return { affectedRows: 1 };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });

  await withServer(async (base) => {
    const res = await fetch(`${base}/api/dong-tien-moi/42`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ so_tien: 6000, ghi_chu: 'changed note' }),
    });
    assert.equal(res.status, 200);
  });

  const update = calls.find((call) => call.sql.includes('UPDATE dong_tien_moi SET'));
  assert.ok(update);
  assert.equal(update.params[2], 'chuyen_khoan_noi_bo');
  assert.equal(update.params[3], 'thu');
  assert.equal(update.params[4], 3);
  assert.equal(update.params[5], 4);
  assert.equal(update.params[7], 9);
  assert.equal(update.params[16], 987654);
  assert.equal(update.params[17], 'BANK-REF-1');
  assert.equal(update.params[18], 'changed note');
});

test('cashflow PUT preserves transaction time for date-only edit payloads', async () => {
  const existing = {
    id: 43,
    ngay_giao_dich: '2026-08-01 09:30:00',
    ngay_hach_toan: '2026-08-01',
    loai_giao_dich: 'chuyen_khoan_noi_bo',
    chieu_tien: 'thu',
    tai_khoan_tien_id: 3,
    tai_khoan_nhan_id: 4,
    so_tien: 5000,
    doi_tuong_id: 9,
    khach_hang_id: 11,
    nha_cung_cap_id: null,
    hop_dong_id: 12,
    hop_dong_mua_id: null,
    hang_muc_thu_chi_id: 15,
    mo_ta_giao_dich: 'old transfer',
    so_tai_khoan_doi_ung: '123',
    ten_tai_khoan_doi_ung: 'Counterparty',
    so_du_sau_giao_dich: 987654,
    ma_giao_dich_ngan_hang: 'BANK-REF-1',
    ghi_chu: 'old note',
    trang_thai: 'hoan_thanh',
  };
  const calls = installDb((sql) => {
    if (sql.includes('SELECT * FROM dong_tien_moi WHERE id = ?')) {
      return [existing];
    }
    if (sql.includes('UPDATE dong_tien_moi SET')) {
      return { affectedRows: 1 };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });

  await withServer(async (base) => {
    const res = await fetch(`${base}/api/dong-tien-moi/43`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({
        ngay_giao_dich: '2026-08-05',
        loai_giao_dich: 'chuyen_khoan_noi_bo',
        chieu_tien: 'thu',
        tai_khoan_tien_id: 3,
        tai_khoan_nhan_id: 4,
        so_tien: 6000,
      }),
    });
    assert.equal(res.status, 200);
  });

  const update = calls.find((call) => call.sql.includes('UPDATE dong_tien_moi SET'));
  assert.ok(update);
  assert.equal(update.params[0], '2026-08-05 09:30:00');
  assert.equal(update.params[1], '2026-08-05');
  assert.equal(update.params[3], 'thu');
});

test('cashflow bulk update preserves omitted imported bank metadata', async () => {
  const existing = {
    id: 99,
    ngay_giao_dich: '2026-08-02 10:00:00',
    ngay_hach_toan: '2026-08-02',
    loai_giao_dich: 'thu',
    chieu_tien: null,
    tai_khoan_tien_id: 5,
    tai_khoan_nhan_id: null,
    so_tien: 7000,
    khach_hang_id: 21,
    nha_cung_cap_id: null,
    hop_dong_id: 22,
    hop_dong_mua_id: null,
    hang_muc_thu_chi_id: 23,
    mo_ta_giao_dich: 'bank import',
    so_tai_khoan_doi_ung: '456',
    ten_tai_khoan_doi_ung: 'Importer',
    so_du_sau_giao_dich: 765432,
    ma_giao_dich_ngan_hang: 'BANK-REF-2',
    ghi_chu: 'old bulk note',
    trang_thai: 'hoan_thanh',
  };
  const calls = installDb((sql) => {
    if (sql.includes('SELECT * FROM dong_tien_moi WHERE id = ?')) {
      return [existing];
    }
    if (sql.includes('UPDATE dong_tien_moi SET')) {
      return { affectedRows: 1 };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });

  await withServer(async (base) => {
    const res = await fetch(`${base}/api/dong-tien-moi/bulk-update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ items: [{ id: 99, ghi_chu: 'new bulk note' }] }),
    });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { updated: 1, created: 0, failed: 0, errors: [] });
  });

  const update = calls.find((call) => call.sql.includes('UPDATE dong_tien_moi SET'));
  assert.ok(update);
  assert.equal(update.params[2], 'thu');
  assert.equal(update.params[4], 5);
  assert.equal(update.params[9], 21);
  assert.equal(update.params[11], 22);
  assert.equal(update.params[15], 765432);
  assert.equal(update.params[16], 'BANK-REF-2');
  assert.equal(update.params[17], 'new bulk note');
});
