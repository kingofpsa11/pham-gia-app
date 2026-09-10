import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import jwt from 'jsonwebtoken';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';

const { default: app } = await import('./index.js');
const { verifyToken } = await import('./middleware/auth.js');
const { DEFAULT_JWT_SECRET } = await import('./utils/jwtSecret.js');
const { buildDongTienUpdateValues } = await import('./routes/dong-tien-moi.js');

async function request(path, options = {}) {
  const server = app.listen(0);
  try {
    const { port } = server.address();
    return await new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path,
          method: options.method || 'GET',
          headers: options.headers || {},
        },
        async (res) => {
          let body = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => { body += chunk; });
          res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
        },
      );
      req.on('error', reject);
      if (options.body) req.write(options.body);
      req.end();
    });
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

test('private API routes reject anonymous requests before hitting data handlers', async () => {
  const res = await request('/api/dashboard-stats');
  assert.equal(res.status, 401);
});

test('table enumeration is authenticated and admin-only', async () => {
  const anonymous = await request('/api/tables');
  assert.equal(anonymous.status, 401);

  const staffToken = jwt.sign({ id: 1, email: 'staff@example.com', role: 'staff' }, 'test-secret');
  const staff = await request('/api/tables', {
    headers: { Authorization: `Bearer ${staffToken}` },
  });
  assert.equal(staff.status, 403);
});

test('Google OAuth callback remains public for provider redirects', async () => {
  const res = await request('/api/google-drive/callback');
  assert.equal(res.status, 302);
  assert.match(res.headers.location, /drive_error=invalid_state/);
});

test('production rejects tokens signed with the checked-in default JWT secret', () => {
  const previousEnv = process.env.NODE_ENV;
  const previousSecret = process.env.JWT_SECRET;
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;
    const token = jwt.sign({ id: 1, email: 'admin@example.com', role: 'admin' }, DEFAULT_JWT_SECRET);
    assert.equal(verifyToken(token), null);
  } finally {
    process.env.NODE_ENV = previousEnv;
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});

test('cashflow update values preserve omitted financial fields and existing time', () => {
  const existing = {
    ngay_giao_dich: '2026-09-09 14:35:20',
    loai_giao_dich: 'chuyen_khoan_noi_bo',
    chieu_tien: 'thu',
    tai_khoan_tien_id: 3,
    tai_khoan_nhan_id: 4,
    so_tien: '1500000',
    doi_tuong_id: 9,
    khach_hang_id: 10,
    nha_cung_cap_id: null,
    hop_dong_id: 11,
    hop_dong_mua_id: null,
    hang_muc_thu_chi_id: 12,
    mo_ta_giao_dich: 'Imported bank transfer',
    so_tai_khoan_doi_ung: '123456789',
    ten_tai_khoan_doi_ung: 'Counterparty',
    so_du_sau_giao_dich: '99000000',
    ma_giao_dich_ngan_hang: 'BANK-123',
    ghi_chu: 'Existing note',
    trang_thai: 'cho_doi_soat',
  };

  const values = buildDongTienUpdateValues(
    {
      ngay_giao_dich: '2026-09-10',
      so_tien: 2000000,
      ghi_chu: '',
    },
    existing,
    42,
  );

  assert.equal(values[0], '2026-09-10 14:35:20');
  assert.equal(values[3], 'thu');
  assert.equal(values[7], 9);
  assert.equal(values[16], '99000000');
  assert.equal(values[17], 'BANK-123');
  assert.equal(values[18], null);
  assert.equal(values[20], 42);
});
