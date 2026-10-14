-- ==============================================================================
-- Baseball Analyzer: Fix INSERT & Multi-Tenant Data RLS Policies
-- ==============================================================================
-- 【実行方法】
-- Supabase ダッシュボードの左メニュー「SQL Editor」を開き、
-- このスクリプト全体を貼り付けて右下の「RUN」を実行してください。
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. カラムの存在保証と型変換 (UUID型からTEXT型への変換を行い、日本語や非UUIDの混入エラー22P02を防止)
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.baseball_data ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE IF EXISTS public.baseball_data ADD COLUMN IF NOT EXISTS team_id TEXT;
ALTER TABLE IF EXISTS public.baseball_data ADD COLUMN IF NOT EXISTS team_name TEXT;
ALTER TABLE IF EXISTS public.baseball_data ADD COLUMN IF NOT EXISTS upload_id TEXT;
ALTER TABLE IF EXISTS public.baseball_data ADD COLUMN IF NOT EXISTS file_name TEXT;
ALTER TABLE IF EXISTS public.baseball_data ALTER COLUMN team_id TYPE TEXT USING team_id::text;
ALTER TABLE IF EXISTS public.baseball_data ALTER COLUMN user_id TYPE TEXT USING user_id::text;

ALTER TABLE IF EXISTS public.savant_data ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE IF EXISTS public.savant_data ADD COLUMN IF NOT EXISTS team_id TEXT;
ALTER TABLE IF EXISTS public.savant_data ADD COLUMN IF NOT EXISTS team_name TEXT;
ALTER TABLE IF EXISTS public.savant_data ADD COLUMN IF NOT EXISTS upload_id TEXT;
ALTER TABLE IF EXISTS public.savant_data ADD COLUMN IF NOT EXISTS file_name TEXT;
ALTER TABLE IF EXISTS public.savant_data ALTER COLUMN team_id TYPE TEXT USING team_id::text;
ALTER TABLE IF EXISTS public.savant_data ALTER COLUMN user_id TYPE TEXT USING user_id::text;

ALTER TABLE IF EXISTS public.blast_data ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE IF EXISTS public.blast_data ADD COLUMN IF NOT EXISTS team_id TEXT;
ALTER TABLE IF EXISTS public.blast_data ADD COLUMN IF NOT EXISTS team_name TEXT;
ALTER TABLE IF EXISTS public.blast_data ADD COLUMN IF NOT EXISTS upload_id TEXT;
ALTER TABLE IF EXISTS public.blast_data ADD COLUMN IF NOT EXISTS file_name TEXT;
ALTER TABLE IF EXISTS public.blast_data ALTER COLUMN team_id TYPE TEXT USING team_id::text;
ALTER TABLE IF EXISTS public.blast_data ALTER COLUMN user_id TYPE TEXT USING user_id::text;

ALTER TABLE IF EXISTS public.pitching_data ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE IF EXISTS public.pitching_data ADD COLUMN IF NOT EXISTS team_id TEXT;
ALTER TABLE IF EXISTS public.pitching_data ADD COLUMN IF NOT EXISTS team_name TEXT;
ALTER TABLE IF EXISTS public.pitching_data ADD COLUMN IF NOT EXISTS upload_id TEXT;
ALTER TABLE IF EXISTS public.pitching_data ADD COLUMN IF NOT EXISTS file_name TEXT;
ALTER TABLE IF EXISTS public.pitching_data ALTER COLUMN team_id TYPE TEXT USING team_id::text;
ALTER TABLE IF EXISTS public.pitching_data ALTER COLUMN user_id TYPE TEXT USING user_id::text;

ALTER TABLE IF EXISTS public.body_comp_data ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE IF EXISTS public.body_comp_data ADD COLUMN IF NOT EXISTS team_id TEXT;
ALTER TABLE IF EXISTS public.body_comp_data ADD COLUMN IF NOT EXISTS team_name TEXT;
ALTER TABLE IF EXISTS public.body_comp_data ADD COLUMN IF NOT EXISTS upload_id TEXT;
ALTER TABLE IF EXISTS public.body_comp_data ADD COLUMN IF NOT EXISTS file_name TEXT;
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'body_comp_data') THEN
    ALTER TABLE public.body_comp_data ALTER COLUMN team_id TYPE TEXT USING team_id::text;
    ALTER TABLE public.body_comp_data ALTER COLUMN user_id TYPE TEXT USING user_id::text;
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. 権限付与 (anon, authenticated 双方にテーブル操作権限を付与)
-- ------------------------------------------------------------------------------
GRANT ALL ON public.baseball_data TO anon, authenticated;
GRANT ALL ON public.savant_data TO anon, authenticated;
GRANT ALL ON public.blast_data TO anon, authenticated;
GRANT ALL ON public.pitching_data TO anon, authenticated;
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'body_comp_data') THEN
    GRANT ALL ON public.body_comp_data TO anon, authenticated;
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 3. baseball_data RLS ポリシー修正 (INSERT / SELECT / DELETE)
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.baseball_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "baseball_data_insert_policy" ON public.baseball_data;
DROP POLICY IF EXISTS "baseball_data_insert_isolation" ON public.baseball_data;
CREATE POLICY "baseball_data_insert_policy" ON public.baseball_data
  FOR INSERT TO authenticated, anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "baseball_data_select_policy" ON public.baseball_data;
