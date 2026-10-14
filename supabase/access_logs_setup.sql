-- ==============================================================================
-- Baseball Analyzer: Access & Security Audit Logs Table
-- ==============================================================================
-- 管理者のみが各アカウントのログイン履歴・不正アクセス試行を監視できるテーブルです。
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.access_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  email TEXT NOT NULL,
  team_id TEXT,
  event_type TEXT NOT NULL, -- 'login_success' | 'login_failed' | 'temp_login' | 'password_changed' | 'account_disabled_try' | 'data_upload'
  status TEXT NOT NULL DEFAULT 'info', -- 'info' | 'success' | 'warning' | 'danger'
  ip_address TEXT,
  user_agent TEXT,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::TEXT, NOW()) NOT NULL
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_access_logs_email ON public.access_logs (email);
CREATE INDEX IF NOT EXISTS idx_access_logs_created_at ON public.access_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_logs_event_type ON public.access_logs (event_type);

-- RLS 有効化
ALTER TABLE public.access_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "access_logs_admin_select" ON public.access_logs;
DROP POLICY IF EXISTS "access_logs_insert" ON public.access_logs;

-- SELECT: 管理者（または service_role）のみ全ログを閲覧可能
CREATE POLICY "access_logs_admin_select" ON public.access_logs
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- INSERT: ログイン成否の記録のため、匿名(anon)および認証済み双方から追加許可
CREATE POLICY "access_logs_insert" ON public.access_logs
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);
