import React, { useState, useEffect, useMemo } from 'react';
import { extractTeams, extractPlayersByTeam, getPlayerStats, calculateAverages, calculateMax, groupEventsByTeamAndPlayer, parseNumeric, getDataValue, getRawDataValue, parseAnyDate, parseDateToTimestamp, EV_KEYS, BS_KEYS, LA_KEYS, AA_KEYS } from '../utils/dataHelpers';
import { ScatterChart, Scatter, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell, LabelList } from 'recharts';
import { Users, TrendingUp, Zap, BarChart3, Eye, RefreshCw } from 'lucide-react';

function TeamTrendScatterChart({ groupedData, selectedTeam }) {
  const [metric, setMetric] = useState('ev');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [statFilter, setStatFilter] = useState('all'); // 'all', 'avg', 'max'

  const metricMeta = {
    ev: { label: '打球速度', unit: 'km/h', avgColor: '#10b981', maxColor: '#ef4444', keys: EV_KEYS },
    la: { label: '打球角度', unit: '°', avgColor: '#a855f7', maxColor: '#f97316', keys: LA_KEYS },
    bs: { label: 'バット速度', unit: 'km/h', avgColor: '#3b82f6', maxColor: '#ec4899', keys: BS_KEYS },
    aa: { label: 'アッパースイング度', unit: '°', avgColor: '#f59e0b', maxColor: '#f43f5e', keys: AA_KEYS },
  };

  const currentMeta = metricMeta[metric];

  const trendData = useMemo(() => {
    if (!selectedTeam || !groupedData[selectedTeam]) return [];
    const teamPlayers = groupedData[selectedTeam];
    const list = [];

    Object.keys(teamPlayers).forEach(player => {
      const events = teamPlayers[player];
      if (!events || !Array.isArray(events)) return;

      // Group events for each player by date
      const dateMap = {};
      events.forEach(e => {
        const rawDate = getRawDataValue(e, ['game_date', 'date', '日付', 'Date', 'gameDate', 'Date/Time', 'Pitch Date', '日時']) || e.game_date || e.date || e['日付'] || e['Date'] || '';
        if (!rawDate) return;

        const dateStr = parseAnyDate(rawDate);
        if (!dateStr) return;
        if (startDate && dateStr < startDate) return;
        if (endDate && dateStr > endDate) return;

        const val = parseNumeric(getDataValue(e, currentMeta.keys));
        if (val !== 0 && !isNaN(val)) {
          if (!dateMap[dateStr]) dateMap[dateStr] = [];
          dateMap[dateStr].push(val);
        }
      });

      // Calculate avg & max for each date
      Object.keys(dateMap).forEach(dateStr => {
        const vals = dateMap[dateStr];
        if (vals.length === 0) return;

        const sum = vals.reduce((a, b) => a + b, 0);
        const avg = Number((sum / vals.length).toFixed(1));
        const max = Number(Math.max(...vals).toFixed(1));

        const timeMs = parseDateToTimestamp(dateStr);

        if (!isNaN(timeMs) && timeMs > 0) {
          if (statFilter === 'all' || statFilter === 'avg') {
            list.push({
              date: dateStr,
              timeMs,
              val: avg,
              avgVal: avg,
              maxVal: max,
              count: vals.length,
              player,
              statType: '平均',
              color: currentMeta.avgColor
            });
          }
          if (statFilter === 'all' || statFilter === 'max') {
            list.push({
              date: dateStr,
              timeMs,
              val: max,
              avgVal: avg,
              maxVal: max,
              count: vals.length,
              player,
              statType: '最大',
              color: currentMeta.maxColor
            });
          }
        }
      });
    });

    return list.sort((a, b) => a.timeMs - b.timeMs);
  }, [selectedTeam, groupedData, currentMeta, startDate, endDate, statFilter]);

  return (
    <div className="w-full bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden shadow-xl mt-8 p-4 sm:p-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-700 pb-4 mb-5">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-purple-400 flex-shrink-0" />
          <h3 className="font-extrabold text-white text-base sm:text-lg">日付別 打撃指標の変動推移 (チーム散布図)</h3>
        </div>
        
        {/* コントロール: 範囲・表示切替・Y軸指標 */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-bold whitespace-nowrap">範囲:</span>
            <input 
              type="date" 
              value={startDate} 
              onChange={e => setStartDate(e.target.value)}
              className="bg-slate-900 border border-slate-700 text-white text-xs font-bold rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-purple-500"
            />
            <span className="text-xs text-slate-500">~</span>
            <input 
              type="date" 
              value={endDate} 
              onChange={e => setEndDate(e.target.value)}
              className="bg-slate-900 border border-slate-700 text-white text-xs font-bold rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-purple-500"
            />
            {(startDate || endDate) && (
              <button 
                onClick={() => { setStartDate(''); setEndDate(''); }}
                className="text-[11px] text-purple-400 hover:text-purple-300 font-bold underline"
              >
                全期間
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-bold whitespace-nowrap">表示:</span>
            <select
              value={statFilter}
              onChange={e => setStatFilter(e.target.value)}
              className="bg-slate-900 border border-slate-700 text-white text-xs font-bold rounded-lg px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-purple-500 cursor-pointer"
            >
              <option value="all">平均 & 最大 (両方)</option>
              <option value="avg">平均のみ</option>
              <option value="max">最大のみ</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-bold whitespace-nowrap">Y軸:</span>
            <select
              value={metric}
              onChange={e => setMetric(e.target.value)}
              className="bg-slate-900 border border-slate-700 text-white text-xs font-bold rounded-xl px-3 py-1.5 outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer shadow-inner"
            >
              <option value="ev">打球速度 (km/h)</option>
              <option value="la">打球角度 (°)</option>
              <option value="bs">バット速度 (km/h)</option>
              <option value="aa">アッパースイング度 (°)</option>
            </select>
          </div>
        </div>
      </div>

      {/* 色の凡例 (平均 & 最大) */}
      <div className="flex items-center gap-4 mb-3 px-2 text-xs font-bold">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full inline-block shadow" style={{ backgroundColor: currentMeta.avgColor }}></span>
          <span className="text-slate-300">日別平均 (丸プロット)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rotate-45 inline-block shadow" style={{ backgroundColor: currentMeta.maxColor }}></span>
          <span className="text-slate-300">日別最大 (ひし形プロット)</span>
        </div>
      </div>

      <div style={{ height: '380px' }} className="w-full">
        {trendData.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 text-sm p-4">
            <p className="font-bold text-slate-300 mb-2">選択された期間・指標のデータが見つかりません</p>
            {(startDate || endDate) && (
              <div className="flex flex-col items-center gap-2 mt-2 bg-slate-900/60 p-3 rounded-xl border border-purple-500/30">
                <p className="text-xs text-amber-400 font-bold">※ 日付範囲（{startDate || '最初'} 〜 {endDate || '最新'}）によりデータが絞り込まれています</p>
                <button 
                  onClick={() => { setStartDate(''); setEndDate(''); }}
                  className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-500 text-white font-bold px-4 py-1.5 rounded-lg text-xs transition-all shadow-md cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  すべての期間のデータを表示する
                </button>
              </div>
            )}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 25, right: 30, bottom: 40, left: 15 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis 
                type="number"
                dataKey="timeMs" 
                name="日付" 
                stroke="#94a3b8" 
                fontSize={11}
                domain={['auto', 'auto']}
                tickFormatter={(timeMs) => {
                  const d = new Date(timeMs);
                  if (isNaN(d.getTime())) return '';
                  const m = String(d.getMonth() + 1).padStart(2, '0');
                  const day = String(d.getDate()).padStart(2, '0');
                  return `${d.getFullYear()}-${m}-${day}`;
                }}
                label={{ value: '日付', position: 'insideBottom', offset: -25, fill: '#94a3b8', fontSize: 11, fontWeight: 'bold' }}
              />
              <YAxis 
                type="number" 
                dataKey="val" 
                name={currentMeta.label} 
                unit={currentMeta.unit} 
                stroke="#94a3b8" 
                fontSize={11}
                width={55}
                domain={['auto', 'auto']}
              />
              <Tooltip 
                cursor={{ strokeDasharray: '3 3' }} 
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const d = payload[0].payload;
                    return (
                      <div className="bg-slate-900 border border-slate-700 p-3 rounded-xl shadow-2xl text-sm">
                        <p className="font-bold text-white mb-1 border-b border-slate-700 pb-1">{d.player} ({d.date})</p>
                        <p className="font-bold" style={{ color: currentMeta.avgColor }}>
                          日別平均: <span className="text-white font-mono">{d.avgVal.toFixed(1)} {currentMeta.unit}</span>
                        </p>
                        <p className="font-bold" style={{ color: currentMeta.maxColor }}>
                          日別最大: <span className="text-white font-mono">{d.maxVal.toFixed(1)} {currentMeta.unit}</span>
                        </p>
                        <p className="text-slate-400 text-xs mt-1">当日のスイング数: {d.count} 回</p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Scatter 
                data={trendData} 
                shape={(props) => {
                  const { cx, cy, payload } = props;
                  const isMax = payload.statType === '最大';
                  return (
                    <g>
                      {isMax ? (
                        <rect x={cx - 4.5} y={cy - 4.5} width={9} height={9} fill={payload.color} fillOpacity={0.9} stroke="#fff" strokeWidth={1} transform={`rotate(45 ${cx} ${cy})`} />
                      ) : (
                        <circle cx={cx} cy={cy} r={5.5} fill={payload.color} fillOpacity={0.85} stroke="#fff" strokeWidth={1} />
                      )}
                      <text x={cx} y={cy - 9} textAnchor="middle" fill="#cbd5e1" fontSize={9} fontWeight="bold">
                        {payload.player}
                      </text>
                    </g>
                  );
                }}
              />
            </ScatterChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function TeamAnalysis({ savantData, blastData, combinedData, onViewPlayer }) {
  const [sourceType, setSourceType] = useState('savant');
  const activeData = sourceType === 'savant' ? savantData : sourceType === 'blast' ? blastData : combinedData;

  useEffect(() => {
    const savantCount = savantData?.data?.length || 0;
    const blastCount = blastData?.data?.length || 0;
    const combinedCount = combinedData?.data?.length || 0;

    if (combinedCount > 0 && savantCount === 0 && blastCount === 0) {
      setSourceType('combined');
    } else if (savantCount > 0 && combinedCount === 0 && blastCount === 0) {
      setSourceType('savant');
    } else if (blastCount > 0 && savantCount === 0 && combinedCount === 0) {
      setSourceType('blast');
    }
  }, [savantData, blastData, combinedData]);
  
  const [teams, setTeams] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState('');
  const [nameKey, setNameKey] = useState('player_name');

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

  // Axis range controls for Left & Right charts
  const [leftXMin, setLeftXMin] = useState('');
  const [leftXMax, setLeftXMax] = useState('');
  const [leftYMin, setLeftYMin] = useState('');
  const [leftYMax, setLeftYMax] = useState('');
  const [leftChartType, setLeftChartType] = useState('scatter');

  const [rightXMin, setRightXMin] = useState('');
  const [rightXMax, setRightXMax] = useState('');
  const [rightYMin, setRightYMin] = useState('');
  const [rightYMax, setRightYMax] = useState('');

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
        <h2 className="text-3xl font-extrabold text-white mb-2">打撃分析</h2>
        <p className="text-slate-400">打撃データ全体の傾向や、選手同士の打撃比較を行います。</p>
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

          {/* 選手比較テーブル (全幅表示) */}
          <div className="w-full bg-slate-800 rounded-xl border border-slate-700 overflow-hidden shadow-xl mb-8">
            <div className="p-4 bg-slate-900 border-b border-slate-700 flex items-center justify-between">
              <div className="flex items-center">
                <TrendingUp className="w-5 h-5 text-blue-400 mr-2" />
                <h3 className="font-bold text-white">選手比較テーブル</h3>
              </div>
              <span className="text-xs text-slate-400">全 {teamStats.players.length} 名</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left text-slate-300">
                <thead className="text-xs text-slate-400 uppercase bg-slate-900/50 border-b border-slate-700">
                  <tr>
                    <th className="px-5 py-3.5">選手名</th>
                    <th className="px-5 py-3.5">スイング数</th>
                    {hasBatData && <th className="px-5 py-3.5 text-blue-400 font-bold">平均バットスピード</th>}
                    {hasBatData && <th className="px-5 py-3.5 text-blue-300 font-bold">最大バットスピード</th>}
                    {hasAttackAngle && <th className="px-5 py-3.5 text-green-400 font-bold">平均アッパー度</th>}
                    {hasBallData && <th className="px-5 py-3.5 text-emerald-400 font-bold">平均打球速度</th>}
                    {hasBallData && <th className="px-5 py-3.5 text-emerald-300 font-bold">最大打球速度</th>}
                    <th className="px-5 py-3.5 text-purple-400 font-bold">平均打球角度</th>
                    <th className="px-5 py-3.5 text-right">詳細</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/60">
                  {teamStats.players.map((p, i) => (
                    <tr key={i} className="hover:bg-slate-700/40 transition-colors">
                      <td className="px-5 py-3.5 font-bold text-white text-base">{p.player}</td>
                      <td className="px-5 py-3.5 text-slate-400 font-mono">{p.swings} 回</td>
                      {hasBatData && <td className="px-5 py-3.5 font-bold text-blue-300 text-base">{p.avgBatSpeed.toFixed(1)} <span className="text-xs text-slate-500 font-normal">km/h</span></td>}
                      {hasBatData && <td className="px-5 py-3.5 font-bold text-blue-200 text-base">{p.maxBatSpeed.toFixed(1)} <span className="text-xs text-slate-500 font-normal">km/h</span></td>}
                      {hasAttackAngle && <td className="px-5 py-3.5 font-bold text-green-300 text-base">{p.avgAttackAngle.toFixed(1)}°</td>}
                      {hasBallData && <td className="px-5 py-3.5 font-bold text-emerald-300 text-base">{p.avgExitVelo.toFixed(1)} <span className="text-xs text-slate-500 font-normal">km/h</span></td>}
                      {hasBallData && <td className="px-5 py-3.5 font-bold text-emerald-200 text-base">{p.maxExitVelo.toFixed(1)} <span className="text-xs text-slate-500 font-normal">km/h</span></td>}
                      <td className="px-5 py-3.5 font-bold text-purple-300 text-base">{p.avgLaunchAngle.toFixed(1)}°</td>
                      <td className="px-5 py-3.5 text-right">
                        <button 
                          onClick={() => onViewPlayer(p.player, selectedTeam, sourceType)}
                          className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-3.5 py-1.5 rounded-lg font-bold transition-all shadow-lg flex items-center ml-auto gap-1 cursor-pointer"
                        >
                          <BarChart3 className="w-3.5 h-3.5" />
                          <span>レポート表示</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 2個のグラフ (プロット表示 & 範囲設定対応) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* 左グラフ: バットスピード vs 打球速度 プロット散布図 */}
            <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden shadow-lg p-5 flex flex-col">
              <div className="flex flex-row items-center justify-between gap-2 mb-4 border-b border-slate-700 pb-3">
                <div className="flex items-center min-w-0">
                  <Zap className="w-5 h-5 text-blue-400 mr-2 flex-shrink-0" />
                  <h3 className="font-bold text-white text-sm sm:text-base truncate">バットスピード vs 打球速度</h3>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0 whitespace-nowrap bg-slate-900 p-1 rounded-lg border border-slate-700/80">
                  <button 
                    onClick={() => setLeftChartType('scatter')}
                    className={`px-2.5 py-1 rounded text-xs font-bold transition-all ${leftChartType === 'scatter' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                  >
                    プロット
                  </button>
                  <button 
                    onClick={() => setLeftChartType('bar')}
                    className={`px-2.5 py-1 rounded text-xs font-bold transition-all ${leftChartType === 'bar' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                  >
                    棒グラフ
                  </button>
                </div>
              </div>

              {/* 軸範囲設定コントロール */}
              <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-700/60 mb-4 text-xs grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <span className="text-slate-400 block mb-1 text-[11px] font-bold">X軸 最小</span>
                  <input 
                    type="number" 
                    placeholder="Auto (バット速)" 
                    value={leftXMin} 
                    onChange={e => setLeftXMin(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white outline-none focus:border-blue-500 text-xs"
                  />
                </div>
                <div>
                  <span className="text-slate-400 block mb-1 text-[11px] font-bold">X軸 最大</span>
                  <input 
                    type="number" 
                    placeholder="Auto (バット速)" 
                    value={leftXMax} 
                    onChange={e => setLeftXMax(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white outline-none focus:border-blue-500 text-xs"
                  />
                </div>
                <div>
                  <span className="text-slate-400 block mb-1 text-[11px] font-bold">Y軸 最小</span>
                  <input 
                    type="number" 
                    placeholder="Auto (打球速)" 
                    value={leftYMin} 
                    onChange={e => setLeftYMin(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white outline-none focus:border-blue-500 text-xs"
                  />
                </div>
                <div>
                  <span className="text-slate-400 block mb-1 text-[11px] font-bold">Y軸 最大</span>
                  <input 
                    type="number" 
                    placeholder="Auto (打球速)" 
                    value={leftYMax} 
                    onChange={e => setLeftYMax(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white outline-none focus:border-blue-500 text-xs"
                  />
                </div>
              </div>

              <div style={{ height: '380px' }} className="w-full">
                <ResponsiveContainer width="100%" height="100%">
                  {leftChartType === 'scatter' ? (
                    <ScatterChart margin={{ top: 20, right: 25, bottom: 35, left: 15 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis 
                        type="number" 
                        dataKey="avgBatSpeed" 
                        name="平均バットスピード" 
                        unit="km/h" 
                        stroke="#94a3b8" 
                        fontSize={11}
                        domain={[
                          leftXMin !== '' && !isNaN(Number(leftXMin)) ? Number(leftXMin) : 'auto',
                          leftXMax !== '' && !isNaN(Number(leftXMax)) ? Number(leftXMax) : 'auto'
                        ]}
                        label={{ value: '平均バットスピード (km/h)', position: 'insideBottom', offset: -18, fill: '#94a3b8', fontSize: 11 }} 
                      />
                      <YAxis 
                        type="number" 
                        dataKey="avgExitVelo" 
                        name="平均打球速度" 
                        unit="km/h" 
                        stroke="#94a3b8" 
                        fontSize={11}
                        width={65}
                        domain={[
                          leftYMin !== '' && !isNaN(Number(leftYMin)) ? Number(leftYMin) : 'auto',
                          leftYMax !== '' && !isNaN(Number(leftYMax)) ? Number(leftYMax) : 'auto'
                        ]}
                      />
                      <Tooltip 
                        cursor={{ strokeDasharray: '3 3' }} 
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="bg-slate-900 border border-slate-700 p-3 rounded-lg shadow-xl text-sm">
                                <p className="font-bold text-white mb-1 border-b border-slate-700 pb-1">{data.player}</p>
                                <p className="text-blue-400">平均バットスピード: <span className="text-white font-mono">{data.avgBatSpeed.toFixed(1)} km/h</span></p>
                                <p className="text-emerald-400">平均打球速度: <span className="text-white font-mono">{data.avgExitVelo.toFixed(1)} km/h</span></p>
                                <p className="text-slate-400 text-xs mt-1">スイング数: {data.swings}</p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Scatter 
                        data={teamStats.players.filter(p => p.avgBatSpeed > 0 || p.avgExitVelo > 0)} 
                        fill="#3b82f6"
                        shape={(props) => {
                          const { cx, cy, payload } = props;
                          return (
                            <g>
                              <circle cx={cx} cy={cy} r={6} fill="#3b82f6" fillOpacity={0.85} stroke="#60a5fa" strokeWidth={1.5} />
                              <text x={cx} y={cy - 10} textAnchor="middle" fill="#cbd5e1" fontSize={10} fontWeight="bold">{payload.player}</text>
                            </g>
                          );
                        }}
                      />
                    </ScatterChart>
                  ) : (
                    <BarChart data={teamStats.players.slice(0, 15)} margin={{ top: 45, right: 30, left: 15, bottom: 60 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                      <XAxis dataKey="player" stroke="#94a3b8" fontSize={10} interval={0} angle={-45} textAnchor="end" />
                      <YAxis 
                        stroke="#94a3b8" 
                        fontSize={10} 
                        unit="km/h" 
                        width={65}
                        domain={[
                          leftYMin !== '' && !isNaN(Number(leftYMin)) ? Number(leftYMin) : 0,
                          leftYMax !== '' && !isNaN(Number(leftYMax)) ? Number(leftYMax) : 'auto'
                        ]}
                      />
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
                      <Legend verticalAlign="top" wrapperStyle={{ top: 0, left: 0, right: 0, paddingBottom: 15 }} fontSize={11} />
                      {hasBatData && <Bar dataKey="avgBatSpeed" name="平均バットスピード" fill="#3b82f6" fillOpacity={0.6} radius={[4, 4, 0, 0]} />}
                      {hasBatData && <Bar dataKey="maxBatSpeed" name="最大バットスピード" fill="#2563eb" radius={[4, 4, 0, 0]} />}
                      {hasBallData && <Bar dataKey="avgExitVelo" name="平均打球速度" fill="#10b981" fillOpacity={0.6} radius={[4, 4, 0, 0]} />}
                      {hasBallData && <Bar dataKey="maxExitVelo" name="最大打球速度" fill="#059669" radius={[4, 4, 0, 0]} />}
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>
            </div>

            {/* 右グラフ: 打球速度 vs 打球角度 プロット散布図 */}
            <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden shadow-lg p-5 flex flex-col">
              <div className="flex items-center justify-between mb-4 border-b border-slate-700 pb-3">
                <h3 className="font-bold text-white text-base">打球速度 vs 打球角度 (チーム内分布)</h3>
                <span className="text-xs text-slate-400">プロット表示</span>
              </div>

              {/* 軸範囲設定コントロール */}
              <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-700/60 mb-4 text-xs grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <span className="text-slate-400 block mb-1 text-[11px] font-bold">X軸 最小</span>
                  <input 
                    type="number" 
                    placeholder="Auto (打球速)" 
                    value={rightXMin} 
                    onChange={e => setRightXMin(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white outline-none focus:border-emerald-500 text-xs"
                  />
                </div>
                <div>
                  <span className="text-slate-400 block mb-1 text-[11px] font-bold">X軸 最大</span>
                  <input 
                    type="number" 
                    placeholder="Auto (打球速)" 
                    value={rightXMax} 
                    onChange={e => setRightXMax(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white outline-none focus:border-emerald-500 text-xs"
                  />
                </div>
                <div>
                  <span className="text-slate-400 block mb-1 text-[11px] font-bold">Y軸 最小</span>
                  <input 
                    type="number" 
                    placeholder="Auto (打球角)" 
                    value={rightYMin} 
                    onChange={e => setRightYMin(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white outline-none focus:border-emerald-500 text-xs"
                  />
                </div>
                <div>
                  <span className="text-slate-400 block mb-1 text-[11px] font-bold">Y軸 最大</span>
                  <input 
                    type="number" 
                    placeholder="Auto (打球角)" 
                    value={rightYMax} 
                    onChange={e => setRightYMax(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white outline-none focus:border-emerald-500 text-xs"
                  />
                </div>
              </div>

              <div style={{ height: '380px' }} className="w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 20, right: 25, bottom: 35, left: 15 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis 
                      type="number" 
                      dataKey="avgExitVelo" 
                      name="打球速度" 
                      unit="km/h" 
                      stroke="#94a3b8" 
                      fontSize={11}
                      domain={[
                        rightXMin !== '' && !isNaN(Number(rightXMin)) ? Number(rightXMin) : 'auto',
                        rightXMax !== '' && !isNaN(Number(rightXMax)) ? Number(rightXMax) : 'auto'
                      ]}
                      label={{ value: '平均打球速度 (km/h)', position: 'insideBottom', offset: -18, fill: '#94a3b8', fontSize: 11 }} 
                    />
                    <YAxis 
                      type="number" 
                      dataKey="avgLaunchAngle" 
                      name="打球角度" 
                      unit="°" 
                      stroke="#94a3b8" 
                      fontSize={11}
                      width={55}
                      domain={[
                        rightYMin !== '' && !isNaN(Number(rightYMin)) ? Number(rightYMin) : 'auto',
                        rightYMax !== '' && !isNaN(Number(rightYMax)) ? Number(rightYMax) : 'auto'
                      ]}
                    />
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
                      data={teamStats.players.filter(p => p.avgExitVelo > 0 || p.avgLaunchAngle !== 0)} 
                      fill="#10b981"
                      shape={(props) => {
                        const { cx, cy, payload } = props;
                        return (
                          <g>
                            <circle cx={cx} cy={cy} r={6} fill="#10b981" fillOpacity={0.85} stroke="#34d399" strokeWidth={1.5} />
                            <text x={cx} y={cy - 10} textAnchor="middle" fill="#cbd5e1" fontSize={10} fontWeight="bold">{payload.player}</text>
                          </g>
                        );
                      }}
                    />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </div>

          </div>

          {/* 日付推移散布図 (日付 vs 指標推移) */}
          <TeamTrendScatterChart groupedData={groupedData} selectedTeam={selectedTeam} />
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
