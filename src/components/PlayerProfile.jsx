import React, { useState, useMemo, useRef, useEffect } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { 
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Radar, RadarChart, PolarGrid, PolarAngleAxis, LineChart, Line, ComposedChart, Legend
} from 'recharts';
import { 
  Activity, Zap, Target, Gauge, TrendingUp, BarChart3, 
  Printer, ShieldAlert, ShieldCheck, List, Layout, ChevronDown, ChevronUp, MousePointer2, Users, RefreshCw
} from 'lucide-react';

import { 
  parseNumeric, 
  getDataValue, 
  getRawDataValue,
  calculateAverages,
  parseAnyDate,
  parseDateToTimestamp,
  DEFAULT_DATE_KEYS,
  BS_KEYS,
  PLANE_KEYS,
  CONN_KEYS,
  ROT_KEYS,
  TIME_KEYS,
  EV_KEYS,
  LA_KEYS,
  AA_KEYS,
  HS_KEYS,
  ON_PLANE_SCORE_KEYS
} from '../utils/dataHelpers';

// No unit conversion - all Rapsodo/Blast data is already in km/h

// --- Shared Components ---

const SprayChart = ({ data }) => {
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const containerRef = useRef(null);

  if (!data || data.length === 0) return <div className="flex items-center justify-center h-full text-slate-600 text-[10px] italic">No Data</div>;

  const getCoordinates = (row) => {
    const hc_x = row.hc_x;
    const hc_y = row.hc_y;
    const angle = getDataValue(row, ['Direction', 'direction', 'bearing', 'Bearing', 'CameraDirection', 'hc_x', '打球方向', '方向', '方向角度']);
    const distance = getDataValue(row, ['hit_distance_sc', 'Distance', 'distance', 'CameraDistance']);
    if (hc_x !== undefined && hc_x !== null && hc_y !== undefined && hc_y !== null && hc_x !== '' && hc_y !== '') {
      const x = (parseNumeric(hc_x) - 125.42) * 1.5 + 150;
      const y = 265 - (204.44 - parseNumeric(hc_y)) * 1.5;
      return { x, y };
    } else {
      const rad = (angle * Math.PI) / 180;
      // Rapsodo distance scale
      const distScale = Math.min(distance, 140) / 140 * 220; 
      const x = 150 + Math.sin(rad) * distScale;
      const y = 245 - Math.cos(rad) * distScale;
      return { x, y };
    }
  };

  return (
    <div className="relative w-full h-full flex items-center justify-center py-2" ref={containerRef}>
      <svg viewBox="0 0 300 270" className="spray-chart-svg w-full h-full max-h-[280px] drop-shadow-xl">
        {/* Field base - raised home plate to y=245 for better centering */}
        <path className="spray-field-outfield" d="M150 245 L10 105 A 198 198 0 0 1 290 105 Z" fill="#0f172a" stroke="#334155" strokeWidth="2" />
        {/* Infield dirt area */}
        <path className="spray-field-infield" d="M150 245 L210 185 A 84 84 0 0 0 90 185 Z" fill="#1e293b" stroke="#475569" strokeWidth="1" />
        {/* Foul lines */}
        <path className="spray-field-lines" d="M150 245 L10 105 M150 245 L290 105" fill="none" stroke="#475569" strokeWidth="1" strokeDasharray="4 4" />
        {/* Bases */}
        <rect x="148" y="243" width="4" height="4" fill="#fff" transform="rotate(45 150 245)" />
        {data.map((row, i) => {
          const { x, y } = getCoordinates(row);
          const ev = parseNumeric(getDataValue(row, EV_KEYS));
          const la = parseNumeric(getDataValue(row, LA_KEYS));
          const isHit = (row.events || '').toLowerCase().includes('single') || (row.Result || '').toLowerCase().includes('hit') || (row.events || '').toLowerCase().includes('double') || (row.events || '').toLowerCase().includes('home_run');
          const r = ev > 140 ? 4.5 : ev > 120 ? 3.5 : 2.5;
          return (
            <circle 
              key={i} 
              cx={x} 
              cy={y} 
              r={r} 
              fill={isHit ? "#10b981" : "#ef4444"} 
              fillOpacity="0.8" 
              stroke="#fff" 
              strokeWidth="0.5"
              onMouseEnter={() => setHoveredPoint({ x, y, ev, la })}
              onMouseLeave={() => setHoveredPoint(null)}
              className="cursor-pointer transition-all hover:stroke-yellow-400 hover:stroke-[1.5]"
            >
              <title>{`速度: ${ev ? ev.toFixed(1) : '-'} km/h\n角度: ${la ? la.toFixed(1) : '-'}°`}</title>
            </circle>
          );
        })}
      </svg>

      {hoveredPoint && (
        <div 
          className="absolute z-50 bg-slate-950/90 border border-slate-700 p-2 rounded shadow-2xl pointer-events-none text-[10px]"
          style={{ 
            left: `${(hoveredPoint.x / 300) * 100}%`, 
            top: `${(hoveredPoint.y / 270) * 100}%`,
            transform: 'translate(-50%, -120%)'
          }}
        >
          <p className="text-emerald-400 font-bold mb-0.5 flex justify-between gap-3">
            <span>速度:</span>
            <span className="text-white font-mono">{hoveredPoint.ev ? hoveredPoint.ev.toFixed(1) : '-'} <span className="text-[8px] opacity-50">km/h</span></span>
          </p>
          <p className="text-purple-400 font-bold flex justify-between gap-3">
            <span>角度:</span>
            <span className="text-white font-mono">{hoveredPoint.la ? hoveredPoint.la.toFixed(1) : '-'} <span className="text-[8px] opacity-50">°</span></span>
          </p>
        </div>
      )}
    </div>
  );
};

