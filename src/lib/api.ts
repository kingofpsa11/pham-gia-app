export const API_BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('token');
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.message || err.error || `API Error: ${res.status}`);
  }
  return res.json();
}

function buildQuery(params: Record<string, string | number | undefined | null>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
  return parts.length ? '?' + parts.join('&') : '';
}

// ===================== KHACH HANG =====================
export const khachHangApi = {
  list: (params: { search?: string; page?: number; limit?: number } = {}) =>
    request<{ data: any[]; total: number }>(`/khach-hang${buildQuery(params)}`),

  get: (id: number) =>
    request<{ data: any }>(`/khach-hang/${id}`),

  create: (data: any) =>
    request<{ data: any }>('/khach-hang', { method: 'POST', body: JSON.stringify(data) }),

  update: (id: number, data: any) =>
    request<{ data: any }>(`/khach-hang/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  delete: (id: number) =>
    request<{ success: boolean }>(`/khach-hang/${id}`, { method: 'DELETE' }),
};

// ===================== BAO GIA =====================
export const baoGiaApi = {
  list: (params: { search?: string; khach_hang_id?: string; mau_bao_gia?: string; date_from?: string; date_to?: string; page?: number; limit?: number } = {}) =>
    request<{ data: any[]; total: number }>(`/bao-gia${buildQuery(params)}`),

  get: (id: number) =>
    request<{ data: any }>(`/bao-gia/${id}`),

  checkSoTrung: (params: { so_bao_gia: string; nam: number; ngay_bao_gia?: string; exclude_id?: number }) =>
    request<{ exists: boolean; data?: { id: number; so_bao_gia: string } | null }>(
      `/bao-gia/kiem-tra-so${buildQuery(params)}`
    ),

  soTiepTheo: (nam?: number) =>
    request<{ data: { so: string; nam: number } }>(`/bao-gia/so-tiep-theo${buildQuery({ nam })}`),

  create: (data: any) =>
    request<{ data: any }>('/bao-gia', { method: 'POST', body: JSON.stringify(data) }),

  update: (id: number, data: any) =>
    request<{ data: any }>(`/bao-gia/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  delete: (id: number) =>
    request<{ success: boolean }>(`/bao-gia/${id}`, { method: 'DELETE' }),

  clone: (bao_gia_id: number) =>
    request<{ data: { new_bao_gia_id: number } }>('/clone-bao-gia', { method: 'POST', body: JSON.stringify({ bao_gia_id }) }),

  convertToHopDong: (bao_gia_id: number, so_hop_dong?: string) =>
    request<{ data: { hop_dong_id: number; so_hop_dong: string } }>('/convert-bao-gia', { method: 'POST', body: JSON.stringify({ bao_gia_id, so_hop_dong }) }),

  byKhachHang: (khach_hang_id: number) =>
    request<{ data: any[] }>(`/bao-gia-by${buildQuery({ khach_hang_id })}`),
};

// ===================== HOP DONG =====================
export const hopDongApi = {
  list: (params: { search?: string; khach_hang_id?: string; trang_thai?: string; date_from?: string; date_to?: string; page?: number; limit?: number } = {}) =>
    request<{ data: any[]; total: number }>(`/hop-dong${buildQuery(params)}`),

  get: (id: number) =>
    request<{ data: any }>(`/hop-dong/${id}`),

  checkSoTrung: (params: { so_hop_dong: string; nam: number; ngay_hop_dong?: string; exclude_id?: number }) =>
    request<{ exists: boolean; data?: { id: number; so_hop_dong: string } | null }>(
      `/hop-dong/kiem-tra-so${buildQuery(params)}`
    ),

  soTiepTheo: (nam?: number) =>
    request<{ data: { so: string; nam: number } }>(`/hop-dong/so-tiep-theo${buildQuery({ nam })}`),

  create: (data: any) =>
    request<{ data: any; drive?: any; drive_warning?: string | null }>('/hop-dong', { method: 'POST', body: JSON.stringify(data) }),

  update: (id: number, data: any) =>
    request<{ data: any; drive?: any; drive_warning?: string | null }>(`/hop-dong/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  taoFolder: (id: number, data?: { ten_folder_du_an?: string }) =>
    request<{ data: any; drive?: any; drive_warning?: string | null }>(
      `/hop-dong/${id}/tao-folder`,
      { method: 'POST', body: JSON.stringify(data || {}) }
    ),

  updateStatus: (id: number, trang_thai: string) =>
    request<{ data: any }>(`/hop-dong/${id}/trang-thai`, { method: 'PATCH', body: JSON.stringify({ trang_thai }) }),

  delete: (id: number) =>
    request<{ success: boolean }>(`/hop-dong/${id}`, { method: 'DELETE' }),

  byKhachHang: (khach_hang_id: number) =>
    request<{ data: any[] }>(`/hop-dong-by${buildQuery({ khach_hang_id })}`),
};

export const phuLucHopDongApi = {
  listByHopDong: (hopDongId: number) =>
    request<{ data: any[] }>(`/hop-dong/${hopDongId}/phu-luc`),

  get: (id: number) =>
    request<{ data: any }>(`/phu-luc-hop-dong/${id}`),

  create: (hopDongId: number, data: any) =>
    request<{ data: any }>(`/hop-dong/${hopDongId}/phu-luc`, { method: 'POST', body: JSON.stringify(data) }),

  delete: (id: number) =>
    request<{ success: boolean }>(`/phu-luc-hop-dong/${id}`, { method: 'DELETE' }),
};

// ===================== PHIEU GIAO HANG =====================
export const phieuGiaoHangApi = {
  list: (params: { search?: string; khach_hang_id?: string; hop_dong_id?: string; date_from?: string; date_to?: string; page?: number; limit?: number } = {}) =>
    request<{ data: any[]; total: number }>(`/phieu-giao-hang${buildQuery(params)}`),

  get: (id: number) =>
    request<{ data: any }>(`/phieu-giao-hang/${id}`),

  soTiepTheo: (nam?: number) =>
    request<{ data: { so: string; nam: number } }>(`/phieu-giao-hang/so-tiep-theo${buildQuery({ nam })}`),

  create: (data: any) =>
    request<{ data: any }>('/phieu-giao-hang', { method: 'POST', body: JSON.stringify(data) }),

  update: (id: number, data: any) =>
    request<{ data: any }>(`/phieu-giao-hang/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  delete: (id: number) =>
    request<{ success: boolean }>(`/phieu-giao-hang/${id}`, { method: 'DELETE' }),

  byKhachHang: (khach_hang_id: number) =>
    request<{ data: any[] }>(`/phieu-giao-hang-by${buildQuery({ khach_hang_id })}`),

  byHopDong: (hop_dong_id: number) =>
    request<{ data: any[] }>(`/phieu-giao-hang-by${buildQuery({ hop_dong_id })}`),
};

// ===================== TAI KHOAN =====================
export const taiKhoanApi = {
  list: () =>
    request<{ data: any[] }>('/tai-khoan'),

  create: (data: any) =>
    request<{ data: any }>('/tai-khoan', { method: 'POST', body: JSON.stringify(data) }),

  update: (id: number, data: any) =>
    request<{ data: any }>(`/tai-khoan/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  delete: (id: number) =>
    request<{ success: boolean }>(`/tai-khoan/${id}`, { method: 'DELETE' }),
};

// ===================== DONG TIEN =====================
export const dongTienApi = {
  list: (params: { search?: string; tai_khoan_id?: string; khach_hang_id?: string; nha_cung_cap_id?: string; hop_dong_id?: string; hop_dong_mua_id?: string; loai_chi_phi_id?: string; chi_phi_id?: string; date_from?: string; date_to?: string; page?: number; limit?: number } = {}) =>
    request<{ data: any[]; total: number }>(`/dong-tien${buildQuery(params)}`),

  create: (data: any) =>
    request<{ data: any }>('/dong-tien', { method: 'POST', body: JSON.stringify(data) }),

  update: (id: number, data: any) =>
    request<{ data: any }>(`/dong-tien/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  delete: (id: number) =>
    request<{ success: boolean }>(`/dong-tien/${id}`, { method: 'DELETE' }),

  byEntity: (params: { khach_hang_id?: string | number; nha_cung_cap_id?: string | number; hop_dong_id?: string | number; hop_dong_mua_id?: string | number; tai_khoan_id?: string | number }) =>
    request<{ data: any[] }>(`/dong-tien-by${buildQuery(params)}`),
};

// ===================== CHI PHI =====================
export const loaiChiPhiApi = {
  list: () =>
    request<{ data: any[] }>('/loai-chi-phi'),

  create: (data: any) =>
    request<{ data: any }>('/loai-chi-phi', { method: 'POST', body: JSON.stringify(data) }),

  update: (id: number, data: any) =>
    request<{ success: boolean }>(`/loai-chi-phi/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  delete: (id: number) =>
    request<{ success: boolean }>(`/loai-chi-phi/${id}`, { method: 'DELETE' }),
};

export const chiPhiApi = {
  list: (loai_chi_phi_id?: string) =>
    request<{ data: any[] }>(`/chi-phi${buildQuery({ loai_chi_phi_id })}`),

  create: (data: any) =>
    request<{ data: any }>('/chi-phi', { method: 'POST', body: JSON.stringify(data) }),

  update: (id: number, data: any) =>
    request<{ success: boolean }>(`/chi-phi/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  delete: (id: number) =>
    request<{ success: boolean }>(`/chi-phi/${id}`, { method: 'DELETE' }),
};

export const chiPhiCuTheApi = {
  list: (chi_phi_id?: string) =>
    request<{ data: any[] }>(`/chi-phi-cu-the${buildQuery({ chi_phi_id })}`),

  create: (data: any) =>
    request<{ data: any }>('/chi-phi-cu-the', { method: 'POST', body: JSON.stringify(data) }),

  update: (id: number, data: any) =>
    request<{ success: boolean }>(`/chi-phi-cu-the/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  delete: (id: number) =>
    request<{ success: boolean }>(`/chi-phi-cu-the/${id}`, { method: 'DELETE' }),
};

// ===================== NHA CUNG CAP =====================
export const nhaCungCapApi = {
  list: (params: { search?: string; page?: number; limit?: number } = {}) =>
    request<{ data: any[]; total: number }>(`/nha-cung-cap${buildQuery(params)}`),

  create: (data: any) =>
    request<{ data: any }>('/nha-cung-cap', { method: 'POST', body: JSON.stringify(data) }),

  update: (id: number, data: any) =>
    request<{ success: boolean }>(`/nha-cung-cap/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  delete: (id: number) =>
    request<{ success: boolean }>(`/nha-cung-cap/${id}`, { method: 'DELETE' }),

  hopDongMua: (nha_cung_cap_id: number) =>
    request<{ data: any[] }>(`/hop-dong-mua-by${buildQuery({ nha_cung_cap_id })}`),

  aggregates: (ids: number[]) =>
    request<{ data: Record<number, { so_hoa_don_mua: number; tong_gia_tri_hoa_don_mua: number; tong_da_thanh_toan: number }> }>(
      `/nha-cung-cap/aggregates${buildQuery({ ids: ids.join(',') })}`
    ),

  hoaDonNhap: (nha_cung_cap_id: number) =>
    request<{ data: any[] }>(`/hoa-don-nhap-by${buildQuery({ nha_cung_cap_id })}`),
};

// ===================== HOP DONG MUA =====================
export const hopDongMuaApi = {
  list: (params: { search?: string; nha_cung_cap_id?: string; date_from?: string; date_to?: string; page?: number; limit?: number } = {}) =>
    request<{ data: any[]; total: number }>(`/hop-dong-mua${buildQuery(params)}`),

  get: (id: number) =>
    request<{ data: any }>(`/hop-dong-mua/${id}`),

  create: (data: any) =>
    request<{ data: any }>('/hop-dong-mua', { method: 'POST', body: JSON.stringify(data) }),

  update: (id: number, data: any) =>
    request<{ success: boolean }>(`/hop-dong-mua/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  delete: (id: number) =>
    request<{ success: boolean }>(`/hop-dong-mua/${id}`, { method: 'DELETE' }),
};

// ===================== HOA DON NHAP =====================
export const hoaDonNhapApi = {
  list: (params: { search?: string; nha_cung_cap_id?: string; hop_dong_mua_id?: string; date_from?: string; date_to?: string; page?: number; limit?: number } = {}) =>
    request<{ data: any[]; total: number }>(`/hoa-don-nhap${buildQuery(params)}`),

  get: (id: number) =>
    request<{ data: any }>(`/hoa-don-nhap/${id}`),

  create: (data: any) =>
    request<{ data: any }>('/hoa-don-nhap', { method: 'POST', body: JSON.stringify(data) }),

  update: (id: number, data: any) =>
    request<{ success: boolean }>(`/hoa-don-nhap/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  delete: (id: number) =>
    request<{ success: boolean }>(`/hoa-don-nhap/${id}`, { method: 'DELETE' }),
};

// ===================== VAT TU =====================
export const vatTuApi = {
  list: (params: { search?: string; page?: number; limit?: number } = {}) =>
    request<{ data: any[]; total: number }>(`/vat-tu${buildQuery(params)}`),

  create: (data: any) =>
    request<{ data: any }>('/vat-tu', { method: 'POST', body: JSON.stringify(data) }),

  update: (id: number, data: any) =>
    request<{ success: boolean }>(`/vat-tu/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  delete: (id: number) =>
    request<{ success: boolean }>(`/vat-tu/${id}`, { method: 'DELETE' }),
};

// ===================== TEP DINH KEM =====================
export const tepDinhKemApi = {
  list: (related_type: string, related_id: number) =>
    request<{ data: any[] }>(`/tep-dinh-kem${buildQuery({ related_type, related_id })}`),

  create: (data: any) =>
    request<{ data: any }>('/tep-dinh-kem', { method: 'POST', body: JSON.stringify(data) }),

  delete: (id: number) =>
    request<{ success: boolean }>(`/tep-dinh-kem/${id}`, { method: 'DELETE' }),
};

// ===================== DASHBOARD =====================
export const dashboardApi = {
  stats: () =>
    request<any>('/dashboard-stats'),
};

// ===================== CONG NO =====================
export const congNoApi = {
  list: () =>
    request<{
      data: any[];
      tong_cong_no_phai_thu: number;
      so_khach_hang_dang_no: number;
      tong_da_thu_thang_nay: number;
    }>('/cong-no'),
};

// ===================== TAI KHOAN TIEN =====================
export const taiKhoanTienApi = {
  list: (params: { loai_tai_khoan?: string; pham_vi?: string; trang_thai?: string; with_balance?: string } = {}) =>
    request<{ data: any[] }>(`/tai-khoan-tien${buildQuery(params)}`),

  balances: (params: { loai_tai_khoan?: string; pham_vi?: string; trang_thai?: string } = {}) =>
    request<{ data: any[] }>(`/tai-khoan-tien/balances${buildQuery(params)}`),

  create: (data: any) =>
    request<{ data: any }>('/tai-khoan-tien', { method: 'POST', body: JSON.stringify(data) }),

  update: (id: number, data: any) =>
    request<{ data: any }>(`/tai-khoan-tien/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  delete: (id: number) =>
    request<{ success: boolean }>(`/tai-khoan-tien/${id}`, { method: 'DELETE' }),
};

// ===================== HANG MUC THU CHI =====================
export const hangMucThuChiApi = {
  list: (params: { loai_giao_dich?: string; pham_vi?: string; trang_thai?: string } = {}) =>
    request<{ data: any[] }>(`/hang-muc-thu-chi${buildQuery(params)}`),

  create: (data: any) =>
    request<{ data: any }>('/hang-muc-thu-chi', { method: 'POST', body: JSON.stringify(data) }),

  update: (id: number, data: any) =>
    request<{ data: any }>(`/hang-muc-thu-chi/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  delete: (id: number) =>
    request<{ success: boolean }>(`/hang-muc-thu-chi/${id}`, { method: 'DELETE' }),
};

// ===================== DOI TUONG =====================
export const doiTuongApi = {
  list: (params: { loai_doi_tuong?: string; search?: string; page?: number; limit?: number } = {}) =>
    request<{ data: any[]; total: number }>(`/doi-tuong${buildQuery(params)}`),

  create: (data: any) =>
    request<{ data: any }>('/doi-tuong', { method: 'POST', body: JSON.stringify(data) }),

  update: (id: number, data: any) =>
    request<{ data: any }>(`/doi-tuong/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  delete: (id: number) =>
    request<{ success: boolean }>(`/doi-tuong/${id}`, { method: 'DELETE' }),
};

// ===================== DONG TIEN MOI =====================
export const dongTienMoiApi = {
  list: (params: {
    date_from?: string; date_to?: string; loai_giao_dich?: string;
    tai_khoan_tien_id?: string | number; pham_vi?: string; hang_muc_thu_chi_id?: string;
    khach_hang_id?: string; nha_cung_cap_id?: string; hop_dong_id?: string; hop_dong_mua_id?: string;
    search?: string; trang_thai?: string; page?: number; limit?: number; summary?: string;
  } = {}) =>
    request<{ data: any[]; total: number; tong_thu?: number; tong_chi?: number }>(`/dong-tien-moi${buildQuery(params)}`),

  create: (data: any) =>
    request<{ data: any }>('/dong-tien-moi', { method: 'POST', body: JSON.stringify(data) }),

  update: (id: number, data: any) =>
    request<{ data: any }>(`/dong-tien-moi/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  delete: (id: number) =>
    request<{ success: boolean }>(`/dong-tien-moi/${id}`, { method: 'DELETE' }),

  bulkUpdate: (items: any[]) =>
    request<{ updated: number; created: number; failed: number; errors: { excelRow: number; message: string }[] }>(
      '/dong-tien-moi/bulk-update',
      { method: 'POST', body: JSON.stringify({ items }) },
    ),

  checkExists: (ngay_giao_dich: string, tai_khoan_tien_id: number) =>
    request<{ data: any[]; total: number }>(`/dong-tien-moi${buildQuery({ ngay_giao_dich, tai_khoan_tien_id, limit: 1 })}`),
};

// ===================== DONG TIEN FILE =====================
export const dongTienFileApi = {
  list: (dong_tien_id: number) =>
    request<{ data: any[] }>(`/dong-tien-file${buildQuery({ dong_tien_id })}`),

  create: (data: any) =>
    request<{ data: any }>('/dong-tien-file', { method: 'POST', body: JSON.stringify(data) }),

  delete: (id: number) =>
    request<{ success: boolean }>(`/dong-tien-file/${id}`, { method: 'DELETE' }),
};

// ===================== DONG TIEN PHAN BO =====================
export const dongTienPhanBoApi = {
  list: (dong_tien_id: number) =>
    request<{ data: any[] }>(`/dong-tien-phan-bo${buildQuery({ dong_tien_id })}`),

  create: (data: any) =>
    request<{ data: any }>('/dong-tien-phan-bo', { method: 'POST', body: JSON.stringify(data) }),

  delete: (id: number) =>
    request<{ success: boolean }>(`/dong-tien-phan-bo/${id}`, { method: 'DELETE' }),
};

// ===================== BAO CAO DONG TIEN MOI =====================
export const baoCaoDongTienMoiApi = {
  get: (params: { date_from?: string; date_to?: string; tai_khoan_tien_id?: string; pham_vi?: string } = {}) =>
    request<any>(`/bao-cao-dong-tien-moi${buildQuery(params)}`),
};

// ===================== CAU HINH / MAU EXCEL =====================
export const cauHinhApi = {
  get: (key: string) =>
    request<{ data: { key: string; value: string; updated_at: string } | null }>(`/cau-hinh/${key}`),

  delete: (key: string) =>
    request<{ success: boolean }>(`/cau-hinh/${key}`, { method: 'DELETE' }),
};

// ===================== USERS (Admin table) =====================
export const usersApi = {
  list: () =>
    request<{ data: any[] }>('/users'),

  create: (data: { email: string; password: string; ten?: string; role?: string }) =>
    request<{ data: any }>('/users', { method: 'POST', body: JSON.stringify(data) }),

  update: (id: string, data: { ten?: string; email?: string; role?: string }) =>
    request<{ success: boolean }>(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  changePassword: (data: { currentPassword?: string; newPassword: string }) =>
    request<{ success: boolean }>('/users/me/password', { method: 'PUT', body: JSON.stringify(data) }),

  delete: (id: string) =>
    request<{ success: boolean }>(`/users/${id}`, { method: 'DELETE' }),
};
