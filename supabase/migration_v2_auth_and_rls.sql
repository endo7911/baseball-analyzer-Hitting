-- ==============================================================================
-- Baseball Analyzer: Supabase Auth & Multi-Tenant Team Isolation Migration (v2)
-- ==============================================================================
-- team_id (UUID/TEXT) を含むすべての比較に ::text 型キャストを適用した完全版
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. profiles テーブル（アカウント情報）の作成
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT,
  username TEXT,
  display_name TEXT,
  team_id TEXT DEFAULT 'Team A',
  team_name TEXT DEFAULT 'Team A',
  role TEXT DEFAULT 'user',
  is_disabled BOOLEAN DEFAULT FALSE,
  allow_hitting BOOLEAN DEFAULT TRUE,
  allow_pitching BOOLEAN DEFAULT TRUE,
  allow_body_comp BOOLEAN DEFAULT TRUE,
  temp_password_info JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::TEXT, NOW()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::TEXT, NOW()) NOT NULL
);

-- profiles の RLS 有効化
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 2. セキュリティ判定用ヘルパー関数
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $func$
  SELECT COALESCE(
    (auth.jwt()->>'role' = 'service_role') OR
    (auth.jwt()->'user_metadata'->>'role' = 'admin') OR
    (SELECT role = 'admin' FROM public.profiles WHERE id::text = auth.uid()::text),
    FALSE
  );
$func$;

CREATE OR REPLACE FUNCTION public.current_user_team_id()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $func$
  SELECT team_id::text FROM public.profiles WHERE id::text = auth.uid()::text;
$func$;

CREATE OR REPLACE FUNCTION public.current_user_team_name()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $func$
  SELECT team_name::text FROM public.profiles WHERE id::text = auth.uid()::text;
$func$;

CREATE OR REPLACE FUNCTION public.current_user_email()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $func$
  SELECT LOWER(COALESCE(
    auth.jwt()->>'email',
    (SELECT email FROM public.profiles WHERE id::text = auth.uid()::text)
  ));
$func$;

-- ------------------------------------------------------------------------------
-- 3. profiles テーブルのポリシー設定 (無限再帰防止)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete_policy" ON public.profiles;

CREATE POLICY "profiles_select_policy" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id::text = auth.uid()::text OR
    (auth.jwt()->>'role' = 'service_role') OR
    (auth.jwt()->'user_metadata'->>'role' = 'admin')
  );

CREATE POLICY "profiles_insert_policy" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    id::text = auth.uid()::text OR
    (auth.jwt()->>'role' = 'service_role') OR
    (auth.jwt()->'user_metadata'->>'role' = 'admin')
  );

CREATE POLICY "profiles_update_policy" ON public.profiles
  FOR UPDATE TO authenticated
  USING (
    id::text = auth.uid()::text OR
    (auth.jwt()->>'role' = 'service_role') OR
    (auth.jwt()->'user_metadata'->>'role' = 'admin')
  )
  WITH CHECK (
    id::text = auth.uid()::text OR
    (auth.jwt()->>'role' = 'service_role') OR
    (auth.jwt()->'user_metadata'->>'role' = 'admin')
  );

CREATE POLICY "profiles_delete_policy" ON public.profiles
  FOR DELETE TO authenticated
  USING (
    (auth.jwt()->>'role' = 'service_role') OR
    (auth.jwt()->'user_metadata'->>'role' = 'admin')
  );

-- ------------------------------------------------------------------------------
-- 4. 各データテーブルのカラム追加（user_id, team_id, team_name）
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.baseball_data ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE IF EXISTS public.baseball_data ADD COLUMN IF NOT EXISTS team_id TEXT;
ALTER TABLE IF EXISTS public.baseball_data ADD COLUMN IF NOT EXISTS team_name TEXT;

ALTER TABLE IF EXISTS public.savant_data ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE IF EXISTS public.savant_data ADD COLUMN IF NOT EXISTS team_id TEXT;
ALTER TABLE IF EXISTS public.savant_data ADD COLUMN IF NOT EXISTS team_name TEXT;

ALTER TABLE IF EXISTS public.blast_data ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE IF EXISTS public.blast_data ADD COLUMN IF NOT EXISTS team_id TEXT;
ALTER TABLE IF EXISTS public.blast_data ADD COLUMN IF NOT EXISTS team_name TEXT;

ALTER TABLE IF EXISTS public.pitching_data ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE IF EXISTS public.pitching_data ADD COLUMN IF NOT EXISTS team_id TEXT;
ALTER TABLE IF EXISTS public.pitching_data ADD COLUMN IF NOT EXISTS team_name TEXT;

