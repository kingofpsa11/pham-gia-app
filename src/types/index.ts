export interface KhachHang {
  id: number;
  ten_cong_ty: string;
  ma_so_thue?: string;
  dia_chi?: string;
  dien_thoai?: string;
  email?: string;
  tai_khoan_ngan_hang?: string;
  nguoi_dai_dien?: string;
  chuc_vu?: string;
}

export interface BaoGia {
  id: number;
  so_bao_gia: string;
  ngay_bao_gia: string;
  khach_hang_id: number;
  ten_du_an?: string;
  phien_ban: number;
  mau_bao_gia?: string;
  che_do_van_chuyen: number;
  phi_van_chuyen: number;
  ten_folder_du_an?: string;
  id_folder_du_an?: string;
  hop_dong_id?: number;
  khach_hang?: KhachHang;
  chi_tiet?: BaoGiaChiTiet[];
}

export interface BaoGiaChiTiet {
  id?: number;
  bao_gia_id?: number;
  ten_san_pham: string;
  don_vi: string;
  so_luong: number;
  don_gia_von: number;
  lai_suat_phan_tram: number;
  gia_ban_chua_van_chuyen: number;
  chi_phi_van_chuyen_phan_bo: number;
  gia_ban_thuc_te: number;
  thue_suat: number;
}

export interface HopDong {
  id: number;
  khach_hang_id: number;
  ten_du_an?: string;
  so_hop_dong: string;
  ngay_hop_dong: string;
  file_hop_dong_id?: string;
  mo_ta_noi_dung?: string;
  trang_thai: string;
  phi_van_chuyen: number;
  che_do_van_chuyen: number;
  /** Tỷ lệ tạm ứng (%) trên tổng HĐ gồm thuế — mặc định 30 */
  ty_le_tam_ung?: number;
  /** Giá trị tạm ứng (VND) */
  gia_tri_tam_ung?: number;
  ten_folder_du_an?: string;
  id_folder_du_an?: string;
  khach_hang?: KhachHang;
  chi_tiet?: HopDongChiTiet[];
}

export interface HopDongChiTiet {
  id?: number;
  hop_dong_id?: number;
  ten_san_pham: string;
  don_vi: string;
  so_luong: number;
  don_gia_von: number;
  lai_suat_phan_tram: number;
  gia_ban_thuc_te: number;
  thue_suat: number;
  chenh_lech_phan_tram: number;
  gia_hop_dong: number;
}

export interface PhuLucHopDong {
  id: number;
  hop_dong_id: number;
  so_phu_luc: string;
  ngay_ky?: string;
  tieu_de?: string;
  ly_do?: string;
  ghi_chu?: string;
  gia_tri_hd_truoc: number;
  gia_tri_phu_luc: number;
  gia_tri_hd_sau: number;
  nguoi_tao?: string;
  tao_luc?: string;
  so_hop_dong?: string;
  ten_du_an?: string;
  ten_cong_ty?: string;
  chi_tiet?: PhuLucHopDongChiTiet[];
}

export interface PhuLucHopDongChiTiet {
  id?: number;
  phu_luc_id?: number;
  hop_dong_chi_tiet_id?: number | null;
  loai: 'tang' | 'giam' | 'moi';
  ten_san_pham: string;
  don_vi: string;
  so_luong_cu: number;
  so_luong_thay_doi: number;
  so_luong_moi: number;
  don_gia_von: number;
  gia_ban_thuc_te: number;
  thue_suat: number;
  chenh_lech_phan_tram: number;
  gia_hop_dong: number;
}

export interface PhieuGiaoHang {
  id: number;
  so_phieu: string;
  ngay_giao: string;
  khach_hang_id: number;
  hop_dong_id?: number;
  gia_tri_ghi_no: number;
  noi_dung?: string;
  nguoi_tao?: string;
  tao_luc?: string;
  khach_hang?: KhachHang;
  hop_dong?: HopDong;
  chi_tiet?: PhieuGiaoHangChiTiet[];
}

export interface PhieuGiaoHangChiTiet {
  id?: number;
  phieu_giao_hang_id?: number;
  hop_dong_chi_tiet_id?: number;
  ten_san_pham?: string;
  don_vi: string;
  so_luong_giao: number;
  gia_hop_dong?: number;
  gia_ban_thuc_te?: number;
  thue_suat?: number;
  so_luong_hop_dong?: number;
  ghi_chu?: string;
}

