import React, { useState, useEffect, useMemo } from 'react';
import { 
  ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ReferenceLine,
  ComposedChart, Line, Bar, Legend
} from 'recharts';
import { 
  groupEventsByTeamAndPlayer, 
  getDataValue,
  getRawDataValue,
  parseAnyDate,
  DEFAULT_DATE_KEYS,
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
import { Target, Users, Settings2, Info, Move, Crosshair, Table, Activity, Zap, Layers, Hash, ChevronRight, Calendar } from 'lucide-react';

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
  // PitcherAnalysis uses only savantData (投手専用CSV). combinedData/blastData are not used.
  const activeData = savantData;

  const [teams, setTeams] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState(initialTeam || '');
  const [nameKey, setNameKey] = useState('pitcher_name');
  const [groupedData, setGroupedData] = useState({});
  const [handFilter, setHandFilter] = useState('ALL'); // 'ALL' | 'R' | 'L'
  const [teamDateTrendMetric, setTeamDateTrendMetric] = useState('fb_velo');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showNameKeyConfig, setShowNameKeyConfig] = useState(false);

  // Pitcher Overlay Comparison State
  const [pitcherA, setPitcherA] = useState('');
  const [pitcherB, setPitcherB] = useState('');
  const [comparePitchType, setComparePitchType] = useState('ALL');
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

  // Filter activeData by date range
  const filteredActiveData = useMemo(() => {
    if (!activeData?.data) return [];
    if (!startDate && !endDate) return activeData.data;
    return activeData.data.filter(e => {
      const rawDate = getRawDataValue(e, DEFAULT_DATE_KEYS) || e.date || e.game_date || e.file_name || e.filename || '';
      const dateStr = parseAnyDate(rawDate);
      if (!dateStr) return false;
      if (startDate && dateStr < startDate) return false;
      if (endDate && dateStr > endDate) return false;
      return true;
    });
  }, [activeData, startDate, endDate]);

  useEffect(() => {
    if (filteredActiveData && filteredActiveData.length > 0) {
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

      const grouped = groupEventsByTeamAndPlayer(filteredActiveData, teamKey, bestNameKey);
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
  }, [filteredActiveData, nameKey, initialTeam, headers]);

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

  // Default pitcher selections for comparison
  useEffect(() => {
    if (pitcherSummaries.length > 0) {
      if (!pitcherA || !pitcherSummaries.some(p => p.name === pitcherA)) {
        setPitcherA(pitcherSummaries[0].name);
      }
      if (!pitcherB || !pitcherSummaries.some(p => p.name === pitcherB)) {
        setPitcherB(pitcherSummaries[1]?.name || pitcherSummaries[0].name);
      }
    }
  }, [pitcherSummaries]);

  // Pitcher Comparison Overlay Data
  const comparisonData = useMemo(() => {
    const summaryA = pitcherSummaries.find(p => p.name === pitcherA);
    const summaryB = pitcherSummaries.find(p => p.name === pitcherB);

    const getMovement = (summary, pitcherName, color) => {
      if (!summary || !summary.events) return [];
      return summary.events.filter(e => {
        if (!e) return false;
        if (comparePitchType !== 'ALL') {
          const pt = (getDataValue(e, PITCH_TYPE_KEYS) || '').toLowerCase();
          if (!pt.includes(comparePitchType.toLowerCase())) return false;
        }
        return true;
      }).map(e => {
        const vb = getDataValue(e, VB_TRAJ_KEYS);
        const hb = getDataValue(e, HB_TRAJ_KEYS);
        const velo = getDataValue(e, PITCH_VELO_KEYS);
        const pitchType = getDataValue(e, PITCH_TYPE_KEYS) || 'Unknown';
        return {
          x: Number(hb.toFixed(1)),
          y: Number(vb.toFixed(1)),
          velo: velo > 0 ? velo.toFixed(1) : '-',
          pitchType,
          pitcherName,
          color
        };
      }).filter(d => d.x !== 0 || d.y !== 0);
    };

    const getStats = (summary) => {
      if (!summary) return null;
      return {
        count: summary.totalCount,
        maxVelo: summary.maxVelo,
        fbAvgVelo: summary.fbAvgVelo,
        fbAvgSpin: summary.fbAvgSpin,
        fbAvgSpinEff: summary.fbAvgEff,
        fbAvgVb: summary.fbAvgVb,
        fbAvgHb: summary.fbAvgHb,
        avgReleaseZ: summary.avgReleaseZ,
        avgReleaseX: summary.avgReleaseX,
      };
    };

    return {
      movementA: getMovement(summaryA, pitcherA || '投手A', '#38bdf8'),
      movementB: getMovement(summaryB, pitcherB || '投手B', '#fb923c'),
      statsA: getStats(summaryA),
      statsB: getStats(summaryB),
    };
  }, [pitcherSummaries, pitcherA, pitcherB, comparePitchType]);

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

  // Team Date Trend Data (aggregate all filteredPitchers events by date)
  const teamDateTrendData = useMemo(() => {
    if (filteredEvents.length === 0) return [];
    const datesMap = {};

    filteredEvents.forEach(row => {
      const rawDate = getRawDataValue(row, DEFAULT_DATE_KEYS) || row.date || row.game_date || '';
      const dateStr = parseAnyDate(rawDate);
      if (!dateStr) return;

      if (!datesMap[dateStr]) {
        datesMap[dateStr] = {
          date: dateStr,
          fbVelos: [], allVelos: [], spins: [], effs: [],
          vbs: [], hbs: [], releaseZs: [], releaseXs: [], count: 0
        };
      }
      const item = datesMap[dateStr];
      item.count++;
      const pType = getPitchName(row);
      const isFb = pType.toLowerCase().includes('ストレート') || pType.toLowerCase().includes('fastball') || pType.toLowerCase().includes('4-seam');
      const velo = getDataValue(row, PITCH_VELO_KEYS);
      const spin = getDataValue(row, SPIN_RATE_KEYS);
      const eff = getDataValue(row, SPIN_EFFICIENCY_KEYS);
      const vb = getDataValue(row, VB_TRAJ_KEYS);
      const hb = getDataValue(row, HB_TRAJ_KEYS);
      const rz = getDataValue(row, RELEASE_HEIGHT_KEYS);
      const rx = getDataValue(row, RELEASE_SIDE_KEYS);

      if (velo > 0) { item.allVelos.push(velo); if (isFb) item.fbVelos.push(velo); }
      if (spin > 0) item.spins.push(spin);
      if (eff > 0) item.effs.push(eff);
      if (vb !== 0) item.vbs.push(vb);
      if (hb !== 0) item.hbs.push(hb);
      if (rz > 0) item.releaseZs.push(rz);
      if (rx !== 0) item.releaseXs.push(rx);
    });

    return Object.keys(datesMap).sort().map(d => {
      const item = datesMap[d];
      const avg = arr => arr.length > 0 ? Number((arr.reduce((a,b)=>a+b,0)/arr.length).toFixed(1)) : null;
      const max = arr => arr.length > 0 ? Number(Math.max(...arr).toFixed(1)) : null;
      return {
        date: d,
        count: item.count,
        fbAvg: avg(item.fbVelos),
        fbMax: max(item.fbVelos),
        allAvg: avg(item.allVelos),
        spinAvg: item.spins.length > 0 ? Math.round(item.spins.reduce((a,b)=>a+b,0)/item.spins.length) : null,
        effAvg: avg(item.effs),
        vbAvg: avg(item.vbs),
        hbAvg: avg(item.hbs),
        releaseZAvg: item.releaseZs.length > 0 ? Number((item.releaseZs.reduce((a,b)=>a+b,0)/item.releaseZs.length).toFixed(2)) : null,
        releaseXAvg: item.releaseXs.length > 0 ? Number((item.releaseXs.reduce((a,b)=>a+b,0)/item.releaseXs.length).toFixed(2)) : null,
      };
    });
  }, [filteredEvents]);

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

      {/* No pitching data guard */}
      {(!activeData || !activeData.data || activeData.data.length === 0) && (
        <div className="bg-amber-950/30 border-2 border-amber-500/40 rounded-3xl p-8 text-center">
          <div className="text-5xl mb-4">⚾</div>
          <h3 className="text-xl font-bold text-amber-300 mb-2">投手専用データが読み込まれていません</h3>
          <p className="text-slate-400 text-sm mb-4">
            投手分析ページはRapsodo投球データ（投手専用CSV）のみを使用します。<br/>
            打撃データや統合データは使用されません。
          </p>
          <p className="text-xs text-slate-500">
            ▶ 「データ読み込み」ページ →「投手分析用データ」のCSVをアップロードしてください
          </p>
        </div>
      )}

      {/* Only show analysis when pitching data is loaded */}
      {activeData && activeData.data && activeData.data.length > 0 && (
        <>
      {/* Unified Analysis Settings Card */}
      <div className="bg-blue-900/10 border-2 border-blue-500/30 p-8 rounded-3xl mb-8 shadow-2xl backdrop-blur-sm print:hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex items-center text-blue-300">
            <Settings2 className="w-6 h-6 mr-2 text-blue-400" />
            <h3 className="text-xl font-bold text-white">投手分析 設定</h3>
          </div>
          <div className="flex items-center gap-2 text-xs bg-slate-900/80 px-3.5 py-1.5 rounded-full border border-blue-500/30 text-blue-300 font-bold">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            使用データ: Rapsodo 投球データ ({filteredActiveData.length} 投球)
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* 1. チーム選択 */}
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

          {/* 2. 投手左右フィルター */}
          <div>
            <label className="block text-sm font-bold text-blue-400 mb-2 uppercase tracking-widest">
              2. 投手左右フィルター
            </label>
            <p className="text-xs text-slate-500 mb-3">右投手 (RHP) / 左投手 (LHP) の絞り込み</p>
            <div className="bg-slate-900 p-1.5 rounded-xl border-2 border-blue-500/20 flex items-center gap-2 h-[58px]">
              <button
                onClick={() => setHandFilter('ALL')}
                className={`flex-1 h-full rounded-lg text-xs font-bold transition-all ${
                  handFilter === 'ALL' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                }`}
              >
                全投手 ({teamKPIs.totalPitchers}名)
              </button>
              <button
                onClick={() => setHandFilter('R')}
                className={`flex-1 h-full rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-all ${
                  handFilter === 'R' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-blue-400"></span> 右投手 RHP ({teamKPIs.rhpCount}名)
              </button>
              <button
                onClick={() => setHandFilter('L')}
                className={`flex-1 h-full rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-all ${
                  handFilter === 'L' ? 'bg-orange-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-orange-400"></span> 左投手 LHP ({teamKPIs.lhpCount}名)
              </button>
            </div>
          </div>
        </div>

        {/* Collapsible Name Key Config */}
        {showNameKeyConfig && (
          <div className="mt-4 p-4 bg-slate-900/80 border border-blue-500/30 rounded-2xl animate-in fade-in duration-200">
            <label className="block text-xs font-bold text-blue-300 mb-1">
              名前として使用する列 (アドバンスド設定)
            </label>
            <p className="text-[11px] text-slate-500 mb-2">※CSV内の投手名が正しく認識されない場合は列を変更してください</p>
            <select
              value={nameKey}
              onChange={(e) => setNameKey(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2.5 text-sm font-bold"
            >
              {headers.map((h, idx) => (
                <option key={idx} value={h}>{h}</option>
              ))}
            </select>
          </div>
        )}

        {/* Date Range Bar */}
        <div className="mt-6 pt-5 border-t border-blue-500/20 flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="text-xs font-bold text-blue-300 uppercase tracking-widest whitespace-nowrap">📅 日付範囲:</span>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="bg-slate-900 border border-slate-700 text-white rounded-xl px-3 py-1.5 text-xs font-mono font-bold outline-none focus:border-blue-500"
            />
            <span className="text-slate-500 text-xs">～</span>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="bg-slate-900 border border-slate-700 text-white rounded-xl px-3 py-1.5 text-xs font-mono font-bold outline-none focus:border-blue-500"
            />
            {(startDate || endDate) && (
              <button
                onClick={() => { setStartDate(''); setEndDate(''); }}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition-colors cursor-pointer"
              >
                クリア
              </button>
            )}
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
                <th className="py-3.5 px-3 text-right print:py-1 print:px-1">
                  最速<br/><span className="text-[10px] text-slate-500 font-normal normal-case tracking-normal">km/h</span>
                </th>
                <th className="py-3.5 px-3 text-right print:py-1 print:px-1">
                  FB平均<br/><span className="text-[10px] text-slate-500 font-normal normal-case tracking-normal">km/h</span>
                </th>
                <th className="py-3.5 px-3 text-right print:py-1 print:px-1">
                  FB回転<br/><span className="text-[10px] text-slate-500 font-normal normal-case tracking-normal">rpm</span>
                </th>
                <th className="py-3.5 px-3 text-right print:py-1 print:px-1">
                  FB効率<br/><span className="text-[10px] text-slate-500 font-normal normal-case tracking-normal">%</span>
                </th>
                <th className="py-3.5 px-3 text-right print:py-1 print:px-1">
                  FB縦変化<br/><span className="text-[10px] text-slate-500 font-normal normal-case tracking-normal">cm</span>
                </th>
                <th className="py-3.5 px-3 text-right print:py-1 print:px-1">
                  FB横変化<br/><span className="text-[10px] text-slate-500 font-normal normal-case tracking-normal">cm</span>
                </th>
                <th className="py-3.5 px-3 text-right print:py-1 print:px-1">
                  リリース高度<br/><span className="text-[10px] text-slate-500 font-normal normal-case tracking-normal">m</span>
                </th>
                <th className="py-3.5 px-3 text-right print:py-1 print:px-1">
                  リリース幅<br/><span className="text-[10px] text-slate-500 font-normal normal-case tracking-normal">m</span>
                </th>
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
                      onClick={() => onViewPlayer && onViewPlayer(p.name, selectedTeam, 'rapsodo_pitching')}
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

      {/* Team Date Trend Chart */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-emerald-400" />
            <h3 className="text-xl font-bold text-white">チーム投手陣 日付別推移グラフ</h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-bold whitespace-nowrap">Y軸指標:</span>
            <select
              value={teamDateTrendMetric}
              onChange={e => setTeamDateTrendMetric(e.target.value)}
              className="bg-slate-900 border border-slate-700 text-white rounded-xl px-3 py-1.5 text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="fb_velo">ストレート球速 (平均 &amp; 最高)</option>
              <option value="all_velo">全球種 平均球速 (km/h)</option>
              <option value="spin_rate">平均回転数 (rpm)</option>
              <option value="spin_eff">平均回転効率 (%)</option>
              <option value="vb_traj">平均縦変化量 (trajectory)</option>
              <option value="hb_traj">平均横変化量 (trajectory)</option>
              <option value="release_z">平均リリース高度 (m)</option>
              <option value="release_x">平均リリース幅 (m)</option>
            </select>
          </div>
        </div>

        {teamDateTrendData.length > 0 ? (
          <div className="w-full h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={teamDateTrendData} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} />
                <YAxis stroke="#94a3b8" fontSize={10} domain={['auto', 'auto']} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.75rem' }}
                  labelStyle={{ color: '#fff', fontWeight: 'bold' }}
                />
                <Legend />
                <Bar dataKey="count" name="投球数" fill="#334155" opacity={0.6} radius={[4,4,0,0]} />

                {teamDateTrendMetric === 'fb_velo' && (
                  <>
                    <Line type="monotone" dataKey="fbAvg" name="ストレート平均球速 (km/h)" stroke="#10b981" strokeWidth={2.5} dot={{ r: 4, fill: '#10b981', stroke: '#fff' }} connectNulls />
                    <Line type="monotone" dataKey="fbMax" name="ストレート最高球速 (km/h)" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 4, fill: '#f59e0b', stroke: '#fff' }} connectNulls />
                  </>
                )}
                {teamDateTrendMetric === 'all_velo' && (
                  <Line type="monotone" dataKey="allAvg" name="全球種 平均球速 (km/h)" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 4, fill: '#3b82f6', stroke: '#fff' }} connectNulls />
                )}
                {teamDateTrendMetric === 'spin_rate' && (
                  <Line type="monotone" dataKey="spinAvg" name="平均回転数 (rpm)" stroke="#a855f7" strokeWidth={2.5} dot={{ r: 4, fill: '#a855f7', stroke: '#fff' }} connectNulls />
                )}
                {teamDateTrendMetric === 'spin_eff' && (
                  <Line type="monotone" dataKey="effAvg" name="平均回転効率 (%)" stroke="#10b981" strokeWidth={2.5} dot={{ r: 4, fill: '#10b981', stroke: '#fff' }} connectNulls />
                )}
                {teamDateTrendMetric === 'vb_traj' && (
                  <Line type="monotone" dataKey="vbAvg" name="平均縦変化量 (traj)" stroke="#06b6d4" strokeWidth={2.5} dot={{ r: 4, fill: '#06b6d4', stroke: '#fff' }} connectNulls />
                )}
                {teamDateTrendMetric === 'hb_traj' && (
                  <Line type="monotone" dataKey="hbAvg" name="平均横変化量 (traj)" stroke="#f97316" strokeWidth={2.5} dot={{ r: 4, fill: '#f97316', stroke: '#fff' }} connectNulls />
                )}
                {teamDateTrendMetric === 'release_z' && (
                  <Line type="monotone" dataKey="releaseZAvg" name="平均リリース高度 (m)" stroke="#a855f7" strokeWidth={2.5} dot={{ r: 4, fill: '#a855f7', stroke: '#fff' }} connectNulls />
                )}
                {teamDateTrendMetric === 'release_x' && (
                  <Line type="monotone" dataKey="releaseXAvg" name="平均リリース幅 (m)" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 4, fill: '#3b82f6', stroke: '#fff' }} connectNulls />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-48 flex items-center justify-center text-slate-500 border border-dashed border-slate-800 rounded-2xl text-xs">
            日付情報が含まれる投球データが存在しません
          </div>
        )}
      </div>

      {/* 2-Pitcher Overlay Comparison Section */}
      {filteredPitchers.length > 0 && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-6 print:hidden">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div className="flex items-center gap-2">
              <Users className="w-6 h-6 text-blue-400" />
              <div>
                <h3 className="text-xl font-bold text-white">⚔️ 投手パフォーマンス 重ね合わせ対比</h3>
                <p className="text-xs text-slate-400">チーム内の2名の投手を選択して変化量や軌道、スタッツをダイレクトに比較できます</p>
              </div>
            </div>

            {/* Pitcher Selectors */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Pitcher A */}
              <div className="flex items-center gap-2 bg-slate-950 p-2.5 rounded-xl border border-sky-500/40 shadow-sm">
                <span className="w-3 h-3 rounded-full bg-sky-400 flex-shrink-0"></span>
                <span className="text-xs font-bold text-sky-400">投手 A:</span>
                <select
                  value={pitcherA}
                  onChange={e => setPitcherA(e.target.value)}
                  className="bg-slate-900 text-white text-xs font-bold rounded-lg px-3 py-1.5 outline-none border border-slate-700"
                >
                  {filteredPitchers.map(p => (
                    <option key={p.name} value={p.name}>{p.name}</option>
                  ))}
                </select>
              </div>

              <span className="text-slate-500 font-black text-sm">VS</span>

              {/* Pitcher B */}
              <div className="flex items-center gap-2 bg-slate-950 p-2.5 rounded-xl border border-orange-500/40 shadow-sm">
                <span className="w-3 h-3 rounded-full bg-orange-400 flex-shrink-0"></span>
                <span className="text-xs font-bold text-orange-400">投手 B:</span>
                <select
                  value={pitcherB}
                  onChange={e => setPitcherB(e.target.value)}
                  className="bg-slate-900 text-white text-xs font-bold rounded-lg px-3 py-1.5 outline-none border border-slate-700"
                >
                  {filteredPitchers.map(p => (
                    <option key={p.name} value={p.name}>{p.name}</option>
                  ))}
                </select>
              </div>

              {/* Pitch Type Filter */}
              <div className="flex items-center gap-1.5 bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                <span className="text-xs font-bold text-slate-400">球種:</span>
                <select
                  value={comparePitchType}
                  onChange={e => setComparePitchType(e.target.value)}
                  className="bg-slate-900 text-white text-xs font-bold rounded-lg px-2.5 py-1.5 outline-none border border-slate-700"
                >
                  <option value="ALL">全球種</option>
                  <option value="ストレート">ストレート / Fastball</option>
                  <option value="スライダー">スライダー / Slider</option>
                  <option value="カーブ">カーブ / Curveball</option>
                  <option value="チェンジアップ">チェンジアップ / Changeup</option>
                  <option value="カット">カッター / Cutter</option>
                  <option value="フォーク">フォーク / Splitter</option>
                </select>
              </div>
            </div>
          </div>

          {/* Charts & Stats Comparison Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Pitch Movement Overlay Scatter Plot */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between">
              <div>
                <h4 className="text-sm font-bold text-white mb-2 flex items-center justify-between">
                  <span>🌀 変化量 重ね合わせ比較 (Hb vs Vb)</span>
                  <span className="text-xs text-slate-500 font-normal">単位: cm</span>
                </h4>
                <div className="w-full aspect-square max-w-[420px] mx-auto relative bg-slate-950 border border-slate-800 rounded-xl p-3 flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 15, right: 30, bottom: 25, left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                      <XAxis type="number" dataKey="x" name="HB" domain={[-70, 70]} ticks={[-70, -35, 0, 35, 70]} stroke="#94a3b8" fontSize={10} />
                      <YAxis type="number" dataKey="y" name="VB" domain={[-70, 70]} ticks={[-70, -35, 0, 35, 70]} stroke="#94a3b8" fontSize={10} width={30} />
                      <ReferenceLine x={0} stroke="#64748b" strokeWidth={1.5} />
                      <ReferenceLine y={0} stroke="#64748b" strokeWidth={1.5} />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const d = payload[0].payload;
                            return (
                              <div className="bg-slate-900 border border-slate-700 p-2.5 rounded-xl shadow-xl text-xs space-y-1 z-50">
                                <p className="font-bold text-white" style={{ color: d.color }}>{d.pitcherName}</p>
                                <p className="text-slate-300">球種: <strong>{d.pitchType}</strong> ({d.velo} km/h)</p>
                                <p className="text-slate-400">縦変化: {d.y}cm / 横変化: {d.x}cm</p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Scatter name={pitcherA} data={comparisonData.movementA} fill="#38bdf8" fillOpacity={0.7} stroke="#ffffff" strokeWidth={0.5} />
                      <Scatter name={pitcherB} data={comparisonData.movementB} fill="#fb923c" fillOpacity={0.7} stroke="#ffffff" strokeWidth={0.5} />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="flex justify-center items-center gap-6 mt-3 text-xs font-bold">
                <span className="flex items-center gap-1.5 text-sky-400"><span className="w-3 h-3 rounded-full bg-sky-400"></span> {pitcherA || '投手A'} ({comparisonData.movementA.length}球)</span>
                <span className="flex items-center gap-1.5 text-orange-400"><span className="w-3 h-3 rounded-full bg-orange-400"></span> {pitcherB || '投手B'} ({comparisonData.movementB.length}球)</span>
              </div>
            </div>

            {/* Right: Pitcher Stat Comparison Table */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between">
              <div>
                <h4 className="text-sm font-bold text-white mb-3">📊 スタッツ対比</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-900 border-b border-slate-800 text-slate-400 uppercase font-bold">
                      <tr>
                        <th className="py-2.5 px-3">指標</th>
                        <th className="py-2.5 px-3 text-sky-400 text-right">{pitcherA || '投手A'}</th>
                        <th className="py-2.5 px-3 text-orange-400 text-right">{pitcherB || '投手B'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80 font-mono">
                      {[
                        { label: '投球数', valA: comparisonData.statsA?.count || '-', valB: comparisonData.statsB?.count || '-', unit: '球' },
                        { label: '最速球速', valA: comparisonData.statsA?.maxVelo || '-', valB: comparisonData.statsB?.maxVelo || '-', unit: 'km/h' },
                        { label: 'FB平均球速', valA: comparisonData.statsA?.fbAvgVelo || '-', valB: comparisonData.statsB?.fbAvgVelo || '-', unit: 'km/h' },
                        { label: 'FB平均回転数', valA: comparisonData.statsA?.fbAvgSpin || '-', valB: comparisonData.statsB?.fbAvgSpin || '-', unit: 'rpm' },
                        { label: 'FB平均回転効率', valA: comparisonData.statsA?.fbAvgSpinEff || '-', valB: comparisonData.statsB?.fbAvgSpinEff || '-', unit: '%' },
                        { label: 'FB平均縦変化', valA: comparisonData.statsA?.fbAvgVb || '-', valB: comparisonData.statsB?.fbAvgVb || '-', unit: 'cm' },
                        { label: 'FB平均横変化', valA: comparisonData.statsA?.fbAvgHb || '-', valB: comparisonData.statsB?.fbAvgHb || '-', unit: 'cm' },
                        { label: 'リリース高度', valA: comparisonData.statsA?.avgReleaseZ || '-', valB: comparisonData.statsB?.avgReleaseZ || '-', unit: 'm' },
                        { label: 'リリース幅', valA: comparisonData.statsA?.avgReleaseX || '-', valB: comparisonData.statsB?.avgReleaseX || '-', unit: 'm' }
                      ].map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-900/40">
                          <td className="py-2.5 px-3 font-sans font-bold text-slate-300">{row.label}</td>
                          <td className="py-2.5 px-3 text-right font-bold text-sky-300">{row.valA} <span className="text-[10px] text-slate-500 font-normal">{row.unit}</span></td>
                          <td className="py-2.5 px-3 text-right font-bold text-orange-300">{row.valB} <span className="text-[10px] text-slate-500 font-normal">{row.unit}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800 text-[11px] text-slate-500">
                ※球種フィルターを変更すると、指定球種の散布図分布を比較できます。
              </div>
            </div>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
}

export default PitcherAnalysis;
