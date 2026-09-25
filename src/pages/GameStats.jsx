import React, { useState, useEffect } from 'react';
import { extractTeams, calculateStats, groupEventsByTeamAndPlayer } from '../utils/dataHelpers';
import { Trophy, TrendingUp, Users } from 'lucide-react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';

function GameStats({ savantData, blastData, combinedData }) {
  const defaultSource = useMemo(() => {
    const sLen = savantData?.data?.length || 0;
    const bLen = blastData?.data?.length || 0;
    const cLen = combinedData?.data?.length || 0;

    if (cLen >= sLen && cLen >= bLen && cLen > 0) return 'combined';
    if (sLen >= bLen && sLen > 0) return 'savant';
    if (bLen > 0) return 'blast';
    return 'combined';
  }, [savantData, blastData, combinedData]);

  const [sourceType, setSourceType] = useState(defaultSource);

  useEffect(() => {
    setSourceType(defaultSource);
  }, [defaultSource]);

  const activeData = sourceType === 'savant' ? savantData : sourceType === 'blast' ? blastData : combinedData;

  const [teams, setTeams] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState('');
  const [playerStats, setPlayerStats] = useState([]);
  const [nameKey, setNameKey] = useState('player_name');
  const [groupedData, setGroupedData] = useState({});

  const headers = activeData ? activeData.headers : [];

  // Group data once when data or key changes
  useEffect(() => {
    if (activeData && activeData.data && activeData.data.length > 0) {
      // Determine best teamKey - Prioritize 'Team' as requested
      const teamCandidates = ['チーム名', 'チーム', 'Team', 'team_name', 'home_team', 'away_team', 'Unknown Team'];
      const teamKey = headers.find(h => teamCandidates.includes(h)) || 'Unknown Team';
      
      // Rank candidates for Player Name
      const candidates = ['Player Name', 'batter_name', 'player_name', 'PlayerName', '選手名', '氏名', 'pitcher_name', 'batter', 'pitcher'];
      
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

      const extracted = extractTeams(activeData.data, teamKey);
      setTeams(extracted);
      setGroupedData(groupEventsByTeamAndPlayer(activeData.data, teamKey, bestNameKey));
      if ((!selectedTeam || !extracted.includes(selectedTeam)) && extracted.length > 0) {
        setSelectedTeam(extracted[0]);
      }
    } else {
      setTeams([]);
      setGroupedData({});
    }
  }, [activeData, nameKey, headers]);

  // Candidates for the dropdown to filter out useless columns
  const nameCandidates = ['選手名', '名前', 'Player Name', 'batter_name', 'player_name', 'PlayerName', '氏名', 'pitcher_name', 'batter', 'pitcher'];
  const availableNameKeys = headers.filter(h => nameCandidates.includes(h));

  useEffect(() => {
    if (selectedTeam && groupedData[selectedTeam]) {
      const teamPlayers = groupedData[selectedTeam];
      
      const statsList = Object.keys(teamPlayers).map(player => {
        const events = teamPlayers[player];
        if (!events || !Array.isArray(events)) return null;

        const { ba, slg, ab } = calculateStats(events);
        const baNum = Number(ba) || 0;
        const slgNum = Number(slg) || 0;
        
        return {
          player,
          ba: baNum,
          slg: slgNum,
          ops: baNum + slgNum,
          ab,
          hits: events.filter(e => e && e.events && typeof e.events === 'string' && ['single', 'double', 'triple', 'home_run'].includes(e.events.toLowerCase())).length
        };
      }).filter(s => s && s.ab > 0);

      statsList.sort((a, b) => b.ops - a.ops);
      setPlayerStats(statsList);
    } else {
      setPlayerStats([]);
    }
  }, [selectedTeam, groupedData]);

  return (
    <div className="animate-in fade-in duration-300">
      <header className="mb-8">
        <h2 className="text-3xl font-extrabold text-white mb-2">試合スタッツ (Game Stats)</h2>
        <p className="text-slate-400">Rapsodoデータを試合結果と見なし、打率や長打率を算出します。</p>
        {/* 必要な条件 */}
        <div className="mt-4 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl text-sm">
          <p className="font-bold text-amber-400 mb-1">⚠️ このページが機能するために必要な条件</p>
          <ul className="text-amber-300/80 list-disc list-inside space-y-1">
            <li>CSVに <code className="bg-slate-700 px-1 rounded text-xs">events</code> 列が必要（値: <code className="bg-slate-700 px-1 rounded text-xs">single / double / triple / home_run / strikeout / walk / out</code> など）</li>
            <li>スイング速度・打球速度だけの統合CSVでは、events列がないためスタッツは算出できません</li>
            <li>Rapsodo出力CSVを使用するか、events列を手動で追加してください</li>
          </ul>
        </div>
      </header>

      <div className="bg-slate-800/80 p-8 rounded-3xl border border-slate-700/50 mb-8 shadow-xl">
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
              名前として使用する列
            </label>
            <select
              value={nameKey}
              onChange={(e) => setNameKey(e.target.value)}
              className="w-full bg-slate-900 border-2 border-blue-500/20 text-white rounded-xl p-4 focus:ring-4 focus:ring-blue-500/20 outline-none transition-all font-bold"
            >
              {availableNameKeys.length > 0 ? availableNameKeys.map((h, idx) => (
                <option key={idx} value={h}>{h}</option>
              )) : headers.map((h, idx) => (
                <option key={idx} value={h}>{h}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-400 mb-2 uppercase tracking-widest">
              対象チーム
            </label>
            <select
              value={selectedTeam}
              onChange={(e) => setSelectedTeam(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl p-4 focus:ring-4 focus:ring-blue-500/20 outline-none transition-all"
            >
              <option value="">-- チームを選択 --</option>
              {teams.map((team, idx) => (
                <option key={idx} value={team}>{team}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {playerStats.length > 0 ? (
        <div className="space-y-10">
          {/* Stats Distribution Chart */}
          <div className="bg-slate-800 rounded-3xl p-4 md:p-8 border border-slate-700 shadow-2xl flex flex-col" style={{height: 'clamp(300px, 50vw, 500px)'}}>
            <h3 className="text-xl font-bold text-white mb-6 flex items-center">
              <TrendingUp className="w-6 h-6 mr-2 text-blue-400" />
              打率 vs 長打率 (OPS分布)
            </h3>
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis type="number" dataKey="ba" name="AVG" stroke="#94a3b8" domain={['auto', 'auto']} tickFormatter={(v) => `.${String(v.toFixed(3)).split('.')[1]}`} label={{ value: '打率 (AVG)', position: 'bottom', offset: 0, fill: '#64748b' }} />
                <YAxis type="number" dataKey="slg" name="SLG" stroke="#94a3b8" domain={['auto', 'auto']} tickFormatter={(v) => `.${String(v.toFixed(3)).split('.')[1]}`} label={{ value: '長打率 (SLG)', angle: -90, position: 'insideLeft', fill: '#64748b' }} />
                <Tooltip 
                  cursor={{ strokeDasharray: '3 3' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-slate-900 border border-slate-700 p-4 rounded-xl shadow-2xl text-sm">
                          <p className="font-bold text-white mb-2 border-b border-slate-700 pb-1 text-lg">{data.player}</p>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                            <span className="text-slate-400">AVG:</span> <span className="text-blue-300 font-mono">.{String(data.ba.toFixed(3)).split('.')[1]}</span>
                            <span className="text-slate-400">SLG:</span> <span className="text-purple-300 font-mono">.{String(data.slg.toFixed(3)).split('.')[1]}</span>
                            <span className="text-slate-400 font-bold">OPS:</span> <span className="text-yellow-500 font-black">{data.ops.toFixed(3)}</span>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Scatter name="Players" data={playerStats}>
                  {playerStats.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={entry.ops > 0.9 ? '#ef4444' : entry.ops > 0.8 ? '#f59e0b' : '#3b82f6'} 
                      stroke="#fff" 
                      strokeWidth={entry.ops > 0.9 ? 2 : 0}
                    />
                  ))}
                  <LabelList dataKey="player" position="top" fill="#94a3b8" fontSize={10} offset={10} />
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>

          {/* Detailed Table */}
          <div className="bg-slate-800 rounded-3xl border border-slate-700 overflow-hidden shadow-2xl">
            <div className="p-6 bg-slate-900 border-b border-slate-700 flex justify-between items-center">
              <div className="flex items-center">
                <TrendingUp className="w-6 h-6 text-emerald-400 mr-2" />
                <h3 className="font-bold text-white text-lg">打撃スタッツ詳細</h3>
              </div>
              <span className="text-xs bg-slate-800 px-3 py-1 rounded-full text-slate-400">
                Sorted by OPS
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left text-slate-300">
                <thead className="text-xs text-slate-400 uppercase bg-slate-900/50">
                  <tr>
                    <th className="px-6 py-4">選手名</th>
                    <th className="px-6 py-4 text-center">打数 (AB)</th>
                    <th className="px-6 py-4 text-center">安打 (H)</th>
                    <th className="px-6 py-4 text-center text-blue-400">打率 (AVG)</th>
                    <th className="px-6 py-4 text-center text-purple-400">長打率 (SLG)</th>
                    <th className="px-6 py-4 text-center text-yellow-500">OPS</th>
                  </tr>
                </thead>
                <tbody>
                  {playerStats.map((p, i) => (
                    <tr key={i} className="border-b border-slate-700 hover:bg-slate-700/50 transition-colors">
                      <td className="px-6 py-4 font-bold text-white">{p.player}</td>
                      <td className="px-6 py-4 text-center font-mono">{p.ab}</td>
                      <td className="px-6 py-4 text-center font-mono">{p.hits}</td>
                      <td className="px-6 py-4 text-center font-bold text-blue-300">.{p.ba.toFixed(3).split('.')[1]}</td>
                      <td className="px-6 py-4 text-center font-bold text-purple-300">.{p.slg.toFixed(3).split('.')[1]}</td>
                      <td className="px-6 py-4 text-center font-black text-yellow-500">{p.ops.toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-32 text-slate-500 border-2 border-dashed border-slate-700 rounded-3xl bg-slate-800/30">
          <Users className="w-20 h-20 mb-6 opacity-20" />
          {selectedTeam ? (
            <>
              <p className="text-xl font-medium text-amber-400">データが不足しています</p>
              <p className="text-sm mt-2 text-center max-w-md">このデータには <code className="bg-slate-700 px-1 rounded">events</code> 列がありません。<br />打率・長打率の算出には「single/double/home_run...」等の試合結果列が必要です。</p>
            </>
          ) : (
            <>
              <p className="text-xl font-medium">{teams.length > 0 ? 'チームを選択してスタッツを生成' : 'データを読み込んでください'}</p>
              <p className="text-sm mt-2">Rapsodoの <code className="bg-slate-700 px-1 rounded">events</code> 列を元に自動算出します</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default GameStats;
