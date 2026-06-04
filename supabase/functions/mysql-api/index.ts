import mysql from "npm:mysql2@3.9.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const MYSQL_CONFIG = {
  host: "194.59.164.103",
  port: 3306,
  user: "u169101909_phamgia",
  password: "Minhtu@23",
  database: "u169101909_phamgia",
};

// Use a single persistent connection to avoid exceeding max_connections_per_hour
let _conn: mysql.Connection | null = null;
let _connBusy = false;

function getConn(): mysql.Connection {
  if (!_conn || (_conn as any)._closing || (_conn as any)._closed) {
    _conn = mysql.createConnection({
      ...MYSQL_CONFIG,
      connectTimeout: 10000,
    });
    _conn.connect();
  }
  return _conn;
}

async function query(sql: string, params?: any[]): Promise<any[]> {
  // Serialize queries so the single connection isn't used concurrently
  while (_connBusy) {
    await new Promise((r) => setTimeout(r, 5));
  }
  _connBusy = true;
  try {
    const conn = getConn();
    return await new Promise((resolve, reject) => {
      conn.query(sql, params ?? [], (err: any, results: any) => {
        if (err) reject(err);
        else resolve(Array.isArray(results) ? results : [results]);
      });
    });
  } finally {
    _connBusy = false;
  }
}

async function queryOne(sql: string, params?: any[]): Promise<any | null> {
  const rows = await query(sql, params);
  return rows[0] || null;
}

