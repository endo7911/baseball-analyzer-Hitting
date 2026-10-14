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

// 全件取得（新しい順）
export async function fetchInquiries() {
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
  const body = {
    source,
    login_id: String(loginId || '').trim().toLowerCase(),
    display_name: String(displayName || '').trim(),
    contact: String(contact || '').trim(),
    category: category || 'other',
    subject: String(subject || '').trim(),
    message: String(message || '').trim(),
    status: 'open', // 'open' | 'answered' | 'closed'
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
  const all = await fetchInquiries();
  return all.filter(i => i.source === 'app' && i.login_id === key);
}
