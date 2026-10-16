// Baseball Analyzer - Vite React App (Vercel Build Trigger)
import React, { useState, useEffect, useMemo, Suspense, lazy } from 'react';
import Papa from 'papaparse';
import Sidebar from './components/Sidebar';
import LoginPage from './pages/LoginPage';
import AccountModal from './components/AccountModal';
import { SHOW_PITCHER_MODULE, SHOW_BODY_COMP_MODULE } from './config';
import './App.css';

import { supabase } from './lib/supabase';
import { getGlobalUsers } from './lib/userSync';
import { saveDatasetToLocalDB, getDatasetFromLocalDB, clearLocalDB } from './lib/db';
import { parseAnyDate } from './utils/dataHelpers';
import {
  saveDatasetToCloud,
  fetchDatasetsFromCloud,
  mergeDatasetFiles
} from './services/cloudSync';

// Code Splitting: ページ単位の遅延読み込み（初期バンドルサイズを大幅削減）
const UploadPage = lazy(() => import('./pages/UploadPage'));
const TeamAnalysis = lazy(() => import('./pages/TeamAnalysis'));
const PlayerAnalysis = lazy(() => import('./pages/PlayerAnalysis'));
const PitcherAnalysis = lazy(() => import('./pages/PitcherAnalysis'));
const BodyCompAnalysis = lazy(() => import('./pages/BodyCompAnalysis'));
const GrowthReport = lazy(() => import('./pages/GrowthReport'));
const CustomCharts = lazy(() => import('./pages/CustomCharts'));
const GameStats = lazy(() => import('./pages/GameStats'));
const CloudDataManager = lazy(() => import('./pages/CloudDataManager'));
const AdminPanel = lazy(() => import('./pages/AdminPanel'));
const GuidePage = lazy(() => import('./pages/GuidePage'));
const SchedulePage = lazy(() => import('./pages/SchedulePage'));

