import React, { useState, useEffect, useMemo } from 'react';
import { extractTeams, extractPlayersByTeam, getPlayerStats, calculateAverages, calculateMax, groupEventsByTeamAndPlayer, parseNumeric, getDataValue, EV_KEYS, BS_KEYS, LA_KEYS, AA_KEYS } from '../utils/dataHelpers';
import { ScatterChart, Scatter, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell, LabelList } from 'recharts';
import { Users, TrendingUp, Zap, BarChart3, Eye } from 'lucide-react';

function TeamAnalysis({ savantData, blastData, combinedData, onViewPlayer }) {
  const [sourceType, setSourceType] = useState('savant');
  const activeData = sourceType === 'savant' ? savantData : sourceType === 'blast' ? blastData : combinedData;

  useEffect(() => {
    const savantCount = savantData?.data?.length || 0;
    const blastCount = blastData?.data?.length || 0;
    const combinedCount = combinedData?.data?.length || 0;

    if (savantCount === 0 && blastCount === 0 && combinedCount > 0 && sourceType !== 'combined') {
      setSourceType('combined');
    }
  }, [savantData, blastData, combinedData]);
  
  const [teams, setTeams] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState('');
  const [nameKey, setNameKey] = useState('player_name');

  const headers = activeData ? activeData.headers : [];
  
  // Detect what data is available to show only relevant stats
  const hasBatData = headers.some(h => BS_KEYS.some(k => h.toLowerCase().includes(k.toLowerCase())));
  const hasBallData = headers.some(h => EV_KEYS.some(k => h.toLowerCase().includes(k.toLowerCase())));
  const hasAttackAngle = headers.some(h => AA_KEYS.some(k => h.toLowerCase().includes(k.toLowerCase())));

  useEffect(() => {
    if (activeData && activeData.data) {
      // Rank candidates: lower index = higher priority
      const candidates = ['選手名', '名前', 'Player Name', 'batter_name', 'player_name', 'PlayerName', '氏名', 'pitcher_name', 'batter', 'pitcher'];
      
      let bestNameKey = nameKey;
      let bestRank = Infinity;

      // Find the header with the best (lowest) rank in candidates
      headers.forEach(h => {
        const rank = candidates.indexOf(h);
        if (rank !== -1 && rank < bestRank) {
          bestRank = rank;
          bestNameKey = h;
        }
      });

      if (bestNameKey !== nameKey) {
        setNameKey(bestNameKey);
      }
    }
  }, [activeData, nameKey, headers]);

  const [hitsOnly, setHitsOnly] = useState(false);
  const [laRange, setLaRange] = useState([-90, 90]);
  const [groupedData, setGroupedData] = useState({});
  const [activePlayers, setActivePlayers] = useState([]);

  useEffect(() => {
    if (activeData && activeData.data) {
      // Determine best teamKey - Prioritize 'Team' as requested
      const teamCandidates = ['チーム名', 'チーム', 'Team', 'team_name', 'home_team', 'away_team', 'Unknown Team'];
      const teamKey = headers.find(h => teamCandidates.includes(h)) || 'Unknown Team';
      
      const grouped = groupEventsByTeamAndPlayer(activeData.data, teamKey, nameKey);
      setGroupedData(grouped);
      const newTeams = Object.keys(grouped).sort();
      setTeams(newTeams);
      if (!selectedTeam && newTeams.length > 0) setSelectedTeam(newTeams[0]);
    }
  }, [activeData, nameKey, headers]);

  useEffect(() => {
    if (selectedTeam && groupedData[selectedTeam]) {
      const teamPlayers = Object.keys(groupedData[selectedTeam]);
      if (activePlayers.length === 0 || !activePlayers.some(p => teamPlayers.includes(p))) {
        setActivePlayers(teamPlayers);
      }
    }
  }, [selectedTeam, groupedData]);

  const statsList = useMemo(() => {
    if (!selectedTeam || !groupedData[selectedTeam]) return [];
    
    const teamPlayers = groupedData[selectedTeam];
    
    const list = Object.keys(teamPlayers).map(player => {
      const events = teamPlayers[player];
      if (!events || !Array.isArray(events)) return null;

      const filteredEvents = events.filter(e => {
        if (!e) return false;
        const isHitEvent = e.events && typeof e.events === 'string' && ['single', 'double', 'triple', 'home_run'].includes(e.events.toLowerCase());
        const la = getDataValue(e, LA_KEYS);
        const passHits = hitsOnly ? isHitEvent : true;
        const passLa = !isNaN(la) ? (la >= laRange[0] && la <= laRange[1]) : true;
        return passHits && passLa;
      });

      if (filteredEvents.length === 0) return null;

      return {
        player,
        avgBatSpeed: Number(calculateAverages(filteredEvents, BS_KEYS)),
        maxBatSpeed: Number(calculateMax(filteredEvents, BS_KEYS)),
        avgAttackAngle: Number(calculateAverages(filteredEvents, AA_KEYS)),
        avgExitVelo: Number(calculateAverages(filteredEvents, EV_KEYS)),
        maxExitVelo: Number(calculateMax(filteredEvents, EV_KEYS)),
        avgLaunchAngle: Number(calculateAverages(filteredEvents, LA_KEYS)),
        swings: filteredEvents.length
      };
    }).filter(Boolean);

    list.sort((a, b) => (b.avgBatSpeed || 0) - (a.avgBatSpeed || 0));
    return list;
  }, [selectedTeam, groupedData, hitsOnly, laRange]);

  const teamStats = useMemo(() => {
    if (!selectedTeam || !groupedData[selectedTeam] || statsList.length === 0) return null;

    const teamPlayers = groupedData[selectedTeam];
    const currentFilter = activePlayers.length > 0 ? activePlayers : Object.keys(teamPlayers);
    const activeStats = statsList.filter(s => currentFilter.includes(s.player));

    const teamAvgBatSpeed = activeStats.length > 0 ? (activeStats.reduce((acc, s) => acc + (s.avgBatSpeed || 0), 0) / activeStats.length).toFixed(1) : 0;
    const teamAvgAttackAngle = activeStats.length > 0 ? (activeStats.reduce((acc, s) => acc + (s.avgAttackAngle || 0), 0) / activeStats.length).toFixed(1) : 0;
    const teamAvgExitVelo = activeStats.length > 0 ? (activeStats.reduce((acc, s) => acc + (s.avgExitVelo || 0), 0) / activeStats.length).toFixed(1) : 0;
    const teamAvgLaunchAngle = activeStats.length > 0 ? (activeStats.reduce((acc, s) => acc + (s.avgLaunchAngle || 0), 0) / activeStats.length).toFixed(1) : 0;

    return {
      allPlayers: statsList,
      players: activeStats,
      teamAvgBatSpeed,
      teamAvgAttackAngle,
      teamAvgExitVelo,
      teamAvgLaunchAngle
    };
  }, [selectedTeam, groupedData, statsList, activePlayers]);

  // Generate colors for scatter plot points
  const COLORS = [
    '#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', 
    '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
    '#06b6d4', '#d946ef', '#f43f5e', '#eab308', '#22c55e',
    '#a855f7', '#0ea5e9', '#f87171', '#34d399', '#fbbf24'
  ];

  return (
    <div className="animate-in fade-in duration-300">
      <header className="mb-8">
        <h2 className="text-3xl font-extrabold text-white mb-2">チーム分析</h2>
        <p className="text-slate-400">チーム全体の傾向や、選手同士の比較を行います。</p>
      </header>

      <div className="bg-blue-900/10 border-2 border-blue-500/30 p-8 rounded-3xl mb-10 shadow-2xl backdrop-blur-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-8">
          <div>
            <label className="block text-sm font-bold text-emerald-400 mb-2 uppercase tracking-widest">
              0. 分析に使用するデータ
            </label>
            <select
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value)}
              className="w-full bg-slate-900 border-2 border-emerald-500/20 text-white rounded-xl p-4 focus:ring-4 focus:ring-emerald-500/20 outline-none transition-all font-bold"
            >
              <option value="savant">Rapsodo Data</option>
              <option value="blast">Blast Data</option>
              <option value="combined">Combined Data</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold text-blue-400 mb-2 uppercase tracking-widest">
              1. 名前として使用する列
            </label>
            <p className="text-xs text-slate-500 mb-3">※野手分析時はID（batter等）を選択してください</p>
            <select
              value={nameKey}
              onChange={(e) => setNameKey(e.target.value)}
              className="w-full bg-slate-900 border-2 border-blue-500/20 hover:border-blue-500/50 text-white rounded-xl p-4 focus:ring-4 focus:ring-blue-500/20 outline-none transition-all font-bold text-lg"
            >
              {/* 名前として有効な列のみ表示 */}
              {['Player Name', 'player_name', 'PlayerName', '選手名', '氏名', 'batter_name', 'pitcher_name', 'batter', 'pitcher']
                .filter(h => headers.includes(h))
                .map((h, idx) => {
                  const labels = {
                    'Player Name': '選手名 (Player Name)',
                    'player_name': '選手名 (player_name)',
                    'PlayerName': '選手名 (PlayerName)',
                    '選手名': '選手名',
                    '氏名': '氏名',
                    'batter_name': '打者名 (Batter)',
                    'pitcher_name': '投手名 (Pitcher)',
                    'batter': 'batter (ID)',
                    'pitcher': 'pitcher (ID)'
                  };
                  return <option key={idx} value={h}>{labels[h] || h}</option>;
                })}
            </select>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-400 mb-2 uppercase tracking-widest">
              2. 対象チーム
            </label>
            <p className="text-xs text-slate-500 mb-3 invisible">spacer</p>
            <select
              value={selectedTeam}
              onChange={(e) => setSelectedTeam(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 hover:border-slate-500 text-white rounded-xl p-4 focus:ring-4 focus:ring-blue-500/20 outline-none transition-all text-lg"
            >
              <option value="">-- チームを選択 --</option>
              {teams.map((team, idx) => (
                <option key={idx} value={team}>{team}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-400 mb-2 uppercase tracking-widest">
              3. 表示設定
            </label>
            <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-700 h-[60px] items-center px-4">
              <button 
                onClick={() => setHitsOnly(false)}
                className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${!hitsOnly ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}
              >
                全スイング
              </button>
              <button 
                onClick={() => setHitsOnly(true)}
                className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${hitsOnly ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}
              >
                安打のみ
              </button>
            </div>
          </div>
        </div>

        {/* LA Range Filter (Added) */}
        <div className="mt-8 pt-8 border-t border-blue-500/20">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-bold text-slate-300">チーム分析 Launch Angle 調整: <span className="text-blue-400 font-mono">{laRange[0]}° ~ {laRange[1]}°</span></span>
                <button onClick={() => setLaRange([-90, 90])} className="text-xs text-slate-500 hover:text-white">リセット</button>
              </div>
              <div className="relative h-2 bg-slate-700 rounded-full">
                <input 
                  type="range" min="-90" max="90" value={laRange[0]} 
                  onChange={(e) => setLaRange([Math.min(Number(e.target.value), laRange[1]), laRange[1]])}
                  className="absolute w-full h-full appearance-none bg-transparent pointer-events-none z-10 [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:rounded-full" 
                />
                <input 
                  type="range" min="-90" max="90" value={laRange[1]} 
                  onChange={(e) => setLaRange([laRange[0], Math.max(Number(e.target.value), laRange[0])])}
                  className="absolute w-full h-full appearance-none bg-transparent pointer-events-none z-10 [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-blue-400 [&::-webkit-slider-thumb]:rounded-full" 
                />
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex bg-slate-800 p-1 rounded-xl border border-slate-700 h-fit">
                <button 
                  onClick={() => setHitsOnly(false)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${!hitsOnly ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                >
                  ALL
                </button>
                <button 
                  onClick={() => setHitsOnly(true)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${hitsOnly ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                >
                  HITS
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {teamStats ? (
        <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
          
          <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700">
            <h3 className="text-sm font-bold text-slate-300 mb-3 flex items-center">
              <Users className="w-4 h-4 mr-2" />
              比較する選手を選択
            </h3>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setActivePlayers(teamStats.allPlayers.map(p => p.player))}
                className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-xs rounded-lg transition-colors text-white"
              >
                全選択
              </button>
              <button
                onClick={() => setActivePlayers([])}
                className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-xs rounded-lg transition-colors text-white"
              >
                クリア
              </button>
              <div className="w-px h-6 bg-slate-600 mx-2"></div>
              {teamStats.allPlayers.map((p, i) => {
                const isActive = activePlayers.includes(p.player);
                return (
                  <button
                    key={i}
                    onClick={() => {
                      if (isActive) setActivePlayers(activePlayers.filter(ap => ap !== p.player));
                      else setActivePlayers([...activePlayers, p.player]);
                    }}
                    className={`px-3 py-1 text-xs rounded-lg transition-all border ${
                      isActive ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-900 border-slate-700 text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {p.player}
                  </button>
                );
              })}
            </div>
          </div>

          <div className={`grid gap-4 ${[hasBatData, hasAttackAngle, hasBallData, true].filter(Boolean).length >= 3 ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-2'}`}>
            {hasBatData && (
              <div className="bg-blue-900/30 border border-blue-800/50 rounded-xl p-4 flex flex-col items-center justify-center text-center">
                <div className="text-blue-300 text-xs font-medium mb-1">平均バットスピード</div>
                <div className="text-2xl font-extrabold text-white">{teamStats.teamAvgBatSpeed} <span className="text-xs text-blue-400 font-normal">km/h</span></div>
              </div>
            )}
            {hasAttackAngle && (
              <div className="bg-green-900/30 border border-green-800/50 rounded-xl p-4 flex flex-col items-center justify-center text-center">
                <div className="text-green-300 text-xs font-medium mb-1">平均アッパースイング度</div>
                <div className="text-2xl font-extrabold text-white">{teamStats.teamAvgAttackAngle} <span className="text-xs text-green-400 font-normal">°</span></div>
              </div>
            )}
            {hasBallData && (
              <div className="bg-emerald-900/30 border border-emerald-800/50 rounded-xl p-4 flex flex-col items-center justify-center text-center">
                <div className="text-emerald-300 text-xs font-medium mb-1">平均打球速度</div>
                <div className="text-2xl font-extrabold text-white">{teamStats.teamAvgExitVelo} <span className="text-xs text-emerald-400 font-normal">km/h</span></div>
              </div>
            )}
            <div className="bg-purple-900/30 border border-purple-800/50 rounded-xl p-4 flex flex-col items-center justify-center text-center">
              <div className="text-purple-300 text-xs font-medium mb-1">平均打球角度</div>
              <div className="text-2xl font-extrabold text-white">{teamStats.teamAvgLaunchAngle} <span className="text-xs text-purple-400 font-normal">°</span></div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden shadow-lg">
              <div className="p-4 bg-slate-900 border-b border-slate-700 flex items-center">
                <TrendingUp className="w-5 h-5 text-blue-400 mr-2" />
                <h3 className="font-bold text-white">選手比較テーブル</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-slate-300">
                  <thead className="text-xs text-slate-400 uppercase bg-slate-900/50">
                    <tr>
                      <th className="px-4 py-3">選手名</th>
                      <th className="px-4 py-3">データ数</th>
                      {hasBatData && <th className="px-4 py-3 text-blue-400">平均バットスピード</th>}
                      {hasBatData && <th className="px-4 py-3 text-blue-300">最大バットスピード</th>}
                      {hasAttackAngle && <th className="px-4 py-3 text-green-400">平均アッパー度</th>}
                      {hasBallData && <th className="px-4 py-3 text-emerald-400">平均打球速度</th>}
                      {hasBallData && <th className="px-4 py-3 text-emerald-300">最大打球速度</th>}
                      <th className="px-4 py-3 text-purple-400">平均打球角度</th>
                      <th className="px-4 py-3 text-right">アクション</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamStats.players.map((p, i) => (
                      <tr key={i} className="border-b border-slate-700 hover:bg-slate-700/50 transition-colors">
                        <td className="px-4 py-3 font-medium text-white">{p.player}</td>
                        <td className="px-4 py-3">{p.swings}</td>
                        {hasBatData && <td className="px-4 py-3 font-bold text-blue-300">{p.avgBatSpeed.toFixed(1)}</td>}
                        {hasBatData && <td className="px-4 py-3 font-bold text-blue-200">{p.maxBatSpeed.toFixed(1)}</td>}
                        {hasAttackAngle && <td className="px-4 py-3 font-bold text-green-300">{p.avgAttackAngle.toFixed(1)}°</td>}
                        {hasBallData && <td className="px-4 py-3 font-bold text-emerald-300">{p.avgExitVelo.toFixed(1)}</td>}
                        {hasBallData && <td className="px-4 py-3 font-bold text-emerald-200">{p.maxExitVelo.toFixed(1)}</td>}
                        <td className="px-4 py-3 font-bold text-purple-300">{p.avgLaunchAngle.toFixed(1)}°</td>
                        <td className="px-4 py-3 text-right">
                          <button 
                            onClick={() => onViewPlayer(p.player, selectedTeam, sourceType)}
                            className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-3 py-1.5 rounded-lg font-bold transition-colors shadow-lg flex items-center ml-auto"
                          >
                            <BarChart3 className="w-3 h-3 mr-1" />レポート表示
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden shadow-lg">
              <div className="p-4 bg-slate-900 border-b border-slate-700 flex items-center">
                <Zap className="w-5 h-5 text-blue-400 mr-2" />
                <h3 className="font-bold text-white">
                  {hasBatData && hasBallData ? "バットスピード & 打球速度 (最大/平均)" :
                   hasBallData ? "打球速度 (最大 vs 平均)" :
                   "バットスピード (最大 vs 平均)"}
                </h3>
              </div>
              <div className="p-4" style={{ height: '400px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={teamStats.players.slice(0, 15)} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                    <XAxis dataKey="player" stroke="#94a3b8" fontSize={10} interval={0} angle={-45} textAnchor="end" />
                    <YAxis stroke="#94a3b8" fontSize={10} unit="km/h" />
                    <Tooltip 
                      cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                      content={({ active, payload, label }) => {
                        if (active && payload && payload.length) {
                          return (
                            <div className="bg-slate-900 border border-slate-700 p-3 rounded-lg shadow-xl text-sm">
                              <p className="font-bold text-white mb-2 border-b border-slate-700 pb-1">{label}</p>
                              {payload.map((entry, index) => (
                                <p key={index} style={{ color: entry.color }} className="flex justify-between gap-4">
                                  <span>{entry.name}:</span>
                                  <span className="text-white font-mono">{Number(entry.value).toFixed(1)} km/h</span>
                                </p>
                              ))}
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Legend verticalAlign="top" height={36}/>
                    {hasBatData && <Bar dataKey="avgBatSpeed" name="平均バットスピード" fill="#3b82f6" fillOpacity={0.6} radius={[4, 4, 0, 0]} />}
                    {hasBatData && <Bar dataKey="maxBatSpeed" name="最大バットスピード" fill="#2563eb" radius={[4, 4, 0, 0]} />}
                    {hasBallData && <Bar dataKey="avgExitVelo" name="平均打球速度" fill="#10b981" fillOpacity={0.6} radius={[4, 4, 0, 0]} />}
                    {hasBallData && <Bar dataKey="maxExitVelo" name="最大打球速度" fill="#059669" radius={[4, 4, 0, 0]} />}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 md:p-8 shadow-2xl flex flex-col" style={{height: '400px'}}>
              <h3 className="font-bold text-white mb-4 text-center">打球速度 vs 打球角度 (チーム内分布)</h3>
              <div className="flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis type="number" dataKey="avgExitVelo" name="打球速度" unit="km/h" stroke="#94a3b8" label={{ value: '平均打球速度', position: 'insideBottom', offset: -15, fill: '#94a3b8', fontSize: 11 }} domain={['auto', 'auto']} />
                    <YAxis type="number" dataKey="avgLaunchAngle" name="打球角度" unit="°" stroke="#94a3b8" label={{ value: '平均打球角度', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 11 }} domain={['auto', 'auto']} />
                    <Tooltip 
                      cursor={{ strokeDasharray: '3 3' }} 
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-slate-900 border border-slate-700 p-3 rounded-lg shadow-xl text-sm">
                              <p className="font-bold text-white mb-1 border-b border-slate-700 pb-1">{data.player}</p>
                              <p className="text-emerald-400">平均打球速度: <span className="text-white font-mono">{data.avgExitVelo.toFixed(1)} km/h</span></p>
                              <p className="text-purple-400">平均打球角度: <span className="text-white font-mono">{data.avgLaunchAngle.toFixed(1)}°</span></p>
                              <p className="text-slate-400 text-xs mt-1">スイング数: {data.swings}</p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Scatter 
                      data={teamStats.players.filter(p => p.avgExitVelo > 0)} 
                      fill="#10b981"
                      shape={(props) => {
                        const { cx, cy, payload } = props;
                        return (
                          <g>
                            <circle cx={cx} cy={cy} r={6} fill="#10b981" fillOpacity={0.8} />
                            <text x={cx} y={cy - 10} textAnchor="middle" fill="#94a3b8" fontSize={9}>{payload.player}</text>
                          </g>
                        );
                      }}
                    />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500 border-2 border-dashed border-slate-700 rounded-2xl bg-slate-800/30">
          <Users className="w-16 h-16 mb-4 opacity-30" />
          <p className="text-lg">チームを選択すると、チーム内の比較表やグラフが表示されます</p>
        </div>
      )}
    </div>
  );
}

export default TeamAnalysis;
