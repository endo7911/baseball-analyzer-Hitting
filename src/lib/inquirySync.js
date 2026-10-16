import { supabase } from './supabase';
import { encryptPayload, decryptPayload } from './userSync';

// 問い合わせは baseball_data に1件1行で保存する（file_name が '__' 始まりなので
// 分析画面・クラウド管理には出ず、RLS で削除もできない）
const INQUIRY_FILE_NAME = '__inquiry__';

export const INQUIRY_CATEGORIES = [
  { id: 'usage', label: '使い方について' },
  { id: 'data', label: 'データ・表示の不具合' },
  { id: 'request', label: '機能の要望' },
  { id: 'account', label: 'アカウント・ログイン' },
  { id: 'other', label: 'その他' },
];

export const categoryLabel = (id) =>
  INQUIRY_CATEGORIES.find(c => c.id === id)?.label || 'その他';

async function getAuthHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }
  } catch {}
  try {
    const rawProfile = sessionStorage.getItem('mockProfile') || localStorage.getItem('mockProfile') || localStorage.getItem('baseball_current_user');
    if (rawProfile) {
      const p = typeof rawProfile === 'string' && (rawProfile.startsWith('{') || rawProfile.startsWith('[')) ? JSON.parse(rawProfile) : rawProfile;
      if (p?.email) {
        headers['X-Legacy-Admin-Email'] = p.email;
        headers['X-User-Email'] = p.email;
      }
    }
  } catch {}
  return headers;
}

// 全件取得（新しい順）
export async function fetchInquiries() {
  // 1. Try serverless API
  try {
    const headers = await getAuthHeaders();
    const res = await fetch('/api/inquiries', { headers });
    if (res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.inquiries)) {
        return data.inquiries;
      }
    }
  } catch (err) {
    console.warn('API fetchInquiries error, falling back to direct client:', err);
  }

  // 2. Direct Supabase fallback
  const { data, error } = await supabase
    .from('baseball_data')
    .select('id, upload_id, created_at')
    .eq('file_name', INQUIRY_FILE_NAME)
    .limit(2000);
  if (error) throw error;

  const list = await Promise.all((data || []).map(async (row) => {
    const body = await decryptPayload(row.upload_id);
    if (!body) return null;
    return { ...body, rowId: row.id, created_at: body.created_at || row.created_at };
  }));

  return list
    .filter(Boolean)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

// 新規送信
// source: 'app'（ログイン後） | 'login'（ログイン画面・未ログイン）
export async function submitInquiry({ source, loginId, displayName, contact, category, subject, message }) {
  const payload = {
    source: source || 'app',
    loginId: String(loginId || '').trim().toLowerCase(),
    displayName: String(displayName || '').trim(),
    contact: String(contact || '').trim(),
    category: category || 'other',
    subject: String(subject || '').trim(),
    message: String(message || '').trim(),
  };

  // 1. Try serverless API
  try {
    const res = await fetch('/api/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      const data = await res.json();
      if (data.success) return true;
    }
  } catch (err) {
    console.warn('API submitInquiry error, falling back to direct client:', err);
  }

  // 2. Direct Supabase fallback
  const body = {
    source: payload.source,
    login_id: payload.loginId,
    display_name: payload.displayName,
    contact: payload.contact,
    category: payload.category,
    subject: payload.subject,
    message: payload.message,
    status: 'open',
    reply: null,
    replied_at: null,
    read_by_user: true,
    created_at: new Date().toISOString(),
  };
  const enc = await encryptPayload(body);
  const { error } = await supabase.from('baseball_data').insert([{
    file_name: INQUIRY_FILE_NAME,
    player_name: '__inquiry__',
    team_name: '__system__',
    upload_id: enc,
  }]);
  if (error) throw error;
  return true;
}

// 1件更新（返信・ステータス変更・既読）
export async function updateInquiry(inquiry, changes) {
  // 1. Try serverless API
  try {
    const headers = await getAuthHeaders();
    const res = await fetch('/api/inquiries', {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ rowId: inquiry.rowId, changes })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.inquiry) return data.inquiry;
    }
  } catch (err) {
    console.warn('API updateInquiry error, falling back to direct client:', err);
  }

  // 2. Direct Supabase fallback
  const { rowId, ...rest } = inquiry;
  const next = { ...rest, ...changes, updated_at: new Date().toISOString() };
  const enc = await encryptPayload(next);
  const { error } = await supabase
    .from('baseball_data')
    .update({ upload_id: enc, updated_at: next.updated_at })
    .eq('id', rowId)
    .eq('file_name', INQUIRY_FILE_NAME);
  if (error) throw error;
  return { ...next, rowId };
}

// ログイン中の利用者の問い合わせだけ
export async function fetchMyInquiries(loginId) {
  const key = String(loginId || '').trim().toLowerCase();
  if (!key) return [];

  // 1. Try serverless API with user_email filter
  try {
    const res = await fetch(`/api/inquiries?user_email=${encodeURIComponent(key)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.inquiries)) {
        return data.inquiries;
      }
    }
  } catch (err) {
    console.warn('API fetchMyInquiries error, falling back to fetchInquiries:', err);
  }

  // 2. Fallback
  const all = await fetchInquiries();
  return all.filter(i => (i.login_id || '').toLowerCase() === key);
}
