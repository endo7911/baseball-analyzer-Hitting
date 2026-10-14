import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { getGlobalUsers, verifyPassword, changeUserPassword } from '../lib/userSync';
import { recordSecurityLog } from '../lib/auditLogger';
import { LogIn, Shield, Eye, EyeOff, KeyRound } from 'lucide-react';

function LoginPage({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // 一時パスワードでログインした時の「新しいパスワードを設定しますか？」
  const [pendingLogin, setPendingLogin] = useState(null);
  const [pwStep, setPwStep] = useState('ask'); // 'ask' | 'form'
  const [newPw, setNewPw] = useState('');
  const [newPw2, setNewPw2] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  const finishLogin = (userObj, profileObj) => {
    sessionStorage.setItem('mockUser', JSON.stringify(userObj));
    sessionStorage.setItem('mockProfile', JSON.stringify(profileObj));
    localStorage.removeItem('mockUser');
    localStorage.removeItem('mockProfile');
    onLogin(userObj, profileObj);
  };

  const submitNewPassword = async (e) => {
    e.preventDefault();
    setPwError('');
    if (!newPw.trim()) {
      setPwError('新しいパスワードを入力してください。');
      return;
    }
    if (newPw !== newPw2) {
      setPwError('2回入力したパスワードが一致しません。');
      return;
    }
    setPwSaving(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        // 1. Supabase Auth のパスワードを更新
        const { error: updateErr } = await supabase.auth.updateUser({
          password: newPw.trim()
        });

        if (updateErr) {
          console.error('Supabase password update failed:', updateErr);
          setPwError('パスワード更新に失敗しました: ' + (updateErr.message || '時間をおいて再度お試しください。'));
          setPwSaving(false);
          return;
        }

        // 2. profiles テーブルの一時パスワード情報をクリア
        if (pendingLogin?.userObj?.id) {
          await supabase
            .from('profiles')
            .update({
              temp_password_info: null,
              updated_at: new Date().toISOString()
            })
            .eq('id', pendingLogin.userObj.id);
        }
      } else {
        // フォールバック: レガシー暗号化ストレージのパスワードを更新
        await changeUserPassword(pendingLogin.userObj.email, newPw.trim());
      }

      // ログ記録
      recordSecurityLog({
        email: pendingLogin.userObj.email,
        userId: pendingLogin.userObj.id,
        teamId: pendingLogin.profileObj?.team_id,
        eventType: 'password_changed',
        status: 'info',
        details: { action: 'user_reset_temp_password' }
      });

      alert('新しいパスワードを設定しました。次回からは新しいパスワードでログインしてください。');
      finishLogin(pendingLogin.userObj, pendingLogin.profileObj);
    } catch (err) {
      console.error('Submit new password error:', err);
      setPwError('予期しないエラーが発生しました。');
    } finally {
      setPwSaving(false);
    }
  };

  const skipNewPassword = () => {
    finishLogin(pendingLogin.userObj, pendingLogin.profileObj);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password || loading) return;

    setLoading(true);
    setError('');

    const rawInput = email.trim();
    // IDがメールアドレス形式でない場合は内部ドメインを補完
    const targetEmail = rawInput.includes('@')
      ? rawInput.toLowerCase()
      : `${rawInput.toLowerCase()}@baseball-analyzer.internal`;
    const cleanPassword = password.trim();

    try {
      // =======================================================================
      // Step 1: Supabase Auth (公式認証) でのログイン照合
      // =======================================================================
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: targetEmail,
        password: cleanPassword
      });

      if (!authError && authData?.user) {
        const authUser = authData.user;

        // profiles テーブルからプロファイル情報を取得
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', authUser.id)
          .single();

        if (profileError && profileError.code !== 'PGRST116') {
          console.warn('Profile fetch warning:', profileError);
        }

        // アカウント停止チェック
        if (profileData?.is_disabled) {
          await supabase.auth.signOut();
          recordSecurityLog({
            email: targetEmail,
            userId: authUser.id,
            teamId: profileData?.team_id,
            eventType: 'account_disabled_try',
            status: 'warning',
            details: { reason: 'account_disabled' }
          });
          setError('このアカウントは現在停止されています。管理者にお問い合わせください。');
          setLoading(false);
          return;
        }

        const userObj = {
          id: authUser.id,
          email: authUser.email
        };

        const profileObj = {
          id: authUser.id,
          email: authUser.email,
          username: profileData?.username || rawInput,
          display_name: profileData?.display_name || profileData?.username || rawInput,
          role: profileData?.role || authUser.user_metadata?.role || 'user',
          team_id: profileData?.team_id || authUser.user_metadata?.team_id || 'Team A',
          team_name: profileData?.team_name || profileData?.team_id || 'Team A',
          is_disabled: false,
          allow_hitting: profileData?.allow_hitting !== false,
          allow_pitching: profileData?.allow_pitching !== false,
          allow_body_comp: profileData?.allow_body_comp !== false,
          permissions: {
            hitting: profileData?.allow_hitting !== false,
            pitching: profileData?.allow_pitching !== false,
            bodyComp: profileData?.allow_body_comp !== false
          }
        };

        // 一時パスワードでのログインか確認
        if (profileData?.temp_password_info?.is_temporary || profileData?.temp_password_info?.is_initial) {
          recordSecurityLog({
            email: userObj.email,
            userId: userObj.id,
            teamId: profileObj.team_id,
            eventType: 'temp_login',
            status: 'warning',
            details: { temp_password_login: true }
          });
          setPendingLogin({ userObj, profileObj });
          setPwStep('ask');
          setLoading(false);
          return;
        }

        // ログイン成功ログ記録
        recordSecurityLog({
          email: userObj.email,
          userId: userObj.id,
          teamId: profileObj.team_id,
          eventType: 'login_success',
          status: 'success',
          details: { method: 'supabase_auth' }
        });

        finishLogin(userObj, profileObj);
        setLoading(false);
        return;
      }

      // =======================================================================
      // Step 2: 移行期間フォールバック (旧クライアントハッシュ照合)
      // =======================================================================
      try {
        const globalUsers = await getGlobalUsers();
        const foundGlobalUser = globalUsers.find(
          u => u.email.toLowerCase() === rawInput.toLowerCase() || u.email.toLowerCase() === targetEmail
        );

        if (foundGlobalUser) {
          if (foundGlobalUser.is_disabled) {
            recordSecurityLog({
              email: targetEmail,
              teamId: foundGlobalUser.team_id,
              eventType: 'account_disabled_try',
              status: 'warning',
              details: { reason: 'legacy_account_disabled' }
            });
            setError('このアカウントは現在停止されています。管理者にお問い合わせください。');
            setLoading(false);
            return;
          }

          const result = await verifyPassword(cleanPassword, foundGlobalUser.password, foundGlobalUser.temp_password);
          if (result) {
            const userObj = { id: foundGlobalUser.id, email: foundGlobalUser.email };
            const profileObj = {
              id: foundGlobalUser.id,
              role: foundGlobalUser.role || 'user',
              team_id: foundGlobalUser.team_id || 'Team A',
              display_name: foundGlobalUser.display_name || foundGlobalUser.email,
              is_disabled: false,
              allow_hitting: foundGlobalUser.allow_hitting !== false,
              allow_pitching: foundGlobalUser.allow_pitching !== false,
              allow_body_comp: foundGlobalUser.allow_body_comp !== false,
              permissions: {
                hitting: foundGlobalUser.allow_hitting !== false,
                pitching: foundGlobalUser.allow_pitching !== false,
                bodyComp: foundGlobalUser.allow_body_comp !== false
              }
            };

            recordSecurityLog({
              email: userObj.email,
              userId: userObj.id,
              teamId: profileObj.team_id,
              eventType: 'login_success',
              status: 'info',
              details: { method: 'legacy_hash_fallback' }
            });

            if (result === 'temp') {
              setPendingLogin({ userObj, profileObj });
              setPwStep('ask');
              setLoading(false);
              return;
            }

            finishLogin(userObj, profileObj);
            setLoading(false);
            return;
          }
        }
      } catch (legacyErr) {
        console.warn('Legacy login fallback check failed:', legacyErr);
      }

      // 不正アクセス/ログイン失敗ログ記録
      recordSecurityLog({
        email: targetEmail,
        eventType: 'login_failed',
        status: 'danger',
        details: { raw_input: rawInput, reason: 'password_mismatch_or_unknown_account' }
      });

      setError('ID / メールアドレスまたはパスワードが間違っています。');

    } catch (err) {
      console.error('Login process error:', err);
      setError('ログイン処理中にエラーが発生しました。ネットワーク接続等をご確認ください。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600/20 border border-blue-500/30 mb-4">
            <Shield className="w-8 h-8 text-blue-400" />
          </div>
          <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500 mb-1">
            Baseball Analyzer
          </h1>
          <p className="text-slate-400 text-xs">チーム専用打撃分析システム</p>
        </div>

        {/* Form */}
        <div className="bg-slate-800/60 backdrop-blur border border-slate-700/50 rounded-3xl p-8 shadow-2xl">
          <h2 className="text-xl font-bold text-white mb-6">ログイン</h2>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                ユーザーID または メールアドレス
              </label>
              <input
                type="text"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError('');
                }}
                placeholder="ID または team@example.com"
                required
                className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                パスワード
              </label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError('');
                  }}
                  placeholder="••••••••"
                  required
                  className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-4 py-3 pr-12 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 cursor-pointer"
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs px-4 py-3 rounded-xl font-medium">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-wait text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 mt-2 cursor-pointer shadow-lg shadow-blue-500/20"
            >
              <LogIn className="w-4 h-4" />
              {loading ? 'ログイン照合中...' : 'ログイン'}
            </button>
          </form>
        </div>

        <p className="text-center text-slate-500 text-xs mt-6">
          アカウントの追加・停止・パスワード再発行は管理者が管理者パネルより行います
        </p>
      </div>

      {pendingLogin && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-slate-800 border border-slate-700 rounded-3xl p-6 shadow-2xl">
            <div className="flex items-center gap-2 mb-3">
              <KeyRound className="w-5 h-5 text-blue-400" />
              <h3 className="text-lg font-bold text-white">新しいパスワードを設定しますか？</h3>
            </div>

            {pwStep === 'ask' ? (
              <>
                <p className="text-slate-400 text-sm mb-6 leading-relaxed">
                  一時パスワードでログインしました。安全のため、新しい正式なパスワードを設定することをおすすめします。
                </p>
                <div className="flex gap-2">
                  <button id="skip-new-password" onClick={skipNewPassword} className="flex-1 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-bold cursor-pointer">
                    今はしない
                  </button>
                  <button id="start-new-password" onClick={() => setPwStep('form')} className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold cursor-pointer">
                    設定する
                  </button>
                </div>
              </>
            ) : (
              <form onSubmit={submitNewPassword} className="space-y-3">
                <input id="new-password" type="password" value={newPw} onChange={(e) => { setNewPw(e.target.value); setPwError(''); }} placeholder="新しいパスワード" className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500" />
                <input id="new-password-confirm" type="password" value={newPw2} onChange={(e) => { setNewPw2(e.target.value); setPwError(''); }} placeholder="もう一度入力" className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500" />
                {pwError && <div className="text-red-400 text-xs">{pwError}</div>}
                <div className="flex gap-2 pt-2">
                  <button type="button" onClick={skipNewPassword} className="flex-1 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-bold cursor-pointer">
                    今はしない
                  </button>
                  <button type="submit" disabled={pwSaving} className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-bold cursor-pointer">
                    {pwSaving ? '保存中...' : '設定する'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default LoginPage;
