import { query, queryOne } from '../db.js';

function normalizeName(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function namesMatch(a, b) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

function parseMoTaCounterpart(moTa) {
  if (!moTa) return '';
  const parts = String(moTa).split('--');
  if (parts.length < 2) return '';
  return parts[parts.length - 1].trim();
}

function dateKey(ngay) {
  return String(ngay || '').slice(0, 10);
}

function isSelfNhan(row) {
  return row.tai_khoan_nhan_id != null
    && String(row.tai_khoan_nhan_id) === String(row.tai_khoan_tien_id);
}

function findCkPair(row, allCkRows) {
  const dk = dateKey(row.ngay_giao_dich);
  const amt = Number(row.so_tien);
  return allCkRows.find(
    (r) =>
      r.id !== row.id
      && Number(r.so_tien) === amt
      && dateKey(r.ngay_giao_dich) === dk
      && String(r.tai_khoan_tien_id) !== String(row.tai_khoan_tien_id),
  );
}

function inferCkChieuFromPair(row, paired) {
  if (String(paired.tai_khoan_nhan_id) === String(row.tai_khoan_tien_id) && !isSelfNhan(paired)) {
    return 'thu';
  }
  if (String(row.tai_khoan_nhan_id) === String(paired.tai_khoan_tien_id) && !isSelfNhan(row)) {
    return 'chi';
  }
  return null;
}

function inferCkNhanId(row, paired, chieu, tkById) {
  if (chieu === 'chi') return paired.tai_khoan_tien_id;
  if (chieu === 'thu') return paired.tai_khoan_tien_id;
  return row.tai_khoan_nhan_id;
}

function inferCkChieu(row, tkById, allCkRows) {
  const paired = findCkPair(row, allCkRows);
  if (paired) {
    const fromPair = inferCkChieuFromPair(row, paired);
    if (fromPair) return { chieu: fromPair, nhanId: inferCkNhanId(row, paired, fromPair, tkById) };

    const currentTk = tkById.get(row.tai_khoan_tien_id);
    const pairedTk = tkById.get(paired.tai_khoan_tien_id);
    const moTa = String(row.mo_ta_giao_dich || '').toLowerCase();
    if (moTa.includes('vao cong ty') || moTa.includes('nop tien')) {
      if (currentTk?.pham_vi === 'cong_ty' && pairedTk?.pham_vi !== 'cong_ty') {
        return { chieu: 'thu', nhanId: paired.tai_khoan_tien_id };
      }
      if (currentTk?.pham_vi !== 'cong_ty' && pairedTk?.pham_vi === 'cong_ty') {
        return { chieu: 'chi', nhanId: paired.tai_khoan_tien_id };
      }
    }
  }

  if (row.tai_khoan_nhan_id && row.nguon_du_lieu !== 'import_excel' && !isSelfNhan(row)) {
    return { chieu: 'chi', nhanId: row.tai_khoan_nhan_id };
  }

  return { chieu: 'chi', nhanId: isSelfNhan(row) ? null : row.tai_khoan_nhan_id };
}

async function backfillCkChieuTien(onlyNull = true) {
  const rows = await query(
    `SELECT id, tai_khoan_tien_id, tai_khoan_nhan_id, so_tien, ngay_giao_dich, mo_ta_giao_dich, nguon_du_lieu
     FROM dong_tien_moi
     WHERE loai_giao_dich = 'chuyen_khoan_noi_bo'${onlyNull ? ' AND chieu_tien IS NULL' : ''}`
  );
  if (!rows.length) return;

  const tks = await query(`SELECT id, ten_tai_khoan, pham_vi FROM tai_khoan_tien`);
  const tkById = new Map(tks.map((t) => [t.id, t]));
  let updated = 0;

  for (const row of rows) {
    const { chieu, nhanId } = inferCkChieu(row, tkById, rows);
    await query(
      `UPDATE dong_tien_moi SET chieu_tien = ?, tai_khoan_nhan_id = ? WHERE id = ?`,
      [chieu, nhanId || null, row.id],
    );
    updated++;
  }

  if (updated > 0) {
    console.log(`Schema: backfilled chieu_tien for ${updated} CK rows`);
  }
}

async function repairPhieuGiaoHangHdctLinks() {
  const phieus = await query(
    `SELECT DISTINCT pgh.id, pgh.hop_dong_id
     FROM phieu_giao_hang pgh
     JOIN phieu_giao_hang_chi_tiet pghct ON pghct.phieu_giao_hang_id = pgh.id
     LEFT JOIN hop_dong_chi_tiet hdct ON hdct.id = pghct.hop_dong_chi_tiet_id
     WHERE pgh.hop_dong_id IS NOT NULL
       AND pghct.hop_dong_chi_tiet_id IS NOT NULL
       AND hdct.id IS NULL`
  );
  if (!phieus.length) return;

  let fixedLines = 0;
  for (const pgh of phieus) {
    const lines = await query(
      `SELECT id, hop_dong_chi_tiet_id FROM phieu_giao_hang_chi_tiet
       WHERE phieu_giao_hang_id = ? ORDER BY id`,
      [pgh.id],
    );
    const hdLines = await query(
      `SELECT id, gia_hop_dong FROM hop_dong_chi_tiet
       WHERE hop_dong_id = ? ORDER BY id`,
      [pgh.hop_dong_id],
    );
    let total = 0;
    for (let i = 0; i < lines.length && i < hdLines.length; i++) {
      const newId = hdLines[i].id;
      if (String(lines[i].hop_dong_chi_tiet_id) !== String(newId)) {
        await query(
          `UPDATE phieu_giao_hang_chi_tiet SET hop_dong_chi_tiet_id = ? WHERE id = ?`,
          [newId, lines[i].id],
        );
        fixedLines++;
      }
      const line = await queryOne(
        `SELECT so_luong_giao FROM phieu_giao_hang_chi_tiet WHERE id = ?`,
        [lines[i].id],
      );
      total += (Number(line?.so_luong_giao) || 0) * (Number(hdLines[i].gia_hop_dong) || 0);
    }
    await query(`UPDATE phieu_giao_hang SET gia_tri_ghi_no = ? WHERE id = ?`, [total, pgh.id]);
  }

  if (fixedLines > 0) {
    console.log(`Schema: repaired ${fixedLines} phieu_giao_hang_chi_tiet hop_dong links`);
  }
}

/** Thêm cột/schema mới cho DB hiện có (idempotent). */
export async function ensureSchema() {
  const cols = await query(
    `SHOW COLUMNS FROM dong_tien_moi LIKE 'ma_giao_dich_ngan_hang'`
  );
  if (cols.length === 0) {
    await query(
      `ALTER TABLE dong_tien_moi
       ADD COLUMN ma_giao_dich_ngan_hang VARCHAR(100) NULL
       COMMENT 'Mã giao dịch từ sao kê ngân hàng'
       AFTER ma_tham_chieu`
    );
    const indexes = await query(
      `SHOW INDEX FROM dong_tien_moi WHERE Key_name = 'idx_dt_ma_ngan_hang'`
    );
    if (indexes.length === 0) {
      await query(
        `CREATE INDEX idx_dt_ma_ngan_hang
         ON dong_tien_moi (tai_khoan_tien_id, ma_giao_dich_ngan_hang)`
      );
    }
    console.log('Schema: added dong_tien_moi.ma_giao_dich_ngan_hang');
  }

  const ckCt = await query(
    `SELECT id, pham_vi FROM hang_muc_thu_chi WHERE ma_hang_muc = 'CK.CTCN' LIMIT 1`
  );
  if (ckCt[0] && !String(ckCt[0].pham_vi || '').trim()) {
    await query(`UPDATE hang_muc_thu_chi SET pham_vi = 'khac' WHERE id = ?`, [ckCt[0].id]);
    console.log('Schema: fixed hang_muc_thu_chi.CK.CTCN pham_vi -> khac');
  }

  await query(
    `CREATE TABLE IF NOT EXISTS app_schema_patches (
      patch_key VARCHAR(100) PRIMARY KEY,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  );

  const chieuCol = await query(`SHOW COLUMNS FROM dong_tien_moi LIKE 'chieu_tien'`);
  if (chieuCol.length === 0) {
    await query(
      `ALTER TABLE dong_tien_moi
       ADD COLUMN chieu_tien ENUM('thu','chi') NULL
       COMMENT 'Chiều tiền đối với tai_khoan_tien khi loại GD là CK nội bộ'
       AFTER loai_giao_dich`
    );
    console.log('Schema: added dong_tien_moi.chieu_tien');
  }

  const ckChieuPatch = await queryOne(
    `SELECT patch_key FROM app_schema_patches WHERE patch_key = 'dong_tien_ck_chieu_v1'`
  );
  if (!ckChieuPatch) {
    await backfillCkChieuTien(true);
    await query(`INSERT INTO app_schema_patches (patch_key) VALUES ('dong_tien_ck_chieu_v1')`);
  }

  const ckChieuPatchV2 = await queryOne(
    `SELECT patch_key FROM app_schema_patches WHERE patch_key = 'dong_tien_ck_chieu_v2'`
  );
  if (!ckChieuPatchV2) {
    await backfillCkChieuTien(false);
    await query(`INSERT INTO app_schema_patches (patch_key) VALUES ('dong_tien_ck_chieu_v2')`);
  }

  const pghHdctPatch = await queryOne(
    `SELECT patch_key FROM app_schema_patches WHERE patch_key = 'pgh_hdct_link_v1'`
  );
  if (!pghHdctPatch) {
    await repairPhieuGiaoHangHdctLinks();
    await query(`INSERT INTO app_schema_patches (patch_key) VALUES ('pgh_hdct_link_v1')`);
  }

  const cauHinhPatch = await queryOne(
    `SELECT patch_key FROM app_schema_patches WHERE patch_key = 'cau_hinh_v1'`,
  );
  if (!cauHinhPatch) {
    await query(
      `CREATE TABLE IF NOT EXISTS cau_hinh (
        \`key\` VARCHAR(191) PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    );
    await query(`INSERT INTO app_schema_patches (patch_key) VALUES ('cau_hinh_v1')`);
    console.log('Schema: created cau_hinh table');
  }

  const adminRolePatch = await queryOne(
    `SELECT patch_key FROM app_schema_patches WHERE patch_key = 'admin_role_col_v1'`,
  );
  if (!adminRolePatch) {
    const adminTable = await queryOne(
      `SELECT TABLE_NAME AS name FROM information_schema.tables
       WHERE table_schema = DATABASE() AND TABLE_NAME = 'Admin'`,
    );
    if (adminTable) {
      const roleCol = await queryOne(
        `SELECT COLUMN_NAME AS name FROM information_schema.columns
         WHERE table_schema = DATABASE() AND table_name = 'Admin' AND COLUMN_NAME = 'role'`,
      );
      if (!roleCol) {
        await query(
          `ALTER TABLE Admin ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'admin' AFTER name`,
        );
        console.log('Schema: added Admin.role column');
      }
    }
    await query(`INSERT INTO app_schema_patches (patch_key) VALUES ('admin_role_col_v1')`);
  }

  const gdrivePatch = await queryOne(
    `SELECT patch_key FROM app_schema_patches WHERE patch_key = 'google_drive_tokens_v1'`
  );
  if (!gdrivePatch) {
    await query(
      `CREATE TABLE IF NOT EXISTS google_drive_tokens (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        access_token TEXT NOT NULL,
        refresh_token TEXT NOT NULL DEFAULT '',
        token_expiry DATETIME NULL,
        google_email VARCHAR(255) DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_gdrive_user (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );
    await query(`INSERT INTO app_schema_patches (patch_key) VALUES ('google_drive_tokens_v1')`);
    console.log('Schema: created google_drive_tokens table');
  }

  const tzPatch = await queryOne(
    `SELECT patch_key FROM app_schema_patches WHERE patch_key = 'dong_tien_ngay_vn_wallclock_v1'`
  );
  if (!tzPatch) {
    const countRow = await queryOne('SELECT COUNT(*) AS n FROM dong_tien_moi');
    const n = Number(countRow?.n || 0);
    if (n > 0) {
      await query(
        `UPDATE dong_tien_moi SET ngay_giao_dich = DATE_ADD(ngay_giao_dich, INTERVAL 7 HOUR)`
      );
      console.log(`Schema: fixed ${n} dong_tien_moi ngay_giao_dich (+7h, bỏ lưu UTC)`);
    }
    await query(
      `INSERT INTO app_schema_patches (patch_key) VALUES ('dong_tien_ngay_vn_wallclock_v1')`
    );
  }
}
