import mysql from "npm:mysql2@3.9.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const MYSQL_CONFIG = {
  host: "194.59.164.103",
  port: 3306,
  user: "u169101909_phamgia",
  password: "Minhtu@23",
  database: "u169101909_phamgia",
};

// Single connection reused for all queries within one request
function createConn() {
  return mysql.createConnection(MYSQL_CONFIG);
}

function q(conn: mysql.Connection, sql: string, params?: any[]): Promise<any[]> {
  return new Promise((resolve, reject) => {
    conn.query(sql, params ?? [], (err: any, results: any) => {
      if (err) reject(err);
      else resolve(Array.isArray(results) ? results : [results]);
    });
  });
}

// Parse Vietnamese date string "dd/mm/yyyy hh:mm:ss" or "dd/mm/yyyy" to "yyyy-mm-dd hh:mm:ss"
function parseVNDate(s: string): string | null {
  if (!s || !s.trim()) return null;
  const trimmed = s.trim();
  const dmyMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{2}:\d{2}:\d{2}))?/);
  if (dmyMatch) {
    const [, d, m, y, t] = dmyMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")} ${t || "00:00:00"}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 10) + " 00:00:00";
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const conn = createConn();
  conn.connect();

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "schema";

    // ── Action: schema ── Create all new tables
    if (action === "schema") {
      const results: { sql: string; status: string; error?: string }[] = [];

      const migrations = [
        // ── Legacy fixes ──────────────────────────────────────────────────────
        `ALTER TABLE phieu_giao_hang_chi_tiet ADD COLUMN IF NOT EXISTS hop_dong_chi_tiet_id INT NULL`,
        `ALTER TABLE phieu_giao_hang_chi_tiet ADD COLUMN IF NOT EXISTS ghi_chu TEXT NULL`,
        `ALTER TABLE phieu_giao_hang_chi_tiet DROP COLUMN IF EXISTS don_gia`,
        `ALTER TABLE phieu_giao_hang_chi_tiet DROP COLUMN IF EXISTS thanh_tien`,
        `ALTER TABLE phieu_giao_hang_chi_tiet DROP COLUMN IF EXISTS ten_san_pham`,
        `ALTER TABLE dong_tien DROP COLUMN IF EXISTS ngay_thuc_hien`,

        // ── tai_khoan_tien ────────────────────────────────────────────────────
        `CREATE TABLE IF NOT EXISTS tai_khoan_tien (
          id INT AUTO_INCREMENT PRIMARY KEY,
          ten_tai_khoan VARCHAR(255) NOT NULL,
          loai_tai_khoan ENUM('tien_mat','ngan_hang','vi_dien_tu','the_tin_dung','khac') NOT NULL DEFAULT 'ngan_hang',
          ngan_hang VARCHAR(100) NULL,
          so_tai_khoan VARCHAR(100) NULL,
          chu_tai_khoan VARCHAR(255) NULL,
          pham_vi ENUM('cong_ty','ca_nhan','dung_chung') NOT NULL DEFAULT 'cong_ty',
          so_du_dau_ky DECIMAL(18,2) NOT NULL DEFAULT 0,
          ngay_so_du_dau_ky DATE NULL,
          trang_thai ENUM('hoat_dong','khong_hoat_dong') NOT NULL DEFAULT 'hoat_dong',
          ghi_chu TEXT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )`,

        // ── hang_muc_thu_chi ──────────────────────────────────────────────────
        `CREATE TABLE IF NOT EXISTS hang_muc_thu_chi (
          id INT AUTO_INCREMENT PRIMARY KEY,
          ma_hang_muc VARCHAR(50) NOT NULL UNIQUE,
          ten_hang_muc VARCHAR(255) NOT NULL,
          loai_giao_dich ENUM('thu','chi','chuyen_khoan_noi_bo','dieu_chinh_so_du','tat_ca') NOT NULL DEFAULT 'chi',
          pham_vi ENUM('cong_ty','ca_nhan','oto','vay_no','khac') NOT NULL DEFAULT 'cong_ty',
          parent_id INT NULL,
          cap_do TINYINT NOT NULL DEFAULT 1,
          tinh_chat ENUM('doanh_thu','gia_von','chi_phi_van_hanh','chi_phi_cong_trinh','cong_no','noi_bo','ca_nhan','khac') NOT NULL DEFAULT 'khac',
          ap_dung_cho_hop_dong TINYINT(1) NOT NULL DEFAULT 0,
          ap_dung_cho_nha_cung_cap TINYINT(1) NOT NULL DEFAULT 0,
          ap_dung_cho_nhan_vien TINYINT(1) NOT NULL DEFAULT 0,
          thu_tu INT NOT NULL DEFAULT 0,
          trang_thai ENUM('hoat_dong','an') NOT NULL DEFAULT 'hoat_dong',
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )`,

        // ── doi_tuong ─────────────────────────────────────────────────────────
        `CREATE TABLE IF NOT EXISTS doi_tuong (
          id INT AUTO_INCREMENT PRIMARY KEY,
          loai_doi_tuong ENUM('khach_hang','nha_cung_cap','nhan_vien','ca_nhan','khac') NOT NULL DEFAULT 'khac',
          ten_doi_tuong VARCHAR(255) NOT NULL,
          ma_so_thue VARCHAR(50) NULL,
          dia_chi TEXT NULL,
          dien_thoai VARCHAR(50) NULL,
          email VARCHAR(255) NULL,
          ghi_chu TEXT NULL,
          trang_thai ENUM('hoat_dong','khong_hoat_dong') NOT NULL DEFAULT 'hoat_dong',
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )`,

        // ── dong_tien_moi ─────────────────────────────────────────────────────
        `CREATE TABLE IF NOT EXISTS dong_tien_moi (
          id INT AUTO_INCREMENT PRIMARY KEY,
          ma_giao_dich VARCHAR(50) NULL UNIQUE,
          ngay_giao_dich DATETIME NULL,
          ngay_hach_toan DATE NULL,
          loai_giao_dich ENUM('thu','chi','chuyen_khoan_noi_bo','dieu_chinh_so_du') NOT NULL,
          tai_khoan_tien_id INT NOT NULL,
          tai_khoan_nhan_id INT NULL,
          so_tien DECIMAL(18,2) NOT NULL DEFAULT 0,
          doi_tuong_id INT NULL,
          khach_hang_id INT NULL,
          nha_cung_cap_id INT NULL,
          hop_dong_id INT NULL,
          hop_dong_mua_id INT NULL,
          hang_muc_thu_chi_id INT NULL,
          mo_ta_giao_dich TEXT NULL,
          so_tai_khoan_doi_ung VARCHAR(100) NULL,
          ten_tai_khoan_doi_ung VARCHAR(255) NULL,
          so_du_sau_giao_dich DECIMAL(18,2) NULL,
          nguon_du_lieu ENUM('nhap_tay','import_excel','migration','api') NOT NULL DEFAULT 'nhap_tay',
          ma_tham_chieu VARCHAR(100) NULL,
          ghi_chu TEXT NULL,
          trang_thai ENUM('hoan_thanh','cho_doi_soat','loi') NOT NULL DEFAULT 'hoan_thanh',
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_ngay_giao_dich (ngay_giao_dich),
          INDEX idx_loai_giao_dich (loai_giao_dich),
          INDEX idx_tai_khoan_tien_id (tai_khoan_tien_id),
          INDEX idx_khach_hang_id (khach_hang_id),
          INDEX idx_nha_cung_cap_id (nha_cung_cap_id),
          INDEX idx_hop_dong_id (hop_dong_id),
          INDEX idx_trang_thai (trang_thai)
        )`,

        // ── dong_tien_file ────────────────────────────────────────────────────
        `CREATE TABLE IF NOT EXISTS dong_tien_file (
          id INT AUTO_INCREMENT PRIMARY KEY,
          dong_tien_id INT NOT NULL,
          ten_file VARCHAR(255) NOT NULL,
          file_url TEXT NULL,
          google_drive_file_id VARCHAR(255) NULL,
          loai_file VARCHAR(50) NULL,
          ghi_chu TEXT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_dong_tien_id (dong_tien_id)
        )`,

        // ── dong_tien_phan_bo ─────────────────────────────────────────────────
        `CREATE TABLE IF NOT EXISTS dong_tien_phan_bo (
          id INT AUTO_INCREMENT PRIMARY KEY,
          dong_tien_id INT NOT NULL,
          hop_dong_id INT NULL,
          hop_dong_mua_id INT NULL,
          khach_hang_id INT NULL,
          nha_cung_cap_id INT NULL,
          hang_muc_thu_chi_id INT NULL,
          so_tien_phan_bo DECIMAL(18,2) NOT NULL DEFAULT 0,
          ghi_chu TEXT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_dong_tien_id (dong_tien_id)
        )`,

        // ── migration_log ─────────────────────────────────────────────────────
        `CREATE TABLE IF NOT EXISTS migration_log (
          id INT AUTO_INCREMENT PRIMARY KEY,
          bang_nguon VARCHAR(100) NOT NULL,
          id_nguon INT NULL,
          ly_do_loi TEXT NOT NULL,
          du_lieu_goc TEXT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`,
      ];

      for (const sql of migrations) {
        try {
          await q(conn, sql);
          results.push({ sql: sql.trim().split("\n")[0].slice(0, 80), status: "ok" });
        } catch (err: any) {
          results.push({ sql: sql.trim().split("\n")[0].slice(0, 80), status: "error", error: err.message });
        }
      }

      conn.end();
      return new Response(JSON.stringify({ action: "schema", results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Action: seed ── Insert sample data
    if (action === "seed") {
      const results: { item: string; status: string; error?: string }[] = [];

      // ── Seed tai_khoan_tien (skip if already has data) ──────────────────────
      try {
        const existing = await q(conn, "SELECT COUNT(*) AS cnt FROM tai_khoan_tien");
        if (Number(existing[0].cnt) > 0) {
          results.push({ item: "tai_khoan_tien", status: "skipped (already has data)" });
        } else {
          const tkList = await q(conn, "SELECT * FROM tai_khoan ORDER BY id");
          for (const tk of tkList) {
            await q(conn,
              `INSERT INTO tai_khoan_tien (ten_tai_khoan, loai_tai_khoan, ngan_hang, so_tai_khoan, pham_vi, so_du_dau_ky, trang_thai)
               VALUES (?, ?, ?, ?, 'cong_ty', 0, 'hoat_dong')`,
              [tk.ten_tai_khoan, tk.ngan_hang ? "ngan_hang" : "tien_mat", tk.ngan_hang || null, tk.so_tai_khoan || null]
            );
          }
          results.push({ item: "tai_khoan_tien from tai_khoan", status: "ok" });
        }
      } catch (err: any) {
        results.push({ item: "tai_khoan_tien", status: "error", error: err.message });
      }

      // ── Seed hang_muc_thu_chi ───────────────────────────────────────────────
      try {
        const existing = await q(conn, "SELECT COUNT(*) AS cnt FROM hang_muc_thu_chi");
        if (Number(existing[0].cnt) > 0) {
          results.push({ item: "hang_muc_thu_chi", status: "skipped (already has data)" });
        } else {
          async function ins(
            ma: string, ten: string, loai: string, phamVi: string,
            parentId: number | null, capDo: number, tinhChat: string,
            thuTu: number, apDungHD = 0, apDungNCC = 0
          ): Promise<number> {
            const r = await q(conn,
              `INSERT INTO hang_muc_thu_chi (ma_hang_muc, ten_hang_muc, loai_giao_dich, pham_vi, parent_id, cap_do, tinh_chat, thu_tu, ap_dung_cho_hop_dong, ap_dung_cho_nha_cung_cap)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [ma, ten, loai, phamVi, parentId, capDo, tinhChat, thuTu, apDungHD, apDungNCC]
            );
            return parseInt(String((r as any)[0]?.insertId ?? (r as any).insertId));
          }

          // Chi - Công ty
          const chiCT = await ins("CHI.CT", "Chi phí công ty", "chi", "cong_ty", null, 1, "khac", 10);
          const chiHD = await ins("CHI.CT.HD", "Chi phí hợp đồng / công trình", "chi", "cong_ty", chiCT, 2, "chi_phi_cong_trinh", 11, 1, 1);
          await ins("CHI.CT.HD.VT", "Vật tư", "chi", "cong_ty", chiHD, 3, "chi_phi_cong_trinh", 1, 1, 1);
          await ins("CHI.CT.HD.NC", "Nhân công", "chi", "cong_ty", chiHD, 3, "chi_phi_cong_trinh", 2, 1, 0);
          await ins("CHI.CT.HD.VC", "Vận chuyển", "chi", "cong_ty", chiHD, 3, "chi_phi_cong_trinh", 3, 1, 1);
          await ins("CHI.CT.HD.MM", "Máy móc / thiết bị", "chi", "cong_ty", chiHD, 3, "chi_phi_cong_trinh", 4, 1, 1);
          await ins("CHI.CT.HD.TN", "Thí nghiệm / kiểm định", "chi", "cong_ty", chiHD, 3, "chi_phi_cong_trinh", 5, 1, 1);
          await ins("CHI.CT.HD.HG", "Hồ sơ / giấy tờ công trình", "chi", "cong_ty", chiHD, 3, "chi_phi_cong_trinh", 6, 1, 0);
          await ins("CHI.CT.HD.CPDA", "Chi phí mềm / hỗ trợ dự án", "chi", "cong_ty", chiHD, 3, "chi_phi_cong_trinh", 7, 1, 0);
          const chiVH = await ins("CHI.CT.VH", "Chi phí vận hành công ty", "chi", "cong_ty", chiCT, 2, "chi_phi_van_hanh", 12);
          await ins("CHI.CT.VH.VP", "Văn phòng phẩm", "chi", "cong_ty", chiVH, 3, "chi_phi_van_hanh", 1);
          await ins("CHI.CT.VH.DN", "Điện, nước, internet", "chi", "cong_ty", chiVH, 3, "chi_phi_van_hanh", 2);
          await ins("CHI.CT.VH.DT", "Cước điện thoại", "chi", "cong_ty", chiVH, 3, "chi_phi_van_hanh", 3);
          await ins("CHI.CT.VH.PM", "Phần mềm / hosting / tên miền", "chi", "cong_ty", chiVH, 3, "chi_phi_van_hanh", 4);
          await ins("CHI.CT.VH.KT", "Kế toán / kiểm toán", "chi", "cong_ty", chiVH, 3, "chi_phi_van_hanh", 5);
          await ins("CHI.CT.VH.THUE", "Thuế, phí, lệ phí", "chi", "cong_ty", chiVH, 3, "chi_phi_van_hanh", 6);
          await ins("CHI.CT.VH.BHXH", "BHXH / bảo hiểm nhân viên", "chi", "cong_ty", chiVH, 3, "chi_phi_van_hanh", 7);
          await ins("CHI.CT.VH.PHNH", "Phí ngân hàng", "chi", "cong_ty", chiVH, 3, "chi_phi_van_hanh", 8);
          await ins("CHI.CT.VH.THUEMB", "Thuê xưởng / mặt bằng", "chi", "cong_ty", chiVH, 3, "chi_phi_van_hanh", 9);
          await ins("CHI.CT.VH.SC", "Sửa chữa tài sản", "chi", "cong_ty", chiVH, 3, "chi_phi_van_hanh", 10);
          await ins("CHI.CT.VH.LUONG", "Lương / thưởng nhân viên", "chi", "cong_ty", chiVH, 3, "chi_phi_van_hanh", 11);
          const chiBH = await ins("CHI.CT.BH", "Chi phí bán hàng / khách hàng", "chi", "cong_ty", chiCT, 2, "chi_phi_van_hanh", 13);
          await ins("CHI.CT.BH.TK", "Tiếp khách", "chi", "cong_ty", chiBH, 3, "chi_phi_van_hanh", 1);
          await ins("CHI.CT.BH.QB", "Quà biếu", "chi", "cong_ty", chiBH, 3, "chi_phi_van_hanh", 2);
          await ins("CHI.CT.BH.MKT", "Marketing / bán hàng", "chi", "cong_ty", chiBH, 3, "chi_phi_van_hanh", 3);
          await ins("CHI.CT.BH.HS", "Hồ sơ thầu / báo giá", "chi", "cong_ty", chiBH, 3, "chi_phi_van_hanh", 4);
          await ins("CHI.CT.BH.HTDA", "Hỗ trợ dự án / quan hệ KH", "chi", "cong_ty", chiBH, 3, "chi_phi_van_hanh", 5);
          await ins("CHI.CT.KHAC", "Chi phí công ty khác", "chi", "cong_ty", chiCT, 2, "khac", 99);

          // Chi - Cá nhân
          const chiCN = await ins("CHI.CN", "Chi phí cá nhân", "chi", "ca_nhan", null, 1, "ca_nhan", 20);
          await ins("CHI.CN.AN", "Ăn uống", "chi", "ca_nhan", chiCN, 2, "ca_nhan", 1);
          await ins("CHI.CN.SH", "Sinh hoạt", "chi", "ca_nhan", chiCN, 2, "ca_nhan", 2);
          await ins("CHI.CN.THUENHA", "Thuê nhà / tiền nhà", "chi", "ca_nhan", chiCN, 2, "ca_nhan", 3);
          await ins("CHI.CN.SK", "Sức khỏe / thuốc", "chi", "ca_nhan", chiCN, 2, "ca_nhan", 4);
          await ins("CHI.CN.QA", "Quần áo", "chi", "ca_nhan", chiCN, 2, "ca_nhan", 5);
          await ins("CHI.CN.DL", "Du lịch", "chi", "ca_nhan", chiCN, 2, "ca_nhan", 6);
          await ins("CHI.CN.GT", "Giải trí / nhậu", "chi", "ca_nhan", chiCN, 2, "ca_nhan", 7);
          await ins("CHI.CN.BH", "Bảo hiểm cá nhân", "chi", "ca_nhan", chiCN, 2, "ca_nhan", 8);
          await ins("CHI.CN.KHAC", "Chi cá nhân khác", "chi", "ca_nhan", chiCN, 2, "ca_nhan", 99);

          // Chi - Ô tô
          const chiOto = await ins("CHI.OTO", "Chi phí ô tô", "chi", "oto", null, 1, "ca_nhan", 30);
          await ins("CHI.OTO.XANG", "Xăng dầu", "chi", "oto", chiOto, 2, "ca_nhan", 1);
          await ins("CHI.OTO.BD", "Bảo dưỡng / sửa chữa", "chi", "oto", chiOto, 2, "ca_nhan", 2);
          await ins("CHI.OTO.GX", "Gửi xe / đậu xe", "chi", "oto", chiOto, 2, "ca_nhan", 3);
          await ins("CHI.OTO.VETC", "VETC / phí đường bộ", "chi", "oto", chiOto, 2, "ca_nhan", 4);
          await ins("CHI.OTO.BHXE", "Bảo hiểm xe", "chi", "oto", chiOto, 2, "ca_nhan", 5);
          await ins("CHI.OTO.DK", "Đăng kiểm / đăng ký", "chi", "oto", chiOto, 2, "ca_nhan", 6);
          await ins("CHI.OTO.PHAT", "Phạt giao thông", "chi", "oto", chiOto, 2, "ca_nhan", 7);
          await ins("CHI.OTO.TRAGOP", "Trả góp xe", "chi", "oto", chiOto, 2, "ca_nhan", 8);
          await ins("CHI.OTO.MUAXE", "Mua xe", "chi", "oto", chiOto, 2, "ca_nhan", 9);
          await ins("CHI.OTO.KHAC", "Chi phí ô tô khác", "chi", "oto", chiOto, 2, "ca_nhan", 99);

          // Vay nợ
          const vayNo = await ins("VAINO", "Vay nợ / tài chính", "tat_ca", "vay_no", null, 1, "cong_no", 40);
          await ins("VAINO.VAOVAO", "Vay vào", "thu", "vay_no", vayNo, 2, "cong_no", 1);
          await ins("VAINO.CHOMUON", "Cho vay / cho mượn", "chi", "vay_no", vayNo, 2, "cong_no", 2);
          await ins("VAINO.TRAGOC", "Trả gốc vay", "chi", "vay_no", vayNo, 2, "cong_no", 3);
          await ins("VAINO.TRALAI", "Trả lãi vay", "chi", "vay_no", vayNo, 2, "cong_no", 4);
          await ins("VAINO.THUHOI", "Thu hồi cho vay", "thu", "vay_no", vayNo, 2, "cong_no", 5);
          await ins("VAINO.PHIVAY", "Phí vay / phí ngân hàng", "chi", "vay_no", vayNo, 2, "cong_no", 6);

          // Thu
          const thu = await ins("THU", "Thu", "thu", "cong_ty", null, 1, "doanh_thu", 50);
          await ins("THU.BH", "Thu bán hàng", "thu", "cong_ty", thu, 2, "doanh_thu", 1);
          await ins("THU.HD", "Thu theo hợp đồng", "thu", "cong_ty", thu, 2, "doanh_thu", 2, 1, 0);
          await ins("THU.TU", "Khách hàng tạm ứng", "thu", "cong_ty", thu, 2, "cong_no", 3, 1, 0);
          await ins("THU.CN_KH", "Thu công nợ khách hàng", "thu", "cong_ty", thu, 2, "cong_no", 4, 1, 0);
          await ins("THU.HUOU", "Thu hoàn ứng nhân viên", "thu", "cong_ty", thu, 2, "noi_bo", 5);
          await ins("THU.NCC", "Nhà cung cấp hoàn tiền", "thu", "cong_ty", thu, 2, "cong_no", 6, 0, 1);
          await ins("THU.LAINH", "Lãi ngân hàng", "thu", "cong_ty", thu, 2, "doanh_thu", 7);
          await ins("THU.KHAC", "Thu khác", "thu", "khac", thu, 2, "khac", 99);

          // Chuyển khoản nội bộ
          const ck = await ins("CK", "Chuyển khoản nội bộ", "chuyen_khoan_noi_bo", "cong_ty", null, 1, "noi_bo", 60);
          await ins("CK.RUT", "Rút tiền ngân hàng về quỹ", "chuyen_khoan_noi_bo", "cong_ty", ck, 2, "noi_bo", 1);
          await ins("CK.NOP", "Nộp tiền mặt vào ngân hàng", "chuyen_khoan_noi_bo", "cong_ty", ck, 2, "noi_bo", 2);
          await ins("CK.NH", "Chuyển giữa các ngân hàng", "chuyen_khoan_noi_bo", "cong_ty", ck, 2, "noi_bo", 3);
          await ins("CK.CTCN", "Chuyển giữa TK công ty và cá nhân", "chuyen_khoan_noi_bo", "dung_chung", ck, 2, "noi_bo", 4);

          results.push({ item: "hang_muc_thu_chi seed", status: "ok" });
        }
      } catch (err: any) {
        results.push({ item: "hang_muc_thu_chi", status: "error", error: err.message });
      }

      conn.end();
      return new Response(JSON.stringify({ action: "seed", results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Action: migrate ── Copy old dong_tien to dong_tien_moi in batches
    if (action === "migrate") {
      const batchSize = parseInt(url.searchParams.get("batch_size") || "200");
      const offset = parseInt(url.searchParams.get("offset") || "0");

      const rows = await q(conn,
        `SELECT dt.*, tkt.id AS tkt_id FROM dong_tien dt
         LEFT JOIN tai_khoan tk ON tk.id = dt.tai_khoan_id
         LEFT JOIN tai_khoan_tien tkt ON (
           tkt.so_tai_khoan = tk.so_tai_khoan OR tkt.ten_tai_khoan = tk.ten_tai_khoan
         )
         LIMIT ? OFFSET ?`,
        [batchSize, offset]
      );

      // Get total count (just once, at offset 0)
      let total: number | undefined;
      if (offset === 0) {
        const countRes = await q(conn, "SELECT COUNT(*) AS cnt FROM dong_tien");
        total = Number(countRes[0].cnt);
      }

      let success = 0, errors = 0;
      const errorDetails: any[] = [];

      for (const row of rows) {
        try {
          const ghiNo = Number(row.ghi_no) || 0;
          const ghiCo = Number(row.ghi_co) || 0;
          let loaiGD = "dieu_chinh_so_du";
          let soTien = 0;
          if (ghiNo > 0) { loaiGD = "chi"; soTien = ghiNo; }
          else if (ghiCo > 0) { loaiGD = "thu"; soTien = ghiCo; }

          const rawDate = String(row.ngay_gio_giao_dich || "");
          const ngayGD = parseVNDate(rawDate);

          if (!ngayGD) {
            await q(conn,
              `INSERT INTO migration_log (bang_nguon, id_nguon, ly_do_loi, du_lieu_goc) VALUES ('dong_tien', ?, 'Ngày không hợp lệ', ?)`,
              [row.id, rawDate]
            );
          }

          const tktId = row.tkt_id || null;
          if (!tktId) {
            await q(conn,
              `INSERT INTO migration_log (bang_nguon, id_nguon, ly_do_loi, du_lieu_goc) VALUES ('dong_tien', ?, 'Không tìm thấy tai_khoan_tien', ?)`,
              [row.id, String(row.tai_khoan_id)]
            );
          }

          await q(conn,
            `INSERT IGNORE INTO dong_tien_moi
             (ma_tham_chieu, ngay_giao_dich, ngay_hach_toan, loai_giao_dich, tai_khoan_tien_id, so_tien,
              khach_hang_id, nha_cung_cap_id, hop_dong_id, hop_dong_mua_id,
              mo_ta_giao_dich, so_tai_khoan_doi_ung, ten_tai_khoan_doi_ung,
              so_du_sau_giao_dich, nguon_du_lieu, ghi_chu, trang_thai)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'migration', ?, 'hoan_thanh')`,
            [
              `OLD-${row.id}`,
              ngayGD,
              ngayGD ? ngayGD.slice(0, 10) : null,
              loaiGD,
              tktId || 1,
              soTien,
              row.khach_hang_id || null,
              row.nha_cung_cap_id || null,
              row.hop_dong_id || null,
              row.hop_dong_mua_id || null,
              row.mo_ta_giao_dich || null,
              row.tk_doi_ung || null,
              row.ten_tk_doi_ung || null,
              Number(row.so_du) || null,
              row.ghi_chu || null,
            ]
          );
          success++;
        } catch (err: any) {
          errors++;
          errorDetails.push({ id: row.id, error: err.message });
          await q(conn,
            `INSERT INTO migration_log (bang_nguon, id_nguon, ly_do_loi, du_lieu_goc) VALUES ('dong_tien', ?, ?, ?)`,
            [row.id, err.message, JSON.stringify(row).slice(0, 500)]
          ).catch(() => {});
        }
      }

      conn.end();
      return new Response(JSON.stringify({
        action: "migrate",
        offset,
        batch_size: batchSize,
        rows_processed: rows.length,
        success,
        errors,
        error_details: errorDetails,
        total,
        has_more: rows.length === batchSize,
        next_offset: offset + batchSize,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    conn.end();
    return new Response(JSON.stringify({ error: "Unknown action. Use ?action=schema|seed|migrate" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    conn.end();
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
