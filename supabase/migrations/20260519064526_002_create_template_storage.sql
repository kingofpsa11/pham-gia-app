/*
  # Tạo bảng lưu cấu hình mẫu báo giá

  1. Bảng mới
    - `cau_hinh` — lưu key/value cài đặt hệ thống
      - `key` (text, primary key)
      - `value` (text)
      - `updated_at` (timestamptz)

  2. Bảo mật
    - Enable RLS
    - Admin có thể đọc/ghi
    - Tất cả user đã xác thực có thể đọc (để lấy URL mẫu khi xuất)
*/

CREATE TABLE IF NOT EXISTS cau_hinh (
  key text PRIMARY KEY,
  value text,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE cau_hinh ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read config"
  ON cau_hinh FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admin can insert config"
  ON cau_hinh FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admin can update config"
  ON cau_hinh FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
