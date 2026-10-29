import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parseNgayGiaoDichPreserveExistingTime } from './utils/dongTienDate.js';
import { patchedValue } from './utils/patchMerge.js';

test('API routers are mounted behind the authenticated boundary', async () => {
  const source = await readFile(new URL('./index.js', import.meta.url), 'utf8');
  const authMount = source.indexOf("app.use('/api/auth', authRouter)");
  const driveMount = source.indexOf("app.use('/api', googleDriveRouter)");
  const gate = source.indexOf("app.use('/api', requireAuth)");
  const protectedMount = source.indexOf("app.use('/api', dashboardRouter)");

  assert.ok(authMount >= 0, 'auth router must be mounted');
  assert.ok(driveMount > authMount, 'Google OAuth callback stays public after auth routes');
  assert.ok(gate > driveMount, 'global auth gate follows public routes');
  assert.ok(protectedMount > gate, 'business routers are mounted after the auth gate');
  assert.match(source, /app\.get\('\/api\/tables', requireAdmin,/);
});

test('quote Excel export requires an authenticated user', async () => {
  const source = await readFile(new URL('./routes/xuat-bao-gia-excel.js', import.meta.url), 'utf8');
  assert.match(source, /import \{ requireAuth \} from '\.\.\/middleware\/auth\.js';/);
  assert.match(source, /router\.post\('\/xuat-bao-gia-excel', requireAuth,/);
});

test('patch helper preserves omitted fields but accepts explicit clearing', () => {
  const existing = { so_du_sau_giao_dich: 5000, ma_giao_dich_ngan_hang: 'BANK-1' };
  assert.equal(patchedValue({}, existing, 'so_du_sau_giao_dich'), 5000);
  assert.equal(
    patchedValue({ ma_giao_dich_ngan_hang: null }, existing, 'ma_giao_dich_ngan_hang', (value) => value ?? null),
    null,
  );
});

test('date-only cashflow edits keep an existing transaction time', () => {
  assert.equal(
    parseNgayGiaoDichPreserveExistingTime('2026-10-29', '2026-10-28 14:35:20'),
    '2026-10-29 14:35:20',
  );
  assert.equal(
    parseNgayGiaoDichPreserveExistingTime('2026-10-29 08:00:00', '2026-10-28 14:35:20'),
    '2026-10-29 08:00:00',
  );
});

test('destructive updates load existing rows before writing sparse payloads', async () => {
  const cashflow = await readFile(new URL('./routes/dong-tien-moi.js', import.meta.url), 'utf8');
  const delivery = await readFile(new URL('./routes/phieu-giao-hang.js', import.meta.url), 'utf8');

  assert.match(cashflow, /SELECT \* FROM dong_tien_moi WHERE id = \?/);
  assert.match(cashflow, /mergedDongTienValue\(body, existing, 'so_du_sau_giao_dich'/);
  assert.match(cashflow, /mergedDongTienValue\(body, existing, 'ma_giao_dich_ngan_hang'/);
  assert.match(delivery, /SELECT \* FROM phieu_giao_hang WHERE id = \?/);
  assert.match(delivery, /patchedValue\(body, existing, 'so_phieu'\)/);
  assert.match(delivery, /existing\.gia_tri_ghi_no/);
});

test('contract Drive folders are not reused by STT-only matches', async () => {
  const source = await readFile(new URL('./utils/hopDongDrive.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /findFolderByStt\(siblings, stt\)/);
  assert.match(source, /contractFolder = exact;/);
});

