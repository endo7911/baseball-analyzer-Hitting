import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { getGlobalUsers, saveGlobalUsers, hashPassword } from '../lib/userSync';
import { Users, Plus, Trash2, Shield, RefreshCw, CheckCircle2, XCircle, Ban, PlayCircle, Key, Clock, Copy, Check, Target, Dumbbell, ArrowUpRight } from 'lucide-react';

function AdminPanel() {
  const [users, setUsers] = useState([]);
  const [teamInputs, setTeamInputs] = useState({});
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', password: '', team_id: '', role: 'user', display_name: '' });
  const [message, setMessage] = useState(null);
  const [tempModal, setTempModal] = useState(null);
  const [copied, setCopied] = useState(false);
  const [serverApiActive, setServerApiActive] = useState(true);
  const [migrating, setMigrating] = useState(false);

  useEffect(() => { 
    fetchUsers(); 
  }, []);

  // API helper for Vercel Serverless Admin Functions
  const callAdminApi = async (method, body = null) => {
    const { data: { session } } = await supabase.auth.getSession();
    const headers = { 'Content-Type': 'application/json' };
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }
    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);

    const res = await fetch('/api/admin/users', options);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return data;
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      // 1. Try Vercel Serverless Function (Supabase Auth + profiles table)
      const data = await callAdminApi('GET');
      if (Array.isArray(data.users)) {
        setUsers(data.users);
        setServerApiActive(true);
        const initialInputs = {};
        data.users.forEach(u => {
          initialInputs[u.id || u.email] = u.team_id || '';
        });
        setTeamInputs(initialInputs);
        setLoading(false);
        return;
      }
    } catch (e) {
      console.warn("Vercel Admin API not available or errored, falling back to legacy storage:", e);
      setServerApiActive(false);
    }

    // 2. Fallback to legacy globalUsers
    try {
      const globalUsers = await getGlobalUsers();
      setUsers(globalUsers);
      const initialInputs = {};
      globalUsers.forEach(u => {
        initialInputs[u.id || u.email] = u.team_id || '';
      });
      setTeamInputs(initialInputs);
    } catch (e) {
      console.error("Fetch users fallback error:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleMigrateOldAccounts = async () => {
    if (!confirm('旧形式で保存されていたすべてのアカウントを、Supabase Auth 公式ログイン機能へ移行しますか？\n（移行後、初期一時パスワードが割り当てられます）')) return;
    
    setMigrating(true);
    try {
      const res = await fetch('/api/admin/migrate', { method: 'POST' });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || '移行に失敗しました');

      alert(`移行処理が完了しました！（移行成功: ${result.migratedCount || 0}件）\nアカウント一覧を更新します。`);
      await fetchUsers();
    } catch (err) {
      alert(`移行中にエラーが発生しました: ${err.message}\n※Vercel環境変数に SUPABASE_SERVICE_ROLE_KEY が設定されていることをご確認ください。`);
    } finally {
      setMigrating(false);
    }
  };

  const addUser = async (e) => {
    e.preventDefault();
    if (!newUser.email || !newUser.password) return;
    setLoading(true);
    
    try {
      // 1. Try serverless API
      if (serverApiActive) {
        try {
          await callAdminApi('POST', {
            email: newUser.email.trim(),
            password: newUser.password.trim(),
            team_id: newUser.team_id.trim() || 'Team A',
            role: newUser.role,
            display_name: newUser.display_name.trim() || newUser.email.trim()
          });

          setMessage({ type: 'success', text: `アカウント「${newUser.email}」を Supabase Auth に追加しました。` });
          setShowAdd(false);
          setNewUser({ email: '', password: '', team_id: '', role: 'user', display_name: '' });
          await fetchUsers();
          setLoading(false);
          setTimeout(() => setMessage(null), 4000);
          return;
        } catch (serverErr) {
          console.warn("Server API add user failed:", serverErr);
          setMessage({ type: 'error', text: `追加失敗: ${serverErr.message}` });
          setLoading(false);
          setTimeout(() => setMessage(null), 5000);
          return;
        }
      }

      // 2. Legacy fallback
      const currentUsers = await getGlobalUsers();
      const cleanEmail = newUser.email.trim().toLowerCase();

      if (currentUsers.some(u => u.email.toLowerCase() === cleanEmail)) {
        setMessage({ type: 'error', text: `アカウント「${cleanEmail}」は既に登録されています。` });
        setLoading(false);
        setTimeout(() => setMessage(null), 4000);
        return;
      }

      const newId = `user-${Date.now()}`;
      const userObj = {
        id: newId,
        email: cleanEmail,
        password: newUser.password.trim(),
        display_name: newUser.display_name.trim() || cleanEmail,
        role: newUser.role,
        team_id: newUser.team_id.trim() || 'Team A',
        is_disabled: false,
        created_at: new Date().toISOString()
      };

      const updatedUsers = [...currentUsers, userObj];
      await saveGlobalUsers(updatedUsers);

      setMessage({ type: 'success', text: `アカウント「${cleanEmail}」を追加しました。` });
      setShowAdd(false);
      setNewUser({ email: '', password: '', team_id: '', role: 'user', display_name: '' });
      setUsers(updatedUsers);
    } catch (err) {
      console.error("Add user error:", err);
      setMessage({ type: 'error', text: 'ユーザーの追加に失敗しました。' });
    } finally {
      setLoading(false);
      setTimeout(() => setMessage(null), 4000);
    }
  };

  const issueTempPassword = async (user) => {
    setLoading(true);
    try {
      if (serverApiActive && user.id) {
        try {
          const res = await callAdminApi('PUT', {
            id: user.id,
            action: 'temp_password'
          });

          setTempModal({
            email: user.email,
            name: user.display_name || user.email,
            pass: res.tempPassword,
            expiresAt: res.expiresAt
          });
          setMessage({ type: 'success', text: `「${user.display_name || user.email}」に30分間有効の一時パスワードを発行しました。` });
          await fetchUsers();
          setLoading(false);
          setTimeout(() => setMessage(null), 4000);
          return;
        } catch (serverErr) {
          console.warn("Server API temp password error, trying legacy:", serverErr);
        }
      }

      // Legacy fallback
      const currentUsers = await getGlobalUsers();
      const tempPass = 'tp' + Math.floor(100000 + Math.random() * 900000);
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      const hashedTemp = await hashPassword(tempPass);

      const updatedUsers = currentUsers.map(u => {
        if (u.id === user.id || u.email.toLowerCase() === user.email.toLowerCase()) {
          return {
            ...u,
            temp_password: {
              hashed: hashedTemp,
              expires_at: expiresAt
            }
          };
        }
        return u;
      });

      await saveGlobalUsers(updatedUsers);
      setUsers(updatedUsers);
      setTempModal({
        email: user.email,
        name: user.display_name || user.email,
        pass: tempPass,
        expiresAt: expiresAt
      });
      setMessage({ type: 'success', text: `「${user.display_name || user.email}」に30分間有効の一時パスワードを発行しました。` });
    } catch (e) {
      console.error("Issue temp password error:", e);
      setMessage({ type: 'error', text: '一時パスワードの発行に失敗しました。' });
    } finally {
      setLoading(false);
      setTimeout(() => setMessage(null), 4000);
    }
  };

  const toggleUserStatus = async (user) => {
    const newStatus = !user.is_disabled;
    const actionName = newStatus ? '停止' : '再開';

    if (!confirm(`「${user.display_name || user.email}」を${actionName}しますか？`)) return;

    setLoading(true);

    try {
      if (serverApiActive && user.id) {
        try {
          await callAdminApi('PUT', {
            id: user.id,
            updates: { is_disabled: newStatus }
          });
          setMessage({ type: 'success', text: `「${user.display_name || user.email}」を${actionName}しました。` });
          await fetchUsers();
          setLoading(false);
          setTimeout(() => setMessage(null), 4000);
          return;
        } catch (sErr) {
          console.warn("Server API toggle status failed:", sErr);
        }
      }

      // Legacy fallback
      const currentUsers = await getGlobalUsers();
      const updatedUsers = currentUsers.map(u => {
        if (u.id === user.id || u.email.toLowerCase() === user.email.toLowerCase()) {
          return { ...u, is_disabled: newStatus };
        }
        return u;
      });

      await saveGlobalUsers(updatedUsers);
      setUsers(updatedUsers);
      setMessage({ type: 'success', text: `「${user.display_name || user.email}」を${actionName}しました。` });
    } catch (e) {
      console.error("Toggle user error:", e);
    } finally {
      setLoading(false);
      setTimeout(() => setMessage(null), 4000);
    }
  };

  const updateTeam = async (userId, email, team_id) => {
    try {
      if (serverApiActive && userId) {
        await callAdminApi('PUT', {
          id: userId,
          updates: { team_id, team_name: team_id }
        });
        await fetchUsers();
        return;
      }

      // Legacy fallback
      const currentUsers = await getGlobalUsers();
      const updatedUsers = currentUsers.map(u => {
        if (u.id === userId || u.email.toLowerCase() === email.toLowerCase()) {
          return { ...u, team_id };
        }
        return u;
      });
      await saveGlobalUsers(updatedUsers);
      setUsers(updatedUsers);
    } catch (e) {
      console.error("Update team error:", e);
    }
  };

  const toggleModulePermission = async (user, moduleKey) => {
    const curPerms = user.permissions || {
      hitting: user.allow_hitting !== false,
      pitching: user.allow_pitching !== false,
      bodyComp: user.allow_body_comp !== false
    };
    const currentStatus = curPerms[moduleKey] !== false;
    const newStatus = !currentStatus;

    const moduleLabels = {
      hitting: '打撃分析',
      pitching: '投手分析',
      bodyComp: '体組成分析'
    };
    const label = moduleLabels[moduleKey] || moduleKey;
    const actionText = newStatus ? 'オン（表示）' : 'オフ（非表示）';

    if (!window.confirm(`「${user.display_name || user.email}」の【${label}】ページの表示を${actionText}に変更しますか？`)) {
      return;
    }

    try {
      if (serverApiActive && user.id) {
        const updateField = moduleKey === 'hitting' ? 'allow_hitting' : (moduleKey === 'pitching' ? 'allow_pitching' : 'allow_body_comp');
        await callAdminApi('PUT', {
          id: user.id,
          updates: { [updateField]: newStatus }
        });

        setMessage({ type: 'success', text: `「${user.display_name || user.email}」の【${label}】を${actionText}に設定しました。` });
        await fetchUsers();
        setTimeout(() => setMessage(null), 3000);
        return;
      }

      // Legacy fallback
      const currentUsers = await getGlobalUsers();
      const updatedUsers = currentUsers.map(u => {
        if (u.id === user.id || u.email.toLowerCase() === user.email.toLowerCase()) {
          const userPerms = u.permissions || {
            hitting: u.allow_hitting !== false,
            pitching: u.allow_pitching !== false,
            bodyComp: u.allow_body_comp !== false
          };
          const newPerms = {
            ...userPerms,
            [moduleKey]: newStatus
          };
          return {
            ...u,
            allow_hitting: newPerms.hitting,
            allow_pitching: newPerms.pitching,
            allow_body_comp: newPerms.bodyComp,
            permissions: newPerms
          };
        }
        return u;
      });

      await saveGlobalUsers(updatedUsers);
      setUsers(updatedUsers);

      setMessage({ type: 'success', text: `「${user.display_name || user.email}」の【${label}】を${actionText}に設定しました。` });
      setTimeout(() => setMessage(null), 3000);
    } catch (e) {
      console.error("Toggle module permission error:", e);
    }
  };

  const deleteUser = async (userId, email) => {
    if (!confirm(`「${email}」のアカウントを削除しますか？`)) return;
    
    setLoading(true);

    try {
      if (serverApiActive && userId) {
        await callAdminApi('DELETE', { id: userId });
        setMessage({ type: 'success', text: `「${email}」を削除しました。` });
        await fetchUsers();
        setLoading(false);
        setTimeout(() => setMessage(null), 4000);
        return;
      }

      // Legacy fallback
      const currentUsers = await getGlobalUsers();
      const updatedUsers = currentUsers.filter(u => u.id !== userId && u.email.toLowerCase() !== email.toLowerCase());

      await saveGlobalUsers(updatedUsers);
      setUsers(updatedUsers);
      setMessage({ type: 'success', text: `「${email}」を削除しました。` });
    } catch (err) {
      console.error("Delete user error:", err);
    } finally {
      setLoading(false);
      setTimeout(() => setMessage(null), 4000);
    }
  };

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-700/60 pb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2.5 rounded-xl bg-blue-600/20 border border-blue-500/30 text-blue-400">
              <Shield className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">管理者パネル</h1>
          </div>
          <p className="text-sm text-slate-400">
            Supabase Auth & Vercel Serverless による安全なアカウント管理・閲覧制限設定
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={fetchUsers}
            disabled={loading}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-sm font-medium transition cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            更新
          </button>
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold shadow-lg shadow-blue-500/20 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            アカウント追加
          </button>
          <button
            onClick={handleMigrateOldAccounts}
            disabled={migrating}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 text-xs font-bold transition cursor-pointer"
            title="旧形式の暗号化アカウントを Supabase Auth 公式ユーザーへ一括インポートします"
          >
            <ArrowUpRight className={`w-4 h-4 ${migrating ? 'animate-spin' : ''}`} />
            {migrating ? '移行中...' : '旧アカウントをSupabase Authへ移行'}
          </button>
        </div>
      </div>

      {/* Mode Banner */}
      <div className={`p-4 rounded-2xl border text-xs flex items-center justify-between gap-4 ${
        serverApiActive 
          ? 'bg-blue-950/40 border-blue-500/30 text-blue-300' 
          : 'bg-amber-950/40 border-amber-500/30 text-amber-300'
      }`}>
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${serverApiActive ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
          <span className="font-bold">
            {serverApiActive 
              ? '【高セキュリティモード】Supabase Auth ＆ Vercel サーバーサイドAPI 稼働中' 
              : '【クライアント暗号モード（移行準備中）】Vercel 環境変数 SUPABASE_SERVICE_ROLE_KEY を設定すると完全サーバー管理へ切り替わります'}
          </span>
        </div>
        <span className="text-slate-400 text-[11px]">
          パスワードはサーバー照合 / DB行レベルセキュリティ（RLS）で保護
        </span>
      </div>

      {/* Notification Toast */}
      {message && (
        <div className={`p-4 rounded-2xl flex items-center gap-3 border ${
          message.type === 'error'
            ? 'bg-red-500/10 border-red-500/30 text-red-400'
            : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
        }`}>
          {message.type === 'error' ? <XCircle className="w-5 h-5 flex-shrink-0" /> : <CheckCircle2 className="w-5 h-5 flex-shrink-0" />}
          <p className="text-sm font-medium">{message.text}</p>
        </div>
      )}

      {/* Add User Modal / Box */}
      {showAdd && (
        <div className="bg-slate-800/80 backdrop-blur border border-slate-700 rounded-3xl p-6 shadow-xl animate-fadeIn">
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Plus className="w-5 h-5 text-blue-400" />
            新しいアカウントを追加
          </h2>
          <form onSubmit={addUser} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                ユーザーID または メールアドレス *
              </label>
              <input
                type="text"
                value={newUser.email}
                onChange={e => setNewUser({ ...newUser, email: e.target.value })}
                placeholder="例: teamA または user@example.com"
                required
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <p className="text-[11px] text-slate-500 mt-1">※メールアドレス以外のIDもそのまま利用可能です</p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                初期パスワード *
              </label>
              <input
                type="password"
                value={newUser.password}
                onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                placeholder="8文字以上"
                required
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                表示名（チーム名・選手名など）
              </label>
              <input
                type="text"
                value={newUser.display_name}
                onChange={e => setNewUser({ ...newUser, display_name: e.target.value })}
                placeholder="例: ○○高校 野球部"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                所属チームID（データ分離用）
              </label>
              <input
                type="text"
                value={newUser.team_id}
                onChange={e => setNewUser({ ...newUser, team_id: e.target.value })}
                placeholder="例: Team A"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <div className="md:col-span-2 flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-medium transition cursor-pointer"
              >
                キャンセル
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-bold shadow-lg shadow-blue-500/20 transition cursor-pointer"
              >
                {loading ? '保存中...' : '登録する'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Users Table */}
      <div className="bg-slate-800/60 backdrop-blur border border-slate-700/60 rounded-3xl overflow-hidden shadow-xl">
        <div className="px-6 py-4 border-b border-slate-700/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-400" />
            <h2 className="text-base font-bold text-white">登録アカウント一覧（{users.length}件）</h2>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-900/60 text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-700/60">
              <tr>
                <th className="px-6 py-4">ID / 表示名</th>
                <th className="px-6 py-4">所属チーム</th>
                <th className="px-6 py-4">権限</th>
                <th className="px-6 py-4 text-center">モジュール表示設定</th>
                <th className="px-6 py-4 text-center">ステータス</th>
                <th className="px-6 py-4 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/40">
              {users.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-8 text-center text-slate-500">
                    登録されているアカウントがありません
                  </td>
                </tr>
              ) : (
                users.map(u => {
                  const isCurrentDisabled = !!u.is_disabled;
                  const perms = u.permissions || {
                    hitting: u.allow_hitting !== false,
                    pitching: u.allow_pitching !== false,
                    bodyComp: u.allow_body_comp !== false
                  };

                  return (
                    <tr key={u.id || u.email} className={`hover:bg-slate-750/30 transition ${isCurrentDisabled ? 'opacity-50 bg-red-950/10' : ''}`}>
                      <td className="px-6 py-4">
                        <div className="font-semibold text-white flex items-center gap-2">
                          {u.display_name || u.username || u.email}
                          {u.role === 'admin' && (
                            <span className="px-2 py-0.5 rounded-full bg-blue-500/20 border border-blue-500/40 text-blue-300 text-[10px] font-bold">
                              管理者
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400 font-mono">
                          {u.email?.includes('@baseball-analyzer.internal') ? u.email.replace('@baseball-analyzer.internal', '') : u.email}
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={teamInputs[u.id || u.email] ?? (u.team_id || '')}
                            onChange={e => setTeamInputs({ ...teamInputs, [u.id || u.email]: e.target.value })}
                            onBlur={() => updateTeam(u.id, u.email, teamInputs[u.id || u.email])}
                            className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white w-28 focus:ring-1 focus:ring-blue-500 outline-none"
                          />
                        </div>
                      </td>

                      <td className="px-6 py-4 text-xs">
                        <span className="text-slate-400 capitalize">{u.role || 'user'}</span>
                      </td>

                      {/* Analysis Modules Permissions */}
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => toggleModulePermission(u, 'hitting')}
                            className={`px-2 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer flex items-center gap-1 ${
                              perms.hitting
                                ? 'bg-blue-600/20 border-blue-500/40 text-blue-300 hover:bg-blue-600/30'
                                : 'bg-slate-800 border-slate-700 text-slate-500 hover:bg-slate-700'
                            }`}
                            title="打撃分析の表示切り替え"
                          >
                            <Target className="w-3 h-3" />
                            打撃
                          </button>

                          <button
                            onClick={() => toggleModulePermission(u, 'pitching')}
                            className={`px-2 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer flex items-center gap-1 ${
                              perms.pitching
                                ? 'bg-purple-600/20 border-purple-500/40 text-purple-300 hover:bg-purple-600/30'
                                : 'bg-slate-800 border-slate-700 text-slate-500 hover:bg-slate-700'
                            }`}
                            title="投手分析の表示切り替え"
                          >
                            投手
                          </button>

                          <button
                            onClick={() => toggleModulePermission(u, 'bodyComp')}
                            className={`px-2 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer flex items-center gap-1 ${
                              perms.bodyComp
                                ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300 hover:bg-emerald-600/30'
                                : 'bg-slate-800 border-slate-700 text-slate-500 hover:bg-slate-700'
                            }`}
                            title="体組成分析の表示切り替え"
                          >
                            <Dumbbell className="w-3 h-3" />
                            体組成
                          </button>
                        </div>
                      </td>

                      <td className="px-6 py-4 text-center">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                          isCurrentDisabled
                            ? 'bg-red-500/20 border border-red-500/40 text-red-400'
                            : 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-400'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${isCurrentDisabled ? 'bg-red-400' : 'bg-emerald-400'}`} />
                          {isCurrentDisabled ? '停止中' : '稼働中'}
                        </span>
                      </td>

                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => issueTempPassword(u)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-400 hover:text-amber-300 transition cursor-pointer"
                            title="30分間有効の一時パスワードを発行"
                          >
                            <Key className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => toggleUserStatus(u)}
                            className={`p-1.5 rounded-lg border transition cursor-pointer ${
                              isCurrentDisabled
                                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/30'
                                : 'bg-amber-500/20 border-amber-500/40 text-amber-400 hover:bg-amber-500/30'
                            }`}
                            title={isCurrentDisabled ? 'アカウントを再開' : 'アカウントを一時停止'}
                          >
                            {isCurrentDisabled ? <PlayCircle className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
                          </button>

                          <button
                            onClick={() => deleteUser(u.id, u.email)}
                            className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 transition cursor-pointer"
                            title="アカウントを完全に削除"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Temp Password Issued Modal */}
      {tempModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="w-full max-w-md bg-slate-800 border border-slate-700 rounded-3xl p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-400">
                <Clock className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">一時パスワードを発行しました</h3>
                <p className="text-xs text-slate-400">有効期限: 発行から30分間</p>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-700/80 rounded-2xl p-4 mb-4">
              <div className="text-xs text-slate-400 mb-1">対象アカウント</div>
              <div className="text-sm font-semibold text-white mb-3">{tempModal.name} ({tempModal.email})</div>

              <div className="text-xs text-slate-400 mb-1">発行された一時パスワード</div>
              <div className="flex items-center justify-between bg-slate-950 px-3.5 py-2.5 rounded-xl border border-slate-800">
                <span className="font-mono text-lg font-bold text-amber-400 tracking-wider">
                  {tempModal.pass}
                </span>
                <button
                  onClick={() => handleCopy(tempModal.pass)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 transition cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'コピー完了' : 'コピー'}
                </button>
              </div>
            </div>

            <div className="text-xs text-slate-400 mb-6 leading-relaxed">
              利用者にこのパスワードを伝えてください。初回ログイン時に、本人による新しいパスワードへの更新画面が表示されます。
            </div>

            <button
              onClick={() => setTempModal(null)}
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm transition cursor-pointer"
            >
              閉じる
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminPanel;