DROP POLICY IF EXISTS "baseball_data_select_isolation" ON public.baseball_data;
CREATE POLICY "baseball_data_select_isolation" ON public.baseball_data
  FOR SELECT TO authenticated, anon
  USING (
    public.is_admin() OR
    auth.uid() IS NULL OR -- 移行期間中のレガシーユーザー向け
    user_id::text = auth.uid()::text OR
    (team_id IS NOT NULL AND team_id::text = public.current_user_team_id()::text) OR
    (team_name IS NOT NULL AND team_name::text = public.current_user_team_name()::text) OR
    (upload_id IS NOT NULL AND LOWER(upload_id::text) LIKE (COALESCE(public.current_user_email(), '') || '::%'))
  );

DROP POLICY IF EXISTS "baseball_data_delete_policy" ON public.baseball_data;
DROP POLICY IF EXISTS "baseball_data_delete_isolation" ON public.baseball_data;
CREATE POLICY "baseball_data_delete_isolation" ON public.baseball_data
  FOR DELETE TO authenticated, anon
  USING (
    file_name NOT LIKE '__%' AND (
      public.is_admin() OR
      user_id::text = auth.uid()::text OR
      (team_id IS NOT NULL AND team_id::text = public.current_user_team_id()::text) OR
      (team_name IS NOT NULL AND team_name::text = public.current_user_team_name()::text) OR
      (upload_id IS NOT NULL AND LOWER(upload_id::text) LIKE (COALESCE(public.current_user_email(), '') || '::%')) OR
      (user_id IS NULL AND team_name IS NOT NULL AND team_name::text = public.current_user_team_name()::text)
    )
  );

-- ------------------------------------------------------------------------------
-- 4. savant_data RLS ポリシー修正 (INSERT / SELECT / DELETE)
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.savant_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "savant_data_insert_policy" ON public.savant_data;
DROP POLICY IF EXISTS "savant_data_insert_isolation" ON public.savant_data;
CREATE POLICY "savant_data_insert_policy" ON public.savant_data
  FOR INSERT TO authenticated, anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "savant_data_select_policy" ON public.savant_data;
DROP POLICY IF EXISTS "savant_data_select_isolation" ON public.savant_data;
CREATE POLICY "savant_data_select_isolation" ON public.savant_data
  FOR SELECT TO authenticated, anon
  USING (
    public.is_admin() OR
    auth.uid() IS NULL OR
    user_id::text = auth.uid()::text OR
    (team_id IS NOT NULL AND team_id::text = public.current_user_team_id()::text) OR
    (team_name IS NOT NULL AND team_name::text = public.current_user_team_name()::text) OR
    (upload_id IS NOT NULL AND LOWER(upload_id::text) LIKE (COALESCE(public.current_user_email(), '') || '::%'))
  );

DROP POLICY IF EXISTS "savant_data_delete_policy" ON public.savant_data;
DROP POLICY IF EXISTS "savant_data_delete_isolation" ON public.savant_data;
CREATE POLICY "savant_data_delete_isolation" ON public.savant_data
  FOR DELETE TO authenticated, anon
  USING (
    public.is_admin() OR
    user_id::text = auth.uid()::text OR
    (team_id IS NOT NULL AND team_id::text = public.current_user_team_id()::text) OR
    (team_name IS NOT NULL AND team_name::text = public.current_user_team_name()::text) OR
    (upload_id IS NOT NULL AND LOWER(upload_id::text) LIKE (COALESCE(public.current_user_email(), '') || '::%')) OR
    (user_id IS NULL AND team_name IS NOT NULL AND team_name::text = public.current_user_team_name()::text)
  );

-- ------------------------------------------------------------------------------
-- 5. blast_data RLS ポリシー修正 (INSERT / SELECT / DELETE)
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.blast_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blast_data_insert_policy" ON public.blast_data;
DROP POLICY IF EXISTS "blast_data_insert_isolation" ON public.blast_data;
CREATE POLICY "blast_data_insert_policy" ON public.blast_data
  FOR INSERT TO authenticated, anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "blast_data_select_policy" ON public.blast_data;
DROP POLICY IF EXISTS "blast_data_select_isolation" ON public.blast_data;
CREATE POLICY "blast_data_select_isolation" ON public.blast_data
  FOR SELECT TO authenticated, anon
  USING (
    public.is_admin() OR
    auth.uid() IS NULL OR
    user_id::text = auth.uid()::text OR
    (team_id IS NOT NULL AND team_id::text = public.current_user_team_id()::text) OR
    (team_name IS NOT NULL AND team_name::text = public.current_user_team_name()::text) OR
    (upload_id IS NOT NULL AND LOWER(upload_id::text) LIKE (COALESCE(public.current_user_email(), '') || '::%'))
  );

