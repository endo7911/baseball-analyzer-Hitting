import { supabase } from './supabase';

/**
 * ログ記録関数（管理者専用の不正アクセス監視テーブルに送信）
 * @param {Object} params
 * @param {string} params.email - 対象アカウントのメールまたはID
 * @param {string} [params.userId] - Supabase Auth の UUID
 * @param {string} [params.teamId] - チーム名/ID
 * @param {'login_success'|'login_failed'|'temp_login'|'password_changed'|'account_disabled_try'|'data_upload'} params.eventType - イベント種別
 * @param {'success'|'info'|'warning'|'danger'} [params.status='info'] - 危険度/ステータス
 * @param {Object} [params.details={}] - 詳細情報（エラー理由、ファイル名、件数など）
 */
export async function recordSecurityLog({
  email,
  userId = null,
  teamId = null,
  eventType,
  status = 'info',
  details = {}
}) {
  if (!email) return;

  try {
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown';

    await supabase.from('access_logs').insert([
      {
        user_id: userId,
        email: email.trim().toLowerCase(),
        team_id: teamId,
        event_type: eventType,
        status: status,
        user_agent: userAgent,
        details: details,
        created_at: new Date().toISOString()
      }
    ]);
  } catch (err) {
    // ログ記録の失敗がユーザーのログインや通常操作を阻害しないよう、コンソール警告のみ
    console.warn('Security audit log recording skipped:', err);
  }
}
