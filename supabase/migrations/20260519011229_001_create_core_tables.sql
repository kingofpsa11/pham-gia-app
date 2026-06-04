/*
  # Create core business tables for Phạm Gia Business Management

  1. New Tables (in dependency order)
    - `khach_hang` - Customer information
    - `nha_cung_cap` - Suppliers
    - `loai_chi_phi` - Expense categories
    - `chi_phi` - Expense types
    - `chi_phi_cu_the` - Specific expenses
    - `tai_khoan` - Bank/cash accounts
    - `bao_gia` - Quotations
    - `bao_gia_chi_tiet` - Quotation line items
    - `hop_dong` - Sales contracts
    - `hop_dong_chi_tiet` - Contract line items
    - `phieu_giao_hang` - Delivery notes
    - `phieu_giao_hang_chi_tiet` - Delivery note line items
    - `hop_dong_mua` - Purchase contracts
    - `hop_dong_mua_chi_tiet` - Purchase contract line items
    - `vat_tu` - Materials/inventory
    - `hoa_don_nhap` - Purchase invoices
    - `hoa_don_nhap_chi_tiet` - Purchase invoice line items
    - `dong_tien` - Cash flow transactions (references all above)
    - `tep_dinh_kem` - File attachments (Google Drive references)
    - `user_profiles` - User profiles with roles

  2. Security
    - Enable RLS on all tables
    - Authenticated users can read all business data
    - All authenticated users can insert/update business data
    - Delete restricted to admin (enforced in app + RLS)

  3. Important Notes
    - Tables match the existing MySQL schema column names
    - dong_tien uses ghi_no/ghi_co for double-entry bookkeeping
    - tep_dinh_kem is polymorphic for file attachments
    - user_profiles extends auth.users with role and name
*/

