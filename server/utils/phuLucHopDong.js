import pool from '../db.js';
import { calcTongThanhToanHopDong } from './baoGiaCalc.js';

export function padSoPhuLuc(n) {
  return String(n).padStart(2, '0');
}

export function loaiTuDelta(delta, isNew) {
  if (isNew) return 'moi';
  return Number(delta) < 0 ? 'giam' : 'tang';
}

export function dieu1TieuDe(items) {
  const deltas = (items || []).map((i) => Number(i.so_luong_thay_doi) || 0);
  const hasTang = deltas.some((d) => d > 0);
  const hasGiam = deltas.some((d) => d < 0);
  if (hasTang && hasGiam) {
    return 'ĐIỀU CHỈNH TĂNG/GIẢM NỘI DUNG CÔNG VIỆC VÀ GIÁ TRỊ HỢP ĐỒNG';
  }
  if (hasGiam && !hasTang) {
    return 'ĐIỀU CHỈNH GIẢM NỘI DUNG CÔNG VIỆC VÀ GIÁ TRỊ HỢP ĐỒNG';
  }
  return 'ĐIỀU CHỈNH TĂNG NỘI DUNG CÔNG VIỆC VÀ GIÁ TRỊ HỢP ĐỒNG';
}

export async function withTx(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function q(conn, sql, params = []) {
  const [rows] = await conn.query(sql, params);
  return rows;
}

export async function qOne(conn, sql, params = []) {
  const rows = await q(conn, sql, params);
  return rows[0] ?? null;
}

export async function loadDaGiaoMap(connOrNull, hopDongId) {
  const sql = `
    SELECT pghct.hop_dong_chi_tiet_id AS id, SUM(pghct.so_luong_giao) AS da_giao
    FROM phieu_giao_hang_chi_tiet pghct
    JOIN phieu_giao_hang pgh ON pgh.id = pghct.phieu_giao_hang_id
    WHERE pgh.hop_dong_id = ?
      AND pghct.hop_dong_chi_tiet_id IS NOT NULL
    GROUP BY pghct.hop_dong_chi_tiet_id
  `;
  const rows = connOrNull
    ? await q(connOrNull, sql, [hopDongId])
    : (await pool.query(sql, [hopDongId]))[0];
  const map = {};
  for (const r of rows) map[String(r.id)] = Number(r.da_giao) || 0;
  return map;
}

export function normalizeChiTietInput(bodyLines, hdChiTiet) {
  const byId = new Map((hdChiTiet || []).map((r) => [String(r.id), r]));
  const out = [];
  for (const raw of bodyLines || []) {
    const hdctId = raw.hop_dong_chi_tiet_id ? Number(raw.hop_dong_chi_tiet_id) : null;
    const existing = hdctId ? byId.get(String(hdctId)) : null;
    const isNew = !existing;
    const delta = Number(raw.so_luong_thay_doi);
    if (!Number.isFinite(delta) || delta === 0) continue;

    const soLuongCu = existing ? Number(existing.so_luong) || 0 : 0;
    const soLuongMoi = soLuongCu + delta;
    const ten = String(raw.ten_san_pham || existing?.ten_san_pham || '').trim();
    if (!ten) throw new Error('Thiếu tên sản phẩm trên một dòng phụ lục');
    if (soLuongMoi < 0) {
      throw new Error(`Số lượng mới của "${ten}" không được âm`);
    }

    out.push({
      hop_dong_chi_tiet_id: existing ? Number(existing.id) : null,
      loai: loaiTuDelta(delta, isNew),
      ten_san_pham: ten,
      don_vi: String(raw.don_vi || existing?.don_vi || ''),
      so_luong_cu: soLuongCu,
      so_luong_thay_doi: delta,
      so_luong_moi: soLuongMoi,
      don_gia_von: Number(raw.don_gia_von ?? existing?.don_gia_von) || 0,
      gia_ban_thuc_te: Number(raw.gia_ban_thuc_te ?? existing?.gia_ban_thuc_te) || 0,
      thue_suat: Number(raw.thue_suat ?? existing?.thue_suat) || 10,
      chenh_lech_phan_tram: Number(raw.chenh_lech_phan_tram ?? existing?.chenh_lech_phan_tram) || 0,
      gia_hop_dong: Number(raw.gia_hop_dong ?? existing?.gia_hop_dong) || 0,
    });
  }
  if (out.length === 0) {
    throw new Error('Phụ lục phải có ít nhất một dòng tăng/giảm khối lượng');
  }
  return out;
}

export function calcGiaTriPhuLuc(lines) {
  return calcTongThanhToanHopDong(
    lines.map((l) => ({
      so_luong: l.so_luong_thay_doi,
      gia_hop_dong: l.gia_hop_dong,
      thue_suat: l.thue_suat,
    })),
    0,
    0,
  );
}
