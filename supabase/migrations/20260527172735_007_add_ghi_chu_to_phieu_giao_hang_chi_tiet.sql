/*
  # Thêm cột ghi_chu vào phieu_giao_hang_chi_tiet

  1. Thay đổi
    - Thêm cột `ghi_chu` (TEXT) vào bảng `phieu_giao_hang_chi_tiet`

  2. Lý do
    - Cho phép ghi chú riêng cho từng dòng sản phẩm trong phiếu giao hàng
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'phieu_giao_hang_chi_tiet' AND column_name = 'ghi_chu'
  ) THEN
    ALTER TABLE phieu_giao_hang_chi_tiet ADD COLUMN ghi_chu TEXT DEFAULT '';
  END IF;
END $$;
