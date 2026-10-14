-- ==============================================================================
-- Baseball Analyzer: Fix DELETE RLS Policies for Team Data Isolation
-- ==============================================================================
-- チームメンバー（または管理者）が、自チームのデータや自身がアップロードした
-- データセットを「クラウドデータ管理」から確実に削除できるようにします。
-- ==============================================================================

-- 1. baseball_data DELETE ポリシー
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
      -- 移行前の既存データ (user_id IS NULL) の場合、自チーム名のデータであれば削除可能
      (user_id IS NULL AND team_name IS NOT NULL AND team_name::text = public.current_user_team_name()::text)
    )
  );

-- 2. savant_data DELETE ポリシー
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

-- 3. blast_data DELETE ポリシー
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

-- 4. pitching_data DELETE ポリシー
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

-- 5. body_comp_data DELETE ポリシー
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
