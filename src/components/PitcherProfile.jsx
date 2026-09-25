import React, { useMemo, useState } from 'react';
import { 
  ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ReferenceLine,
  ComposedChart, Line, Bar, Legend 
} from 'recharts';
import { 
  getDataValue, 
  getRawDataValue,
  getSpinDirectionClock,
  parseAnyDate,
  PITCH_VELO_KEYS, 
  SPIN_RATE_KEYS, 
  SPIN_AXIS_KEYS, 
  SPIN_EFFICIENCY_KEYS,
  GYRO_ANGLE_KEYS,
  VAA_KEYS,
  VB_TRAJ_KEYS, 
  HB_TRAJ_KEYS, 
  PITCH_TYPE_KEYS, 
  RELEASE_HEIGHT_KEYS, 
  RELEASE_SIDE_KEYS 
} from '../utils/dataHelpers';
import { Activity, Zap, RotateCw, Move, Table, BarChart2, ShieldAlert, ArrowDownUp, Compass, Calendar, Layers, Hash, Crosshair, ArrowUpDown, Printer } from 'lucide-react';

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

// Strict pitch hierarchy definition
const PITCH_ORDER = [
  'ストレート', '4-Seam Fastball', 'Fastball', 'FF',
  'クイックストレート', 'Quick Fastball',
  'ツーシーム', '2-Seam Fastball', 'Sinker', 'シンカー', 'SI',
  'カッター', 'Cutter', 'FC',
  'スライダー', 'Slider', 'SL',
  'スイーパー', 'Sweeper', 'ST',
  'スラーブ', 'Slurve', 'SV',
  'カーブ', 'Curveball', 'CU', 'ナックルカーブ', 'Knuckle Curve', 'KC', 'スローカーブ',
  'フォーク', 'Forkball', 'FO', 'スプリット', 'Splitter', 'Split-Finger', 'FS',
  'チェンジアップ', 'Changeup', 'CH',
  'ナックル', 'Knuckleball', 'KN',
  'その他', 'Other'
];

const getPitchOrderIndex = (pitchName) => {
  if (!pitchName) return 999;
  const lower = pitchName.toLowerCase().trim();
  const idx = PITCH_ORDER.findIndex(p => p.toLowerCase() === lower || lower.includes(p.toLowerCase()));
  return idx !== -1 ? idx : 900;
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

// Raw pitch label resolution
const getPitchName = (row) => {
  const targetKeys = PITCH_TYPE_KEYS;
  for (const k of targetKeys) {
    if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') {
      return String(row[k]).trim();
    }
  }
  const rowKeys = Object.keys(row);
  for (const k of targetKeys) {
    const foundKey = rowKeys.find(rk => rk.toLowerCase() === k.toLowerCase() || rk.toLowerCase().includes('pitch') || rk.toLowerCase().includes('球種'));
    if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null && String(row[foundKey]).trim() !== '') {
      return String(row[foundKey]).trim();
    }
  }
  return 'その他';
};

