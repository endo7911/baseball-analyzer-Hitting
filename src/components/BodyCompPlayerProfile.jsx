import React, { useState, useMemo, useEffect } from 'react';
import {
  LineChart, Line, ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import {
  Dumbbell, Calendar, Zap, TrendingUp, TrendingDown, Minus, LineChart as ChartIcon,
  Activity, Target, Flame, Scale, Sparkles, Award, ArrowRight
} from 'lucide-react';
import {
  fmt, calcFFMI, buildSwingSpeedMap, lookupSwingSpeed, extractBodyValues,
  buildPhysicalPerformanceMilestones, getSynergyAssessment
} from '../utils/bodyComp';

function BodyCompPlayerProfile({
  playerName,
  teamName,
  bodyCompData,
  blastData,
  combinedData,
  savantData,
  savantPitchingData
}) {
  const [selectedMetric, setSelectedMetric] = useState('muscle'); // 'muscle' | 'fatPct' | 'ffmi' | 'weight'

  // States for Physical x Performance Correlation Section
  const [selectedPhysical, setSelectedPhysical] = useState('weight'); // 'weight' | 'muscle' | 'ffmi'
  const [selectedSpeed, setSelectedSpeed] = useState('ev'); // 'ev' | 'bs' | 'velo'
  const [showMaxSpeed, setShowMaxSpeed] = useState(true);

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
  const history = useMemo(() => {
    return playerRows
      .map(r => {
        const date = r.date || r.game_date || r['日付'] || r['測定日'] || '-';
        const vals = extractBodyValues(r);
        const height = vals.height ?? (parseFloat(r['身長'] || r['height'] || 0) || null);
        const weight = vals.weight ?? (parseFloat(r['体重'] || r['weight'] || 0) || null);
        const muscle = vals.muscle ?? (parseFloat(r['筋肉量'] || r['全身筋肉量'] || r['muscle_mass'] || 0) || null);
        const fatPct = vals.fatPct ?? (parseFloat(r['体脂肪率'] || r['bodyfat'] || r['body_fat_pct'] || 0) || null);
        const bmr = vals.bmr ?? (parseFloat(r['基礎代謝量'] || r['bmr'] || 0) || null);
        const bmi = vals.bmi ?? (parseFloat(r['BMI'] || r['bmi'] || 0) || (height && weight ? weight / Math.pow(height / 100, 2) : null));
        const trunk = vals.trunk ?? (parseFloat(r['体幹'] || r['体幹筋肉量'] || r['trunk_muscle'] || 0) || null);
        const leftArm = vals.leftArm ?? (parseFloat(r['左腕'] || r['左腕筋肉量'] || r['left_arm_muscle'] || 0) || null);
        const rightArm = vals.rightArm ?? (parseFloat(r['右腕'] || r['右腕筋肉量'] || r['right_arm_muscle'] || 0) || null);
        const leftLeg = vals.leftLeg ?? (parseFloat(r['左足'] || r['左脚'] || r['left_leg_muscle'] || 0) || null);
        const rightLeg = vals.rightLeg ?? (parseFloat(r['右足'] || r['右脚'] || r['right_leg_muscle'] || 0) || null);
        const ffmi = vals.ffmi ?? calcFFMI(height, weight, fatPct);

        return { date, height, weight, muscle, fatPct, bmr, bmi, trunk, leftArm, rightArm, leftLeg, rightLeg, ffmi };
      })
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  }, [playerRows]);

  // Build physical x performance milestones
  const { milestones, hasPerformanceData, hasBatting, hasPitching } = useMemo(() => {
    return buildPhysicalPerformanceMilestones({
      playerName,
      history,
      savantData,
      blastData,
      combinedData,
      savantPitchingData
    });
  }, [playerName, history, savantData, blastData, combinedData, savantPitchingData]);

  // Auto-switch speed metric based on available data
  useEffect(() => {
    if (!hasBatting && hasPitching) {
      setSelectedSpeed('velo');
    } else if (hasBatting && selectedSpeed === 'velo' && !hasPitching) {
      setSelectedSpeed('ev');
    }
  }, [hasBatting, hasPitching, selectedSpeed]);

  const physicalOptions = {
    weight: { label: '体重', unit: 'kg', color: '#38bdf8', digits: 1 },
    muscle: { label: '筋肉量', unit: 'kg', color: '#06b6d4', digits: 1 },
    ffmi:   { label: 'FFMI', unit: '', color: '#a855f7', digits: 2 }
  };

  const speedOptions = {
    ev:   { label: '打球速度', avgKey: 'avgEv', maxKey: 'maxEv', unit: 'km/h', digits: 1, icon: Activity, color: '#10b981', maxColor: '#f59e0b' },
    bs:   { label: 'スイング速度', avgKey: 'avgBs', maxKey: 'maxBs', unit: 'km/h', digits: 1, icon: Zap, color: '#06b6d4', maxColor: '#f59e0b' },
    velo: { label: '投球球速', avgKey: 'avgVelo', maxKey: 'maxVelo', unit: 'km/h', digits: 1, icon: Target, color: '#3b82f6', maxColor: '#f59e0b' }
  };

  const activePhysCfg = physicalOptions[selectedPhysical] || physicalOptions.weight;
  const activeSpeedCfg = speedOptions[selectedSpeed] || speedOptions.ev;

  // Filter milestones with valid data for selected metrics
  const validMilestones = milestones.filter(m => m[selectedPhysical] != null && m[activeSpeedCfg.avgKey] != null);
  const firstM = validMilestones.length > 0 ? validMilestones[0] : null;
  const latestM = validMilestones.length > 0 ? validMilestones[validMilestones.length - 1] : null;
  const hasMultiplePoints = validMilestones.length >= 2;

  const deltaPhysical = (firstM && latestM && hasMultiplePoints)
    ? latestM[selectedPhysical] - firstM[selectedPhysical]
    : null;

  const deltaAvgSpeed = (firstM && latestM && hasMultiplePoints)
    ? latestM[activeSpeedCfg.avgKey] - firstM[activeSpeedCfg.avgKey]
    : null;

  const deltaMaxSpeed = (firstM && latestM && hasMultiplePoints && latestM[activeSpeedCfg.maxKey] != null && firstM[activeSpeedCfg.maxKey] != null)
    ? latestM[activeSpeedCfg.maxKey] - firstM[activeSpeedCfg.maxKey]
    : null;

  // Efficiency: speed delta per 1 kg physical increase
  const efficiency = (deltaPhysical != null && deltaAvgSpeed != null && deltaPhysical !== 0)
    ? deltaAvgSpeed / deltaPhysical
    : null;

  // Muscle efficiency
  const deltaMuscleForEff = (firstM && latestM && hasMultiplePoints && latestM.muscle != null && firstM.muscle != null)
    ? latestM.muscle - firstM.muscle
    : null;
  const muscleEfficiency = (deltaMuscleForEff != null && deltaAvgSpeed != null && deltaMuscleForEff !== 0)
    ? deltaAvgSpeed / deltaMuscleForEff
    : null;

  const assessment = getSynergyAssessment(
    deltaPhysical,
    deltaAvgSpeed,
    activePhysCfg.label,
    activeSpeedCfg.label
  );

  const renderDelta = (val, unit = '', digits = 1) => {
    if (val === null || val === undefined || isNaN(val)) return <span className="text-slate-500 font-mono text-xs">-</span>;
    const num = Number(val);
    if (Math.abs(num) < 0.05) return <span className="text-slate-400 font-mono text-xs">±0.0{unit}</span>;
    const isPos = num > 0;
    return (
      <span className={`inline-flex items-center font-mono font-bold text-xs px-1.5 py-0.5 rounded ${
        isPos ? 'text-emerald-400 bg-emerald-500/10' : 'text-rose-400 bg-rose-500/10'
      }`}>
        {isPos ? `+${num.toFixed(digits)}` : num.toFixed(digits)}{unit}
      </span>
    );
  };

  const chartData = useMemo(() => {
    return milestones.map(m => ({
      date: m.date,
      perfDate: m.perfDate,
      weight: m.weight,
      muscle: m.muscle,
      ffmi: m.ffmi,
      physicalVal: m[selectedPhysical],
      avgSpeed: m[activeSpeedCfg.avgKey],
      maxSpeed: m[activeSpeedCfg.maxKey],
      hasPerformance: m.hasPerformance
    }));
  }, [milestones, selectedPhysical, activeSpeedCfg]);

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

      {/* フィジカル × パフォーマンス連動成長分析 Section */}
      <div className="bg-slate-800/70 border-2 border-emerald-500/30 p-4 sm:p-6 rounded-2xl sm:rounded-3xl shadow-2xl space-y-5">
        {/* Header with Title & Metric Controls */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-slate-700/80 pb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold flex items-center gap-1 whitespace-nowrap">
                <Flame className="w-3.5 h-3.5 text-emerald-400" /> 連動シナジー分析
              </span>
              <span className="text-xs text-slate-400 font-mono whitespace-nowrap">
                {hasMultiplePoints ? `測定比較: ${firstM?.date} → ${latestM?.date}` : `測定日: ${latestM?.date || '-'}`}
              </span>
            </div>
            <h3 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2.5">
              <Scale className="w-6 h-6 text-emerald-400 shrink-0" /> フィジカル × パフォーマンス連動成長
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              筋肉・体重が何kg増えたら、球速・打球速度が何km/h伸びたか（増量還元効率）を可視化します
            </p>
          </div>

          {/* Metric Selector Controls */}
          {hasPerformanceData && (
            <div className="flex flex-wrap items-center gap-2 self-start xl:self-auto">
              {/* Speed Metric Toggle */}
              <div className="bg-slate-900/90 border border-slate-700 p-1 rounded-xl flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setSelectedSpeed('ev')}
                  disabled={!hasBatting}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                    selectedSpeed === 'ev'
                      ? 'bg-emerald-600 text-white shadow-md'
                      : !hasBatting
                        ? 'opacity-30 cursor-not-allowed text-slate-500'
                        : 'text-slate-400 hover:text-white'
                  }`}
                  title={!hasBatting ? 'この選手の打球速度データはありません' : '打球速度の連動推移を表示'}
                >
                  <Activity className="w-3.5 h-3.5" /> 打球速度
                  {!hasBatting && <span className="text-[10px] opacity-70 font-normal">（無）</span>}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedSpeed('bs')}
                  disabled={!hasBatting}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                    selectedSpeed === 'bs'
                      ? 'bg-cyan-600 text-white shadow-md'
                      : !hasBatting
                        ? 'opacity-30 cursor-not-allowed text-slate-500'
                        : 'text-slate-400 hover:text-white'
                  }`}
                  title={!hasBatting ? 'この選手のスイング速度データはありません' : 'スイング速度の連動推移を表示'}
                >
                  <Zap className="w-3.5 h-3.5" /> スイング速
                  {!hasBatting && <span className="text-[10px] opacity-70 font-normal">（無）</span>}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedSpeed('velo')}
                  disabled={!hasPitching}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                    selectedSpeed === 'velo'
                      ? 'bg-blue-600 text-white shadow-md'
                      : !hasPitching
                        ? 'opacity-30 cursor-not-allowed text-slate-500'
                        : 'text-slate-400 hover:text-white'
                  }`}
                  title={!hasPitching ? 'この選手の投球データはありません' : '投球球速の連動推移を表示'}
                >
                  <Target className="w-3.5 h-3.5" /> 投球球速
                  {!hasPitching && <span className="text-[10px] opacity-70 font-normal">（無）</span>}
                </button>
              </div>

              {/* Physical Metric Toggle */}
              <div className="bg-slate-900/90 border border-slate-700 p-1 rounded-xl flex items-center gap-1">
                {Object.entries(physicalOptions).map(([key, cfg]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedPhysical(key)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                      selectedPhysical === key
                        ? 'bg-slate-700 text-white shadow'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {cfg.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {hasPerformanceData ? (
          <>
            {/* Top 4 KPI Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-stretch">
              {/* Card 1: Physical Delta */}
              <div className="bg-slate-900/80 border border-slate-700/80 p-4 rounded-2xl flex flex-col justify-between h-full min-h-[165px]">
                <div className="flex items-center justify-between text-xs text-slate-400 font-bold">
                  <span>{activePhysCfg.label}の変化</span>
                  <span className="text-[10px] text-slate-500 font-medium whitespace-nowrap">初回 → 最新</span>
                </div>

                <div className="my-auto py-2.5 flex items-baseline gap-1.5 sm:gap-2 font-mono flex-wrap">
                  <span className="text-base sm:text-lg font-bold text-slate-400 shrink-0">
                    {fmt(firstM?.[selectedPhysical], activePhysCfg.digits)}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-500 shrink-0 self-center" />
                  <span className="text-2xl sm:text-3xl font-black text-white tracking-tight shrink-0">
                    {fmt(latestM?.[selectedPhysical], activePhysCfg.digits)}
                  </span>
                  <span className="text-xs sm:text-sm font-bold text-slate-400 font-sans whitespace-nowrap shrink-0">{activePhysCfg.unit}</span>
                </div>

                <div className="pt-2.5 border-t border-slate-800 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400 font-semibold whitespace-nowrap">変化量</span>
                  {hasMultiplePoints ? (
                    renderDelta(deltaPhysical, activePhysCfg.unit, activePhysCfg.digits)
                  ) : (
                    <span className="text-slate-500 text-xs font-mono whitespace-nowrap">基準測定</span>
                  )}
                </div>
              </div>

              {/* Card 2: Speed Delta */}
              <div className="bg-slate-900/80 border border-slate-700/80 p-4 rounded-2xl flex flex-col justify-between h-full min-h-[165px]">
                <div className="flex items-center justify-between text-xs text-slate-400 font-bold">
                  <span>平均{activeSpeedCfg.label}の変化</span>
                  <span className="text-[10px] text-slate-500 font-medium whitespace-nowrap">初回 → 最新</span>
                </div>

                <div className="my-auto py-2.5 flex items-baseline gap-1.5 sm:gap-2 font-mono flex-wrap">
                  <span className="text-base sm:text-lg font-bold text-slate-400 shrink-0">
                    {fmt(firstM?.[activeSpeedCfg.avgKey], 1)}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-500 shrink-0 self-center" />
                  <span className="text-2xl sm:text-3xl font-black tracking-tight shrink-0" style={{ color: activeSpeedCfg.color }}>
                    {fmt(latestM?.[activeSpeedCfg.avgKey], 1)}
                  </span>
                  <span className="text-xs sm:text-sm font-bold text-slate-400 font-sans whitespace-nowrap shrink-0">{activeSpeedCfg.unit}</span>
                </div>

                <div className="pt-2.5 border-t border-slate-800 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400 font-semibold whitespace-nowrap">最高速</span>
                  <span className="text-xs font-mono font-bold text-amber-300 whitespace-nowrap">
                    Max {fmt(latestM?.[activeSpeedCfg.maxKey], 1)} {activeSpeedCfg.unit}
                    {hasMultiplePoints && deltaMaxSpeed != null && (
                      <span className="ml-1 text-[11px]">
                        ({deltaMaxSpeed > 0 ? `+${deltaMaxSpeed.toFixed(1)}` : deltaMaxSpeed.toFixed(1)})
                      </span>
                    )}
                  </span>
                </div>
              </div>

              {/* Card 3: Growth Efficiency (km/h per kg) */}
              <div className="bg-slate-900/80 border border-emerald-500/40 p-4 rounded-2xl flex flex-col justify-between h-full min-h-[165px]">
                <div>
                  <div className="flex items-center justify-between text-xs text-emerald-300 font-bold">
                    <span>増量還元効率</span>
                    <Flame className="w-4 h-4 text-emerald-400" />
                  </div>
                  <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">体重1kg増あたりの速度変化</p>
                </div>

                <div className="my-auto py-2.5 flex items-baseline gap-2 font-mono flex-wrap sm:flex-nowrap">
                  {efficiency != null ? (
                    <>
                      <span className={`text-2xl sm:text-3xl font-black tracking-tight shrink-0 ${
                        efficiency > 0 ? 'text-emerald-400' : efficiency < 0 ? 'text-rose-400' : 'text-slate-300'
                      }`}>
                        {efficiency > 0 ? `+${efficiency.toFixed(2)}` : efficiency.toFixed(2)}
                      </span>
                      <span className="text-xs font-bold text-slate-400 font-sans whitespace-nowrap shrink-0">
                        km/h / kg
                      </span>
                    </>
                  ) : (
                    <div className="text-slate-400 text-xs font-semibold py-1">
                      {hasMultiplePoints ? '体重変化なし' : '初回データ記録中'}
                    </div>
                  )}
                </div>

                <div className="pt-2.5 border-t border-slate-800 flex items-center justify-between text-[11px]">
                  <span className="text-slate-400 whitespace-nowrap">筋肉1kgあたり</span>
                  <span className="font-mono font-bold text-cyan-300 whitespace-nowrap">
                    {muscleEfficiency != null
                      ? `${muscleEfficiency > 0 ? `+${muscleEfficiency.toFixed(2)}` : muscleEfficiency.toFixed(2)} km/h`
                      : '-'}
                  </span>
                </div>
              </div>

              {/* Card 4: Synergy Assessment */}
              <div className={`p-4 rounded-2xl border flex flex-col justify-between h-full min-h-[165px] ${assessment.color}`}>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${assessment.badgeColor} whitespace-nowrap`}>
                      {assessment.badge}
                    </span>
                  </div>
                  <h4 className="text-xs sm:text-sm font-extrabold text-white mb-1 leading-tight">{assessment.title}</h4>
                </div>

                <div className="my-auto py-1">
                  <p className="text-[11px] leading-relaxed text-slate-200 font-medium line-clamp-4">
                    {assessment.desc}
                  </p>
                </div>

                <div className="pt-2 border-t border-white/10 flex items-center justify-end text-[10px] text-slate-400 font-bold whitespace-nowrap">
                  <span>自動シナジー診断</span>
                </div>
              </div>
            </div>

            {/* Composed Chart Area */}
            <div className="bg-slate-900/80 border border-slate-700/80 p-4 sm:p-5 rounded-2xl space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <ChartIcon className="w-4 h-4 text-emerald-400 shrink-0" />
                  <h4 className="text-sm font-bold text-white whitespace-nowrap">
                    {activePhysCfg.label} (棒) × {activeSpeedCfg.label} (折れ線) 複合推移
                  </h4>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <label className="flex items-center gap-1.5 text-slate-400 cursor-pointer select-none whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={showMaxSpeed}
                      onChange={e => setShowMaxSpeed(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-800 text-amber-500 focus:ring-0"
                    />
                    <span>最高速度を表示 (点線)</span>
                  </label>
                  <div className="flex items-center gap-2 text-[11px] whitespace-nowrap">
                    <span className="flex items-center gap-1 text-cyan-400">
                      <span className="w-2.5 h-2.5 rounded-sm bg-cyan-500 inline-block"></span> 左軸: {activePhysCfg.label}
                    </span>
                    <span className="flex items-center gap-1 font-semibold" style={{ color: activeSpeedCfg.color }}>
                      <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: activeSpeedCfg.color }}></span> 右軸: 平均{activeSpeedCfg.label}
                    </span>
                  </div>
                </div>
              </div>

              <div style={{ height: 320 }} className="w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 15, right: 38, bottom: 25, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.6} />
                    <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} dy={10} />
                    <YAxis
                      yAxisId="physical"
                      orientation="left"
                      stroke="#06b6d4"
                      fontSize={11}
                      domain={['auto', 'auto']}
                      width={55}
                      unit={` ${activePhysCfg.unit}`}
                    />
                    <YAxis
                      yAxisId="speed"
                      orientation="right"
                      stroke="#10b981"
                      fontSize={11}
                      domain={['auto', 'auto']}
                      width={65}
                      unit=" km/h"
                    />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload;
                        return (
                          <div className="bg-slate-900 border border-slate-700 p-3 rounded-xl shadow-2xl text-xs space-y-1.5 min-w-[200px]">
                            <p className="font-bold text-white border-b border-slate-700 pb-1">📅 {label}</p>
                            {d.perfDate && d.perfDate !== label && (
                              <p className="text-[10px] text-slate-400">※ 打撃/投球測定日: {d.perfDate}</p>
                            )}
                            <div className="space-y-1 pt-0.5">
                              <p className="text-cyan-400 font-bold flex justify-between">
                                <span>{activePhysCfg.label}:</span>
                                <span className="font-mono text-white text-sm">
                                  {fmt(d.physicalVal, activePhysCfg.digits)} {activePhysCfg.unit}
                                </span>
                              </p>
                              <p className="text-emerald-400 font-bold flex justify-between">
                                <span>平均{activeSpeedCfg.label}:</span>
                                <span className="font-mono text-white text-sm">
                                  {fmt(d.avgSpeed, 1)} km/h
                                </span>
                              </p>
                              {d.maxSpeed != null && (
                                <p className="text-amber-400 font-bold flex justify-between">
                                  <span>最高{activeSpeedCfg.label}:</span>
                                  <span className="font-mono text-white text-sm">
                                    {fmt(d.maxSpeed, 1)} km/h
                                  </span>
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Bar
                      yAxisId="physical"
                      dataKey="physicalVal"
                      name={activePhysCfg.label}
                      fill="#06b6d4"
                      radius={[6, 6, 0, 0]}
                      barSize={28}
                      opacity={0.8}
                    />
                    <Line
                      yAxisId="speed"
                      type="monotone"
                      dataKey="avgSpeed"
                      name={`平均${activeSpeedCfg.label}`}
                      stroke={activeSpeedCfg.color}
                      strokeWidth={3}
                      dot={{ r: 5, fill: activeSpeedCfg.color, stroke: '#fff', strokeWidth: 1.5 }}
                      activeDot={{ r: 7 }}
                      connectNulls={true}
                    />
                    {showMaxSpeed && (
                      <Line
                        yAxisId="speed"
                        type="monotone"
                        dataKey="maxSpeed"
                        name={`最高${activeSpeedCfg.label}`}
                        stroke="#f59e0b"
                        strokeWidth={2}
                        strokeDasharray="4 4"
                        dot={{ r: 4, fill: '#f59e0b' }}
                        connectNulls={true}
                      />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Milestones Data Table */}
            <div className="bg-slate-900/60 border border-slate-700/80 rounded-2xl overflow-hidden">
              <div className="p-3.5 sm:p-4 border-b border-slate-700 flex items-center justify-between">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Award className="w-4 h-4 text-emerald-400" /> 測定回ごとの連動詳細推移
                </h4>
                <span className="text-[11px] text-slate-400 font-mono">全 {milestones.length} 回</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-slate-300">
                  <thead className="bg-slate-900 text-slate-400 border-b border-slate-700 select-none">
                    <tr>
                      <th className="px-3 py-2 text-left whitespace-nowrap">測定回 / 日付</th>
                      <th className="px-3 py-2 text-right whitespace-nowrap">体重 (kg)</th>
                      <th className="px-3 py-2 text-right text-cyan-400 whitespace-nowrap">筋肉量 (kg)</th>
                      <th className="px-3 py-2 text-right text-emerald-400 whitespace-nowrap">打球速度 (km/h)</th>
                      <th className="px-3 py-2 text-right text-cyan-400 whitespace-nowrap">スイング速 (km/h)</th>
                      <th className="px-3 py-2 text-right text-blue-400 whitespace-nowrap">投球球速 (km/h)</th>
                      <th className="px-3 py-2 text-right text-amber-300 whitespace-nowrap">増量還元 (前比)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 font-mono">
                    {milestones.map((m, idx) => {
                      const prev = idx > 0 ? milestones[idx - 1] : null;
                      const dWeight = prev && prev.weight != null && m.weight != null ? m.weight - prev.weight : null;
                      const dMuscle = prev && prev.muscle != null && m.muscle != null ? m.muscle - prev.muscle : null;
                      const dEv = prev && prev.avgEv != null && m.avgEv != null ? m.avgEv - prev.avgEv : null;
                      const dBs = prev && prev.avgBs != null && m.avgBs != null ? m.avgBs - prev.avgBs : null;
                      const dVelo = prev && prev.avgVelo != null && m.avgVelo != null ? m.avgVelo - prev.avgVelo : null;

                      // Step efficiency for active speed
                      const dActiveSpeed = prev && prev[activeSpeedCfg.avgKey] != null && m[activeSpeedCfg.avgKey] != null
                        ? m[activeSpeedCfg.avgKey] - prev[activeSpeedCfg.avgKey]
                        : null;
                      const stepEff = (dWeight != null && dActiveSpeed != null && dWeight !== 0)
                        ? dActiveSpeed / dWeight
                        : null;

                      return (
                        <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                          <td className="px-3 py-2.5 text-left font-sans text-white font-bold whitespace-nowrap">
                            <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded mr-1.5 font-mono">
                              #{idx + 1}
                            </span>
                            {m.date}
                            {m.perfDate && m.perfDate !== m.date && (
                              <span className="text-[10px] text-slate-400 font-normal ml-1">
                                (測定:{m.perfDate})
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right whitespace-nowrap">
                            <span className="text-white font-bold">{fmt(m.weight, 1)}</span>
                            {prev && <span className="ml-1.5">{renderDelta(dWeight, '', 1)}</span>}
                          </td>
                          <td className="px-3 py-2.5 text-right whitespace-nowrap">
                            <span className="text-cyan-300 font-bold">{fmt(m.muscle, 1)}</span>
                            {prev && <span className="ml-1.5">{renderDelta(dMuscle, '', 1)}</span>}
                          </td>
                          <td className="px-3 py-2.5 text-right whitespace-nowrap">
                            {m.avgEv != null ? (
                              <>
                                <span className="text-emerald-300 font-bold">{fmt(m.avgEv, 1)}</span>
                                <span className="text-[10px] text-slate-400 ml-1">(Max {fmt(m.maxEv, 1)})</span>
                                {prev && <span className="ml-1.5">{renderDelta(dEv, '', 1)}</span>}
                              </>
                            ) : (
                              <span className="text-slate-500">-</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right whitespace-nowrap">
                            {m.avgBs != null ? (
                              <>
                                <span className="text-cyan-300 font-bold">{fmt(m.avgBs, 1)}</span>
                                <span className="text-[10px] text-slate-400 ml-1">(Max {fmt(m.maxBs, 1)})</span>
                                {prev && <span className="ml-1.5">{renderDelta(dBs, '', 1)}</span>}
                              </>
                            ) : (
                              <span className="text-slate-500">-</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right whitespace-nowrap">
                            {m.avgVelo != null ? (
                              <>
                                <span className="text-blue-300 font-bold">{fmt(m.avgVelo, 1)}</span>
                                <span className="text-[10px] text-slate-400 ml-1">(Max {fmt(m.maxVelo, 1)})</span>
                                {prev && <span className="ml-1.5">{renderDelta(dVelo, '', 1)}</span>}
                              </>
                            ) : (
                              <span className="text-slate-500">-</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right whitespace-nowrap">
                            {idx === 0 ? (
                              <span className="text-slate-500 text-[10px] font-sans">初回基準</span>
                            ) : stepEff != null ? (
                              <span className={`font-bold ${stepEff > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {stepEff > 0 ? `+${stepEff.toFixed(2)}` : stepEff.toFixed(2)} km/h/kg
                              </span>
                            ) : (
                              <span className="text-slate-500">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          <div className="bg-slate-900/60 border border-slate-700/80 rounded-2xl p-6 sm:p-8 text-center space-y-3">
            <Sparkles className="w-10 h-10 mx-auto text-emerald-400 opacity-60" />
            <h4 className="text-base font-bold text-white">打撃・投球データと連動させて成長効率を測定</h4>
            <p className="text-xs text-slate-400 max-w-lg mx-auto leading-relaxed">
              打撃データ（Rapsodo / Blast / 統合データCSV）または投球データ（Rapsodo）を読み込むと、
              体重・筋肉量の増減に伴う「球速・打球速度が何km/h伸びたか」の還元効率や総合判定がここに自動表示されます。
            </p>
            <div className="pt-2 flex flex-wrap justify-center gap-2 text-xs">
              <span className="bg-slate-800 px-3 py-1 rounded-full text-slate-400 border border-slate-700">
                体重: <strong className="text-white font-mono">{fmt(latest.weight, 1)} kg</strong>
              </span>
              <span className="bg-slate-800 px-3 py-1 rounded-full text-slate-400 border border-slate-700">
                筋肉量: <strong className="text-cyan-400 font-mono">{fmt(latest.muscle, 1)} kg</strong>
              </span>
              <span className="bg-slate-800 px-3 py-1 rounded-full text-slate-400 border border-slate-700">
                体脂肪率: <strong className="text-amber-400 font-mono">{fmt(latest.fatPct, 1)} %</strong>
              </span>
            </div>
          </div>
        )}
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
                <th className="px-3 py-2 text-left whitespace-nowrap">測定日</th>
                <th className="px-3 py-2 text-right whitespace-nowrap">身長 (cm)</th>
                <th className="px-3 py-2 text-right whitespace-nowrap">体重 (kg)</th>
                <th className="px-3 py-2 text-right text-cyan-400 whitespace-nowrap">筋肉量 (kg)</th>
                <th className="px-3 py-2 text-right text-amber-400 whitespace-nowrap">体脂肪率 (%)</th>
                <th className="px-3 py-2 text-right text-purple-400 whitespace-nowrap">FFMI</th>
                <th className="px-3 py-2 text-right whitespace-nowrap">BMI</th>
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
