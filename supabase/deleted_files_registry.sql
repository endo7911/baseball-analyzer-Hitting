-- ============================================================================
-- 専用削除レジストリ（Tombstone）テーブル: deleted_files_registry
-- 従来 baseball_data に __deleted_files_registry_v1__ のダミー行として保存していた
-- ファイル削除履歴を専用テーブルへ分離します。
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.deleted_files_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name text NOT NULL,
  file_type text DEFAULT 'any',
  team_name text DEFAULT 'ALL',
  deleted_by text,
  deleted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deleted_files_registry_file_name
  ON public.deleted_files_registry (file_name);

CREATE INDEX IF NOT EXISTS idx_deleted_files_registry_team_name
  ON public.deleted_files_registry (team_name);

ALTER TABLE public.deleted_files_registry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read deleted_files_registry" ON public.deleted_files_registry;
CREATE POLICY "Allow read deleted_files_registry"
  ON public.deleted_files_registry
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Allow insert deleted_files_registry" ON public.deleted_files_registry;
CREATE POLICY "Allow insert deleted_files_registry"
  ON public.deleted_files_registry
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow delete deleted_files_registry" ON public.deleted_files_registry;
CREATE POLICY "Allow delete deleted_files_registry"
  ON public.deleted_files_registry
  FOR DELETE
  USING (true);

-- 既存の baseball_data 内のレガシー Tombstone ダミー行を移行・クリーンアップする場合:
-- DELETE FROM public.baseball_data WHERE file_name = '__deleted_files_registry_v1__';