ALTER TABLE IF EXISTS public.body_comp_data ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE IF EXISTS public.body_comp_data ADD COLUMN IF NOT EXISTS team_id TEXT;
ALTER TABLE IF EXISTS public.body_comp_data ADD COLUMN IF NOT EXISTS team_name TEXT;

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_baseball_data_user_id ON public.baseball_data (user_id);
CREATE INDEX IF NOT EXISTS idx_baseball_data_team_name ON public.baseball_data (team_name);

-- ------------------------------------------------------------------------------
-- 5. baseball_data のチーム分離 RLS ポリシー (team_id::text 適用)
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.baseball_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "baseball_data_select_policy" ON public.baseball_data;
DROP POLICY IF EXISTS "baseball_data_insert_policy" ON public.baseball_data;
DROP POLICY IF EXISTS "baseball_data_update_policy" ON public.baseball_data;
DROP POLICY IF EXISTS "baseball_data_delete_policy" ON public.baseball_data;
DROP POLICY IF EXISTS "baseball_data_select_isolation" ON public.baseball_data;
DROP POLICY IF EXISTS "baseball_data_insert_isolation" ON public.baseball_data;
DROP POLICY IF EXISTS "baseball_data_update_isolation" ON public.baseball_data;
DROP POLICY IF EXISTS "baseball_data_delete_isolation" ON public.baseball_data;

CREATE POLICY "baseball_data_select_isolation" ON public.baseball_data
  FOR SELECT TO authenticated
  USING (
    public.is_admin() OR
    user_id::text = auth.uid()::text OR
    (team_id IS NOT NULL AND team_id::text = public.current_user_team_id()::text) OR
    (team_name IS NOT NULL AND team_name::text = public.current_user_team_name()::text) OR
    (upload_id IS NOT NULL AND LOWER(upload_id::text) LIKE (public.current_user_email() || '::%'))
  );

CREATE POLICY "baseball_data_insert_isolation" ON public.baseball_data
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin() OR
    user_id::text = auth.uid()::text OR
    user_id IS NULL OR
    (upload_id IS NOT NULL AND LOWER(upload_id::text) LIKE (public.current_user_email() || '::%'))
  );

CREATE POLICY "baseball_data_update_isolation" ON public.baseball_data
  FOR UPDATE TO authenticated
  USING (
    public.is_admin() OR
    user_id::text = auth.uid()::text OR
    (upload_id IS NOT NULL AND LOWER(upload_id::text) LIKE (public.current_user_email() || '::%'))
  );

CREATE POLICY "baseball_data_delete_isolation" ON public.baseball_data
  FOR DELETE TO authenticated
  USING (
    file_name NOT LIKE '__%' AND (
      public.is_admin() OR
      user_id::text = auth.uid()::text OR
      (upload_id IS NOT NULL AND LOWER(upload_id::text) LIKE (public.current_user_email() || '::%'))
    )
  );

-- ------------------------------------------------------------------------------
-- 6. savant_data のチーム分離 RLS ポリシー
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.savant_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "savant_data_select_isolation" ON public.savant_data;
DROP POLICY IF EXISTS "savant_data_insert_isolation" ON public.savant_data;
DROP POLICY IF EXISTS "savant_data_update_isolation" ON public.savant_data;
DROP POLICY IF EXISTS "savant_data_delete_isolation" ON public.savant_data;

CREATE POLICY "savant_data_select_isolation" ON public.savant_data
  FOR SELECT TO authenticated
  USING (
    public.is_admin() OR
    user_id::text = auth.uid()::text OR
    (team_id IS NOT NULL AND team_id::text = public.current_user_team_id()::text) OR
    (upload_id IS NOT NULL AND LOWER(upload_id::text) LIKE (public.current_user_email() || '::%'))
  );

CREATE POLICY "savant_data_insert_isolation" ON public.savant_data
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin() OR
    user_id::text = auth.uid()::text OR
    user_id IS NULL OR
    (upload_id IS NOT NULL AND LOWER(upload_id::text) LIKE (public.current_user_email() || '::%'))
  );

CREATE POLICY "savant_data_delete_isolation" ON public.savant_data
  FOR DELETE TO authenticated
  USING (
    public.is_admin() OR
    user_id::text = auth.uid()::text OR
    (upload_id IS NOT NULL AND LOWER(upload_id::text) LIKE (public.current_user_email() || '::%'))
  );

-- ------------------------------------------------------------------------------
-- 7. blast_data のチーム分離 RLS ポリシー
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.blast_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blast_data_select_isolation" ON public.blast_data;
DROP POLICY IF EXISTS "blast_data_insert_isolation" ON public.blast_data;
DROP POLICY IF EXISTS "blast_data_update_isolation" ON public.blast_data;
DROP POLICY IF EXISTS "blast_data_delete_isolation" ON public.blast_data;

