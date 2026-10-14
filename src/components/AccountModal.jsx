import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { changeUserPassword } from '../lib/userSync';
import { User, Shield, KeyRound, Eye, EyeOff, Check, AlertCircle, LogOut, X, CheckCircle2 } from 'lucide-react';

function AccountModal({ isOpen, onClose, profile, onLogout }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  if (!isOpen || !profile) return null;

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (newPassword.trim().length < 8) {
      setError('パスワードは8文字以上にしてください。');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('確認用パスワードと一致しません。');
      return;
    }

    setLoading(true);

    try {
      const client = supabase;
      const { data: { session } } = await client.auth.getSession();

      // 1. Try serverless change-password API (updates Supabase Auth & Legacy storage)
      let apiSuccess = false;
      try {
        const headers = { 'Content-Type': 'application/json' };
        if (session?.access_token) {
          headers['Authorization'] = `Bearer ${session.access_token}`;
        }
        if (profile?.email) {
          headers['X-User-Email'] = profile.email;
        }

        const res = await fetch('/api/auth/change-password', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            email: profile.email,
            newPassword: newPassword.trim()
          })
        });

        const data = await res.json().catch(() => ({}));
        if (res.ok && data.success) {
          apiSuccess = true;
        } else if (!res.ok && data.error) {
          throw new Error(data.error);
        }
      } catch (apiErr) {
        if (apiErr.message && !apiErr.message.includes('fetch')) {
          throw apiErr;
        }
        console.warn('Change password API fetch failed, falling back to direct method:', apiErr);
      }

      // 2. Client-side fallback if API was unreachable
      if (!apiSuccess) {
        if (session) {
          const { error: updateErr } = await client.auth.updateUser({
            password: newPassword.trim()
          });
          if (updateErr) throw updateErr;

          if (profile.id) {
            await client
              .from('profiles')
              .update({ temp_password_info: null, updated_at: new Date().toISOString() })
              .eq('id', profile.id);
          }
        } else {
          await changeUserPassword(profile.email, newPassword.trim());
        }
      }

      setSuccess('パスワードを変更しました！次回から新しいパスワードでログインしてください。');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => {
        setSuccess('');
      }, 5000);

    } catch (err) {
      console.error('Password change error:', err);
      setError(err.message || 'パスワードの変更に失敗しました。');
    } finally {
      setLoading(false);
    }
  };

  const displayName = profile.display_name || profile.username || profile.email;
  const teamName = profile.team_name || profile.team_id || 'チーム未設定';
  const roleLabel = profile.role === 'admin' ? '管理者' : '一般ユーザー';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div 
        className="w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-3xl p-6 shadow-2xl relative text-slate-200 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-white">アカウント情報・設定</h3>
              <p className="text-[11px] text-slate-400">ログイン情報とパスワードの変更</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Account Info Card */}
        <div className="my-5 p-4 rounded-2xl bg-slate-800/60 border border-slate-700/60 space-y-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">アカウント名 / ID</span>
              <p className="text-sm font-bold text-white truncate">{displayName}</p>
              <p className="text-xs text-slate-400 font-mono truncate">{profile.email}</p>
            </div>
            <div className="text-right shrink-0">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">権限</span>
              <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                profile.role === 'admin'
                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                  : 'bg-slate-700 text-slate-300'
              }`}>
                {roleLabel}
              </span>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-700/50 flex items-center justify-between">
            <span className="text-xs text-slate-400">所属チーム:</span>
            <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-lg border border-emerald-500/20 truncate max-w-[200px]">
              {teamName}
            </span>
          </div>
        </div>

        {/* Password Change Section */}
        <form onSubmit={handlePasswordChange} className="space-y-3.5">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-300 mb-1">
            <KeyRound className="w-4 h-4 text-amber-400" />
            <span>パスワードの変更</span>
          </div>

          {error && (
            <div className="p-3 bg-red-950/40 border border-red-500/40 rounded-xl text-red-300 text-xs flex items-center gap-2 animate-fadeIn">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-3 bg-emerald-950/40 border border-emerald-500/40 rounded-xl text-emerald-300 text-xs flex items-center gap-2 animate-fadeIn">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{success}</span>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-bold text-slate-400 mb-1">新しいパスワード（8文字以上）</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="新しいパスワードを入力"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-400 mb-1">新しいパスワード（確認用）</label>
            <input
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="もう一度入力してください"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !newPassword || !confirmPassword}
            className={`w-full py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-lg cursor-pointer ${
              loading || !newPassword || !confirmPassword
                ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-500/20'
            }`}
          >
            {loading ? (
              <span>更新中...</span>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>パスワードを更新する</span>
              </>
            )}
          </button>
        </form>

        {/* Footer with Logout */}
        <div className="mt-5 pt-4 border-t border-slate-800 flex items-center justify-between">
          <span className="text-[11px] text-slate-500">Baseball Analyzer v2.0</span>
          {onLogout && (
            <button
              onClick={() => {
                onClose();
                onLogout();
              }}
              className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1.5 transition py-1 px-2.5 rounded-lg hover:bg-red-500/10 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>ログアウト</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default AccountModal;