export interface TaiKhoan {
  id: number;
  ten_tai_khoan: string;
  so_tai_khoan?: string;
  ngan_hang?: string;
  so_du?: number;
}

export interface DongTien {
  id: number;
  ngay_gio_giao_dich: string;
  tai_khoan_id: number;
  mo_ta_giao_dich: string;
  ghi_no: number;
  ghi_co: number;
  hop_dong_id?: number;
  hop_dong_mua_id?: number;
  loai_chi_phi_id?: number;
  khach_hang_id?: number;
  nha_cung_cap_id?: number;
  chi_phi_id?: number;
  so_du?: number;
  tk_doi_ung?: string;
  ten_tk_doi_ung?: string;
  ghi_chu?: string;
  chi_phi_cu_the_id?: number;
  tai_khoan?: TaiKhoan;
  khach_hang?: KhachHang;
  nha_cung_cap?: NhaCungCap;
}

export interface LoaiChiPhi {
  id: number;
  ten_loai_chi_phi: string;
}

export interface ChiPhi {
  id: number;
  loai_chi_phi_id: number;
  ten_chi_phi: string;
  loai_chi_phi?: LoaiChiPhi;
}

export interface ChiPhiCuThe {
  id: number;
  chi_phi_id: number;
  ten_chi_phi_cu_the: string;
  chi_phi?: ChiPhi;
}

export interface NhaCungCap {
  id: number;
  ten_nha_cung_cap: string;
  dien_thoai?: string;
  dia_chi?: string;
}

export interface HopDongMua {
  id: number;
  so_hop_dong: string;
  ngay_ky: string;
  nha_cung_cap_id: number;
  tong_gia_tri: number;
  ghi_chu?: string;
  tao_luc?: string;
  nha_cung_cap?: NhaCungCap;
  chi_tiet?: HopDongMuaChiTiet[];
}

export interface HopDongMuaChiTiet {
  id?: number;
  hop_dong_mua_id?: number;
  ten_san_pham: string;
  don_vi: string;
  so_luong: number;
  don_gia: number;
  thue_suat: number;
  thanh_tien: number;
}

export interface HoaDonNhap {
  id: number;
  so_hoa_don: string;
  ngay_nhap: string;
  nha_cung_cap_id: number;
  hop_dong_mua_id?: number;
  tong_tien: number;
  ghi_chu?: string;
  nha_cung_cap?: NhaCungCap;
  chi_tiet?: HoaDonNhapChiTiet[];
}

export interface HoaDonNhapChiTiet {
  id?: number;
  hoa_don_nhap_id?: number;
  vat_tu_id: number;
  so_luong: number;
  don_gia: number;
  thanh_tien: number;
  vat_tu?: VatTu;
}

export interface VatTu {
  id: number;
  ma_vat_tu: string;
  ten_vat_tu: string;
  don_vi_tinh: string;
  ton_kho: number;
}

export interface TepDinhKem {
  id: number;
  related_type: string;
  related_id: number;
  ten_file: string;
  drive_file_id: string;
  drive_folder_id?: string;
  drive_url?: string;
  mime_type?: string;
  file_size?: number;
  uploaded_by?: number;
  created_at?: string;
}

export interface UserProfile {
  id: string;
  email: string;
  role: 'admin' | 'staff';
  ten?: string;
}

export interface DashboardStats {
  tong_bao_gia_thang: number;
  tong_gia_tri_bao_gia_thang: number;
  so_bao_gia_chuyen_hop_dong: number;
  tong_hop_dong_hieu_luc: number;
  tong_gia_tri_hop_dong: number;
  tong_tien_da_thu: number;
  tong_tien_da_chi: number;
  so_du_tai_khoan: { tai_khoan_id: number; ten_tai_khoan: string; so_du: number }[];
  cong_no_phai_thu: number;
  cong_no_phai_tra: number;
  tong_chi_phi_thang: number;
  top_khach_hang: { khach_hang_id: number; ten_cong_ty: string; tong_tien: number }[];
  top_chi_phi: { ten_chi_phi: string; tong_tien: number }[];
  hop_dong_moi_nhat: HopDong[];
  dong_tien_moi_nhat: DongTien[];
}

export type CheDoVanChuyen = 0 | 1 | 2;
export type TrangThaiHopDong = 'Hieu luc' | 'Thanh ly' | 'Huy';

// ─── New cashflow system ──────────────────────────────────────────────────────

