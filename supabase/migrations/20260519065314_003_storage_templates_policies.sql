/*
  # Thêm RLS policies cho Storage bucket templates

  1. Cho phép authenticated users upload file vào bucket templates
  2. Cho phép authenticated users đọc/xem file từ bucket templates
  3. Cho phép authenticated users xóa file trong bucket templates
*/

INSERT INTO storage.buckets (id, name, public)
VALUES ('templates', 'templates', true)
ON CONFLICT (id) DO UPDATE SET public = true;

CREATE POLICY "Authenticated users can upload templates"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'templates');

CREATE POLICY "Authenticated users can view templates"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'templates');

CREATE POLICY "Authenticated users can update templates"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'templates')
  WITH CHECK (bucket_id = 'templates');

CREATE POLICY "Authenticated users can delete templates"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'templates');
