import React, { useEffect, useState } from 'react';
import { MessageSquare, RefreshCw, Send, CheckCircle2, LogIn, AlertTriangle } from 'lucide-react';
import { categoryLabel, fetchInquiries, updateInquiry } from '../lib/inquirySync';

const fmt = (iso) => iso ? new Date(iso).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

const FILTERS = [
  { id: 'open', label: '未対応' },
  { id: 'answered', label: '回答済み' },
  { id: 'closed', label: '完了' },
  { id: 'all', label: 'すべて' },
];

function AdminInquiries() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('open');
  const [openId, setOpenId] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [saving, setSaving] = useState(null);

  const load = async () => {
    setLoading(true);
    try { setList(await fetchInquiries()); }
    catch (e) { console.error('fetch inquiries error', e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const save = async (inq, changes) => {
    setSaving(inq.rowId);
    try {
      const updated = await updateInquiry(inq, changes);
      setList(prev => prev.map(i => i.rowId === inq.rowId ? updated : i));
      return true;
    } catch (e) {
      console.error(e);
      alert('保存に失敗しました。');
      return false;
    } finally {
      setSaving(null);
    }
  };

  const sendReply = async (inq) => {
    const text = (drafts[inq.rowId] ?? '').trim();
    if (!text) return;
    if (!confirm('この内容で回答しますか？（利用者の問い合わせページに表示されます）')) return;
    const ok = await save(inq, { reply: text, replied_at: new Date().toISOString(), status: 'answered', read_by_user: false });
    if (ok) setDrafts(d => ({ ...d, [inq.rowId]: undefined }));
  };

  const counts = {
    open: list.filter(i => i.status === 'open').length,
    answered: list.filter(i => i.status === 'answered').length,
    closed: list.filter(i => i.status === 'closed').length,
    all: list.length,
  };
  const shown = filter === 'all' ? list : list.filter(i => i.status === filter);

  return (
    <div className="bg-slate-800/60 border border-slate-700/50 rounded-3xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-blue-400" /> 問い合わせ
          {counts.open > 0 && <span className="text-[11px] font-bold bg-red-500 text-white px-2 py-0.5 rounded-full">未対応 {counts.open}</span>}
        </h2>
        <button onClick={load} className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white cursor-pointer">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> 更新
        </button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {FILTERS.map(f => (
          <button
            key={f.id}
            id={`admin-inquiry-filter-${f.id}`}
            onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border cursor-pointer ${filter === f.id ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-900 border-slate-700 text-slate-300'}`}
          >
            {f.label}（{counts[f.id]}）
          </button>
        ))}
      </div>

      {shown.length === 0 && !loading && (
        <div className="text-sm text-slate-500 text-center py-6">該当する問い合わせはありません。</div>
      )}

      <div className="space-y-2">
        {shown.map(inq => {
          const isOpen = openId === inq.rowId;
          const fromLogin = inq.source === 'login';
          return (
            <div key={inq.rowId} className="border border-slate-700/60 rounded-2xl overflow-hidden bg-slate-900/40">
              <button onClick={() => setOpenId(isOpen ? null : inq.rowId)} className="w-full text-left p-3 flex items-center gap-3 cursor-pointer hover:bg-slate-800/60">
                {fromLogin
                  ? <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/30"><LogIn className="w-3 h-3" />ログイン画面</span>
                  : <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/30">{categoryLabel(inq.category)}</span>}
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-bold text-white truncate">{inq.subject || '(件名なし)'}</span>
                  <span className="block text-[11px] text-slate-500 truncate">{inq.display_name || '-'}（ID: {inq.login_id || '-'}）・{fmt(inq.created_at)}</span>
                </span>
                {inq.status === 'open' && <span className="w-2 h-2 rounded-full bg-red-500" />}
              </button>

              {isOpen && (
                <div className="px-3 pb-3 space-y-3">
                  {fromLogin && (
                    <div className="flex gap-2 text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl p-2.5">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                      <span>ログインせずに送られた問い合わせです。名乗っているIDが本人とは限りません。一時パスワードを発行する前に、登録済みの連絡先などで本人確認をしてください。回答は下の連絡先へ直接お送りください。</span>
                    </div>
                  )}
                  {inq.contact && <div className="text-xs text-slate-300">連絡先：<span className="font-mono">{inq.contact}</span></div>}
                  <div className="text-sm text-slate-300 whitespace-pre-wrap bg-slate-900/70 rounded-xl p-3">{inq.message}</div>

                  {inq.reply && (
                    <div className="border border-emerald-500/30 bg-emerald-500/5 rounded-xl p-3">
                      <div className="text-[11px] font-bold text-emerald-300 mb-1">
                        回答済み（{fmt(inq.replied_at)}）{!fromLogin && (inq.read_by_user ? '・既読' : '・未読')}
                      </div>
                      <div className="text-sm text-slate-200 whitespace-pre-wrap">{inq.reply}</div>
                    </div>
                  )}

                  {!fromLogin && (
                    <div className="space-y-2">
                      <textarea
                        id={`admin-inquiry-reply-${inq.rowId}`}
                        rows={3}
                        value={drafts[inq.rowId] ?? ''}
                        onChange={(e) => setDrafts(d => ({ ...d, [inq.rowId]: e.target.value }))}
                        placeholder={inq.reply ? '回答を書き直す（上書きされます）' : '回答を入力'}
                        className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {!fromLogin && (
                      <button
                        onClick={() => sendReply(inq)}
                        disabled={saving === inq.rowId || !(drafts[inq.rowId] ?? '').trim()}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-bold cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5" /> 回答する
                      </button>
                    )}
                    {inq.status !== 'closed' ? (
                      <button
                        onClick={() => save(inq, { status: 'closed' })}
                        disabled={saving === inq.rowId}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-100 text-xs font-bold cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> 対応完了にする
                      </button>
                    ) : (
                      <button
                        onClick={() => save(inq, { status: inq.reply ? 'answered' : 'open' })}
                        disabled={saving === inq.rowId}
                        className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 text-xs font-bold cursor-pointer"
                      >
                        未完了に戻す
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default AdminInquiries;
