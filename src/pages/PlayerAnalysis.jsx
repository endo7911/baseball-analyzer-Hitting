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
    if (initialSource) return initialSource;
    if (combinedData?.data?.length > 0) return 'combined';
    if (rapsodoMergedData?.data?.length > 0 || savantData?.data?.length > 0 || savantPitchingData?.data?.length > 0) return 'savant';
    if (blastData?.data?.length > 0) return 'blast';
    return 'combined';
  }, [initialSource, savantData, savantPitchingData, blastData, combinedData, rapsodoMergedData]);

  const [sourceType, setSourceType] = useState(defaultSource);
  const [analysisMode, setAnalysisMode] = useState('hitting'); // 'hitting' | 'pitching'

  // Auto-switch sourceType if activeData is empty but another source has data
  useEffect(() => {
    const active = sourceType === 'savant' ? (rapsodoMergedData || savantData || savantPitchingData) : sourceType === 'blast' ? blastData : combinedData;
    if (!active?.data?.length) {
      if (combinedData?.data?.length) setSourceType('combined');
      else if (rapsodoMergedData?.data?.length || savantData?.data?.length || savantPitchingData?.data?.length) setSourceType('savant');
      else if (blastData?.data?.length) setSourceType('blast');
    }
  }, [savantData, savantPitchingData, blastData, combinedData, sourceType, rapsodoMergedData]);

  const activeData = sourceType === 'savant' ? (rapsodoMergedData || savantData || savantPitchingData) : sourceType === 'blast' ? blastData : combinedData;
  
  const [teams, setTeams] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState(initialTeam || '');
  const [players, setPlayers] = useState([]);
  const [selectedPlayer, setSelectedPlayer] = useState(initialPlayer || '');
  const [playerStats, setPlayerStats] = useState(null);
  const [rawPlayerEvents, setRawPlayerEvents] = useState([]);
  const [nameKey, setNameKey] = useState('player_name');
  const [groupedData, setGroupedData] = useState({});
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

      if (sourceType === 'savant') {
        sEvents = events;
      } else if (sourceType === 'blast') {
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
          <div className="bg-slate-900/50 p-1 rounded-2xl border border-blue-500/20 flex self-start md:self-center">
            <button onClick={() => setSourceType('combined')} className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${sourceType === 'combined' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>統合データ</button>
            <button onClick={() => setSourceType('savant')} className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${sourceType === 'savant' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>Rapsodo</button>
            <button onClick={() => setSourceType('blast')} className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${sourceType === 'blast' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>Blast</button>
          </div>
        </div>
        
        <div className={`grid grid-cols-1 ${teams.length === 1 && teams[0] === 'Unknown Team' ? 'lg:grid-cols-2' : 'lg:grid-cols-3'} gap-8`}>
          <div>
            <label className="block text-sm font-bold text-blue-400 mb-2 uppercase tracking-widest">
              1. 名前として使用する列
            </label>
            <p className="text-xs text-slate-500 mb-3">※「Player Name」や「選手名」が自動選択されます</p>
            <select
              value={nameKey}
              onChange={(e) => setNameKey(e.target.value)}
              className="w-full bg-slate-900 border-2 border-blue-500/20 hover:border-blue-500/50 text-white rounded-xl p-4 focus:ring-4 focus:ring-blue-500/20 outline-none transition-all font-bold text-lg"
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

          {teams.length > 1 || teams[0] !== 'Unknown Team' ? (
            <div>
              <label className="block text-sm font-bold text-blue-400 mb-2 uppercase tracking-widest">
                2. チーム選択
              </label>
              <p className="text-xs text-slate-500 mb-3">分析対象のチームを選択してください</p>
              <select
                value={selectedTeam}
                onChange={(e) => setSelectedTeam(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 hover:border-slate-500 text-white rounded-xl p-4 focus:ring-4 focus:ring-blue-500/20 outline-none transition-all font-bold text-lg"
              >
                {teams.map((team, idx) => (
                  <option key={idx} value={team}>{team}</option>
                ))}
              </select>
            </div>
          ) : null}

          <div>
            <label className="block text-sm font-bold text-blue-400 mb-2 uppercase tracking-widest">
              {teams.length === 1 && teams[0] === 'Unknown Team' ? '2. 選手選択' : '3. 選手選択'}
            </label>
            <p className="text-xs text-slate-500 mb-3">分析する選手を選択してください</p>
            <select
              value={selectedPlayer}
              onChange={(e) => setSelectedPlayer(e.target.value)}
              disabled={!selectedTeam || players.length === 0}
              className="w-full bg-slate-900 border border-slate-700 hover:border-slate-500 text-white rounded-xl p-4 focus:ring-4 focus:ring-blue-500/20 outline-none transition-all text-lg disabled:opacity-30 disabled:cursor-not-allowed font-bold"
            >
              {players.map((player, idx) => (
                <option key={idx} value={player}>{player}</option>
              ))}
            </select>
          </div>
        </div>

        {teams.length === 1 && teams[0] === 'Unknown Team' && (
          <div className="mt-4 pt-3 border-t border-blue-500/20 flex items-center gap-2 text-xs text-slate-400">
            <Info className="w-4 h-4 text-blue-400 flex-shrink-0" />
            <span>CSVにチーム列が含まれていないため、自動的に全データをまとめて表示しています。</span>
          </div>
        )}
      </div>

      {/* Selected Player Report Area */}
      {selectedPlayer && rawPlayerEvents.length > 0 ? (
        <div className="space-y-6">
          {/* Mode Switcher: Rendered ONLY if SHOW_PITCHER_MODULE is true AND player has BOTH hitting and pitching data! */}
          {SHOW_PITCHER_MODULE && playerCapabilities.isDual && (
            <div className="flex items-center justify-between bg-slate-900/80 border border-blue-500/30 p-4 rounded-2xl print:hidden">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-blue-400 uppercase tracking-wider">二刀流選手データ検出:</span>
                <span className="text-xs text-slate-300 font-semibold">投打両方の測定データが存在します。表示するレポートを選択してください</span>
              </div>
              <div className="bg-slate-950 p-1 rounded-xl border border-slate-800 flex items-center">
                <button
                  onClick={() => setAnalysisMode('hitting')}
                  className={`px-4 py-2 rounded-lg text-xs font-black flex items-center gap-1.5 transition-all ${
                    analysisMode === 'hitting'
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Activity className="w-3.5 h-3.5" /> 打撃レポート
                </button>
                <button
                  onClick={() => setAnalysisMode('pitching')}
                  className={`px-4 py-2 rounded-lg text-xs font-black flex items-center gap-1.5 transition-all ${
                    analysisMode === 'pitching'
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Target className="w-3.5 h-3.5" /> 投手レポート
                </button>
              </div>
            </div>
          )}

          {SHOW_PITCHER_MODULE && analysisMode === 'pitching' ? (
            <PitcherProfile pitcherName={selectedPlayer} events={rawPlayerEvents} />
          ) : (
            <PlayerProfile playerName={selectedPlayer} stats={playerStats} isCombined={sourceType === 'combined'} />
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
