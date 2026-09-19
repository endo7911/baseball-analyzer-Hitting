import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Users, Plus, Trash2, Shield, RefreshCw, CheckCircle2, XCircle, Ban, PlayCircle } from 'lucide-react';

function AdminPanel() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', password: '', team_id: '', role: 'user', display_name: '' });
  const [message, setMessage] = useState(null);

  useEffect(() => { 
    initDefaultUsers();
    fetchUsers(); 
  }, []);

  const initDefaultUsers = () => {
    let mockUsers = JSON.parse(localStorage.getItem('mockUsersList') || '[]');
    let modified = false;

    if (!mockUsers.some(u => u.email === 'admin@example.com')) {
      mockUsers.push({
        id: 'admin-id',
        email: 'admin@example.com',
        password: 'baseball2024',
        display_name: '管理者アカウント',
        role: 'admin',
        team_id: '管理者',
        is_disabled: false
      });
      modified = true;
    }

    if (!mockUsers.some(u => u.email === 'user@example.com')) {
      mockUsers.push({
        id: 'user-default-id',
        email: 'user@example.com',
        password: 'user123',
        display_name: '一般利用者',
        role: 'user',
        team_id: 'Team A',
        is_disabled: false
      });
      modified = true;
    }

    if (modified) {
      localStorage.setItem('mockUsersList', JSON.stringify(mockUsers));
    }
  };

  const fetchUsers = async () => {
    setLoading(true);
    let supabaseUsers = [];
    
    try {
      const { data, error } = await supabase.from('profiles').select('*').order('created_at');
      if (!error && data) {
        supabaseUsers = data;
      }
    } catch (e) {
      console.warn("Supabase profile fetch warning:", e);
    }

    // Merge with local mock users
    const mockUsers = JSON.parse(localStorage.getItem('mockUsersList') || '[]');
    
    // Merge list, prioritizing mockUsers if duplicate emails or combining
    const combined = [...mockUsers];

    supabaseUsers.forEach(spUser => {
      const existingIdx = combined.findIndex(u => u.id === spUser.id || u.email === spUser.email);
      if (existingIdx >= 0) {
        combined[existingIdx] = { ...combined[existingIdx], ...spUser };
      } else {
        combined.push(spUser);
      }
    });

    setUsers(combined);
    setLoading(false);
  };

  const addUser = async (e) => {
    e.preventDefault();
    if (!newUser.email || !newUser.password) return;
    setLoading(true);
    
    const newId = `user-${Date.now()}`;
    const userObj = {
      id: newId,
      email: newUser.email.trim().toLowerCase(),
      password: newUser.password.trim(),
      display_name: newUser.display_name.trim() || newUser.email.trim(),
      role: newUser.role,
      team_id: newUser.team_id.trim() || 'Team A',
      is_disabled: false,
      created_at: new Date().toISOString()
    };

    // 1. Save to mockUsersList
    const mockUsers = JSON.parse(localStorage.getItem('mockUsersList') || '[]');
    mockUsers.push(userObj);
    localStorage.setItem('mockUsersList', JSON.stringify(mockUsers));

    // 2. Try Supabase Auth if service role or standard flow available
    try {
      const { data, error } = await supabase.auth.admin.createUser({
        email: newUser.email,
        password: newUser.password,
        email_confirm: true,
      });

      if (!error && data?.user) {
        await supabase.from('profiles').update({
          team_id: newUser.team_id,
          role: newUser.role,
          display_name: newUser.display_name || newUser.email,
          is_disabled: false
        }).eq('id', data.user.id);
      }
    } catch (err) {
      console.log("Supabase Auth admin create bypassed (using local mock user):", err);
    }

    setMessage({ type: 'success', text: `アカウント「${newUser.email}」を追加しました。` });
    setShowAdd(false);
    setNewUser({ email: '', password: '', team_id: '', role: 'user', display_name: '' });
    fetchUsers();
    setLoading(false);
    setTimeout(() => setMessage(null), 4000);
  };

  const toggleUserStatus = async (user) => {
    const newStatus = !user.is_disabled;
    const actionName = newStatus ? '停止' : '再開';

    if (!confirm(`「${user.display_name || user.email}」を${actionName}しますか？`)) return;

    setLoading(true);

    // 1. Update local storage
    const mockUsers = JSON.parse(localStorage.getItem('mockUsersList') || '[]');
    const updatedMocks = mockUsers.map(u => {
      if (u.id === user.id || u.email === user.email) {
        return { ...u, is_disabled: newStatus };
      }
      return u;
    });
    localStorage.setItem('mockUsersList', JSON.stringify(updatedMocks));

    // 2. Update Supabase
    try {
      await supabase.from('profiles').update({ is_disabled: newStatus }).eq('id', user.id);
    } catch (e) {
      console.warn("Supabase update error:", e);
    }

    setMessage({ type: 'success', text: `「${user.display_name || user.email}」を${actionName}しました。` });
    fetchUsers();
    setLoading(false);
    setTimeout(() => setMessage(null), 4000);
  };

  const updateTeam = async (userId, email, team_id) => {
    // Local update
    const mockUsers = JSON.parse(localStorage.getItem('mockUsersList') || '[]');
    const updatedMocks = mockUsers.map(u => {
      if (u.id === userId || u.email === email) {
        return { ...u, team_id };
      }
      return u;
    });
    localStorage.setItem('mockUsersList', JSON.stringify(updatedMocks));

    // Supabase update
    try {
      await supabase.from('profiles').update({ team_id }).eq('id', userId);
    } catch (e) {
      console.warn(e);
    }

    fetchUsers();
  };

  const deleteUser = async (userId, email) => {
    if (!confirm(`「${email}」のアカウントを削除しますか？`)) return;
    
    setLoading(true);

    // Local remove
    const mockUsers = JSON.parse(localStorage.getItem('mockUsersList') || '[]');
    const updatedMocks = mockUsers.filter(u => u.id !== userId && u.email !== email);
    localStorage.setItem('mockUsersList', JSON.stringify(updatedMocks));

    // Supabase remove
    try {
      await supabase.auth.admin.deleteUser(userId);
      await supabase.from('profiles').delete().eq('id', userId);
    } catch (err) {
      console.warn("Supabase delete notice:", err);
    }

    setMessage({ type: 'success', text: `「${email}」を削除しました。` });
    fetchUsers();
    setLoading(false);
    setTimeout(() => setMessage(null), 4000);
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
          <p className="text-slate-400 text-sm">ユーザーの追加・停止・削除・チーム割り当てを管理します。</p>
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
            return (
              <div key={user.id || user.email} className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-6 py-4 transition-colors ${
                isDisabled ? 'bg-red-950/20 opacity-70' : 'hover:bg-slate-700/30'
              }`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
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
                  </div>
                  <p className="text-xs text-slate-400 truncate mt-0.5">{user.email}</p>
                </div>

                <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
                  <div className="relative">
                    <input
                      list="team-list"
                      value={user.team_id || ''}
                      onChange={e => updateTeam(user.id, user.email, e.target.value)}
                      placeholder="チーム未割当"
                      className="bg-slate-900 border border-slate-700 text-white text-xs rounded-lg px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-purple-500 w-32"
                    />
                  </div>

                  {/* Toggle Disable Status Button */}
                  <button
                    onClick={() => toggleUserStatus(user)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border cursor-pointer ${
                      isDisabled
                        ? 'bg-emerald-600/20 text-emerald-400 border-emerald-500/40 hover:bg-emerald-600/30'
                        : 'bg-amber-600/20 text-amber-400 border-amber-500/40 hover:bg-amber-600/30'
                    }`}
                    title={isDisabled ? "アカウントを再開" : "アカウントを停止"}
                  >
                    {isDisabled ? (
                      <>
                        <PlayCircle className="w-3.5 h-3.5" />
                        <span>アカウント再開</span>
                      </>
                    ) : (
                      <>
                        <Ban className="w-3.5 h-3.5" />
                        <span>アカウント停止</span>
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
