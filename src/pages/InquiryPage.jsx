import React, { useEffect, useState } from 'react';
import { MessageSquare, Send, RefreshCw, CheckCircle2, Clock, Reply } from 'lucide-react';
import { INQUIRY_CATEGORIES, categoryLabel, fetchMyInquiries, submitInquiry, updateInquiry } from '../lib/inquirySync';

const STATUS = {
  open: { label: '確認待ち', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30', icon: Clock },
  answered: { label: '回答あり', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', icon: Reply },
  closed: { label: '対応完了', cls: 'bg-slate-500/15 text-slate-300 border-slate-500/30', icon: CheckCircle2 },
};

const fmt = (iso) => iso ? new Date(iso).toLocaleString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

function InquiryPage({ user, profile }) {
  const loginId = user?.email || profile?.email || '';
  const [form, setForm] = useState({ category: 'usage', subject: '', message: '' });
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState(null);
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      setList(await fetchMyInquiries(loginId));
    } catch (e) {
      console.error('fetch inquiries error', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [loginId]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.subject.trim() || !form.message.trim()) {
      setNotice({ type: 'error', text: '件名と内容を入力してください。' });
      return;
    }
    setSending(true);
    try {
      await submitInquiry({
        source: 'app',
        loginId,
        displayName: profile?.display_name || loginId,
        category: form.category,
        subject: form.subject,
        message: form.message,
      });
      setForm({ category: 'usage', subject: '', message: '' });
      setNotice({ type: 'success', text: '送信しました。回答はこのページの「送信した問い合わせ」に表示されます。' });
      await load();
    } catch (err) {
      console.error(err);
      setNotice({ type: 'error', text: '送信に失敗しました。時間をおいて再度お試しください。' });
    } finally {
      setSending(false);
      setTimeout(() => setNotice(null), 6000);
    }
  };

  const toggle = async (inq) => {
    const next = openId === inq.rowId ? null : inq.rowId;
    setOpenId(next);
    // 回答を開いたら既読にする
    if (next && inq.reply && inq.read_by_user === false) {
      try {
        const updated = await updateInquiry(inq, { read_by_user: true });
        setList(prev => prev.map(i => i.rowId === inq.rowId ? updated : i));
      } catch {}
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
          <MessageSquare className="w-5 h-5 text-blue-400" />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold text-white">お問い合わせ</h1>
          <p className="text-slate-400 text-sm">使い方・不具合・ご要望などをお送りください。管理者からの回答はこのページに表示されます。</p>
        </div>
      </div>

      {/* 送信フォーム */}
      <form onSubmit={submit} className="bg-slate-800/60 border border-slate-700/50 rounded-3xl p-6 space-y-4">
        <h2 className="text-lg font-bold text-white">新しく問い合わせる</h2>

        <div>
          <label className="block text-xs font-bold text-slate-400 mb-2">種類</label>
          <div className="flex flex-wrap gap-2">
            {INQUIRY_CATEGORIES.map(c => (
              <button
                key={c.id}
                type="button"
                id={`inquiry-category-${c.id}`}
                onClick={() => setForm(f => ({ ...f, category: c.id }))}
                className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all cursor-pointer ${form.category === c.id ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-500'}`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-400 mb-2">件名</label>
          <input
            id="inquiry-subject"
            value={form.subject}
            maxLength={80}
            onChange={(e) => setForm(f => ({ ...f, subject: e.target.value }))}
            placeholder="例：打撃分析のグラフが表示されない"
            className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-400 mb-2">内容</label>
          <textarea
            id="inquiry-message"
            value={form.message}
            maxLength={2000}
            rows={5}
            onChange={(e) => setForm(f => ({ ...f, message: e.target.value }))}
            placeholder="どの画面で・何をしたら・どうなったかを書いていただくと、早く回答できます。"
            className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 resize-y"
          />
          <div className="text-right text-[11px] text-slate-500 mt-1">{form.message.length} / 2000</div>
        </div>

        {notice && (
          <div className={`text-xs px-4 py-3 rounded-xl border ${notice.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-red-500/10 border-red-500/30 text-red-300'}`}>
            {notice.text}
          </div>
        )}

        <button
          id="inquiry-submit"
          type="submit"
          disabled={sending}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-bold cursor-pointer"
        >
          <Send className="w-4 h-4" />
          {sending ? '送信中...' : '送信する'}
        </button>
      </form>

      {/* 送信履歴 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">送信した問い合わせ</h2>
          <button onClick={load} className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white cursor-pointer">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> 更新
          </button>
        </div>

        {list.length === 0 && !loading && (
          <div className="text-sm text-slate-500 bg-slate-800/40 border border-slate-700/50 rounded-2xl p-6 text-center">
            まだ問い合わせはありません。
          </div>
        )}

        {list.map(inq => {
          const st = STATUS[inq.status] || STATUS.open;
          const Icon = st.icon;
          const isOpen = openId === inq.rowId;
          const unread = inq.reply && inq.read_by_user === false;
          return (
            <div key={inq.rowId} className="bg-slate-800/60 border border-slate-700/50 rounded-2xl overflow-hidden">
              <button onClick={() => toggle(inq)} className="w-full text-left p-4 flex items-center gap-3 cursor-pointer hover:bg-slate-800">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border ${st.cls}`}>
                  <Icon className="w-3 h-3" /> {st.label}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-bold text-white truncate">{inq.subject}</span>
                  <span className="block text-[11px] text-slate-500">{categoryLabel(inq.category)}・{fmt(inq.created_at)}</span>
                </span>
                {unread && <span className="text-[10px] font-bold bg-red-500 text-white px-2 py-0.5 rounded-full">NEW</span>}
              </button>

              {isOpen && (
                <div className="px-4 pb-4 space-y-3">
                  <div className="text-sm text-slate-300 whitespace-pre-wrap bg-slate-900/60 rounded-xl p-3">{inq.message}</div>
                  {inq.reply ? (
                    <div className="border border-emerald-500/30 bg-emerald-500/5 rounded-xl p-3">
                      <div className="text-[11px] font-bold text-emerald-300 mb-1">管理者からの回答（{fmt(inq.replied_at)}）</div>
                      <div className="text-sm text-slate-200 whitespace-pre-wrap">{inq.reply}</div>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500">管理者が確認中です。回答があるとここに表示されます。</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default InquiryPage;
