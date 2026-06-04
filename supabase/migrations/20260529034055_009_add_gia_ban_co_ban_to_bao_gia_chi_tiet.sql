/*
  # Thêm cột gia_ban_co_ban vào bao_gia_chi_tiet

  ## Mục đích
  Tách biệt "giá bán gốc do người dùng nhập" (gia_ban_co_ban) với "giá bán sau khi phân bổ
  phí vận chuyển" (gia_ban_thuc_te). Điều này ngăn việc phí VC bị cộng nhiều lần mỗi khi
  mở lại báo giá để chỉnh sửa.

  ## Thay đổi
  - Thêm cột `gia_ban_co_ban` (NUMERIC 15,2) vào bảng `bao_gia_chi_tiet`
  - Giá trị mặc định bằng gia_ban_thuc_te hiện tại (backfill)

  ## Luồng mới
  - Người dùng nhập → lưu vào gia_ban_co_ban
  - Mode phân bổ VC (=1): gia_ban_thuc_te = gia_ban_co_ban + VC phân bổ (tính lúc save)
  - Mode khác: gia_ban_thuc_te = gia_ban_co_ban
  - Khi load lại để edit: dùng gia_ban_co_ban → withVCItems không bao giờ double
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bao_gia_chi_tiet' AND column_name = 'gia_ban_co_ban'
  ) THEN
    ALTER TABLE bao_gia_chi_tiet ADD COLUMN gia_ban_co_ban NUMERIC(15,2) DEFAULT 0;
    -- Backfill: với dữ liệu cũ, gia_ban_co_ban = gia_ban_thuc_te (chấp nhận có thể đã bị double)
    UPDATE bao_gia_chi_tiet SET gia_ban_co_ban = gia_ban_thuc_te WHERE gia_ban_co_ban = 0;
  END IF;
END $$;