function App() {
  const [savantFiles, setSavantFiles] = useState([]);
  const [savantPitchingFiles, setSavantPitchingFiles] = useState([]);
  const [blastFiles, setBlastFiles] = useState([]);
  const [combinedFiles, setCombinedFiles] = useState([]);
  const [bodyCompFiles, setBodyCompFiles] = useState([]);
  const [cloudSavantFiles, setCloudSavantFiles] = useState([]);
  const [cloudSavantPitchingFiles, setCloudSavantPitchingFiles] = useState([]);
  const [cloudBlastFiles, setCloudBlastFiles] = useState([]);
  const [cloudCombinedFiles, setCloudCombinedFiles] = useState([]);
  const [cloudBodyCompFiles, setCloudBodyCompFiles] = useState([]);
  const [activeView, setActiveView] = useState('upload');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [analysisState, setAnalysisState] = useState({ team: '', player: '' });

  // Day (朝 ☀️) / Night (夜 🌙) Theme State
  const [theme, setTheme] = useState(() => localStorage.getItem('app_theme') || 'dark');

  useEffect(() => {
    localStorage.setItem('app_theme', theme);
    if (theme === 'light') {
      document.documentElement.classList.add('light-mode');
      document.body.classList.add('light-mode');
    } else {
      document.documentElement.classList.remove('light-mode');
      document.body.classList.remove('light-mode');
    }
  }, [theme]);

  // Auth state (initialize from cache to prevent UI flash/flicker on reload)
  const [user, setUser] = useState(() => {
    try {
      const u = sessionStorage.getItem('mockUser') || localStorage.getItem('mockUser');
      return u ? JSON.parse(u) : null;
    } catch {
      return null;
    }
  });
  const [profile, setProfile] = useState(() => {
    try {
      const p = sessionStorage.getItem('mockProfile') || localStorage.getItem('mockProfile');
      return p ? JSON.parse(p) : null;
    } catch {
      return null;
    }
  });
  const [authLoading, setAuthLoading] = useState(true);
  const [showAccountModal, setShowAccountModal] = useState(false);

  // Global saving state (default to cloud connected)
  const [syncState, setSyncState] = useState({ saving: false, lastError: null, lastSuccess: 'Cloud Active', cloudConnected: true });

  // Check auth on mount: Prioritize Supabase Auth session, fallback to legacy session
  useEffect(() => {
    let isMounted = true;

    const initAuth = async () => {
      try {
        // 1. Check Supabase Auth official session first
        const { data: { session } } = await supabase.auth.getSession();

        if (session?.user) {
          const authUser = session.user;
          const { data: profileData } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', authUser.id)
            .single();

          if (profileData?.is_disabled) {
            await supabase.auth.signOut();
            if (isMounted) {
              setUser(null);
              setProfile(null);
              setAuthLoading(false);
              alert('このアカウントは現在停止されています。');
            }
            return;
          }

          // Fetch permissions from global users / cached profile to ensure ZERO flicker on reload
          let globalInfo = null;
          try {
            const globalUsers = await getGlobalUsers();
            const targetEmail = (authUser.email || '').toLowerCase();
            globalInfo = globalUsers.find(
              u => (u.id && u.id === authUser.id) || (u.email && u.email.toLowerCase() === targetEmail)
            );
          } catch {}

          const cachedProfileRaw = sessionStorage.getItem('mockProfile') || localStorage.getItem('mockProfile');
          let cachedProfile = null;
          try {
            if (cachedProfileRaw) cachedProfile = JSON.parse(cachedProfileRaw);
          } catch {}

          if (isMounted) {
            setUser(authUser);
            const pData = {
              id: authUser.id,
              email: authUser.email,
              role: authUser.user_metadata?.role || 'user',
              team_id: authUser.user_metadata?.team_id || 'Team A',
              team_name: authUser.user_metadata?.team_id || 'Team A',
              display_name: authUser.email,
              ...(cachedProfile || {}),
              ...(profileData || {}),
              ...(globalInfo || {})
            };

            const allowHitting = pData.allow_hitting !== false && pData.permissions?.hitting !== false;
            const allowPitching = pData.allow_pitching !== false && pData.permissions?.pitching !== false;
            const allowBodyComp = pData.allow_body_comp !== false && pData.permissions?.bodyComp !== false;
            const allowGame = pData.allow_game !== false && pData.permissions?.game !== false;

            const finalProfile = {
              ...pData,
              allow_hitting: allowHitting,
              allow_pitching: allowPitching,
              allow_body_comp: allowBodyComp,
              allow_game: allowGame,
              permissions: {
                hitting: allowHitting,
                pitching: allowPitching,
                bodyComp: allowBodyComp,
                game: allowGame
              }
            };

            setProfile(finalProfile);

            try {
              sessionStorage.setItem('mockProfile', JSON.stringify(finalProfile));
              localStorage.setItem('mockProfile', JSON.stringify(finalProfile));
              sessionStorage.setItem('mockUser', JSON.stringify({ id: authUser.id, email: authUser.email }));
              localStorage.setItem('mockUser', JSON.stringify({ id: authUser.id, email: authUser.email }));
            } catch {}

            setAuthLoading(false);
          }
          return;
        }

        // 2. Fallback: Check sessionStorage / localStorage for migration period
        const savedUser = sessionStorage.getItem('mockUser') || localStorage.getItem('mockUser');
        const savedProfile = sessionStorage.getItem('mockProfile') || localStorage.getItem('mockProfile');

        if (savedUser && savedProfile) {
          const u = JSON.parse(savedUser);
          const p = JSON.parse(savedProfile);

          try {
            const globalUsers = await getGlobalUsers();
            const latest = globalUsers.find(m => m.id === u.id || m.email.toLowerCase() === (u.email || '').toLowerCase());
            if (latest?.is_disabled || p?.is_disabled) {
              sessionStorage.removeItem('mockUser');
              sessionStorage.removeItem('mockProfile');
              localStorage.removeItem('mockUser');
              localStorage.removeItem('mockProfile');
              if (isMounted) {
                setUser(null);
                setProfile(null);
                setAuthLoading(false);
                alert('このアカウントは停止されています。');
              }
              return;
            } else if (isMounted) {
              setUser(u);
              setProfile(latest ? { ...p, ...latest } : p);
              setAuthLoading(false);
              return;
            }
          } catch {
            if (isMounted) {
              setUser(u);
              setProfile(p);
              setAuthLoading(false);
              return;
            }
          }
        }

        if (isMounted) {
          setUser(null);
          setProfile(null);
          setAuthLoading(false);
        }
      } catch (err) {
        console.error('Auth initialization error:', err);
        if (isMounted) setAuthLoading(false);
      }
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        sessionStorage.removeItem('mockUser');
        sessionStorage.removeItem('mockProfile');
        localStorage.removeItem('mockUser');
        localStorage.removeItem('mockProfile');
        setUser(null);
        setProfile(null);
        setSavantFiles([]);
        setSavantPitchingFiles([]);
        setBlastFiles([]);
        setCombinedFiles([]);
        setBodyCompFiles([]);
        setCloudSavantFiles([]);
        setCloudSavantPitchingFiles([]);
        setCloudBlastFiles([]);
        setCloudCombinedFiles([]);
        setCloudBodyCompFiles([]);
        setAnalysisState({ team: '', player: '' });
      } else if (event === 'SIGNED_IN' && session?.user) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();
        const cachedProfileRaw = sessionStorage.getItem('mockProfile') || localStorage.getItem('mockProfile');
        let cachedProfile = null;
        try {
          if (cachedProfileRaw) cachedProfile = JSON.parse(cachedProfileRaw);
        } catch {}

        setUser(session.user);
        const pData = {
          id: session.user.id,
          email: session.user.email,
          role: session.user.user_metadata?.role || 'user',
          team_id: session.user.user_metadata?.team_id || 'Team A',
          team_name: session.user.user_metadata?.team_id || 'Team A',
          display_name: session.user.email,
          ...(cachedProfile || {}),
          ...(profileData || {})
        };

        const allowHitting = pData.allow_hitting !== false && pData.permissions?.hitting !== false;
        const allowPitching = pData.allow_pitching !== false && pData.permissions?.pitching !== false;
        const allowBodyComp = pData.allow_body_comp !== false && pData.permissions?.bodyComp !== false;
        const allowGame = pData.allow_game !== false && pData.permissions?.game !== false;

        setProfile({
          ...pData,
          allow_hitting: allowHitting,
          allow_pitching: allowPitching,
          allow_body_comp: allowBodyComp,
          allow_game: allowGame,
          permissions: {
            hitting: allowHitting,
            pitching: allowPitching,
            bodyComp: allowBodyComp,
            game: allowGame
          }
        });
      }
    });

    return () => {
      isMounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  // Load cached data from IndexedDB (Scoped by user ID to prevent cross-account leaks)
  useEffect(() => {
    if (!authLoading && user) {
      const loadCachedData = async () => {
        const userKey = user?.id ? `user_${user.id}` : 'guest';
        try {
          const [cCombined, cSavant, cBlast, cPitching, cBodyComp] = await Promise.all([
            getDatasetFromLocalDB(`${userKey}_combined`),
            getDatasetFromLocalDB(`${userKey}_savant`),
            getDatasetFromLocalDB(`${userKey}_blast`),
            getDatasetFromLocalDB(`${userKey}_savant_pitching`),
            getDatasetFromLocalDB(`${userKey}_body_comp`)
          ]);

          setCombinedFiles(Array.isArray(cCombined) ? cCombined : []);
          setSavantFiles(Array.isArray(cSavant) ? cSavant : []);
          setBlastFiles(Array.isArray(cBlast) ? cBlast : []);
          setSavantPitchingFiles(Array.isArray(cPitching) ? cPitching : []);
          setBodyCompFiles(Array.isArray(cBodyComp) ? cBodyComp : []);
        } catch (e) {
          console.warn('Local DB restore failed:', e);
        }

        // Always fetch cloud data for analysis views
        fetchFromCloud();
      };
      loadCachedData();
    }
  }, [user, authLoading]);

  const handleLogin = (u, p) => { setUser(u); setProfile(p); };

  const handleLogout = async () => {
    sessionStorage.removeItem('mockUser');
    sessionStorage.removeItem('mockProfile');
    localStorage.removeItem('mockUser');
    localStorage.removeItem('mockProfile');

    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.error('Sign out error:', e);
    }
    setUser(null); setProfile(null);
    setSavantFiles([]); setSavantPitchingFiles([]); setBlastFiles([]); setCombinedFiles([]); setBodyCompFiles([]);
    setCloudSavantFiles([]); setCloudSavantPitchingFiles([]); setCloudBlastFiles([]); setCloudCombinedFiles([]); setCloudBodyCompFiles([]);
    setAnalysisState({ team: '', player: '' });
    setActiveView('upload');
    await clearLocalDB();
  };

  const saveToCloud = async (type, dataObj) => {
    if (!dataObj || !dataObj.data) {
      alert('保存するデータがありません。');
      return;
    }

    setSyncState(prev => ({ ...prev, saving: true, lastError: null }));

    try {
      const { totalRows } = await saveDatasetToCloud({ type, dataObj, user, profile });

      alert(`「${dataObj.filename}」(${totalRows.toLocaleString()}件)のクラウド同期が完了しました！\n「データ読み込み」の枠をクリアしました。クラウド管理画面でいつでも閲覧・管理が可能です。`);
      setSyncState(prev => ({ ...prev, saving: false, lastSuccess: 'Saved!' }));

      await fetchFromCloud();
      await updateDataState(type, dataObj.id || dataObj.filename, 'remove');
    } catch (err) {
      console.warn('Cloud save unavailable, fallback to local storage:', err);
      const currentFiles = type === 'savant' ? savantFiles
        : (type === 'blast' ? blastFiles
        : (type === 'savant_pitching' ? savantPitchingFiles
        : (type === 'body_comp' ? bodyCompFiles : combinedFiles)));
      const userKey = user?.id ? `user_${user.id}` : 'guest';
      await saveDatasetToLocalDB(`${userKey}_${type}`, currentFiles);
      alert(`「${dataObj.filename}」をクラウドへ保存中にエラーが発生したため、ローカル（ブラウザ）に保存しました。\n詳細: ${err?.message || err?.details || JSON.stringify(err)}`);
      setSyncState(prev => ({ ...prev, saving: false, lastSuccess: 'Local Saved' }));
    }
  };

  const fetchFromCloud = async () => {
    setSyncState(prev => ({ ...prev, saving: true, lastError: null }));
    try {
      const {
        savantFilesCloud,
        blastFilesCloud,
        pitchingFilesCloud,
        combinedFilesCloud,
        bodyCompFilesCloud
      } = await fetchDatasetsFromCloud({ user, profile });

      setCloudSavantFiles(savantFilesCloud);
      setCloudBlastFiles(blastFilesCloud);
      setCloudSavantPitchingFiles(pitchingFilesCloud);
      setCloudCombinedFiles(combinedFilesCloud);
      setCloudBodyCompFiles(bodyCompFilesCloud);

      setSyncState(prev => ({ ...prev, saving: false, lastSuccess: 'Synced!', cloudConnected: true, lastError: null }));
    } catch (err) {
      console.warn('Cloud sync skipped (using local cached data):', err);
      setSyncState(prev => ({ ...prev, saving: false, lastError: 'ローカルモード動作中' }));
    }
  };

  const updateDataState = async (type, payload, action = 'set') => {
    let setter, currentFiles;
    if (type === 'savant' || type === 'savant_hitting') { setter = setSavantFiles; currentFiles = savantFiles; }
    else if (type === 'savant_pitching' || type === 'pitcher') { setter = setSavantPitchingFiles; currentFiles = savantPitchingFiles; }
    else if (type === 'blast') { setter = setBlastFiles; currentFiles = blastFiles; }
    else if (type === 'combined') { setter = setCombinedFiles; currentFiles = combinedFiles; }
    else if (type === 'body_comp' || type === 'bodyComp') { setter = setBodyCompFiles; currentFiles = bodyCompFiles; }
    else { setter = setSavantFiles; currentFiles = savantFiles; }

    let newFiles = [...currentFiles];

    if (action === 'set') {
      newFiles = payload || [];
    } else if (action === 'add') {
      let finalData = payload.data;
      if (typeof payload.data === 'string' && payload.is_csv) {
        try {
          const results = Papa.parse(payload.data, { header: true, dynamicTyping: true, skipEmptyLines: true });
          finalData = results.data;
        } catch (e) { console.error('Parse error:', e); }
      }
      const generateId = () => {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
          return crypto.randomUUID();
        }
        return 'id-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
      };
      const processed = { ...payload, data: finalData, id: payload.id || generateId() };

      const existingIdx = newFiles.findIndex(f => f.filename === payload.filename);
      if (existingIdx !== -1) {
        newFiles[existingIdx] = { ...processed, id: newFiles[existingIdx].id };
      } else {
        newFiles.push(processed);
      }
    } else if (action === 'remove') {
      if (typeof payload === 'number') {
        newFiles.splice(payload, 1);
      } else {
        newFiles = newFiles.filter(f => f.id !== payload && f.filename !== payload);
      }
    } else if (action === 'clear') {
      newFiles = [];
    } else if (action === 'update_file_date') {
      const { index, date } = payload;
      if (newFiles[index]) {
        const normD = parseAnyDate(date);
        const updatedData = (newFiles[index].data || []).map(r => ({
          ...r,
          date: normD,
          game_date: normD
        }));
        newFiles[index] = {
          ...newFiles[index],
          data: updatedData,
          date: normD
        };
      }
    }

    setter(newFiles);
    const userKey = user?.id ? `user_${user.id}` : 'guest';
    await saveDatasetToLocalDB(`${userKey}_${type}`, newFiles);
  };

  const savantData = useMemo(
    () => mergeDatasetFiles([...cloudSavantFiles, ...savantFiles], { user, profile }),
    [savantFiles, cloudSavantFiles, user, profile]
  );
  const savantPitchingData = useMemo(
    () => mergeDatasetFiles([...cloudSavantPitchingFiles, ...savantPitchingFiles], { user, profile }),
    [savantPitchingFiles, cloudSavantPitchingFiles, user, profile]
  );
  const blastData = useMemo(
    () => mergeDatasetFiles([...cloudBlastFiles, ...blastFiles], { user, profile }),
    [blastFiles, cloudBlastFiles, user, profile]
  );
  const combinedData = useMemo(
    () => mergeDatasetFiles([...cloudCombinedFiles, ...combinedFiles], { user, profile }),
    [combinedFiles, cloudCombinedFiles, user, profile]
  );
  const bodyCompData = useMemo(
    () => mergeDatasetFiles([...cloudBodyCompFiles, ...bodyCompFiles], { user, profile }),
    [bodyCompFiles, cloudBodyCompFiles, user, profile]
  );

  const renderActiveView = () => {
    const handleViewPlayer = (player, team, source) => {
      setAnalysisState({ player, team, source });
      setActiveView('player');
    };

    const uploadProps = {
      savantFiles, savantPitchingFiles, blastFiles, combinedFiles, bodyCompFiles, updateDataState,
      setActiveView, saveToCloud, syncState, profile, fetchFromCloud,
      onViewPlayer: handleViewPlayer
    };
    const allowHitting = profile?.allow_hitting !== false && profile?.permissions?.hitting !== false;
    const allowPitching = profile?.allow_pitching !== false && profile?.permissions?.pitching !== false;
    const allowBodyComp = profile?.allow_body_comp !== false && profile?.permissions?.bodyComp !== false;
    const allowGame = profile?.allow_game !== false && profile?.permissions?.game !== false;

    switch (activeView) {
      case 'upload':   return <UploadPage {...uploadProps} />;
      case 'team':     return allowHitting ? <TeamAnalysis savantData={savantData} blastData={blastData} combinedData={combinedData} onViewPlayer={handleViewPlayer} /> : <UploadPage {...uploadProps} />;
      case 'pitcher':  return (SHOW_PITCHER_MODULE && allowPitching) ? <PitcherAnalysis savantData={savantPitchingData} blastData={null} combinedData={null} initialPitcher={analysisState.pitcher} initialTeam={analysisState.team} initialSource={analysisState.source} onViewPlayer={handleViewPlayer} /> : <UploadPage {...uploadProps} />;
      case 'bodyComp': return (SHOW_BODY_COMP_MODULE && allowBodyComp) ? <BodyCompAnalysis bodyCompData={bodyCompData} blastData={blastData} combinedData={combinedData} setActiveView={setActiveView} onViewPlayer={(player, team, source) => handleViewPlayer(player, team, source || 'body_comp')} /> : <UploadPage {...uploadProps} />;
      case 'player':   return <PlayerAnalysis savantData={savantData} savantPitchingData={savantPitchingData} blastData={blastData} combinedData={combinedData} bodyCompData={bodyCompData} initialPlayer={analysisState.player} initialTeam={analysisState.team} initialSource={analysisState.source} profile={profile} />;
      case 'growth':   return <GrowthReport savantData={savantData} blastData={blastData} combinedData={combinedData} savantPitchingData={savantPitchingData} bodyCompData={bodyCompData} profile={profile} onViewPlayer={handleViewPlayer} />;
      case 'schedule': return <SchedulePage {...uploadProps} />;
      case 'game':     return allowGame ? <GameStats savantData={savantData} blastData={blastData} combinedData={combinedData} /> : <UploadPage {...uploadProps} />;
      case 'custom':   return <CustomCharts savantData={savantData} blastData={blastData} combinedData={combinedData} />;
      case 'cloud':    return <CloudDataManager updateDataState={updateDataState} profile={profile} syncState={syncState} fetchFromCloud={fetchFromCloud} />;
      case 'guide':    return <GuidePage setActiveView={setActiveView} user={user} profile={profile} />;
      case 'admin':    return profile?.role === 'admin' ? <AdminPanel /> : null;
      default:         return <UploadPage {...uploadProps} />;
    }
  };

  const checkAccountStatus = async () => {
    if (!user) return true;
    try {
      let latest = null;
      if (user.id) {
        try {
          const { data: pData } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();
          if (pData) latest = pData;
        } catch {}
      }

      if (!latest) {
        const globalUsers = await getGlobalUsers();
        const targetEmail = (user.email || profile?.email || '').toLowerCase();
        latest = globalUsers.find(u => (u.id && u.id === user.id) || (u.email && u.email.toLowerCase() === targetEmail));
      }

      if (latest) {
        if (latest.is_disabled === true) {
          localStorage.removeItem('mockUser');
          localStorage.removeItem('mockProfile');
          sessionStorage.removeItem('mockUser');
          sessionStorage.removeItem('mockProfile');
          try {
            await supabase.auth.signOut();
          } catch {}
          setUser(null);
          setProfile(null);
          alert('このアカウントは管理者により停止されました。');
          return false;
        }

        setProfile(prev => {
          const updated = { ...(prev || {}), ...latest };
          const allowHitting = updated.allow_hitting !== false && updated.permissions?.hitting !== false;
          const allowPitching = updated.allow_pitching !== false && updated.permissions?.pitching !== false;
          const allowBodyComp = updated.allow_body_comp !== false && updated.permissions?.bodyComp !== false;
          const allowGame = updated.allow_game !== false && updated.permissions?.game !== false;

          if (activeView === 'team' && !allowHitting) setActiveView('upload');
          if (activeView === 'pitcher' && (!SHOW_PITCHER_MODULE || !allowPitching)) setActiveView('upload');
          if (activeView === 'bodyComp' && (!SHOW_BODY_COMP_MODULE || !allowBodyComp)) setActiveView('upload');
          if (activeView === 'game' && !allowGame) setActiveView('upload');

          return {
            ...updated,
            allow_hitting: allowHitting,
            allow_pitching: allowPitching,
            allow_body_comp: allowBodyComp,
            allow_game: allowGame,
            permissions: {
              hitting: allowHitting,
              pitching: allowPitching,
              bodyComp: allowBodyComp,
              game: allowGame
            }
          };
        });
      }
    } catch (e) {
      console.warn('Account status check skipped:', e);
    }
    return true;
  };

  useEffect(() => {
    if (!user) return;

    const handleStorageChange = (e) => {
      if (!e.key || e.key === 'mockUsersList' || e.key === 'mockProfile' || e.key === 'accountStatusChanged') {
        checkAccountStatus();
      }
    };

    const handleFocus = () => {
      checkAccountStatus();
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('accountStatusRefresh', checkAccountStatus);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('accountStatusRefresh', checkAccountStatus);
    };
  }, [user, activeView]);

  const handleViewChange = async (view) => {
    const isOk = await checkAccountStatus();
    if (!isOk) return;
    setActiveView(view);
    setIsMenuOpen(false);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-slate-400 text-sm animate-pulse">読み込み中...</div>
      </div>
    );
  }

  if (!user) return <LoginPage onLogin={handleLogin} />;

  const viewLabels = {
    upload: 'データ読み込み',
    cloud: 'クラウド管理',
    team: '打撃分析',
    pitcher: '投手分析',
    bodyComp: '体組成分析',
    player: '個人分析',
    growth: '成長レポート',
    game: '試合スタッツ',
    custom: 'カスタムグラフ',
    guide: '使い方ガイド',
    admin: '管理者パネル'
  };

  return (
    <div className="main-layout">
      {isMenuOpen && <div className="sidebar-overlay fixed inset-0 bg-black/60 z-40 backdrop-blur-sm lg:hidden" onClick={() => setIsMenuOpen(false)} />}

      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-slate-900 border-b border-slate-800 z-50 flex items-center px-3 sm:px-5 justify-between shadow-xl">
        <div className="flex items-center gap-2 min-w-0">
          <h1 className="text-sm sm:text-base font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500 shrink-0">
            Baseball Analyzer
          </h1>
          <span className="text-[9px] sm:text-[10px] font-bold bg-blue-600/20 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded-full shrink-0">
            {viewLabels[activeView] || '分析'}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {profile && (
            <button
              onClick={() => setShowAccountModal(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-800/90 border border-slate-700/80 hover:border-blue-500/50 transition cursor-pointer max-w-[130px] sm:max-w-[180px]"
              title="ログイン中のアカウント（タップでパスワード変更）"
            >
              <div className="w-6 h-6 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center shrink-0 text-blue-400">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
              </div>
              <div className="min-w-0 text-left">
                <p className="text-[10px] sm:text-[11px] font-bold text-white truncate leading-tight">
                  {profile.display_name || profile.username || profile.email}
                </p>
                <p className="text-[9px] text-emerald-400 font-semibold truncate leading-tight">
                  {profile.role === 'admin' ? '管理者' : (profile.team_name || profile.team_id || 'チーム')}
                </p>
              </div>
            </button>
          )}

          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="p-2 text-slate-300 hover:text-white bg-slate-800 border border-slate-700 rounded-xl transition-all"
            title="メニュー開閉"
          >
            {isMenuOpen
              ? <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
              : <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 6h16M4 12h16m-7 6h7" /></svg>
            }
          </button>
        </div>
      </div>

      <Sidebar
        activeView={activeView}
        setActiveView={handleViewChange}
        savantData={savantData}
        savantPitchingData={savantPitchingData}
        blastData={blastData}
        combinedData={combinedData}
        bodyCompData={bodyCompData}
        savantFiles={savantFiles}
        savantPitchingFiles={savantPitchingFiles}
        blastFiles={blastFiles}
        combinedFiles={combinedFiles}
        bodyCompFiles={bodyCompFiles}
        isOpen={isMenuOpen}
        setIsOpen={setIsMenuOpen}
        syncState={syncState}
        profile={profile}
        onLogout={handleLogout}
        onOpenAccount={() => setShowAccountModal(true)}
        theme={theme}
        setTheme={setTheme}
      />

      {/* Account Info & Password Change Modal */}
      <AccountModal
        isOpen={showAccountModal}
        onClose={() => setShowAccountModal(false)}
        profile={profile}
        onLogout={handleLogout}
      />

      <main className="content-area pt-20 lg:pt-10">
        <div className="max-container">
          <Suspense
            fallback={
              <div className="min-h-[400px] flex items-center justify-center">
                <div className="text-slate-400 text-sm animate-pulse">モジュールを読み込み中...</div>
              </div>
            }
          >
            {renderActiveView()}
          </Suspense>
        </div>
      </main>
    </div>
  );
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('App Error Boundary caught an error:', error, errorInfo);
  }

  handleResetCache = async () => {
    try {
      localStorage.clear();
      await clearLocalDB();
    } catch (e) {
      console.error(e);
    }
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
          <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl max-w-lg shadow-2xl space-y-4">
            <h3 className="text-xl font-bold text-white">画面の表示中に問題が発生しました</h3>
            <p className="text-slate-400 text-sm">一時的な状態エラーまたはキャッシュの不整合が発生しました。</p>

            {this.state.error && (
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-left text-xs font-mono text-red-400 overflow-x-auto max-h-32">
                {this.state.error.message || String(this.state.error)}
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <button
                onClick={() => window.location.reload()}
                className="w-full sm:w-auto bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 px-6 rounded-xl transition-all shadow-lg text-sm"
              >
                再読み込み
              </button>
              <button
                onClick={this.handleResetCache}
                className="w-full sm:w-auto bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-2.5 px-6 rounded-xl transition-all border border-slate-700 text-sm"
              >
                キャッシュをリセットして初期化
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function RootApp() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}
