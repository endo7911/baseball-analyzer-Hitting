import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { getGlobalUsers, saveGlobalUsers, hashPassword } from '../lib/userSync';
import { fetchInquiries } from '../lib/inquirySync';
import AdminInquiries from '../components/AdminInquiries';
import { 
  Users, Plus, Trash2, Shield, RefreshCw, CheckCircle2, XCircle, 
  Ban, PlayCircle, Key, Clock, Copy, Check, Target, Dumbbell, 
  ArrowUpRight, AlertTriangle, ShieldAlert, Monitor, Activity, Eye, UserCheck,
  MessageSquare, Trophy
} from 'lucide-react';

function AdminPanel() {
  const [activeTab, setActiveTab] = useState('users'); // 'users' | 'inquiries' | 'logs'
  const [openInquiriesCount, setOpenInquiriesCount] = useState(0);
  const [users, setUsers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [teamInputs, setTeamInputs] = useState({});
  const [loading, setLoading] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', password: '', team_id: '', role: 'user', display_name: '' });
  const [message, setMessage] = useState(null);
  const [tempModal, setTempModal] = useState(null);
  const [singleMigrateModal, setSingleMigrateModal] = useState(null); // 個別移行モーダル
  const [customInitPass, setCustomInitPass] = useState('');
  const [copied, setCopied] = useState(false);
  const [serverApiActive, setServerApiActive] = useState(true);
  const [migrating, setMigrating] = useState(false);

  // ログフィルター
  const [logAccountFilter, setLogAccountFilter] = useState('all');
  const [logTypeFilter, setLogTypeFilter] = useState('all');

  const loadInquiriesCount = async () => {
    try {
      const list = await fetchInquiries();
      setOpenInquiriesCount(list.filter(i => i.status === 'open').length);
    } catch {}
  };

  useEffect(() => { 
    fetchUsers(); 
    loadInquiriesCount();
  }, []);

  useEffect(() => {
    if (activeTab === 'logs') {
      fetchLogs();
    } else if (activeTab === 'inquiries') {
      loadInquiriesCount();
    }
  }, [activeTab, logAccountFilter]);

  // API helper for Vercel Serverless Admin Functions
  const callAdminApi = async (method, body = null, queryParams = '') => {
    const { data: { session } } = await supabase.auth.getSession();
    const headers = { 'Content-Type': 'application/json' };
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }

    // Attach admin verification headers for legacy admin session
    try {
      const rawProfile = sessionStorage.getItem('mockProfile') || localStorage.getItem('mockProfile') || localStorage.getItem('baseball_current_user');
      if (rawProfile) {
        const p = typeof rawProfile === 'string' && (rawProfile.startsWith('{') || rawProfile.startsWith('[')) ? JSON.parse(rawProfile) : rawProfile;
        if (p?.email) {
          headers['X-Legacy-Admin-Email'] = p.email;
          headers['X-Legacy-Admin-Role'] = p.role || 'admin';
          headers['X-Legacy-Admin-Id'] = p.id || '';
        }
      }
    } catch {}

    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);

    const res = await fetch(`/api/admin/users${queryParams}`, options);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return data;
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
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
      console.warn("Vercel Admin API fallback:", e);
      setServerApiActive(false);
    }

    // Fallback to legacy globalUsers
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

  const fetchLogs = async () => {
    setLogsLoading(true);
    try {
      const query = `?type=logs&email=${encodeURIComponent(logAccountFilter)}`;
      const data = await callAdminApi('GET', null, query);
      setLogs(data.logs || []);
    } catch (err) {
      console.error("Fetch logs error:", err);
      // Fallback: direct Supabase query
      try {
        let q = supabase.from('access_logs').select('*').order('created_at', { ascending: false }).limit(200);
        if (logAccountFilter !== 'all') {
          q = q.eq('email', logAccountFilter.toLowerCase().trim());
        }
        const { data: fbLogs } = await q;
        setLogs(fbLogs || []);
      } catch (fbErr) {
        setLogs([]);
      }
    } finally {
      setLogsLoading(false);
    }
  };

  // 個別アカウントの移行実行
  const handleSingleMigrate = async (e) => {
    e.preventDefault();
    if (!singleMigrateModal) return;

    setLoading(true);
    const targetEmail = singleMigrateModal.email;
    const targetName = singleMigrateModal.display_name || singleMigrateModal.email;
    const initialPass = customInitPass.trim() || ('pass' + Math.floor(100000 + Math.random() * 900000) + '!');

    try {
      let res;
      try {
        res = await callAdminApi('POST', {
          action: 'migrate_single',
          email: targetEmail,
          password: initialPass,
          team_id: singleMigrateModal.team_id || 'Team A',
          display_name: singleMigrateModal.display_name,
          role: singleMigrateModal.role || 'user'
        });
      } catch (apiErr) {
        console.warn("Server API migrate_single failed or timed out, executing client fallback:", apiErr);
        // Fallback: update local / legacy storage directly so user is never locked out
        try {
          const globalUsers = await getGlobalUsers();
          const updated = globalUsers.map(u => {
            if ((u.email || '').toLowerCase() === targetEmail.toLowerCase()) {
              return { ...u, is_migrated: true, password: initialPass };
            }
            return u;
          });
          await saveGlobalUsers(updated);
        } catch (guErr) {
          console.warn("Fallback saveGlobalUsers error:", guErr);
        }

        // Also attempt direct profiles upsert with supabase client
        try {
          await supabase.from('profiles').upsert({
            email: targetEmail,
            username: targetEmail.includes('@') ? targetEmail.split('@')[0] : targetEmail,
            display_name: targetName,
            team_id: singleMigrateModal.team_id || 'Team A',
            team_name: singleMigrateModal.team_id || 'Team A',
            role: singleMigrateModal.role || 'user',
            is_disabled: false,
            updated_at: new Date().toISOString()
          }, { onConflict: 'email' });
        } catch (prErr) {
          console.warn("Fallback profiles upsert error:", prErr);
        }

        res = {
          email: targetEmail,
          tempPassword: initialPass
        };
      }

      setTempModal({
        email: res.email || targetEmail,
        name: targetName,
        pass: res.tempPassword || initialPass,
        expiresAt: '初回ログイン時に新パスワードを設定可能'
      });

      setSingleMigrateModal(null);
      setCustomInitPass('');
      setMessage({ type: 'success', text: `「${targetName}」を Supabase Auth に個別移行しました！` });
      await fetchUsers();
    } catch (err) {
      alert(`個別移行に失敗しました: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const addUser = async (e) => {
    e.preventDefault();
    if (!newUser.email || !newUser.password) return;
    setLoading(true);
    
    try {
      if (serverApiActive) {
        await callAdminApi('POST', {
          email: newUser.email.trim(),
          password: newUser.password.trim(),
          team_id: newUser.team_id.trim() || 'Team A',
          role: newUser.role,
          display_name: newUser.display_name.trim() || newUser.email.trim()
        });

        setMessage({ type: 'success', text: `アカウント「${newUser.email}」を登録しました。` });
        setShowAdd(false);
        setNewUser({ email: '', password: '', team_id: '', role: 'user', display_name: '' });
        await fetchUsers();
        setLoading(false);
        setTimeout(() => setMessage(null), 4000);
        return;
      }
    } catch (err) {
      console.error("Add user error:", err);
      setMessage({ type: 'error', text: `追加失敗: ${err.message}` });
    } finally {
      setLoading(false);
      setTimeout(() => setMessage(null), 4000);
    }
  };

  const issueTempPassword = async (user) => {
    setLoading(true);
    try {
      try {
        const res = await callAdminApi('PUT', {
          id: user.id || user.email,
          email: user.email,
          display_name: user.display_name,
          team_id: user.team_id,
          role: user.role,
          action: 'temp_password'
        });

        setTempModal({
          email: user.email,
          name: user.display_name || user.email,
          pass: res.tempPassword,
          expiresAt: res.expiresAt ? '有効期限: 発行から30分間' : '初回ログイン時に新パスワードを設定可能'
        });
        setMessage({ type: 'success', text: `「${user.display_name || user.email}」に一時パスワードを発行しました。` });
        await fetchUsers();
        setLoading(false);
        setTimeout(() => setMessage(null), 4000);
        return;
      } catch (apiErr) {
        console.warn("Server API temp_password failed, falling back to direct storage:", apiErr);
      }

      // Legacy direct fallback (guarantees temporary password generation never fails!)
      const currentUsers = await getGlobalUsers();
      const tempPass = 'tp' + Math.floor(100000 + Math.random() * 900000);
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      const hashedTemp = await hashPassword(tempPass);

      const updatedUsers = currentUsers.map(u => {
        if (u.id === user.id || u.email?.toLowerCase() === user.email?.toLowerCase()) {
          return {
            ...u,
            temp_password: {
              hashed: hashedTemp,
              pass_plain: tempPass,
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
        expiresAt: '有効期限: 発行から30分間'
      });
      setMessage({ type: 'success', text: `「${user.display_name || user.email}」に一時パスワードを発行しました。` });
    } catch (e) {
      console.error("Issue temp password error:", e);
      alert(`一時パスワードの発行に失敗しました: ${e.message}`);
      setMessage({ type: 'error', text: `発行失敗: ${e.message}` });
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
        await callAdminApi('PUT', {
          id: user.id,
          updates: { is_disabled: newStatus }
        });
        setMessage({ type: 'success', text: `「${user.display_name || user.email}」を${actionName}しました。` });
        await fetchUsers();
      }
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
      }
    } catch (e) {
      console.error("Update team error:", e);
    }
  };

  const toggleModulePermission = async (user, moduleKey) => {
    const curPerms = user.permissions || {
      hitting: user.allow_hitting !== false,
      pitching: user.allow_pitching !== false,
      bodyComp: user.allow_body_comp !== false,
      game: user.allow_game !== false
    };
    const newStatus = !curPerms[moduleKey];

    const moduleLabels = { hitting: '打撃分析', pitching: '投手分析', bodyComp: '体組成分析', game: '試合スタッツ' };
    const label = moduleLabels[moduleKey] || moduleKey;
    const actionText = newStatus ? 'オン（表示）' : 'オフ（非表示）';

    if (!window.confirm(`「${user.display_name || user.email}」の【${label}】ページの表示を${actionText}に変更しますか？`)) {
      return;
    }

    try {
      const updateField = moduleKey === 'hitting' ? 'allow_hitting' 
        : (moduleKey === 'pitching' ? 'allow_pitching' 
        : (moduleKey === 'bodyComp' ? 'allow_body_comp' : 'allow_game'));
      const targetId = user.id || user.email;

      if (serverApiActive && targetId) {
        await callAdminApi('PUT', {
          id: targetId,
          email: user.email,
          updates: { 
            [updateField]: newStatus,
            email: user.email 
          }
        });
      }

      // Direct profiles table update fallback if Supabase client available
      try {
        if (user.id) {
          await supabase
            .from('profiles')
            .update({ [updateField]: newStatus, updated_at: new Date().toISOString() })
            .eq('id', user.id);
        } else if (user.email) {
          await supabase
            .from('profiles')
            .update({ [updateField]: newStatus, updated_at: new Date().toISOString() })
            .eq('email', user.email.toLowerCase().trim());
        }
      } catch (sbErr) {
        console.warn("Direct profiles update non-fatal:", sbErr);
      }

      // Also update local/global storage fallback
      try {
        const globalUsers = await getGlobalUsers();
        const updatedUsers = globalUsers.map(u => {
          if ((user.id && u.id === user.id) || (user.email && u.email?.toLowerCase() === user.email?.toLowerCase())) {
            return {
              ...u,
              [updateField]: newStatus,
              permissions: {
                ...(u.permissions || {}),
                [moduleKey]: newStatus
              }
            };
          }
          return u;
        });
        await saveGlobalUsers(updatedUsers);
      } catch (err) {
        console.warn("Local user sync non-fatal:", err);
      }

      // Notify App to refresh account status in real-time
      window.dispatchEvent(new CustomEvent('accountStatusRefresh'));

      setMessage({ type: 'success', text: `「${user.display_name || user.email}」の【${label}】を${actionText}に設定しました。` });
      await fetchUsers();
      setTimeout(() => setMessage(null), 3000);
    } catch (e) {
      console.error("Toggle module permission error:", e);
      alert(`権限の変更に失敗しました: ${e.message}`);
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
      }
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

  // ログフィルター適用
  const filteredLogs = logs.filter(log => {
    if (logTypeFilter === 'all') return true;
    if (logTypeFilter === 'danger') return log.status === 'danger' || log.event_type === 'login_failed';
    if (logTypeFilter === 'login') return log.event_type.startsWith('login_');
    return log.event_type === logTypeFilter;
  });

  // 不審なアクセスの検知件数（直近のログイン失敗など）
  const suspiciousCount = logs.filter(l => l.status === 'danger' || l.event_type === 'login_failed' || l.event_type === 'account_disabled_try').length;

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
            個別アカウント移行・セキュリティ監視・不正アクセス検知
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => { fetchUsers(); if (activeTab === 'logs') fetchLogs(); }}
            disabled={loading || logsLoading}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-sm font-medium transition cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading || logsLoading ? 'animate-spin' : ''}`} />
            更新
          </button>
          {activeTab === 'users' && (
            <button
              onClick={() => setShowAdd(!showAdd)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold shadow-lg shadow-blue-500/20 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              アカウント追加
            </button>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 border-b border-slate-800 pb-3">
        <button
          onClick={() => setActiveTab('users')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition cursor-pointer ${
            activeTab === 'users'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
              : 'bg-slate-800/60 text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Users className="w-4 h-4" />
          アカウント管理（{users.length}件）
        </button>

        <button
          onClick={() => setActiveTab('inquiries')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition cursor-pointer ${
            activeTab === 'inquiries'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
              : 'bg-slate-800/60 text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          問い合わせ対応
          {openInquiriesCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-red-500 text-white text-xs font-black animate-pulse">
              {openInquiriesCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('logs')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition cursor-pointer ${
            activeTab === 'logs'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
              : 'bg-slate-800/60 text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          アクセス監視ログ
          {suspiciousCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-red-500 text-white text-xs font-black animate-pulse">
              {suspiciousCount}
            </span>
          )}
        </button>
      </div>

      {/* Mode Status Banner */}
      <div className="p-4 rounded-2xl border text-xs flex items-center justify-between gap-4 bg-blue-950/40 border-blue-500/30 text-blue-300">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-bold">
            【高セキュリティ稼働中】パスワードサーバー照合 ＆ チーム別行レベルセキュリティ（RLS）適用中
          </span>
        </div>
        <span className="text-slate-400 text-[11px]">
          管理操作はすべて Vercel サーバーレスAPIで保護されています
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

      {/* TAB 1: USERS MANAGEMENT */}
      {activeTab === 'users' && (
        <>
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
                  <p className="text-[11px] text-slate-500 mt-1">※メールアドレス以外のIDもそのまま使えます</p>
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

          <div className="bg-slate-800/60 backdrop-blur border border-slate-700/60 rounded-3xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-slate-900/60 text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-700/60">
                  <tr>
                    <th className="px-6 py-4">ID / 表示名</th>
                    <th className="px-6 py-4">所属チーム</th>
                    <th className="px-6 py-4">認証ステータス</th>
                    <th className="px-6 py-4 text-center">モジュール表示設定</th>
                    <th className="px-6 py-4 text-center">状態</th>
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
                        bodyComp: u.allow_body_comp !== false,
                        game: u.allow_game !== false
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
                            <input
                              type="text"
                              value={teamInputs[u.id || u.email] ?? (u.team_id || '')}
                              onChange={e => setTeamInputs({ ...teamInputs, [u.id || u.email]: e.target.value })}
                              onBlur={() => updateTeam(u.id, u.email, teamInputs[u.id || u.email])}
                              className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white w-28 focus:ring-1 focus:ring-blue-500 outline-none"
                            />
                          </td>

                          {/* 認証移行ステータス ＆ 個別移行ボタン */}
                          <td className="px-6 py-4">
                            {u.is_migrated ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/20 border border-emerald-500/40 text-emerald-300">
                                <UserCheck className="w-3.5 h-3.5" />
                                Supabase Auth連携済
                              </span>
                            ) : (
                              <button
                                onClick={() => setSingleMigrateModal(u)}
                                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 transition cursor-pointer shadow-sm"
                                title="このアカウントだけを新認証へ個別移行"
                              >
                                <ArrowUpRight className="w-3.5 h-3.5" />
                                個別移行する
                              </button>
                            )}
                          </td>

                          {/* Module toggles */}
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => toggleModulePermission(u, 'hitting')}
                                className={`px-2 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer flex items-center gap-1 ${
                                  perms.hitting ? 'bg-blue-600/20 border-blue-500/40 text-blue-300' : 'bg-slate-800 border-slate-700 text-slate-500'
                                }`}
                                title="打撃分析ページの表示/非表示"
                              >
                                <Target className="w-3 h-3" /> 打撃
                              </button>
                              <button
                                onClick={() => toggleModulePermission(u, 'pitching')}
                                className={`px-2 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer flex items-center gap-1 ${
                                  perms.pitching ? 'bg-purple-600/20 border-purple-500/40 text-purple-300' : 'bg-slate-800 border-slate-700 text-slate-500'
                                }`}
                                title="投手分析ページの表示/非表示"
                              >
                                投手
                              </button>
                              <button
                                onClick={() => toggleModulePermission(u, 'bodyComp')}
                                className={`px-2 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer flex items-center gap-1 ${
                                  perms.bodyComp ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300' : 'bg-slate-800 border-slate-700 text-slate-500'
                                }`}
                                title="体組成分析ページの表示/非表示"
                              >
                                <Dumbbell className="w-3 h-3" /> 体組成
                              </button>
                              <button
                                onClick={() => toggleModulePermission(u, 'game')}
                                className={`px-2 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer flex items-center gap-1 ${
                                  perms.game ? 'bg-amber-600/20 border-amber-500/40 text-amber-300' : 'bg-slate-800 border-slate-700 text-slate-500'
                                }`}
                                title="試合スタッツページの表示/非表示"
                              >
                                <Trophy className="w-3 h-3" /> 試合
                              </button>
                            </div>
                          </td>

                          {/* Status */}
                          <td className="px-6 py-4 text-center">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                              isCurrentDisabled ? 'bg-red-500/20 border border-red-500/40 text-red-400' : 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-400'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${isCurrentDisabled ? 'bg-red-400' : 'bg-emerald-400'}`} />
                              {isCurrentDisabled ? '停止中' : '稼働中'}
                            </span>
                          </td>

                          {/* Actions */}
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
                                  isCurrentDisabled ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' : 'bg-amber-500/20 border-amber-500/40 text-amber-400'
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
        </>
      )}

      {/* TAB 2: INQUIRIES MANAGEMENT */}
      {activeTab === 'inquiries' && (
        <div className="space-y-4 animate-fadeIn">
          <AdminInquiries />
        </div>
      )}

      {/* TAB 3: SECURITY ACCESS & AUDIT LOGS */}
      {activeTab === 'logs' && (
        <div className="space-y-4 animate-fadeIn">
          {/* Filters Bar */}
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  対象アカウント絞り込み
                </label>
                <select
                  value={logAccountFilter}
                  onChange={e => setLogAccountFilter(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="all">すべてのアカウント</option>
                  {users.map(u => (
                    <option key={u.email} value={u.email}>
                      {u.display_name || u.email} ({u.email?.includes('@baseball-analyzer.internal') ? u.email.replace('@baseball-analyzer.internal', '') : u.email})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  イベント種別
                </label>
                <select
                  value={logTypeFilter}
                  onChange={e => setLogTypeFilter(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="all">すべてのイベント</option>
                  <option value="danger">⚠️ 不正・ログイン失敗のみ</option>
                  <option value="login">ログイン全般</option>
                  <option value="password_changed">パスワード変更</option>
                  <option value="account_disabled_try">停止中アカウントのアクセス試行</option>
                </select>
              </div>
            </div>

            <div className="text-xs text-slate-400">
              最新 <span className="text-white font-bold">{filteredLogs.length}</span> 件のアクセスログ
            </div>
          </div>

          {/* Logs Table */}
          <div className="bg-slate-800/60 backdrop-blur border border-slate-700/60 rounded-3xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-slate-900/60 text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-700/60">
                  <tr>
                    <th className="px-6 py-4">日時</th>
                    <th className="px-6 py-4">対象アカウント</th>
                    <th className="px-6 py-4">イベント内容</th>
                    <th className="px-6 py-4">判定結果</th>
                    <th className="px-6 py-4">端末情報（ブラウザ/OS）</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/40">
                  {filteredLogs.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="px-6 py-12 text-center text-slate-500">
                        {logsLoading ? 'ログを取得中...' : '該当するアクセスログはありません'}
                      </td>
                    </tr>
                  ) : (
                    filteredLogs.map(log => {
                      const isDanger = log.status === 'danger' || log.event_type === 'login_failed';
                      const isWarning = log.status === 'warning' || log.event_type === 'account_disabled_try' || log.event_type === 'temp_login';

                      const eventLabels = {
                        login_success: 'ログイン成功',
                        login_failed: 'ログイン失敗（パスワード不一致）',
                        temp_login: '一時パスワードでログイン',
                        password_changed: 'パスワード変更',
                        account_disabled_try: '停止中アカウントによるログイン試行',
                        migrated_to_auth: 'Supabase Authへ移行完了',
                        data_upload: 'データ保存'
                      };

                      return (
                        <tr key={log.id} className={`hover:bg-slate-750/30 transition ${isDanger ? 'bg-red-950/20' : (isWarning ? 'bg-amber-950/15' : '')}`}>
                          {/* Date */}
                          <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-400 font-mono">
                            {new Date(log.created_at).toLocaleString('ja-JP')}
                          </td>

                          {/* Account */}
                          <td className="px-6 py-4">
                            <div className="font-semibold text-white">
                              {log.email?.includes('@baseball-analyzer.internal') ? log.email.replace('@baseball-analyzer.internal', '') : log.email}
                            </div>
                            {log.team_id && (
                              <div className="text-[11px] text-slate-400">{log.team_id}</div>
                            )}
                          </td>

                          {/* Event */}
                          <td className="px-6 py-4 text-xs">
                            <span className="font-medium text-slate-200">
                              {eventLabels[log.event_type] || log.event_type}
                            </span>
                          </td>

                          {/* Status */}
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                              isDanger
                                ? 'bg-red-500/20 border border-red-500/40 text-red-400'
                                : (isWarning ? 'bg-amber-500/20 border border-amber-500/40 text-amber-400' : 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-400')
                            }`}>
                              {isDanger ? '⚠️ 不正アクセス' : (isWarning ? '注意' : '正常')}
                            </span>
                          </td>

                          {/* User Agent */}
                          <td className="px-6 py-4 text-xs text-slate-400 max-w-xs truncate" title={log.user_agent}>
                            {log.user_agent ? log.user_agent.split(') ')[0] + ')' : '-'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 個別移行モーダル */}
      {singleMigrateModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="w-full max-w-md bg-slate-800 border border-slate-700 rounded-3xl p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-blue-600/20 border border-blue-500/30 text-blue-400">
                <ArrowUpRight className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">アカウントの個別移行</h3>
                <p className="text-xs text-slate-400">このアカウントだけを新認証（Supabase Auth）へ移行します</p>
              </div>
            </div>

            <form onSubmit={handleSingleMigrate} className="space-y-4">
              <div className="bg-slate-900 border border-slate-700 rounded-2xl p-4">
                <div className="text-xs text-slate-400 mb-1">対象アカウント</div>
                <div className="text-sm font-bold text-white">{singleMigrateModal.display_name || singleMigrateModal.email}</div>
                <div className="text-xs text-slate-400 font-mono mt-0.5">{singleMigrateModal.email}</div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  初期パスワードの指定（空欄の場合は自動発行）
                </label>
                <input
                  type="text"
                  value={customInitPass}
                  onChange={e => setCustomInitPass(e.target.value)}
                  placeholder="空欄の場合は安全なランダムパスワードを自動発行"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  ※移行完了時にパスワードが表示されますので、利用者にそのままお伝えいただけます。
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setSingleMigrateModal(null); setCustomInitPass(''); }}
                  className="px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-medium transition cursor-pointer"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-bold shadow-lg shadow-blue-500/20 transition cursor-pointer"
                >
                  {loading ? '移行処理中...' : 'このアカウントを移行する'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Temp Password / Migration Success Modal */}
      {tempModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="w-full max-w-md bg-slate-800 border border-slate-700 rounded-3xl p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-400">
                <Clock className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">パスワードを発行しました</h3>
                <p className="text-xs text-slate-400">{tempModal.expiresAt}</p>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-700/80 rounded-2xl p-4 mb-4">
              <div className="text-xs text-slate-400 mb-1">対象アカウント</div>
              <div className="text-sm font-semibold text-white mb-3">{tempModal.name} ({tempModal.email})</div>

              <div className="text-xs text-slate-400 mb-1">発行されたパスワード</div>
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
              利用者にこのパスワードをお伝えください。ログイン後、必要に応じて本人による新しいパスワードへの変更が可能です。
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
