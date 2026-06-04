import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const path = url.pathname.replace("/functions/v1/api", "");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify the user token
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user profile for role check
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role, ten")
      .eq("id", user.id)
      .single();

    const isAdmin = profile?.role === "admin";

    // Route: Dashboard stats
    if (path === "/dashboard" && req.method === "GET") {
      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];

      const [baoGia, hopDong, dongTien, phieuGiao, taiKhoan] = await Promise.all([
        supabase.from("bao_gia").select("id, khach_hang_id, hop_dong_id").gte("ngay_bao_gia", firstDay).lte("ngay_bao_gia", lastDay),
        supabase.from("hop_dong").select("id, trang_thai").eq("trang_thai", "Hieu luc"),
        supabase.from("dong_tien").select("ghi_no, ghi_co, tai_khoan_id, khach_hang_id, loai_chi_phi_id").gte("ngay_thuc_hien", firstDay).lte("ngay_thuc_hien", lastDay),
        supabase.from("phieu_giao_hang").select("gia_tri_ghi_no, khach_hang_id"),
        supabase.from("tai_khoan").select("id, ten_tai_khoan"),
      ]);

      const tongThu = (dongTien.data || []).reduce((s, d) => s + (d.ghi_no || 0), 0);
      const tongChi = (dongTien.data || []).reduce((s, d) => s + (d.ghi_co || 0), 0);
      const tongChiPhi = (dongTien.data || []).filter(d => d.loai_chi_phi_id).reduce((s, d) => s + (d.ghi_co || 0), 0);
      const tongGhiNo = (phieuGiao.data || []).reduce((s, p) => s + (p.gia_tri_ghi_no || 0), 0);
      const tongDaThu = (dongTien.data || []).filter(d => d.khach_hang_id).reduce((s, d) => s + (d.ghi_no || 0), 0);

      // Account balances
      const allDongTien = await supabase.from("dong_tien").select("ghi_no, ghi_co, tai_khoan_id");
      const accountBalances = (taiKhoan.data || []).map(tk => {
        const balance = (allDongTien.data || []).filter(d => d.tai_khoan_id === tk.id).reduce((s, d) => s + (d.ghi_no || 0) - (d.ghi_co || 0), 0);
        return { tai_khoan_id: tk.id, ten_tai_khoan: tk.ten_tai_khoan, so_du: balance };
      });

      return new Response(JSON.stringify({
        tong_bao_gia_thang: (baoGia.data || []).length,
        so_bao_gia_chuyen_hop_dong: (baoGia.data || []).filter(b => b.hop_dong_id).length,
        tong_hop_dong_hieu_luc: (hopDong.data || []).length,
        tong_tien_da_thu: tongThu,
        tong_tien_da_chi: tongChi,
        cong_no_phai_thu: tongGhiNo - tongDaThu,
        tong_chi_phi_thang: tongChiPhi,
        so_du_tai_khoan: accountBalances,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Route: Create admin user (setup only)
    if (path === "/setup-admin" && req.method === "POST") {
      const { email, password, ten } = await req.json();
      if (!email || !password) {
        return new Response(JSON.stringify({ error: "Email and password required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check if any admin exists
      const { data: existingAdmins } = await supabase
        .from("user_profiles")
        .select("id")
        .eq("role", "admin")
        .limit(1);

      if (existingAdmins && existingAdmins.length > 0) {
        return new Response(JSON.stringify({ error: "Admin already exists" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Update the profile to admin
      if (data.user) {
        await supabase
          .from("user_profiles")
          .update({ role: "admin", ten: ten || "" })
          .eq("id", data.user.id);
      }

      return new Response(JSON.stringify({ message: "Admin created successfully" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
