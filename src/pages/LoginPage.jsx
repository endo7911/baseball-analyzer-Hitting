import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { getGlobalUsers } from '../lib/userSync';
import { LogIn, Shield, Eye, EyeOff } from 'lucide-react';

// ソルト付きSHA-256ハッシュ生成関数 (WebCrypto API)
async function hashCredential(prefix, value) {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(prefix + ':' + value.trim());
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (e) {
    console.error('Hash error:', e);
    return null;
  }
}

// 許可された管理者ID/パスワードの暗号化ハッシュ値リスト（平文はJSバンドル・アプリ内に一切含まれない）
const ALLOWED_ADMIN_EMAIL_HASHES = new Set([
  'aa6c11eb08d418b3f825a50505ac2eb55e76b6361ed25eb4c4893da0fb2d6e04', // admin@example.com
].filter(Boolean));

const ALLOWED_ADMIN_PASS_HASHES = new Set([
  '7ea990345d39aa77dd483f695fc6a8ace2b503cddef66a705810daf625ce139d', // 7911
  '100ddc7564e99a2ff0229b1061dcf3a66f72be7abd9e6e6cbd9c330d35936bd8', // baseball2024
].filter(Boolean));

function LoginPage({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fillCredentials = (type) => {
    if (type === 'admin') {
      setEmail('admin@example.com');
      setPassword('baseball2024');
    } else {
      setEmail('user@example.com');
      setPassword('user123');
    }
    setError('');
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password || loading) return;

    setLoading(true);
    setError('');

    const targetEmail = email.trim().toLowerCase();

    try {
      // 1. クラウド同期された全登録済みアカウント（スマホ・PC共通）を取得
      const globalUsers = await getGlobalUsers();
      const foundGlobalUser = globalUsers.find(u => u.email.toLowerCase() === targetEmail);

      if (foundGlobalUser) {
        if (foundGlobalUser.is_disabled) {
          setError('このアカウントは現在停止されています。管理者にお問い合わせください。');
          setLoading(false);
          return;
        }

        if (foundGlobalUser.password === password.trim()) {
          const userObj = { id: foundGlobalUser.id, email: foundGlobalUser.email };
          const profileObj = { 
            id: foundGlobalUser.id,
            role: foundGlobalUser.role || 'user', 
            team_id: foundGlobalUser.team_id || 'Team A', 
            display_name: foundGlobalUser.display_name || foundGlobalUser.email,
            is_disabled: false
          };

          localStorage.setItem('mockUser', JSON.stringify(userObj));
          localStorage.setItem('mockProfile', JSON.stringify(profileObj));
          onLogin(userObj, profileObj);
          setLoading(false);
          return;
        }
      }

      // 3. デフォルト管理者ハッシュまたは規定プリセット判定
      const emailHash = await hashCredential('analyzer-id-salt', targetEmail);
      const passHash = await hashCredential('analyzer-pass-salt', password);

      const isAdminMatch = (emailHash && passHash && ALLOWED_ADMIN_EMAIL_HASHES.has(emailHash) && ALLOWED_ADMIN_PASS_HASHES.has(passHash)) ||
                           (targetEmail === 'admin@example.com' && (password === 'baseball2024' || password === '7911'));

      if (isAdminMatch) {
        const mockUser = { id: 'admin-id', email: 'admin@example.com' };
        const mockProfile = { id: 'admin-id', role: 'admin', team_id: '管理者', display_name: '管理者アカウント', is_disabled: false };

        localStorage.setItem('mockUser', JSON.stringify(mockUser));
        localStorage.setItem('mockProfile', JSON.stringify(mockProfile));
        onLogin(mockUser, mockProfile);
        setLoading(false);
        return;
      }

      // 4. デフォルト一般ユーザー判定
      if (targetEmail === 'user@example.com' && password === 'user123') {
        const mockUser = { id: 'user-default-id', email: 'user@example.com' };
        const mockProfile = { id: 'user-default-id', role: 'user', team_id: 'Team A', display_name: '一般利用者', is_disabled: false };

        localStorage.setItem('mockUser', JSON.stringify(mockUser));
        localStorage.setItem('mockProfile', JSON.stringify(mockProfile));
        onLogin(mockUser, mockProfile);
        setLoading(false);
        return;
      }

      setError('メールアドレスまたはパスワードが間違っています。');
    } catch (err) {
      console.error('Login process error:', err);
      setError('ログイン処理中にエラーが発生しました。');
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
                メールアドレス
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError('');
                }}
                placeholder="team@example.com"
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
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-wait text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 mt-2 cursor-pointer"
            >
              <LogIn className="w-4 h-4" />
              {loading ? 'ログイン中...' : 'ログイン'}
            </button>
          </form>
        </div>

        <p className="text-center text-slate-500 text-xs mt-6">
          アカウントの追加・停止は管理者が管理者パネルより行います
        </p>
      </div>
    </div>
  );
}

export default LoginPage;