function PitcherProfile({ pitcherName, events = [] }) {
  const [selectedPitchType, setSelectedPitchType] = useState('ALL');
  const [sortField, setSortField] = useState('id');
  const [sortAsc, setSortAsc] = useState(true);
  const [dateTrendMetric, setDateTrendMetric] = useState('fb_velo');

  // Parse metrics for each pitch event
  const parsedPitches = useMemo(() => {
    if (!events || events.length === 0) return [];

    return events.map((row, idx) => {
      const pitchType = getPitchName(row);
      const velo = getDataValue(row, PITCH_VELO_KEYS);
      const spin = getDataValue(row, SPIN_RATE_KEYS);
      const spinAxis = getRawDataValue(row, SPIN_AXIS_KEYS);
      const spinClock = getSpinDirectionClock(spinAxis);
      
      const spinEff = getDataValue(row, SPIN_EFFICIENCY_KEYS);
      const gyroAngle = getDataValue(row, GYRO_ANGLE_KEYS);
      const vaa = getDataValue(row, VAA_KEYS);

      const vbTraj = getDataValue(row, VB_TRAJ_KEYS);
      const hbTraj = getDataValue(row, HB_TRAJ_KEYS);
      
      const releaseZ = getDataValue(row, RELEASE_HEIGHT_KEYS);
      const releaseX = getDataValue(row, RELEASE_SIDE_KEYS);

      // Comprehensive Date parsing
      const DATE_KEYS = ['Date', 'date', 'game_date', '日付', 'Date/Time', 'Pitch Date', 'Created Date', 'Timestamp', '日時', '投球日時', 'PitchDate', 'date_time', 'time', 'Time'];
      let dateStr = '日付なし';
      for (const dk of DATE_KEYS) {
        if (row[dk] !== undefined && row[dk] !== null && String(row[dk]).trim() !== '') {
          const parsed = parseAnyDate(row[dk]);
          if (parsed) {
            dateStr = parsed;
            break;
          }
        }
      }

      return {
        id: idx + 1,
        raw: row,
        date: dateStr,
        pitchType,
        velo,
        spin,
        spinAxis,
        spinClock: spinClock || '-',
        spinEff,
        gyroAngle,
        vaa,
        vbTraj,
        hbTraj,
        releaseZ,
        releaseX,
        color: getPitchColor(pitchType)
      };
    });
  }, [events]);

  // Pitch Arsenal Breakdown (Grouped by Pitch Type and Sorted by PITCH_ORDER)
  const arsenalStats = useMemo(() => {
    if (parsedPitches.length === 0) return [];

    const groups = {};

    parsedPitches.forEach(p => {
      const t = p.pitchType;
      if (!groups[t]) {
        groups[t] = {
          name: t,
          color: p.color,
          count: 0,
          velos: [],
          spins: [],
          effs: [],
          gyros: [],
          vaas: [],
          clocks: [],
          vbs: [],
          hbs: [],
          releaseZs: [],
          releaseXs: []
        };
      }
      const g = groups[t];
      g.count++;
      if (p.velo > 0) g.velos.push(p.velo);
      if (p.spin > 0) g.spins.push(p.spin);
      if (p.spinEff > 0) g.effs.push(p.spinEff);
      if (p.gyroAngle !== 0) g.gyros.push(p.gyroAngle);
      if (p.vaa !== 0) g.vaas.push(p.vaa);
      if (p.spinClock && p.spinClock !== '-') g.clocks.push(p.spinClock);
      if (p.vbTraj !== 0 || p.hbTraj !== 0) {
        g.vbs.push(p.vbTraj);
        g.hbs.push(p.hbTraj);
      }
      if (p.releaseZ > 0) g.releaseZs.push(p.releaseZ);
      if (p.releaseX !== 0) g.releaseXs.push(p.releaseX);
    });

    const totalCount = parsedPitches.length;

    const rawList = Object.values(groups).map(g => {
      const pct = (g.count / totalCount) * 100;
      const avgVelo = g.velos.length > 0 ? (g.velos.reduce((a, b) => a + b, 0) / g.velos.length) : 0;
      const maxVelo = g.velos.length > 0 ? Math.max(...g.velos) : 0;
      const avgSpin = g.spins.length > 0 ? (g.spins.reduce((a, b) => a + b, 0) / g.spins.length) : 0;
      const avgEff = g.effs.length > 0 ? (g.effs.reduce((a, b) => a + b, 0) / g.effs.length) : 0;
      const avgGyro = g.gyros.length > 0 ? (g.gyros.reduce((a, b) => a + b, 0) / g.gyros.length) : 0;
      const avgVaa = g.vaas.length > 0 ? (g.vaas.reduce((a, b) => a + b, 0) / g.vaas.length) : 0;
      const avgVb = g.vbs.length > 0 ? (g.vbs.reduce((a, b) => a + b, 0) / g.vbs.length) : 0;
      const avgHb = g.hbs.length > 0 ? (g.hbs.reduce((a, b) => a + b, 0) / g.hbs.length) : 0;
      const avgReleaseZ = g.releaseZs.length > 0 ? (g.releaseZs.reduce((a, b) => a + b, 0) / g.releaseZs.length) : 0;
      const avgReleaseX = g.releaseXs.length > 0 ? (g.releaseXs.reduce((a, b) => a + b, 0) / g.releaseXs.length) : 0;

      let mainClock = '-';
      if (g.clocks.length > 0) {
        const counts = {};
        g.clocks.forEach(c => counts[c] = (counts[c] || 0) + 1);
        mainClock = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
      }

      return {
        ...g,
        pct: pct.toFixed(1),
        numericAvgVelo: avgVelo,
        avgVelo: avgVelo.toFixed(1),
        maxVelo: maxVelo.toFixed(1),
        avgSpin: Math.round(avgSpin),
        avgEff: avgEff > 0 ? avgEff.toFixed(1) : '-',
        avgGyro: avgGyro !== 0 ? avgGyro.toFixed(1) : '-',
        avgVaa: avgVaa !== 0 ? avgVaa.toFixed(1) : '-',
        mainClock,
        avgVb: avgVb.toFixed(1),
        avgHb: avgHb.toFixed(1),
        avgReleaseZ: avgReleaseZ > 0 ? avgReleaseZ.toFixed(2) : '-',
        avgReleaseX: avgReleaseX !== 0 ? avgReleaseX.toFixed(2) : '-'
      };
    });

    // Sort strictly by PITCH_ORDER hierarchy (Quick Fastball directly under Fastball!)
    rawList.sort((a, b) => getPitchOrderIndex(a.name) - getPitchOrderIndex(b.name));

    // Determine primary Fastball average velocity to set as EXACTLY 100.0%
    const primaryFbRow = rawList.find(r => {
      const l = r.name.toLowerCase();
      return l === 'ストレート' || l === 'fastball' || l === '4-seam fastball' || l === 'ff';
    }) || rawList[0];

    const fbAvgVeloNum = primaryFbRow ? primaryFbRow.numericAvgVelo : 0;

    return rawList.map(item => {
      let fbRatioNum = 0;
      let fbVeloRatio = '-';

      if (primaryFbRow && item.name === primaryFbRow.name) {
        fbRatioNum = 100.0;
        fbVeloRatio = '100.0%';
      } else if (fbAvgVeloNum > 0 && item.numericAvgVelo > 0) {
        fbRatioNum = (item.numericAvgVelo / fbAvgVeloNum) * 100;
        fbVeloRatio = fbRatioNum.toFixed(1) + '%';
      }

      return {
        ...item,
        fbRatioNum,
        fbVeloRatio
      };
    });
  }, [parsedPitches]);

  // Fastball Average Velocity for summary KPI card
  const primaryFastballAvgVelo = useMemo(() => {
    if (arsenalStats.length === 0) return '-';
    const fbRow = arsenalStats.find(r => {
      const l = r.name.toLowerCase();
      return l === 'ストレート' || l === 'fastball' || l === '4-seam fastball' || l === 'ff';
    }) || arsenalStats[0];
    return fbRow ? fbRow.avgVelo : '-';
  }, [arsenalStats]);

  // Overall Summary Metrics for Header KPI Cards
  const overallSummary = useMemo(() => {
    if (parsedPitches.length === 0) return null;

    const totalPitches = parsedPitches.length;
    const velos = parsedPitches.map(p => p.velo).filter(v => v > 0);
    const maxVelo = velos.length > 0 ? Math.max(...velos) : 0;

    const uniquePitchTypes = new Set(parsedPitches.map(p => p.pitchType));
    const pitchTypeCount = uniquePitchTypes.size;

    const hasVaaData = parsedPitches.some(p => p.vaa !== 0);
    const hasReleaseData = parsedPitches.some(p => p.releaseZ > 0 || p.releaseX !== 0);

    return {
      totalPitches,
      maxVelo: maxVelo > 0 ? maxVelo.toFixed(1) : '-',
      fbAvgVelo: primaryFastballAvgVelo,
      pitchTypeCount,
      hasVaaData,
      hasReleaseData
    };
  }, [parsedPitches, primaryFastballAvgVelo]);

  // Date Trend Data Aggregation
  const dateTrendData = useMemo(() => {
    if (parsedPitches.length === 0) return [];

    const datesMap = {};

    parsedPitches.forEach(p => {
      const d = p.date;
      if (!datesMap[d]) {
        datesMap[d] = {
          date: d,
          fbVelos: [],
          allVelos: [],
          spins: [],
          effs: [],
          vbs: [],
          hbs: [],
          releaseZs: [],
          releaseXs: [],
          count: 0
        };
      }
      const item = datesMap[d];
      item.count++;
      const isFb = p.pitchType.toLowerCase().includes('ストレート') || p.pitchType.toLowerCase().includes('fastball') || p.pitchType.toLowerCase().includes('4-seam');
      
      if (p.velo > 0) {
        item.allVelos.push(p.velo);
        if (isFb) item.fbVelos.push(p.velo);
      }
      if (p.spin > 0) item.spins.push(p.spin);
      if (p.spinEff > 0) item.effs.push(p.spinEff);
      if (p.vbTraj !== 0) item.vbs.push(p.vbTraj);
      if (p.hbTraj !== 0) item.hbs.push(p.hbTraj);
      if (p.releaseZ > 0) item.releaseZs.push(p.releaseZ);
      if (p.releaseX !== 0) item.releaseXs.push(p.releaseX);
    });

    const sortedDates = Object.keys(datesMap).sort();

    return sortedDates.map(d => {
      const item = datesMap[d];
      const fbAvg = item.fbVelos.length > 0 ? Number((item.fbVelos.reduce((a, b) => a + b, 0) / item.fbVelos.length).toFixed(1)) : null;
      const fbMax = item.fbVelos.length > 0 ? Number(Math.max(...item.fbVelos).toFixed(1)) : null;
      
      const allAvg = item.allVelos.length > 0 ? Number((item.allVelos.reduce((a, b) => a + b, 0) / item.allVelos.length).toFixed(1)) : null;
      const spinAvg = item.spins.length > 0 ? Math.round(item.spins.reduce((a, b) => a + b, 0) / item.spins.length) : null;
      const effAvg = item.effs.length > 0 ? Number((item.effs.reduce((a, b) => a + b, 0) / item.effs.length).toFixed(1)) : null;
      const vbAvg = item.vbs.length > 0 ? Number((item.vbs.reduce((a, b) => a + b, 0) / item.vbs.length).toFixed(1)) : null;
      const hbAvg = item.hbs.length > 0 ? Number((item.hbs.reduce((a, b) => a + b, 0) / item.hbs.length).toFixed(1)) : null;
      const releaseZAvg = item.releaseZs.length > 0 ? Number((item.releaseZs.reduce((a, b) => a + b, 0) / item.releaseZs.length).toFixed(2)) : null;
      const releaseXAvg = item.releaseXs.length > 0 ? Number((item.releaseXs.reduce((a, b) => a + b, 0) / item.releaseXs.length).toFixed(2)) : null;

      return {
        date: d,
        count: item.count,
        fbAvg,
        fbMax,
        allAvg,
        spinAvg,
        effAvg,
        vbAvg,
        hbAvg,
        releaseZAvg,
        releaseXAvg
      };
    });
  }, [parsedPitches]);

  // Scatter plot data for Pitch Movement (Fixed [-70, 70] Centered Bounds)
  const movementChartData = useMemo(() => {
    return parsedPitches
      .filter(p => {
        if (selectedPitchType !== 'ALL' && p.pitchType !== selectedPitchType) return false;
        return p.vbTraj !== 0 || p.hbTraj !== 0;
      })
      .map(p => ({
        x: Number(p.hbTraj.toFixed(1)),
        y: Number(p.vbTraj.toFixed(1)),
        velo: p.velo,
        spin: p.spin,
        spinEff: p.spinEff,
        spinClock: p.spinClock,
        pitchType: p.pitchType,
        color: p.color
      }));
  }, [parsedPitches, selectedPitchType]);

  // Scatter plot data for Release Point (Side vs Height)
  const releaseChartData = useMemo(() => {
    return parsedPitches
      .filter(p => {
        if (selectedPitchType !== 'ALL' && p.pitchType !== selectedPitchType) return false;
        return p.releaseZ > 0 || p.releaseX !== 0;
      })
      .map(p => ({
        x: Number(p.releaseX.toFixed(2)),
        y: Number(p.releaseZ.toFixed(2)),
        velo: p.velo,
        pitchType: p.pitchType,
        color: p.color
      }));
  }, [parsedPitches, selectedPitchType]);

  // Dynamic domain calculation for Release Point Chart (Enforcing ±0.1 margin beyond min and max)
  const releaseBounds = useMemo(() => {
    if (releaseChartData.length === 0) {
      return { minX: -0.5, maxX: 0.5, minY: 1.5, maxY: 2.0 };
    }
    const xs = releaseChartData.map(d => d.x);
    const ys = releaseChartData.map(d => d.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    return {
      minX: Number((minX - 0.1).toFixed(2)),
      maxX: Number((maxX + 0.1).toFixed(2)),
      minY: Number((minY - 0.1).toFixed(2)),
      maxY: Number((maxY + 0.1).toFixed(2)),
    };
  }, [releaseChartData]);

  // Scatter plot data for Velocity vs Spin Rate (Value-Add Feature)
  const veloSpinChartData = useMemo(() => {
    return parsedPitches
      .filter(p => {
        if (selectedPitchType !== 'ALL' && p.pitchType !== selectedPitchType) return false;
        return p.velo > 0 && p.spin > 0;
      })
      .map(p => ({
        x: p.velo,
        y: p.spin,
        pitchType: p.pitchType,
        color: p.color
      }));
  }, [parsedPitches, selectedPitchType]);

  // Pitch Log Table sorting and filtering
  const filteredPitches = useMemo(() => {
    let result = parsedPitches.filter(p => {
      if (selectedPitchType !== 'ALL' && p.pitchType !== selectedPitchType) return false;
      return true;
    });

    result.sort((a, b) => {
      let valA = a[sortField] !== undefined ? a[sortField] : 0;
      let valB = b[sortField] !== undefined ? b[sortField] : 0;
      if (typeof valA === 'string') {
        return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortAsc ? valA - valB : valB - valA;
    });

    return result;
  }, [parsedPitches, selectedPitchType, sortField, sortAsc]);

  if (!overallSummary) {
    return (
      <div className="p-8 text-center text-slate-400 bg-slate-900/50 rounded-2xl border border-slate-800">
        <ShieldAlert className="w-12 h-12 mx-auto mb-3 opacity-40 text-amber-400" />
        <p className="text-lg font-bold">投手データが見つかりませんでした。</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 print:space-y-2 animate-in fade-in duration-300">
      {/* Header Profile Card */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-950/40 to-slate-900 border border-blue-500/30 rounded-3xl p-6 md:p-8 shadow-2xl relative overflow-hidden print:p-4 print:mb-2 print:border-none print:shadow-none">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full filter blur-3xl pointer-events-none print:hidden"></div>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 print:gap-2 relative z-10">
          <div>
            {/* Print-Only Clean Header */}
            <div className="hidden print:block border-b-2 border-blue-600 pb-2 mb-2">
              <h1 className="text-2xl font-black text-slate-900">{pitcherName}</h1>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">
                投手分析レポート • {new Date().toLocaleDateString('ja-JP')}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 mb-2">
              <span className="px-3 py-1 bg-blue-600/30 border border-blue-400/40 text-blue-300 text-xs font-black rounded-full uppercase tracking-wider">
                PITCHER ANALYSIS
              </span>
            </div>
            
            {/* Pitcher Name on Line 1 */}
            <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight">
              {pitcherName}
            </h1>
            
            {/* 投手レポート on Line 2 */}
            <p className="text-slate-400 text-lg md:text-xl font-bold mt-1.5">
              投手レポート
            </p>
          </div>

          {/* Meaningful Summary KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 print:gap-2">
            <div className="bg-slate-900/80 border border-slate-800 p-4 print:p-2 rounded-2xl print:rounded-xl text-center shadow-lg flex flex-col justify-center items-center min-h-[110px] print:min-h-0 print:border-slate-200">
              <p className="text-xs print:text-[8px] text-slate-400 font-bold flex items-center justify-center gap-1">
                <Hash className="w-3.5 h-3.5 print:w-2.5 print:h-2.5 text-blue-400" /> 総投球数
              </p>
              <p className="text-2xl print:text-base font-black text-white print:text-slate-900 mt-1.5 print:mt-0.5">
                {overallSummary.totalPitches} <span className="text-xs print:text-[8px] text-slate-400 font-normal">球</span>
              </p>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 p-4 print:p-2 rounded-2xl print:rounded-xl text-center shadow-lg flex flex-col justify-center items-center min-h-[110px] print:min-h-0 print:border-slate-200">
              <p className="text-xs print:text-[8px] text-slate-400 font-bold flex items-center justify-center gap-1">
                <Zap className="w-3.5 h-3.5 print:w-2.5 print:h-2.5 text-amber-400" /> 最速球速
              </p>
              <p className="text-2xl print:text-base font-black text-amber-400 mt-1.5 print:mt-0.5">
                {overallSummary.maxVelo} {overallSummary.maxVelo !== '-' && <span className="text-xs print:text-[8px] text-slate-400 font-normal">km/h</span>}
              </p>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 p-4 print:p-2 rounded-2xl print:rounded-xl text-center shadow-lg flex flex-col justify-center items-center min-h-[110px] print:min-h-0 print:border-slate-200">
              <p className="text-xs print:text-[8px] text-slate-400 font-bold flex items-center justify-center gap-1">
                <Activity className="w-3.5 h-3.5 print:w-2.5 print:h-2.5 text-emerald-400" /> FB平均球速
              </p>
              <p className="text-2xl print:text-base font-black text-emerald-400 mt-1.5 print:mt-0.5">
                {overallSummary.fbAvgVelo} {overallSummary.fbAvgVelo !== '-' && <span className="text-xs print:text-[8px] text-slate-400 font-normal">km/h</span>}
              </p>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 p-4 print:p-2 rounded-2xl print:rounded-xl text-center shadow-lg flex flex-col justify-center items-center min-h-[110px] print:min-h-0 print:border-slate-200">
              <p className="text-xs print:text-[8px] text-slate-400 font-bold flex items-center justify-center gap-1">
                <Layers className="w-3.5 h-3.5 print:w-2.5 print:h-2.5 text-purple-400" /> 保持球種
              </p>
              <p className="text-2xl print:text-base font-black text-purple-400 mt-1.5 print:mt-0.5">
                {overallSummary.pitchTypeCount} <span className="text-xs print:text-[8px] text-slate-400 font-normal">球種</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Toolbar (Hidden in Print) */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900/60 border border-slate-800 p-4 rounded-2xl print:hidden">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">球種フィルタ:</span>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setSelectedPitchType('ALL')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                selectedPitchType === 'ALL'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
              }`}
            >
              全球種 ({overallSummary.totalPitches})
            </button>
            {arsenalStats.map(item => (
              <button
                key={item.name}
                onClick={() => setSelectedPitchType(item.name)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                  selectedPitchType === item.name
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }}></span>
                {item.name} ({item.count})
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Full-Width Pitch Arsenal Breakdown Table */}
      <div className="w-full bg-slate-900/60 border border-slate-800 rounded-3xl p-6 shadow-xl print:p-3 print:mb-2 print:rounded-2xl print:border-slate-200 print:shadow-none">
        <div className="flex items-center justify-between mb-4 print:mb-1">
          <div className="flex items-center gap-2">
            <Table className="w-5 h-5 print:w-3.5 print:h-3.5 text-blue-400" />
            <h3 className="text-xl print:text-sm font-bold text-white print:text-slate-900">球種別 スタッツ内訳</h3>
          </div>
          <span className="text-xs print:text-[8px] text-slate-500 font-bold">※ストレート平均球速を100.0%として対FB比を算出</span>
        </div>

        <div className="overflow-x-auto print:overflow-visible">
          <table className="w-full text-left text-sm text-slate-300 print:text-[7.5pt]">
            <thead>
              <tr className="border-b border-slate-800 text-xs text-slate-400 font-bold uppercase tracking-wider print:text-[7pt]">
                <th className="py-3.5 px-3 print:py-1 print:px-1 print:text-left">球種</th>
                <th className="py-3.5 px-3 text-right print:py-1 print:px-1">投球数</th>
                <th className="py-3.5 px-3 text-right print:py-1 print:px-1">配球比</th>
                <th className="py-3.5 px-3 text-right print:py-1 print:px-1">平均球速</th>
                <th className="py-3.5 px-3 text-center print:py-1 print:px-1">対FB比</th>
                <th className="py-3.5 px-3 text-right print:py-1 print:px-1">最高球速</th>
                <th className="py-3.5 px-3 text-right print:py-1 print:px-1">平均回転</th>
                <th className="py-3.5 px-3 text-right print:py-1 print:px-1">回転効率</th>
                <th className="py-3.5 px-3 text-right print:py-1 print:px-1">回転方向</th>
                <th className="py-3.5 px-3 text-right print:py-1 print:px-1">縦変化</th>
                <th className="py-3.5 px-3 text-right print:py-1 print:px-1">横変化</th>
                <th className="py-3.5 px-3 text-right print:py-1 print:px-1">リリース高度</th>
                <th className="py-3.5 px-3 text-right print:py-1 print:px-1">リリース幅</th>
                {overallSummary.hasVaaData && <th className="py-3.5 px-3 text-right print:py-1 print:px-1">VAA</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {arsenalStats.map(item => (
                <tr 
                  key={item.name}
                  onClick={() => setSelectedPitchType(selectedPitchType === item.name ? 'ALL' : item.name)}
                  className={`hover:bg-slate-800/50 cursor-pointer transition-colors ${
                    selectedPitchType === item.name ? 'bg-blue-600/10 font-bold' : ''
                  }`}
                >
                  <td className="py-4 px-3 flex items-center gap-2.5 font-bold text-white text-base print:py-1 print:px-1 print:text-[8px] print:gap-1">
                    <span className="w-3.5 h-3.5 print:w-2 print:h-2 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }}></span>
                    <span className="truncate">{item.name}</span>
                  </td>
                  <td className="py-4 px-3 text-right font-mono font-bold text-slate-200 print:py-1 print:px-1 print:text-[8px]">{item.count}</td>
                  
                  {/* 配球比 + Visual Bar */}
                  <td className="py-4 px-3 text-right font-mono print:py-1 print:px-1 print:text-[8px]">
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-blue-400 font-bold">{item.pct}%</span>
                      <div className="w-12 h-2 bg-slate-800 rounded-full overflow-hidden hidden sm:block print:hidden">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(Number(item.pct), 100)}%` }}></div>
                      </div>
                    </div>
                  </td>
                  
                  <td className="py-4 px-3 text-right font-mono font-bold text-white print:py-1 print:px-1 print:text-[8px]">{item.avgVelo} <span className="text-[10px] print:text-[7px] text-slate-500">km/h</span></td>
                  
                  {/* 対FB球速比 % + Visual Progress Indicator */}
                  <td className="py-4 px-3 text-center font-mono print:py-1 print:px-1 print:text-[8px]">
                    {item.fbVeloRatio !== '-' ? (
                      <div className="flex items-center justify-center gap-2">
                        <span className={`font-bold text-sm print:text-[8px] ${item.fbRatioNum === 100 ? 'text-amber-400' : 'text-amber-300'}`}>
                          {item.fbVeloRatio}
                        </span>
                        <div className="w-16 h-2 bg-slate-800 rounded-full overflow-hidden hidden sm:block print:hidden">
                          <div 
                            className={`h-full rounded-full ${item.fbRatioNum === 100 ? 'bg-amber-400' : 'bg-amber-500'}`} 
                            style={{ width: `${Math.min(item.fbRatioNum, 100)}%` }}
                          ></div>
                        </div>
                      </div>
                    ) : (
                      <span className="text-slate-500">-</span>
                    )}
                  </td>

                  <td className="py-4 px-3 text-right font-mono text-amber-400 font-bold print:py-1 print:px-1 print:text-[8px]">{item.maxVelo}</td>
                  <td className="py-4 px-3 text-right font-mono text-emerald-400 font-bold print:py-1 print:px-1 print:text-[8px]">{item.avgSpin}</td>
                  <td className="py-4 px-3 text-right font-mono text-emerald-300 print:py-1 print:px-1 print:text-[8px]">{item.avgEff}{item.avgEff !== '-' ? '%' : ''}</td>
                  <td className="py-4 px-3 text-right font-mono text-blue-300 font-bold print:py-1 print:px-1 print:text-[8px]">{item.mainClock}</td>
                  <td className={`py-4 px-3 text-right font-mono print:py-1 print:px-1 print:text-[8px] ${Number(item.avgVb) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {Number(item.avgVb) > 0 ? `+${item.avgVb}` : item.avgVb}
                  </td>
                  <td className={`py-4 px-3 text-right font-mono print:py-1 print:px-1 print:text-[8px] ${Number(item.avgHb) >= 0 ? 'text-blue-400' : 'text-orange-400'}`}>
                    {Number(item.avgHb) > 0 ? `+${item.avgHb}` : item.avgHb}
                  </td>
                  <td className="py-4 px-3 text-right font-mono text-slate-300 print:py-1 print:px-1 print:text-[8px]">{item.avgReleaseZ}</td>
                  <td className="py-4 px-3 text-right font-mono text-slate-300 print:py-1 print:px-1 print:text-[8px]">{item.avgReleaseX}</td>
                  {overallSummary.hasVaaData && (
                    <td className="py-4 px-3 text-right font-mono text-amber-400 print:py-1 print:px-1 print:text-[8px]">{item.avgVaa}{item.avgVaa !== '-' ? '°' : ''}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-500 print:hidden">
          <span>球種をクリックすると該当データの表示に絞り込めます</span>
          <span>計 {overallSummary.totalPitches} 投球</span>
        </div>
      </div>

      {/* 2-Column Grid: Pitch Movement Chart (Centered Origin) & Release Point Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 print:grid-cols-2 gap-8 print:gap-3">
        {/* Left: Pitch Movement Scatter Chart (Strictly Centered 0,0 Origin [-70, +70]) */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col justify-between print:p-2.5 print:rounded-2xl print:border-slate-200 print:shadow-none">
          <div>
            <div className="flex items-center justify-between mb-2 print:mb-1">
              <div className="flex items-center gap-2">
                <Move className="w-5 h-5 print:w-3.5 print:h-3.5 text-emerald-400" />
                <h3 className="text-xl print:text-xs font-bold text-white print:text-slate-900">球種別 変化量チャート図</h3>
              </div>
            </div>
            <p className="text-xs text-slate-400 mb-4 print:hidden">
              横軸: 横変化量 HB (trajectory) / 縦軸: 縦変化量 VB (trajectory) [-70 ～ +70 固定・中央原点(0,0)]
            </p>

            {movementChartData.length > 0 ? (
              <div className="w-full aspect-square max-w-[440px] print:max-w-none print:h-[185px] print:aspect-auto mx-auto relative bg-slate-950/90 border border-slate-800 rounded-2xl p-4 print:p-1 flex items-center justify-center print:border-slate-200">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 15, right: 35, bottom: 15, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                    <XAxis 
                      type="number" 
                      dataKey="x" 
                      name="HB (trajectory)" 
                      domain={[-70, 70]}
                      ticks={[-70, -35, 0, 35, 70]}
                      stroke="#94a3b8" 
                      fontSize={10} 
                      axisLine={{ stroke: '#475569' }}
                      height={20}
                    />
                    <YAxis 
                      type="number" 
                      dataKey="y" 
                      name="VB (trajectory)" 
                      domain={[-70, 70]}
                      ticks={[-70, -35, 0, 35, 70]}
                      stroke="#94a3b8" 
                      fontSize={10} 
                      axisLine={{ stroke: '#475569' }}
                      width={30}
                    />
                    {/* Centered zero crosshairs */}
                    <ReferenceLine x={0} stroke="#64748b" strokeWidth={1.5} />
                    <ReferenceLine y={0} stroke="#64748b" strokeWidth={1.5} />
                    <Tooltip 
                      cursor={{ strokeDasharray: '3 3' }}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-slate-900 border border-slate-700 p-3 rounded-xl shadow-2xl text-xs space-y-1 z-50">
                              <p className="font-extrabold text-white flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: data.color }}></span>
                                {data.pitchType}
                              </p>
                              <p className="text-slate-300">球速: <strong className="text-amber-400">{data.velo} km/h</strong></p>
                              <p className="text-slate-300">回転数: <strong className="text-emerald-400">{data.spin} rpm</strong></p>
                              {data.spinEff > 0 && <p className="text-slate-300">回転効率: <strong className="text-emerald-300">{data.spinEff}%</strong></p>}
                              {data.spinClock !== '-' && <p className="text-slate-300">回転方向: <strong className="text-blue-300">{data.spinClock}</strong></p>}
                              <p className="text-slate-300">縦変化 (traj): <strong className="text-blue-400">{data.y}</strong></p>
                              <p className="text-slate-300">横変化 (traj): <strong className="text-purple-400">{data.x}</strong></p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Scatter name="Pitches" data={movementChartData}>
                      {movementChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} fillOpacity={0.85} stroke="#ffffff" strokeWidth={0.8} />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[340px] print:h-[185px] flex items-center justify-center text-slate-500 border border-dashed border-slate-800 rounded-2xl">
                変化量データ (trajectory) が存在しません
              </div>
            )}
          </div>

          <div className="mt-3 text-center text-[11px] text-slate-500 print:hidden">
            ※右上: ホップ・シュート成分 / 左下: ドロップ・スライダー成分
          </div>
        </div>

        {/* Right: Release Point Scatter Chart (Release Side vs Height with ±0.1 Margin) */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col justify-between print:p-2.5 print:rounded-2xl print:border-slate-200 print:shadow-none">
          <div>
            <div className="flex items-center justify-between mb-2 print:mb-1">
              <div className="flex items-center gap-2">
                <Crosshair className="w-5 h-5 print:w-3.5 print:h-3.5 text-purple-400" />
                <h3 className="text-xl print:text-xs font-bold text-white print:text-slate-900">リリースポイント チャート図</h3>
              </div>
            </div>
            <p className="text-xs text-slate-400 mb-4 print:hidden">
              横軸: リリース幅 Release Side / 縦軸: リリリース高度 Release Height (上下±0.1m余白)
            </p>

            {releaseChartData.length > 0 ? (
              <div className="w-full aspect-square max-w-[440px] print:max-w-none print:h-[185px] print:aspect-auto mx-auto relative bg-slate-950/90 border border-slate-800 rounded-2xl p-4 print:p-1 flex items-center justify-center print:border-slate-200">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 15, right: 35, bottom: 15, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                    <XAxis 
                      type="number" 
                      dataKey="x" 
                      name="Release Side" 
                      domain={[releaseBounds.minX, releaseBounds.maxX]}
                      stroke="#94a3b8" 
                      fontSize={10} 
                      axisLine={{ stroke: '#475569' }}
                      height={20}
                    />
                    <YAxis 
                      type="number" 
                      dataKey="y" 
                      name="Release Height" 
                      domain={[releaseBounds.minY, releaseBounds.maxY]}
                      stroke="#94a3b8" 
                      fontSize={10} 
                      axisLine={{ stroke: '#475569' }}
                      width={30}
                    />
                    <Tooltip 
                      cursor={{ strokeDasharray: '3 3' }}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-slate-900 border border-slate-700 p-3 rounded-xl shadow-2xl text-xs space-y-1 z-50">
                              <p className="font-extrabold text-white flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: data.color }}></span>
                                {data.pitchType}
                              </p>
                              <p className="text-slate-300">リリース高度: <strong className="text-purple-400">{data.y} m</strong></p>
                              <p className="text-slate-300">リリース幅: <strong className="text-blue-400">{data.x} m</strong></p>
                              <p className="text-slate-300">球速: <strong className="text-amber-400">{data.velo} km/h</strong></p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Scatter name="ReleasePoints" data={releaseChartData}>
                      {releaseChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} fillOpacity={0.85} stroke="#ffffff" strokeWidth={0.8} />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[340px] print:h-[185px] flex items-center justify-center text-slate-500 border border-dashed border-slate-800 rounded-2xl text-xs">
                リリース高度・幅データが存在しません
              </div>
            )}
          </div>

          <div className="mt-3 text-center text-[11px] text-slate-500 print:hidden">
            ※球種ごとにリリース位置にばらつきがないか確認できます (最大・最小値に0.1の余裕を持たせて描画)
          </div>
        </div>
      </div>

      {/* Date Trend Chart Section (PAGE 2 BEGINS HERE: Explicit Page Break Before) */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 shadow-xl print:break-before-page print:pt-1 print:p-3 print:mb-2 print:rounded-2xl print:border-slate-200 print:shadow-none">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 print:mb-2">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 print:w-3.5 print:h-3.5 text-emerald-400" />
            <h3 className="text-xl print:text-sm font-bold text-white print:text-slate-900">日付別 パフォーマンス推移</h3>
          </div>

          {/* Metric Selector for Y-Axis */}
          <div className="flex items-center gap-2 print:hidden">
            <span className="text-xs text-slate-400 font-bold">指標選択 (Y軸):</span>
            <select
              value={dateTrendMetric}
              onChange={(e) => setDateTrendMetric(e.target.value)}
              className="bg-slate-900 border border-slate-700 text-white rounded-xl px-3 py-1.5 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="fb_velo">ストレート球速 (平均 & 最高)</option>
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

        {dateTrendData.length > 0 ? (
          <div className="w-full h-72 print:h-[160px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={dateTrendData} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} />
                <YAxis stroke="#94a3b8" fontSize={10} domain={['auto', 'auto']} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.75rem' }}
                  labelStyle={{ color: '#fff', fontWeight: 'bold' }}
                />
                <Legend />
                <Bar dataKey="count" name="投球数" fill="#334155" opacity={0.6} radius={[4, 4, 0, 0]} yAxisId={0} />

                {dateTrendMetric === 'fb_velo' && (
                  <>
                    <Line type="monotone" dataKey="fbAvg" name="ストレート平均球速 (km/h)" stroke="#10b981" strokeWidth={2.5} dot={{ r: 4, fill: '#10b981', stroke: '#fff' }} />
                    <Line type="monotone" dataKey="fbMax" name="ストレート最高球速 (km/h)" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 4, fill: '#f59e0b', stroke: '#fff' }} />
                  </>
                )}
                {dateTrendMetric === 'all_velo' && (
                  <Line type="monotone" dataKey="allAvg" name="全球種 平均球速 (km/h)" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 4, fill: '#3b82f6', stroke: '#fff' }} />
                )}
                {dateTrendMetric === 'spin_rate' && (
                  <Line type="monotone" dataKey="spinAvg" name="平均回転数 (rpm)" stroke="#a855f7" strokeWidth={2.5} dot={{ r: 4, fill: '#a855f7', stroke: '#fff' }} />
                )}
                {dateTrendMetric === 'spin_eff' && (
                  <Line type="monotone" dataKey="effAvg" name="平均回転効率 (%)" stroke="#10b981" strokeWidth={2.5} dot={{ r: 4, fill: '#10b981', stroke: '#fff' }} />
                )}
                {dateTrendMetric === 'vb_traj' && (
                  <Line type="monotone" dataKey="vbAvg" name="平均縦変化量 (traj)" stroke="#06b6d4" strokeWidth={2.5} dot={{ r: 4, fill: '#06b6d4', stroke: '#fff' }} />
                )}
                {dateTrendMetric === 'hb_traj' && (
                  <Line type="monotone" dataKey="hbAvg" name="平均横変化量 (traj)" stroke="#f97316" strokeWidth={2.5} dot={{ r: 4, fill: '#f97316', stroke: '#fff' }} />
                )}
                {dateTrendMetric === 'release_z' && (
                  <Line type="monotone" dataKey="releaseZAvg" name="平均リリース高度 (m)" stroke="#a855f7" strokeWidth={2.5} dot={{ r: 4, fill: '#a855f7', stroke: '#fff' }} />
                )}
                {dateTrendMetric === 'release_x' && (
                  <Line type="monotone" dataKey="releaseXAvg" name="平均リリース幅 (m)" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 4, fill: '#3b82f6', stroke: '#fff' }} />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-48 print:h-[160px] flex items-center justify-center text-slate-500 border border-dashed border-slate-800 rounded-2xl text-xs">
            日付情報が含まれる投球データが存在しません
          </div>
        )}
      </div>

      {/* Detailed Pitch Log Table */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 shadow-xl print:p-3 print:mb-0 print:rounded-2xl print:border-slate-200 print:shadow-none">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 print:mb-2">
          <div className="flex items-center gap-2">
            <BarChart2 className="w-5 h-5 print:w-3.5 print:h-3.5 text-purple-400" />
            <h3 className="text-xl print:text-sm font-bold text-white print:text-slate-900">投球ログ一覧 ({filteredPitches.length}件)</h3>
          </div>
          <span className="text-xs text-slate-500 print:hidden">※「#」をクリックすると投球順（1, 2, 3...）に昇順・降順でソートできます</span>
        </div>

        <div className="overflow-x-auto max-h-[500px] print:max-h-none print:overflow-visible">
          <table className="w-full text-left text-sm text-slate-300 print:text-[7.5pt]">
            <thead className="sticky top-0 bg-slate-900 print:static print:bg-slate-100 border-b border-slate-800 text-xs text-slate-400 font-bold uppercase tracking-wider z-10 print:text-[7pt]">
              <tr>
                <th 
                  className="py-3.5 px-3 print:py-1 print:px-1 cursor-pointer hover:text-white"
                  onClick={() => { setSortField('id'); setSortAsc(!sortAsc); }}
                  title="クリックで投球順にソート"
                >
                  <span className="flex items-center gap-1">
                    # {sortField === 'id' && <ArrowUpDown className="w-3.5 h-3.5 text-blue-400 print:hidden" />}
                  </span>
                </th>
                <th className="py-3.5 px-3 print:py-1 print:px-1">日付</th>
                <th className="py-3.5 px-3 print:py-1 print:px-1">球種</th>
                <th className="py-3.5 px-3 text-right print:py-1 print:px-1 cursor-pointer hover:text-white" onClick={() => { setSortField('velo'); setSortAsc(!sortAsc); }}>
                  球速 <ArrowDownUp className="inline w-3 h-3 ml-1 print:hidden" />
                </th>
                <th className="py-3.5 px-3 text-right print:py-1 print:px-1 cursor-pointer hover:text-white" onClick={() => { setSortField('spin'); setSortAsc(!sortAsc); }}>
                  回転数 <ArrowDownUp className="inline w-3 h-3 ml-1 print:hidden" />
                </th>
                <th className="py-3.5 px-3 text-right print:py-1 print:px-1 cursor-pointer hover:text-white" onClick={() => { setSortField('spinEff'); setSortAsc(!sortAsc); }}>
                  回転効率 <ArrowDownUp className="inline w-3 h-3 ml-1 print:hidden" />
                </th>
                <th className="py-3.5 px-3 text-right print:py-1 print:px-1">回転方向</th>
                <th className="py-3.5 px-3 text-right print:py-1 print:px-1 cursor-pointer hover:text-white" onClick={() => { setSortField('gyroAngle'); setSortAsc(!sortAsc); }}>
                  ジャイロ角 <ArrowDownUp className="inline w-3 h-3 ml-1 print:hidden" />
                </th>
                <th className="py-3.5 px-3 text-right print:py-1 print:px-1 cursor-pointer hover:text-white" onClick={() => { setSortField('vbTraj'); setSortAsc(!sortAsc); }}>
                  縦変化 <ArrowDownUp className="inline w-3 h-3 ml-1 print:hidden" />
                </th>
                <th className="py-3.5 px-3 text-right print:py-1 print:px-1 cursor-pointer hover:text-white" onClick={() => { setSortField('hbTraj'); setSortAsc(!sortAsc); }}>
                  横変化 <ArrowDownUp className="inline w-3 h-3 ml-1 print:hidden" />
                </th>
                <th className="py-3.5 px-3 text-right print:py-1 print:px-1">リリース高度</th>
                <th className="py-3.5 px-3 text-right print:py-1 print:px-1">リリース幅</th>
                {overallSummary.hasVaaData && (
                  <th className="py-3.5 px-3 text-right print:py-1 print:px-1 cursor-pointer hover:text-white" onClick={() => { setSortField('vaa'); setSortAsc(!sortAsc); }}>
                    VAA <ArrowDownUp className="inline w-3 h-3 ml-1 print:hidden" />
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredPitches.map((p) => (
                <tr key={p.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-3 px-3 print:py-1 print:px-1 text-blue-400 font-mono text-xs print:text-[8px] font-bold">{p.id}</td>
                  <td className="py-3 px-3 print:py-1 print:px-1 text-slate-400 font-mono text-xs print:text-[8px]">{p.date}</td>
                  <td className="py-3 px-3 print:py-1 print:px-1 font-bold text-white flex items-center gap-2 print:gap-1 print:text-[8px]">
                    <span className="w-2.5 h-2.5 print:w-2 print:h-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }}></span>
                    <span className="truncate">{p.pitchType}</span>
                  </td>
                  <td className="py-3 px-3 print:py-1 print:px-1 text-right font-mono font-bold text-amber-400 print:text-[8px]">{p.velo > 0 ? p.velo : '-'}</td>
                  <td className="py-3 px-3 print:py-1 print:px-1 text-right font-mono text-emerald-400 print:text-[8px]">{p.spin > 0 ? p.spin : '-'}</td>
                  <td className="py-3 px-3 print:py-1 print:px-1 text-right font-mono text-emerald-300 print:text-[8px]">{p.spinEff > 0 ? `${p.spinEff}%` : '-'}</td>
                  <td className="py-3 px-3 print:py-1 print:px-1 text-right font-mono text-blue-300 print:text-[8px]">{p.spinClock}</td>
                  <td className="py-3 px-3 print:py-1 print:px-1 text-right font-mono text-purple-400 print:text-[8px]">{p.gyroAngle !== 0 ? `${p.gyroAngle}°` : '-'}</td>
                  <td className={`py-3 px-3 print:py-1 print:px-1 text-right font-mono print:text-[8px] ${p.vbTraj >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {p.vbTraj !== 0 ? p.vbTraj : '-'}
                  </td>
                  <td className={`py-3 px-3 print:py-1 print:px-1 text-right font-mono print:text-[8px] ${p.hbTraj >= 0 ? 'text-blue-400' : 'text-orange-400'}`}>
                    {p.hbTraj !== 0 ? p.hbTraj : '-'}
                  </td>
                  <td className="py-3 px-3 print:py-1 print:px-1 text-right font-mono text-slate-400 print:text-[8px]">{p.releaseZ > 0 ? p.releaseZ : '-'}</td>
                  <td className="py-3 px-3 print:py-1 print:px-1 text-right font-mono text-slate-400 print:text-[8px]">{p.releaseX !== 0 ? p.releaseX : '-'}</td>
                  {overallSummary.hasVaaData && (
                    <td className="py-3 px-3 print:py-1 print:px-1 text-right font-mono text-amber-400 print:text-[8px]">{p.vaa !== 0 ? `${p.vaa}°` : '-'}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default PitcherProfile;
