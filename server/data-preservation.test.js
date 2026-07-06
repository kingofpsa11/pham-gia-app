import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveCashflowChieuTien } from './routes/dong-tien-moi.js';
import { resolvePhieuGiaoHangUpdateValues } from './routes/phieu-giao-hang.js';

test('delivery note update preserves immutable metadata when edit payload omits it', () => {
  const values = resolvePhieuGiaoHangUpdateValues(
    {
      ngay_giao: '2026-07-06',
      hop_dong_id: 10,
      noi_dung: 'Updated note',
    },
    {
      so_phieu: 'PGH-2026-0007',
      nguoi_tao: 'Nguyen Van A',
    },
    20,
    123456,
    7,
  );

  assert.deepEqual(values, [
    'PGH-2026-0007',
    '2026-07-06',
    20,
    10,
    123456,
    'Updated note',
    'Nguyen Van A',
    7,
  ]);
});

test('delivery note update still accepts explicit metadata changes', () => {
  const values = resolvePhieuGiaoHangUpdateValues(
    {
      so_phieu: 'PGH-2026-0008',
      ngay_giao: '2026-07-07',
      hop_dong_id: 11,
      noi_dung: '',
      nguoi_tao: 'Tran Thi B',
    },
    {
      so_phieu: 'PGH-2026-0007',
      nguoi_tao: 'Nguyen Van A',
    },
    21,
    654321,
    8,
  );

  assert.deepEqual(values, [
    'PGH-2026-0008',
    '2026-07-07',
    21,
    11,
    654321,
    '',
    'Tran Thi B',
    8,
  ]);
});

test('cashflow update preserves internal transfer direction when omitted', () => {
  assert.equal(resolveCashflowChieuTien({}, { chieu_tien: 'thu' }), 'thu');
  assert.equal(resolveCashflowChieuTien({}, { chieu_tien: 'chi' }), 'chi');
});

test('cashflow update honors explicit direction clearing or replacement', () => {
  assert.equal(resolveCashflowChieuTien({ chieu_tien: 'chi' }, { chieu_tien: 'thu' }), 'chi');
  assert.equal(resolveCashflowChieuTien({ chieu_tien: null }, { chieu_tien: 'thu' }), null);
});
