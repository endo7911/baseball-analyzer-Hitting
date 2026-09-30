import React, { useState, useEffect, useMemo } from 'react';
import { 
  extractTeams, 
  extractPlayersByTeam, 
  getPlayerStats, 
  groupEventsByTeamAndPlayer, 
  EV_KEYS, 
  BS_KEYS, 
  LA_KEYS, 
  AA_KEYS, 
  PITCH_VELO_KEYS,
  SPIN_RATE_KEYS,
  VB_TRAJ_KEYS,
  HB_TRAJ_KEYS,
  PITCH_TYPE_KEYS,
  getDataValue 
} from '../utils/dataHelpers';
import PlayerProfile from '../components/PlayerProfile';
import PitcherProfile from '../components/PitcherProfile';
import { Users, User, Settings2, Info, Target, Activity } from 'lucide-react';
import { SHOW_PITCHER_MODULE } from '../config';

function PlayerAnalysis({ savantData, savantPitchingData, blastData, combinedData, initialPlayer, initialTeam, initialSource }) {
  const rapsodoMergedData = useMemo(() => {
    const sRows = savantData?.data || [];
    const pRows = savantPitchingData?.data || [];
    if (sRows.length === 0 && pRows.length === 0) return null;
    const combinedHeaders = Array.from(new Set([...(savantData?.headers || []), ...(savantPitchingData?.headers || [])]));
    return {
      headers: combinedHeaders,
      data: [...sRows, ...pRows]
    };
  }, [savantData, savantPitchingData]);

  const defaultSource = useMemo(() => {
    if (initialSource === 'savant') {
      // Legacy: auto-detect which Rapsodo data exists
      if (savantData?.data?.length > 0) return 'rapsodo_batting';
      if (savantPitchingData?.data?.length > 0) return 'rapsodo_pitching';
    }
    if (initialSource && initialSource !== 'savant') return initialSource;
    if (combinedData?.data?.length > 0) return 'combined';
    if (savantData?.data?.length > 0) return 'rapsodo_batting';
    if (savantPitchingData?.data?.length > 0) return 'rapsodo_pitching';
    if (blastData?.data?.length > 0) return 'blast';
    return 'combined';
  }, [initialSource, savantData, savantPitchingData, blastData, combinedData]);

  const [sourceType, setSourceType] = useState(defaultSource);
  const [analysisMode, setAnalysisMode] = useState('hitting'); // 'hitting' | 'pitching'

  // Auto-switch sourceType if activeData is empty but another source has data
  useEffect(() => {
    const getActive = (t) => {
      if (t === 'rapsodo_batting') return savantData?.data?.length ? savantData : combinedData;
      if (t === 'rapsodo_pitching') return savantPitchingData;
      if (t === 'blast') return blastData?.data?.length ? blastData : combinedData;
      return combinedData?.data?.length ? combinedData : savantData;
    };
    const active = getActive(sourceType);
    if (!active?.data?.length) {
      if (combinedData?.data?.length && analysisMode !== 'pitching') setSourceType('combined');
      else if (savantData?.data?.length) setSourceType('rapsodo_batting');
      else if (savantPitchingData?.data?.length) setSourceType('rapsodo_pitching');
      else if (blastData?.data?.length) setSourceType('blast');
    }
  }, [savantData, savantPitchingData, blastData, combinedData, sourceType, analysisMode]);

  const activeData = useMemo(() => {
    if (analysisMode === 'pitching' || sourceType === 'rapsodo_pitching') {
      return savantPitchingData?.data?.length ? savantPitchingData : (rapsodoMergedData || combinedData);
    }
    if (sourceType === 'rapsodo_batting') {
      return savantData?.data?.length ? savantData : combinedData;
    }
    if (sourceType === 'blast') {
      return blastData?.data?.length ? blastData : combinedData;
    }
    return combinedData?.data?.length ? combinedData : (savantData?.data?.length ? savantData : blastData);
  }, [analysisMode, sourceType, savantData, savantPitchingData, blastData, combinedData, rapsodoMergedData]);
  
  const [teams, setTeams] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState(initialTeam || '');
  const [players, setPlayers] = useState([]);
  const [selectedPlayer, setSelectedPlayer] = useState(initialPlayer || '');
  const [playerStats, setPlayerStats] = useState(null);
  const [rawPlayerEvents, setRawPlayerEvents] = useState([]);
  const [nameKey, setNameKey] = useState('player_name');
  const [groupedData, setGroupedData] = useState({});
  const [profileStartDate, setProfileStartDate] = useState('');
  const [profileEndDate, setProfileEndDate] = useState('');
  const [showNameKeyConfig, setShowNameKeyConfig] = useState(false);
  const headers = useMemo(() => {
    const set = new Set(activeData?.headers || []);
    if (activeData?.data && activeData.data.length > 0) {
      const limit = Math.min(activeData.data.length, 20);
      for (let i = 0; i < limit; i++) {
        if (activeData.data[i]) Object.keys(activeData.data[i]).forEach(k => set.add(k));
      }
    }
    return Array.from(set);
  }, [activeData]);

  useEffect(() => {
    if (activeData && activeData.data && activeData.data.length > 0) {
      const teamCandidates = ['チーム名', 'チーム', 'Team', 'team_name', 'home_team', 'away_team', 'Unknown Team'];
      const teamKey = headers.find(h => teamCandidates.includes(h)) || 'Unknown Team';

      const candidates = [
        '選手名', '名前', 'Player Name', 'pitcher_name', 'Pitcher Name', 'Pitcher', 
        'batter_name', 'player_name', 'PlayerName', '氏名', 'batter', 'pitcher', 'name', 'Name'
      ];
      
      let bestNameKey = nameKey;
      let bestRank = Infinity;

      headers.forEach(h => {
        const rank = candidates.indexOf(h);
        if (rank !== -1 && rank < bestRank) {
          bestRank = rank;
          bestNameKey = h;
        }
      });

      if (bestRank === Infinity && headers.length > 0) {
        bestNameKey = headers[0];
      }

      if (bestNameKey !== nameKey) {
        setNameKey(bestNameKey);
      }

      const grouped = groupEventsByTeamAndPlayer(activeData.data, teamKey, bestNameKey);
      setGroupedData(grouped);
      const availableTeams = Object.keys(grouped).sort();
      setTeams(availableTeams);
      
      if (availableTeams.length > 0) {
        if (initialTeam && grouped[initialTeam]) {
          setSelectedTeam(initialTeam);
        } else if (!selectedTeam || !grouped[selectedTeam]) {
          setSelectedTeam(availableTeams[0]);
        }
      }
    }
  }, [activeData, nameKey, initialTeam, headers]);

  useEffect(() => {
    if (selectedTeam && groupedData[selectedTeam]) {
      const teamPlayers = Object.keys(groupedData[selectedTeam]).sort();
      setPlayers(teamPlayers);
      
      if (selectedPlayer && teamPlayers.includes(selectedPlayer)) {
        // retain
      } else if (initialPlayer && teamPlayers.includes(initialPlayer)) {
        setSelectedPlayer(initialPlayer);
      } else if (teamPlayers.length > 0) {
        // Auto-select first available player!
        setSelectedPlayer(teamPlayers[0]);
      } else {
        setSelectedPlayer('');
        setPlayerStats(null);
        setRawPlayerEvents([]);
      }
    }
  }, [selectedTeam, groupedData, initialPlayer]);

  useEffect(() => {
    if (selectedPlayer && selectedTeam && groupedData[selectedTeam] && groupedData[selectedTeam][selectedPlayer]) {
      const events = groupedData[selectedTeam][selectedPlayer];
      setRawPlayerEvents(events);

      let sEvents = [];
      let bEvents = [];

      if (sourceType === 'savant' || sourceType === 'rapsodo_batting') {
        sEvents = events;
        bEvents = [];
      } else if (sourceType === 'blast') {
        sEvents = [];
        bEvents = events;
      } else {
        events.forEach(e => {
          const hasBat = getDataValue(e, BS_KEYS) > 0 || getDataValue(e, AA_KEYS) !== 0;
          const hasBall = getDataValue(e, EV_KEYS) > 0 || getDataValue(e, LA_KEYS) !== 0 || e.events;
          if (hasBall || !hasBat) sEvents.push(e);
          if (hasBat || !hasBall) bEvents.push(e);
        });
      }

      setPlayerStats({
        savantEvents: sEvents,
        blastEvents: bEvents
      });
    }
  }, [selectedPlayer, selectedTeam, groupedData, sourceType]);

  // Inspect if selected player has hitting data, pitching data, or BOTH (dual)
  const playerCapabilities = useMemo(() => {
    if (!rawPlayerEvents || rawPlayerEvents.length === 0) {
      return { hasHitting: false, hasPitching: false, isDual: false };
    }

    let hasHitting = false;
    let hasPitching = false;

    for (const row of rawPlayerEvents) {
      if (
        getDataValue(row, EV_KEYS) > 0 || 
        getDataValue(row, BS_KEYS) > 0 || 
        getDataValue(row, LA_KEYS) !== 0 ||
        (row.events && String(row.events).trim() !== '')
      ) {
        hasHitting = true;
      }

      if (
        getDataValue(row, PITCH_VELO_KEYS) > 0 || 
        getDataValue(row, SPIN_RATE_KEYS) > 0 || 
        getDataValue(row, VB_TRAJ_KEYS) !== 0 ||
        getDataValue(row, HB_TRAJ_KEYS) !== 0 ||
        (row[PITCH_TYPE_KEYS[0]] || row['pitch_type'] || row['球種'])
      ) {
        hasPitching = true;
      }

      if (hasHitting && hasPitching) break;
    }

    return {
      hasHitting,
      hasPitching,
      isDual: hasHitting && hasPitching
    };
  }, [rawPlayerEvents]);

  // Automatically adjust mode if player only has pitching or only has hitting
  useEffect(() => {
    if (!SHOW_PITCHER_MODULE) {
      setAnalysisMode('hitting');
    } else if (playerCapabilities.hasPitching && !playerCapabilities.hasHitting) {
      setAnalysisMode('pitching');
    } else if (playerCapabilities.hasHitting && !playerCapabilities.hasPitching) {
      setAnalysisMode('hitting');
    }
  }, [playerCapabilities]);

  const nameHeaderOptions = useMemo(() => {
    if (!headers || headers.length === 0) return [];
    const candidateList = ['選手名', '名前', 'Player Name', 'pitcher_name', 'Pitcher Name', 'Pitcher', 'batter_name', 'player_name', 'PlayerName', '氏名', 'batter', 'pitcher', 'name', 'Name'];
    const matched = candidateList.filter(c => headers.includes(c));
    const remaining = headers.filter(h => !matched.includes(h));
    return [...matched, ...remaining];
  }, [headers]);

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <header className="mb-6 print:hidden">
        <h2 className="text-4xl font-extrabold text-white mb-2 flex items-center gap-3">
          <User className="w-10 h-10 text-blue-400" /> 個人分析
        </h2>
        <p className="text-slate-400 text-lg">選手を選択して個人の打撃レポートを表示します。</p>
      </header>

      {/* Analysis Settings Card */}
      <div className="bg-blue-900/10 border-2 border-blue-500/30 p-8 rounded-3xl mb-8 shadow-2xl backdrop-blur-sm print:hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex items-center text-blue-300">
            <Settings2 className="w-6 h-6 mr-2" />
            <h3 className="text-xl font-bold">分析設定</h3>
          </div>
          <div className="bg-slate-900/50 p-1 rounded-2xl border border-blue-500/20 flex flex-wrap self-start md:self-center gap-0.5">
            {combinedData?.data?.length > 0 && (
              <button onClick={() => { setSourceType('combined'); setAnalysisMode('hitting'); }} className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${analysisMode === 'hitting' && sourceType === 'combined' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}>統合データ</button>
            )}
            {(savantData?.data?.length > 0 || combinedData?.data?.length > 0) && (
              <button onClick={() => { setSourceType('rapsodo_batting'); setAnalysisMode('hitting'); }} className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${analysisMode === 'hitting' && sourceType === 'rapsodo_batting' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}>Rapsodo 打撃</button>
            )}
            {(blastData?.data?.length > 0 || combinedData?.data?.length > 0) && (
              <button onClick={() => { setSourceType('blast'); setAnalysisMode('hitting'); }} className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${analysisMode === 'hitting' && sourceType === 'blast' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}>Blast</button>
            )}
            {savantPitchingData?.data?.length > 0 && (
              <button onClick={() => { setSourceType('rapsodo_pitching'); setAnalysisMode('pitching'); }} className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${analysisMode === 'pitching' ? 'bg-purple-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}>Rapsodo 投手</button>
            )}
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-bold text-blue-400 uppercase tracking-widest">
                1. チーム選択
              </label>
              <button 
                onClick={() => setShowNameKeyConfig(!showNameKeyConfig)} 
                className="text-[11px] text-slate-500 hover:text-blue-400 transition-colors cursor-pointer"
              >
                ⚙️ {showNameKeyConfig ? '名前列設定を閉じる' : '名前の列を変更'}
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-3">分析対象のチームを選択してください</p>
            <select
              value={selectedTeam}
              onChange={(e) => setSelectedTeam(e.target.value)}
              className="w-full bg-slate-900 border-2 border-blue-500/20 hover:border-blue-500/50 text-white rounded-xl p-4 focus:ring-4 focus:ring-blue-500/20 outline-none transition-all font-bold text-lg"
            >
              {teams.length === 0 || (teams.length === 1 && teams[0] === 'Unknown Team') ? (
                <option value="Unknown Team">全チーム (チーム指定なし)</option>
              ) : (
                teams.map((team, idx) => (
                  <option key={idx} value={team}>{team}</option>
                ))
              )}
            </select>
          </div>

          <div>
            <label className="block text-sm font-bold text-blue-400 mb-2 uppercase tracking-widest">
              2. 選手選択
            </label>
            <p className="text-xs text-slate-500 mb-3">分析する選手を選択してください</p>
            <select
              value={selectedPlayer}
              onChange={(e) => setSelectedPlayer(e.target.value)}
              disabled={!selectedTeam || players.length === 0}
              className="w-full bg-slate-900 border-2 border-blue-500/20 hover:border-blue-500/50 text-white rounded-xl p-4 focus:ring-4 focus:ring-blue-500/20 outline-none transition-all text-lg disabled:opacity-30 disabled:cursor-not-allowed font-bold"
            >
              {players.map((player, idx) => (
                <option key={idx} value={player}>{player}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Collapsible Name Key Advanced Config */}
        {showNameKeyConfig && (
          <div className="mt-4 p-4 bg-slate-900/80 border border-blue-500/30 rounded-2xl animate-in fade-in duration-200">
            <label className="block text-xs font-bold text-blue-300 mb-1">
              名前として使用する列 (アドバンスド設定)
            </label>
            <p className="text-[11px] text-slate-500 mb-2">※CSV内の選手名が正しく認識されない場合は列を変更してください</p>
            <select
              value={nameKey}
              onChange={(e) => setNameKey(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2.5 text-sm font-bold"
            >
              {nameHeaderOptions.map((h, idx) => {
                const labels = {
                  '選手名': '選手名（打撃/個人）',
                  '名前': '名前（氏名）',
                  'Player Name': 'Player Name',
                  'pitcher_name': '投手名 (Pitcher)',
                  'batter_name': '打者名 (Batter)',
                  'player_name': 'player_name'
                };
                return (
                  <option key={idx} value={h}>
                    {labels[h] || h}
                  </option>
                );
              })}
            </select>
          </div>
        )}

        {teams.length === 1 && teams[0] === 'Unknown Team' && (
          <div className="mt-4 pt-3 border-t border-blue-500/20 flex items-center gap-2 text-xs text-slate-400">
            <Info className="w-4 h-4 text-blue-400 flex-shrink-0" />
            <span>※CSVにチーム列が含まれていないため「全チーム (チーム指定なし)」として表示しています。</span>
          </div>
        )}

        <div className="mt-6 pt-5 border-t border-blue-500/20">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="text-xs font-bold text-blue-300 uppercase tracking-widest whitespace-nowrap">📅 日付範囲:</span>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="date"
                value={profileStartDate}
                onChange={e => setProfileStartDate(e.target.value)}
                className="bg-slate-900 border border-slate-700 text-white text-xs font-bold rounded-lg px-2 py-1.5 outline-none focus:ring-1 focus:ring-blue-500 w-[140px] sm:w-auto"
              />
              <span className="text-xs text-slate-500">〜</span>
              <input
                type="date"
                value={profileEndDate}
                onChange={e => setProfileEndDate(e.target.value)}
                className="bg-slate-900 border border-slate-700 text-white text-xs font-bold rounded-lg px-2 py-1.5 outline-none focus:ring-1 focus:ring-blue-500 w-[140px] sm:w-auto"
              />
              {(profileStartDate || profileEndDate) && (
                <button
                  onClick={() => { setProfileStartDate(''); setProfileEndDate(''); }}
                  className="text-[11px] text-blue-400 hover:text-blue-300 font-bold underline"
                >
                  全期間
                </button>
              )}
            </div>
            {(profileStartDate || profileEndDate) && (
              <span className="text-[11px] text-amber-400 font-bold w-full sm:w-auto">
                ※ {profileStartDate || '最初'} 〜 {profileEndDate || '最新'} のデータを表示中
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Selected Player Report Area */}
      {selectedPlayer && rawPlayerEvents.length > 0 ? (
        <div className="space-y-6">
          {SHOW_PITCHER_MODULE && analysisMode === 'pitching' ? (
            <PitcherProfile pitcherName={selectedPlayer} events={rawPlayerEvents} startDate={profileStartDate} endDate={profileEndDate} />
          ) : (
            <PlayerProfile playerName={selectedPlayer} stats={playerStats} isCombined={sourceType === 'combined'} sourceType={sourceType} startDate={profileStartDate} endDate={profileEndDate} />
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500 border-2 border-dashed border-slate-700 rounded-2xl bg-slate-800/30">
          <User className="w-16 h-16 mb-4 opacity-30" />
          <p className="text-lg font-bold">データを読み込むか、上のメニューから選手を選択してください</p>
        </div>
      )}
    </div>
  );
}

export default PlayerAnalysis;
