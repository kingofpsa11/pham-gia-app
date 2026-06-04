/*
  # Refactor bảng phieu_giao_hang_chi_tiet

  1. Thay đổi
    - Xoá cột `don_gia` (không còn dùng - giá lấy từ hop_dong_chi_tiet)
    - Xoá cột `thanh_tien` (không còn dùng - tính động từ SL × gia_hop_dong)
    - Xoá cột `ten_san_pham` (thay bằng hop_dong_chi_tiet_id)
    - Đảm bảo cột `hop_dong_chi_tiet_id` tồn tại (đã có từ migration trước nếu có)

  2. Lý do
    - Giá trị công nợ phải thu sẽ được tính động: SL giao × gia_hop_dong từ bảng hop_dong_chi_tiet
    - Tên sản phẩm lấy qua JOIN với hop_dong_chi_tiet
    - Vẫn giữ don_vi để ghi override nếu cần

  3. Lưu ý quan trọng
    - Cột hop_dong_chi_tiet_id phải có trước khi xoá ten_san_pham
    - Dữ liệu cũ sẽ mất ten_san_pham, don_gia, thanh_tien
*/

-- Thêm hop_dong_chi_tiet_id nếu chưa có
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'phieu_giao_hang_chi_tiet' AND column_name = 'hop_dong_chi_tiet_id'
  ) THEN
    ALTER TABLE phieu_giao_hang_chi_tiet ADD COLUMN hop_dong_chi_tiet_id BIGINT DEFAULT NULL REFERENCES hop_dong_chi_tiet(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Thêm ghi_chu nếu chưa có
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'phieu_giao_hang_chi_tiet' AND column_name = 'ghi_chu'
  ) THEN
    ALTER TABLE phieu_giao_hang_chi_tiet ADD COLUMN ghi_chu TEXT DEFAULT '';
  END IF;
END $$;

-- Xoá cột don_gia
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'phieu_giao_hang_chi_tiet' AND column_name = 'don_gia'
  ) THEN
    ALTER TABLE phieu_giao_hang_chi_tiet DROP COLUMN don_gia;
  END IF;
END $$;

-- Xoá cột thanh_tien
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'phieu_giao_hang_chi_tiet' AND column_name = 'thanh_tien'
  ) THEN
    ALTER TABLE phieu_giao_hang_chi_tiet DROP COLUMN thanh_tien;
  END IF;
END $$;

-- Xoá cột ten_san_pham
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'phieu_giao_hang_chi_tiet' AND column_name = 'ten_san_pham'
  ) THEN
    ALTER TABLE phieu_giao_hang_chi_tiet DROP COLUMN ten_san_pham;
  END IF;
END $$;

-- Index cho hop_dong_chi_tiet_id
CREATE INDEX IF NOT EXISTS idx_pghct_hdct ON phieu_giao_hang_chi_tiet(hop_dong_chi_tiet_id);
