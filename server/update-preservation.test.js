import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('delivery-note edits preserve existing voucher metadata when omitted', () => {
  const source = readFileSync(new URL('./routes/phieu-giao-hang.js', import.meta.url), 'utf8');

  assert.match(
    source,
    /const existing = await queryOne\('SELECT \* FROM phieu_giao_hang WHERE id = \?', \[id\]\);/,
  );
  assert.match(source, /hasOwn\(body, 'so_phieu'\) \? body\.so_phieu : existing\.so_phieu/);
  assert.match(source, /hasOwn\(body, 'nguoi_tao'\) \? body\.nguoi_tao \|\| '' : existing\.nguoi_tao/);
  assert.match(source, /hasOwn\(body, 'gia_tri_ghi_no'\)\s*\?\s*body\.gia_tri_ghi_no \?\? 0\s*:\s*existing\.gia_tri_ghi_no/s);
  assert.match(source, /const hasChiTiet = Array\.isArray\(body\.chi_tiet\);/);
});

test('cashflow edits preserve imported bank fields and internal-transfer direction when omitted', () => {
  const source = readFileSync(new URL('./routes/dong-tien-moi.js', import.meta.url), 'utf8');

  assert.match(
    source,
    /const existing = await queryOne\('SELECT \* FROM dong_tien_moi WHERE id = \?', \[id\]\);/,
  );
  assert.match(source, /existing\.loai_giao_dich === 'chuyen_khoan_noi_bo'\s*\?\s*existing\.chieu_tien/s);
  assert.match(source, /hasOwn\(body, 'doi_tuong_id'\) \? body\.doi_tuong_id \|\| null : existing\.doi_tuong_id/);
  assert.match(source, /hasOwn\(body, 'so_du_sau_giao_dich'\) \? body\.so_du_sau_giao_dich \?\? null : existing\.so_du_sau_giao_dich/);
  assert.match(source, /hasOwn\(body, 'ma_giao_dich_ngan_hang'\) \? body\.ma_giao_dich_ngan_hang \?\? null : existing\.ma_giao_dich_ngan_hang/);
});
