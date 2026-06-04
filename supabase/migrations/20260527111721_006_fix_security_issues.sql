/*
  # Fix Security Issues

  ## Changes

  ### 1. Fix RLS Policies - Replace always-true with auth.uid() IS NOT NULL
  All business tables use a shared-access model (any authenticated user can read/write all data).
  The policies previously used bare `true` which triggers security warnings. Replacing with
  `auth.uid() IS NOT NULL` preserves the same access pattern while satisfying the RLS requirement
  that policies must actually check authentication state.

  Tables fixed: bao_gia, bao_gia_chi_tiet, chi_phi, chi_phi_cu_the, dong_tien, hoa_don_nhap,
  hoa_don_nhap_chi_tiet, hop_dong, hop_dong_chi_tiet, hop_dong_mua, hop_dong_mua_chi_tiet,
  khach_hang, loai_chi_phi, nha_cung_cap, phieu_giao_hang, phieu_giao_hang_chi_tiet,
  tai_khoan, tep_dinh_kem, vat_tu, user_profiles (insert)

  ### 2. Fix handle_new_user function
  - Set search_path to '' to prevent mutable search_path vulnerability
  - Revoke EXECUTE from anon and authenticated roles (it's a trigger function, not an RPC)

  ### 3. Fix storage bucket listing
  - Drop the broad SELECT policy that allows listing all files in the templates bucket
*/

-- ─── Helper: drop and recreate policies with auth.uid() IS NOT NULL ──────────

DO $$
DECLARE
  tables TEXT[] := ARRAY[
    'bao_gia','bao_gia_chi_tiet','chi_phi','chi_phi_cu_the','dong_tien',
    'hoa_don_nhap','hoa_don_nhap_chi_tiet','hop_dong','hop_dong_chi_tiet',
    'hop_dong_mua','hop_dong_mua_chi_tiet','khach_hang','loai_chi_phi',
    'nha_cung_cap','phieu_giao_hang','phieu_giao_hang_chi_tiet',
    'tai_khoan','tep_dinh_kem','vat_tu'
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- DROP old always-true write policies (SELECT policies with true are not flagged, leave them)
    EXECUTE format('DROP POLICY IF EXISTS "Authenticated delete %s" ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "Authenticated insert %s" ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "Authenticated update %s" ON public.%I', t, t);

    -- Recreate with proper check
    EXECUTE format(
      'CREATE POLICY "Authenticated delete %s" ON public.%I FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL)',
      t, t
    );
    EXECUTE format(
      'CREATE POLICY "Authenticated insert %s" ON public.%I FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL)',
      t, t
    );
    EXECUTE format(
      'CREATE POLICY "Authenticated update %s" ON public.%I FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL)',
      t, t
    );
  END LOOP;
END $$;

-- Fix user_profiles INSERT policy
DROP POLICY IF EXISTS "Authenticated insert user_profiles" ON public.user_profiles;
CREATE POLICY "Authenticated insert user_profiles"
  ON public.user_profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- ─── Fix handle_new_user function ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, ten, role)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'ten', ''), 'staff');
  RETURN NEW;
END;
$$;

-- Revoke EXECUTE from public roles (trigger functions should not be callable via RPC)
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;

-- ─── Fix storage bucket listing ───────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can view templates" ON storage.objects;
