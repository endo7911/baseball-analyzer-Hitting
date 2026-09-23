// Baseball Analyzer - Vite React App (Vercel Build Trigger)
import React, { useState, useEffect, useMemo } from 'react';
import Papa from 'papaparse';
import Sidebar from './components/Sidebar';
import UploadPage from './pages/UploadPage';
import TeamAnalysis from './pages/TeamAnalysis';
import PlayerAnalysis from './pages/PlayerAnalysis';
import PitcherAnalysis from './pages/PitcherAnalysis';
import CustomCharts from './pages/CustomCharts';
import GameStats from './pages/GameStats';
import CloudDataManager from './pages/CloudDataManager';
import LoginPage from './pages/LoginPage';
import AdminPanel from './pages/AdminPanel';
import GuidePage from './pages/GuidePage';
import './App.css';

import { supabase, getSupabase } from './lib/supabase';
import { saveDatasetToLocalDB, getDatasetFromLocalDB, clearLocalDB } from './lib/db';

function App() {
  const [savantFiles, setSavantFiles] = useState([]);
  const [savantPitchingFiles, setSavantPitchingFiles] = useState([]);
  const [blastFiles, setBlastFiles] = useState([]);
  const [combinedFiles, setCombinedFiles] = useState([]);
  const [cloudSavantFiles, setCloudSavantFiles] = useState([]);
  const [cloudSavantPitchingFiles, setCloudSavantPitchingFiles] = useState([]);
  const [cloudBlastFiles, setCloudBlastFiles] = useState([]);
  const [cloudCombinedFiles, setCloudCombinedFiles] = useState([]);
  const [activeView, setActiveView] = useState('upload');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [analysisState, setAnalysisState] = useState({ team: '', player: '' });

  // Auth state
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Global saving state
  const [syncState, setSyncState] = useState({ saving: false, lastError: null, lastSuccess: null });

  // Check auth on mount
  useEffect(() => {
    // 1. Check local storage for mock session first
    const savedUser = localStorage.getItem('mockUser');
    const savedProfile = localStorage.getItem('mockProfile');
    
    if (savedUser && savedProfile) {
      try {
        const u = JSON.parse(savedUser);
        const p = JSON.parse(savedProfile);
        
        // Check if user is disabled in mockUsersList
        const mockUsers = JSON.parse(localStorage.getItem('mockUsersList') || '[]');
        const latestMock = mockUsers.find(m => m.id === u.id || m.email === u.email);
        
        if (latestMock?.is_disabled || p?.is_disabled) {
          localStorage.removeItem('mockUser');
          localStorage.removeItem('mockProfile');
          setUser(null);
          setProfile(null);
          setAuthLoading(false);
          alert('このアカウントは停止されています。');
          return;
        }

        setUser(u);
        setProfile(p);
        setAuthLoading(false);
        return;
      } catch (e) {
        console.warn("Mock session parse error:", e);
      }
    }

    // 2. Otherwise try Supabase
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (session?.user) {
          supabase.from('profiles').select('*').eq('id', session.user.id).single()
            .then(({ data }) => { 
              if (data?.is_disabled) {
                supabase.auth.signOut();
                setUser(null);
                setProfile(null);
                alert('このアカウントは停止されています。');
              } else {
                setUser(session.user);
                setProfile(data); 
              }
              setAuthLoading(false); 
            })
            .catch(() => setAuthLoading(false));
        } else {
          setAuthLoading(false);
        }
      })
      .catch((err) => {
        console.error('Auth check failed:', err);
        setAuthLoading(false);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') { setUser(null); setProfile(null); }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Load cached data from IndexedDB (Scoped by user ID to prevent cross-account leaks)
  useEffect(() => {
    if (!authLoading) {
      const loadCachedData = async () => {
        // Keep UploadPage cards empty on fresh reload so user isn't confused by auto-populated cards
        setSavantFiles([]);
        setBlastFiles([]);
        setCombinedFiles([]);
        
        // Fetch cloud data for analysis views if user is logged in
        if (user) {
          fetchFromCloud();
        }
      };
      loadCachedData();
    }
  }, [user, authLoading]);

  const handleLogin = (u, p) => { setUser(u); setProfile(p); };

  const handleLogout = async () => {
    // Clear mock session
    localStorage.removeItem('mockUser');
    localStorage.removeItem('mockProfile');
    
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.error('Sign out error:', e);
    }
    setUser(null); setProfile(null);
    setSavantFiles([]); setBlastFiles([]); setCombinedFiles([]);
    await clearLocalDB();
  };

  const saveToCloud = async (type, dataObj) => {
    if (!dataObj || !dataObj.data) {
      alert("保存するデータがありません。");
      return;
    }

    setSyncState(prev => ({ ...prev, saving: true, lastError: null }));
    const client = getSupabase();
    
    const table = type === 'savant' ? 'savant_data' 
                : (type === 'blast' ? 'blast_data' 
                : (type === 'savant_pitching' ? 'pitching_data' : 'baseball_data'));

    // Define allowed columns matching exact Supabase schemas
    const SAVANT_COLUMNS = [
      'game_date', 'pitcher_name', 'batter_name', 'pitch_name', 'release_speed', 'release_spin_rate', 
      'launch_speed', 'launch_angle', 'bat_speed', 'attack_angle', 'hit_distance_sc', 'events', 'description', 'zone', 'stand', 
      'p_throws', 'home_team', 'away_team', 'type', 'hit_location', 'bb_type', 'balls', 'strikes', 
      'game_year', 'pfx_x', 'pfx_z', 'plate_x', 'plate_z', 'on_3b', 'on_2b', 'on_1b', 
      'outs_when_up', 'inning', 'inning_topbot', 'hc_x', 'hc_y', 'vx0', 'vy0', 'vz0', 
      'ax', 'ay', 'az', 'sz_top', 'sz_bot', 'effective_speed', 'release_extension', 
      'game_pk', 'spin_axis', 'delta_home_win_exp', 'delta_run_exp', 'file_name', 'upload_id',
      'pitch_type', 'release_pos_x', 'release_pos_y', 'release_pos_z', 'vaa', 'haa',
      'attack_direction', 'estimated_woba_using_speedangle', 'pitcher', 'batter', 'swing_length'
    ];
    
    const BLAST_COLUMNS = [
      'date', 'player_name', 'bat_speed', 'attack_angle', 'vertical_bat_angle', 'power', 
      'time_to_contact', 'peak_hand_speed', 'on_plane_efficiency', 'rotation_score', 
      'on_plane_score', 'connection_score', 'rotation_acceleration', 'connection_at_impact', 
      'connection_at_address', 'bat_angle', 'file_name', 'upload_id',
      'launch_speed', 'launch_angle', 'hit_distance_sc'
    ];

    const COMBINED_COLUMNS = [
      'date', 'game_date', 'player_name', 'batter_name', 'team_name', 'grade',
      'bat_speed', 'launch_speed', 'attack_angle', 'launch_angle', 'hit_distance_sc',
      'hc_x', 'on_plane_efficiency', 'connection_score', 'rotation_score',
      'time_to_contact', 'peak_hand_speed', 'power', 'vertical_bat_angle',
      'release_speed', 'file_name', 'upload_id'
    ];

    const PITCHING_COLUMNS = [
      'date', 'game_date', 'pitcher_name', 'player_name', 'team_name',
      'pitch_type', 'pitch_name', 'release_speed', 'release_spin_rate',
      'spin_axis', 'spin_efficiency', 'gyro_angle', 'vb_traj', 'hb_traj',
      'release_pos_x', 'release_pos_z', 'vaa', 'p_throws',
      'file_name', 'upload_id'
    ];

    const allowedColumns = table === 'savant_data' ? SAVANT_COLUMNS 
      : (table === 'blast_data' ? BLAST_COLUMNS 
      : (table === 'pitching_data' ? PITCHING_COLUMNS : COMBINED_COLUMNS));

    // Mapping for Japanese/Rapsodo keys to DB columns
    const COLUMN_MAP = {
      // 選手名 / 投手名
      '選手名': 'player_name',
      'Player Name': 'player_name',
      'Player': 'player_name',
      'PlayerName': 'player_name',
      'batter_name': 'player_name',
      '氏名': 'player_name',
      '名前': 'player_name',
      '投手名': 'pitcher_name',
      'Pitcher Name': 'pitcher_name',
      'Pitcher': 'pitcher_name',
      'PitcherName': 'pitcher_name',
      'pitcher_name': 'pitcher_name',
      // 学年
      '学年': 'grade',
      'grade': 'grade',
      'Grade': 'grade',
      '年次': 'grade',
      '学年・年次': 'grade',
      // バットスピード
      'バットスピード': 'bat_speed',
      'スイング速度': 'bat_speed',
      'bat_speed': 'bat_speed',
      'BatSpeed': 'bat_speed',
      'Bat Speed (mph)': 'bat_speed',
      'バット速度': 'bat_speed',
      // 打球速度
      '打球速度': 'launch_speed',
      'ExitVelocity': 'launch_speed',
      'launch_speed': 'launch_speed',
      'exit_velocity': 'launch_speed',
      'EV': 'launch_speed',
      '打球スピード': 'launch_speed',
      // 打球角度
      '打球角度': 'launch_angle',
      'LaunchAngle': 'launch_angle',
      'launch_angle': 'launch_angle',
      'LA': 'launch_angle',
      '角度': 'launch_angle',
      // 飛距離
      '飛距離': 'hit_distance_sc',
      'Distance': 'hit_distance_sc',
      'hit_distance_sc': 'hit_distance_sc',
      'distance': 'hit_distance_sc',
      '推定飛距離': 'hit_distance_sc',
      // アタックアングル
      'アタックアングル': 'attack_angle',
      'attack_angle': 'attack_angle',
      'AttackAngle': 'attack_angle',
      'AA': 'attack_angle',
      'アッパースイング度': 'attack_angle',
      'アッパー角度': 'attack_angle',
      'アッパースイング': 'attack_angle',
      'アッパー': 'attack_angle',
      // スイング時間
      'スイング時間': 'time_to_contact',
      'time_to_contact': 'time_to_contact',
      'TimeToContact': 'time_to_contact',
      'Time to Contact (sec)': 'time_to_contact',
      // オンプレーン効率
      'オンプレーンの効率': 'on_plane_efficiency',
      'オンプレーン効率': 'on_plane_efficiency',
      'オンプレーン': 'on_plane_efficiency',
      'on_plane_efficiency': 'on_plane_efficiency',
      'OnPlaneEfficiency': 'on_plane_efficiency',
      'オンプレーンスコア': 'on_plane_score',
      // 手の最大速度
      '手の最大速度': 'peak_hand_speed',
      '手の最大': 'peak_hand_speed',
      'peak_hand_speed': 'peak_hand_speed',
      'PeakHandSpeed': 'peak_hand_speed',
      'Hand Speed': 'peak_hand_speed',
      // 球速
      '球速': 'release_speed',
      'release_speed': 'release_speed',
      'PitchBallVelo': 'release_speed',
      'pitch_velocity': 'release_speed',
      'Pitch Speed': 'release_speed',
      'PitchSpeed': 'release_speed',
      // 球種
      '球種': 'pitch_type',
      'Pitch Type': 'pitch_type',
      'PitchType': 'pitch_type',
      'pitch_type': 'pitch_type',
      'pitch_name': 'pitch_type',
      // 回転数
      '回転数': 'release_spin_rate',
      'Spin Rate': 'release_spin_rate',
      'SpinRate': 'release_spin_rate',
      'release_spin_rate': 'release_spin_rate',
      // 回転軸
      '回転軸': 'spin_axis',
      'Spin Axis': 'spin_axis',
      'SpinAxis': 'spin_axis',
      'spin_axis': 'spin_axis',
      // 回転効率
      '回転効率': 'spin_efficiency',
      'Spin Efficiency': 'spin_efficiency',
      'SpinEfficiency': 'spin_efficiency',
      'spin_efficiency': 'spin_efficiency',
      // ジャイロ角
      'ジャイロ角': 'gyro_angle',
      'Gyro Angle': 'gyro_angle',
      'GyroAngle': 'gyro_angle',
      'gyro_angle': 'gyro_angle',
      // 変化量
      '縦変化量': 'vb_traj',
      'VB (trajectory)': 'vb_traj',
      'VB': 'vb_traj',
      'vbreak_traj': 'vb_traj',
      '横変化量': 'hb_traj',
      'HB (trajectory)': 'hb_traj',
      'HB': 'hb_traj',
      'hbreak_traj': 'hb_traj',
      // リリリース位置
      'リリース高度': 'release_pos_z',
      'Release Height': 'release_pos_z',
      'ReleaseHeight': 'release_pos_z',
      'release_pos_z': 'release_pos_z',
      'リリース幅': 'release_pos_x',
      'Release Side': 'release_pos_x',
      'ReleaseSide': 'release_pos_x',
      'release_pos_x': 'release_pos_x',
      // VAA
      'VAA': 'vaa',
      'VerticalApproachAngle': 'vaa',
      // 利き腕
      '利き腕': 'p_throws',
      'Throws': 'p_throws',
      'p_throws': 'p_throws',
      // 日付
      '日付': 'date',
      'Date': 'game_date',
      'game_date': 'game_date',
      // その他
      '体とバットの角度スコア': 'connection_score',
      'コネクション': 'connection_score',
      '体の回転による加速スコア': 'rotation_score',
      'ローテーション': 'rotation_score',
      '初動': 'rotation_acceleration',
      'インパクト': 'connection_at_impact',
      '構え': 'connection_at_address',
      'パワー': 'power',
      '垂直バット角度': 'vertical_bat_angle',
      'バット角度': 'bat_angle',
      'チーム名': 'team_name',
      'Team': 'team_name',
      'Direction': 'hc_x',
      'Bearing': 'hc_x',
      'HitDirection': 'hc_x',
      '打球方向': 'hc_x'
    };

    try {
      const dataArray = Array.isArray(dataObj.data) ? dataObj.data : [];
      const totalRows = dataArray.length;
      const batchSize = 500;
      const uploadId = dataObj.id || `up-${Date.now()}`;

      // UUID validation helper for Postgres uuid column compatibility
      const isUUID = (str) => {
        if (!str) return false;
        const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        return regex.test(str);
      };

      const validTeamId = isUUID(profile?.team_id) ? profile.team_id : null;
      const validOwnerId = isUUID(user?.id) ? user.id : null;

      console.log(`Starting cloud save for ${totalRows} rows to table ${table}...`);

      // Date parsing helper - flexible extraction of year/month/day
      const parseJapaneseDate = (dateStr) => {
        if (!dateStr || typeof dateStr !== 'string') return null;
        if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) return dateStr;
        
        const enMonthMap = {'jan':'01','feb':'02','mar':'03','apr':'04','may':'05','jun':'06','jul':'07','aug':'08','sep':'09','oct':'10','nov':'11','dec':'12'};
        
        try {
          const yearMatch = dateStr.match(/\b(20\d{2})\b/);
          const monMatch = dateStr.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i);
          if (yearMatch && monMatch) {
            const year = yearMatch[1];
            const month = enMonthMap[monMatch[1].toLowerCase()];
            const dayMatch = dateStr.match(/\b(\d{1,2})\b/);
            const day = dayMatch ? dayMatch[1].padStart(2, '0') : '01';
            return `${year}-${month}-${day}`;
          }
          
          let cleaned = dateStr;
          const months = ['12月','11月','10月','9月','8月','7月','6月','5月','4月','3月','2月','1月'];
          const monthMap = {'1月':'01','2月':'02','3月':'03','4月':'04','5月':'05','6月':'06','7月':'07','8月':'08','9月':'09','10月':'10','11月':'11','12月':'12'};
          months.forEach(m => { if (cleaned.includes(m)) cleaned = cleaned.replace(m, monthMap[m]); });
          const isPM = cleaned.includes('午後');
          cleaned = cleaned.replace('午前', '').replace('午後', '').trim();
          const parts = cleaned.split(/[\s,:]+/);
          if (parts.length >= 6) {
            const [month, day, year, hour, minute, second] = parts;
            let h = parseInt(hour);
            if (isPM && h < 12) h += 12;
            if (!isPM && h === 12) h = 0;
            return `${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}T${String(h).padStart(2,'0')}:${minute.padStart(2,'0')}:${second.padStart(2,'0')}`;
          }
        } catch (e) {
          console.warn("Date parse failed:", dateStr, e);
        }
        return null;
      };

      const insertRowsToTable = async (targetTable, targetColumns) => {
        for (let i = 0; i < totalRows; i += batchSize) {
          const batch = dataArray.slice(i, i + batchSize).map(row => {
            const filteredRow = {};
            
            Object.keys(row).forEach(key => {
              let targetKey = key;
              const normalizedKey = key.trim();
              
              const mapKey = Object.keys(COLUMN_MAP).find(k => normalizedKey === k || normalizedKey.includes(k) || k.includes(normalizedKey));
              if (mapKey) {
                targetKey = COLUMN_MAP[mapKey];
              }

              if (targetColumns.includes(targetKey)) {
                const val = row[key];
                
                const numericColumns = [
                  'launch_speed', 'launch_angle', 'bat_speed', 'attack_angle', 
                  'release_speed', 'release_spin_rate', 'hit_distance_sc', 
                  'time_to_contact', 'peak_hand_speed', 'power', 'vertical_bat_angle',
                  'spin_efficiency', 'gyro_angle', 'vb_traj', 'hb_traj', 'release_pos_x', 'release_pos_z', 'vaa'
                ];

                if (numericColumns.includes(targetKey)) {
                  if (val === '-' || val === '' || val === null || val === undefined) {
                    filteredRow[targetKey] = null;
                  } else {
                    const cleaned = String(val).replace(/[^-0-9.]/g, '');
                    const num = parseFloat(cleaned);
                    filteredRow[targetKey] = isNaN(num) ? null : num;
                  }
                } else {
                  filteredRow[targetKey] = val;
                }
              }
            });

            if (targetTable === 'blast_data') {
              if (!filteredRow.player_name) {
                filteredRow.player_name = filteredRow.batter_name || row['選手名'] || row['名前'] || row['Player Name'] || 'Unknown Player';
              }
            }
            if (targetTable === 'savant_data') {
              if (!filteredRow.batter_name) {
                filteredRow.batter_name = filteredRow.player_name || row['選手名'] || row['名前'] || row['Player Name'] || 'Unknown Player';
              }
            }
            if (targetTable === 'pitching_data') {
              if (!filteredRow.pitcher_name) {
                filteredRow.pitcher_name = filteredRow.player_name || row['投手名'] || row['投手'] || row['Pitcher Name'] || row['選手名'] || 'Unknown Pitcher';
              }
              if (!filteredRow.player_name) {
                filteredRow.player_name = filteredRow.pitcher_name;
              }
            }

            let finalRow = { ...filteredRow };
            if (finalRow.game_date) finalRow.game_date = parseJapaneseDate(finalRow.game_date);
            if (finalRow.date) finalRow.date = parseJapaneseDate(finalRow.date);

            const rowPayload = {
              ...finalRow,
              file_name: dataObj.filename,
              upload_id: uploadId
            };
            if (targetColumns.includes('team_id') && validTeamId) rowPayload.team_id = validTeamId;
            if (targetColumns.includes('owner_id') && validOwnerId) rowPayload.owner_id = validOwnerId;
            if (targetColumns.includes('updated_at')) rowPayload.updated_at = new Date().toISOString();

            return rowPayload;
          });

          const { error } = await client.from(targetTable).insert(batch);
          if (error) {
            console.error(`Error inserting into ${targetTable} at batch ${i}:`, error);
            throw error;
          }

          await new Promise(resolve => setTimeout(resolve, 100));
        }
      };

      if (type === 'savant') {
        await insertRowsToTable('savant_data', SAVANT_COLUMNS);
      } else if (type === 'blast') {
        await insertRowsToTable('blast_data', BLAST_COLUMNS);
      } else if (type === 'savant_pitching') {
        await insertRowsToTable('pitching_data', PITCHING_COLUMNS);
      } else {
        // combined: Save directly to dedicated baseball_data table in Supabase
        await insertRowsToTable('baseball_data', COMBINED_COLUMNS);
      }
      
      alert(`「${dataObj.filename}」(${totalRows.toLocaleString()}件)をクラウドに保存しました！`);
      setSyncState(prev => ({ ...prev, saving: false, lastSuccess: 'Saved!' }));
    } catch (err) {
      console.warn("Cloud save unavailable, fallback to local storage:", err);
      const currentFiles = type === 'savant' ? savantFiles : (type === 'blast' ? blastFiles : (type === 'savant_pitching' ? savantPitchingFiles : combinedFiles));
      const userKey = user?.id ? `user_${user.id}` : 'guest';
      await saveDatasetToLocalDB(`${userKey}_${type}`, currentFiles);
      alert(`「${dataObj.filename}」をクラウドへ保存中にエラーが発生したため、ローカル（ブラウザ）に保存しました。\n詳細: ${err?.message || err?.details || JSON.stringify(err)}`);
      setSyncState(prev => ({ ...prev, saving: false, lastSuccess: 'Local Saved' }));
    }
  };

  const fetchFromCloud = async () => {
    if (!user) return;
    setSyncState(prev => ({ ...prev, saving: true, lastError: null }));
    const client = getSupabase();
    
    try {
      console.log("Starting full sync from cloud...");
      
      // Fetch ALL rows with pagination (Supabase default limit is 1000)
      const fetchTable = async (table) => {
        const PAGE_SIZE = 1000;
        let allRows = [];
        let from = 0;
        let hasMore = true;

        while (hasMore) {
          let query = client.from(table).select('*').range(from, from + PAGE_SIZE - 1);
          const { data, error } = await query;
          if (error) {
            console.error(`Error fetching table ${table}:`, error);
            throw error;
          }
          const rows = data || [];
          allRows = allRows.concat(rows);
          if (rows.length < PAGE_SIZE) {
            hasMore = false; // Got fewer than a full page → done
          } else {
            from += PAGE_SIZE;
          }
        }
        console.log(`Fetched ${allRows.length} rows from ${table}`);
        return allRows;
      };

      const [savantRaw, blastRaw, combinedRaw, pitchingRaw] = await Promise.all([
        fetchTable('savant_data').catch(() => []),
        fetchTable('blast_data').catch(() => []),
        fetchTable('baseball_data').catch(() => []),
        fetchTable('pitching_data').catch(() => [])
      ]);

      const sRaw = Array.isArray(savantRaw) ? savantRaw : [];
      const bRaw = Array.isArray(blastRaw) ? blastRaw : [];
      const cRaw = Array.isArray(combinedRaw) ? combinedRaw : [];
      const pRaw = Array.isArray(pitchingRaw) ? pitchingRaw : [];

      // Helper to group flat rows into the "Files" format the app expects
      const groupIntoFiles = (rows, type) => {
        if (!Array.isArray(rows)) return [];
        const grouped = {};
        rows.forEach(row => {
          if (!row) return;
          const fileName = row.file_name || row.filename || 'Cloud Data';
          if (!grouped[fileName]) {
            grouped[fileName] = {
              id: row.upload_id || `cloud-${fileName}`,
              filename: fileName,
              updated_at: row.updated_at || row.created_at,
              data: [],
              headers: Object.keys(row).filter(k => !['id', 'owner_id', 'team_id', 'updated_at', 'upload_id'].includes(k))
            };
          }
          grouped[fileName].data.push(row);
        });
        return Object.values(grouped);
      };

      // Grouping logic for files
      const savantFileNames = new Set(sRaw.map(r => r?.file_name).filter(Boolean));
      const blastFileNames = new Set(bRaw.map(r => r?.file_name).filter(Boolean));
      
      const combinedFileNames = new Set();
      savantFileNames.forEach(name => {
        if (blastFileNames.has(name)) {
          combinedFileNames.add(name);
        }
      });
      sRaw.forEach(r => {
        if (r?.file_name && (r.bat_speed != null || r.attack_angle != null)) {
          combinedFileNames.add(r.file_name);
        }
      });

      // Construct combined dataset rows from sRaw & bRaw
      const combinedRawList = [...cRaw];
      combinedFileNames.forEach(name => {
        const sRows = sRaw.filter(r => r?.file_name === name);
        const bRows = bRaw.filter(r => r?.file_name === name);
        const maxLen = Math.max(sRows.length, bRows.length);
        for (let i = 0; i < maxLen; i++) {
          const s = sRows[i] || {};
          const b = bRows[i] || {};
          combinedRawList.push({
            ...b,
            ...s,
            player_name: s.batter_name || b.player_name || 'Unknown',
            batter_name: s.batter_name || b.player_name || 'Unknown',
            bat_speed: s.bat_speed ?? b.bat_speed,
            launch_speed: s.launch_speed ?? b.launch_speed,
            attack_angle: s.attack_angle ?? b.attack_angle,
            launch_angle: s.launch_angle ?? b.launch_angle,
            hit_distance_sc: s.hit_distance_sc ?? b.hit_distance_sc,
            date: s.game_date || b.date,
            game_date: s.game_date || b.date,
            file_name: name
          });
        }
      });

      const savantFilesCloud = groupIntoFiles(sRaw.filter(r => r?.file_name && !combinedFileNames.has(r.file_name)), 'savant');
      const blastFilesCloud = groupIntoFiles(bRaw.filter(r => r?.file_name && !combinedFileNames.has(r.file_name)), 'blast');
      const pitchingFilesCloud = groupIntoFiles(pRaw, 'savant_pitching');
      const combinedFilesCloud = groupIntoFiles(combinedRawList, 'combined');

      // Update cloud files for analysis views
      setCloudSavantFiles(savantFilesCloud);
      setCloudBlastFiles(blastFilesCloud);
      setCloudSavantPitchingFiles(pitchingFilesCloud);
      setCloudCombinedFiles(combinedFilesCloud);
      
      setSyncState(prev => ({ ...prev, saving: false, lastSuccess: 'Synced!' }));
      console.log("Cloud sync complete.");
    } catch (err) {
      /*
       * =========================================================================
       * 【元の仕様 (Supabase クラウド同期エラー処理)】
       * クラウドが一時停止・非接続時はローカルのIndexedDBデータを読み込んで利用
       * =========================================================================
       */
      console.warn("Cloud sync skipped (using local cached data):", err);
      setSyncState(prev => ({ ...prev, saving: false, lastError: "ローカルモード動作中" }));
    }
  };

  const updateDataState = async (type, payload, action = 'set') => {
    let setter, currentFiles;
    if (type === 'savant' || type === 'savant_hitting') { setter = setSavantFiles; currentFiles = savantFiles; }
    else if (type === 'savant_pitching' || type === 'pitcher') { setter = setSavantPitchingFiles; currentFiles = savantPitchingFiles; }
    else if (type === 'blast') { setter = setBlastFiles; currentFiles = blastFiles; }
    else if (type === 'combined') { setter = setCombinedFiles; currentFiles = combinedFiles; }
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
      
      // Prevent duplicate file entries by filename
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
        newFiles = newFiles.filter(f => f.id !== payload);
      }
    }

    setter(newFiles);
    const userKey = user?.id ? `user_${user.id}` : 'guest';
    await saveDatasetToLocalDB(`${userKey}_${type}`, newFiles);
  };

  // Helper to merge multiple files into one dataset for analysis views with strict data isolation
  const mergeFiles = (files) => {
    if (!Array.isArray(files) || files.length === 0) return null;

    const userTeam = profile?.team_id;
    const userTeamName = profile?.team_name;
    const userId = user?.id || profile?.id;

    const allHeaders = new Set();
    const safeRows = [];

    files.forEach(f => {
      if (f.headers) f.headers.forEach(h => allHeaders.add(h));
      if (Array.isArray(f.data)) {
        f.data.forEach(row => {
          // Strict check 1: If row has a team_id or team_name, it must match current user's team
          if (row.team_id && userTeam && String(row.team_id) !== String(userTeam)) {
            return; // Exclude data belonging to another team!
          }
          if (row.team_name && userTeamName && String(row.team_name) !== String(userTeamName)) {
            return; // Exclude data belonging to another team!
          }
          // Strict check 2: If row has an owner_id and no matching team, it must match userId
          if (row.owner_id && userId && String(row.owner_id) !== String(userId)) {
            if ((!row.team_id || !userTeam || String(row.team_id) !== String(userTeam)) &&
                (!row.team_name || !userTeamName || String(row.team_name) !== String(userTeamName))) {
              return; // Exclude data belonging to another owner!
            }
          }
          safeRows.push(row);
        });
      }
    });

    if (safeRows.length === 0) return null;

    return {
      headers: Array.from(allHeaders),
      data: safeRows
    };
  };

  const savantData = useMemo(() => mergeFiles([...savantFiles, ...cloudSavantFiles]), [savantFiles, cloudSavantFiles]);
  const savantPitchingData = useMemo(() => mergeFiles([...savantPitchingFiles, ...cloudSavantPitchingFiles]), [savantPitchingFiles, cloudSavantPitchingFiles]);
  const blastData = useMemo(() => mergeFiles([...blastFiles, ...cloudBlastFiles]), [blastFiles, cloudBlastFiles]);
  const combinedData = useMemo(() => mergeFiles([...combinedFiles, ...cloudCombinedFiles]), [combinedFiles, cloudCombinedFiles]);

  const renderActiveView = () => {
    const uploadProps = {
      savantFiles, savantPitchingFiles, blastFiles, combinedFiles, updateDataState,
      setActiveView, saveToCloud, syncState, profile, fetchFromCloud
    };
    switch (activeView) {
      case 'upload':   return <UploadPage {...uploadProps} />;
      case 'team':     return <TeamAnalysis savantData={savantData} blastData={blastData} combinedData={combinedData} onViewPlayer={(player, team, source) => { setAnalysisState({ player, team, source }); setActiveView('player'); }} />;
      case 'player':   return <PlayerAnalysis savantData={savantData} savantPitchingData={savantPitchingData} blastData={blastData} combinedData={combinedData} initialPlayer={analysisState.player} initialTeam={analysisState.team} initialSource={analysisState.source} />;
      case 'pitcher':  return <PitcherAnalysis savantData={savantPitchingData || savantData} blastData={blastData} combinedData={combinedData} initialPitcher={analysisState.pitcher} initialTeam={analysisState.team} initialSource={analysisState.source} onViewPlayer={(player, team, source) => { setAnalysisState({ player, team, source }); setActiveView('player'); }} />;
      case 'game':     return <GameStats savantData={savantData} blastData={blastData} combinedData={combinedData} />;
      case 'custom':   return <CustomCharts savantData={savantData} blastData={blastData} combinedData={combinedData} />;
      case 'cloud':    return <CloudDataManager updateDataState={updateDataState} profile={profile} syncState={syncState} fetchFromCloud={fetchFromCloud} />;
      case 'guide':    return <GuidePage setActiveView={setActiveView} />;
      case 'admin':    return profile?.role === 'admin' ? <AdminPanel /> : null;
      default:         return <UploadPage {...uploadProps} />;
    }
  };

  const handleViewChange = (view) => { setActiveView(view); setIsMenuOpen(false); };

  // Loading
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-slate-400 text-sm animate-pulse">読み込み中...</div>
      </div>
    );
  }

  // Not logged in → show login
  if (!user) return <LoginPage onLogin={handleLogin} />;

  const viewLabels = {
    upload: 'データ読み込み',
    cloud: 'クラウド管理',
    team: '打撃分析',
    pitcher: '投手分析',
    player: '個人分析',
    game: '試合スタッツ',
    custom: 'カスタムグラフ',
    guide: '使い方ガイド',
    admin: '管理者パネル'
  };

  return (
    <div className="main-layout">
      {isMenuOpen && <div className="sidebar-overlay fixed inset-0 bg-black/60 z-40 backdrop-blur-sm lg:hidden" onClick={() => setIsMenuOpen(false)} />}

      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-slate-900 border-b border-slate-800 z-50 flex items-center px-4 sm:px-6 justify-between shadow-xl">
        <div className="flex items-center gap-2">
          <h1 className="text-base sm:text-lg font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">
            Baseball Analyzer
          </h1>
          <span className="text-[10px] font-bold bg-blue-600/20 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded-full">
            {viewLabels[activeView] || '分析'}
          </span>
        </div>
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

      <Sidebar
        activeView={activeView}
        setActiveView={handleViewChange}
        savantData={savantData}
        savantPitchingData={savantPitchingData}
        blastData={blastData}
        combinedData={combinedData}
        savantFiles={savantFiles}
        savantPitchingFiles={savantPitchingFiles}
        blastFiles={blastFiles}
        combinedFiles={combinedFiles}
        isOpen={isMenuOpen}
        setIsOpen={setIsMenuOpen}
        syncState={syncState}
        profile={profile}
        onLogout={handleLogout}
      />

      <main className="content-area pt-20 lg:pt-10">
        <div className="max-container">
          {renderActiveView()}
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
    console.error("App Error Boundary caught an error:", error, errorInfo);
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
