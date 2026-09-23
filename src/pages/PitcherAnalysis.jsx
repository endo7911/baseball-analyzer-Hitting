import React, { useState, useEffect, useMemo } from 'react';
import { 
  ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ReferenceLine 
} from 'recharts';
import { 
  groupEventsByTeamAndPlayer, 
  getDataValue, 
  getPitcherHand,
  getSpinDirectionClock,
  PITCH_VELO_KEYS, 
  SPIN_RATE_KEYS, 
  SPIN_EFFICIENCY_KEYS,
  VB_TRAJ_KEYS, 
  HB_TRAJ_KEYS, 
  PITCH_TYPE_KEYS, 
  RELEASE_HEIGHT_KEYS, 
  RELEASE_SIDE_KEYS 
} from '../utils/dataHelpers';
import { Target, Users, Settings2, Info, Move, Crosshair, Table, Activity, Zap, Layers, Hash, ChevronRight } from 'lucide-react';

const COLOR_MAP = {
  "4-Seam Fastball": "#ef4444",
  "ストレート": "#ef4444",
  "Fastball": "#ef4444",
  "Quick Fastball": "#f87171",
  "クイックストレート": "#f87171",
  "Slider": "#eab308",
  "スライダー": "#eab308",
  "Curveball": "#06b6d4",
  "カーブ": "#06b6d4",
  "Changeup": "#22c55e",
  "チェンジアップ": "#22c55e",
  "Cutter": "#a855f7",
  "カッター": "#a855f7",
  "Sinker": "#f97316",
  "シンカー": "#f97316",
  "ツーシーム": "#f97316",
  "2-Seam Fastball": "#f97316",
  "Split-Finger": "#3b82f6",
  "Splitter": "#3b82f6",
  "スプリット": "#3b82f6",
  "フォーク": "#3b82f6",
  "Forkball": "#3b82f6",
  "Sweeper": "#d97706",
  "スイーパー": "#d97706",
  "Knuckle Curve": "#1d4ed8",
  "ナックルカーブ": "#1d4ed8",
  "Other": "#94a3b8",
  "その他": "#94a3b8"
};

const getPitchColor = (pitchType) => {
  if (!pitchType) return COLOR_MAP["Other"];
  const typeStr = String(pitchType).trim();
  for (const [key, color] of Object.entries(COLOR_MAP)) {
    if (typeStr.toLowerCase() === key.toLowerCase() || typeStr.toLowerCase().includes(key.toLowerCase())) {
      return color;
    }
  }
  return COLOR_MAP["Other"];
};

const getPitchName = (row) => {
  for (const k of PITCH_TYPE_KEYS) {
    if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') {
      return String(row[k]).trim();
    }
  }
  return 'その他';
};

