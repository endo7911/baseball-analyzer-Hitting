import React, { useState, useMemo, useEffect } from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts';
import { Dumbbell, Users, BarChart3, Settings2, Info } from 'lucide-react';
import {
  BODY_METRICS, SWING_METRIC, getMetric, buildSwingSpeedMap, buildPlayerRecords,
  averageRecords, fmt, recordValue, getBodyTeam, getBodyDate
} from '../utils/bodyComp';

const AXIS_OPTIONS = [SWING_METRIC, ...BODY_METRICS];

const BodyScatter = ({ records, xKey, yKey, teamAvg, color = '#06b6d4', xMax, yMax }) => {
  const xm = getMetric(xKey);
  const ym = getMetric(yKey);
  const points = records
    .map(r => ({ name: r.name, x: recordValue(r, xKey), y: recordValue(r, yKey) }))
    .filter(p => p.x !== null && p.x !== undefined && p.y !== null && p.y !== undefined);
  const missing = records.length - points.length;

  const parseVal = (v) => (v !== '' && v !== null && v !== undefined && !isNaN(Number(v)) ? Number(v) : null);
  const numXMax = parseVal(xMax);
  const numYMax = parseVal(yMax);

  const xDomain = ['auto', numXMax ?? 'auto'];
  const yDomain = ['auto', numYMax ?? 'auto'];

  return (
    <div className="flex flex-col h-full">
      <div style={{ height: 380 }} className="w-full">
        {points.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-500 text-sm">
            表示できるデータがありません
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 20, right: 25, bottom: 35, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis
                type="number" dataKey="x" name={xm.label} stroke="#94a3b8" fontSize={11}
                domain={xDomain}
                allowDataOverflow={numXMax !== null}
                label={{ value: `${xm.label}${xm.unit ? ` (${xm.unit})` : ''}`, position: 'insideBottom', offset: -18, fill: '#94a3b8', fontSize: 11 }}
              />
              <YAxis
                type="number" dataKey="y" name={ym.label} stroke="#94a3b8" fontSize={11} width={60}
                domain={yDomain}
                allowDataOverflow={numYMax !== null}
                label={{ value: `${ym.label}${ym.unit ? ` (${ym.unit})` : ''}`, angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 11 }}
              />
              {teamAvg?.[xKey] != null && <ReferenceLine x={teamAvg[xKey]} stroke="#f59e0b" strokeDasharray="4 4" />}
              {teamAvg?.[yKey] != null && <ReferenceLine y={teamAvg[yKey]} stroke="#f59e0b" strokeDasharray="4 4" />}
              <Tooltip
                cursor={{ strokeDasharray: '3 3' }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload;
                  return (
                    <div className="bg-slate-900 border border-slate-700 p-3 rounded-lg shadow-xl text-sm">
                      <p className="font-bold text-white mb-1 border-b border-slate-700 pb-1">{d.name}</p>
                      <p className="text-blue-300">{xm.label}: <span className="text-white font-mono">{fmt(d.x, xm.digits)} {xm.unit}</span></p>
                      <p className="text-cyan-300">{ym.label}: <span className="text-white font-mono">{fmt(d.y, ym.digits)} {ym.unit}</span></p>
                    </div>
                  );
                }}
              />
              <Scatter
                data={points}
                shape={({ cx, cy, payload }) => (
                  <g>
                    <circle cx={cx} cy={cy} r={6} fill={color} fillOpacity={0.85} stroke="#fff" strokeWidth={1} />
                    <text x={cx} y={cy - 10} textAnchor="middle" fill="#cbd5e1" fontSize={10} fontWeight="bold">{payload.name}</text>
                  </g>
                )}
              />
            </ScatterChart>
          </ResponsiveContainer>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400 mt-1 px-1">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4 border-t-2 border-dashed border-amber-500"></span>
          チーム平均
        </span>
        {missing > 0 && <span>※ データが揃っていない {missing} 名は表示していません</span>}
      </div>
    </div>
  );
};

