-- ==============================================================================
-- Baseball Analyzer: Database Security & RLS Policy Script
-- ==============================================================================
-- このスクリプトを Supabase の SQL Editor に貼り付けて「RUN」を実行してください。
-- 実行後、画面下に設定されたポリシー一覧が結果テーブルとして表示されます。
-- ==============================================================================

-- 1. baseball_data テーブルの RLS (行レベルセキュリティ) を有効化
ALTER TABLE public.baseball_data ENABLE ROW LEVEL SECURITY;

-- 2. 既存ポリシーのクリーンアップ（再実行対応）
DROP POLICY IF EXISTS "baseball_data_select_policy" ON public.baseball_data;
DROP POLICY IF EXISTS "baseball_data_insert_policy" ON public.baseball_data;
DROP POLICY IF EXISTS "baseball_data_update_policy" ON public.baseball_data;
DROP POLICY IF EXISTS "baseball_data_delete_policy" ON public.baseball_data;

-- 3. SELECT ポリシー: 読み取り許可
CREATE POLICY "baseball_data_select_policy"
ON public.baseball_data
FOR SELECT
TO anon, authenticated
USING (true);

-- 4. INSERT ポリシー: 追加許可
CREATE POLICY "baseball_data_insert_policy"
ON public.baseball_data
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- 5. UPDATE ポリシー: 更新許可
CREATE POLICY "baseball_data_update_policy"
ON public.baseball_data
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

-- 6. DELETE ポリシー（最重要ガード）:
-- システムデータ（__app_user_profiles_v1__ など '__' で始まる行）の削除を物理的に禁止！
CREATE POLICY "baseball_data_delete_policy"
ON public.baseball_data
FOR DELETE
TO anon, authenticated
USING (file_name NOT LIKE '__%');

-- 7. body_comp_data テーブルの権限開放（存在する場合）
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'body_comp_data') THEN
    GRANT ALL ON public.body_comp_data TO anon, authenticated;
    ALTER TABLE public.body_comp_data ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "body_comp_data_all" ON public.body_comp_data;
    CREATE POLICY "body_comp_data_all" ON public.body_comp_data FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 8. パフォーマンス向上のための基本インデックス
CREATE INDEX IF NOT EXISTS idx_baseball_data_filename ON public.baseball_data (file_name);
CREATE INDEX IF NOT EXISTS idx_baseball_data_team_name ON public.baseball_data (team_name);

-- 9. 【確認用クエリ】設定完了したポリシー一覧を表示
SELECT schemaname, tablename, policyname, cmd, roles 
FROM pg_policies 
WHERE tablename = 'baseball_data';
