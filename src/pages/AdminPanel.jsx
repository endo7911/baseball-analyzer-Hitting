import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { getGlobalUsers, saveGlobalUsers, hashPassword } from '../lib/userSync';
import { Users, Plus, Trash2, Shield, RefreshCw, CheckCircle2, XCircle, Ban, PlayCircle, Key, Clock, Copy, Check, Target, Dumbbell } from 'lucide-react';

function AdminPanel() {
  const [users, setUsers] = useState([]);
  const [teamInputs, setTeamInputs] = useState({});
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', password: '', team_id: '', role: 'user', display_name: '' });
  const [message, setMessage] = useState(null);
  const [tempModal, setTempModal] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => { 
    fetchUsers(); 
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const globalUsers = await getGlobalUsers();
      setUsers(globalUsers);
      const initialInputs = {};
      globalUsers.forEach(u => {
        initialInputs[u.id || u.email] = u.team_id || '';
      });
      setTeamInputs(initialInputs);
    } catch (e) {
      console.error("Fetch users error:", e);
    } finally {
      setLoading(false);
    }
  };

  const addUser = async (e) => {
    e.preventDefault();
    if (!newUser.email || !newUser.password) return;
    setLoading(true);
    
    try {
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
      const currentUsers = await getGlobalUsers();
      const tempPass = 'tp' + Math.floor(100000 + Math.random() * 900000);
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      const hashedTemp = await hashPassword(tempPass);

      const updatedUsers = currentUsers.map(u => {
        if (u.id === user.id || u.email.toLowerCase() === user.email.toLowerCase()) {
          return {
            ...u,
            temp_password: {
              pass_plain: tempPass,
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
    try {
      const currentUsers = await getGlobalUsers();
      const updatedUsers = currentUsers.map(u => {
        if (u.id === user.id || u.email.toLowerCase() === user.email.toLowerCase()) {
          const curPerms = u.permissions || {
            hitting: u.allow_hitting !== false,
            pitching: u.allow_pitching !== false,
            bodyComp: u.allow_body_comp !== false
          };
          const newPerms = {
            ...curPerms,
            [moduleKey]: !curPerms[moduleKey]
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

      const savedProfile = sessionStorage.getItem('mockProfile') || localStorage.getItem('mockProfile');
      if (savedProfile) {
        try {
          const p = JSON.parse(savedProfile);
          if (p.email?.toLowerCase() === user.email.toLowerCase()) {
            const updated = updatedUsers.find(u => u.email.toLowerCase() === user.email.toLowerCase());
            if (updated) {
              sessionStorage.setItem('mockProfile', JSON.stringify({ ...p, ...updated }));
            }
          }
        } catch (err) {}
      }
    } catch (e) {
      console.error("Toggle module permission error:", e);
    }
  };

  const deleteUser = async (userId, email) => {
    if (!confirm(`「${email}」のアカウントを削除しますか？`)) return;
    
    setLoading(true);

    try {
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

  const existingTeams = [...new Set(users.map(u => u.team_id).filter(Boolean))];

  return (
    <div className="animate-in fade-in duration-300">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-extrabold text-white mb-2 flex items-center gap-3">
            <Shield className="w-8 h-8 text-purple-400" />
            管理者パネル
          </h2>
          <p className="text-slate-400 text-sm">ユーザーの追加・停止・一時パスワード発行・チーム割り当てを管理します。</p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white font-bold px-5 py-2.5 rounded-xl transition-all cursor-pointer shadow-lg"
        >
          <Plus className="w-4 h-4" />
          ユーザー追加
        </button>
      </header>

      {message && (
        <div className={`mb-6 flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-bold ${
          message.type === 'success' ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border border-red-500/30 text-red-400'
        }`}>
          {message.type === 'success' ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <XCircle className="w-4 h-4 flex-shrink-0" />}
          {message.text}
        </div>
      )}

      {/* Temp Password Modal */}
      {tempModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border-2 border-purple-500/40 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-lg font-extrabold text-white flex items-center gap-2">
                <Key className="w-5 h-5 text-purple-400" />
                一時パスワード発行完了
              </h3>
              <button onClick={() => setTempModal(null)} className="text-slate-400 hover:text-white p-1 text-sm font-bold">
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-slate-300">
                対象アカウント: <strong className="text-white font-mono">{tempModal.name} ({tempModal.email})</strong>
              </p>

              <div className="bg-slate-950 p-4 rounded-2xl border border-purple-500/30 text-center space-y-2">
                <p className="text-[11px] text-purple-400 font-bold uppercase tracking-widest">発行された一時パスワード</p>
                <div className="text-3xl font-black font-mono text-cyan-300 tracking-wider flex items-center justify-center gap-3">
                  <span>{tempModal.pass}</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(tempModal.pass);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="p-2 bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 border border-purple-500/40 rounded-xl transition-all text-xs flex items-center gap-1 cursor-pointer"
                    title="パスワードをコピー"
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    <span>{copied ? 'コピー完了' : 'コピー'}</span>
                  </button>
                </div>
              </div>

              <div className="bg-amber-950/40 border border-amber-500/30 p-3 rounded-xl flex items-center gap-2 text-amber-300 text-xs font-medium">
                <Clock className="w-4 h-4 flex-shrink-0" />
                <span>有効期限: <strong>30分間</strong> ({new Date(tempModal.expiresAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })} まで有効)</span>
              </div>

              <p className="text-[11px] text-slate-400">
                ※ ユーザーに上記パスワードを連絡してください。30分経過すると自動的に失効し、ログインできなくなります。
              </p>
            </div>

            <button
              onClick={() => setTempModal(null)}
              className="w-full bg-purple-600 hover:bg-purple-500 text-white font-extrabold py-3 rounded-xl transition-all shadow-lg text-sm cursor-pointer mt-2"
            >
              閉じる
            </button>
          </div>
        </div>
      )}

      {/* Add User Form */}
      {showAdd && (
        <div className="bg-slate-800/80 border border-purple-500/30 rounded-2xl p-6 mb-8 shadow-xl">
          <h3 className="font-bold text-white mb-4 flex items-center gap-2">
            <Plus className="w-5 h-5 text-purple-400" />
            新規ユーザー（アカウント）追加
          </h3>
          <form onSubmit={addUser} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">表示名 *</label>
              <input 
                required
                value={newUser.display_name} 
                onChange={e => setNewUser({...newUser, display_name: e.target.value})}
                placeholder="例：山田 太郎 / チームA" 
                className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-purple-500" 
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">メールアドレス（ログインID）*</label>
              <input 
                type="email" 
                required 
                value={newUser.email} 
                onChange={e => setNewUser({...newUser, email: e.target.value})}
                placeholder="player@example.com" 
                className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-purple-500" 
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">パスワード *</label>
              <input 
                type="password" 
                required 
                value={newUser.password} 
                onChange={e => setNewUser({...newUser, password: e.target.value})}
                placeholder="6文字以上" 
                className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-purple-500" 
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">所属チーム (入力または選択)</label>
              <input 
                list="team-list"
                value={newUser.team_id} 
                onChange={e => setNewUser({...newUser, team_id: e.target.value})}
                placeholder="Team A"
                className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-purple-500" 
              />
              <datalist id="team-list">
                {existingTeams.map(t => <option key={t} value={t} />)}
              </datalist>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">権限種別</label>
              <select 
                value={newUser.role} 
                onChange={e => setNewUser({...newUser, role: e.target.value})}
                className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="user">一般利用者 (チームユーザー)</option>
                <option value="admin">管理者 (全権限)</option>
              </select>
            </div>
            <div className="flex items-end gap-3">
              <button 
                type="submit" 
                disabled={loading} 
                className="flex-1 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold py-2 rounded-lg transition-all cursor-pointer"
              >
                {loading ? '追加中...' : 'アカウント作成'}
              </button>
              <button 
                type="button" 
                onClick={() => setShowAdd(false)} 
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-bold py-2 rounded-lg transition-all cursor-pointer"
              >
                キャンセル
              </button>
            </div>
          </form>
        </div>
      )}

      {/* User List */}
      <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden shadow-2xl">
        <div className="p-4 bg-slate-900 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-400" />
            <h3 className="font-bold text-white">登録アカウント一覧 ({users.length}件)</h3>
          </div>
          <button onClick={fetchUsers} className="text-slate-400 hover:text-white transition-colors p-1" title="更新">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <div className="divide-y divide-slate-700">
          {users.map(user => {
            const isDisabled = !!user.is_disabled;
            const isTempActive = user.temp_password && user.temp_password.expires_at && (new Date(user.temp_password.expires_at).getTime() > Date.now());
            const tempExpiryFormatted = isTempActive ? new Date(user.temp_password.expires_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : '';

            return (
              <div key={user.id || user.email} className={`flex flex-col lg:flex-row lg:items-center justify-between gap-4 px-6 py-4 transition-colors ${
                isDisabled ? 'bg-red-950/20 opacity-70' : 'hover:bg-slate-700/30'
              }`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-white truncate">{user.display_name || user.email}</p>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                      user.role === 'admin' ? 'bg-purple-600/30 text-purple-400 border border-purple-500/30' : 'bg-slate-700 text-slate-300'
                    }`}>
                      {user.role === 'admin' ? '管理者' : '一般ユーザー'}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      isDisabled ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    }`}>
                      {isDisabled ? '停止中' : 'アクティブ'}
                    </span>
                    {isTempActive && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 flex items-center gap-1">
                        <Key className="w-3 h-3 text-cyan-400" />
                        一時パス有効 (~{tempExpiryFormatted})
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 truncate mt-0.5">{user.email}</p>
                </div>

                <div className="flex items-center gap-2.5 flex-wrap">
                  <div className="relative">
                    <input
                      list="team-list"
                      value={teamInputs[user.id || user.email] ?? (user.team_id || '')}
                      onChange={e => setTeamInputs({ ...teamInputs, [user.id || user.email]: e.target.value })}
                      onBlur={e => updateTeam(user.id, user.email, e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.target.blur();
                        }
                      }}
                      placeholder="チーム未割当"
                      className="bg-slate-900 border border-slate-700 text-white text-xs rounded-lg px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-purple-500 w-28 transition-all"
                    />
                  </div>

                  {/* Page Display Permission Toggles (Hitting, Pitching, Body Comp) */}
                  <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-700/70">
                    {/* Hitting */}
                    <button
                      type="button"
                      onClick={() => toggleModulePermission(user, 'hitting')}
                      className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer border ${
                        user.allow_hitting !== false && user.permissions?.hitting !== false
                          ? 'bg-blue-600/25 text-blue-300 border-blue-500/40 hover:bg-blue-600/40'
                          : 'bg-slate-800 text-slate-500 border-slate-700/60 hover:text-slate-400 opacity-60'
                      }`}
                      title="「打撃分析」ページの表示/非表示を切り替え"
                    >
                      <Users className="w-3 h-3 text-blue-400" />
                      <span>打撃</span>
                      <span className={`text-[9px] px-1 rounded font-black ${
                        user.allow_hitting !== false && user.permissions?.hitting !== false ? 'bg-blue-500/30 text-blue-200' : 'bg-slate-700 text-slate-400'
                      }`}>
                        {user.allow_hitting !== false && user.permissions?.hitting !== false ? 'ON' : 'OFF'}
                      </span>
                    </button>

                    {/* Pitching */}
                    <button
                      type="button"
                      onClick={() => toggleModulePermission(user, 'pitching')}
                      className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer border ${
                        user.allow_pitching !== false && user.permissions?.pitching !== false
                          ? 'bg-amber-600/25 text-amber-300 border-amber-500/40 hover:bg-amber-600/40'
                          : 'bg-slate-800 text-slate-500 border-slate-700/60 hover:text-slate-400 opacity-60'
                      }`}
                      title="「投手分析」ページの表示/非表示を切り替え"
                    >
                      <Target className="w-3 h-3 text-amber-400" />
                      <span>投手</span>
                      <span className={`text-[9px] px-1 rounded font-black ${
                        user.allow_pitching !== false && user.permissions?.pitching !== false ? 'bg-amber-500/30 text-amber-200' : 'bg-slate-700 text-slate-400'
                      }`}>
                        {user.allow_pitching !== false && user.permissions?.pitching !== false ? 'ON' : 'OFF'}
                      </span>
                    </button>

                    {/* Body Comp */}
                    <button
                      type="button"
                      onClick={() => toggleModulePermission(user, 'bodyComp')}
                      className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer border ${
                        user.allow_body_comp !== false && user.permissions?.bodyComp !== false
                          ? 'bg-cyan-600/25 text-cyan-300 border-cyan-500/40 hover:bg-cyan-600/40'
                          : 'bg-slate-800 text-slate-500 border-slate-700/60 hover:text-slate-400 opacity-60'
                      }`}
                      title="「体組成分析」ページの表示/非表示を切り替え"
                    >
                      <Dumbbell className="w-3 h-3 text-cyan-400" />
                      <span>体組成</span>
                      <span className={`text-[9px] px-1 rounded font-black ${
                        user.allow_body_comp !== false && user.permissions?.bodyComp !== false ? 'bg-cyan-500/30 text-cyan-200' : 'bg-slate-700 text-slate-400'
                      }`}>
                        {user.allow_body_comp !== false && user.permissions?.bodyComp !== false ? 'ON' : 'OFF'}
                      </span>
                    </button>
                  </div>

                  {/* Issue Temporary Password Button */}
                  <button
                    onClick={() => issueTempPassword(user)}
                    disabled={loading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-cyan-950/60 hover:bg-cyan-900/80 text-cyan-300 border border-cyan-500/40 transition-all cursor-pointer whitespace-nowrap"
                    title="30分間有効の一時パスワードを発行"
                  >
                    <Key className="w-3.5 h-3.5 text-cyan-400" />
                    <span>{isTempActive ? '一時パス再発行' : '一時パス発行 (30分)'}</span>
                  </button>

                  {/* Toggle Disable Status Button */}
                  <button
                    onClick={() => toggleUserStatus(user)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border cursor-pointer whitespace-nowrap ${
                      isDisabled
                        ? 'bg-emerald-600/20 text-emerald-400 border-emerald-500/40 hover:bg-emerald-600/30'
                        : 'bg-amber-600/20 text-amber-400 border-amber-500/40 hover:bg-amber-600/30'
                    }`}
                    title={isDisabled ? "アカウントを再開" : "アカウントを停止"}
                  >
                    {isDisabled ? (
                      <>
                        <PlayCircle className="w-3.5 h-3.5" />
                        <span>再開</span>
                      </>
                    ) : (
                      <>
                        <Ban className="w-3.5 h-3.5" />
                        <span>停止</span>
                      </>
                    )}
                  </button>

                  <button 
                    onClick={() => deleteUser(user.id, user.email)}
                    className="text-slate-500 hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-red-500/10 border border-transparent hover:border-red-500/30 cursor-pointer"
                    title="削除"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}

          {users.length === 0 && !loading && (
            <div className="px-6 py-12 text-center text-slate-500">
              登録されているアカウントはありません
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AdminPanel;
