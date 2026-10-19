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

  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown';
  const cleanEmail = String(email).trim().toLowerCase();

  // 1. Try serverless API (/api/logs)
  try {
    const res = await fetch('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: cleanEmail,
        userId,
        teamId,
        eventType,
        status,
        details,
        userAgent
      })
    });
    if (res.ok) return;
  } catch {}

  // 2. Try dedicated access_logs table in Supabase
  try {
    const { error: insErr } = await supabase.from('access_logs').insert([
      {
        user_id: userId && userId.includes('-') ? userId : null,
        email: cleanEmail,
        team_id: teamId,
        event_type: eventType,
        status: status,
        user_agent: userAgent,
        details: details,
        created_at: new Date().toISOString()
      }
    ]);
    if (!insErr) return;
  } catch {}

  // 3. Fallback to baseball_data (__access_log__)
  try {
    const logPayload = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      user_id: userId || null,
      email: cleanEmail,
      team_id: teamId || null,
      event_type: eventType,
      status: status || 'info',
      user_agent: userAgent,
      details: details || {},
      created_at: new Date().toISOString()
    };
    await supabase.from('baseball_data').insert([
      {
        file_name: '__access_log__',
        upload_id: `__log__::${Date.now()}::${JSON.stringify(logPayload)}`,
        team_name: teamId || 'System',
        user_id: null
      }
    ]);
  } catch (err) {
    console.warn('Security audit log recording skipped:', err);
  }
}

