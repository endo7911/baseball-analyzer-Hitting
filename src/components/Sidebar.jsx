import React, { useState, useEffect } from 'react';
import { UploadCloud, Users, User, LineChart, Trophy, HardDrive, RefreshCw, CheckCircle2, Shield, LogOut, X, BookOpen } from 'lucide-react';

function Sidebar({ activeView, setActiveView, savantData, blastData, combinedData, isOpen, setIsOpen, syncState, profile, onLogout }) {
  const isAdmin = profile?.role === 'admin';
  const hasData = (savantData?.data?.length > 0) || (blastData?.data?.length > 0) || (combinedData?.data?.length > 0);

  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const allMenuItems = [
    { id: 'upload', label: 'データ読み込み', icon: UploadCloud, mobileHidden: true },
    { id: 'cloud', label: 'クラウド管理', icon: HardDrive, mobileHidden: true },
    { id: 'team', label: 'チーム分析', icon: Users, disabled: !hasData },
    { id: 'player', label: '個人成績', icon: User, disabled: !hasData },
    { id: 'game', label: '試合スタッツ', icon: Trophy, disabled: !hasData },
    { id: 'custom', label: 'カスタムグラフ', icon: LineChart, disabled: !hasData },
    { id: 'guide', label: '使い方ガイド', icon: BookOpen },
    ...(isAdmin ? [{ id: 'admin', label: '管理者パネル', icon: Shield }] : []),
  ];

  // Hide upload & cloud management on mobile screens as requested
  const menuItems = isMobile 
    ? allMenuItems.filter(item => !item.mobileHidden)
    : allMenuItems;

  return (
    <div className={`
      w-64 h-screen bg-gray-900 border-r border-gray-800 flex flex-col flex-shrink-0 text-gray-300
      fixed lg:relative z-40 transition-transform duration-300
      ${isOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full lg:translate-x-0'}
    `}>
      <div className="p-5 border-b border-gray-800 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">
            Baseball Analyzer
          </h1>
          <p className="text-[10px] text-gray-500 mt-0.5">Rapsodo & Blast Integration</p>
        </div>
        <button 
          onClick={() => setIsOpen && setIsOpen(false)}
          className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          title="メニューを閉じる"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 py-4 px-3 space-y-1.5 overflow-y-auto">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          
          return (
            <button
              key={item.id}
              onClick={() => {
                if (!item.disabled) {
                  setActiveView(item.id);
                  if (isMobile && setIsOpen) setIsOpen(false);
                }
              }}
              disabled={item.disabled}
              className={`w-full flex items-center px-4 py-3 rounded-xl transition-all text-sm font-bold ${
                isActive 
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30 shadow-inner' 
                  : item.disabled 
                    ? 'opacity-30 cursor-not-allowed' 
                    : 'hover:bg-slate-800 hover:text-white border border-transparent'
              }`}
            >
              <Icon className={`w-5 h-5 mr-3 ${isActive ? 'text-blue-400' : 'text-slate-400'}`} />
              {item.label}
            </button>
          );
        })}
      </nav>

      {profile && (
        <div className="px-4 py-3 border-t border-gray-800 flex items-center justify-between bg-slate-900/50">
          <div className="min-w-0">
            <p className="text-xs font-bold text-white truncate">{profile.display_name || profile.email}</p>
            <p className="text-[10px] text-slate-500">{profile.role === 'admin' ? '管理者' : (profile.team_id || 'チーム未割当')}</p>
          </div>
          <button onClick={onLogout} title="ログアウト" className="ml-2 text-slate-500 hover:text-red-400 transition-colors flex-shrink-0">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="px-4 pb-3 space-y-2 pt-2 border-t border-gray-800/60">
        {syncState.saving && (
          <div className="flex items-center justify-center gap-2 text-blue-400 animate-pulse text-xs font-bold p-2 bg-blue-500/10 rounded-lg border border-blue-500/20">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            <span>クラウドへ同期中...</span>
          </div>
        )}
        {!syncState.saving && syncState.lastSuccess && (
          <div className="flex items-center justify-center gap-2 text-emerald-400 text-xs font-bold p-2 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>クラウド同期完了</span>
          </div>
        )}
        {!syncState.saving && !syncState.lastSuccess && (
          <div className="flex items-center justify-center gap-2 text-slate-300 text-xs font-bold p-2 bg-slate-800 rounded-lg border border-slate-700">
            <HardDrive className="w-3.5 h-3.5 text-blue-400" />
            <span>ローカルモード (保存中)</span>
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