function parsePath(url: string): string {
  const pathname = new URL(url).pathname;
  // The path inside the edge function may be /mysql-api/... or /functions/v1/mysql-api/...
  let path = pathname.replace(/^\/functions\/v1\/mysql-api/, "");
  path = path.replace(/^\/mysql-api/, "");
  return path || "/";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const path = parsePath(req.url);
    const method = req.method;

    // Health check
    if (path === "/" || path === "") {
      return new Response(JSON.stringify({ status: "ok", service: "mysql-api" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Test connection
    if (path === "/ping" && method === "GET") {
      await query("SELECT 1 AS ok");
      return new Response(JSON.stringify({ status: "ok", message: "MySQL connected" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===================== KHACH HANG =====================
    if (path === "/khach-hang" && method === "GET") {
      const urlObj = new URL(req.url);
      const search = urlObj.searchParams.get("search") || "";
      const page = parseInt(urlObj.searchParams.get("page") || "1");
      const limit = parseInt(urlObj.searchParams.get("limit") || "20");
      const offset = (page - 1) * limit;

      let where = "";
      const params: any[] = [];
      if (search) {
        where = "WHERE ten_cong_ty LIKE ? OR ma_so_thue LIKE ? OR dien_thoai LIKE ?";
        const s = `%${search}%`;
        params.push(s, s, s);
      }

      const countRow = await queryOne(`SELECT COUNT(*) AS total FROM khach_hang ${where}`, params);
      const rows = await query(
        `SELECT * FROM khach_hang ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );

      return new Response(JSON.stringify({ data: rows, total: countRow?.total || 0, page, limit }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (path === "/khach-hang" && method === "POST") {
      const body = await req.json();
      const result = await query(
        `INSERT INTO khach_hang (ten_cong_ty, ma_so_thue, dia_chi, dien_thoai, email, tai_khoan_ngan_hang, nguoi_dai_dien, chuc_vu) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [body.ten_cong_ty, body.ma_so_thue || '', body.dia_chi || '', body.dien_thoai || '', body.email || '', body.tai_khoan_ngan_hang || '', body.nguoi_dai_dien || '', body.chuc_vu || '']
      );
      const newRow = await queryOne("SELECT * FROM khach_hang WHERE id = ?", [parseInt(String((result as any)[0]?.insertId ?? (result as any).insertId))]);
      return new Response(JSON.stringify({ data: newRow }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (path.match(/^\/khach-hang\/\d+$/) && method === "GET") {
      const id = path.split("/")[2];
      const row = await queryOne("SELECT * FROM khach_hang WHERE id = ?", [id]);
      if (!row) return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ data: row }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (path.match(/^\/khach-hang\/\d+$/) && method === "PUT") {
      const id = path.split("/")[2];
      const body = await req.json();
      await query(
        `UPDATE khach_hang SET ten_cong_ty=?, ma_so_thue=?, dia_chi=?, dien_thoai=?, email=?, tai_khoan_ngan_hang=?, nguoi_dai_dien=?, chuc_vu=? WHERE id=?`,
        [body.ten_cong_ty, body.ma_so_thue || '', body.dia_chi || '', body.dien_thoai || '', body.email || '', body.tai_khoan_ngan_hang || '', body.nguoi_dai_dien || '', body.chuc_vu || '', id]
      );
      const updated = await queryOne("SELECT * FROM khach_hang WHERE id = ?", [id]);
      return new Response(JSON.stringify({ data: updated }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (path.match(/^\/khach-hang\/\d+$/) && method === "DELETE") {
      const id = path.split("/")[2];
      await query("DELETE FROM khach_hang WHERE id = ?", [id]);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===================== BAO GIA =====================
    if (path === "/bao-gia" && method === "GET") {
      // Schema migration: rename gia_ban_co_ban → gia_ban_chua_van_chuyen, add chi_phi_van_chuyen_phan_bo
      try { await query("ALTER TABLE bao_gia_chi_tiet RENAME COLUMN gia_ban_co_ban TO gia_ban_chua_van_chuyen"); } catch (_) {}
      try { await query("ALTER TABLE bao_gia_chi_tiet ADD COLUMN IF NOT EXISTS gia_ban_chua_van_chuyen DECIMAL(15,2) NOT NULL DEFAULT 0"); } catch (_) {}
      try { await query("ALTER TABLE bao_gia_chi_tiet ADD COLUMN IF NOT EXISTS chi_phi_van_chuyen_phan_bo DECIMAL(15,2) NOT NULL DEFAULT 0"); } catch (_) {}
      const urlObj = new URL(req.url);
      const search = urlObj.searchParams.get("search") || "";
      const khachHangId = urlObj.searchParams.get("khach_hang_id") || "";
      const mauBaoGia = urlObj.searchParams.get("mau_bao_gia") || "";
      const dateFrom = urlObj.searchParams.get("date_from") || "";
      const dateTo = urlObj.searchParams.get("date_to") || "";
      const page = parseInt(urlObj.searchParams.get("page") || "1");
      const limit = parseInt(urlObj.searchParams.get("limit") || "20");
      const offset = (page - 1) * limit;

      const conditions: string[] = [];
      const params: any[] = [];

      if (search) {
        conditions.push("(bg.so_bao_gia LIKE ? OR bg.ten_du_an LIKE ? OR kh.ten_cong_ty LIKE ?)");
        const s = `%${search}%`;
        params.push(s, s, s);
      }
      if (khachHangId) { conditions.push("bg.khach_hang_id = ?"); params.push(khachHangId); }
      if (mauBaoGia) { conditions.push("bg.mau_bao_gia = ?"); params.push(mauBaoGia); }
      if (dateFrom) { conditions.push("bg.ngay_bao_gia >= ?"); params.push(dateFrom); }
      if (dateTo) { conditions.push("bg.ngay_bao_gia <= ?"); params.push(dateTo); }

      const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";

      const countRow = await queryOne(
        `SELECT COUNT(*) AS total FROM bao_gia bg LEFT JOIN khach_hang kh ON bg.khach_hang_id = kh.id ${where}`,
        params
      );
      const rows = await query(
        `SELECT bg.*, kh.ten_cong_ty FROM bao_gia bg LEFT JOIN khach_hang kh ON bg.khach_hang_id = kh.id ${where} ORDER BY bg.id DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );

      return new Response(JSON.stringify({ data: rows, total: countRow?.total || 0, page, limit }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (path === "/bao-gia" && method === "POST") {
      const body = await req.json();
      const result = await query(
        `INSERT INTO bao_gia (so_bao_gia, ngay_bao_gia, khach_hang_id, ten_du_an, phien_ban, mau_bao_gia, che_do_van_chuyen, phi_van_chuyen, ten_folder_du_an, id_folder_du_an, hop_dong_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [body.so_bao_gia, body.ngay_bao_gia, body.khach_hang_id, body.ten_du_an || '', body.phien_ban || 1, body.mau_bao_gia || 'Hapulico', body.che_do_van_chuyen || 0, body.phi_van_chuyen || 0, body.ten_folder_du_an || '', body.id_folder_du_an || '', body.hop_dong_id || null]
      );
      const baoGiaId = Number(parseInt(String((result as any)[0]?.insertId ?? (result as any).insertId)));

      if (body.chi_tiet && body.chi_tiet.length > 0) {
        for (const ct of body.chi_tiet) {
          const giaChuaVC = ct.gia_ban_chua_van_chuyen ?? ct.gia_ban_co_ban ?? ct.gia_ban_thuc_te ?? 0;
          const chiPhiVC = ct.chi_phi_van_chuyen_phan_bo ?? 0;
          await query(
            `INSERT INTO bao_gia_chi_tiet (bao_gia_id, ten_san_pham, don_vi, so_luong, don_gia_von, lai_suat_phan_tram, gia_ban_chua_van_chuyen, chi_phi_van_chuyen_phan_bo, gia_ban_thuc_te, thue_suat) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [baoGiaId, ct.ten_san_pham, ct.don_vi || '', ct.so_luong || 0, ct.don_gia_von || 0, ct.lai_suat_phan_tram || 0, giaChuaVC, chiPhiVC, giaChuaVC + chiPhiVC, ct.thue_suat || 10]
          );
        }
      }

      const newRow = await queryOne("SELECT * FROM bao_gia WHERE id = ?", [baoGiaId]);
      return new Response(JSON.stringify({ data: newRow }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (path.match(/^\/bao-gia\/\d+$/) && method === "GET") {
      try { await query("ALTER TABLE bao_gia_chi_tiet RENAME COLUMN gia_ban_co_ban TO gia_ban_chua_van_chuyen"); } catch (_) {}
      try { await query("ALTER TABLE bao_gia_chi_tiet ADD COLUMN IF NOT EXISTS gia_ban_chua_van_chuyen DECIMAL(15,2) NOT NULL DEFAULT 0"); } catch (_) {}
      try { await query("ALTER TABLE bao_gia_chi_tiet ADD COLUMN IF NOT EXISTS chi_phi_van_chuyen_phan_bo DECIMAL(15,2) NOT NULL DEFAULT 0"); } catch (_) {}
      const id = path.split("/")[2];
      const bg = await queryOne("SELECT bg.*, kh.ten_cong_ty FROM bao_gia bg LEFT JOIN khach_hang kh ON bg.khach_hang_id = kh.id WHERE bg.id = ?", [id]);
      if (!bg) return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const chiTiet = await query("SELECT * FROM bao_gia_chi_tiet WHERE bao_gia_id = ?", [id]);
      return new Response(JSON.stringify({ data: { ...bg, chi_tiet: chiTiet } }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (path.match(/^\/bao-gia\/\d+$/) && method === "PUT") {
      const id = path.split("/")[2];
      const body = await req.json();
      await query(
        `UPDATE bao_gia SET so_bao_gia=?, ngay_bao_gia=?, khach_hang_id=?, ten_du_an=?, phien_ban=?, mau_bao_gia=?, che_do_van_chuyen=?, phi_van_chuyen=?, ten_folder_du_an=?, id_folder_du_an=?, hop_dong_id=? WHERE id=?`,
        [body.so_bao_gia, body.ngay_bao_gia, body.khach_hang_id, body.ten_du_an || '', body.phien_ban || 1, body.mau_bao_gia || 'Hapulico', body.che_do_van_chuyen || 0, body.phi_van_chuyen || 0, body.ten_folder_du_an || '', body.id_folder_du_an || '', body.hop_dong_id || null, id]
      );

      if (body.chi_tiet) {
        await query("DELETE FROM bao_gia_chi_tiet WHERE bao_gia_id = ?", [id]);
        for (const ct of body.chi_tiet) {
          const giaChuaVC = ct.gia_ban_chua_van_chuyen ?? ct.gia_ban_co_ban ?? ct.gia_ban_thuc_te ?? 0;
          const chiPhiVC = ct.chi_phi_van_chuyen_phan_bo ?? 0;
          await query(
            `INSERT INTO bao_gia_chi_tiet (bao_gia_id, ten_san_pham, don_vi, so_luong, don_gia_von, lai_suat_phan_tram, gia_ban_chua_van_chuyen, chi_phi_van_chuyen_phan_bo, gia_ban_thuc_te, thue_suat) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, ct.ten_san_pham, ct.don_vi || '', ct.so_luong || 0, ct.don_gia_von || 0, ct.lai_suat_phan_tram || 0, giaChuaVC, chiPhiVC, giaChuaVC + chiPhiVC, ct.thue_suat || 10]
          );
        }
      }

      const updated = await queryOne("SELECT * FROM bao_gia WHERE id = ?", [id]);
      return new Response(JSON.stringify({ data: updated }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (path.match(/^\/bao-gia\/\d+$/) && method === "DELETE") {
      const id = path.split("/")[2];
      await query("DELETE FROM bao_gia_chi_tiet WHERE bao_gia_id = ?", [id]);
      await query("DELETE FROM bao_gia WHERE id = ?", [id]);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===================== HOP DONG =====================
    if (path === "/hop-dong" && method === "GET") {
      const urlObj = new URL(req.url);
      const search = urlObj.searchParams.get("search") || "";
      const khachHangId = urlObj.searchParams.get("khach_hang_id") || "";
      const trangThai = urlObj.searchParams.get("trang_thai") || "";
      const dateFrom = urlObj.searchParams.get("date_from") || "";
      const dateTo = urlObj.searchParams.get("date_to") || "";
      const page = parseInt(urlObj.searchParams.get("page") || "1");
      const limit = parseInt(urlObj.searchParams.get("limit") || "20");
      const offset = (page - 1) * limit;

      const conditions: string[] = [];
      const params: any[] = [];

      if (search) {
        conditions.push("(hd.so_hop_dong LIKE ? OR hd.ten_du_an LIKE ? OR kh.ten_cong_ty LIKE ?)");
        const s = `%${search}%`;
        params.push(s, s, s);
      }
      if (khachHangId) { conditions.push("hd.khach_hang_id = ?"); params.push(khachHangId); }
      if (trangThai) { conditions.push("hd.trang_thai = ?"); params.push(trangThai); }
      if (dateFrom) { conditions.push("hd.ngay_hop_dong >= ?"); params.push(dateFrom); }
      if (dateTo) { conditions.push("hd.ngay_hop_dong <= ?"); params.push(dateTo); }

      const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";

      const countRow = await queryOne(
        `SELECT COUNT(*) AS total FROM hop_dong hd LEFT JOIN khach_hang kh ON hd.khach_hang_id = kh.id ${where}`,
        params
      );
      const rows = await query(
        `SELECT hd.*, kh.ten_cong_ty FROM hop_dong hd LEFT JOIN khach_hang kh ON hd.khach_hang_id = kh.id ${where} ORDER BY hd.id DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );

      return new Response(JSON.stringify({ data: rows, total: countRow?.total || 0, page, limit }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (path === "/hop-dong" && method === "POST") {
      const body = await req.json();
      const result = await query(
        `INSERT INTO hop_dong (khach_hang_id, ten_du_an, so_hop_dong, ngay_hop_dong, file_hop_dong_id, mo_ta_noi_dung, trang_thai, phi_van_chuyen, che_do_van_chuyen) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [body.khach_hang_id, body.ten_du_an || '', body.so_hop_dong, body.ngay_hop_dong, body.file_hop_dong_id || '', body.mo_ta_noi_dung || '', body.trang_thai || 'Hieu luc', body.phi_van_chuyen || 0, body.che_do_van_chuyen || 0]
      );
      const hopDongId = parseInt(String((result as any)[0]?.insertId ?? (result as any).insertId));

      if (body.chi_tiet && body.chi_tiet.length > 0) {
        for (const ct of body.chi_tiet) {
          await query(
            `INSERT INTO hop_dong_chi_tiet (hop_dong_id, ten_san_pham, don_vi, so_luong, don_gia_von, gia_ban_thuc_te, thue_suat, chenh_lech_phan_tram, gia_hop_dong) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [hopDongId, ct.ten_san_pham, ct.don_vi || '', ct.so_luong || 0, ct.don_gia_von || 0, ct.gia_ban_thuc_te || 0, ct.thue_suat || 10, ct.chenh_lech_phan_tram || 0, ct.gia_hop_dong || 0]
          );
        }
      }

      const newRow = await queryOne("SELECT * FROM hop_dong WHERE id = ?", [hopDongId]);
      return new Response(JSON.stringify({ data: newRow }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (path.match(/^\/hop-dong\/\d+$/) && method === "GET") {
      const id = path.split("/")[2];
      const hd = await queryOne("SELECT hd.*, kh.ten_cong_ty FROM hop_dong hd LEFT JOIN khach_hang kh ON hd.khach_hang_id = kh.id WHERE hd.id = ?", [id]);
      if (!hd) return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const chiTiet = await query("SELECT * FROM hop_dong_chi_tiet WHERE hop_dong_id = ?", [id]);
      return new Response(JSON.stringify({ data: { ...hd, chi_tiet: chiTiet } }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (path.match(/^\/hop-dong\/\d+$/) && method === "PUT") {
      const id = path.split("/")[2];
      const body = await req.json();
      await query(
        `UPDATE hop_dong SET khach_hang_id=?, ten_du_an=?, so_hop_dong=?, ngay_hop_dong=?, file_hop_dong_id=?, mo_ta_noi_dung=?, trang_thai=?, phi_van_chuyen=?, che_do_van_chuyen=? WHERE id=?`,
        [body.khach_hang_id, body.ten_du_an || '', body.so_hop_dong, body.ngay_hop_dong, body.file_hop_dong_id || '', body.mo_ta_noi_dung || '', body.trang_thai || 'Hieu luc', body.phi_van_chuyen || 0, body.che_do_van_chuyen || 0, id]
      );

      if (body.chi_tiet) {
        await query("DELETE FROM hop_dong_chi_tiet WHERE hop_dong_id = ?", [id]);
        for (const ct of body.chi_tiet) {
          await query(
            `INSERT INTO hop_dong_chi_tiet (hop_dong_id, ten_san_pham, don_vi, so_luong, don_gia_von, gia_ban_thuc_te, thue_suat, chenh_lech_phan_tram, gia_hop_dong) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, ct.ten_san_pham, ct.don_vi || '', ct.so_luong || 0, ct.don_gia_von || 0, ct.gia_ban_thuc_te || 0, ct.thue_suat || 10, ct.chenh_lech_phan_tram || 0, ct.gia_hop_dong || 0]
          );
        }
      }

      const updated = await queryOne("SELECT * FROM hop_dong WHERE id = ?", [id]);
      return new Response(JSON.stringify({ data: updated }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (path.match(/^\/hop-dong\/\d+$/) && method === "DELETE") {
      const id = path.split("/")[2];
      await query("DELETE FROM hop_dong_chi_tiet WHERE hop_dong_id = ?", [id]);
      await query("DELETE FROM hop_dong WHERE id = ?", [id]);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===================== PHIEU GIAO HANG =====================
    if (path === "/phieu-giao-hang" && method === "GET") {
      const urlObj = new URL(req.url);
      const search = urlObj.searchParams.get("search") || "";
      const khachHangId = urlObj.searchParams.get("khach_hang_id") || "";
      const hopDongId = urlObj.searchParams.get("hop_dong_id") || "";
      const dateFrom = urlObj.searchParams.get("date_from") || "";
      const dateTo = urlObj.searchParams.get("date_to") || "";
      const page = parseInt(urlObj.searchParams.get("page") || "1");
      const limit = parseInt(urlObj.searchParams.get("limit") || "20");
      const offset = (page - 1) * limit;

      const conditions: string[] = [];
      const params: any[] = [];

      if (search) {
        conditions.push("(pgh.so_phieu LIKE ? OR pgh.noi_dung LIKE ?)");
        const s = `%${search}%`;
        params.push(s, s);
      }
      if (khachHangId) { conditions.push("pgh.khach_hang_id = ?"); params.push(khachHangId); }
      if (hopDongId) { conditions.push("pgh.hop_dong_id = ?"); params.push(hopDongId); }
      if (dateFrom) { conditions.push("pgh.ngay_giao >= ?"); params.push(dateFrom); }
      if (dateTo) { conditions.push("pgh.ngay_giao <= ?"); params.push(dateTo); }

      const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";

      const countRow = await queryOne(
        `SELECT COUNT(*) AS total FROM phieu_giao_hang pgh ${where}`,
        params
      );
      const rows = await query(
        `SELECT pgh.*, kh.ten_cong_ty, hd.so_hop_dong FROM phieu_giao_hang pgh LEFT JOIN khach_hang kh ON pgh.khach_hang_id = kh.id LEFT JOIN hop_dong hd ON pgh.hop_dong_id = hd.id ${where} ORDER BY pgh.id DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );

      return new Response(JSON.stringify({ data: rows, total: countRow?.total || 0, page, limit }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (path === "/phieu-giao-hang" && method === "POST") {
      const body = await req.json();

      // Compute gia_tri_ghi_no by summing so_luong_giao * gia_hop_dong from hop_dong_chi_tiet
      let giaTriGhiNo = 0;
      if (body.chi_tiet && body.chi_tiet.length > 0 && body.hop_dong_id) {
        for (const ct of body.chi_tiet) {
          if (ct.hop_dong_chi_tiet_id) {
            const hdct = await queryOne("SELECT gia_hop_dong FROM hop_dong_chi_tiet WHERE id = ?", [ct.hop_dong_chi_tiet_id]);
            giaTriGhiNo += (ct.so_luong_giao || 0) * Number(hdct?.gia_hop_dong || 0);
          }
        }
      }

      const result = await query(
        `INSERT INTO phieu_giao_hang (so_phieu, ngay_giao, khach_hang_id, hop_dong_id, gia_tri_ghi_no, noi_dung, nguoi_tao) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [body.so_phieu, body.ngay_giao, body.khach_hang_id, body.hop_dong_id || null, giaTriGhiNo, body.noi_dung || '', body.nguoi_tao || '']
      );
      const pghId = parseInt(String((result as any)[0]?.insertId ?? (result as any).insertId));

      if (body.chi_tiet && body.chi_tiet.length > 0) {
        for (const ct of body.chi_tiet) {
          await query(
            `INSERT INTO phieu_giao_hang_chi_tiet (phieu_giao_hang_id, hop_dong_chi_tiet_id, don_vi, so_luong_giao, ghi_chu) VALUES (?, ?, ?, ?, ?)`,
            [pghId, ct.hop_dong_chi_tiet_id || null, ct.don_vi || '', ct.so_luong_giao || 0, ct.ghi_chu || '']
          );
        }
      }

      const newRow = await queryOne("SELECT * FROM phieu_giao_hang WHERE id = ?", [pghId]);
      return new Response(JSON.stringify({ data: newRow }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (path.match(/^\/phieu-giao-hang\/\d+$/) && method === "GET") {
      const id = path.split("/")[2];
      const pgh = await queryOne("SELECT pgh.*, kh.ten_cong_ty, hd.so_hop_dong FROM phieu_giao_hang pgh LEFT JOIN khach_hang kh ON pgh.khach_hang_id = kh.id LEFT JOIN hop_dong hd ON pgh.hop_dong_id = hd.id WHERE pgh.id = ?", [id]);
      if (!pgh) return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const chiTiet = await query(
        `SELECT pghct.*, hdct.ten_san_pham, hdct.gia_hop_dong, hdct.so_luong AS so_luong_hop_dong
         FROM phieu_giao_hang_chi_tiet pghct
         LEFT JOIN hop_dong_chi_tiet hdct ON pghct.hop_dong_chi_tiet_id = hdct.id
         WHERE pghct.phieu_giao_hang_id = ?`,
        [id]
      );
      return new Response(JSON.stringify({ data: { ...pgh, chi_tiet: chiTiet } }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (path.match(/^\/phieu-giao-hang\/\d+$/) && method === "PUT") {
      const id = path.split("/")[2];
      const body = await req.json();

      // Compute gia_tri_ghi_no by summing so_luong_giao * gia_hop_dong
      let giaTriGhiNo = 0;
      if (body.chi_tiet && body.chi_tiet.length > 0) {
        for (const ct of body.chi_tiet) {
          if (ct.hop_dong_chi_tiet_id) {
            const hdct = await queryOne("SELECT gia_hop_dong FROM hop_dong_chi_tiet WHERE id = ?", [ct.hop_dong_chi_tiet_id]);
            giaTriGhiNo += (ct.so_luong_giao || 0) * Number(hdct?.gia_hop_dong || 0);
          }
        }
      }

      await query(
        `UPDATE phieu_giao_hang SET so_phieu=?, ngay_giao=?, khach_hang_id=?, hop_dong_id=?, gia_tri_ghi_no=?, noi_dung=?, nguoi_tao=? WHERE id=?`,
        [body.so_phieu, body.ngay_giao, body.khach_hang_id, body.hop_dong_id || null, giaTriGhiNo, body.noi_dung || '', body.nguoi_tao || '', id]
      );

      if (body.chi_tiet) {
        await query("DELETE FROM phieu_giao_hang_chi_tiet WHERE phieu_giao_hang_id = ?", [id]);
        for (const ct of body.chi_tiet) {
          await query(
            `INSERT INTO phieu_giao_hang_chi_tiet (phieu_giao_hang_id, hop_dong_chi_tiet_id, don_vi, so_luong_giao, ghi_chu) VALUES (?, ?, ?, ?, ?)`,
            [id, ct.hop_dong_chi_tiet_id || null, ct.don_vi || '', ct.so_luong_giao || 0, ct.ghi_chu || '']
          );
        }
      }

      const updated = await queryOne("SELECT * FROM phieu_giao_hang WHERE id = ?", [id]);
      return new Response(JSON.stringify({ data: updated }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (path.match(/^\/phieu-giao-hang\/\d+$/) && method === "DELETE") {
      const id = path.split("/")[2];
      await query("DELETE FROM phieu_giao_hang_chi_tiet WHERE phieu_giao_hang_id = ?", [id]);
      await query("DELETE FROM phieu_giao_hang WHERE id = ?", [id]);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===================== TAI KHOAN =====================
    if (path === "/tai-khoan" && method === "GET") {
      const rows = await query("SELECT * FROM tai_khoan ORDER BY id");
      return new Response(JSON.stringify({ data: rows }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (path === "/tai-khoan" && method === "POST") {
      const body = await req.json();
      const result = await query(
        `INSERT INTO tai_khoan (ten_tai_khoan, so_tai_khoan, ngan_hang) VALUES (?, ?, ?)`,
        [body.ten_tai_khoan, body.so_tai_khoan || '', body.ngan_hang || '']
      );
      const newRow = await queryOne("SELECT * FROM tai_khoan WHERE id = ?", [parseInt(String((result as any)[0]?.insertId ?? (result as any).insertId))]);
      return new Response(JSON.stringify({ data: newRow }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (path.match(/^\/tai-khoan\/\d+$/) && method === "PUT") {
      const id = path.split("/")[2];
      const body = await req.json();
      await query(`UPDATE tai_khoan SET ten_tai_khoan=?, so_tai_khoan=?, ngan_hang=? WHERE id=?`,
        [body.ten_tai_khoan, body.so_tai_khoan || '', body.ngan_hang || '', id]
      );
      const updated = await queryOne("SELECT * FROM tai_khoan WHERE id = ?", [id]);
      return new Response(JSON.stringify({ data: updated }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (path.match(/^\/tai-khoan\/\d+$/) && method === "DELETE") {
      const id = path.split("/")[2];
      await query("DELETE FROM tai_khoan WHERE id = ?", [id]);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===================== DONG TIEN =====================
    if (path === "/dong-tien" && method === "GET") {
      const urlObj = new URL(req.url);
      const search = urlObj.searchParams.get("search") || "";
      const taiKhoanId = urlObj.searchParams.get("tai_khoan_id") || "";
      const khachHangId = urlObj.searchParams.get("khach_hang_id") || "";
      const nhaCungCapId = urlObj.searchParams.get("nha_cung_cap_id") || "";
      const hopDongId = urlObj.searchParams.get("hop_dong_id") || "";
      const hopDongMuaId = urlObj.searchParams.get("hop_dong_mua_id") || "";
      const loaiChiPhiId = urlObj.searchParams.get("loai_chi_phi_id") || "";
      const chiPhiId = urlObj.searchParams.get("chi_phi_id") || "";
      const dateFrom = urlObj.searchParams.get("date_from") || "";
      const dateTo = urlObj.searchParams.get("date_to") || "";
      const page = parseInt(urlObj.searchParams.get("page") || "1");
      const limit = parseInt(urlObj.searchParams.get("limit") || "20");
      const offset = (page - 1) * limit;

      const conditions: string[] = [];
      const params: any[] = [];

      if (search) { conditions.push("dt.mo_ta_giao_dich LIKE ?"); params.push(`%${search}%`); }
      if (taiKhoanId) { conditions.push("dt.tai_khoan_id = ?"); params.push(taiKhoanId); }
      if (khachHangId) { conditions.push("dt.khach_hang_id = ?"); params.push(khachHangId); }
      if (nhaCungCapId) { conditions.push("dt.nha_cung_cap_id = ?"); params.push(nhaCungCapId); }
      if (hopDongId) { conditions.push("dt.hop_dong_id = ?"); params.push(hopDongId); }
      if (hopDongMuaId) { conditions.push("dt.hop_dong_mua_id = ?"); params.push(hopDongMuaId); }
      if (loaiChiPhiId) { conditions.push("dt.loai_chi_phi_id = ?"); params.push(loaiChiPhiId); }
      if (chiPhiId) { conditions.push("dt.chi_phi_id = ?"); params.push(chiPhiId); }
      if (dateFrom) { conditions.push("DATE(dt.ngay_gio_giao_dich) >= ?"); params.push(dateFrom); }
      if (dateTo) { conditions.push("DATE(dt.ngay_gio_giao_dich) <= ?"); params.push(dateTo); }

      const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";

      const countRow = await queryOne(`SELECT COUNT(*) AS total FROM dong_tien dt ${where}`, params);
      const rows = await query(
        `SELECT dt.*, tk.ten_tai_khoan, kh.ten_cong_ty, ncc.ten_nha_cung_cap FROM dong_tien dt LEFT JOIN tai_khoan tk ON dt.tai_khoan_id = tk.id LEFT JOIN khach_hang kh ON dt.khach_hang_id = kh.id LEFT JOIN nha_cung_cap ncc ON dt.nha_cung_cap_id = ncc.id ${where} ORDER BY dt.id DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );

      return new Response(JSON.stringify({ data: rows, total: countRow?.total || 0, page, limit }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (path === "/dong-tien" && method === "POST") {
      const body = await req.json();
      // Calculate so_du
      const lastRow = await queryOne(
        "SELECT so_du FROM dong_tien WHERE tai_khoan_id = ? ORDER BY id DESC LIMIT 1",
        [body.tai_khoan_id]
      );
      const prevSoDu = lastRow ? Number(lastRow.so_du) : 0;
      const ghiNo = Number(body.ghi_no) || 0;
      const ghiCo = Number(body.ghi_co) || 0;
      const soDu = body.so_du != null ? Number(body.so_du) : prevSoDu + ghiNo - ghiCo;

      // Parse ngay_gio_giao_dich: accept ISO "yyyy-mm-dd" or VN "dd/mm/yyyy hh:mm:ss" or "dd/mm/yyyy"
      const rawNgay = body.ngay_gio_giao_dich || body.ngay_thuc_hien || '';
      let ngayGD: string;
      const dmyMatch = String(rawNgay).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{2}:\d{2}:\d{2}))?/);
      if (dmyMatch) {
        const [, d, m, y, t] = dmyMatch;
        ngayGD = `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')} ${t || '00:00:00'}`;
      } else if (/^\d{4}-\d{2}-\d{2}/.test(String(rawNgay))) {
        ngayGD = String(rawNgay).slice(0, 10) + ' 00:00:00';
      } else {
        ngayGD = new Date().toISOString().slice(0, 19).replace('T', ' ');
      }

      const result = await query(
        `INSERT INTO dong_tien (ngay_gio_giao_dich, tai_khoan_id, mo_ta_giao_dich, ghi_no, ghi_co, hop_dong_id, hop_dong_mua_id, loai_chi_phi_id, khach_hang_id, nha_cung_cap_id, chi_phi_id, chi_phi_cu_the_id, so_du, tk_doi_ung, ten_tk_doi_ung, ghi_chu) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [ngayGD, body.tai_khoan_id, body.mo_ta_giao_dich, ghiNo, ghiCo, body.hop_dong_id || null, body.hop_dong_mua_id || null, body.loai_chi_phi_id || null, body.khach_hang_id || null, body.nha_cung_cap_id || null, body.chi_phi_id || null, body.chi_phi_cu_the_id || null, soDu, body.tk_doi_ung || '', body.ten_tk_doi_ung || '', body.ghi_chu || '']
      );

      const newRow = await queryOne("SELECT * FROM dong_tien WHERE id = ?", [parseInt(String((result as any)[0]?.insertId ?? (result as any).insertId))]);
      return new Response(JSON.stringify({ data: newRow }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (path.match(/^\/dong-tien\/\d+$/) && method === "PUT") {
      const id = path.split("/")[2];
      const body = await req.json();

      const rawNgay = body.ngay_gio_giao_dich || body.ngay_thuc_hien || '';
      let ngayGD: string;
      const dmyMatch2 = String(rawNgay).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{2}:\d{2}:\d{2}))?/);
      if (dmyMatch2) {
        const [, d, m, y, t] = dmyMatch2;
        ngayGD = `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')} ${t || '00:00:00'}`;
      } else if (/^\d{4}-\d{2}-\d{2}/.test(String(rawNgay))) {
        ngayGD = String(rawNgay).slice(0, 10) + ' 00:00:00';
      } else {
        ngayGD = new Date().toISOString().slice(0, 19).replace('T', ' ');
      }

      await query(
        `UPDATE dong_tien SET ngay_gio_giao_dich=?, tai_khoan_id=?, mo_ta_giao_dich=?, ghi_no=?, ghi_co=?, hop_dong_id=?, hop_dong_mua_id=?, loai_chi_phi_id=?, khach_hang_id=?, nha_cung_cap_id=?, chi_phi_id=?, chi_phi_cu_the_id=?, tk_doi_ung=?, ten_tk_doi_ung=?, ghi_chu=? WHERE id=?`,
        [ngayGD, body.tai_khoan_id, body.mo_ta_giao_dich, body.ghi_no || 0, body.ghi_co || 0, body.hop_dong_id || null, body.hop_dong_mua_id || null, body.loai_chi_phi_id || null, body.khach_hang_id || null, body.nha_cung_cap_id || null, body.chi_phi_id || null, body.chi_phi_cu_the_id || null, body.tk_doi_ung || '', body.ten_tk_doi_ung || '', body.ghi_chu || '', id]
      );
      const updated = await queryOne("SELECT * FROM dong_tien WHERE id = ?", [id]);
      return new Response(JSON.stringify({ data: updated }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (path.match(/^\/dong-tien\/\d+$/) && method === "DELETE") {
      const id = path.split("/")[2];
      await query("DELETE FROM dong_tien WHERE id = ?", [id]);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===================== CHI PHI (LOAI/CHI PHI/CHI PHI CU THE) =====================
    if (path === "/loai-chi-phi" && method === "GET") {
      const rows = await query("SELECT * FROM loai_chi_phi ORDER BY id");
      return new Response(JSON.stringify({ data: rows }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (path === "/loai-chi-phi" && method === "POST") {
      const body = await req.json();
      const result = await query("INSERT INTO loai_chi_phi (ten_loai_chi_phi) VALUES (?)", [body.ten_loai_chi_phi]);
      const newRow = await queryOne("SELECT * FROM loai_chi_phi WHERE id = ?", [parseInt(String((result as any)[0]?.insertId ?? (result as any).insertId))]);
      return new Response(JSON.stringify({ data: newRow }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (path.match(/^\/loai-chi-phi\/\d+$/) && method === "PUT") {
      const id = path.split("/")[3];
      const body = await req.json();
      await query("UPDATE loai_chi_phi SET ten_loai_chi_phi=? WHERE id=?", [body.ten_loai_chi_phi, id]);
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (path.match(/^\/loai-chi-phi\/\d+$/) && method === "DELETE") {
      const id = path.split("/")[3];
      await query("DELETE FROM loai_chi_phi WHERE id = ?", [id]);
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (path === "/chi-phi" && method === "GET") {
      const urlObj = new URL(req.url);
      const loaiChiPhiId = urlObj.searchParams.get("loai_chi_phi_id") || "";
      const where = loaiChiPhiId ? "WHERE loai_chi_phi_id = ?" : "";
      const params = loaiChiPhiId ? [loaiChiPhiId] : [];
      const rows = await query(`SELECT * FROM chi_phi ${where} ORDER BY id`, params);
      return new Response(JSON.stringify({ data: rows }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (path === "/chi-phi" && method === "POST") {
      const body = await req.json();
      const result = await query("INSERT INTO chi_phi (loai_chi_phi_id, ten_chi_phi) VALUES (?, ?)", [body.loai_chi_phi_id, body.ten_chi_phi]);
      const newRow = await queryOne("SELECT * FROM chi_phi WHERE id = ?", [parseInt(String((result as any)[0]?.insertId ?? (result as any).insertId))]);
      return new Response(JSON.stringify({ data: newRow }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (path.match(/^\/chi-phi\/\d+$/) && method === "PUT") {
      const id = path.split("/")[2];
      const body = await req.json();
      await query("UPDATE chi_phi SET loai_chi_phi_id=?, ten_chi_phi=? WHERE id=?", [body.loai_chi_phi_id, body.ten_chi_phi, id]);
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (path.match(/^\/chi-phi\/\d+$/) && method === "DELETE") {
      const id = path.split("/")[2];
      await query("DELETE FROM chi_phi WHERE id = ?", [id]);
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (path === "/chi-phi-cu-the" && method === "GET") {
      const urlObj = new URL(req.url);
      const chiPhiId = urlObj.searchParams.get("chi_phi_id") || "";
      const where = chiPhiId ? "WHERE chi_phi_id = ?" : "";
      const params = chiPhiId ? [chiPhiId] : [];
      const rows = await query(`SELECT * FROM chi_phi_cu_the ${where} ORDER BY id`, params);
      return new Response(JSON.stringify({ data: rows }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (path === "/chi-phi-cu-the" && method === "POST") {
      const body = await req.json();
      const result = await query("INSERT INTO chi_phi_cu_the (chi_phi_id, ten_chi_phi_cu_the) VALUES (?, ?)", [body.chi_phi_id, body.ten_chi_phi_cu_the]);
      const newRow = await queryOne("SELECT * FROM chi_phi_cu_the WHERE id = ?", [parseInt(String((result as any)[0]?.insertId ?? (result as any).insertId))]);
      return new Response(JSON.stringify({ data: newRow }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (path.match(/^\/chi-phi-cu-the\/\d+$/) && method === "PUT") {
      const id = path.split("/")[3];
      const body = await req.json();
      await query("UPDATE chi_phi_cu_the SET chi_phi_id=?, ten_chi_phi_cu_the=? WHERE id=?", [body.chi_phi_id, body.ten_chi_phi_cu_the, id]);
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (path.match(/^\/chi-phi-cu-the\/\d+$/) && method === "DELETE") {
      const id = path.split("/")[3];
      await query("DELETE FROM chi_phi_cu_the WHERE id = ?", [id]);
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ===================== NHA CUNG CAP =====================
    if (path === "/nha-cung-cap" && method === "GET") {
      const urlObj = new URL(req.url);
      const search = urlObj.searchParams.get("search") || "";
      const page = parseInt(urlObj.searchParams.get("page") || "1");
      const limit = parseInt(urlObj.searchParams.get("limit") || "20");
      const offset = (page - 1) * limit;

      let where = "";
      const params: any[] = [];
      if (search) {
        where = "WHERE ten_nha_cung_cap LIKE ? OR dien_thoai LIKE ? OR dia_chi LIKE ?";
        const s = `%${search}%`;
        params.push(s, s, s);
      }

      const countRow = await queryOne(`SELECT COUNT(*) AS total FROM nha_cung_cap ${where}`, params);
      const rows = await query(`SELECT * FROM nha_cung_cap ${where} ORDER BY id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
      return new Response(JSON.stringify({ data: rows, total: countRow?.total || 0, page, limit }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (path === "/nha-cung-cap" && method === "POST") {
      const body = await req.json();
      const result = await query("INSERT INTO nha_cung_cap (ten_nha_cung_cap, dien_thoai, dia_chi) VALUES (?, ?, ?)", [body.ten_nha_cung_cap, body.dien_thoai || '', body.dia_chi || '']);
      const newRow = await queryOne("SELECT * FROM nha_cung_cap WHERE id = ?", [parseInt(String((result as any)[0]?.insertId ?? (result as any).insertId))]);
      return new Response(JSON.stringify({ data: newRow }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (path.match(/^\/nha-cung-cap\/\d+$/) && method === "PUT") {
      const id = path.split("/")[2];
      const body = await req.json();
      await query("UPDATE nha_cung_cap SET ten_nha_cung_cap=?, dien_thoai=?, dia_chi=? WHERE id=?", [body.ten_nha_cung_cap, body.dien_thoai || '', body.dia_chi || '', id]);
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (path.match(/^\/nha-cung-cap\/\d+$/) && method === "DELETE") {
      const id = path.split("/")[2];
      await query("DELETE FROM nha_cung_cap WHERE id = ?", [id]);
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ===================== HOP DONG MUA =====================
    if (path === "/hop-dong-mua" && method === "GET") {
      const urlObj = new URL(req.url);
      const search = urlObj.searchParams.get("search") || "";
      const nccId = urlObj.searchParams.get("nha_cung_cap_id") || "";
      const dateFrom = urlObj.searchParams.get("date_from") || "";
      const dateTo = urlObj.searchParams.get("date_to") || "";
      const page = parseInt(urlObj.searchParams.get("page") || "1");
      const limit = parseInt(urlObj.searchParams.get("limit") || "20");
      const offset = (page - 1) * limit;

      const conditions: string[] = [];
      const params: any[] = [];
      if (search) { conditions.push("hdm.so_hop_dong LIKE ?"); params.push(`%${search}%`); }
      if (nccId) { conditions.push("hdm.nha_cung_cap_id = ?"); params.push(nccId); }
      if (dateFrom) { conditions.push("hdm.ngay_ky >= ?"); params.push(dateFrom); }
      if (dateTo) { conditions.push("hdm.ngay_ky <= ?"); params.push(dateTo); }

      const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
      const countRow = await queryOne(`SELECT COUNT(*) AS total FROM hop_dong_mua hdm ${where}`, params);
      const rows = await query(
        `SELECT hdm.*, ncc.ten_nha_cung_cap FROM hop_dong_mua hdm LEFT JOIN nha_cung_cap ncc ON hdm.nha_cung_cap_id = ncc.id ${where} ORDER BY hdm.id DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );
      return new Response(JSON.stringify({ data: rows, total: countRow?.total || 0, page, limit }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (path === "/hop-dong-mua" && method === "POST") {
      const body = await req.json();
      const result = await query(
        `INSERT INTO hop_dong_mua (so_hop_dong, ngay_ky, nha_cung_cap_id, tong_gia_tri, ghi_chu) VALUES (?, ?, ?, ?, ?)`,
        [body.so_hop_dong, body.ngay_ky, body.nha_cung_cap_id, body.tong_gia_tri || 0, body.ghi_chu || '']
      );
      const hdmId = parseInt(String((result as any)[0]?.insertId ?? (result as any).insertId));
      if (body.chi_tiet) {
        for (const ct of body.chi_tiet) {
          await query(
            `INSERT INTO hop_dong_mua_chi_tiet (hop_dong_mua_id, ten_san_pham, don_vi, so_luong, don_gia, thue_suat, thanh_tien) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [hdmId, ct.ten_san_pham, ct.don_vi || '', ct.so_luong || 0, ct.don_gia || 0, ct.thue_suat || 10, ct.thanh_tien || 0]
          );
        }
      }
      const newRow = await queryOne("SELECT * FROM hop_dong_mua WHERE id = ?", [hdmId]);
      return new Response(JSON.stringify({ data: newRow }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (path.match(/^\/hop-dong-mua\/\d+$/) && method === "GET") {
      const id = path.split("/")[2];
      const hdm = await queryOne("SELECT hdm.*, ncc.ten_nha_cung_cap FROM hop_dong_mua hdm LEFT JOIN nha_cung_cap ncc ON hdm.nha_cung_cap_id = ncc.id WHERE hdm.id = ?", [id]);
      if (!hdm) return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const chiTiet = await query("SELECT * FROM hop_dong_mua_chi_tiet WHERE hop_dong_mua_id = ?", [id]);
      return new Response(JSON.stringify({ data: { ...hdm, chi_tiet: chiTiet } }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (path.match(/^\/hop-dong-mua\/\d+$/) && method === "PUT") {
      const id = path.split("/")[2];
      const body = await req.json();
      await query("UPDATE hop_dong_mua SET so_hop_dong=?, ngay_ky=?, nha_cung_cap_id=?, tong_gia_tri=?, ghi_chu=? WHERE id=?",
        [body.so_hop_dong, body.ngay_ky, body.nha_cung_cap_id, body.tong_gia_tri || 0, body.ghi_chu || '', id]);
      if (body.chi_tiet) {
        await query("DELETE FROM hop_dong_mua_chi_tiet WHERE hop_dong_mua_id = ?", [id]);
        for (const ct of body.chi_tiet) {
          await query(`INSERT INTO hop_dong_mua_chi_tiet (hop_dong_mua_id, ten_san_pham, don_vi, so_luong, don_gia, thue_suat, thanh_tien) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [id, ct.ten_san_pham, ct.don_vi || '', ct.so_luong || 0, ct.don_gia || 0, ct.thue_suat || 10, ct.thanh_tien || 0]);
        }
      }
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (path.match(/^\/hop-dong-mua\/\d+$/) && method === "DELETE") {
      const id = path.split("/")[2];
      await query("DELETE FROM hop_dong_mua_chi_tiet WHERE hop_dong_mua_id = ?", [id]);
      await query("DELETE FROM hop_dong_mua WHERE id = ?", [id]);
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ===================== HOA DON NHAP =====================
    if (path === "/hoa-don-nhap" && method === "GET") {
      const urlObj = new URL(req.url);
      const search = urlObj.searchParams.get("search") || "";
      const nccId = urlObj.searchParams.get("nha_cung_cap_id") || "";
      const hdmId = urlObj.searchParams.get("hop_dong_mua_id") || "";
      const dateFrom = urlObj.searchParams.get("date_from") || "";
      const dateTo = urlObj.searchParams.get("date_to") || "";
      const page = parseInt(urlObj.searchParams.get("page") || "1");
      const limit = parseInt(urlObj.searchParams.get("limit") || "20");
      const offset = (page - 1) * limit;

      const conditions: string[] = [];
      const params: any[] = [];
      if (search) { conditions.push("hdn.so_hoa_don LIKE ?"); params.push(`%${search}%`); }
      if (nccId) { conditions.push("hdn.nha_cung_cap_id = ?"); params.push(nccId); }
      if (hdmId) { conditions.push("hdn.hop_dong_mua_id = ?"); params.push(hdmId); }
      if (dateFrom) { conditions.push("hdn.ngay_nhap >= ?"); params.push(dateFrom); }
      if (dateTo) { conditions.push("hdn.ngay_nhap <= ?"); params.push(dateTo); }

      const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
      const countRow = await queryOne(`SELECT COUNT(*) AS total FROM hoa_don_nhap hdn ${where}`, params);
      const rows = await query(
        `SELECT hdn.*, ncc.ten_nha_cung_cap FROM hoa_don_nhap hdn LEFT JOIN nha_cung_cap ncc ON hdn.nha_cung_cap_id = ncc.id ${where} ORDER BY hdn.id DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );
      return new Response(JSON.stringify({ data: rows, total: countRow?.total || 0, page, limit }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (path === "/hoa-don-nhap" && method === "POST") {
      const body = await req.json();
      const result = await query(
        `INSERT INTO hoa_don_nhap (so_hoa_don, ngay_nhap, nha_cung_cap_id, hop_dong_mua_id, tong_tien, ghi_chu) VALUES (?, ?, ?, ?, ?, ?)`,
        [body.so_hoa_don, body.ngay_nhap, body.nha_cung_cap_id, body.hop_dong_mua_id || null, body.tong_tien || 0, body.ghi_chu || '']
      );
      const hdnId = parseInt(String((result as any)[0]?.insertId ?? (result as any).insertId));
      if (body.chi_tiet) {
        for (const ct of body.chi_tiet) {
          await query(
            `INSERT INTO hoa_don_nhap_chi_tiet (hoa_don_nhap_id, vat_tu_id, so_luong, don_gia, thanh_tien) VALUES (?, ?, ?, ?, ?)`,
            [hdnId, ct.vat_tu_id, ct.so_luong || 0, ct.don_gia || 0, ct.thanh_tien || 0]
          );
          // Update ton_kho
          await query("UPDATE vat_tu SET ton_kho = ton_kho + ? WHERE id = ?", [ct.so_luong || 0, ct.vat_tu_id]);
        }
      }
      const newRow = await queryOne("SELECT * FROM hoa_don_nhap WHERE id = ?", [hdnId]);
      return new Response(JSON.stringify({ data: newRow }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (path.match(/^\/hoa-don-nhap\/\d+$/) && method === "GET") {
      const id = path.split("/")[2];
      const hdn = await queryOne("SELECT hdn.*, ncc.ten_nha_cung_cap FROM hoa_don_nhap hdn LEFT JOIN nha_cung_cap ncc ON hdn.nha_cung_cap_id = ncc.id WHERE hdn.id = ?", [id]);
      if (!hdn) return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const chiTiet = await query("SELECT hdnct.*, vt.ma_vat_tu, vt.ten_vat_tu, vt.don_vi_tinh FROM hoa_don_nhap_chi_tiet hdnct LEFT JOIN vat_tu vt ON hdnct.vat_tu_id = vt.id WHERE hdnct.hoa_don_nhap_id = ?", [id]);
      return new Response(JSON.stringify({ data: { ...hdn, chi_tiet: chiTiet } }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (path.match(/^\/hoa-don-nhap\/\d+$/) && method === "PUT") {
      const id = path.split("/")[2];
      const body = await req.json();
      // Subtract old quantities first
      const oldChiTiet = await query("SELECT * FROM hoa_don_nhap_chi_tiet WHERE hoa_don_nhap_id = ?", [id]);
      for (const ct of oldChiTiet) {
        await query("UPDATE vat_tu SET ton_kho = ton_kho - ? WHERE id = ?", [ct.so_luong, ct.vat_tu_id]);
      }
      // Update header
      await query(
        "UPDATE hoa_don_nhap SET so_hoa_don=?, ngay_nhap=?, nha_cung_cap_id=?, hop_dong_mua_id=?, tong_tien=?, ghi_chu=? WHERE id=?",
        [body.so_hoa_don, body.ngay_nhap, body.nha_cung_cap_id, body.hop_dong_mua_id || null, body.tong_tien || 0, body.ghi_chu || '', id]
      );
      // Replace chi tiet
      await query("DELETE FROM hoa_don_nhap_chi_tiet WHERE hoa_don_nhap_id = ?", [id]);
      if (body.chi_tiet) {
        for (const ct of body.chi_tiet) {
          await query(
            "INSERT INTO hoa_don_nhap_chi_tiet (hoa_don_nhap_id, vat_tu_id, so_luong, don_gia, thanh_tien) VALUES (?, ?, ?, ?, ?)",
            [id, ct.vat_tu_id, ct.so_luong || 0, ct.don_gia || 0, ct.thanh_tien || 0]
          );
          await query("UPDATE vat_tu SET ton_kho = ton_kho + ? WHERE id = ?", [ct.so_luong || 0, ct.vat_tu_id]);
        }
      }
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (path.match(/^\/hoa-don-nhap\/\d+$/) && method === "DELETE") {
      const id = path.split("/")[2];
      // Subtract ton_kho before deleting
      const chiTiet = await query("SELECT * FROM hoa_don_nhap_chi_tiet WHERE hoa_don_nhap_id = ?", [id]);
      for (const ct of chiTiet) {
        await query("UPDATE vat_tu SET ton_kho = ton_kho - ? WHERE id = ?", [ct.so_luong, ct.vat_tu_id]);
      }
      await query("DELETE FROM hoa_don_nhap_chi_tiet WHERE hoa_don_nhap_id = ?", [id]);
      await query("DELETE FROM hoa_don_nhap WHERE id = ?", [id]);
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ===================== VAT TU =====================
    if (path === "/vat-tu" && method === "GET") {
      const urlObj = new URL(req.url);
      const search = urlObj.searchParams.get("search") || "";
      const page = parseInt(urlObj.searchParams.get("page") || "1");
      const limit = parseInt(urlObj.searchParams.get("limit") || "20");
      const offset = (page - 1) * limit;

      let where = "";
      const params: any[] = [];
      if (search) {
        where = "WHERE ma_vat_tu LIKE ? OR ten_vat_tu LIKE ?";
        const s = `%${search}%`;
        params.push(s, s);
      }

      const countRow = await queryOne(`SELECT COUNT(*) AS total FROM vat_tu ${where}`, params);
      const rows = await query(`SELECT * FROM vat_tu ${where} ORDER BY id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
      return new Response(JSON.stringify({ data: rows, total: countRow?.total || 0, page, limit }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (path === "/vat-tu" && method === "POST") {
      const body = await req.json();
      const result = await query("INSERT INTO vat_tu (ma_vat_tu, ten_vat_tu, don_vi_tinh, ton_kho) VALUES (?, ?, ?, ?)", [body.ma_vat_tu, body.ten_vat_tu, body.don_vi_tinh || '', body.ton_kho || 0]);
      const newRow = await queryOne("SELECT * FROM vat_tu WHERE id = ?", [parseInt(String((result as any)[0]?.insertId ?? (result as any).insertId))]);
      return new Response(JSON.stringify({ data: newRow }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (path.match(/^\/vat-tu\/\d+$/) && method === "PUT") {
      const id = path.split("/")[2];
      const body = await req.json();
      await query("UPDATE vat_tu SET ma_vat_tu=?, ten_vat_tu=?, don_vi_tinh=? WHERE id=?", [body.ma_vat_tu, body.ten_vat_tu, body.don_vi_tinh || '', id]);
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (path.match(/^\/vat-tu\/\d+$/) && method === "DELETE") {
      const id = path.split("/")[2];
      await query("DELETE FROM vat_tu WHERE id = ?", [id]);
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ===================== TEP DINH KEM =====================
    if (path === "/tep-dinh-kem" && method === "GET") {
      try {
        const urlObj = new URL(req.url);
        const relatedType = urlObj.searchParams.get("related_type") || "";
        const relatedId = urlObj.searchParams.get("related_id") || "";
        const conditions: string[] = [];
        const params: any[] = [];
        if (relatedType) { conditions.push("related_type = ?"); params.push(relatedType); }
        if (relatedId) { conditions.push("related_id = ?"); params.push(relatedId); }
        const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
        const rows = await query(`SELECT * FROM tep_dinh_kem ${where} ORDER BY id DESC`, params);
        return new Response(JSON.stringify({ data: rows }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch {
        return new Response(JSON.stringify({ data: [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }
    if (path === "/tep-dinh-kem" && method === "POST") {
      try {
        const body = await req.json();
        const result = await query(
          `INSERT INTO tep_dinh_kem (related_type, related_id, ten_file, drive_file_id, drive_folder_id, drive_url, mime_type, file_size) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [body.related_type, body.related_id, body.ten_file, body.drive_file_id, body.drive_folder_id || '', body.drive_url || '', body.mime_type || '', body.file_size || 0]
        );
        const newRow = await queryOne("SELECT * FROM tep_dinh_kem WHERE id = ?", [parseInt(String((result as any)[0]?.insertId ?? (result as any).insertId))]);
        return new Response(JSON.stringify({ data: newRow }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch {
        return new Response(JSON.stringify({ data: null }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }
    if (path.match(/^\/tep-dinh-kem\/\d+$/) && method === "DELETE") {
      try {
        const id = path.split("/")[2];
        await query("DELETE FROM tep_dinh_kem WHERE id = ?", [id]);
      } catch { /* ignore */ }
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ===================== DASHBOARD STATS =====================
    if (path === "/dashboard-stats" && method === "GET") {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
      const lastDay = `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;

      const [baoGiaCount, hopDongHieuLuc, dongTienMonth, phieuGiaoGhiNo, taiKhoanAll] = await Promise.all([
        queryOne(`SELECT COUNT(*) AS total FROM bao_gia WHERE ngay_bao_gia >= ? AND ngay_bao_gia <= ?`, [firstDay, lastDay]),
        queryOne(`SELECT COUNT(*) AS total FROM hop_dong WHERE trang_thai = 'Hieu luc'`),
        query(`SELECT ghi_no, ghi_co, khach_hang_id, loai_chi_phi_id FROM dong_tien WHERE DATE(ngay_gio_giao_dich) >= ? AND DATE(ngay_gio_giao_dich) <= ?`, [firstDay, lastDay]),
        queryOne(`SELECT SUM(pghct.so_luong_giao * COALESCE(hdct.gia_hop_dong, 0)) AS tong FROM phieu_giao_hang_chi_tiet pghct LEFT JOIN hop_dong_chi_tiet hdct ON hdct.id = pghct.hop_dong_chi_tiet_id`),
        query(`SELECT id, ten_tai_khoan FROM tai_khoan`),
      ]);

      const tongThu = dongTienMonth.reduce((s, d) => s + Number(d.ghi_no || 0), 0);
      const tongChi = dongTienMonth.reduce((s, d) => s + Number(d.ghi_co || 0), 0);
      const tongChiPhi = dongTienMonth.filter(d => d.loai_chi_phi_id).reduce((s, d) => s + Number(d.ghi_co || 0), 0);
      const tongGhiNo = Number(phieuGiaoGhiNo?.tong || 0);
      const tongDaThu = dongTienMonth.filter(d => d.khach_hang_id).reduce((s, d) => s + Number(d.ghi_no || 0), 0);

      // Account balances
      const allDongTien = await query("SELECT ghi_no, ghi_co, tai_khoan_id FROM dong_tien");
      const accountBalances = taiKhoanAll.map(tk => {
        const balance = allDongTien.filter(d => d.tai_khoan_id === tk.id).reduce((s, d) => s + Number(d.ghi_no || 0) - Number(d.ghi_co || 0), 0);
        return { tai_khoan_id: tk.id, ten_tai_khoan: tk.ten_tai_khoan, so_du: balance };
      });

      // Recent items
      const [hopDongRecent, dongTienRecent] = await Promise.all([
        query("SELECT hd.*, kh.ten_cong_ty FROM hop_dong hd LEFT JOIN khach_hang kh ON hd.khach_hang_id = kh.id ORDER BY hd.id DESC LIMIT 5"),
        query("SELECT dt.*, tk.ten_tai_khoan FROM dong_tien dt LEFT JOIN tai_khoan tk ON dt.tai_khoan_id = tk.id ORDER BY dt.id DESC LIMIT 5"),
      ]);

      return new Response(JSON.stringify({
        tong_bao_gia_thang: baoGiaCount?.total || 0,
        tong_hop_dong_hieu_luc: hopDongHieuLuc?.total || 0,
        tong_tien_da_thu: tongThu,
        tong_tien_da_chi: tongChi,
        cong_no_phai_thu: tongGhiNo - tongDaThu,
        tong_chi_phi_thang: tongChiPhi,
        so_du_tai_khoan: accountBalances,
        hop_dong_moi_nhat: hopDongRecent,
        dong_tien_moi_nhat: dongTienRecent,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===================== CONG NO =====================
    if (path === "/cong-no" && method === "GET") {
      const rows = await query(`
        SELECT kh.id, kh.ten_cong_ty,
          COALESCE(pghsum.tong_ghi_no, 0) AS tong_ghi_no,
          COALESCE(dt.tong_da_thu, 0) AS tong_da_thu,
          COALESCE(pghsum.tong_ghi_no, 0) - COALESCE(dt.tong_da_thu, 0) AS con_phai_thu
        FROM khach_hang kh
        LEFT JOIN (
          SELECT pgh.khach_hang_id,
            SUM(pghct.so_luong_giao * COALESCE(hdct.gia_hop_dong, 0)) AS tong_ghi_no
          FROM phieu_giao_hang pgh
          JOIN phieu_giao_hang_chi_tiet pghct ON pghct.phieu_giao_hang_id = pgh.id
          LEFT JOIN hop_dong_chi_tiet hdct ON hdct.id = pghct.hop_dong_chi_tiet_id
          GROUP BY pgh.khach_hang_id
        ) pghsum ON kh.id = pghsum.khach_hang_id
        LEFT JOIN (SELECT khach_hang_id, SUM(ghi_no) AS tong_da_thu FROM dong_tien WHERE khach_hang_id IS NOT NULL GROUP BY khach_hang_id) dt ON kh.id = dt.khach_hang_id
        HAVING tong_ghi_no > 0 OR tong_da_thu > 0
        ORDER BY con_phai_thu DESC
      `);
      return new Response(JSON.stringify({ data: rows }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===================== BAO GIA CHI TIET (for detail pages) =====================
    if (path.match(/^\/bao-gia-chi-tiet\/\d+$/) && method === "GET") {
      const baoGiaId = path.split("/")[2];
      const rows = await query("SELECT * FROM bao_gia_chi_tiet WHERE bao_gia_id = ?", [baoGiaId]);
      return new Response(JSON.stringify({ data: rows }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ===================== HOP DONG CHI TIET =====================
    if (path.match(/^\/hop-dong-chi-tiet\/\d+$/) && method === "GET") {
      const hopDongId = path.split("/")[2];
      const rows = await query("SELECT * FROM hop_dong_chi_tiet WHERE hop_dong_id = ?", [hopDongId]);
      return new Response(JSON.stringify({ data: rows }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ===================== PHIEU GIAO HANG CHI TIET =====================
    if (path.match(/^\/phieu-giao-hang-chi-tiet\/\d+$/) && method === "GET") {
      const pghId = path.split("/")[2];
      const rows = await query(
        `SELECT pghct.*, hdct.ten_san_pham, hdct.gia_hop_dong, hdct.so_luong AS so_luong_hop_dong
         FROM phieu_giao_hang_chi_tiet pghct
         LEFT JOIN hop_dong_chi_tiet hdct ON hdct.id = pghct.hop_dong_chi_tiet_id
         WHERE pghct.phieu_giao_hang_id = ?`,
        [pghId]
      );
      return new Response(JSON.stringify({ data: rows }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ===================== HOP DONG MUA CHI TIET =====================
    if (path.match(/^\/hop-dong-mua-chi-tiet\/\d+$/) && method === "GET") {
      const hdmId = path.split("/")[2];
      const rows = await query("SELECT * FROM hop_dong_mua_chi_tiet WHERE hop_dong_mua_id = ?", [hdmId]);
      return new Response(JSON.stringify({ data: rows }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ===================== HOA DON NHAP CHI TIET =====================
    if (path.match(/^\/hoa-don-nhap-chi-tiet\/\d+$/) && method === "GET") {
      const hdnId = path.split("/")[2];
      const rows = await query("SELECT hdnct.*, vt.ma_vat_tu, vt.ten_vat_tu, vt.don_vi_tinh FROM hoa_don_nhap_chi_tiet hdnct LEFT JOIN vat_tu vt ON hdnct.vat_tu_id = vt.id WHERE hdnct.hoa_don_nhap_id = ?", [hdnId]);
      return new Response(JSON.stringify({ data: rows }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ===================== DONG TIEN BY ENTITY =====================
    if (path === "/dong-tien-by" && method === "GET") {
      const urlObj = new URL(req.url);
      const khachHangId = urlObj.searchParams.get("khach_hang_id") || "";
      const nhaCungCapId = urlObj.searchParams.get("nha_cung_cap_id") || "";
      const hopDongId = urlObj.searchParams.get("hop_dong_id") || "";
      const hopDongMuaId = urlObj.searchParams.get("hop_dong_mua_id") || "";
      const taiKhoanId = urlObj.searchParams.get("tai_khoan_id") || "";

      const conditions: string[] = [];
      const params: any[] = [];
      if (khachHangId) { conditions.push("khach_hang_id = ?"); params.push(khachHangId); }
      if (nhaCungCapId) { conditions.push("nha_cung_cap_id = ?"); params.push(nhaCungCapId); }
      if (hopDongId) { conditions.push("hop_dong_id = ?"); params.push(hopDongId); }
      if (hopDongMuaId) { conditions.push("hop_dong_mua_id = ?"); params.push(hopDongMuaId); }
      if (taiKhoanId) { conditions.push("tai_khoan_id = ?"); params.push(taiKhoanId); }

      const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
      const rows = await query(`SELECT * FROM dong_tien ${where} ORDER BY id DESC`, params);
      return new Response(JSON.stringify({ data: rows }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ===================== PHIEU GIAO HANG BY KHACH HANG / HOP DONG =====================
    if (path === "/phieu-giao-hang-by" && method === "GET") {
      const urlObj = new URL(req.url);
      const khachHangId = urlObj.searchParams.get("khach_hang_id") || "";
      const hopDongId = urlObj.searchParams.get("hop_dong_id") || "";
      const conditions: string[] = [];
      const params: any[] = [];
      if (khachHangId) { conditions.push("pgh.khach_hang_id = ?"); params.push(khachHangId); }
      if (hopDongId) { conditions.push("pgh.hop_dong_id = ?"); params.push(hopDongId); }
      const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
      const rows = await query(`SELECT pgh.* FROM phieu_giao_hang pgh ${where} ORDER BY pgh.id DESC`, params);

      // Attach chi_tiet with hop_dong_chi_tiet_id for remaining-quantity calculations
      for (const row of rows) {
        const chiTiet = await query(
          `SELECT pghct.*, hdct.ten_san_pham, hdct.gia_hop_dong, hdct.so_luong AS so_luong_hop_dong
           FROM phieu_giao_hang_chi_tiet pghct
           LEFT JOIN hop_dong_chi_tiet hdct ON hdct.id = pghct.hop_dong_chi_tiet_id
           WHERE pghct.phieu_giao_hang_id = ?`,
          [row.id]
        );
        row.chi_tiet = chiTiet;
      }

      return new Response(JSON.stringify({ data: rows }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ===================== BAO GIA BY KHACH HANG =====================
    if (path === "/bao-gia-by" && method === "GET") {
      const urlObj = new URL(req.url);
      const khachHangId = urlObj.searchParams.get("khach_hang_id") || "";
      const rows = await query("SELECT * FROM bao_gia WHERE khach_hang_id = ? ORDER BY id DESC", [khachHangId]);
      return new Response(JSON.stringify({ data: rows }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ===================== HOP DONG BY KHACH HANG =====================
    if (path === "/hop-dong-by" && method === "GET") {
      const urlObj = new URL(req.url);
      const khachHangId = urlObj.searchParams.get("khach_hang_id") || "";
      const rows = await query("SELECT * FROM hop_dong WHERE khach_hang_id = ? ORDER BY id DESC", [khachHangId]);
      return new Response(JSON.stringify({ data: rows }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ===================== HOP DONG MUA BY NCC =====================
    if (path === "/hop-dong-mua-by" && method === "GET") {
      const urlObj = new URL(req.url);
      const nccId = urlObj.searchParams.get("nha_cung_cap_id") || "";
      const rows = await query("SELECT * FROM hop_dong_mua WHERE nha_cung_cap_id = ? ORDER BY id DESC", [nccId]);
      return new Response(JSON.stringify({ data: rows }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ===================== HOA DON NHAP BY NCC =====================
    if (path === "/hoa-don-nhap-by" && method === "GET") {
      const urlObj = new URL(req.url);
      const nccId = urlObj.searchParams.get("nha_cung_cap_id") || "";
      const rows = await query("SELECT * FROM hoa_don_nhap WHERE nha_cung_cap_id = ? ORDER BY id DESC", [nccId]);
      return new Response(JSON.stringify({ data: rows }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ===================== CONVERT BAO GIA TO HOP DONG =====================
    if (path === "/convert-bao-gia" && method === "POST") {
      const body = await req.json();
      const baoGiaId = body.bao_gia_id;
      const bg = await queryOne("SELECT * FROM bao_gia WHERE id = ?", [baoGiaId]);
      if (!bg) return new Response(JSON.stringify({ error: "Bao gia not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      const soHopDong = body.so_hop_dong || `HD${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;

      const result = await query(
        `INSERT INTO hop_dong (khach_hang_id, ten_du_an, so_hop_dong, ngay_hop_dong, mo_ta_noi_dung, trang_thai, phi_van_chuyen, che_do_van_chuyen) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [bg.khach_hang_id, bg.ten_du_an, soHopDong, new Date().toISOString().split('T')[0], `Chuyển từ báo giá ${bg.so_bao_gia}`, 'Hieu luc', bg.phi_van_chuyen, bg.che_do_van_chuyen]
      );
      const hopDongId = parseInt(String((result as any)[0]?.insertId ?? (result as any).insertId));

      const chiTiet = await query("SELECT * FROM bao_gia_chi_tiet WHERE bao_gia_id = ?", [baoGiaId]);
      for (const ct of chiTiet) {
        const giaChuaVC = ct.gia_ban_chua_van_chuyen ?? ct.gia_ban_thuc_te;
        const giaHD = ct.gia_ban_thuc_te; // gia_ban_thuc_te = chua_vc + vc_phan_bo
        const chenhLech = giaChuaVC > 0 ? Math.round(((giaHD - giaChuaVC) / giaChuaVC) * 100 * 100) / 100 : 0;
        await query(
          `INSERT INTO hop_dong_chi_tiet (hop_dong_id, ten_san_pham, don_vi, so_luong, don_gia_von, gia_ban_thuc_te, thue_suat, chenh_lech_phan_tram, gia_hop_dong) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [hopDongId, ct.ten_san_pham, ct.don_vi, ct.so_luong, ct.don_gia_von, giaChuaVC, ct.thue_suat, chenhLech, giaHD]
        );
      }

      await query("UPDATE bao_gia SET hop_dong_id = ? WHERE id = ?", [hopDongId, baoGiaId]);

      return new Response(JSON.stringify({ data: { hop_dong_id: hopDongId, so_hop_dong: soHopDong } }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===================== CLONE BAO GIA =====================
    if (path === "/clone-bao-gia" && method === "POST") {
      const body = await req.json();
      const baoGiaId = body.bao_gia_id;
      const bg = await queryOne("SELECT * FROM bao_gia WHERE id = ?", [baoGiaId]);
      if (!bg) return new Response(JSON.stringify({ error: "Bao gia not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      const newPhienBan = (bg.phien_ban || 1) + 1;
      const result = await query(
        `INSERT INTO bao_gia (so_bao_gia, ngay_bao_gia, khach_hang_id, ten_du_an, phien_ban, mau_bao_gia, che_do_van_chuyen, phi_van_chuyen, ten_folder_du_an, id_folder_du_an) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [bg.so_bao_gia, new Date().toISOString().split('T')[0], bg.khach_hang_id, bg.ten_du_an, newPhienBan, bg.mau_bao_gia, bg.che_do_van_chuyen, bg.phi_van_chuyen, bg.ten_folder_du_an, bg.id_folder_du_an]
      );
      const newBaoGiaId = parseInt(String((result as any)[0]?.insertId ?? (result as any).insertId));

      const chiTiet = await query("SELECT * FROM bao_gia_chi_tiet WHERE bao_gia_id = ?", [baoGiaId]);
      for (const ct of chiTiet) {
        await query(
          `INSERT INTO bao_gia_chi_tiet (bao_gia_id, ten_san_pham, don_vi, so_luong, don_gia_von, lai_suat_phan_tram, gia_ban_chua_van_chuyen, chi_phi_van_chuyen_phan_bo, gia_ban_thuc_te, thue_suat) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [newBaoGiaId, ct.ten_san_pham, ct.don_vi, ct.so_luong, ct.don_gia_von, ct.lai_suat_phan_tram, ct.gia_ban_chua_van_chuyen ?? ct.gia_ban_thuc_te, ct.chi_phi_van_chuyen_phan_bo ?? 0, ct.gia_ban_thuc_te, ct.thue_suat]
        );
      }

      return new Response(JSON.stringify({ data: { new_bao_gia_id: newBaoGiaId } }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===================== TAI KHOAN TIEN =====================

    if (path === "/tai-khoan-tien" && method === "GET") {
      const urlObj = new URL(req.url);
      const loai = urlObj.searchParams.get("loai_tai_khoan") || "";
      const phamVi = urlObj.searchParams.get("pham_vi") || "";
      const trangThai = urlObj.searchParams.get("trang_thai") || "";
      const conditions: string[] = [];
      const qParams: any[] = [];
      if (loai) { conditions.push("loai_tai_khoan = ?"); qParams.push(loai); }
      if (phamVi) { conditions.push("pham_vi = ?"); qParams.push(phamVi); }
      if (trangThai) { conditions.push("trang_thai = ?"); qParams.push(trangThai); }
      const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
      // Ensure table exists, add missing columns, seed from old tai_khoan if empty
      try {
        await query(`CREATE TABLE IF NOT EXISTS tai_khoan_tien (
          id INT AUTO_INCREMENT PRIMARY KEY,
          ten_tai_khoan VARCHAR(255) NOT NULL,
          loai_tai_khoan VARCHAR(50) NOT NULL DEFAULT 'ngan_hang',
          ngan_hang VARCHAR(100) NULL,
          so_tai_khoan VARCHAR(100) NULL,
          chu_tai_khoan VARCHAR(255) NULL,
          pham_vi VARCHAR(50) NOT NULL DEFAULT 'cong_ty',
          so_du_dau_ky DECIMAL(18,2) NOT NULL DEFAULT 0,
          ngay_so_du_dau_ky DATE NULL,
          trang_thai VARCHAR(50) NOT NULL DEFAULT 'hoat_dong',
          ghi_chu TEXT NULL,
          thu_tu INT NOT NULL DEFAULT 0,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )`);
      } catch (_) { /* already exists */ }
      // Add thu_tu column if missing (for older table versions)
      try { await query("ALTER TABLE tai_khoan_tien ADD COLUMN IF NOT EXISTS thu_tu INT NOT NULL DEFAULT 0"); } catch (_) {}
      try { await query("ALTER TABLE tai_khoan_tien ADD COLUMN IF NOT EXISTS chu_tai_khoan VARCHAR(255) NULL"); } catch (_) {}
      try { await query("ALTER TABLE tai_khoan_tien ADD COLUMN IF NOT EXISTS so_du_dau_ky DECIMAL(18,2) NOT NULL DEFAULT 0"); } catch (_) {}
      try {
        const countRes = await query("SELECT COUNT(*) AS cnt FROM tai_khoan_tien");
        if (Number(countRes[0]?.cnt) === 0) {
          const tkList = await query("SELECT * FROM tai_khoan ORDER BY id");
          for (const tk of tkList) {
            await query(
              `INSERT INTO tai_khoan_tien (ten_tai_khoan, loai_tai_khoan, ngan_hang, so_tai_khoan, pham_vi, so_du_dau_ky, trang_thai)
               VALUES (?, ?, ?, ?, 'cong_ty', 0, 'hoat_dong')`,
              [tk.ten_tai_khoan, tk.ngan_hang ? "ngan_hang" : "tien_mat", tk.ngan_hang || null, tk.so_tai_khoan || null]
            );
          }
        }
      } catch (_) { /* seed errors ignored */ }
      const rows = await query(`SELECT * FROM tai_khoan_tien ${where} ORDER BY ten_tai_khoan`, qParams);
      return new Response(JSON.stringify({ data: rows }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (path === "/tai-khoan-tien" && method === "POST") {
      const body = await req.json();
      const result = await query(
        `INSERT INTO tai_khoan_tien (ten_tai_khoan, loai_tai_khoan, ngan_hang, so_tai_khoan, chu_tai_khoan, pham_vi, so_du_dau_ky, ngay_so_du_dau_ky, trang_thai, ghi_chu)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [body.ten_tai_khoan, body.loai_tai_khoan || "ngan_hang", body.ngan_hang || null, body.so_tai_khoan || null,
         body.chu_tai_khoan || null, body.pham_vi || "cong_ty", body.so_du_dau_ky || 0,
         body.ngay_so_du_dau_ky || null, body.trang_thai || "hoat_dong", body.ghi_chu || null]
      );
      const newRow = await queryOne("SELECT * FROM tai_khoan_tien WHERE id = ?", [(result as any)[0]?.insertId ?? (result as any).insertId]);
      return new Response(JSON.stringify({ data: newRow }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (path.match(/^\/tai-khoan-tien\/\d+$/) && method === "PUT") {
      const id = path.split("/")[2];
      const body = await req.json();
      await query(
        `UPDATE tai_khoan_tien SET ten_tai_khoan=?, loai_tai_khoan=?, ngan_hang=?, so_tai_khoan=?, chu_tai_khoan=?, pham_vi=?, so_du_dau_ky=?, ngay_so_du_dau_ky=?, trang_thai=?, ghi_chu=? WHERE id=?`,
        [body.ten_tai_khoan, body.loai_tai_khoan, body.ngan_hang || null, body.so_tai_khoan || null,
         body.chu_tai_khoan || null, body.pham_vi, body.so_du_dau_ky || 0,
         body.ngay_so_du_dau_ky || null, body.trang_thai, body.ghi_chu || null, id]
      );
      const updated = await queryOne("SELECT * FROM tai_khoan_tien WHERE id = ?", [id]);
      return new Response(JSON.stringify({ data: updated }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (path.match(/^\/tai-khoan-tien\/\d+$/) && method === "DELETE") {
      const id = path.split("/")[2];
      // Soft delete
      await query("UPDATE tai_khoan_tien SET trang_thai = 'khong_hoat_dong' WHERE id = ?", [id]);
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ===================== HANG MUC THU CHI =====================

    if (path === "/hang-muc-thu-chi" && method === "GET") {
      const urlObj = new URL(req.url);
      const loai = urlObj.searchParams.get("loai_giao_dich") || "";
      const phamVi = urlObj.searchParams.get("pham_vi") || "";
      const trangThai = urlObj.searchParams.get("trang_thai") || "hoat_dong";
      const conditions: string[] = [];
      const params: any[] = [];
      // loai filter: match exact OR 'tat_ca'
      if (loai) { conditions.push("(loai_giao_dich = ? OR loai_giao_dich = 'tat_ca')"); params.push(loai); }
      if (phamVi) { conditions.push("pham_vi = ?"); params.push(phamVi); }
      if (trangThai) { conditions.push("trang_thai = ?"); params.push(trangThai); }
      const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
      const rows = await query(`SELECT * FROM hang_muc_thu_chi ${where} ORDER BY cap_do, thu_tu, ten_hang_muc`, params);
      return new Response(JSON.stringify({ data: rows }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (path === "/hang-muc-thu-chi" && method === "POST") {
      const body = await req.json();
      const result = await query(
        `INSERT INTO hang_muc_thu_chi (ma_hang_muc, ten_hang_muc, loai_giao_dich, pham_vi, parent_id, cap_do, tinh_chat, ap_dung_cho_hop_dong, ap_dung_cho_nha_cung_cap, ap_dung_cho_nhan_vien, thu_tu, trang_thai)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [body.ma_hang_muc, body.ten_hang_muc, body.loai_giao_dich || "chi", body.pham_vi || "cong_ty",
         body.parent_id || null, body.cap_do || 1, body.tinh_chat || "khac",
         body.ap_dung_cho_hop_dong ? 1 : 0, body.ap_dung_cho_nha_cung_cap ? 1 : 0, body.ap_dung_cho_nhan_vien ? 1 : 0,
         body.thu_tu || 0, body.trang_thai || "hoat_dong"]
      );
      const newRow = await queryOne("SELECT * FROM hang_muc_thu_chi WHERE id = ?", [(result as any)[0]?.insertId ?? (result as any).insertId]);
      return new Response(JSON.stringify({ data: newRow }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (path.match(/^\/hang-muc-thu-chi\/\d+$/) && method === "PUT") {
      const id = path.split("/")[2];
      const body = await req.json();
      await query(
        `UPDATE hang_muc_thu_chi SET ten_hang_muc=?, loai_giao_dich=?, pham_vi=?, parent_id=?, cap_do=?, tinh_chat=?, ap_dung_cho_hop_dong=?, ap_dung_cho_nha_cung_cap=?, ap_dung_cho_nhan_vien=?, thu_tu=?, trang_thai=? WHERE id=?`,
        [body.ten_hang_muc, body.loai_giao_dich, body.pham_vi, body.parent_id || null, body.cap_do || 1,
         body.tinh_chat || "khac", body.ap_dung_cho_hop_dong ? 1 : 0, body.ap_dung_cho_nha_cung_cap ? 1 : 0,
         body.ap_dung_cho_nhan_vien ? 1 : 0, body.thu_tu || 0, body.trang_thai || "hoat_dong", id]
      );
      const updated = await queryOne("SELECT * FROM hang_muc_thu_chi WHERE id = ?", [id]);
      return new Response(JSON.stringify({ data: updated }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (path.match(/^\/hang-muc-thu-chi\/\d+$/) && method === "DELETE") {
      const id = path.split("/")[2];
      await query("UPDATE hang_muc_thu_chi SET trang_thai = 'an' WHERE id = ?", [id]);
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ===================== DOI TUONG =====================

    if (path === "/doi-tuong" && method === "GET") {
      const urlObj = new URL(req.url);
      const loai = urlObj.searchParams.get("loai_doi_tuong") || "";
      const search = urlObj.searchParams.get("search") || "";
      const page = parseInt(urlObj.searchParams.get("page") || "1");
      const limit = parseInt(urlObj.searchParams.get("limit") || "50");
      const offset = (page - 1) * limit;
      const conditions: string[] = ["trang_thai = 'hoat_dong'"];
      const params: any[] = [];
      if (loai) { conditions.push("loai_doi_tuong = ?"); params.push(loai); }
      if (search) { conditions.push("ten_doi_tuong LIKE ?"); params.push(`%${search}%`); }
      const where = "WHERE " + conditions.join(" AND ");
      const countRow = await queryOne(`SELECT COUNT(*) AS total FROM doi_tuong ${where}`, params);
      const rows = await query(`SELECT * FROM doi_tuong ${where} ORDER BY ten_doi_tuong LIMIT ? OFFSET ?`, [...params, limit, offset]);
      return new Response(JSON.stringify({ data: rows, total: countRow?.total || 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (path === "/doi-tuong" && method === "POST") {
      const body = await req.json();
      const result = await query(
        `INSERT INTO doi_tuong (loai_doi_tuong, ten_doi_tuong, ma_so_thue, dia_chi, dien_thoai, email, ghi_chu, trang_thai)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [body.loai_doi_tuong || "khac", body.ten_doi_tuong, body.ma_so_thue || null,
         body.dia_chi || null, body.dien_thoai || null, body.email || null,
         body.ghi_chu || null, body.trang_thai || "hoat_dong"]
      );
      const newRow = await queryOne("SELECT * FROM doi_tuong WHERE id = ?", [(result as any)[0]?.insertId ?? (result as any).insertId]);
      return new Response(JSON.stringify({ data: newRow }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (path.match(/^\/doi-tuong\/\d+$/) && method === "PUT") {
      const id = path.split("/")[2];
      const body = await req.json();
      await query(
        `UPDATE doi_tuong SET loai_doi_tuong=?, ten_doi_tuong=?, ma_so_thue=?, dia_chi=?, dien_thoai=?, email=?, ghi_chu=?, trang_thai=? WHERE id=?`,
        [body.loai_doi_tuong, body.ten_doi_tuong, body.ma_so_thue || null,
         body.dia_chi || null, body.dien_thoai || null, body.email || null,
         body.ghi_chu || null, body.trang_thai, id]
      );
      const updated = await queryOne("SELECT * FROM doi_tuong WHERE id = ?", [id]);
      return new Response(JSON.stringify({ data: updated }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (path.match(/^\/doi-tuong\/\d+$/) && method === "DELETE") {
      const id = path.split("/")[2];
      await query("UPDATE doi_tuong SET trang_thai = 'khong_hoat_dong' WHERE id = ?", [id]);
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ===================== DONG TIEN MOI =====================

    if (path === "/dong-tien-moi" && method === "GET") {
      const urlObj = new URL(req.url);
      const page = parseInt(urlObj.searchParams.get("page") || "1");
      const limit = parseInt(urlObj.searchParams.get("limit") || "20");
      const offset = (page - 1) * limit;
      const dateFrom = urlObj.searchParams.get("date_from") || "";
      const dateTo = urlObj.searchParams.get("date_to") || "";
      const loaiGD = urlObj.searchParams.get("loai_giao_dich") || "";
      const taiKhoanId = urlObj.searchParams.get("tai_khoan_tien_id") || "";
      const phamVi = urlObj.searchParams.get("pham_vi") || "";
      const hangMucId = urlObj.searchParams.get("hang_muc_thu_chi_id") || "";
      const khachHangId = urlObj.searchParams.get("khach_hang_id") || "";
      const nhaCungCapId = urlObj.searchParams.get("nha_cung_cap_id") || "";
      const hopDongId = urlObj.searchParams.get("hop_dong_id") || "";
      const hopDongMuaIdFilter = urlObj.searchParams.get("hop_dong_mua_id") || "";
      const search = urlObj.searchParams.get("search") || "";
      const trangThai = urlObj.searchParams.get("trang_thai") || "";

      const ngayGDExact = urlObj.searchParams.get("ngay_giao_dich") || "";

      const conditions: string[] = [];
      const params: any[] = [];
      if (ngayGDExact) { conditions.push("dt.ngay_giao_dich = ?"); params.push(ngayGDExact); }
      if (dateFrom) { conditions.push("DATE(dt.ngay_giao_dich) >= ?"); params.push(dateFrom); }
      if (dateTo) { conditions.push("DATE(dt.ngay_giao_dich) <= ?"); params.push(dateTo); }
      if (loaiGD) { conditions.push("dt.loai_giao_dich = ?"); params.push(loaiGD); }
      if (taiKhoanId) { conditions.push("(dt.tai_khoan_tien_id = ? OR dt.tai_khoan_nhan_id = ?)"); params.push(taiKhoanId, taiKhoanId); }
      if (hangMucId) { conditions.push("dt.hang_muc_thu_chi_id = ?"); params.push(hangMucId); }
      if (khachHangId) { conditions.push("dt.khach_hang_id = ?"); params.push(khachHangId); }
      if (nhaCungCapId) { conditions.push("dt.nha_cung_cap_id = ?"); params.push(nhaCungCapId); }
      if (hopDongId) { conditions.push("dt.hop_dong_id = ?"); params.push(hopDongId); }
      if (hopDongMuaIdFilter) { conditions.push("dt.hop_dong_mua_id = ?"); params.push(hopDongMuaIdFilter); }
      if (trangThai) { conditions.push("dt.trang_thai = ?"); params.push(trangThai); }
      if (phamVi) { conditions.push("hm.pham_vi = ?"); params.push(phamVi); }
      if (search) {
        conditions.push("(dt.mo_ta_giao_dich LIKE ? OR dt.ghi_chu LIKE ? OR dt.ma_giao_dich LIKE ?)");
        const s = `%${search}%`;
        params.push(s, s, s);
      }

      const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
      const countRow = await queryOne(
        `SELECT COUNT(*) AS total FROM dong_tien_moi dt
         LEFT JOIN hang_muc_thu_chi hm ON hm.id = dt.hang_muc_thu_chi_id
         ${where}`,
        params
      );

      const rows = await query(
        `SELECT dt.*,
          tkt.ten_tai_khoan, tkt.loai_tai_khoan, tkt.ngan_hang,
          tkn.ten_tai_khoan AS ten_tai_khoan_nhan,
          hm.ten_hang_muc, hm.pham_vi AS pham_vi_hang_muc, hm.loai_giao_dich AS loai_hang_muc,
          hm.parent_id AS hang_muc_parent_id,
          kh.ten_cong_ty,
          ncc.ten_nha_cung_cap,
          hd.so_hop_dong,
          hdm.so_hop_dong AS so_hop_dong_mua,
          dt2.ten_doi_tuong
         FROM dong_tien_moi dt
         LEFT JOIN tai_khoan_tien tkt ON tkt.id = dt.tai_khoan_tien_id
         LEFT JOIN tai_khoan_tien tkn ON tkn.id = dt.tai_khoan_nhan_id
         LEFT JOIN hang_muc_thu_chi hm ON hm.id = dt.hang_muc_thu_chi_id
         LEFT JOIN khach_hang kh ON kh.id = dt.khach_hang_id
         LEFT JOIN nha_cung_cap ncc ON ncc.id = dt.nha_cung_cap_id
         LEFT JOIN hop_dong hd ON hd.id = dt.hop_dong_id
         LEFT JOIN hop_dong_mua hdm ON hdm.id = dt.hop_dong_mua_id
         LEFT JOIN doi_tuong dt2 ON dt2.id = dt.doi_tuong_id
         ${where}
         ORDER BY dt.ngay_giao_dich DESC, dt.id DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );

      return new Response(JSON.stringify({ data: rows, total: countRow?.total || 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (path === "/dong-tien-moi" && method === "POST") {
      const body = await req.json();

      // Parse date
      let ngayGD: string;
      const rawNgay = body.ngay_giao_dich || "";
      const dmyMatch = String(rawNgay).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{2}:\d{2}:\d{2}))?/);
      if (dmyMatch) {
        const [, d, m, y, t] = dmyMatch;
        ngayGD = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")} ${t || "00:00:00"}`;
      } else if (/^\d{4}-\d{2}-\d{2}/.test(String(rawNgay))) {
        ngayGD = String(rawNgay).slice(0, 10) + " 00:00:00";
      } else {
        ngayGD = new Date().toISOString().slice(0, 19).replace("T", " ");
      }

      // Auto-generate ma_giao_dich
      const now = new Date();
      const maGD = body.ma_giao_dich || `GD${now.getFullYear()}${String(now.getMonth()+1).padStart(2,"0")}${String(now.getDate()).padStart(2,"0")}${String(now.getTime()).slice(-6)}`;

      // Calculate so_du_sau_giao_dich
      let soDuSau = body.so_du_sau_giao_dich ?? null;
      if (soDuSau === null && body.tai_khoan_tien_id) {
        const lastRow = await queryOne(
          "SELECT so_du_sau_giao_dich FROM dong_tien_moi WHERE tai_khoan_tien_id = ? ORDER BY ngay_giao_dich DESC, id DESC LIMIT 1",
          [body.tai_khoan_tien_id]
        );
        const prev = lastRow?.so_du_sau_giao_dich != null ? Number(lastRow.so_du_sau_giao_dich) : null;
        if (prev !== null) {
          const soTien = Number(body.so_tien) || 0;
          if (body.loai_giao_dich === "thu") soDuSau = prev + soTien;
          else if (body.loai_giao_dich === "chi") soDuSau = prev - soTien;
          else soDuSau = prev;
        }
      }

      const result = await query(
        `INSERT INTO dong_tien_moi (ma_giao_dich, ngay_giao_dich, ngay_hach_toan, loai_giao_dich, tai_khoan_tien_id, tai_khoan_nhan_id, so_tien, doi_tuong_id, khach_hang_id, nha_cung_cap_id, hop_dong_id, hop_dong_mua_id, hang_muc_thu_chi_id, mo_ta_giao_dich, so_tai_khoan_doi_ung, ten_tai_khoan_doi_ung, so_du_sau_giao_dich, nguon_du_lieu, ma_tham_chieu, ghi_chu, trang_thai)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [maGD, ngayGD, ngayGD.slice(0, 10), body.loai_giao_dich, body.tai_khoan_tien_id,
         body.tai_khoan_nhan_id || null, Number(body.so_tien) || 0,
         body.doi_tuong_id || null, body.khach_hang_id || null, body.nha_cung_cap_id || null,
         body.hop_dong_id || null, body.hop_dong_mua_id || null, body.hang_muc_thu_chi_id || null,
         body.mo_ta_giao_dich || null, body.so_tai_khoan_doi_ung || null, body.ten_tai_khoan_doi_ung || null,
         soDuSau, body.nguon_du_lieu || "nhap_tay", body.ma_tham_chieu || null,
         body.ghi_chu || null, body.trang_thai || "hoan_thanh"]
      );
      const newRow = await queryOne("SELECT * FROM dong_tien_moi WHERE id = ?", [(result as any)[0]?.insertId ?? (result as any).insertId]);
      return new Response(JSON.stringify({ data: newRow }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (path.match(/^\/dong-tien-moi\/\d+$/) && method === "PUT") {
      const id = path.split("/")[2];
      const body = await req.json();
      let ngayGD: string;
      const rawNgay = body.ngay_giao_dich || "";
      const dmyMatch2 = String(rawNgay).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{2}:\d{2}:\d{2}))?/);
      if (dmyMatch2) {
        const [, d, m, y, t] = dmyMatch2;
        ngayGD = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")} ${t || "00:00:00"}`;
      } else if (/^\d{4}-\d{2}-\d{2}/.test(String(rawNgay))) {
        ngayGD = String(rawNgay).slice(0, 10) + " 00:00:00";
      } else {
        ngayGD = new Date().toISOString().slice(0, 19).replace("T", " ");
      }
      await query(
        `UPDATE dong_tien_moi SET ngay_giao_dich=?, ngay_hach_toan=?, loai_giao_dich=?, tai_khoan_tien_id=?, tai_khoan_nhan_id=?, so_tien=?, doi_tuong_id=?, khach_hang_id=?, nha_cung_cap_id=?, hop_dong_id=?, hop_dong_mua_id=?, hang_muc_thu_chi_id=?, mo_ta_giao_dich=?, so_tai_khoan_doi_ung=?, ten_tai_khoan_doi_ung=?, so_du_sau_giao_dich=?, ghi_chu=?, trang_thai=? WHERE id=?`,
        [ngayGD, ngayGD.slice(0, 10), body.loai_giao_dich, body.tai_khoan_tien_id,
         body.tai_khoan_nhan_id || null, Number(body.so_tien) || 0,
         body.doi_tuong_id || null, body.khach_hang_id || null, body.nha_cung_cap_id || null,
         body.hop_dong_id || null, body.hop_dong_mua_id || null, body.hang_muc_thu_chi_id || null,
         body.mo_ta_giao_dich || null, body.so_tai_khoan_doi_ung || null, body.ten_tai_khoan_doi_ung || null,
         body.so_du_sau_giao_dich ?? null, body.ghi_chu || null, body.trang_thai || "hoan_thanh", id]
      );
      const updated = await queryOne("SELECT * FROM dong_tien_moi WHERE id = ?", [id]);
      return new Response(JSON.stringify({ data: updated }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (path.match(/^\/dong-tien-moi\/\d+$/) && method === "DELETE") {
      const id = path.split("/")[2];
      await query("DELETE FROM dong_tien_moi WHERE id = ?", [id]);
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ===================== DONG TIEN FILE =====================

    if (path === "/dong-tien-file" && method === "GET") {
      const urlObj = new URL(req.url);
      const dtId = urlObj.searchParams.get("dong_tien_id") || "";
      const rows = await query("SELECT * FROM dong_tien_file WHERE dong_tien_id = ? ORDER BY id DESC", [dtId]);
      return new Response(JSON.stringify({ data: rows }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (path === "/dong-tien-file" && method === "POST") {
      const body = await req.json();
      const result = await query(
        `INSERT INTO dong_tien_file (dong_tien_id, ten_file, file_url, google_drive_file_id, loai_file, ghi_chu) VALUES (?, ?, ?, ?, ?, ?)`,
        [body.dong_tien_id, body.ten_file, body.file_url || null, body.google_drive_file_id || null, body.loai_file || "khac", body.ghi_chu || null]
      );
      const newRow = await queryOne("SELECT * FROM dong_tien_file WHERE id = ?", [(result as any)[0]?.insertId ?? (result as any).insertId]);
      return new Response(JSON.stringify({ data: newRow }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (path.match(/^\/dong-tien-file\/\d+$/) && method === "DELETE") {
      const id = path.split("/")[2];
      await query("DELETE FROM dong_tien_file WHERE id = ?", [id]);
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ===================== DONG TIEN PHAN BO =====================

    if (path === "/dong-tien-phan-bo" && method === "GET") {
      const urlObj = new URL(req.url);
      const dtId = urlObj.searchParams.get("dong_tien_id") || "";
      const rows = await query("SELECT * FROM dong_tien_phan_bo WHERE dong_tien_id = ? ORDER BY id", [dtId]);
      return new Response(JSON.stringify({ data: rows }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (path === "/dong-tien-phan-bo" && method === "POST") {
      const body = await req.json();
      const result = await query(
        `INSERT INTO dong_tien_phan_bo (dong_tien_id, hop_dong_id, hop_dong_mua_id, khach_hang_id, nha_cung_cap_id, hang_muc_thu_chi_id, so_tien_phan_bo, ghi_chu) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [body.dong_tien_id, body.hop_dong_id || null, body.hop_dong_mua_id || null, body.khach_hang_id || null, body.nha_cung_cap_id || null, body.hang_muc_thu_chi_id || null, body.so_tien_phan_bo || 0, body.ghi_chu || null]
      );
      const newRow = await queryOne("SELECT * FROM dong_tien_phan_bo WHERE id = ?", [(result as any)[0]?.insertId ?? (result as any).insertId]);
      return new Response(JSON.stringify({ data: newRow }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (path.match(/^\/dong-tien-phan-bo\/\d+$/) && method === "DELETE") {
      const id = path.split("/")[2];
      await query("DELETE FROM dong_tien_phan_bo WHERE id = ?", [id]);
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ===================== BAO CAO DONG TIEN MOI =====================

    if (path === "/bao-cao-dong-tien-moi" && method === "GET") {
      const urlObj = new URL(req.url);
      const dateFrom = urlObj.searchParams.get("date_from") || "";
      const dateTo = urlObj.searchParams.get("date_to") || "";
      const taiKhoanId = urlObj.searchParams.get("tai_khoan_tien_id") || "";
      const phamVi = urlObj.searchParams.get("pham_vi") || "";

      const conditions: string[] = [];
      const params: any[] = [];
      if (dateFrom) { conditions.push("DATE(dt.ngay_giao_dich) >= ?"); params.push(dateFrom); }
      if (dateTo) { conditions.push("DATE(dt.ngay_giao_dich) <= ?"); params.push(dateTo); }
      if (taiKhoanId) { conditions.push("(dt.tai_khoan_tien_id = ? OR dt.tai_khoan_nhan_id = ?)"); params.push(taiKhoanId, taiKhoanId); }
      if (phamVi) { conditions.push("hm.pham_vi = ?"); params.push(phamVi); }
      const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";

      const [tongThu, tongChi, theoTaiKhoan, theoHangMuc, theoHopDong, chuaCoHangMuc] = await Promise.all([
        queryOne(`SELECT COALESCE(SUM(dt.so_tien),0) AS tong FROM dong_tien_moi dt LEFT JOIN hang_muc_thu_chi hm ON hm.id=dt.hang_muc_thu_chi_id ${where ? where + " AND" : "WHERE"} dt.loai_giao_dich='thu'`, params),
        queryOne(`SELECT COALESCE(SUM(dt.so_tien),0) AS tong FROM dong_tien_moi dt LEFT JOIN hang_muc_thu_chi hm ON hm.id=dt.hang_muc_thu_chi_id ${where ? where + " AND" : "WHERE"} dt.loai_giao_dich='chi'`, params),
        query(`SELECT tkt.ten_tai_khoan, dt.loai_giao_dich, COALESCE(SUM(dt.so_tien),0) AS tong FROM dong_tien_moi dt LEFT JOIN tai_khoan_tien tkt ON tkt.id=dt.tai_khoan_tien_id LEFT JOIN hang_muc_thu_chi hm ON hm.id=dt.hang_muc_thu_chi_id ${where} GROUP BY tkt.ten_tai_khoan, dt.loai_giao_dich ORDER BY tkt.ten_tai_khoan`, params),
        query(`SELECT hm.ten_hang_muc, hm.pham_vi, COALESCE(SUM(dt.so_tien),0) AS tong, COUNT(*) AS so_gd FROM dong_tien_moi dt LEFT JOIN hang_muc_thu_chi hm ON hm.id=dt.hang_muc_thu_chi_id ${where ? where + " AND" : "WHERE"} dt.loai_giao_dich='chi' GROUP BY hm.ten_hang_muc, hm.pham_vi ORDER BY tong DESC LIMIT 20`, params),
        query(`SELECT hd.so_hop_dong, COALESCE(SUM(dt.so_tien),0) AS tong FROM dong_tien_moi dt LEFT JOIN hop_dong hd ON hd.id=dt.hop_dong_id LEFT JOIN hang_muc_thu_chi hm ON hm.id=dt.hang_muc_thu_chi_id ${where ? where + " AND" : "WHERE"} dt.hop_dong_id IS NOT NULL GROUP BY hd.so_hop_dong ORDER BY tong DESC`, params),
        queryOne(`SELECT COUNT(*) AS cnt FROM dong_tien_moi dt LEFT JOIN hang_muc_thu_chi hm ON hm.id=dt.hang_muc_thu_chi_id ${where ? where + " AND" : "WHERE"} dt.hang_muc_thu_chi_id IS NULL AND dt.loai_giao_dich IN ('thu','chi')`, params),
      ]);

      return new Response(JSON.stringify({
        tong_thu: Number(tongThu?.tong || 0),
        tong_chi: Number(tongChi?.tong || 0),
        dong_tien_thuan: Number(tongThu?.tong || 0) - Number(tongChi?.tong || 0),
        theo_tai_khoan: theoTaiKhoan,
        theo_hang_muc: theoHangMuc,
        theo_hop_dong: theoHopDong,
        chua_co_hang_muc: Number(chuaCoHangMuc?.cnt || 0),
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Not found", path }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message, stack: err.stack }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
