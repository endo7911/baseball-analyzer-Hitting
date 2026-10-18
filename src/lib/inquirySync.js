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
    const rawUser = sessionStorage.getItem('mockUser') || localStorage.getItem('mockUser');
    const p = rawProfile && typeof rawProfile === 'string' && (rawProfile.startsWith('{') || rawProfile.startsWith('[')) ? JSON.parse(rawProfile) : rawProfile;
    const u = rawUser && typeof rawUser === 'string' && (rawUser.startsWith('{') || rawUser.startsWith('[')) ? JSON.parse(rawUser) : rawUser;
    const email = p?.email || u?.email;
    if (email) {
      headers['X-Legacy-Admin-Email'] = email;
      headers['X-User-Email'] = email;
    }
  } catch {}
  return headers;
}

// 同一 inquiry_id の複数スナップショットから最新状態のみを抽出（削除済みは除外）
function deduplicateInquiries(rawItems) {
  const map = new Map();
  for (const item of rawItems) {
    if (!item) continue;
    const inquiryId = String(item.inquiry_id || item._db_row_id || item.rowId || '');
    if (!inquiryId) continue;

    const existing = map.get(inquiryId);
    if (!existing) {
      map.set(inquiryId, { ...item, inquiry_id: inquiryId, rowId: inquiryId });
    } else {
      const timeExisting = new Date(existing.updated_at || existing._db_created_at || existing.created_at || 0).getTime();
      const timeCandidate = new Date(item.updated_at || item._db_created_at || item.created_at || 0).getTime();
      if (timeCandidate >= timeExisting) {
        map.set(inquiryId, { ...item, inquiry_id: inquiryId, rowId: inquiryId });
      }
    }
  }

  return Array.from(map.values())
    .filter(item => item.deleted !== true)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
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
        return deduplicateInquiries(data.inquiries);
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
    .order('created_at', { ascending: false })
    .limit(2000);
  if (error) throw error;

  const list = await Promise.all((data || []).map(async (row) => {
    const body = await decryptPayload(row.upload_id);
    if (!body) return null;
    const inquiryId = body.inquiry_id || row.id;
    return {
      ...body,
      inquiry_id: inquiryId,
      rowId: inquiryId,
      _db_row_id: row.id,
      _db_created_at: row.created_at,
      created_at: body.created_at || row.created_at,
    };
  }));

  return deduplicateInquiries(list);
}

// 新規送信
// source: 'app'（ログイン後） | 'login'（ログイン画面・未ログイン）
export async function submitInquiry({ source, loginId, displayName, contact, category, subject, message }) {
  const inquiryId = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `inq_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  const payload = {
    inquiryId,
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
  const nowIso = new Date().toISOString();
  const body = {
    inquiry_id: inquiryId,
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
    created_at: nowIso,
    updated_at: nowIso,
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

// 1件更新（返信・ステータス変更・既読・削除）
export async function updateInquiry(inquiry, changes) {
  const inquiryId = inquiry.inquiry_id || inquiry.rowId;
  const dbRowId = inquiry._db_row_id || inquiry.rowId;

  // 1. Try serverless API
  try {
    const headers = await getAuthHeaders();
    const res = await fetch('/api/inquiries', {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ rowId: inquiryId, dbRowId, inquiry, changes })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.inquiry) {
        return {
          ...data.inquiry,
          inquiry_id: inquiryId,
          rowId: inquiryId,
        };
      }
    }
  } catch (err) {
    console.warn('API updateInquiry error, falling back to direct client:', err);
  }

  // 2. Direct Supabase fallback (try UPDATE first; if RLS blocks UPDATE with 0 rows, append snapshot via INSERT)
  const { rowId: _r, _db_row_id: _d, _db_created_at: _c, ...rest } = inquiry;
  const next = {
    ...rest,
    ...changes,
    inquiry_id: inquiryId,
    updated_at: new Date().toISOString(),
  };
  const enc = await encryptPayload(next);

  let updatedInPlace = false;
  if (dbRowId) {
    const { data: updatedRows, error: updateErr } = await supabase
      .from('baseball_data')
      .update({ upload_id: enc, updated_at: next.updated_at })
      .eq('id', dbRowId)
      .eq('file_name', INQUIRY_FILE_NAME)
      .select('id');
    if (!updateErr && Array.isArray(updatedRows) && updatedRows.length > 0) {
      updatedInPlace = true;
    }
  }

  let latestDbRowId = dbRowId;
  if (!updatedInPlace) {
    const { data: insertedRows, error: insertErr } = await supabase
      .from('baseball_data')
      .insert([{
        file_name: INQUIRY_FILE_NAME,
        player_name: '__inquiry__',
        team_name: '__system__',
        upload_id: enc,
      }])
      .select('id');
    if (insertErr) throw insertErr;
    if (insertedRows?.[0]?.id) {
      latestDbRowId = insertedRows[0].id;
    }
  }

  return {
    ...next,
    inquiry_id: inquiryId,
    rowId: inquiryId,
    _db_row_id: latestDbRowId,
  };
}

// 1件削除（論理削除スナップショットを記録）
export async function deleteInquiry(inquiry) {
  return updateInquiry(inquiry, { deleted: true });
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
        return deduplicateInquiries(data.inquiries).filter(i => (i.login_id || '').toLowerCase() === key);
      }
    }
  } catch (err) {
    console.warn('API fetchMyInquiries error, falling back to fetchInquiries:', err);
  }

  // 2. Fallback
  const all = await fetchInquiries();
  return all.filter(i => (i.login_id || '').toLowerCase() === key);
}

