/*
  # Thêm DELETE policy cho bảng cau_hinh

  Cho phép admin xóa config (cần thiết cho upsert và xóa mẫu)
*/

CREATE POLICY "Admin can delete config"
  ON cau_hinh FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
