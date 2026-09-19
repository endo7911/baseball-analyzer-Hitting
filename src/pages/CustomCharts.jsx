import React, { useState, useMemo } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { LineChart, Settings2, Table } from 'lucide-react';
import { parseNumeric } from '../utils/dataHelpers';

const parseNum = (val) => {
  const n = parseNumeric(val);
  return isNaN(n) ? NaN : n;
};

// Format a numeric value smartly: integers as integer, otherwise 1dp
const fmtVal = (v, key = '') => {
  if (v === undefined || v === null || isNaN(v)) return '-';
  const GRADE_KEYS = ['学年', '学年（数値）', 'grade', 'Grade', 'Year', 'year'];
  if (GRADE_KEYS.some(k => key.includes(k))) return `${Math.round(v)}年`;
  return Number.isInteger(v) || v % 1 === 0 ? String(Math.round(v)) : v.toFixed(1);
};

function CustomCharts({ savantData, blastData, combinedData }) {
  const [source, setSource] = useState('savant');
  const [xAxis, setXAxis] = useState('');
  const [yAxis, setYAxis] = useState('');
  const [viewMode, setViewMode] = useState('chart'); // 'chart' or 'table'

  const activeData = source === 'savant' ? savantData : source === 'blast' ? blastData : combinedData;
  const rawHeaders = activeData?.headers ?? [];
  
  // Filter headers to only show those that actually contain numeric data in the current dataset
  const headers = useMemo(() => {
    if (!activeData?.data || activeData.data.length === 0) return [];
    
    // Internal keys to always exclude
    const internalKeys = ['id', 'owner_id', 'team_id', 'upload_id', 'updated_at', 'created_at', 'file_name', 'filename'];
    
    return rawHeaders.filter(h => {
      if (internalKeys.includes(h.toLowerCase())) return false;
      
      // Check if this header has at least one numeric value in the first 100 rows
      const sampleRows = activeData.data.slice(0, 100);
      return sampleRows.some(row => {
        const val = row[h];
        if (val === null || val === undefined || val === '') return false;
        const n = parseNum(val);
        return !isNaN(n);
      });
    });
  }, [rawHeaders, activeData]);

  const handleSourceChange = (e) => {
    setSource(e.target.value);
    setXAxis('');
    setYAxis('');
  };

  // Build plot data only when axes are selected
  const plotData = useMemo(() => {
    if (!activeData?.data || !xAxis || !yAxis) return [];
    const result = [];
    for (const row of activeData.data) {
      if (!row) continue;
      const x = parseNum(row[xAxis]);
      const y = parseNum(row[yAxis]);
      if (!isNaN(x) && !isNaN(y)) {
        result.push({
          x,
          y,
          playerLabel: row.player_name || row['バット'] || row['選手名'] || row['日付'] || '',
          rawRow: row,
        });
      }
    }
    return result;
  }, [activeData, xAxis, yAxis]);

  // Table data: top 200 rows sorted by x desc
  const tableData = useMemo(() => {
    return [...plotData].sort((a, b) => b.x - a.x).slice(0, 200);
  }, [plotData]);

  const isGradeX = useMemo(() => {
    const GRADE_KEYS = ['学年', '学年（数値）', 'grade', 'Grade', 'Year', 'year'];
    return GRADE_KEYS.some(k => xAxis.includes(k));
  }, [xAxis]);

  const isGradeY = useMemo(() => {
    const GRADE_KEYS = ['学年', '学年（数値）', 'grade', 'Grade', 'Year', 'year'];
    return GRADE_KEYS.some(k => yAxis.includes(k));
  }, [yAxis]);

  const xTicks = useMemo(() => {
    if (!isGradeX || !plotData.length) return undefined;
    const vals = [...new Set(plotData.map(d => Math.round(d.x)))].filter(v => !isNaN(v)).sort((a, b) => a - b);
    return vals.length > 0 ? vals : undefined;
  }, [isGradeX, plotData]);

  const yTicks = useMemo(() => {
    if (!isGradeY || !plotData.length) return undefined;
    const vals = [...new Set(plotData.map(d => Math.round(d.y)))].filter(v => !isNaN(v)).sort((a, b) => a - b);
    return vals.length > 0 ? vals : undefined;
  }, [isGradeY, plotData]);

  const SCATTER_COLOR = source === 'savant' ? '#3b82f6' : source === 'blast' ? '#a855f7' : '#10b981';

  return (
    <div className="animate-in fade-in duration-300">
      <header className="mb-8">
        <h2 className="text-3xl font-extrabold text-white mb-2">カスタムグラフ作成</h2>
        <p className="text-slate-400">データソースとX軸・Y軸を自由に選択して、散布図・データ表を確認できます。</p>
      </header>

      {/* Controls */}
      <div className="bg-slate-800/80 p-6 rounded-2xl border border-slate-700/50 mb-6 shadow-lg">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className="flex items-center gap-1 text-sm font-medium text-slate-400 mb-2">
              <Settings2 className="w-4 h-4" /> データソース
            </label>
            <select
              value={source}
              onChange={handleSourceChange}
              className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg p-3 focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="savant" disabled={!savantData}>Rapsodo Data {!savantData && '(未読込)'}</option>
              <option value="blast" disabled={!blastData}>Blast Data {!blastData && '(未読込)'}</option>
              <option value="combined" disabled={!combinedData}>Combined Data {!combinedData && '(未読込)'}</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">X軸（横軸）</label>
            <select
              value={xAxis}
              onChange={(e) => setXAxis(e.target.value)}
              disabled={!activeData}
              className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg p-3 focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-50"
            >
              <option value="">-- X軸を選択 --</option>
              {headers.map((h, i) => <option key={i} value={h}>{h}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">Y軸（縦軸）</label>
            <select
              value={yAxis}
              onChange={(e) => setYAxis(e.target.value)}
              disabled={!activeData}
              className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg p-3 focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-50"
            >
              <option value="">-- Y軸を選択 --</option>
              {headers.map((h, i) => <option key={i} value={h}>{h}</option>)}
            </select>
          </div>
        </div>
      </div>

      {xAxis && yAxis ? (
        <div className="space-y-6">
          {/* View toggle */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-400">
              有効データ数: <span className="text-white font-bold">{plotData.length.toLocaleString()} 件</span>
              <span className="text-slate-600 ml-2">(全 {activeData?.data?.length?.toLocaleString()} 行中、数値データのみ)</span>
            </p>
            <div className="flex bg-slate-800 p-1 rounded-xl border border-slate-700">
              <button
                onClick={() => setViewMode('chart')}
                className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${viewMode === 'chart' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                グラフ
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${viewMode === 'table' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                テーブル
              </button>
            </div>
          </div>

          {/* Chart view */}
          {viewMode === 'chart' && (
            <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 shadow-lg" style={{ height: 520 }}>
              <h3 className="font-bold text-white mb-4 text-center">
                {yAxis} <span className="text-slate-500 font-normal mx-2">vs</span> {xAxis}
              </h3>
              <ResponsiveContainer width="100%" height="90%">
                <ScatterChart margin={{ top: 10, right: 20, bottom: 30, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis
                    type="number"
                    dataKey="x"
                    name={xAxis}
                    stroke="#94a3b8"
                    allowDecimals={!isGradeX}
                    ticks={xTicks}
                    domain={isGradeX && xTicks ? [Math.min(...xTicks) - 0.5, Math.max(...xTicks) + 0.5] : ['auto', 'auto']}
                    label={{ value: xAxis, position: 'insideBottom', offset: -10, fill: '#64748b' }}
                    tickFormatter={(v) => fmtVal(v, xAxis)}
                  />
                  <YAxis
                    type="number"
                    dataKey="y"
                    name={yAxis}
                    stroke="#94a3b8"
                    allowDecimals={!isGradeY}
                    ticks={yTicks}
                    domain={isGradeY && yTicks ? [Math.min(...yTicks) - 0.5, Math.max(...yTicks) + 0.5] : ['auto', 'auto']}
                    label={{ value: yAxis, angle: -90, position: 'insideLeft', fill: '#64748b' }}
                    tickFormatter={(v) => fmtVal(v, yAxis)}
                  />
                  <Tooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const d = payload[0].payload;
                        return (
                          <div className="bg-slate-900 border border-slate-700 p-3 rounded-lg shadow-xl text-sm">
                            {d.playerLabel && <p className="font-bold text-white mb-1 border-b border-slate-700 pb-1">{d.playerLabel}</p>}
                            <p className="text-blue-400">{xAxis}: <span className="text-white font-mono">{fmtVal(d.x, xAxis)}</span></p>
                            <p className="text-purple-400">{yAxis}: <span className="text-white font-mono">{fmtVal(d.y, yAxis)}</span></p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Scatter name="Data" data={plotData.slice(0, 3000)} fill={SCATTER_COLOR} fillOpacity={0.7} />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Table view */}
          {viewMode === 'table' && (
            <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden shadow-lg">
              <div className="p-4 bg-slate-900 border-b border-slate-700 flex items-center gap-2">
                <Table className="w-4 h-4 text-blue-400" />
                <h3 className="font-bold text-white">データテーブル（上位200件 / {xAxis} 降順）</h3>
              </div>
              <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                <table className="w-full text-sm text-left text-slate-300">
                  <thead className="text-xs text-slate-400 uppercase bg-slate-900/70 sticky top-0">
                    <tr>
                      <th className="px-4 py-3">#</th>
                      {tableData[0]?.playerLabel !== '' && <th className="px-4 py-3">選手</th>}
                      <th className="px-4 py-3 text-blue-400">{xAxis}</th>
                      <th className="px-4 py-3 text-purple-400">{yAxis}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableData.map((row, i) => (
                      <tr key={i} className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors">
                        <td className="px-4 py-2 text-slate-500">{i + 1}</td>
                        {row.playerLabel !== '' && <td className="px-4 py-2 font-medium text-white">{row.playerLabel}</td>}
                        <td className="px-4 py-2 font-mono text-blue-300">{fmtVal(row.x, xAxis)}</td>
                        <td className="px-4 py-2 font-mono text-purple-300">{fmtVal(row.y, yAxis)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-24 text-slate-500 border-2 border-dashed border-slate-700 rounded-2xl bg-slate-800/30">
          <LineChart className="w-16 h-16 mb-4 opacity-30" />
          <p className="text-lg">X軸とY軸を選択すると、グラフ・テーブルが表示されます</p>
          {!activeData && <p className="text-sm mt-2 text-red-400/60">※先にデータを読み込んでください</p>}
        </div>
      )}
    </div>
  );
}

export default CustomCharts;