DROP POLICY IF EXISTS "blast_data_delete_policy" ON public.blast_data;
DROP POLICY IF EXISTS "blast_data_delete_isolation" ON public.blast_data;
CREATE POLICY "blast_data_delete_isolation" ON public.blast_data
  FOR DELETE TO authenticated, anon
  USING (
    public.is_admin() OR
    user_id::text = auth.uid()::text OR
    (team_id IS NOT NULL AND team_id::text = public.current_user_team_id()::text) OR
    (team_name IS NOT NULL AND team_name::text = public.current_user_team_name()::text) OR
    (upload_id IS NOT NULL AND LOWER(upload_id::text) LIKE (COALESCE(public.current_user_email(), '') || '::%')) OR
    (user_id IS NULL AND team_name IS NOT NULL AND team_name::text = public.current_user_team_name()::text)
  );

-- ------------------------------------------------------------------------------
-- 6. pitching_data RLS ポリシー修正 (INSERT / SELECT / DELETE)
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.pitching_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pitching_data_insert_policy" ON public.pitching_data;
DROP POLICY IF EXISTS "pitching_data_insert_isolation" ON public.pitching_data;
CREATE POLICY "pitching_data_insert_policy" ON public.pitching_data
  FOR INSERT TO authenticated, anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "pitching_data_select_policy" ON public.pitching_data;
DROP POLICY IF EXISTS "pitching_data_select_isolation" ON public.pitching_data;
CREATE POLICY "pitching_data_select_isolation" ON public.pitching_data
  FOR SELECT TO authenticated, anon
  USING (
    public.is_admin() OR
    auth.uid() IS NULL OR
    user_id::text = auth.uid()::text OR
    (team_id IS NOT NULL AND team_id::text = public.current_user_team_id()::text) OR
    (team_name IS NOT NULL AND team_name::text = public.current_user_team_name()::text) OR
    (upload_id IS NOT NULL AND LOWER(upload_id::text) LIKE (COALESCE(public.current_user_email(), '') || '::%'))
  );

DROP POLICY IF EXISTS "pitching_data_delete_policy" ON public.pitching_data;
DROP POLICY IF EXISTS "pitching_data_delete_isolation" ON public.pitching_data;
CREATE POLICY "pitching_data_delete_isolation" ON public.pitching_data
  FOR DELETE TO authenticated, anon
  USING (
    public.is_admin() OR
    user_id::text = auth.uid()::text OR
    (team_id IS NOT NULL AND team_id::text = public.current_user_team_id()::text) OR
    (team_name IS NOT NULL AND team_name::text = public.current_user_team_name()::text) OR
    (upload_id IS NOT NULL AND LOWER(upload_id::text) LIKE (COALESCE(public.current_user_email(), '') || '::%')) OR
    (user_id IS NULL AND team_name IS NOT NULL AND team_name::text = public.current_user_team_name()::text)
  );

-- ------------------------------------------------------------------------------
-- 7. body_comp_data RLS ポリシー修正 (存在する場合)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'body_comp_data') THEN
    ALTER TABLE public.body_comp_data ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "body_comp_data_all" ON public.body_comp_data;
    DROP POLICY IF EXISTS "body_comp_data_insert_policy" ON public.body_comp_data;
    DROP POLICY IF EXISTS "body_comp_data_insert_isolation" ON public.body_comp_data;
    CREATE POLICY "body_comp_data_insert_policy" ON public.body_comp_data
      FOR INSERT TO authenticated, anon
      WITH CHECK (true);

    DROP POLICY IF EXISTS "body_comp_data_select_policy" ON public.body_comp_data;
    DROP POLICY IF EXISTS "body_comp_data_select_isolation" ON public.body_comp_data;
    CREATE POLICY "body_comp_data_select_isolation" ON public.body_comp_data
      FOR SELECT TO authenticated, anon
      USING (
        public.is_admin() OR
        auth.uid() IS NULL OR
        user_id::text = auth.uid()::text OR
        (team_id IS NOT NULL AND team_id::text = public.current_user_team_id()::text) OR
        (team_name IS NOT NULL AND team_name::text = public.current_user_team_name()::text) OR
        (upload_id IS NOT NULL AND LOWER(upload_id::text) LIKE (COALESCE(public.current_user_email(), '') || '::%'))
      );

    DROP POLICY IF EXISTS "body_comp_data_delete_policy" ON public.body_comp_data;
    DROP POLICY IF EXISTS "body_comp_data_delete_isolation" ON public.body_comp_data;
    CREATE POLICY "body_comp_data_delete_isolation" ON public.body_comp_data
      FOR DELETE TO authenticated, anon
      USING (
        public.is_admin() OR
        user_id::text = auth.uid()::text OR
        (team_id IS NOT NULL AND team_id::text = public.current_user_team_id()::text) OR
        (team_name IS NOT NULL AND team_name::text = public.current_user_team_name()::text) OR
        (upload_id IS NOT NULL AND LOWER(upload_id::text) LIKE (COALESCE(public.current_user_email(), '') || '::%')) OR
        (user_id IS NULL AND team_name IS NOT NULL AND team_name::text = public.current_user_team_name()::text)
      );
  END IF;
END $$;
