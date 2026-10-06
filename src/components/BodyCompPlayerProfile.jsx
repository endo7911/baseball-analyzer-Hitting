import React, { useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { Dumbbell, Calendar, Zap, TrendingUp, LineChart as ChartIcon } from 'lucide-react';
import { fmt, calcFFMI, buildSwingSpeedMap, lookupSwingSpeed } from '../utils/bodyComp';

function BodyCompPlayerProfile({ playerName, teamName, bodyCompData, blastData, combinedData }) {
  const [selectedMetric, setSelectedMetric] = useState('muscle'); // 'muscle' | 'fatPct' | 'ffmi' | 'weight'

  const metricConfigs = {
    muscle:  { label: '筋肉量', unit: 'kg', color: '#06b6d4', digits: 1 },
    fatPct:  { label: '体脂肪率', unit: '%', color: '#f59e0b', digits: 1 },
    ffmi:    { label: 'FFMI', unit: '', color: '#a855f7', digits: 1 },
    weight:  { label: '体重', unit: 'kg', color: '#3b82f6', digits: 1 },
  };

  const rows = bodyCompData?.data || [];
  
  // Filter rows for this player
  const playerRows = rows.filter(r => {
    const name = String(r['選手名'] || r['名前'] || r['Player Name'] || r['player_name'] || '').trim();
    return name.replace(/[\s\u3000]/g, '') === String(playerName || '').trim().replace(/[\s\u3000]/g, '');
  });

  const swingMap = buildSwingSpeedMap(blastData, combinedData);
  const avgSwingSpeed = lookupSwingSpeed(swingMap, playerName);

  // Extract history records
  const history = playerRows
    .map(r => {
      const date = r.date || r.game_date || r['日付'] || r['測定日'] || '-';
      const height = parseFloat(r['身長'] || r['height'] || 0) || null;
      const weight = parseFloat(r['体重'] || r['weight'] || 0) || null;
      const muscle = parseFloat(r['筋肉量'] || r['全身筋肉量'] || 0) || null;
      const fatPct = parseFloat(r['体脂肪率'] || r['bodyfat'] || 0) || null;
      const bmr = parseFloat(r['基礎代謝量'] || r['bmr'] || 0) || null;
      const bmi = parseFloat(r['BMI'] || r['bmi'] || 0) || (height && weight ? weight / Math.pow(height / 100, 2) : null);
      const trunk = parseFloat(r['体幹'] || r['体幹筋肉量'] || 0) || null;
      const leftArm = parseFloat(r['左腕'] || r['左腕筋肉量'] || 0) || null;
      const rightArm = parseFloat(r['右腕'] || r['右腕筋肉量'] || 0) || null;
      const leftLeg = parseFloat(r['左足'] || r['左脚'] || 0) || null;
      const rightLeg = parseFloat(r['右足'] || r['右脚'] || 0) || null;
      const ffmi = calcFFMI(height, weight, fatPct);

      return { date, height, weight, muscle, fatPct, bmr, bmi, trunk, leftArm, rightArm, leftLeg, rightLeg, ffmi };
    })
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  const latest = history.length > 0 ? history[history.length - 1] : null;

  if (!latest) {
    return (
      <div className="bg-slate-800/40 p-8 rounded-2xl border border-slate-700 text-center text-slate-400">
        <Dumbbell className="w-12 h-12 mx-auto mb-3 opacity-30 text-cyan-400" />
        <p className="font-bold text-lg text-white mb-1">{playerName} 選手の体組成データが見つかりません</p>
        <p className="text-xs">データ読み込み画面から体組成CSVを追加してください。</p>
      </div>
    );
  }

  const activeCfg = metricConfigs[selectedMetric] || metricConfigs.muscle;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Player Header Banner */}
      <div className="bg-gradient-to-r from-cyan-950/60 to-slate-900 border-2 border-cyan-500/30 p-4 sm:p-6 rounded-2xl sm:rounded-3xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-1">
            <span className="bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 px-3 py-1 rounded-full text-xs font-extrabold">
              {teamName || '所属チーム'}
            </span>
            <span className="text-xs text-slate-400 flex items-center gap-1 font-mono">
              <Calendar className="w-3.5 h-3.5 text-cyan-400" /> 最新測定日: {latest.date}
            </span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white flex items-center gap-2">
            {playerName} <span className="text-xs font-bold text-slate-400">体組成個人レポート</span>
          </h2>
        </div>
        {avgSwingSpeed != null && (
          <div className="bg-blue-950/50 border border-blue-500/40 px-3.5 py-2.5 sm:px-4 sm:py-3 rounded-2xl flex items-center gap-3 self-start md:self-auto">
            <Zap className="w-5 h-5 sm:w-6 sm:h-6 text-blue-400" />
            <div>
              <p className="text-[10px] text-blue-300 font-bold uppercase">打撃連携 スイングスピード</p>
              <p className="text-lg sm:text-xl font-black text-white font-mono">{fmt(avgSwingSpeed, 1)} <span className="text-xs font-normal text-slate-400">km/h</span></p>
            </div>
          </div>
        )}
      </div>

      {/* Main KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3">
        <div className="bg-slate-800/80 border border-slate-700/80 p-3 sm:p-4 rounded-2xl text-center">
          <p className="text-xs text-slate-400 font-bold mb-1">身長</p>
          <p className="text-xl sm:text-2xl font-black text-white font-mono">{fmt(latest.height, 1)} <span className="text-xs font-normal text-slate-400">cm</span></p>
        </div>
        <div className="bg-slate-800/80 border border-slate-700/80 p-3 sm:p-4 rounded-2xl text-center">
          <p className="text-xs text-slate-400 font-bold mb-1">体重</p>
          <p className="text-xl sm:text-2xl font-black text-blue-300 font-mono">{fmt(latest.weight, 1)} <span className="text-xs font-normal text-slate-400">kg</span></p>
        </div>
        <div className="bg-cyan-950/30 border border-cyan-500/40 p-3 sm:p-4 rounded-2xl text-center">
          <p className="text-xs text-cyan-300 font-bold mb-1">筋肉量</p>
          <p className="text-xl sm:text-2xl font-black text-cyan-400 font-mono">{fmt(latest.muscle, 1)} <span className="text-xs font-normal text-slate-400">kg</span></p>
        </div>
        <div className="bg-amber-950/30 border border-amber-500/40 p-3 sm:p-4 rounded-2xl text-center">
          <p className="text-xs text-amber-300 font-bold mb-1">体脂肪率</p>
          <p className="text-xl sm:text-2xl font-black text-amber-400 font-mono">{fmt(latest.fatPct, 1)} <span className="text-xs font-normal text-slate-400">%</span></p>
        </div>
        <div className="bg-purple-950/30 border border-purple-500/40 p-3 sm:p-4 rounded-2xl text-center">
          <p className="text-xs text-purple-300 font-bold mb-1">FFMI</p>
          <p className="text-xl sm:text-2xl font-black text-purple-400 font-mono">{fmt(latest.ffmi, 1)}</p>
        </div>
        <div className="bg-slate-800/80 border border-slate-700/80 p-3 sm:p-4 rounded-2xl text-center flex flex-col justify-center">
          <p className="text-xs text-slate-400 font-bold mb-1">BMI / 基礎代謝</p>
          <p className="text-lg sm:text-xl font-black text-white font-mono">{fmt(latest.bmi, 1)}</p>
          <p className="text-xs font-semibold text-slate-400 font-mono mt-0.5">{fmt(latest.bmr, 0)} <span className="text-[10px] text-slate-500 font-normal">kcal</span></p>
        </div>
      </div>

      {/* 部位別筋肉量 Breakdown */}
      <div className="bg-slate-800/60 border border-cyan-500/30 p-4 sm:p-6 rounded-2xl sm:rounded-3xl shadow-xl">
        <h3 className="text-base sm:text-lg font-bold text-white mb-3 sm:mb-4 flex items-center gap-2">
          <Dumbbell className="w-5 h-5 text-cyan-400" /> 部位別筋肉量 (kg)
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 sm:gap-3">
          <div className="bg-slate-900/80 border border-slate-700 p-3 rounded-xl text-center">
            <p className="text-xs text-slate-400 font-bold">体幹</p>
            <p className="text-lg sm:text-xl font-mono font-black text-white mt-1">{fmt(latest.trunk, 1)}</p>
          </div>
          <div className="bg-slate-900/80 border border-slate-700 p-3 rounded-xl text-center">
            <p className="text-xs text-slate-400 font-bold">左腕</p>
            <p className="text-lg sm:text-xl font-mono font-black text-white mt-1">{fmt(latest.leftArm, 2)}</p>
          </div>
          <div className="bg-slate-900/80 border border-slate-700 p-3 rounded-xl text-center">
            <p className="text-xs text-slate-400 font-bold">右腕</p>
            <p className="text-lg sm:text-xl font-mono font-black text-white mt-1">{fmt(latest.rightArm, 2)}</p>
          </div>
          <div className="bg-slate-900/80 border border-slate-700 p-3 rounded-xl text-center">
            <p className="text-xs text-slate-400 font-bold">左足</p>
            <p className="text-lg sm:text-xl font-mono font-black text-white mt-1">{fmt(latest.leftLeg, 2)}</p>
          </div>
          <div className="bg-slate-900/80 border border-slate-700 p-3 rounded-xl text-center">
            <p className="text-xs text-slate-400 font-bold">右足</p>
            <p className="text-lg sm:text-xl font-mono font-black text-white mt-1">{fmt(latest.rightLeg, 2)}</p>
          </div>
        </div>
      </div>

      {/* 測定日付 推移グラフ (X軸: 日付) */}
      <div className="bg-slate-800/60 border border-cyan-500/30 p-4 sm:p-6 rounded-2xl sm:rounded-3xl shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-700 pb-3">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <ChartIcon className="w-5 h-5 text-cyan-400" /> 体組成の日付推移グラフ
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">X軸: 測定日 ／ Y軸: 各測定指標</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {Object.entries(metricConfigs).map(([key, cfg]) => (
              <button
                key={key}
                onClick={() => setSelectedMetric(key)}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                  selectedMetric === key
                    ? 'bg-cyan-600 text-white shadow-md'
                    : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-700'
                }`}
              >
                {cfg.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ height: 300 }} className="w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={history} margin={{ top: 15, right: 25, bottom: 25, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} dy={10} />
              <YAxis stroke="#94a3b8" fontSize={11} domain={['auto', 'auto']} width={50} />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload;
                  const cfg = metricConfigs[selectedMetric] || metricConfigs.muscle;
                  const val = d[selectedMetric];
                  return (
                    <div className="bg-slate-900 border border-slate-700 p-3 rounded-xl shadow-2xl text-xs space-y-1">
                      <p className="font-bold text-white border-b border-slate-700 pb-1">📅 {label}</p>
                      <p style={{ color: cfg.color }} className="font-bold">
                        {cfg.label}: <span className="text-white font-mono text-sm">{fmt(val, cfg.digits)} {cfg.unit}</span>
                      </p>
                    </div>
                  );
                }}
              />
              <Line
                type="monotone"
                dataKey={selectedMetric}
                name={activeCfg.label}
                stroke={activeCfg.color}
                strokeWidth={3}
                dot={{ r: 5, fill: activeCfg.color, stroke: '#fff', strokeWidth: 1.5 }}
                activeDot={{ r: 7 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 測定履歴 Table */}
      <div className="bg-slate-800/60 border border-slate-700 p-6 rounded-3xl shadow-xl overflow-hidden">
        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-cyan-400" /> 測定履歴・数値一覧 ({history.length} 回)
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-slate-300">
            <thead className="text-xs text-slate-400 bg-slate-900/80 border-b border-slate-700 select-none">
              <tr>
                <th className="px-3 py-2 text-left">測定日</th>
                <th className="px-3 py-2 text-right">身長 (cm)</th>
                <th className="px-3 py-2 text-right">体重 (kg)</th>
                <th className="px-3 py-2 text-right text-cyan-400">筋肉量 (kg)</th>
                <th className="px-3 py-2 text-right text-amber-400">体脂肪率 (%)</th>
                <th className="px-3 py-2 text-right text-purple-400">FFMI</th>
                <th className="px-3 py-2 text-right">BMI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50 font-mono">
              {history.map((h, idx) => (
                <tr key={idx} className="hover:bg-slate-700/30 transition-colors">
                  <td className="px-3 py-2 text-left font-sans text-white font-bold">{h.date}</td>
                  <td className="px-3 py-2 text-right">{fmt(h.height, 1)}</td>
                  <td className="px-3 py-2 text-right text-blue-300">{fmt(h.weight, 1)}</td>
                  <td className="px-3 py-2 text-right text-cyan-300 font-bold">{fmt(h.muscle, 1)}</td>
                  <td className="px-3 py-2 text-right text-amber-300">{fmt(h.fatPct, 1)}</td>
                  <td className="px-3 py-2 text-right text-purple-300 font-bold">{fmt(h.ffmi, 1)}</td>
                  <td className="px-3 py-2 text-right text-slate-400">{fmt(h.bmi, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default BodyCompPlayerProfile;