export type LoaiGiaoDich = 'thu' | 'chi' | 'chuyen_khoan_noi_bo' | 'dieu_chinh_so_du';
export type ChieuTien = 'thu' | 'chi';
export type PhamViTaiKhoan = 'cong_ty' | 'ca_nhan' | 'dung_chung';
export type PhamViHangMuc = 'cong_ty' | 'ca_nhan' | 'oto' | 'vay_no' | 'khac';

export interface TaiKhoanTien {
  id: number;
  ten_tai_khoan: string;
  loai_tai_khoan: 'tien_mat' | 'ngan_hang' | 'vi_dien_tu' | 'the_tin_dung' | 'khac';
  ngan_hang?: string;
  so_tai_khoan?: string;
  chu_tai_khoan?: string;
  pham_vi: PhamViTaiKhoan;
  so_du_dau_ky: number;
  ngay_so_du_dau_ky?: string;
  trang_thai: 'hoat_dong' | 'khong_hoat_dong';
  ghi_chu?: string;
  created_at?: string;
  updated_at?: string;
}

export interface HangMucThuChi {
  id: number;
  ma_hang_muc: string;
  ten_hang_muc: string;
  loai_giao_dich: LoaiGiaoDich | 'tat_ca';
  pham_vi: PhamViHangMuc;
  parent_id?: number | null;
  cap_do: number;
  tinh_chat: string;
  ap_dung_cho_hop_dong: boolean;
  ap_dung_cho_nha_cung_cap: boolean;
  ap_dung_cho_nhan_vien: boolean;
  thu_tu: number;
  trang_thai: 'hoat_dong' | 'an';
  created_at?: string;
  children?: HangMucThuChi[];
}

export interface DoiTuong {
  id: number;
  loai_doi_tuong: 'khach_hang' | 'nha_cung_cap' | 'nhan_vien' | 'ca_nhan' | 'khac';
  ten_doi_tuong: string;
  ma_so_thue?: string;
  dia_chi?: string;
  dien_thoai?: string;
  email?: string;
  ghi_chu?: string;
  trang_thai: 'hoat_dong' | 'khong_hoat_dong';
  created_at?: string;
}

export interface DongTienMoi {
  id: number;
  ma_giao_dich?: string;
  ngay_giao_dich: string;
  ngay_hach_toan?: string;
  loai_giao_dich: LoaiGiaoDich;
  /** Thu/chi đối với tai_khoan_tien_id khi loai_giao_dich = chuyen_khoan_noi_bo */
  chieu_tien?: ChieuTien | null;
  tai_khoan_tien_id: number;
  tai_khoan_nhan_id?: number | null;
  so_tien: number;
  doi_tuong_id?: number | null;
  khach_hang_id?: number | null;
  nha_cung_cap_id?: number | null;
  hop_dong_id?: number | null;
  hop_dong_mua_id?: number | null;
  hang_muc_thu_chi_id?: number | null;
  mo_ta_giao_dich?: string;
  so_tai_khoan_doi_ung?: string;
  ten_tai_khoan_doi_ung?: string;
  so_du_sau_giao_dich?: number | null;
  nguon_du_lieu?: string;
  ma_tham_chieu?: string;
  ma_giao_dich_ngan_hang?: string | null;
  ghi_chu?: string;
  trang_thai: 'hoan_thanh' | 'cho_doi_soat' | 'loi';
  created_at?: string;
  updated_at?: string;
  // Joined fields
  ten_tai_khoan?: string;
  loai_tai_khoan?: string;
  ngan_hang?: string;
  ten_tai_khoan_nhan?: string;
  ten_hang_muc?: string;
  pham_vi_hang_muc?: PhamViHangMuc;
  loai_hang_muc?: string;
  hang_muc_parent_id?: number;
  ten_cong_ty?: string;
  ten_nha_cung_cap?: string;
  so_hop_dong?: string;
  so_hop_dong_mua?: string;
  ten_doi_tuong?: string;
}

export interface DongTienFile {
  id: number;
  dong_tien_id: number;
  ten_file: string;
  file_url?: string;
  google_drive_file_id?: string;
  loai_file?: string;
  ghi_chu?: string;
  created_at?: string;
}

export interface DongTienPhanBo {
  id: number;
  dong_tien_id: number;
  hop_dong_id?: number | null;
  hop_dong_mua_id?: number | null;
  khach_hang_id?: number | null;
  nha_cung_cap_id?: number | null;
  hang_muc_thu_chi_id?: number | null;
  so_tien_phan_bo: number;
  ghi_chu?: string;
}