CREATE POLICY "blast_data_select_isolation" ON public.blast_data
  FOR SELECT TO authenticated
  USING (
    public.is_admin() OR
    user_id::text = auth.uid()::text OR
    (team_id IS NOT NULL AND team_id::text = public.current_user_team_id()::text) OR
    (upload_id IS NOT NULL AND LOWER(upload_id::text) LIKE (public.current_user_email() || '::%'))
  );

CREATE POLICY "blast_data_insert_isolation" ON public.blast_data
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin() OR
    user_id::text = auth.uid()::text OR
    user_id IS NULL OR
    (upload_id IS NOT NULL AND LOWER(upload_id::text) LIKE (public.current_user_email() || '::%'))
  );

CREATE POLICY "blast_data_delete_isolation" ON public.blast_data
  FOR DELETE TO authenticated
  USING (
    public.is_admin() OR
    user_id::text = auth.uid()::text OR
    (upload_id IS NOT NULL AND LOWER(upload_id::text) LIKE (public.current_user_email() || '::%'))
  );

-- ------------------------------------------------------------------------------
-- 8. pitching_data のチーム分離 RLS ポリシー
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.pitching_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pitching_data_select_isolation" ON public.pitching_data;
DROP POLICY IF EXISTS "pitching_data_insert_isolation" ON public.pitching_data;
DROP POLICY IF EXISTS "pitching_data_update_isolation" ON public.pitching_data;
DROP POLICY IF EXISTS "pitching_data_delete_isolation" ON public.pitching_data;

CREATE POLICY "pitching_data_select_isolation" ON public.pitching_data
  FOR SELECT TO authenticated
  USING (
    public.is_admin() OR
    user_id::text = auth.uid()::text OR
    (team_id IS NOT NULL AND team_id::text = public.current_user_team_id()::text) OR
    (upload_id IS NOT NULL AND LOWER(upload_id::text) LIKE (public.current_user_email() || '::%'))
  );

CREATE POLICY "pitching_data_insert_isolation" ON public.pitching_data
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin() OR
    user_id::text = auth.uid()::text OR
    user_id IS NULL OR
    (upload_id IS NOT NULL AND LOWER(upload_id::text) LIKE (public.current_user_email() || '::%'))
  );

CREATE POLICY "pitching_data_delete_isolation" ON public.pitching_data
  FOR DELETE TO authenticated
  USING (
    public.is_admin() OR
    user_id::text = auth.uid()::text OR
    (upload_id IS NOT NULL AND LOWER(upload_id::text) LIKE (public.current_user_email() || '::%'))
  );

-- ------------------------------------------------------------------------------
-- 9. body_comp_data のチーム分離 RLS ポリシー
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.body_comp_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "body_comp_data_all" ON public.body_comp_data;
DROP POLICY IF EXISTS "body_comp_data_select_isolation" ON public.body_comp_data;
DROP POLICY IF EXISTS "body_comp_data_insert_isolation" ON public.body_comp_data;
DROP POLICY IF EXISTS "body_comp_data_update_isolation" ON public.body_comp_data;
DROP POLICY IF EXISTS "body_comp_data_delete_isolation" ON public.body_comp_data;

CREATE POLICY "body_comp_data_select_isolation" ON public.body_comp_data
  FOR SELECT TO authenticated
  USING (
    public.is_admin() OR
    user_id::text = auth.uid()::text OR
    (team_id IS NOT NULL AND team_id::text = public.current_user_team_id()::text) OR
    (upload_id IS NOT NULL AND LOWER(upload_id::text) LIKE (public.current_user_email() || '::%'))
  );

CREATE POLICY "body_comp_data_insert_isolation" ON public.body_comp_data
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin() OR
    user_id::text = auth.uid()::text OR
    user_id IS NULL OR
    (upload_id IS NOT NULL AND LOWER(upload_id::text) LIKE (public.current_user_email() || '::%'))
  );

CREATE POLICY "body_comp_data_delete_isolation" ON public.body_comp_data
  FOR DELETE TO authenticated
  USING (
    public.is_admin() OR
    user_id::text = auth.uid()::text OR
    (upload_id IS NOT NULL AND LOWER(upload_id::text) LIKE (public.current_user_email() || '::%'))
  );

-- ------------------------------------------------------------------------------
-- 10. Supabase Auth 新規登録時の自動プロファイル作成トリガー
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    username,
    display_name,
    team_id,
    team_name,
    role
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'team_id', 'Team A'),
    COALESCE(NEW.raw_user_meta_data->>'team_id', 'Team A'),
    COALESCE(NEW.raw_user_meta_data->>'role', 'user')
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    updated_at = NOW();
  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ------------------------------------------------------------------------------
-- 11. 設定確認
-- ------------------------------------------------------------------------------
SELECT tablename, policyname, cmd, roles 
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