const VelocityAngleChart = ({ data, xKeys, yKeys, xDomain = ['auto', 'auto'], yDomain = [-40, 60], fill = "#3b82f6" }) => {
  const chartData = data.map(row => ({
    x: getDataValue(row, xKeys),
    y: getDataValue(row, yKeys)
  })).filter(d => d.x > 0);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ScatterChart margin={{ top: 10, right: 10, bottom: 20, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
        <XAxis type="number" dataKey="x" stroke="#475569" fontSize={10} domain={xDomain} />
        <YAxis type="number" dataKey="y" stroke="#475569" fontSize={10} domain={yDomain} />
        <Tooltip 
          cursor={{ strokeDasharray: '3 3' }} 
          content={({ active, payload }) => {
            if (active && payload && payload.length) {
              const d = payload[0].payload;
              return (
                <div className="bg-slate-900 border border-slate-700 p-2 rounded shadow-xl text-[10px]">
                  <p className="text-blue-400">速度: <span className="text-white font-mono">{parseNumeric(d.x).toFixed(1)}</span></p>
                  <p className="text-purple-400">角度: <span className="text-white font-mono">{parseNumeric(d.y).toFixed(1)}</span></p>
                </div>
              );
            }
            return null;
          }}
        />
        <Scatter name="Data" data={chartData} fill={fill} fillOpacity={0.9} stroke="#ffffff" strokeWidth={0.5} />
      </ScatterChart>
    </ResponsiveContainer>
  );
};


const PlayerTrendScatterChart = ({ savantEvents, blastEvents, sourceType = 'combined', startDate = '', endDate = '' }) => {
  const [metric, setMetric] = useState(sourceType === 'blast' ? 'bs' : 'ev');

  const metricMeta = useMemo(() => {
    const all = {
      ev: { label: '打球速度', unit: 'km/h', color: '#10b981', keys: EV_KEYS },
      la: { label: '打球角度', unit: '°', color: '#a855f7', keys: LA_KEYS },
      bs: { label: 'バット速度', unit: 'km/h', color: '#3b82f6', keys: BS_KEYS },
      aa: { label: 'アッパースイング度', unit: '°', color: '#f59e0b', keys: AA_KEYS },
    };

    if (sourceType === 'rapsodo_batting') {
      return { ev: all.ev, la: all.la };
    }
    if (sourceType === 'blast') {
      return { bs: all.bs, aa: all.aa };
    }
    return all;
  }, [sourceType]);

  const availableMetricKeys = Object.keys(metricMeta);

  // Keep metric valid for the current sourceType
  useEffect(() => {
    if (!availableMetricKeys.includes(metric)) {
      setMetric(availableMetricKeys[0] || 'ev');
    }
  }, [sourceType, availableMetricKeys, metric]);

  const currentMeta = metricMeta[metric] || metricMeta.ev || metricMeta.bs;

  const allEvents = useMemo(() => {
    if (sourceType === 'rapsodo_batting') return savantEvents || [];
    if (sourceType === 'blast') return blastEvents || [];
    return [...(savantEvents || []), ...(blastEvents || [])];
  }, [savantEvents, blastEvents, sourceType]);

  const trendData = useMemo(() => {
    if (!currentMeta) return [];
    const dateMap = {};
    allEvents.forEach(e => {
      const rawDate = getRawDataValue(e, DEFAULT_DATE_KEYS) || e.date || e.game_date || e.file_name || e.filename || '';
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

    const list = [];
    Object.keys(dateMap).forEach(dateStr => {
      const vals = dateMap[dateStr];
      if (vals.length === 0) return;

      const sum = vals.reduce((a, b) => a + b, 0);
      const avg = Number((sum / vals.length).toFixed(1));
      const max = Number(Math.max(...vals).toFixed(1));

      const timeMs = parseDateToTimestamp(dateStr);

      if (!isNaN(timeMs) && timeMs > 0) {
        list.push({
          date: dateStr,
          timeMs,
          avg,
          max,
          count: vals.length
        });
      }
    });

    return list.sort((a, b) => a.timeMs - b.timeMs);
  }, [allEvents, currentMeta, startDate, endDate]);

  if (!currentMeta) return null;

  return (
    <div className="player-trend-card w-full bg-slate-800/60 p-4 sm:p-6 rounded-2xl border border-slate-700 mt-6 print:bg-white print:border-slate-200 print:mt-4 print:p-2 print:border-none print:shadow-none">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-700/60 pb-3 mb-4 print:border-slate-200">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-purple-400 print:text-purple-600 flex-shrink-0" />
          <h3 className="text-xs sm:text-sm font-black text-slate-300 uppercase print:text-slate-900">日付別 指標変動トレンド (平均 & 最大)</h3>
        </div>

        <div className="flex flex-wrap items-center gap-3 no-print">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400 font-bold whitespace-nowrap">Y軸:</span>
            <select
              value={metric}
              onChange={e => setMetric(e.target.value)}
              className="bg-slate-900 border border-slate-700 text-white text-xs font-bold rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-purple-500 cursor-pointer"
            >
              {Object.keys(metricMeta).map(k => (
                <option key={k} value={k}>{metricMeta[k].label} ({metricMeta[k].unit})</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="w-full h-[340px] print:h-[200px]">
        {trendData.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 text-xs p-4">
            <p className="font-bold text-slate-300 mb-2">選択された期間・指標のデータが見つかりません</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={trendData} margin={{ top: 20, right: 30, bottom: 25, left: 15 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis 
                dataKey="date" 
                stroke="#94a3b8" 
                fontSize={10}
                tick={{ fill: '#94a3b8' }}
              />
              <YAxis 
                type="number" 
                stroke="#94a3b8" 
                fontSize={11}
                width={55}
                unit={currentMeta.unit}
                domain={['auto', 'auto']}
              />
              <Tooltip 
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const d = payload[0].payload;
                    return (
                      <div className="bg-slate-900 border border-slate-700 p-3 rounded-xl shadow-2xl text-xs">
                        <p className="font-bold text-white mb-1.5 border-b border-slate-700 pb-1">{d.date}</p>
                        <p className="text-emerald-400 font-bold flex justify-between gap-4">
                          <span>日別平均:</span>
                          <span className="text-white font-mono">{d.avg} {currentMeta.unit}</span>
                        </p>
                        <p className="text-red-400 font-bold flex justify-between gap-4">
                          <span>日別最大:</span>
                          <span className="text-white font-mono">{d.max} {currentMeta.unit}</span>
                        </p>
                        <p className="text-slate-400 text-[11px] mt-1">スイング数: {d.count} 回</p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Legend verticalAlign="top" wrapperStyle={{ top: -5, paddingBottom: 10 }} fontSize={11} />
              
              {/* 日別平均の折れ線 (Solid Line) */}
              <Line 
                type="monotone" 
                dataKey="avg" 
                name={`日別平均 (${currentMeta.label})`} 
                stroke={currentMeta.color} 
                strokeWidth={3}
                dot={{ r: 5, fill: currentMeta.color, stroke: '#fff', strokeWidth: 1.5 }}
                activeDot={{ r: 7 }}
              />

              {/* 日別最大の折れ線 (Dashed Line) */}
              <Line 
                type="monotone" 
                dataKey="max" 
                name={`日別最大 (${currentMeta.label})`} 
                stroke="#ef4444" 
                strokeWidth={2.5}
                strokeDasharray="5 5"
                dot={{ r: 5, fill: '#ef4444', stroke: '#fff', strokeWidth: 1.5 }}
                activeDot={{ r: 7 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};


// --- Main Component ---

const PlayerProfile = ({ playerName, stats, isCombined = false, sourceType = 'combined', startDate = '', endDate = '' }) => {
  const rawSavantEvents = stats?.savantEvents || [];
  const rawBlastEvents = stats?.blastEvents || [];
  const [hitsOnly] = useState(false);

  // Apply date filter to both event sets
  const applyDateFilter = (events) => {
    if (!startDate && !endDate) return events;
    return events.filter(e => {
      const rawDate = getRawDataValue(e, DEFAULT_DATE_KEYS) || e.date || e.game_date || '';
      const dateStr = parseAnyDate(rawDate);
      if (!dateStr) return false;
      if (startDate && dateStr < startDate) return false;
      if (endDate && dateStr > endDate) return false;
      return true;
    });
  };

  const savantEvents = applyDateFilter(rawSavantEvents);
  const blastEvents = applyDateFilter(rawBlastEvents);

  const filteredData = useMemo(() => {
    let data = savantEvents;
    if (hitsOnly) {
      data = data.filter(r => (r.events || r.Result || '').toLowerCase().includes('hit') || (r.events || '').toLowerCase().includes('single'));
    }
    return data;
  }, [savantEvents, hitsOnly]);

  const summary = useMemo(() => {
    const validEvRows = (filteredData || []).filter(r => {
      const v = getDataValue(r, EV_KEYS);
      return !isNaN(v) && v > 0;
    });
    const hasEvData = validEvRows.length > 0;
    const avgEV = hasEvData ? calculateAverages(validEvRows, EV_KEYS) : 0;
    const maxEV = hasEvData ? Math.max(...validEvRows.map(r => getDataValue(r, EV_KEYS)), 0) : 0;
    const avgLA = calculateAverages(filteredData, LA_KEYS);
    const avgBS = sourceType === 'rapsodo_batting' ? 0 : (calculateAverages(blastEvents, BS_KEYS) || calculateAverages(filteredData, BS_KEYS));
    const maxBS = sourceType === 'rapsodo_batting' ? 0 : Math.max(...blastEvents.map(r => getDataValue(r, BS_KEYS)), ...filteredData.map(r => getDataValue(r, BS_KEYS)), 0);
    
    const total = filteredData.length;
    const hardHit = validEvRows.filter(r => getDataValue(r, EV_KEYS) >= 153).length;
    const barrel = validEvRows.filter(r => getDataValue(r, EV_KEYS) >= 158 && getDataValue(r, LA_KEYS) >= 26 && getDataValue(r, LA_KEYS) <= 30).length;
    const sweetSpot = filteredData.filter(r => getDataValue(r, LA_KEYS) >= 8 && getDataValue(r, LA_KEYS) <= 32).length;

    return {
      hasEvData,
      avgEV,
      maxEV,
      avgLA,
      avgBS,
      maxBS,
      hardHitRate: validEvRows.length > 0 ? (hardHit / validEvRows.length * 100).toFixed(1) : '0.0',
      barrelRate: validEvRows.length > 0 ? (barrel / validEvRows.length * 100).toFixed(1) : '0.0',
      sweetSpotRate: total > 0 ? (sweetSpot / total * 100).toFixed(1) : '0.0',
      avgPlane: calculateAverages(blastEvents, PLANE_KEYS),
      avgConn: calculateAverages(blastEvents, CONN_KEYS),
      avgRot: calculateAverages(blastEvents, ROT_KEYS),
      avgTime: calculateAverages(blastEvents, TIME_KEYS),
      avgAA: calculateAverages(blastEvents, AA_KEYS),
      avgHS: calculateAverages(blastEvents, HS_KEYS),
      avgPlaneScore: calculateAverages(blastEvents, ON_PLANE_SCORE_KEYS),
      total
    };
  }, [filteredData, blastEvents, sourceType]);

  const reportTeam = savantEvents[0]?.Team || savantEvents[0]?.team_name || blastEvents[0]?.Team || blastEvents[0]?.team_name || 'Individual';

  const showBallTracking = summary.hasEvData && sourceType !== 'blast';
  const showSwingAnalysis = sourceType === 'combined' && summary.avgBS > 0;

  return (
    <div className="player-profile-root text-slate-200 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-6 no-print">
        <div>
          <h1 className="text-4xl font-black text-white tracking-tight">{playerName}</h1>
          <p className="text-slate-400 text-xs font-bold mt-1 uppercase tracking-widest">
            {sourceType === 'rapsodo_batting' ? 'Rapsodo 打撃分析レポート' : sourceType === 'blast' ? 'Blast スイング分析レポート' : '打撃総合分析レポート'}
          </p>
        </div>
      </div>

      <div className="report-content player-report print:bg-[#0b0f17] print:text-slate-100 space-y-6">
        {/* Print-Only Header */}
        <div className="player-print-header hidden print:block border-b-2 border-blue-500 pb-1 mb-2">
          <h1 className="text-2xl font-black uppercase text-white leading-none">{playerName}</h1>
          <p className="text-[9px] font-bold text-slate-400 mt-0.5 uppercase tracking-widest">
            {reportTeam} • {new Date().toLocaleDateString('ja-JP')} • 打撃分析レポート
          </p>
        </div>

        {/* Summary KPI Cards */}
        <div className="player-kpi-grid grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 print:grid-cols-4 print:gap-2">
          {(showBallTracking ? [
            { label: '平均打球速度', val: summary.avgEV.toFixed(1), unit: 'km/h', titleColor: 'text-emerald-300' },
            { label: '最大打球速度', val: summary.maxEV.toFixed(1), unit: 'km/h', titleColor: 'text-rose-300' },
            { label: 'Hard Hit率', val: summary.hardHitRate, unit: '%', titleColor: 'text-amber-300' },
            { label: '平均打球角度', val: summary.avgLA.toFixed(1), unit: '°', titleColor: 'text-purple-300' }
          ] : [
            { label: '平均バット速度', val: summary.avgBS.toFixed(1), unit: 'km/h', titleColor: 'text-blue-300' },
            { label: '最大バット速度', val: summary.maxBS.toFixed(1), unit: 'km/h', titleColor: 'text-rose-300' },
            { label: 'アッパースイング度', val: summary.avgAA.toFixed(1), unit: '°', titleColor: 'text-amber-300' },
            { label: 'オンプレーン率', val: summary.avgPlane.toFixed(1), unit: '%', titleColor: 'text-emerald-300' }
          ]).map((kpi, i) => (
            <div key={i} className="player-kpi-card bg-slate-800/80 p-4 rounded-xl border border-slate-700 text-center print:bg-[#1e293b] print:border-slate-700 print:p-2">
              <p className={`text-xs font-bold uppercase print:text-[8px] ${kpi.titleColor}`}>{kpi.label}<span className="block text-[10px] font-normal text-slate-400 normal-case">({kpi.unit})</span></p>
              <p className="text-2xl font-black text-white print:text-white print:text-lg mt-1">{kpi.val}</p>
            </div>
          ))}
        </div>

        {/* Ball Tracking Section (Rapsodo / Combined) */}
        {showBallTracking && (
          <section className="player-analysis-section bg-slate-900/40 p-4 sm:p-6 rounded-[2rem] border border-slate-700/80 print:bg-[#0f172a] print:p-2 print:border-slate-700 print:m-0 print:mb-1">
            <h3 className="text-lg sm:text-xl font-black text-white mb-4 uppercase italic border-l-4 border-blue-500 pl-2.5 print:text-[10px] print:mb-1">打球トラッキング分析</h3>
            <div className="player-chart-grid grid grid-cols-1 md:grid-cols-2 gap-4 h-auto print:grid-cols-2 print:gap-2 print:h-[160px]">
              <div className="player-chart-card player-chart-card-inner bg-slate-800/50 p-4 rounded-xl border border-slate-700/60 flex flex-col h-[320px] print:bg-[#1e293b] print:h-[160px] print:p-1.5">
                <h3 className="text-xs font-black text-slate-400 uppercase mb-2 print:text-[8px] print:mb-0.5">打球速度 vs 打球角度</h3>
                <div className="player-chart-body flex-1 w-full min-h-[240px] print:h-[135px]"><VelocityAngleChart data={filteredData} xKeys={EV_KEYS} yKeys={LA_KEYS} /></div>
              </div>
              <div className="player-chart-card player-chart-card-inner bg-slate-800/50 p-4 rounded-xl border border-slate-700/60 flex flex-col h-[320px] print:bg-[#1e293b] print:h-[160px] print:p-1.5">
                <h3 className="text-xs font-black text-slate-400 uppercase mb-2 print:text-[8px] print:mb-0.5">打球方向 (スプレーチャート)</h3>
                <div className="player-chart-body flex-1 w-full min-h-[240px] print:h-[135px]"><SprayChart data={filteredData} /></div>
              </div>
            </div>
          </section>
        )}

        {/* Swing Analysis Section (Blast / Combined) */}
        {showSwingAnalysis && (
          <section className="player-swing-section bg-gradient-to-br from-slate-800/80 to-slate-900/80 p-5 rounded-2xl border border-purple-500/20 print:bg-[#1e293b] print:p-2 print:border-purple-500/30">
            <h3 className="text-purple-400 text-xs font-black uppercase tracking-widest flex items-center gap-1.5 mb-3 print:text-[9px] print:mb-1"><Zap size={15} /> スイング分析</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
              <div><p className="text-slate-400 text-[10px] font-black uppercase print:text-[7px]">平均バット速度<span className="block text-[9px] font-normal text-slate-500 normal-case">(km/h)</span></p><p className="text-xl font-black text-white print:text-base mt-0.5">{summary.avgBS.toFixed(1)}</p></div>
              <div><p className="text-slate-400 text-[10px] font-black uppercase print:text-[7px]">最大バット速度<span className="block text-[9px] font-normal text-slate-500 normal-case">(km/h)</span></p><p className="text-xl font-black text-white print:text-base mt-0.5">{summary.maxBS.toFixed(1)}</p></div>
              <div><p className="text-slate-400 text-[10px] font-black uppercase print:text-[7px]">オンプレーン率<span className="block text-[9px] font-normal text-slate-500 normal-case">(%)</span></p><p className="text-xl font-black text-white print:text-base mt-0.5">{summary.avgPlane.toFixed(1)}</p></div>
              <div><p className="text-slate-400 text-[10px] font-black uppercase print:text-[7px]">アッパースイング度<span className="block text-[9px] font-normal text-slate-500 normal-case">(°)</span></p><p className="text-xl font-black text-white print:text-base mt-0.5">{summary.avgAA.toFixed(1)}</p></div>
            </div>
          </section>
        )}

        {/* Date Trend Chart */}
        <PlayerTrendScatterChart savantEvents={savantEvents} blastEvents={blastEvents} sourceType={sourceType} startDate={startDate} endDate={endDate} />
      </div>
    </div>
  );
};

export default PlayerProfile;
