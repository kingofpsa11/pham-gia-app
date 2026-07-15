import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mergeDongTienUpdate } from './routes/dong-tien-moi.js';
import { mergePhieuGiaoHangUpdate } from './routes/phieu-giao-hang.js';
import pool from './db.js';

after(async () => {
  await pool.end();
});

describe('delivery note update merging', () => {
  it('preserves stable fields and debt total when edit payload omits them', () => {
    const existing = {
      so_phieu: 'PGH-001',
      ngay_giao: '2026-07-01',
      khach_hang_id: 12,
      hop_dong_id: 34,
      gia_tri_ghi_no: 12345000,
      noi_dung: 'Giao dot 1',
      nguoi_tao: 'admin@example.com',
    };

    const update = mergePhieuGiaoHangUpdate(
      existing,
      { ngay_giao: '2026-07-15', noi_dung: null },
      existing.khach_hang_id,
      existing.gia_tri_ghi_no,
    );

    assert.deepEqual(update, {
      so_phieu: 'PGH-001',
      ngay_giao: '2026-07-15',
      khach_hang_id: 12,
      hop_dong_id: 34,
      gia_tri_ghi_no: 12345000,
      noi_dung: '',
      nguoi_tao: 'admin@example.com',
    });
  });
});

describe('cashflow update merging', () => {
  it('preserves ledger snapshot and related object fields omitted by the UI', () => {
    const existing = {
      ngay_giao_dich: '2026-07-01 10:00:00',
      ngay_hach_toan: '2026-07-01 10:00:00',
      loai_giao_dich: 'thu',
      chieu_tien: 'thu',
      tai_khoan_tien_id: 1,
      tai_khoan_nhan_id: null,
      so_tien: 500000,
      doi_tuong_id: 99,
      khach_hang_id: 12,
      nha_cung_cap_id: null,
      hop_dong_id: 34,
      hop_dong_mua_id: null,
      hang_muc_thu_chi_id: 5,
      mo_ta_giao_dich: 'Thanh toan',
      so_tai_khoan_doi_ung: '123',
      ten_tai_khoan_doi_ung: 'Cong ty A',
      so_du_sau_giao_dich: 1500000,
      ma_giao_dich_ngan_hang: 'BNK001',
      ghi_chu: 'Da doi soat',
      trang_thai: 'hoan_thanh',
    };

    const update = mergeDongTienUpdate(existing, {
      so_tien: 600000,
      chieu_tien: null,
      ghi_chu: null,
    });

    assert.equal(update.so_tien, 600000);
    assert.equal(update.chieu_tien, null);
    assert.equal(update.ghi_chu, null);
    assert.equal(update.so_du_sau_giao_dich, 1500000);
    assert.equal(update.doi_tuong_id, 99);
    assert.equal(update.khach_hang_id, 12);
    assert.equal(update.ma_giao_dich_ngan_hang, 'BNK001');
  });
});