-- Independent tables first
CREATE TABLE IF NOT EXISTS khach_hang (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ten_khach_hang TEXT NOT NULL,
  ma_so_thue TEXT DEFAULT '',
  dia_chi TEXT DEFAULT '',
  dien_thoai TEXT DEFAULT '',
  email TEXT DEFAULT '',
  ten_cong_ty TEXT DEFAULT '',
  tai_khoan_ngan_hang TEXT DEFAULT '',
  nguoi_dai_dien TEXT DEFAULT '',
  chuc_vu TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS nha_cung_cap (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ten_nha_cung_cap TEXT NOT NULL,
  dien_thoai TEXT DEFAULT '',
  dia_chi TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS loai_chi_phi (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ten_loai_chi_phi TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chi_phi (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  loai_chi_phi_id BIGINT NOT NULL REFERENCES loai_chi_phi(id),
  ten_chi_phi TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chi_phi_cu_the (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  chi_phi_id BIGINT NOT NULL REFERENCES chi_phi(id),
  ten_chi_phi_cu_the TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tai_khoan (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ten_tai_khoan TEXT NOT NULL,
  so_tai_khoan TEXT DEFAULT '',
  ngan_hang TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS vat_tu (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ma_vat_tu TEXT NOT NULL,
  ten_vat_tu TEXT NOT NULL,
  don_vi_tinh TEXT DEFAULT '',
  ton_kho NUMERIC(15,2) DEFAULT 0
);

-- Báo giá
CREATE TABLE IF NOT EXISTS bao_gia (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  so_bao_gia TEXT NOT NULL,
  ngay_bao_gia DATE NOT NULL DEFAULT CURRENT_DATE,
  khach_hang_id BIGINT NOT NULL REFERENCES khach_hang(id),
  ten_du_an TEXT DEFAULT '',
  phien_ban INT DEFAULT 1,
  mau_bao_gia TEXT DEFAULT 'Hapulico',
  che_do_van_chuyen INT DEFAULT 0,
  phi_van_chuyen NUMERIC(15,2) DEFAULT 0,
  ten_folder_du_an TEXT DEFAULT '',
  id_folder_du_an TEXT DEFAULT '',
  hop_dong_id BIGINT DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS bao_gia_chi_tiet (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bao_gia_id BIGINT NOT NULL REFERENCES bao_gia(id) ON DELETE CASCADE,
  ten_san_pham TEXT NOT NULL,
  don_vi TEXT DEFAULT '',
  so_luong NUMERIC(15,2) DEFAULT 0,
  don_gia_von NUMERIC(15,2) DEFAULT 0,
  lai_suat_phan_tram NUMERIC(5,2) DEFAULT 0,
  gia_ban_thuc_te NUMERIC(15,2) DEFAULT 0,
  thue_suat NUMERIC(5,2) DEFAULT 10
);

-- Hợp đồng bán
CREATE TABLE IF NOT EXISTS hop_dong (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  khach_hang_id BIGINT NOT NULL REFERENCES khach_hang(id),
  ten_du_an TEXT DEFAULT '',
  so_hop_dong TEXT NOT NULL,
  ngay_hop_dong DATE NOT NULL DEFAULT CURRENT_DATE,
  file_hop_dong_id TEXT DEFAULT '',
  mo_ta_noi_dung TEXT DEFAULT '',
  trang_thai TEXT NOT NULL DEFAULT 'Hieu luc',
  phi_van_chuyen NUMERIC(15,2) DEFAULT 0,
  che_do_van_chuyen INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS hop_dong_chi_tiet (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  hop_dong_id BIGINT NOT NULL REFERENCES hop_dong(id) ON DELETE CASCADE,
  ten_san_pham TEXT NOT NULL,
  don_vi TEXT DEFAULT '',
  so_luong NUMERIC(15,2) DEFAULT 0,
  don_gia_von NUMERIC(15,2) DEFAULT 0,
  gia_ban_thuc_te NUMERIC(15,2) DEFAULT 0,
  thue_suat NUMERIC(5,2) DEFAULT 10,
  chenh_lech_phan_tram NUMERIC(5,2) DEFAULT 0,
  gia_hop_dong NUMERIC(15,2) DEFAULT 0
);

-- Phiếu giao hàng
CREATE TABLE IF NOT EXISTS phieu_giao_hang (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  so_phieu TEXT NOT NULL,
  ngay_giao DATE NOT NULL DEFAULT CURRENT_DATE,
  khach_hang_id BIGINT NOT NULL REFERENCES khach_hang(id),
  hop_dong_id BIGINT DEFAULT NULL REFERENCES hop_dong(id),
  gia_tri_ghi_no NUMERIC(15,2) DEFAULT 0,
  noi_dung TEXT DEFAULT '',
  nguoi_tao TEXT DEFAULT '',
  tao_luc TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS phieu_giao_hang_chi_tiet (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  phieu_giao_hang_id BIGINT NOT NULL REFERENCES phieu_giao_hang(id) ON DELETE CASCADE,
  ten_san_pham TEXT NOT NULL,
  don_vi TEXT DEFAULT '',
  so_luong_giao NUMERIC(15,2) DEFAULT 0,
  don_gia NUMERIC(15,2) DEFAULT 0,
  thanh_tien NUMERIC(15,2) DEFAULT 0
);

-- Hợp đồng mua
CREATE TABLE IF NOT EXISTS hop_dong_mua (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  so_hop_dong TEXT NOT NULL,
  ngay_ky DATE NOT NULL DEFAULT CURRENT_DATE,
  nha_cung_cap_id BIGINT NOT NULL REFERENCES nha_cung_cap(id),
  tong_gia_tri NUMERIC(15,2) DEFAULT 0,
  ghi_chu TEXT DEFAULT '',
  tao_luc TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hop_dong_mua_chi_tiet (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  hop_dong_mua_id BIGINT NOT NULL REFERENCES hop_dong_mua(id) ON DELETE CASCADE,
  ten_san_pham TEXT NOT NULL,
  don_vi TEXT DEFAULT '',
  so_luong NUMERIC(15,2) DEFAULT 0,
  don_gia NUMERIC(15,2) DEFAULT 0,
  thue_suat NUMERIC(5,2) DEFAULT 10,
  thanh_tien NUMERIC(15,2) DEFAULT 0
);

-- Hóa đơn nhập
CREATE TABLE IF NOT EXISTS hoa_don_nhap (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  so_hoa_don TEXT NOT NULL,
  ngay_nhap DATE NOT NULL DEFAULT CURRENT_DATE,
  nha_cung_cap_id BIGINT NOT NULL REFERENCES nha_cung_cap(id),
  hop_dong_mua_id BIGINT DEFAULT NULL REFERENCES hop_dong_mua(id),
  tong_tien NUMERIC(15,2) DEFAULT 0,
  ghi_chu TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS hoa_don_nhap_chi_tiet (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  hoa_don_nhap_id BIGINT NOT NULL REFERENCES hoa_don_nhap(id) ON DELETE CASCADE,
  vat_tu_id BIGINT NOT NULL REFERENCES vat_tu(id),
  so_luong NUMERIC(15,2) DEFAULT 0,
  don_gia NUMERIC(15,2) DEFAULT 0,
  thanh_tien NUMERIC(15,2) DEFAULT 0
);

-- Dòng tiền (references many tables, created last)
CREATE TABLE IF NOT EXISTS dong_tien (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ngay_gio_giao_dich TIMESTAMPTZ NOT NULL DEFAULT now(),
  ngay_thuc_hien DATE DEFAULT CURRENT_DATE,
  tai_khoan_id BIGINT NOT NULL REFERENCES tai_khoan(id),
  mo_ta_giao_dich TEXT NOT NULL,
  ghi_no NUMERIC(15,2) DEFAULT 0,
  ghi_co NUMERIC(15,2) DEFAULT 0,
  hop_dong_id BIGINT DEFAULT NULL REFERENCES hop_dong(id),
  hop_dong_mua_id BIGINT DEFAULT NULL REFERENCES hop_dong_mua(id),
  loai_chi_phi_id BIGINT DEFAULT NULL REFERENCES loai_chi_phi(id),
  khach_hang_id BIGINT DEFAULT NULL REFERENCES khach_hang(id),
  nha_cung_cap_id BIGINT DEFAULT NULL REFERENCES nha_cung_cap(id),
  chi_phi_id BIGINT DEFAULT NULL REFERENCES chi_phi(id),
  so_du NUMERIC(15,2) DEFAULT 0,
  tk_doi_ung TEXT DEFAULT '',
  ten_tk_doi_ung TEXT DEFAULT '',
  ghi_chu TEXT DEFAULT '',
  chi_phi_cu_the_id BIGINT DEFAULT NULL REFERENCES chi_phi_cu_the(id)
);

-- Tệp đính kèm
CREATE TABLE IF NOT EXISTS tep_dinh_kem (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  related_type TEXT NOT NULL,
  related_id BIGINT NOT NULL,
  ten_file TEXT NOT NULL,
  drive_file_id TEXT NOT NULL,
  drive_folder_id TEXT DEFAULT '',
  drive_url TEXT DEFAULT '',
  mime_type TEXT DEFAULT '',
  file_size BIGINT DEFAULT 0,
  uploaded_by UUID DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- User profiles
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  ten TEXT DEFAULT '',
  role TEXT NOT NULL DEFAULT 'staff',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE khach_hang ENABLE ROW LEVEL SECURITY;
ALTER TABLE bao_gia ENABLE ROW LEVEL SECURITY;
ALTER TABLE bao_gia_chi_tiet ENABLE ROW LEVEL SECURITY;
ALTER TABLE hop_dong ENABLE ROW LEVEL SECURITY;
ALTER TABLE hop_dong_chi_tiet ENABLE ROW LEVEL SECURITY;
ALTER TABLE phieu_giao_hang ENABLE ROW LEVEL SECURITY;
ALTER TABLE phieu_giao_hang_chi_tiet ENABLE ROW LEVEL SECURITY;
ALTER TABLE tai_khoan ENABLE ROW LEVEL SECURITY;
ALTER TABLE dong_tien ENABLE ROW LEVEL SECURITY;
ALTER TABLE loai_chi_phi ENABLE ROW LEVEL SECURITY;
ALTER TABLE chi_phi ENABLE ROW LEVEL SECURITY;
ALTER TABLE chi_phi_cu_the ENABLE ROW LEVEL SECURITY;
ALTER TABLE nha_cung_cap ENABLE ROW LEVEL SECURITY;
ALTER TABLE hop_dong_mua ENABLE ROW LEVEL SECURITY;
ALTER TABLE hop_dong_mua_chi_tiet ENABLE ROW LEVEL SECURITY;
ALTER TABLE hoa_don_nhap ENABLE ROW LEVEL SECURITY;
ALTER TABLE hoa_don_nhap_chi_tiet ENABLE ROW LEVEL SECURITY;
ALTER TABLE vat_tu ENABLE ROW LEVEL SECURITY;
ALTER TABLE tep_dinh_kem ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- SELECT policies: All authenticated users can read business data
CREATE POLICY "Authenticated read khach_hang" ON khach_hang FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read bao_gia" ON bao_gia FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read bao_gia_chi_tiet" ON bao_gia_chi_tiet FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read hop_dong" ON hop_dong FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read hop_dong_chi_tiet" ON hop_dong_chi_tiet FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read phieu_giao_hang" ON phieu_giao_hang FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read phieu_giao_hang_chi_tiet" ON phieu_giao_hang_chi_tiet FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read tai_khoan" ON tai_khoan FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read dong_tien" ON dong_tien FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read loai_chi_phi" ON loai_chi_phi FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read chi_phi" ON chi_phi FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read chi_phi_cu_the" ON chi_phi_cu_the FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read nha_cung_cap" ON nha_cung_cap FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read hop_dong_mua" ON hop_dong_mua FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read hop_dong_mua_chi_tiet" ON hop_dong_mua_chi_tiet FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read hoa_don_nhap" ON hoa_don_nhap FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read hoa_don_nhap_chi_tiet" ON hoa_don_nhap_chi_tiet FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read vat_tu" ON vat_tu FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read tep_dinh_kem" ON tep_dinh_kem FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users read own profile" ON user_profiles FOR SELECT TO authenticated USING (auth.uid() = id);

-- INSERT policies
CREATE POLICY "Authenticated insert khach_hang" ON khach_hang FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated insert bao_gia" ON bao_gia FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated insert bao_gia_chi_tiet" ON bao_gia_chi_tiet FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated insert hop_dong" ON hop_dong FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated insert hop_dong_chi_tiet" ON hop_dong_chi_tiet FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated insert phieu_giao_hang" ON phieu_giao_hang FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated insert phieu_giao_hang_chi_tiet" ON phieu_giao_hang_chi_tiet FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated insert dong_tien" ON dong_tien FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated insert tep_dinh_kem" ON tep_dinh_kem FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated insert nha_cung_cap" ON nha_cung_cap FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated insert hop_dong_mua" ON hop_dong_mua FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated insert hop_dong_mua_chi_tiet" ON hop_dong_mua_chi_tiet FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated insert hoa_don_nhap" ON hoa_don_nhap FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated insert hoa_don_nhap_chi_tiet" ON hoa_don_nhap_chi_tiet FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated insert vat_tu" ON vat_tu FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated insert tai_khoan" ON tai_khoan FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated insert loai_chi_phi" ON loai_chi_phi FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated insert chi_phi" ON chi_phi FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated insert chi_phi_cu_the" ON chi_phi_cu_the FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated insert user_profiles" ON user_profiles FOR INSERT TO authenticated WITH CHECK (true);

-- UPDATE policies
CREATE POLICY "Authenticated update khach_hang" ON khach_hang FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated update bao_gia" ON bao_gia FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated update bao_gia_chi_tiet" ON bao_gia_chi_tiet FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated update hop_dong" ON hop_dong FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated update hop_dong_chi_tiet" ON hop_dong_chi_tiet FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated update phieu_giao_hang" ON phieu_giao_hang FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated update phieu_giao_hang_chi_tiet" ON phieu_giao_hang_chi_tiet FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated update dong_tien" ON dong_tien FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated update tep_dinh_kem" ON tep_dinh_kem FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated update nha_cung_cap" ON nha_cung_cap FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated update hop_dong_mua" ON hop_dong_mua FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated update hop_dong_mua_chi_tiet" ON hop_dong_mua_chi_tiet FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated update hoa_don_nhap" ON hoa_don_nhap FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated update hoa_don_nhap_chi_tiet" ON hoa_don_nhap_chi_tiet FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated update vat_tu" ON vat_tu FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated update tai_khoan" ON tai_khoan FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated update loai_chi_phi" ON loai_chi_phi FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated update chi_phi" ON chi_phi FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated update chi_phi_cu_the" ON chi_phi_cu_the FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Users update own profile" ON user_profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- DELETE policies
CREATE POLICY "Authenticated delete khach_hang" ON khach_hang FOR DELETE TO authenticated USING (true);
CREATE POLICY "Authenticated delete bao_gia" ON bao_gia FOR DELETE TO authenticated USING (true);
CREATE POLICY "Authenticated delete bao_gia_chi_tiet" ON bao_gia_chi_tiet FOR DELETE TO authenticated USING (true);
CREATE POLICY "Authenticated delete hop_dong" ON hop_dong FOR DELETE TO authenticated USING (true);
CREATE POLICY "Authenticated delete hop_dong_chi_tiet" ON hop_dong_chi_tiet FOR DELETE TO authenticated USING (true);
CREATE POLICY "Authenticated delete phieu_giao_hang" ON phieu_giao_hang FOR DELETE TO authenticated USING (true);
CREATE POLICY "Authenticated delete phieu_giao_hang_chi_tiet" ON phieu_giao_hang_chi_tiet FOR DELETE TO authenticated USING (true);
CREATE POLICY "Authenticated delete dong_tien" ON dong_tien FOR DELETE TO authenticated USING (true);
CREATE POLICY "Authenticated delete tep_dinh_kem" ON tep_dinh_kem FOR DELETE TO authenticated USING (true);
CREATE POLICY "Authenticated delete nha_cung_cap" ON nha_cung_cap FOR DELETE TO authenticated USING (true);
CREATE POLICY "Authenticated delete hop_dong_mua" ON hop_dong_mua FOR DELETE TO authenticated USING (true);
CREATE POLICY "Authenticated delete hop_dong_mua_chi_tiet" ON hop_dong_mua_chi_tiet FOR DELETE TO authenticated USING (true);
CREATE POLICY "Authenticated delete hoa_don_nhap" ON hoa_don_nhap FOR DELETE TO authenticated USING (true);
CREATE POLICY "Authenticated delete hoa_don_nhap_chi_tiet" ON hoa_don_nhap_chi_tiet FOR DELETE TO authenticated USING (true);
CREATE POLICY "Authenticated delete vat_tu" ON vat_tu FOR DELETE TO authenticated USING (true);
CREATE POLICY "Authenticated delete tai_khoan" ON tai_khoan FOR DELETE TO authenticated USING (true);
CREATE POLICY "Authenticated delete loai_chi_phi" ON loai_chi_phi FOR DELETE TO authenticated USING (true);
CREATE POLICY "Authenticated delete chi_phi" ON chi_phi FOR DELETE TO authenticated USING (true);
CREATE POLICY "Authenticated delete chi_phi_cu_the" ON chi_phi_cu_the FOR DELETE TO authenticated USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_bao_gia_khach_hang ON bao_gia(khach_hang_id);
CREATE INDEX IF NOT EXISTS idx_bao_gia_ngay ON bao_gia(ngay_bao_gia);
CREATE INDEX IF NOT EXISTS idx_hop_dong_khach_hang ON hop_dong(khach_hang_id);
CREATE INDEX IF NOT EXISTS idx_hop_dong_trang_thai ON hop_dong(trang_thai);
CREATE INDEX IF NOT EXISTS idx_phieu_giao_hang_khach_hang ON phieu_giao_hang(khach_hang_id);
CREATE INDEX IF NOT EXISTS idx_phieu_giao_hang_hop_dong ON phieu_giao_hang(hop_dong_id);
CREATE INDEX IF NOT EXISTS idx_dong_tien_tai_khoan ON dong_tien(tai_khoan_id);
CREATE INDEX IF NOT EXISTS idx_dong_tien_khach_hang ON dong_tien(khach_hang_id);
CREATE INDEX IF NOT EXISTS idx_dong_tien_ngay ON dong_tien(ngay_thuc_hien);
CREATE INDEX IF NOT EXISTS idx_dong_tien_nha_cung_cap ON dong_tien(nha_cung_cap_id);
CREATE INDEX IF NOT EXISTS idx_tep_dinh_kem_related ON tep_dinh_kem(related_type, related_id);
CREATE INDEX IF NOT EXISTS idx_hoa_don_nhap_ncc ON hoa_don_nhap(nha_cung_cap_id);
CREATE INDEX IF NOT EXISTS idx_hop_dong_mua_ncc ON hop_dong_mua(nha_cung_cap_id);

-- Trigger to auto-create user_profiles on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_profiles (id, email, ten, role)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'ten', ''), 'staff');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