function BodyCompAnalysis({ bodyCompData, blastData, combinedData, onViewPlayer, setActiveView }) {
  const rows = bodyCompData?.data || [];

  const teams = useMemo(() => Array.from(new Set(rows.map(getBodyTeam))).sort(), [rows]);
  const [selectedTeam, setSelectedTeam] = useState('');
  useEffect(() => {
    if (teams.length && !teams.includes(selectedTeam)) setSelectedTeam(teams[0]);
  }, [teams, selectedTeam]);

  const allDates = useMemo(() => {
    const dates = rows
      .filter(r => getBodyTeam(r) === selectedTeam)
      .map(getBodyDate)
      .filter(Boolean);
    return Array.from(new Set(dates)).sort();
  }, [rows, selectedTeam]);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    if (allDates.length > 0) {
      setStartDate(allDates[0]);
      setEndDate(allDates[allDates.length - 1]);
    } else {
      setStartDate('');
      setEndDate('');
    }
  }, [allDates]);

  const swingMap = useMemo(() => buildSwingSpeedMap(blastData, combinedData), [blastData, combinedData]);

  const filteredRows = useMemo(() => {
    return rows.filter(r => {
      if (getBodyTeam(r) !== selectedTeam) return false;
      const d = getBodyDate(r);
      if (!d) return true;
      if (startDate && d < startDate) return false;
      if (endDate && d > endDate) return false;
      return true;
    });
  }, [rows, selectedTeam, startDate, endDate]);

  const records = useMemo(() => {
    return buildPlayerRecords(filteredRows, swingMap);
  }, [filteredRows, swingMap]);

  const teamAvg = useMemo(() => averageRecords(records), [records]);

  const [sortKey, setSortKey] = useState('muscle');
  const [sortDir, setSortDir] = useState('desc');
  const handleSort = (key) => {
    if (sortKey === key) setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir(key === 'name' ? 'asc' : 'desc'); }
  };
  const sorted = useMemo(() => {
    const list = [...records];
    list.sort((a, b) => {
      if (sortKey === 'name') return sortDir === 'asc' ? a.name.localeCompare(b.name, 'ja') : b.name.localeCompare(a.name, 'ja');
      const va = recordValue(a, sortKey);
      const vb = recordValue(b, sortKey);
      if (va == null && vb == null) return 0;
      if (va == null) return 1; // always push missing values to the bottom
      if (vb == null) return -1;
      return sortDir === 'asc' ? va - vb : vb - va;
    });
    return list;
  }, [records, sortKey, sortDir]);

  const [customX, setCustomX] = useState('weight');
  const [customY, setCustomY] = useState('swingSpeed');

  // Chart limit controls
  const [chart1XMax, setChart1XMax] = useState('');
  const [chart1YMax, setChart1YMax] = useState('');
  const [chart2XMax, setChart2XMax] = useState('');
  const [chart2YMax, setChart2YMax] = useState('');

  const arrow = (key) => (sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');
  const mainMetrics = BODY_METRICS.filter(m => !m.group);
  const partMetrics = BODY_METRICS.filter(m => m.group === 'part');
  const beforeParts = mainMetrics.filter(m => m.key !== 'ffmi');
  const afterParts = mainMetrics.filter(m => m.key === 'ffmi');

  if (rows.length === 0) {
    return (
      <div className="animate-in fade-in duration-300">
        <header className="mb-8">
          <h2 className="text-3xl font-extrabold text-white mb-2 flex items-center gap-3"><Dumbbell className="w-8 h-8 text-cyan-400" />体組成分析</h2>
        </header>
        <div className="bg-gradient-to-br from-cyan-950/40 via-slate-900 to-slate-900 border border-cyan-500/30 rounded-3xl p-12 text-center shadow-2xl space-y-4 my-6">
          <div className="w-16 h-16 bg-cyan-500/10 border border-cyan-500/30 rounded-2xl flex items-center justify-center mx-auto text-cyan-400 shadow-lg shadow-cyan-500/10">
            <Dumbbell className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-xl font-extrabold text-cyan-300 mb-1">体組成データがまだ読み込まれていません</h3>
            <p className="text-sm text-slate-400 max-w-md mx-auto leading-relaxed mt-2">
              「データ読み込み」画面の「体組成データ (Body Composition)」からCSVファイルをアップロードしてください。
            </p>
          </div>
          {setActiveView && (
            <div className="pt-2">
              <button 
                onClick={() => setActiveView('upload')}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-extrabold shadow-lg shadow-cyan-900/30 transition-all transform hover:scale-105 cursor-pointer"
              >
                データ読み込みへ進む →
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  const thBase = 'px-3 py-3 whitespace-nowrap cursor-pointer hover:text-white transition-colors';
  const renderMetricTh = (m, extra = '') => (
    <th key={m.key} rowSpan={m.group ? 1 : 2} onClick={() => handleSort(m.key)} className={`${thBase} text-right ${extra}`}>
      {m.label}{arrow(m.key)}
      {m.unit && <span className="block text-[10px] text-slate-500 font-normal normal-case">({m.unit})</span>}
    </th>
  );
  const renderCell = (m, v, cls = '') => (
    <td key={m.key} className={`px-3 py-3 text-right font-mono ${cls}`}>{fmt(v, m.digits)}</td>
  );

  return (
    <div className="animate-in fade-in duration-300 space-y-8">
      <header>
        <h2 className="text-3xl font-extrabold text-white mb-2 flex items-center gap-3">
          <Dumbbell className="w-8 h-8 text-cyan-400" />体組成分析
        </h2>
        <p className="text-slate-400">チームの体組成の平均と、スイングスピードとの関係を確認できます。</p>
      </header>

      {/* Settings */}
      <div className="bg-cyan-900/10 border-2 border-cyan-500/30 p-6 rounded-3xl shadow-2xl space-y-4">
        <div className="flex items-center text-cyan-300">
          <Settings2 className="w-5 h-5 mr-2" />
          <h3 className="text-lg font-bold text-white">表示設定</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-cyan-400 mb-2 uppercase tracking-widest">1. チーム選択</label>
            <select
              value={selectedTeam}
              onChange={e => setSelectedTeam(e.target.value)}
              className="w-full bg-slate-900 border-2 border-cyan-500/20 hover:border-cyan-500/50 text-white rounded-xl p-3 outline-none font-bold text-sm"
            >
              {teams.map(t => <option key={t} value={t}>{t === 'Unknown Team' ? '全チーム (チーム指定なし)' : t}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-cyan-400 mb-2 uppercase tracking-widest flex items-center justify-between">
              <span>2. 測定日付範囲</span>
              {(startDate || endDate) && (
                <button
                  onClick={() => {
                    if (allDates.length > 0) {
                      setStartDate(allDates[0]);
                      setEndDate(allDates[allDates.length - 1]);
                    } else {
                      setStartDate('');
                      setEndDate('');
                    }
                  }}
                  className="text-[10px] text-cyan-300 hover:text-white underline font-normal normal-case"
                >
                  全期間に戻す
                </button>
              )}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full bg-slate-900 border-2 border-cyan-500/20 hover:border-cyan-500/50 text-white rounded-xl p-2.5 text-xs outline-none font-mono font-bold cursor-pointer"
              />
              <span className="text-slate-400 font-bold text-xs">〜</span>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full bg-slate-900 border-2 border-cyan-500/20 hover:border-cyan-500/50 text-white rounded-xl p-2.5 text-xs outline-none font-mono font-bold cursor-pointer"
              />
            </div>
          </div>
        </div>

        <p className="text-xs text-slate-500 flex items-center gap-1.5 pt-1 border-t border-slate-800">
          <Info className="w-3.5 h-3.5" />
          指定した日付範囲内の最新の測定データを使用して集計しています。スイングスピードはBlast・統合データより自動連携しています。
        </p>
      </div>

      {/* Team average KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { key: 'weight', color: 'text-blue-300', bg: 'bg-blue-900/30 border-blue-800/50' },
          { key: 'muscle', color: 'text-cyan-300', bg: 'bg-cyan-900/30 border-cyan-800/50' },
          { key: 'fatPct', color: 'text-amber-300', bg: 'bg-amber-900/30 border-amber-800/50' },
          { key: 'ffmi', color: 'text-purple-300', bg: 'bg-purple-900/30 border-purple-800/50' },
        ].map(({ key, color, bg }) => {
          const m = getMetric(key);
          return (
            <div key={key} className={`${bg} border rounded-xl p-4 text-center`}>
              <div className={`${color} text-xs font-bold mb-1`}>チーム平均 {m.label}</div>
              <div className="text-2xl font-extrabold text-white">
                {fmt(teamAvg[key], m.digits)} {m.unit && <span className="text-xs text-slate-400 font-normal">{m.unit}</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Table */}
      <div className="w-full bg-slate-800 rounded-xl border border-slate-700 overflow-hidden shadow-xl">
        <div className="p-4 bg-slate-900 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center">
            <Users className="w-5 h-5 text-cyan-400 mr-2" />
            <h3 className="font-bold text-white">体組成一覧（チーム平均）</h3>
            <span className="ml-3 text-xs text-slate-400">全 {records.length} 名</span>
          </div>
          <span className="text-[11px] text-slate-500">項目名クリックで並び替え</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-slate-300">
            <thead className="text-xs text-slate-400 bg-slate-900/50 border-b border-slate-700 select-none">
              <tr>
                <th rowSpan={2} onClick={() => handleSort('name')} className={`${thBase} text-left sticky left-0 bg-slate-900`}>選手名{arrow('name')}</th>
                <th rowSpan={2} className="px-3 py-3 whitespace-nowrap text-left">測定日</th>
                {beforeParts.map(m => renderMetricTh(m))}
                <th colSpan={partMetrics.length} className="px-3 py-2 text-center border-b border-slate-700 border-x border-x-slate-700/50">
                  部位別筋肉量 <span className="text-[10px] text-slate-500 font-normal">(kg)</span>
                </th>
                {afterParts.map(m => renderMetricTh(m))}
                {onViewPlayer && <th rowSpan={2} className="px-3 py-3 text-right">詳細</th>}
              </tr>
              <tr>
                {partMetrics.map(m => (
                  <th key={m.key} onClick={() => handleSort(m.key)} className={`${thBase} text-right`}>{m.label}{arrow(m.key)}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/60">
              {/* Team average row */}
              <tr className="bg-amber-500/10 text-amber-100 font-bold">
                <td className="px-3 py-3 sticky left-0 bg-[#3a3424] whitespace-nowrap">チーム平均</td>
                <td className="px-3 py-3 text-slate-500">-</td>
                {beforeParts.map(m => renderCell(m, teamAvg[m.key]))}
                {partMetrics.map(m => renderCell(m, teamAvg[m.key]))}
                {afterParts.map(m => renderCell(m, teamAvg[m.key]))}
                {onViewPlayer && <td></td>}
              </tr>
              {sorted.map(r => (
                <tr key={r.name} className="hover:bg-slate-700/40 transition-colors">
                  <td className="px-3 py-3 font-bold text-white whitespace-nowrap sticky left-0 bg-slate-800">{r.name}</td>
                  <td className="px-3 py-3 text-slate-400 text-xs whitespace-nowrap">{r.date || '-'}</td>
                  {beforeParts.map(m => renderCell(m, r.values[m.key]))}
                  {partMetrics.map(m => renderCell(m, r.values[m.key]))}
                  {afterParts.map(m => renderCell(m, r.values[m.key]))}
                  {onViewPlayer && (
                    <td className="px-3 py-3 text-right">
                      <button
                        onClick={() => onViewPlayer(r.name, r.team, 'body_comp')}
                        className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs px-3 py-1.5 rounded-lg font-bold transition-all flex items-center ml-auto gap-1 whitespace-nowrap"
                      >
                        <BarChart3 className="w-3.5 h-3.5" />個人
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-slate-800 rounded-xl border border-cyan-500/30 shadow-lg p-5">
          <div className="mb-4 border-b border-slate-700 pb-3 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-white text-base whitespace-nowrap">スイングスピード × 筋肉量</h3>
              <p className="text-xs text-slate-400 mt-0.5">X軸: スイングスピード (km/h) ／ Y軸: 筋肉量 (kg)</p>
            </div>
            <div className="flex items-center gap-2 text-xs bg-slate-900/80 px-2.5 py-1.5 rounded-lg border border-slate-700 shrink-0 self-start xl:self-auto">
              <span className="text-slate-400 font-bold">X上限:</span>
              <input
                type="number"
                placeholder="自動"
                value={chart1XMax}
                onChange={e => setChart1XMax(e.target.value)}
                className="w-16 bg-slate-800 border border-slate-600 text-white font-mono rounded px-1.5 py-0.5 outline-none focus:border-cyan-400 text-xs"
              />
              <span className="text-slate-400 font-bold ml-1">Y上限:</span>
              <input
                type="number"
                placeholder="自動"
                value={chart1YMax}
                onChange={e => setChart1YMax(e.target.value)}
                className="w-16 bg-slate-800 border border-slate-600 text-white font-mono rounded px-1.5 py-0.5 outline-none focus:border-cyan-400 text-xs"
              />
              {(chart1XMax || chart1YMax) && (
                <button
                  onClick={() => { setChart1XMax(''); setChart1YMax(''); }}
                  className="text-[10px] text-slate-400 hover:text-white underline ml-0.5"
                >
                  解除
                </button>
              )}
            </div>
          </div>
          <BodyScatter records={records} xKey="swingSpeed" yKey="muscle" teamAvg={teamAvg} color="#06b6d4" xMax={chart1XMax} yMax={chart1YMax} />
        </div>

        <div className="bg-slate-800 rounded-xl border border-purple-500/30 shadow-lg p-5">
          <div className="mb-4 border-b border-slate-700 pb-3 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-white text-base whitespace-nowrap">BMI × FFMI</h3>
              <p className="text-xs text-slate-400 mt-0.5">X軸: BMI (kg/m²) ／ Y軸: FFMI</p>
            </div>
            <div className="flex items-center gap-2 text-xs bg-slate-900/80 px-2.5 py-1.5 rounded-lg border border-slate-700 shrink-0 self-start xl:self-auto">
              <span className="text-slate-400 font-bold">X上限:</span>
              <input
                type="number"
                placeholder="自動"
                value={chart2XMax}
                onChange={e => setChart2XMax(e.target.value)}
                className="w-16 bg-slate-800 border border-slate-600 text-white font-mono rounded px-1.5 py-0.5 outline-none focus:border-purple-400 text-xs"
              />
              <span className="text-slate-400 font-bold ml-1">Y上限:</span>
              <input
                type="number"
                placeholder="自動"
                value={chart2YMax}
                onChange={e => setChart2YMax(e.target.value)}
                className="w-16 bg-slate-800 border border-slate-600 text-white font-mono rounded px-1.5 py-0.5 outline-none focus:border-purple-400 text-xs"
              />
              {(chart2XMax || chart2YMax) && (
                <button
                  onClick={() => { setChart2XMax(''); setChart2YMax(''); }}
                  className="text-[10px] text-slate-400 hover:text-white underline ml-0.5"
                >
                  解除
                </button>
              )}
            </div>
          </div>
          <BodyScatter records={records} xKey="bmi" yKey="ffmi" teamAvg={teamAvg} color="#a855f7" xMax={chart2XMax} yMax={chart2YMax} />
        </div>

        <div className="bg-slate-800 rounded-xl border border-slate-700 shadow-lg p-5">
          <div className="mb-4 border-b border-slate-700 pb-3 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-white text-base whitespace-nowrap">指標を選んで比較</h3>
              <p className="text-xs text-slate-400 mt-0.5">X軸 / Y軸 の対象指標を自由に選択</p>
            </div>
            <div className="flex items-center gap-2 text-xs bg-slate-900/80 px-2.5 py-1.5 rounded-lg border border-slate-700 shrink-0 self-start xl:self-auto">
              <span className="text-slate-400 font-bold">X:</span>
              <select value={customX} onChange={e => setCustomX(e.target.value)} className="bg-slate-800 border border-slate-600 text-white font-bold rounded px-1.5 py-0.5 outline-none">
                {AXIS_OPTIONS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
              <span className="text-slate-400 font-bold ml-1">Y:</span>
              <select value={customY} onChange={e => setCustomY(e.target.value)} className="bg-slate-800 border border-slate-600 text-white font-bold rounded px-1.5 py-0.5 outline-none">
                {AXIS_OPTIONS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
            </div>
          </div>
          <BodyScatter records={records} xKey={customX} yKey={customY} teamAvg={teamAvg} color="#3b82f6" />
        </div>
      </div>
    </div>
  );
}

export default BodyCompAnalysis;
