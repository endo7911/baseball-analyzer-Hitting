import React, { useState, useEffect } from 'react';
import { extractTeams, extractPlayersByTeam, getPlayerStats, groupEventsByTeamAndPlayer, EV_KEYS, BS_KEYS, getDataValue } from '../utils/dataHelpers';
import PlayerProfile from '../components/PlayerProfile';
import { Users, User, Settings2 } from 'lucide-react';

function PlayerAnalysis({ savantData, blastData, combinedData, initialPlayer, initialTeam, initialSource }) {
  const [sourceType, setSourceType] = useState(initialSource || 'combined');
  const activeData = sourceType === 'savant' ? savantData : sourceType === 'blast' ? blastData : combinedData;
  
  const [teams, setTeams] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState(initialTeam || '');
  const [players, setPlayers] = useState([]);
  const [selectedPlayer, setSelectedPlayer] = useState(initialPlayer || '');
  const [playerStats, setPlayerStats] = useState(null);
  const [nameKey, setNameKey] = useState('player_name');
  const [groupedData, setGroupedData] = useState({});
  const headers = activeData ? activeData.headers : [];

  useEffect(() => {
    if (activeData && activeData.data) {
      // Determine best teamKey - Prioritize 'Team' as requested
      const teamCandidates = ['チーム名', 'チーム', 'Team', 'team_name', 'home_team', 'away_team', 'Unknown Team'];
      const teamKey = headers.find(h => teamCandidates.includes(h)) || 'Unknown Team';

      // Rank candidates for Player Name - batter_name is where 'Player Name' gets mapped after cloud sync
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

      const grouped = groupEventsByTeamAndPlayer(activeData.data, teamKey, bestNameKey);
      setGroupedData(grouped);
      const availableTeams = Object.keys(grouped).sort();
      setTeams(availableTeams);
      
      if (availableTeams.length === 1) {
        setSelectedTeam(availableTeams[0]);
      } else if (initialTeam && grouped[initialTeam]) {
        setSelectedTeam(initialTeam);
      }
    }
  }, [activeData, nameKey, initialTeam, headers]);

  useEffect(() => {
    if (selectedTeam && groupedData[selectedTeam]) {
      const teamPlayers = Object.keys(groupedData[selectedTeam]).sort();
      setPlayers(teamPlayers);
      
      // 修正: すでに選択されている選手が新しいチームリストに含まれている場合は、リセットしない
      if (selectedPlayer && teamPlayers.includes(selectedPlayer)) {
        // 保持
      } else if (initialPlayer && teamPlayers.includes(initialPlayer)) {
        // 初期値があればそれを優先
        setSelectedPlayer(initialPlayer);
      } else {
        setSelectedPlayer('');
        setPlayerStats(null);
      }
    }
  }, [selectedTeam, groupedData, initialPlayer]);

  useEffect(() => {
    if (selectedPlayer && selectedTeam && groupedData[selectedTeam] && groupedData[selectedTeam][selectedPlayer]) {
      const events = groupedData[selectedTeam][selectedPlayer];
      
      let sEvents = [];
      let bEvents = [];

      if (sourceType === 'savant') {
        sEvents = events;
      } else if (sourceType === 'blast') {
        bEvents = events;
      } else {
        // combined: for 1-file integrated CSVs or combined files, supply events to both arrays so all metrics render
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

  return (
    <div className="animate-in fade-in duration-300">
      <header className="mb-10 print:hidden">
        <h2 className="text-4xl font-extrabold text-white mb-2">個人成績分析</h2>
        <p className="text-slate-400 text-lg">選手を特定して詳細な打撃レポートを表示します。</p>
      </header>

      <div className="bg-blue-900/10 border-2 border-blue-500/30 p-8 rounded-3xl mb-10 shadow-2xl backdrop-blur-sm print:hidden">
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
            <p className="text-xs text-slate-500 mb-3">※Rapsodoは「Player Name」を選択してください</p>
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

          {!(teams.length === 1 && teams[0] === 'Unknown Team') && (
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
          )}

          <div>
            <label className="block text-sm font-bold text-slate-400 mb-2 uppercase tracking-widest">
              3. 対象選手
            </label>
            <p className="text-xs text-slate-500 mb-3 invisible">spacer</p>
            <select
              value={selectedPlayer}
              onChange={(e) => setSelectedPlayer(e.target.value)}
              disabled={!selectedTeam || players.length === 0}
              className="w-full bg-slate-900 border border-slate-700 hover:border-slate-500 text-white rounded-xl p-4 focus:ring-4 focus:ring-blue-500/20 outline-none transition-all text-lg disabled:opacity-30 disabled:cursor-not-allowed font-bold"
            >
              <option value="">-- 選手を選択 --</option>
              {players.map((player, idx) => (
                <option key={idx} value={player}>{player}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {playerStats ? (
        <PlayerProfile playerName={selectedPlayer} stats={playerStats} isCombined={sourceType === 'combined'} />
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500 border-2 border-dashed border-slate-700 rounded-2xl bg-slate-800/30">
          <User className="w-16 h-16 mb-4 opacity-30" />
          <p className="text-lg">上のメニューからチームと選手を選択してください</p>
        </div>
      )}
    </div>
  );
}

export default PlayerAnalysis;
