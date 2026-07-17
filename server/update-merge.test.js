import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeDongTienUpdate } from './routes/dong-tien-moi.js';
import { mergePhieuGiaoHangUpdate } from './routes/phieu-giao-hang.js';

test('delivery note updates preserve persisted fields omitted by detail edit payloads', () => {
  const existing = {
    so_phieu: 'PGH-001',
    ngay_giao: '2026-07-01',
    khach_hang_id: 10,
    hop_dong_id: 20,
    gia_tri_ghi_no: 123000,
    noi_dung: 'Giao dot 1',
    nguoi_tao: 'admin@example.com',
  };

  const merged = mergePhieuGiaoHangUpdate(
    existing,
    { ngay_giao: '2026-07-02', hop_dong_id: 20 },
    10,
    456000,
  );

  assert.equal(merged.so_phieu, 'PGH-001');
  assert.equal(merged.nguoi_tao, 'admin@example.com');
  assert.equal(merged.noi_dung, 'Giao dot 1');
  assert.equal(merged.gia_tri_ghi_no, 456000);
  assert.equal(merged.ngay_giao, '2026-07-02');
});

test('cashflow updates preserve omitted balance and transfer direction fields', () => {
  const existing = {
    ngay_giao_dich: '2026-07-01 08:00:00',
    loai_giao_dich: 'chuyen_khoan_noi_bo',
    chieu_tien: 'thu',
    tai_khoan_tien_id: 2,
    tai_khoan_nhan_id: 1,
    so_tien: 1000000,
    doi_tuong_id: 77,
    khach_hang_id: 11,
    nha_cung_cap_id: null,
    hop_dong_id: 22,
    hop_dong_mua_id: null,
    hang_muc_thu_chi_id: 33,
    mo_ta_giao_dich: 'Transfer in',
    so_tai_khoan_doi_ung: '123456',
    ten_tai_khoan_doi_ung: 'Counterparty',
    so_du_sau_giao_dich: 99000000,
    ma_giao_dich_ngan_hang: 'BANK-1',
    ghi_chu: 'old note',
    trang_thai: 'hoan_thanh',
  };

  const merged = mergeDongTienUpdate(existing, {
    loai_giao_dich: 'chuyen_khoan_noi_bo',
    chieu_tien: 'chi',
    ngay_giao_dich: '2026-07-02',
    tai_khoan_tien_id: 2,
    tai_khoan_nhan_id: 1,
    so_tien: 1500000,
    hang_muc_thu_chi_id: 33,
    mo_ta_giao_dich: 'Edited transfer',
  });

  assert.equal(merged.chieu_tien, 'thu');
  assert.equal(merged.so_du_sau_giao_dich, 99000000);
  assert.equal(merged.doi_tuong_id, 77);
  assert.equal(merged.ma_giao_dich_ngan_hang, 'BANK-1');
  assert.equal(merged.so_tien, 1500000);
  assert.equal(merged.mo_ta_giao_dich, 'Edited transfer');
});
