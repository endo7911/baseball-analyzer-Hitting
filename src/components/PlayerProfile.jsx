import React, { useState, useMemo, useRef } from 'react';
import { 
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Radar, RadarChart, PolarGrid, PolarAngleAxis, LineChart, Line, ComposedChart, Legend
} from 'recharts';
import { 
  Activity, Zap, Target, Gauge, TrendingUp, BarChart3, 
  Printer, ShieldAlert, ShieldCheck, List, Layout, ChevronDown, ChevronUp, MousePointer2, Users
} from 'lucide-react';

import { 
  parseNumeric, 
  getDataValue, 
  calculateAverages,
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
        <Scatter name="Data" data={chartData} fill={fill} fillOpacity={0.6} />
      </ScatterChart>
    </ResponsiveContainer>
  );
};


const PlayerTrendScatterChart = ({ savantEvents, blastEvents }) => {
  const [metric, setMetric] = useState('ev');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const metricMeta = {
    ev: { label: '打球速度', unit: 'km/h', color: '#10b981', keys: EV_KEYS },
    la: { label: '打球角度', unit: '°', color: '#a855f7', keys: LA_KEYS },
    bs: { label: 'バット速度', unit: 'km/h', color: '#3b82f6', keys: BS_KEYS },
    aa: { label: 'アッパースイング度', unit: '°', color: '#f59e0b', keys: AA_KEYS },
  };

  const currentMeta = metricMeta[metric];

  const allEvents = useMemo(() => {
    return [...(savantEvents || []), ...(blastEvents || [])];
  }, [savantEvents, blastEvents]);

  const trendData = useMemo(() => {
    const dateMap = {};
    allEvents.forEach(e => {
      const rawDate = e.game_date || e.date || e['日付'] || e['Date'] || e['gameDate'] || '';
      if (!rawDate) return;

      const dateStr = String(rawDate).trim().split('T')[0].split(' ')[0];
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

      const parts = dateStr.split('-');
      let timeMs = 0;
      if (parts.length === 3) {
        timeMs = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])).getTime();
      } else {
        timeMs = new Date(dateStr).getTime();
      }

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

  return (
    <div className="w-full bg-slate-800/60 p-4 sm:p-6 rounded-2xl border border-slate-700 mt-6 print:bg-white print:border-slate-200">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-700/60 pb-3 mb-4 print:border-slate-200">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-purple-400 print:text-purple-600 flex-shrink-0" />
          <h3 className="text-xs sm:text-sm font-black text-slate-300 uppercase print:text-slate-900">日付別 指標変動トレンド (平均 & 最大)</h3>
        </div>

        <div className="flex flex-wrap items-center gap-3 no-print">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400 font-bold whitespace-nowrap">範囲:</span>
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
                className="text-[10px] text-purple-400 hover:text-purple-300 font-bold underline"
              >
                全期間
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400 font-bold whitespace-nowrap">Y軸:</span>
            <select
              value={metric}
              onChange={e => setMetric(e.target.value)}
              className="bg-slate-900 border border-slate-700 text-white text-xs font-bold rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-purple-500 cursor-pointer"
            >
              <option value="ev">打球速度 (km/h)</option>
              <option value="la">打球角度 (°)</option>
              <option value="bs">バット速度 (km/h)</option>
              <option value="aa">アッパースイング度 (°)</option>
            </select>
          </div>
        </div>
      </div>

      <div className="w-full h-[340px] print:h-[200px]">
        {trendData.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-500 text-xs italic">
            選択された期間・指標のデータが見つかりません
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={trendData} margin={{ top: 20, right: 30, bottom: 25, left: 15 }}>
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
                label={{ value: '日付', position: 'insideBottom', offset: -5, fill: '#94a3b8', fontSize: 10 }}
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

const PlayerProfile = ({ playerName, stats, isCombined = false }) => {
  const savantEvents = stats?.savantEvents || [];
  const blastEvents = stats?.blastEvents || [];
  const [forceMode, setForceMode] = useState(null); 
  const [hitsOnly] = useState(false);

  const mode = forceMode || (isCombined ? 'classic' : 'pro');

  const filteredData = useMemo(() => {
    let data = savantEvents;
    if (hitsOnly) {
      data = data.filter(r => (r.events || r.Result || '').toLowerCase().includes('hit') || (r.events || '').toLowerCase().includes('single'));
    }
    return data;
  }, [savantEvents, hitsOnly]);

  const summary = useMemo(() => {
    const avgEV = calculateAverages(filteredData, EV_KEYS);
    const maxEV = Math.max(...filteredData.map(r => getDataValue(r, EV_KEYS)), 0);
    const avgLA = calculateAverages(filteredData, LA_KEYS);
    const avgBS = calculateAverages(blastEvents, BS_KEYS) || calculateAverages(filteredData, BS_KEYS);
    const maxBS = Math.max(...blastEvents.map(r => getDataValue(r, BS_KEYS)), ...filteredData.map(r => getDataValue(r, BS_KEYS)), 0);
    
    const total = filteredData.length;
    // Thresholds in km/h (Rapsodo data is already km/h)
    const hardHit = filteredData.filter(r => getDataValue(r, EV_KEYS) >= 153).length; // 95mph = 153km/h
    const barrel = filteredData.filter(r => getDataValue(r, EV_KEYS) >= 158 && getDataValue(r, LA_KEYS) >= 26 && getDataValue(r, LA_KEYS) <= 30).length; // 98mph = 158km/h
    const sweetSpot = filteredData.filter(r => getDataValue(r, LA_KEYS) >= 8 && getDataValue(r, LA_KEYS) <= 32).length;

    return {
      avgEV, // No conversion - data is already in km/h
      maxEV, // No conversion
      avgLA,
      avgBS, // No conversion
      maxBS,
      hardHitRate: total > 0 ? (hardHit / total * 100).toFixed(1) : 0,
      barrelRate: total > 0 ? (barrel / total * 100).toFixed(1) : 0,
      sweetSpotRate: total > 0 ? (sweetSpot / total * 100).toFixed(1) : 0,
      avgPlane: calculateAverages(blastEvents, PLANE_KEYS),
      avgConn: calculateAverages(blastEvents, CONN_KEYS),
      avgRot: calculateAverages(blastEvents, ROT_KEYS),
      avgTime: calculateAverages(blastEvents, TIME_KEYS),
      avgAA: calculateAverages(blastEvents, AA_KEYS),
      avgHS: calculateAverages(blastEvents, HS_KEYS),
      avgPlaneScore: calculateAverages(blastEvents, ON_PLANE_SCORE_KEYS),
      total
    };
  }, [filteredData, blastEvents]);


  const hasBatData = summary.avgBS > 0;
  const reportTeam = savantEvents[0]?.Team || savantEvents[0]?.team_name || 'Individual';

  const handlePrint = () => {
    const originalTitle = document.title;
    document.title = `${playerName || 'player'}_analysis_report`;
    window.setTimeout(() => {
      window.print();
      document.title = originalTitle;
    }, 150);
  };

  const renderClassic = () => (
    <div className="report-content player-report player-screen-report print:bg-white print:text-slate-900">
      {/* Print-Only Header */}
      <div className="player-print-header hidden print:block border-b-4 border-blue-600 pb-4 mb-4">
        <h1 className="text-3xl font-black uppercase">{playerName}</h1>
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
          {reportTeam} • {new Date().toLocaleDateString('ja-JP')} • Analysis Report
        </p>
      </div>

      <div className="player-report-body space-y-6 print:space-y-4">
        {/* Summary Metrics */}
        <div className="player-kpi-grid grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 print:grid-cols-4 print:gap-2 print:mb-4">
          {[
            { label: 'Avg EV', val: summary.avgEV.toFixed(1), unit: 'km/h' },
            { label: 'Avg LA', val: summary.avgLA.toFixed(1), unit: '°' },
            { label: 'Hard Hit', val: summary.hardHitRate, unit: '%' },
            { label: 'Sweet Spot', val: summary.sweetSpotRate, unit: '%' }
          ].map((kpi, i) => (
            <div key={i} className="player-kpi-card bg-slate-800/60 p-4 rounded-xl border border-slate-700 text-center print:bg-slate-50 print:border-slate-200 print:p-2">
              <p className="text-[10px] text-slate-500 font-bold uppercase print:text-[8px]">{kpi.label}</p>
              <p className="text-2xl font-black text-white print:text-slate-900 print:text-lg">{kpi.val}<span className="text-[10px] ml-0.5">{kpi.unit}</span></p>
            </div>
          ))}
        </div>

        {/* Charts */}
        <div className="player-chart-grid grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 print:grid-cols-2 print:gap-4">
          <div className="player-chart-card bg-slate-800/60 p-4 sm:p-6 rounded-2xl border border-slate-700 h-[320px] sm:h-[350px] flex flex-col print:bg-white print:border-2 print:border-slate-100 print:h-[220px] print:p-2">
            <h3 className="text-xs font-black text-slate-400 uppercase mb-4 print:text-slate-900 print:mb-1 print:text-[10px]">Velocity vs Angle</h3>
            <div className="player-chart-body flex-1"><VelocityAngleChart data={filteredData} xKeys={EV_KEYS} yKeys={LA_KEYS} /></div>
          </div>
          <div className="player-chart-card bg-slate-800/60 p-4 sm:p-6 rounded-2xl border border-slate-700 h-[320px] sm:h-[350px] flex flex-col print:bg-white print:border-2 print:border-slate-100 print:h-[220px] print:p-2">
            <h3 className="text-xs font-black text-slate-400 uppercase mb-4 print:text-slate-900 print:mb-1 print:text-[10px]">Spray Chart</h3>
            <div className="player-chart-body flex-1"><SprayChart data={filteredData} /></div>
          </div>
        </div>

        {/* 日付推移散布図 */}
        <PlayerTrendScatterChart savantEvents={savantEvents} blastEvents={blastEvents} />
      </div>
    </div>
  );

  const renderPro = () => (
    <div className="report-content player-report player-screen-report print:bg-white print:text-slate-900">
      {/* Print-Only Header */}
      <div className="player-print-header hidden print:block border-b-4 border-blue-600 pb-4 mb-4">
        <h1 className="text-4xl font-black uppercase leading-none">{playerName}</h1>
        <p className="text-xs font-bold text-slate-500 mt-2 uppercase tracking-widest">
          {reportTeam} • {new Date().toLocaleDateString('ja-JP')} • Pro Report
        </p>
      </div>

      <div className="player-report-body space-y-8 print:space-y-4">
        <div className="player-kpi-grid grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 print:grid-cols-4 print:gap-2">
          {[
            { label: 'EV (Avg)', val: summary.avgEV.toFixed(1), color: 'blue' },
            { label: 'EV (Max)', val: summary.maxEV.toFixed(1), color: 'red' },
            { label: 'Hard Hit%', val: summary.hardHitRate, color: 'orange' },
            { label: 'Launch∠', val: summary.avgLA.toFixed(1), color: 'emerald' }
          ].map((kpi, i) => (
            <div key={i} className="player-kpi-card bg-slate-800/40 p-5 rounded-3xl border border-slate-700 text-center print:bg-slate-50 print:border-slate-200 print:p-3">
              <p className="text-[10px] text-slate-400 font-black uppercase print:text-slate-500 print:text-[8px]">{kpi.label}</p>
              <p className="text-3xl font-black text-white print:text-slate-900 print:text-xl">{kpi.val}</p>
            </div>
          ))}
        </div>

        <section className="player-analysis-section bg-slate-900/30 p-4 sm:p-8 rounded-[2.5rem] border border-slate-700 print:bg-white print:p-2 print:border-none print:m-0">
          <h3 className="text-2xl font-black text-white mb-8 uppercase italic border-l-4 border-blue-500 pl-4 print:text-sm print:text-slate-900 print:bg-slate-50 print:p-1 print:mb-2">Ball Tracking Analysis</h3>
          <div className="player-chart-grid grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 h-auto md:h-[400px] print:grid-cols-2 print:gap-4 print:h-[200px]">
            <div className="player-chart-card player-chart-card-inner flex flex-col h-[320px] md:h-full print:h-[180px]">
              <h3 className="text-xs font-black text-slate-400 uppercase mb-3 print:text-slate-900 print:mb-1 print:text-[10px]">Velocity vs Angle</h3>
              <div className="player-chart-body flex-1"><VelocityAngleChart data={filteredData} xKeys={EV_KEYS} yKeys={LA_KEYS} /></div>
            </div>
            <div className="player-chart-card player-chart-card-inner flex flex-col h-[320px] md:h-full print:h-[180px]">
              <h3 className="text-xs font-black text-slate-400 uppercase mb-3 print:text-slate-900 print:mb-1 print:text-[10px]">Spray Chart</h3>
              <div className="player-chart-body flex-1"><SprayChart data={filteredData} /></div>
            </div>
          </div>
        </section>

        {hasBatData && (
          <section className="player-swing-section bg-gradient-to-br from-slate-800 to-slate-900 p-8 rounded-[2.5rem] border border-purple-500/20 print:hidden">
            <h3 className="text-purple-400 uppercase tracking-widest flex items-center gap-2 mb-8"><Zap size={16} /> Swing Analysis</h3>
            <div className="flex justify-around text-center">
              <div><p className="text-slate-500 text-[10px] font-black uppercase">Avg Bat Speed</p><p className="text-4xl font-black text-white">{summary.avgBS.toFixed(1)}</p></div>
              <div><p className="text-slate-500 text-[10px] font-black uppercase">On Plane%</p><p className="text-4xl font-black text-white">{summary.avgPlane.toFixed(1)}%</p></div>
            </div>
          </section>
        )}

        {/* 日付推移散布図 */}
        <PlayerTrendScatterChart savantEvents={savantEvents} blastEvents={blastEvents} />
      </div>
    </div>
  );


  return (
    <div className="player-profile-root text-slate-200 pb-20">
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 5mm;
          }
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            background-color: white !important;
          }
          /* Prevent dark backgrounds on spray chart SVG during print */
          .spray-field-outfield {
            fill: #f1f5f9 !important;
            stroke: #94a3b8 !important;
          }
          .spray-field-infield {
            fill: #e2e8f0 !important;
            stroke: #94a3b8 !important;
          }
          .spray-field-lines {
            stroke: #94a3b8 !important;
          }
          .recharts-cartesian-grid line {
            stroke: #e2e8f0 !important;
          }
          svg text {
            fill: #334155 !important;
          }
          .no-print {
            display: none !important;
          }
          .player-report-body {
            gap: 1rem !important;
          }
          .player-chart-card-inner {
            height: 180px !important;
          }
          .player-analysis-section {
            padding: 0.5rem !important;
            margin-bottom: 0.5rem !important;
          }
          /* Prevent awkward page breaks in PDF */
          .player-chart-grid, .player-kpi-grid, .player-analysis-section {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
        }
      `}</style>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10 no-print">
        <div>
          <h1 className="text-4xl font-black text-white tracking-tight">{playerName}</h1>
          <p className="text-slate-500 text-xs font-bold mt-1 uppercase tracking-widest">{mode === 'classic' ? 'HITTING ANALYSIS' : 'Rapsodo / Blast 単体分析'}</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="bg-slate-800 p-1 rounded-2xl border border-slate-700 flex">
            <button onClick={() => setForceMode('classic')} className={`p-2 rounded-xl transition-all ${mode === 'classic' ? 'bg-slate-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}><List size={18} /></button>
            <button onClick={() => setForceMode('pro')} className={`p-2 rounded-xl transition-all ${mode === 'pro' ? 'bg-slate-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}><Layout size={18} /></button>
          </div>
          <button onClick={handlePrint} className="bg-white text-slate-900 font-black py-3 px-6 rounded-2xl flex items-center gap-2 shadow-xl hover:bg-slate-100 transition-all"><Printer size={18} /> PDF出力</button>
        </div>
      </div>

      {mode === 'classic' ? renderClassic() : renderPro()}
    </div>
  );
};

export default PlayerProfile;