function PitcherAnalysis({ savantData, blastData, combinedData, initialTeam, initialSource, onViewPlayer }) {
  const defaultSource = useMemo(() => {
    if (initialSource) return initialSource;
    if (savantData?.data?.length > 0) return 'savant';
    if (combinedData?.data?.length > 0) return 'combined';
    if (blastData?.data?.length > 0) return 'blast';
    return 'savant';
  }, [initialSource, savantData, blastData, combinedData]);

  const [sourceType, setSourceType] = useState(defaultSource);
  const activeData = sourceType === 'savant' ? savantData : sourceType === 'blast' ? blastData : combinedData;

  const [teams, setTeams] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState(initialTeam || '');
  const [nameKey, setNameKey] = useState('pitcher_name');
  const [groupedData, setGroupedData] = useState({});
  const [handFilter, setHandFilter] = useState('ALL'); // 'ALL' | 'R' | 'L'
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
        'pitcher_name', 'Pitcher Name', 'Pitcher', 'PitcherName', '投手名', '投手', 
        'Player Name', 'player_name', 'PlayerName', '選手名', '氏名', 'pitcher', 'name', 'Name', '名前'
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

  // Aggregate statistics for each pitcher in the selected team
  const pitcherSummaries = useMemo(() => {
    if (!selectedTeam || !groupedData[selectedTeam]) return [];

    const pitchersMap = groupedData[selectedTeam];
    
    return Object.entries(pitchersMap).map(([pName, events]) => {
      const hand = getPitcherHand(events);
      const totalCount = events.length;

      const velos = [];
      const fbVelos = [];
      const spins = [];
      const fbSpins = [];
      const effs = [];
      const fbEffs = [];
      const vbs = [];
      const fbVbs = [];
      const hbs = [];
      const fbHbs = [];
      const releaseZs = [];
      const releaseXs = [];
      const pitchCounts = {};

      events.forEach(row => {
        const pType = getPitchName(row);
        pitchCounts[pType] = (pitchCounts[pType] || 0) + 1;

        const velo = getDataValue(row, PITCH_VELO_KEYS);
        const spin = getDataValue(row, SPIN_RATE_KEYS);
        const eff = getDataValue(row, SPIN_EFFICIENCY_KEYS);
        const vb = getDataValue(row, VB_TRAJ_KEYS);
        const hb = getDataValue(row, HB_TRAJ_KEYS);
        const rz = getDataValue(row, RELEASE_HEIGHT_KEYS);
        const rx = getDataValue(row, RELEASE_SIDE_KEYS);

        const isFb = pType.toLowerCase().includes('ストレート') || pType.toLowerCase().includes('fastball') || pType.toLowerCase().includes('4-seam') || pType.toLowerCase().includes('ff');

        if (velo > 0) {
          velos.push(velo);
          if (isFb) fbVelos.push(velo);
        }
        if (spin > 0) {
          spins.push(spin);
          if (isFb) fbSpins.push(spin);
        }
        if (eff > 0) {
          effs.push(eff);
          if (isFb) fbEffs.push(eff);
        }
        if (vb !== 0) {
          vbs.push(vb);
          if (isFb) fbVbs.push(vb);
        }
        if (hb !== 0) {
          hbs.push(hb);
          if (isFb) fbHbs.push(hb);
        }
        if (rz > 0) releaseZs.push(rz);
        if (rx !== 0) releaseXs.push(rx);
      });

      const maxVelo = velos.length > 0 ? Math.max(...velos) : 0;
      const avgVelo = velos.length > 0 ? (velos.reduce((a, b) => a + b, 0) / velos.length) : 0;
      const fbAvgVelo = fbVelos.length > 0 ? (fbVelos.reduce((a, b) => a + b, 0) / fbVelos.length) : avgVelo;
      
      const fbAvgSpin = fbSpins.length > 0 ? Math.round(fbSpins.reduce((a, b) => a + b, 0) / fbSpins.length) : (spins.length > 0 ? Math.round(spins.reduce((a, b) => a + b, 0) / spins.length) : 0);
      const fbAvgEff = fbEffs.length > 0 ? (fbEffs.reduce((a, b) => a + b, 0) / fbEffs.length) : (effs.length > 0 ? (effs.reduce((a, b) => a + b, 0) / effs.length) : 0);
      const fbAvgVb = fbVbs.length > 0 ? (fbVbs.reduce((a, b) => a + b, 0) / fbVbs.length) : (vbs.length > 0 ? (vbs.reduce((a, b) => a + b, 0) / vbs.length) : 0);
      const fbAvgHb = fbHbs.length > 0 ? (fbHbs.reduce((a, b) => a + b, 0) / fbHbs.length) : (hbs.length > 0 ? (hbs.reduce((a, b) => a + b, 0) / hbs.length) : 0);
      
      const avgReleaseZ = releaseZs.length > 0 ? (releaseZs.reduce((a, b) => a + b, 0) / releaseZs.length) : 0;
      const avgReleaseX = releaseXs.length > 0 ? (releaseXs.reduce((a, b) => a + b, 0) / releaseXs.length) : 0;

      // Top 3 pitch types
      const topPitches = Object.entries(pitchCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([type, cnt]) => `${type} (${Math.round((cnt / totalCount) * 100)}%)`)
        .join(', ');

      return {
        name: pName,
        hand,
        totalCount,
        maxVelo: maxVelo > 0 ? maxVelo.toFixed(1) : '-',
        numericMaxVelo: maxVelo,
        fbAvgVelo: fbAvgVelo > 0 ? fbAvgVelo.toFixed(1) : '-',
        avgVelo: avgVelo > 0 ? avgVelo.toFixed(1) : '-',
        fbAvgSpin: fbAvgSpin > 0 ? fbAvgSpin : '-',
        fbAvgEff: fbAvgEff > 0 ? `${fbAvgEff.toFixed(1)}%` : '-',
        fbAvgVb: fbAvgVb !== 0 ? (fbAvgVb > 0 ? `+${fbAvgVb.toFixed(1)}` : fbAvgVb.toFixed(1)) : '-',
        fbAvgHb: fbAvgHb !== 0 ? (fbAvgHb > 0 ? `+${fbAvgHb.toFixed(1)}` : fbAvgHb.toFixed(1)) : '-',
        avgReleaseZ: avgReleaseZ > 0 ? avgReleaseZ.toFixed(2) : '-',
        avgReleaseX: avgReleaseX !== 0 ? avgReleaseX.toFixed(2) : '-',
        topPitches,
        events
      };
    }).sort((a, b) => b.totalCount - a.totalCount);
  }, [selectedTeam, groupedData]);

  // Filtered pitchers based on Hand Filter (ALL / R / L)
  const filteredPitchers = useMemo(() => {
    if (handFilter === 'ALL') return pitcherSummaries;
    return pitcherSummaries.filter(p => p.hand === handFilter);
  }, [pitcherSummaries, handFilter]);

  // Combined events for filtered pitchers
  const filteredEvents = useMemo(() => {
    return filteredPitchers.flatMap(p => p.events);
  }, [filteredPitchers]);

  // Team Summary KPIs
  const teamKPIs = useMemo(() => {
    const rhpCount = pitcherSummaries.filter(p => p.hand === 'R').length;
    const lhpCount = pitcherSummaries.filter(p => p.hand === 'L').length;
    const totalPitches = filteredEvents.length;

    const allVelos = [];
    const allFbVelos = [];

    filteredEvents.forEach(row => {
      const v = getDataValue(row, PITCH_VELO_KEYS);
      const pType = getPitchName(row);
      const isFb = pType.toLowerCase().includes('ストレート') || pType.toLowerCase().includes('fastball') || pType.toLowerCase().includes('4-seam');
      if (v > 0) {
        allVelos.push(v);
        if (isFb) allFbVelos.push(v);
      }
    });

    const maxVelo = allVelos.length > 0 ? Math.max(...allVelos).toFixed(1) : '-';
    const fbAvgVelo = allFbVelos.length > 0 ? (allFbVelos.reduce((a, b) => a + b, 0) / allFbVelos.length).toFixed(1) : '-';

    return {
      totalPitchers: pitcherSummaries.length,
      rhpCount,
      lhpCount,
      activePitcherCount: filteredPitchers.length,
      totalPitches,
      maxVelo,
      fbAvgVelo
    };
  }, [pitcherSummaries, filteredPitchers, filteredEvents]);

  // Movement Scatter Data for Team
  const teamMovementData = useMemo(() => {
    return filteredPitchers.flatMap(p => {
      return p.events
        .map(row => {
          const vb = getDataValue(row, VB_TRAJ_KEYS);
          const hb = getDataValue(row, HB_TRAJ_KEYS);
          const pitchType = getPitchName(row);
          const velo = getDataValue(row, PITCH_VELO_KEYS);
          const spin = getDataValue(row, SPIN_RATE_KEYS);

          if (vb === 0 && hb === 0) return null;

          return {
            x: Number(hb.toFixed(1)),
            y: Number(vb.toFixed(1)),
            pitcherName: p.name,
            pitchType,
            velo,
            spin,
            hand: p.hand,
            color: getPitchColor(pitchType)
          };
        })
        .filter(Boolean);
    });
  }, [filteredPitchers]);

  // Release Point Scatter Data for Team (Color-coded by RHP vs LHP)
  const teamReleaseData = useMemo(() => {
    return filteredPitchers.flatMap(p => {
      return p.events
        .map(row => {
          const rz = getDataValue(row, RELEASE_HEIGHT_KEYS);
          const rx = getDataValue(row, RELEASE_SIDE_KEYS);
          const pitchType = getPitchName(row);

          if (rz === 0 && rx === 0) return null;

          return {
            x: Number(rx.toFixed(2)),
            y: Number(rz.toFixed(2)),
            pitcherName: p.name,
            hand: p.hand,
            pitchType,
            color: p.hand === 'R' ? '#3b82f6' : '#f97316' // Blue for RHP, Orange for LHP
          };
        })
        .filter(Boolean);
    });
  }, [filteredPitchers]);

  // Dynamic Release Domain with ±0.1 margin
  const teamReleaseBounds = useMemo(() => {
    if (teamReleaseData.length === 0) return { minX: -0.5, maxX: 0.5, minY: 1.5, maxY: 2.0 };
    const xs = teamReleaseData.map(d => d.x);
    const ys = teamReleaseData.map(d => d.y);
    return {
      minX: Number((Math.min(...xs) - 0.1).toFixed(2)),
      maxX: Number((Math.max(...xs) + 0.1).toFixed(2)),
      minY: Number((Math.min(...ys) - 0.1).toFixed(2)),
      maxY: Number((Math.max(...ys) + 0.1).toFixed(2))
    };
  }, [teamReleaseData]);

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <header className="mb-6 print:hidden">
        <h2 className="text-4xl font-extrabold text-white mb-2 flex items-center gap-3">
          <Target className="w-10 h-10 text-blue-400" /> 投手分析（チーム・左右別）
        </h2>
        <p className="text-slate-400 text-lg">
          チーム全体の投手陣スタッツを右投手(RHP)・左投手(LHP)別に比較分析します。
        </p>
      </header>

      {/* Control Toolbar */}
      <div className="bg-blue-900/10 border-2 border-blue-500/30 p-6 rounded-3xl shadow-2xl backdrop-blur-sm print:hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex flex-wrap items-center gap-6">
            <div>
              <label className="block text-xs font-bold text-blue-400 mb-1.5 uppercase tracking-widest">
                対象チーム
              </label>
              <select
                value={selectedTeam}
                onChange={(e) => setSelectedTeam(e.target.value)}
                className="bg-slate-900 border border-slate-700 hover:border-slate-500 text-white rounded-xl px-4 py-2.5 text-base font-bold outline-none"
              >
                {teams.map((team, idx) => (
                  <option key={idx} value={team}>{team}</option>
                ))}
              </select>
            </div>

            {/* Hand Filter Buttons */}
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-widest">
                投手左右フィルター
              </label>
              <div className="bg-slate-900 p-1 rounded-xl border border-slate-800 flex items-center gap-1">
                <button
                  onClick={() => setHandFilter('ALL')}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    handFilter === 'ALL'
                      ? 'bg-blue-600 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  全投手 ({teamKPIs.totalPitchers}名)
                </button>
                <button
                  onClick={() => setHandFilter('R')}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-all ${
                    handFilter === 'R'
                      ? 'bg-blue-600 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-blue-400"></span> 右投手 RHP ({teamKPIs.rhpCount}名)
                </button>
                <button
                  onClick={() => setHandFilter('L')}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-all ${
                    handFilter === 'L'
                      ? 'bg-orange-600 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-orange-400"></span> 左投手 LHP ({teamKPIs.lhpCount}名)
                </button>
              </div>
            </div>
          </div>

          <div className="text-right text-xs text-slate-400">
            <span>データ件数: <strong className="text-white">{teamKPIs.totalPitches} 投球</strong></span>
          </div>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-2xl text-center shadow-lg flex flex-col justify-center items-center min-h-[100px]">
          <p className="text-xs text-slate-400 font-bold flex items-center justify-center gap-1">
            <Users className="w-3.5 h-3.5 text-blue-400" /> 該当投手人数
          </p>
          <p className="text-2xl font-black text-white mt-1">
            {teamKPIs.activePitcherCount} <span className="text-xs text-slate-400 font-normal">名</span>
          </p>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-2xl text-center shadow-lg flex flex-col justify-center items-center min-h-[100px]">
          <p className="text-xs text-slate-400 font-bold flex items-center justify-center gap-1">
            <Hash className="w-3.5 h-3.5 text-purple-400" /> 総投球数
          </p>
          <p className="text-2xl font-black text-purple-400 mt-1">
            {teamKPIs.totalPitches} <span className="text-xs text-slate-400 font-normal">球</span>
          </p>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-2xl text-center shadow-lg flex flex-col justify-center items-center min-h-[100px]">
          <p className="text-xs text-slate-400 font-bold flex items-center justify-center gap-1">
            <Zap className="w-3.5 h-3.5 text-amber-400" /> チーム最速
          </p>
          <p className="text-2xl font-black text-amber-400 mt-1">
            {teamKPIs.maxVelo} {teamKPIs.maxVelo !== '-' && <span className="text-xs text-slate-400 font-normal">km/h</span>}
          </p>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-2xl text-center shadow-lg flex flex-col justify-center items-center min-h-[100px]">
          <p className="text-xs text-slate-400 font-bold flex items-center justify-center gap-1">
            <Activity className="w-3.5 h-3.5 text-emerald-400" /> FB平均球速
          </p>
          <p className="text-2xl font-black text-emerald-400 mt-1">
            {teamKPIs.fbAvgVelo} {teamKPIs.fbAvgVelo !== '-' && <span className="text-xs text-slate-400 font-normal">km/h</span>}
          </p>
        </div>
      </div>

      {/* Team Pitchers Leaderboard Table */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Table className="w-5 h-5 text-blue-400" />
            <h3 className="text-xl font-bold text-white">
              チーム投手一覧・左右別スタッツ ({filteredPitchers.length}名)
            </h3>
          </div>
          <span className="text-xs text-slate-500">※個人の詳細な分析レポートは「個人分析」ページから閲覧できます</span>
        </div>

        <div className="overflow-x-auto print:overflow-visible">
          <table className="w-full text-left text-sm text-slate-300 print:text-[7.5pt]">
            <thead>
              <tr className="border-b border-slate-800 text-xs text-slate-400 font-bold uppercase tracking-wider print:text-[7pt]">
                <th className="py-3.5 px-3 print:py-1 print:px-1">投手名</th>
                <th className="py-3.5 px-3 text-center print:py-1 print:px-1">左右</th>
                <th className="py-3.5 px-3 text-right print:py-1 print:px-1">投球数</th>
                <th className="py-3.5 px-3 text-right print:py-1 print:px-1">最速</th>
                <th className="py-3.5 px-3 text-right print:py-1 print:px-1">FB平均</th>
                <th className="py-3.5 px-3 text-right print:py-1 print:px-1">FB回転</th>
                <th className="py-3.5 px-3 text-right print:py-1 print:px-1">FB効率</th>
                <th className="py-3.5 px-3 text-right print:py-1 print:px-1">FB縦変化</th>
                <th className="py-3.5 px-3 text-right print:py-1 print:px-1">FB横変化</th>
                <th className="py-3.5 px-3 text-right print:py-1 print:px-1">リリース高度</th>
                <th className="py-3.5 px-3 text-right print:py-1 print:px-1">リリース幅</th>
                <th className="py-3.5 px-3 print:py-1 print:px-1">球種割合</th>
                <th className="py-3.5 px-3 text-center print:hidden">レポート</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredPitchers.map(p => (
                <tr key={p.name} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-4 px-3 font-bold text-white text-base print:py-1 print:px-1 print:text-[8px]">{p.name}</td>
                  <td className="py-4 px-3 text-center print:py-1 print:px-1 print:text-[8px]">
                    <span className={`px-2 py-0.5 text-xs print:text-[7pt] font-black rounded-md ${
                      p.hand === 'R' ? 'bg-blue-600/30 text-blue-300 border border-blue-500/40' : 'bg-orange-600/30 text-orange-300 border border-orange-500/40'
                    }`}>
                      {p.hand === 'R' ? '右' : '左'}
                    </span>
                  </td>
                  <td className="py-4 px-3 text-right font-mono font-bold text-slate-200 print:py-1 print:px-1 print:text-[8px]">{p.totalCount}</td>
                  <td className="py-4 px-3 text-right font-mono font-bold text-amber-400 print:py-1 print:px-1 print:text-[8px]">{p.maxVelo}</td>
                  <td className="py-4 px-3 text-right font-mono font-bold text-emerald-400 print:py-1 print:px-1 print:text-[8px]">{p.fbAvgVelo}</td>
                  <td className="py-4 px-3 text-right font-mono text-emerald-300 print:py-1 print:px-1 print:text-[8px]">{p.fbAvgSpin}</td>
                  <td className="py-4 px-3 text-right font-mono text-slate-300 print:py-1 print:px-1 print:text-[8px]">{p.fbAvgEff}</td>
                  <td className={`py-4 px-3 text-right font-mono print:py-1 print:px-1 print:text-[8px] ${String(p.fbAvgVb).includes('+') ? 'text-emerald-400' : 'text-rose-400'}`}>{p.fbAvgVb}</td>
                  <td className={`py-4 px-3 text-right font-mono print:py-1 print:px-1 print:text-[8px] ${String(p.fbAvgHb).includes('+') ? 'text-blue-400' : 'text-orange-400'}`}>{p.fbAvgHb}</td>
                  <td className="py-4 px-3 text-right font-mono text-slate-400 print:py-1 print:px-1 print:text-[8px]">{p.avgReleaseZ}</td>
                  <td className="py-4 px-3 text-right font-mono text-slate-400 print:py-1 print:px-1 print:text-[8px]">{p.avgReleaseX}</td>
                  <td className="py-4 px-3 text-xs text-slate-400 font-medium print:py-1 print:px-1 print:text-[7.5pt]">{p.topPitches}</td>
                  <td className="py-4 px-3 text-center print:hidden">
                    <button
                      onClick={() => onViewPlayer && onViewPlayer(p.name, selectedTeam, sourceType)}
                      className="px-3 py-1.5 bg-blue-600/30 hover:bg-blue-600 text-blue-300 hover:text-white border border-blue-500/40 rounded-xl text-xs font-bold transition-all flex items-center gap-1 mx-auto shadow-sm whitespace-nowrap"
                    >
                      レポートへ <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 2-Column Grid: Team Movement Chart & Release Point Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left: Team Movement Scatter Chart */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Move className="w-5 h-5 text-emerald-400" />
                <h3 className="text-xl font-bold text-white">チーム球種別 変化量マップ</h3>
              </div>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              横軸: 横変化量 HB (trajectory) / 縦軸: 縦変化量 VB (trajectory) [-70 ～ +70 固定・中央原点(0,0)]
            </p>

            {teamMovementData.length > 0 ? (
              <div className="w-full aspect-square max-w-[440px] mx-auto relative bg-slate-950/90 border border-slate-800 rounded-2xl p-4 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 25, right: 55, bottom: 25, left: 15 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                    <XAxis 
                      type="number" 
                      dataKey="x" 
                      name="HB" 
                      domain={[-70, 70]} 
                      ticks={[-70, -35, 0, 35, 70]} 
                      stroke="#94a3b8" 
                      fontSize={11} 
                      height={30}
                    />
                    <YAxis 
                      type="number" 
                      dataKey="y" 
                      name="VB" 
                      domain={[-70, 70]} 
                      ticks={[-70, -35, 0, 35, 70]} 
                      stroke="#94a3b8" 
                      fontSize={11} 
                      width={40}
                    />
                    <ReferenceLine x={0} stroke="#64748b" strokeWidth={2} />
                    <ReferenceLine y={0} stroke="#64748b" strokeWidth={2} />
                    <Tooltip 
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-slate-900 border border-slate-700 p-3 rounded-xl shadow-2xl text-xs space-y-1.5 z-50">
                              <p className="font-black text-blue-400 text-sm border-b border-slate-800 pb-1 flex items-center gap-1.5">
                                <Users className="w-3.5 h-3.5 text-blue-400" />
                                {data.pitcherName}
                              </p>
                              <p className="font-extrabold text-white flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: data.color }}></span>
                                {data.pitchType} ({data.hand === 'R' ? '右投手' : '左投手'})
                              </p>
                              <p className="text-slate-300">球速: <strong className="text-amber-400">{data.velo} km/h</strong></p>
                              <p className="text-slate-300">縦変化: <strong className="text-blue-400">{data.y}</strong> / 横変化: <strong className="text-purple-400">{data.x}</strong></p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Scatter name="TeamPitches" data={teamMovementData}>
                      {teamMovementData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} fillOpacity={0.7} stroke="#ffffff" strokeWidth={0.5} />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[340px] flex items-center justify-center text-slate-500 border border-dashed border-slate-800 rounded-2xl">
                変化量データが存在しません
              </div>
            )}
          </div>
        </div>

        {/* Right: Team Release Point Comparison Scatter Chart (Color coded by RHP vs LHP) */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Crosshair className="w-5 h-5 text-purple-400" />
                <h3 className="text-xl font-bold text-white">リリースポイント 左右比較チャート図</h3>
              </div>
              <div className="flex items-center gap-3 text-xs font-bold">
                <span className="flex items-center gap-1 text-blue-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span> 右投手 (RHP)
                </span>
                <span className="flex items-center gap-1 text-orange-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-orange-500"></span> 左投手 (LHP)
                </span>
              </div>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              横軸: リリリース幅 Release Side / 縦軸: リリリース高度 Release Height (上下±0.1m余白)
            </p>

            {teamReleaseData.length > 0 ? (
              <div className="w-full aspect-square max-w-[440px] mx-auto relative bg-slate-950/90 border border-slate-800 rounded-2xl p-4 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 25, right: 55, bottom: 25, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                    <XAxis 
                      type="number" 
                      dataKey="x" 
                      name="Release Side" 
                      domain={[teamReleaseBounds.minX, teamReleaseBounds.maxX]} 
                      stroke="#94a3b8" 
                      fontSize={11} 
                      height={30}
                    />
                    <YAxis 
                      type="number" 
                      dataKey="y" 
                      name="Release Height" 
                      domain={[teamReleaseBounds.minY, teamReleaseBounds.maxY]} 
                      stroke="#94a3b8" 
                      fontSize={11} 
                      width={45}
                    />
                    <Tooltip 
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-slate-900 border border-slate-700 p-3 rounded-xl shadow-2xl text-xs space-y-1.5 z-50">
                              <p className="font-black text-blue-400 text-sm border-b border-slate-800 pb-1 flex items-center gap-1.5">
                                <Users className="w-3.5 h-3.5 text-blue-400" />
                                {data.pitcherName}
                              </p>
                              <p className="font-extrabold text-white flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: data.color }}></span>
                                {data.pitchType} ({data.hand === 'R' ? '右投手' : '左投手'})
                              </p>
                              <p className="text-slate-300">高度: <strong className="text-purple-400">{data.y} m</strong> / 幅: <strong className="text-blue-400">{data.x} m</strong></p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Scatter name="TeamReleasePoints" data={teamReleaseData}>
                      {teamReleaseData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} fillOpacity={0.7} stroke="#ffffff" strokeWidth={0.5} />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[340px] flex items-center justify-center text-slate-500 border border-dashed border-slate-800 rounded-2xl text-xs">
                リリース高度・幅データが存在しません
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default PitcherAnalysis;
