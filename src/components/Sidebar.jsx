import React from 'react';
import { UploadCloud, Users, User, LineChart, Trophy, HardDrive, RefreshCw, CheckCircle2, AlertCircle, Shield, LogOut } from 'lucide-react';

function Sidebar({ activeView, setActiveView, savantData, blastData, combinedData, isOpen, syncState, profile, onLogout }) {
  const isAdmin = profile?.role === 'admin';
  const hasData = (savantData?.data?.length > 0) || (blastData?.data?.length > 0) || (combinedData?.data?.length > 0);

  const menuItems = [
    { id: 'upload', label: 'データ読み込み', icon: UploadCloud },
    { id: 'cloud', label: 'クラウド管理', icon: HardDrive },
    { id: 'team', label: 'チーム分析', icon: Users, disabled: !hasData },
    { id: 'player', label: '個人成績', icon: User, disabled: !hasData },
    { id: 'game', label: '試合スタッツ', icon: Trophy, disabled: !hasData },
    { id: 'custom', label: 'カスタムグラフ', icon: LineChart, disabled: !hasData },
    ...(isAdmin ? [{ id: 'admin', label: '管理者パネル', icon: Shield }] : []),
  ];

  return (
    <div className={`
      w-64 h-screen bg-gray-900 border-r border-gray-800 flex flex-col flex-shrink-0 text-gray-300
      fixed lg:relative z-40 transition-transform duration-300
      ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
    `}>
      <div className="p-6 border-b border-gray-800">
        <h1 className="text-xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">
          Baseball Analyzer
        </h1>
        <p className="text-xs text-gray-500 mt-1">Rapsodo & Blast Integration</p>
      </div>

      <nav className="flex-1 py-6 px-4 space-y-2">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          
          return (
            <button
              key={item.id}
              onClick={() => !item.disabled && setActiveView(item.id)}
              disabled={item.disabled}
              className={`w-full flex items-center px-4 py-3 rounded-lg transition-all text-sm font-medium ${
                isActive 
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30 shadow-inner' 
                  : item.disabled 
                    ? 'opacity-30 cursor-not-allowed' 
                    : 'hover:bg-gray-800 hover:text-white border border-transparent'
              }`}
            >
              <Icon className={`w-5 h-5 mr-3 ${isActive ? 'text-blue-400' : 'text-gray-400'}`} />
              {item.label}
            </button>
          );
        })}
      </nav>

        {profile && (
          <div className="px-4 py-3 border-t border-gray-800 flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-xs font-bold text-white truncate">{profile.display_name || profile.email}</p>
              <p className="text-[10px] text-slate-500">{profile.role === 'admin' ? '管理者' : (profile.team_id || 'チーム未割当')}</p>
            </div>
            <button onClick={onLogout} title="ログアウト" className="ml-2 text-slate-500 hover:text-red-400 transition-colors flex-shrink-0">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
        <div className="px-4 pb-3 space-y-2">
        {syncState.saving && (
          <div className="flex items-center justify-center gap-2 text-blue-400 animate-pulse text-[10px] font-bold uppercase">
            <RefreshCw className="w-3 h-3 animate-spin" />
            Saving to Cloud...
          </div>
        )}
        {syncState.lastSuccess && (
          <div className="flex items-center justify-center gap-2 text-emerald-500 text-[10px] font-bold uppercase">
            <CheckCircle2 className="w-3 h-3" />
            {syncState.lastSuccess}
          </div>
        )}
        {syncState.lastError && (
          <div className="flex flex-col items-center justify-center gap-1 text-red-500 text-[10px] font-bold uppercase p-2 bg-red-500/10 rounded-lg border border-red-500/20">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-3 h-3" />
              Sync Failed
            </div>
            <div className="lowercase font-normal text-red-400/80 truncate w-full text-center overflow-hidden" title={syncState.lastError}>
              {syncState.lastError}
            </div>
          </div>
        )}
        <div className="text-[10px] text-gray-600 text-center">
          © 2026 Baseball Analytics
        </div>
      </div>
    </div>
  );
}

export default Sidebar;
