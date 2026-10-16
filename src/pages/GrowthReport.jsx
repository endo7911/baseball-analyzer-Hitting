import React, { useState, useMemo, useEffect } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Calendar,
  Users,
  User,
  Award,
  ArrowRight,
  Printer,
  Activity,
  Zap,
  Scale,
  Filter,
  ChevronRight
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  Cell
} from 'recharts';
import {
  getDataValue,
  getRawDataValue,
  parseAnyDate,
  isBarrel,
  NAME_KEYS,
  PITCHER_NAME_KEYS,
  DEFAULT_DATE_KEYS,
  EV_KEYS,
  BS_KEYS,
  LA_KEYS,
  AA_KEYS,
  DIST_KEYS,
  PITCH_VELO_KEYS,
  SPIN_RATE_KEYS,
  SPIN_EFFICIENCY_KEYS,
  VB_TRAJ_KEYS,
  HB_TRAJ_KEYS
} from '../utils/dataHelpers';
import { extractBodyValues, getBodyName, getBodyTeam, getBodyDate } from '../utils/bodyComp';

const PLAYER_NAME_KEYS = NAME_KEYS;
const TEAM_KEYS = ['team_name', 'チーム名', 'チーム', 'Team', '所属', '所属チーム'];

// 各カテゴリで比較する指標定義
const CATEGORY_METRICS = {
  hitting: [
    { key: 'avgEv', label: '平均打球速度', unit: 'km/h', decimals: 1, higherIsBetter: true },
    { key: 'maxEv', label: '最大打球速度', unit: 'km/h', decimals: 1, higherIsBetter: true },
    { key: 'avgBs', label: '平均スイング速度', unit: 'km/h', decimals: 1, higherIsBetter: true },
    { key: 'maxBs', label: '最大スイング速度', unit: 'km/h', decimals: 1, higherIsBetter: true },
    { key: 'barrelPct', label: 'バレル率', unit: '%', decimals: 1, higherIsBetter: true },
    { key: 'avgDist', label: '平均飛距離', unit: 'm', decimals: 1, higherIsBetter: true },
    { key: 'avgLa', label: '平均打球角度', unit: '°', decimals: 1, higherIsBetter: null },
    { key: 'avgAa', label: '平均アタック角', unit: '°', decimals: 1, higherIsBetter: null }
  ],
  pitching: [
    { key: 'avgVelo', label: '平均球速', unit: 'km/h', decimals: 1, higherIsBetter: true },
    { key: 'maxVelo', label: '最高球速', unit: 'km/h', decimals: 1, higherIsBetter: true },
    { key: 'avgSpin', label: '平均回転数', unit: 'rpm', decimals: 0, higherIsBetter: true },
    { key: 'maxSpin', label: '最大回転数', unit: 'rpm', decimals: 0, higherIsBetter: true },
    { key: 'avgEff', label: '平均回転効率', unit: '%', decimals: 1, higherIsBetter: true },
    { key: 'avgVb', label: '平均縦変化量(VB)', unit: 'cm', decimals: 1, higherIsBetter: true },
    { key: 'avgHb', label: '平均横変化量(HB)', unit: 'cm', decimals: 1, higherIsBetter: null }
  ],
  bodyComp: [
    { key: 'weight', label: '体重', unit: 'kg', decimals: 1, higherIsBetter: true },
    { key: 'muscle', label: '筋肉量 / 骨格筋量', unit: 'kg', decimals: 1, higherIsBetter: true },
    { key: 'fatPct', label: '体脂肪率', unit: '%', decimals: 1, higherIsBetter: false },
    { key: 'ffmi', label: 'FFMI (除脂肪指数)', unit: '', decimals: 2, higherIsBetter: true },
    { key: 'bmi', label: 'BMI', unit: '', decimals: 1, higherIsBetter: null },
    { key: 'bmr', label: '基礎代謝量', unit: 'kcal', decimals: 0, higherIsBetter: true }
  ]
};

function normalizePlayerName(name) {
  if (!name) return '';
  return String(name).replace(/[\s\u3000]+/g, ' ').trim();
}

function extractRowDate(row) {
  if (!row) return '';
  const raw = getRawDataValue(row, DEFAULT_DATE_KEYS) || row.date || row.game_date || '';
  const parsed = parseAnyDate(raw);
  if (parsed) return parsed.slice(0, 10);
  if (row.file_name || row.filename) {
    const fromFile = parseAnyDate(row.file_name || row.filename);
    if (fromFile) return fromFile.slice(0, 10);
  }
  return '日付未設定';
}

function aggregateHittingRows(rows) {
  if (!rows || rows.length === 0) return null;
  const evs = [];
  const bss = [];
  const las = [];
  const aas = [];
  const dists = [];
  let barrelCount = 0;
  let battedBallCount = 0;

  rows.forEach(r => {
    const ev = getDataValue(r, EV_KEYS);
    const bs = getDataValue(r, BS_KEYS);
    const la = getDataValue(r, LA_KEYS);
    const aa = getDataValue(r, AA_KEYS);
    const dist = getDataValue(r, DIST_KEYS);

    if (ev > 0) evs.push(ev);
    if (bs > 0) bss.push(bs);
    if (la !== 0 || r.launch_angle !== undefined || r['打球角度'] !== undefined) las.push(la);
    if (aa !== 0 || r.attack_angle !== undefined || r['アタックアングル'] !== undefined) aas.push(aa);
    if (dist > 0) dists.push(dist);

    if (ev > 0) {
      battedBallCount++;
      if (isBarrel(ev, la)) barrelCount++;
    }
  });

  if (evs.length === 0 && bss.length === 0) return null;

  const avg = arr => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
  const max = arr => arr.length > 0 ? Math.max(...arr) : null;

  return {
    count: rows.length,
    avgEv: avg(evs),
    maxEv: max(evs),
    avgBs: avg(bss),
    maxBs: max(bss),
    barrelPct: battedBallCount > 0 ? (barrelCount / battedBallCount) * 100 : null,
    avgDist: avg(dists),
    avgLa: avg(las),
    avgAa: avg(aas)
  };
}

function aggregatePitchingRows(rows) {
  if (!rows || rows.length === 0) return null;
  const velos = [];
  const spins = [];
  const effs = [];
  const vbs = [];
  const hbs = [];

  rows.forEach(r => {
    const v = getDataValue(r, PITCH_VELO_KEYS);
    const s = getDataValue(r, SPIN_RATE_KEYS);
    const eff = getDataValue(r, SPIN_EFFICIENCY_KEYS);
    const vb = getDataValue(r, VB_TRAJ_KEYS);
    const hb = getDataValue(r, HB_TRAJ_KEYS);

    if (v > 0) velos.push(v);
    if (s > 0) spins.push(s);
    if (eff > 0) effs.push(eff);
    if (vb !== 0) vbs.push(vb);
    if (hb !== 0) hbs.push(hb);
  });

  if (velos.length === 0 && spins.length === 0) return null;
  const avg = arr => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
  const max = arr => arr.length > 0 ? Math.max(...arr) : null;

  return {
    count: rows.length,
    avgVelo: avg(velos),
    maxVelo: max(velos),
    avgSpin: avg(spins),
    maxSpin: max(spins),
    avgEff: avg(effs),
    avgVb: avg(vbs),
    avgHb: avg(hbs)
  };
}

function aggregateBodyCompRows(rows) {
  if (!rows || rows.length === 0) return null;
  const weights = [];
  const muscles = [];
  const fats = [];
  const ffmis = [];
  const bmis = [];
  const bmrs = [];

  rows.forEach(r => {
    const v = extractBodyValues(r);
    if (v.weight > 0) weights.push(v.weight);
    if (v.muscle > 0) muscles.push(v.muscle);
    if (v.fatPct > 0) fats.push(v.fatPct);
    if (v.ffmi > 0) ffmis.push(v.ffmi);
    if (v.bmi > 0) bmis.push(v.bmi);
    if (v.bmr > 0) bmrs.push(v.bmr);
  });

  if (weights.length === 0 && muscles.length === 0) return null;
  const avg = arr => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

  return {
    count: rows.length,
    weight: avg(weights),
    muscle: avg(muscles),
    fatPct: avg(fats),
    ffmi: avg(ffmis),
    bmi: avg(bmis),
    bmr: avg(bmrs)
  };
}

export default function GrowthReport({
  savantData,
  blastData,
  combinedData,
  savantPitchingData,
  bodyCompData,
  profile,
  onViewPlayer
}) {
  const allowHitting = profile?.allow_hitting !== false && profile?.permissions?.hitting !== false;
  const allowPitching = profile?.allow_pitching !== false && profile?.permissions?.pitching !== false;
  const allowBodyComp = profile?.allow_body_comp !== false && profile?.permissions?.bodyComp !== false;

  const defaultCategory = allowHitting ? 'hitting' : (allowPitching ? 'pitching' : 'bodyComp');
  const [category, setCategory] = useState(defaultCategory);
  const [compareMode, setCompareMode] = useState('auto'); // 'auto' (各選手の最初期 vs 最新) | 'date' (指定日付比較)
  const [selectedTeam, setSelectedTeam] = useState('ALL');
  const [beforeDate, setBeforeDate] = useState('');
  const [afterDate, setAfterDate] = useState('');
  const [selectedMetricKey, setSelectedMetricKey] = useState('avgEv');
  const [selectedPlayer, setSelectedPlayer] = useState('');
  const [onlyMultipleDates, setOnlyMultipleDates] = useState(false);

  // カテゴリ切替時にデフォルト指標を更新
  useEffect(() => {
    const metrics = CATEGORY_METRICS[category] || [];
    if (metrics.length > 0) {
      setSelectedMetricKey(metrics[0].key);
    }
    setSelectedPlayer('');
  }, [category]);

  // 現在のカテゴリの生データ配列を統合
  const activeRows = useMemo(() => {
    if (category === 'hitting') {
      const cRows = combinedData?.data || [];
      const sRows = savantData?.data || [];
      const bRows = blastData?.data || [];
      return [...cRows, ...sRows, ...bRows];
    }
    if (category === 'pitching') {
      return savantPitchingData?.data || [];
    }
    if (category === 'bodyComp') {
      return bodyCompData?.data || [];
    }
    return [];
  }, [category, combinedData, savantData, blastData, savantPitchingData, bodyCompData]);

  // チーム一覧と日付一覧を抽出
  const { teams, dates } = useMemo(() => {
    const teamSet = new Set();
    const dateSet = new Set();

    activeRows.forEach(r => {
      if (!r) return;
      const t = category === 'bodyComp'
        ? (getBodyTeam(r) || getRawDataValue(r, TEAM_KEYS))
        : getRawDataValue(r, TEAM_KEYS);
      if (t && t !== 'Unknown Team') teamSet.add(String(t).trim());

      const d = category === 'bodyComp'
        ? (parseAnyDate(getBodyDate(r))?.slice(0, 10) || extractRowDate(r))
        : extractRowDate(r);
      if (d && d !== '日付未設定') dateSet.add(d);
    });

    const sortedDates = Array.from(dateSet).sort();
    return {
      teams: Array.from(teamSet).sort(),
      dates: sortedDates
    };
  }, [activeRows, category]);

  // 日付一覧が変わったら beforeDate / afterDate の初期値を設定
  useEffect(() => {
    if (dates.length >= 2) {
      setBeforeDate(dates[0]);
      setAfterDate(dates[dates.length - 1]);
    } else if (dates.length === 1) {
      setBeforeDate(dates[0]);
      setAfterDate(dates[0]);
    } else {
      setBeforeDate('');
      setAfterDate('');
    }
  }, [dates]);

  // 選手ごと・日付ごとの集計データを構築
  const playerGrowthList = useMemo(() => {
    const byPlayer = new Map();

    activeRows.forEach(r => {
      if (!r) return;
      const team = category === 'bodyComp'
        ? (getBodyTeam(r) || getRawDataValue(r, TEAM_KEYS) || '')
        : (getRawDataValue(r, TEAM_KEYS) || '');
      if (selectedTeam !== 'ALL' && String(team).trim() !== selectedTeam) return;

      let rawName = '';
      if (category === 'pitching') {
        rawName = getRawDataValue(r, PITCHER_NAME_KEYS) || getRawDataValue(r, PLAYER_NAME_KEYS);
      } else if (category === 'bodyComp') {
        rawName = getBodyName(r) || getRawDataValue(r, PLAYER_NAME_KEYS);
      } else {
        rawName = getRawDataValue(r, PLAYER_NAME_KEYS);
      }
      const playerName = normalizePlayerName(rawName);
      if (!playerName || playerName === 'Unknown' || playerName === 'Unknown Player' || playerName === '__SYSTEM__') return;

      const d = category === 'bodyComp'
        ? (parseAnyDate(getBodyDate(r))?.slice(0, 10) || extractRowDate(r))
        : extractRowDate(r);

      if (!byPlayer.has(playerName)) {
        byPlayer.set(playerName, {
          playerName,
          team: String(team || '').trim(),
          byDate: new Map(),
          allRows: []
        });
      }
      const pEntry = byPlayer.get(playerName);
      if (!pEntry.team && team) pEntry.team = String(team).trim();
      pEntry.allRows.push(r);

      if (!pEntry.byDate.has(d)) {
        pEntry.byDate.set(d, []);
      }
      pEntry.byDate.get(d).push(r);
    });

    const aggregateFn = category === 'hitting'
      ? aggregateHittingRows
      : (category === 'pitching' ? aggregatePitchingRows : aggregateBodyCompRows);

    const results = [];

    byPlayer.forEach(pEntry => {
      const playerDates = Array.from(pEntry.byDate.keys())
        .filter(d => d !== '日付未設定')
        .sort();

      let beforeRows = [];
      let afterRows = [];
      let bDateLabel = '';
      let aDateLabel = '';
      let hasTwoPeriods = false;

      if (compareMode === 'date' && beforeDate && afterDate) {
        beforeRows = pEntry.byDate.get(beforeDate) || [];
        afterRows = pEntry.byDate.get(afterDate) || [];
        bDateLabel = beforeDate;
        aDateLabel = afterDate;
        hasTwoPeriods = beforeRows.length > 0 && afterRows.length > 0 && beforeDate !== afterDate;
      } else {
        // Auto mode: 2日以上あれば最初期日 vs 最新日。1日しかデータがない場合は前半スイング vs 後半スイングで比較参考値を算出
        if (playerDates.length >= 2) {
          bDateLabel = playerDates[0];
          aDateLabel = playerDates[playerDates.length - 1];
          beforeRows = pEntry.byDate.get(bDateLabel) || [];
          afterRows = pEntry.byDate.get(aDateLabel) || [];
          hasTwoPeriods = true;
        } else if (pEntry.allRows.length >= 4) {
          const mid = Math.floor(pEntry.allRows.length / 2);
          beforeRows = pEntry.allRows.slice(0, mid);
          afterRows = pEntry.allRows.slice(mid);
          bDateLabel = `${playerDates[0] || '同日'} (前半)`;
          aDateLabel = `${playerDates[0] || '同日'} (後半)`;
          hasTwoPeriods = false;
        } else {
          beforeRows = pEntry.allRows;
          afterRows = pEntry.allRows;
          bDateLabel = playerDates[0] || '単回計測';
          aDateLabel = playerDates[0] || '単回計測';
          hasTwoPeriods = false;
        }
      }

      const beforeStats = aggregateFn(beforeRows);
      const afterStats = aggregateFn(afterRows);

      if (!beforeStats && !afterStats) return;
      if (onlyMultipleDates && !hasTwoPeriods) return;

      const deltas = {};
      (CATEGORY_METRICS[category] || []).forEach(m => {
        const bVal = beforeStats?.[m.key];
        const aVal = afterStats?.[m.key];
        if (bVal != null && aVal != null && !Number.isNaN(bVal) && !Number.isNaN(aVal)) {
          deltas[m.key] = aVal - bVal;
        } else {
          deltas[m.key] = null;
        }
      });

      results.push({
        playerName: pEntry.playerName,
        team: pEntry.team,
        dateCount: playerDates.length,
        hasTwoPeriods,
        beforeDate: bDateLabel,
        afterDate: aDateLabel,
        beforeStats,
        afterStats,
        deltas
      });
    });

    // 選択中の指標の成長量（delta）降順でソート
    results.sort((a, b) => {
      const da = a.deltas[selectedMetricKey];
      const db = b.deltas[selectedMetricKey];
      if (da == null && db == null) return a.playerName.localeCompare(b.playerName, 'ja');
      if (da == null) return 1;
      if (db == null) return -1;
      return db - da;
    });

    return results;
  }, [activeRows, category, selectedTeam, compareMode, beforeDate, afterDate, selectedMetricKey, onlyMultipleDates]);

  // 初期選択選手を自動セット
  useEffect(() => {
    if (playerGrowthList.length > 0) {
      const exists = playerGrowthList.some(p => p.playerName === selectedPlayer);
      if (!exists) {
        setSelectedPlayer(playerGrowthList[0].playerName);
      }
    } else {
      setSelectedPlayer('');
    }
  }, [playerGrowthList, selectedPlayer]);

  const currentMetricMeta = useMemo(() => {
    const list = CATEGORY_METRICS[category] || [];
    return list.find(m => m.key === selectedMetricKey) || list[0];
  }, [category, selectedMetricKey]);

  // チーム全体の平均成長サマリー
  const teamSummary = useMemo(() => {
    const metrics = CATEGORY_METRICS[category] || [];
    return metrics.slice(0, 4).map(m => {
      const validPlayers = playerGrowthList.filter(p => p.deltas[m.key] != null);
      const avgDelta = validPlayers.length > 0
        ? validPlayers.reduce((sum, p) => sum + p.deltas[m.key], 0) / validPlayers.length
        : null;
      const improvedCount = validPlayers.filter(p =>
        m.higherIsBetter === false ? p.deltas[m.key] < -0.05 : p.deltas[m.key] > 0.05
      ).length;
      return {
        ...m,
        avgDelta,
        improvedCount,
        totalCompared: validPlayers.length
      };
    });
  }, [playerGrowthList, category]);

  // グラフ用データ（上位15名）
  const chartData = useMemo(() => {
    if (!currentMetricMeta) return [];
    const decimals = currentMetricMeta.decimals ?? 1;
    return playerGrowthList
      .filter(p => p.beforeStats?.[selectedMetricKey] != null || p.afterStats?.[selectedMetricKey] != null)
      .slice(0, 15)
      .map(p => ({
        name: p.playerName,
        Before: p.beforeStats?.[selectedMetricKey] != null ? Number(p.beforeStats[selectedMetricKey].toFixed(decimals)) : 0,
        After: p.afterStats?.[selectedMetricKey] != null ? Number(p.afterStats[selectedMetricKey].toFixed(decimals)) : 0,
        delta: p.deltas[selectedMetricKey] != null ? Number(p.deltas[selectedMetricKey].toFixed(decimals)) : 0
      }));
  }, [playerGrowthList, selectedMetricKey, currentMetricMeta]);

  const activePlayerObj = useMemo(() => {
    return playerGrowthList.find(p => p.playerName === selectedPlayer) || playerGrowthList[0] || null;
  }, [playerGrowthList, selectedPlayer]);

  const renderDeltaBadge = (delta, metric) => {
    if (delta == null || Number.isNaN(delta)) {
      return <span className="text-slate-500 text-xs font-mono">-</span>;
    }
    const decimals = metric?.decimals ?? 1;
    const formatted = `${delta > 0 ? '+' : ''}${delta.toFixed(decimals)}${metric?.unit ? ` ${metric.unit}` : ''}`;
    const isZero = Math.abs(delta) < 0.05;
    if (isZero) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-slate-800 text-slate-300 border border-slate-700">
          <Minus size={12} /> ±0.0
        </span>
      );
    }

    const isPositiveGood = metric?.higherIsBetter !== false;
    const isGood = metric?.higherIsBetter === null
      ? true
      : (isPositiveGood ? delta > 0 : delta < 0);

    return (
      <span
        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black border ${
          isGood
            ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
            : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
        }`}
      >
        {delta > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
        {formatted}
      </span>
    );
  };

  const categoryTitle = category === 'hitting' ? '打撃成長レポート' : (category === 'pitching' ? '投球成長レポート' : '体組成成長レポート');
  const todayStr = new Date().toLocaleDateString('ja-JP');

  // ページ分割用（1ページあたり25名ずつ区画分け）
  const RANKING_ROWS_PER_PAGE = 25;
  const paginatedRankingPages = useMemo(() => {
    const pages = [];
    for (let i = 0; i < playerGrowthList.length; i += RANKING_ROWS_PER_PAGE) {
      pages.push(playerGrowthList.slice(i, i + RANKING_ROWS_PER_PAGE));
    }
    return pages.length > 0 ? pages : [[]];
  }, [playerGrowthList]);

  return (
    <div className="space-y-6 pb-12">
      {/* =====================================================================
          画面表示用 UI（印刷時は非表示にして専用A4区画シートを出力）
          ===================================================================== */}
      <div className="no-print space-y-6">
        {/* ヘッダー＆カテゴリ切替 */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 shrink-0 rounded-xl bg-gradient-to-br from-emerald-500/20 to-blue-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <TrendingUp size={22} />
              </div>
              <div>
                <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  成長レポート（Before / After 比較）
                </h2>
                <p className="text-xs sm:text-sm text-slate-400">
                  測定日ごとの変化量（Δ）を自動算出し、チーム成長ランキングと個人の成長カルテを可視化します
                </p>
              </div>
            </div>

            {/* カテゴリ選択タブ ＆ PDF印刷ボタン */}
            <div className="flex flex-wrap items-center gap-2">
              {allowHitting && (
                <button
                  onClick={() => setCategory('hitting')}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all cursor-pointer ${
                    category === 'hitting'
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
                  }`}
                >
                  <Zap size={16} /> 打撃成長
                </button>
              )}
              {allowPitching && (
                <button
                  onClick={() => setCategory('pitching')}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all cursor-pointer ${
                    category === 'pitching'
                      ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
                  }`}
                >
                  <Activity size={16} /> 投球成長
                </button>
              )}
              {allowBodyComp && (
                <button
                  onClick={() => setCategory('bodyComp')}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all cursor-pointer ${
                    category === 'bodyComp'
                      ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
                  }`}
                >
                  <Scale size={16} /> 体組成成長
                </button>
              )}
              <button
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all cursor-pointer"
                title="A4区画分けされた成長レポートPDFを出力"
              >
                <Printer size={16} className="text-blue-400" /> PDF / 印刷シート出力
              </button>
            </div>
          </div>

          {/* フィルター＆比較期間コントロール */}
          <div className="mt-5 pt-5 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* チーム選択 */}
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
              <label className="text-[11px] font-bold text-slate-400 mb-1.5 flex items-center gap-1.5">
                <Users size={13} className="text-blue-400 shrink-0" /> 対象チーム
              </label>
              <select
                value={selectedTeam}
                onChange={e => setSelectedTeam(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs sm:text-sm text-white font-semibold"
              >
                <option value="ALL">全チーム ({teams.length})</option>
                {teams.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            {/* 比較モード選択 */}
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
              <label className="text-[11px] font-bold text-slate-400 mb-1.5 flex items-center gap-1.5">
                <Calendar size={13} className="text-emerald-400 shrink-0" /> 比較期間の算出方法
              </label>
              <select
                value={compareMode}
                onChange={e => setCompareMode(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs sm:text-sm text-white font-semibold"
              >
                <option value="auto">自動（初回測定日 vs 最新測定日）</option>
                <option value="date">日付指定（Before日 vs After日）</option>
              </select>
            </div>

            {/* ランキング基準指標 */}
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
              <label className="text-[11px] font-bold text-slate-400 mb-1.5 flex items-center gap-1.5">
                <Award size={13} className="text-amber-400 shrink-0" /> ランキング基準指標
              </label>
              <select
                value={selectedMetricKey}
                onChange={e => setSelectedMetricKey(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs sm:text-sm text-white font-semibold"
              >
                {(CATEGORY_METRICS[category] || []).map(m => (
                  <option key={m.key} value={m.key}>
                    {m.label} ({m.unit || '指数'}) の変化量
                  </option>
                ))}
              </select>
            </div>

            {/* 複数日計測フィルタ */}
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 flex flex-col justify-between">
              <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1.5">
                <Filter size={13} className="text-purple-400 shrink-0" /> 表示オプション
              </span>
              <label className="flex items-center gap-2 text-xs text-slate-200 font-semibold cursor-pointer mt-1.5 whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={onlyMultipleDates}
                  onChange={e => setOnlyMultipleDates(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-blue-500"
                />
                2日以上計測がある選手のみ表示
              </label>
            </div>
          </div>

          {/* 日付指定モード時の日付セレクタ */}
          {compareMode === 'date' && (
            <div className="mt-3 p-3.5 bg-blue-950/20 border border-blue-500/30 rounded-xl flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-300">Before (比較元):</span>
                <select
                  value={beforeDate}
                  onChange={e => setBeforeDate(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono"
                >
                  {dates.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <ArrowRight size={16} className="text-blue-400" />
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-300">After (比較先):</span>
                <select
                  value={afterDate}
                  onChange={e => setAfterDate(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono"
                >
                  {dates.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        {playerGrowthList.length === 0 ? (
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-12 text-center space-y-3">
            <p className="text-base font-bold text-slate-300">
              比較可能なデータが見つかりませんでした
            </p>
            <p className="text-xs text-slate-500">
              「データ読み込み」からCSVをアップロードするか、フィルター条件（チーム・複数日計測フィルタ）を変更してください。
            </p>
          </div>
        ) : (
          <>
            {/* チーム成長サマリーカード（折り返し防止・スッキリ整列） */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {teamSummary.map(item => (
                <div
                  key={item.key}
                  onClick={() => setSelectedMetricKey(item.key)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                    selectedMetricKey === item.key
                      ? 'bg-slate-900 border-blue-500/60 shadow-lg shadow-blue-500/10'
                      : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="text-xs font-bold text-slate-300 whitespace-nowrap truncate">
                      {item.label}
                    </span>
                    <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 whitespace-nowrap shrink-0 border border-slate-700/70">
                      向上 {item.improvedCount}/{item.totalCompared}名
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="shrink-0">
                      {renderDeltaBadge(item.avgDelta, item)}
                    </div>
                    <span className="text-[10px] text-slate-500 whitespace-nowrap">
                      平均変化 (切替)
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* メイン2カラム：左＝Before/After 比較グラフ＆ランキング表、右＝個人成長詳細カルテ */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
              {/* 左カラム（7列）：チャート＆ランキング */}
              <div className="xl:col-span-7 space-y-6">
                {/* Before / After 比較バーチャート */}
                <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                    <div>
                      <h3 className="text-base font-black text-white flex items-center gap-2">
                        <Award size={18} className="text-amber-400 shrink-0" />
                        <span>{currentMetricMeta?.label} Before → After 比較チャート（上位15名）</span>
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        棒グラフまたは下の表をクリックすると右側の「個人成長カルテ」が切り替わります
                      </p>
                    </div>
                  </div>

                  <div className="h-80 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={chartData}
                        margin={{ top: 10, right: 20, left: 0, bottom: 45 }}
                        onClick={state => {
                          if (state?.activeLabel) {
                            setSelectedPlayer(state.activeLabel);
                          }
                        }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis
                          dataKey="name"
                          stroke="#94a3b8"
                          interval={0}
                          tick={{ fill: '#cbd5e1', fontSize: 11, fontWeight: 600 }}
                          angle={-30}
                          textAnchor="end"
                          height={65}
                        />
                        <YAxis
                          stroke="#94a3b8"
                          tick={{ fill: '#94a3b8', fontSize: 11 }}
                          domain={['auto', 'auto']}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#0f172a',
                            borderColor: '#334155',
                            borderRadius: '12px',
                            fontSize: '12px'
                          }}
                        />
                        <Legend verticalAlign="top" wrapperStyle={{ fontSize: '12px', paddingBottom: '10px' }} />
                        <Bar dataKey="Before" name="Before (比較元)" fill="#64748b" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="After" name="After (最新)" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* チーム成長ランキング一覧テーブル */}
                <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-black text-white">
                      選手別 成長ランキング（{currentMetricMeta?.label} 順）
                    </h3>
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-slate-800 text-slate-300">
                      全 {playerGrowthList.length} 名
                    </span>
                  </div>

                  <div className="overflow-x-auto max-h-[460px] overflow-y-auto">
                    <table className="w-full text-left border-collapse">
                      <thead className="sticky top-0 bg-slate-950/95 z-10">
                        <tr className="border-b border-slate-800 text-[11px] font-bold text-slate-400">
                          <th className="py-2.5 px-3 whitespace-nowrap">順位</th>
                          <th className="py-2.5 px-3 whitespace-nowrap">選手名</th>
                          <th className="py-2.5 px-3 whitespace-nowrap">比較期間</th>
                          <th className="py-2.5 px-3 text-right whitespace-nowrap">Before</th>
                          <th className="py-2.5 px-3 text-right whitespace-nowrap">After</th>
                          <th className="py-2.5 px-3 text-right whitespace-nowrap">変化量 (Δ)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 text-xs">
                        {playerGrowthList.map((p, idx) => {
                          const isSelected = p.playerName === activePlayerObj?.playerName;
                          const bVal = p.beforeStats?.[selectedMetricKey];
                          const aVal = p.afterStats?.[selectedMetricKey];
                          const delta = p.deltas?.[selectedMetricKey];
                          const dec = currentMetricMeta?.decimals ?? 1;

                          return (
                            <tr
                              key={p.playerName}
                              onClick={() => setSelectedPlayer(p.playerName)}
                              className={`cursor-pointer transition-colors ${
                                isSelected
                                  ? 'bg-blue-600/15 hover:bg-blue-600/20'
                                  : 'hover:bg-slate-800/60'
                              }`}
                            >
                              <td className="py-2.5 px-3 font-black text-slate-400 whitespace-nowrap">
                                #{idx + 1}
                              </td>
                              <td className="py-2.5 px-3">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-bold text-white whitespace-nowrap text-sm">
                                    {p.playerName}
                                  </span>
                                  {p.hasTwoPeriods && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 whitespace-nowrap">
                                      {p.dateCount}日計測
                                    </span>
                                  )}
                                </div>
                                {p.team && !p.team.includes('@') && (
                                  <div className="text-[10px] text-slate-500 truncate max-w-[160px]">{p.team}</div>
                                )}
                              </td>
                              <td className="py-2.5 px-3 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                                {p.beforeDate} → {p.afterDate}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono text-slate-300 whitespace-nowrap">
                                {bVal != null ? `${bVal.toFixed(dec)}` : '-'}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold text-white whitespace-nowrap">
                                {aVal != null ? `${aVal.toFixed(dec)}` : '-'}
                              </td>
                              <td className="py-2.5 px-3 text-right whitespace-nowrap">
                                {renderDeltaBadge(delta, currentMetricMeta)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* 右カラム（5列）：個人成長詳細カルテ（名前の縦割れを完全解消） */}
              <div className="xl:col-span-5">
                {activePlayerObj && (
                  <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-2xl space-y-5 sticky top-6">
                    {/* カルテヘッダー：上段＝アイコン＋選手名＋操作ボタン、下段＝所属・比較期間 */}
                    <div className="border-b border-slate-800 pb-4 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-11 h-11 shrink-0 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
                            <User size={22} />
                          </div>
                          <div className="min-w-0">
                            <div className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">
                              個人成長カルテ
                            </div>
                            <h3 className="text-xl sm:text-2xl font-black text-white whitespace-nowrap truncate">
                              {activePlayerObj.playerName}
                            </h3>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => window.print()}
                            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer shrink-0"
                            title="成長レポートを印刷 / PDF出力"
                          >
                            <Printer size={16} />
                          </button>
                          {onViewPlayer && (
                            <button
                              onClick={() => onViewPlayer(activePlayerObj.playerName, activePlayerObj.team, category === 'bodyComp' ? 'body_comp' : category)}
                              className="flex items-center gap-1 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold whitespace-nowrap transition cursor-pointer shrink-0 shadow-md shadow-blue-600/20"
                            >
                              個人分析へ <ChevronRight size={14} />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* 比較期間＆所属バッジ（横一列で整頓） */}
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        {activePlayerObj.team && (
                          <span className="font-semibold px-2.5 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700 max-w-[200px] truncate">
                            {activePlayerObj.team}
                          </span>
                        )}
                        <span className="px-2.5 py-0.5 rounded-md bg-slate-950 border border-slate-800 text-slate-300 font-mono text-[11px]">
                          Before: <strong className="text-slate-200">{activePlayerObj.beforeDate}</strong> ({activePlayerObj.beforeStats?.count || 0}件)
                          {' → '}
                          After: <strong className="text-blue-400">{activePlayerObj.afterDate}</strong> ({activePlayerObj.afterStats?.count || 0}件)
                        </span>
                      </div>
                    </div>

                    {/* 全指標の Before / After / Δ 一覧（見やすい3列グリッド行） */}
                    <div className="space-y-2">
                      {(CATEGORY_METRICS[category] || []).map(m => {
                        const bVal = activePlayerObj.beforeStats?.[m.key];
                        const aVal = activePlayerObj.afterStats?.[m.key];
                        const delta = activePlayerObj.deltas?.[m.key];
                        const dec = m.decimals ?? 1;

                        return (
                          <div
                            key={m.key}
                            className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/90 flex items-center justify-between gap-3"
                          >
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-slate-200 whitespace-nowrap">
                                {m.label}
                              </div>
                              <div className="text-xs text-slate-400 font-mono mt-1 flex items-center gap-2 whitespace-nowrap">
                                <span>
                                  Before: <strong className="text-slate-200">{bVal != null ? `${bVal.toFixed(dec)}` : '-'}</strong>
                                </span>
                                <ArrowRight size={12} className="text-slate-500 shrink-0" />
                                <span>
                                  After: <strong className="text-white text-sm">{aVal != null ? `${aVal.toFixed(dec)}` : '-'}</strong>
                                  <span className="text-[10px] text-slate-400 ml-0.5">{m.unit}</span>
                                </span>
                              </div>
                            </div>
                            <div className="shrink-0">
                              {renderDeltaBadge(delta, m)}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* 自動フィードバックコメント */}
                    <div className="p-4 rounded-xl bg-gradient-to-br from-blue-950/40 to-emerald-950/30 border border-blue-500/20 space-y-1.5">
                      <div className="text-xs font-black text-blue-300 flex items-center gap-1.5">
                        <TrendingUp size={14} /> 成長サマリーハイライト
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        {(() => {
                          const metrics = CATEGORY_METRICS[category] || [];
                          const improved = metrics.filter(m => {
                            const d = activePlayerObj.deltas?.[m.key];
                            if (d == null || Math.abs(d) < 0.05) return false;
                            return m.higherIsBetter === false ? d < 0 : d > 0;
                          });
                          if (improved.length === 0) {
                            return `${activePlayerObj.playerName} 選手の計測データを継続記録中です。次回測定データを追加すると、ここに成長ハイライトが自動生成されます。`;
                          }
                          const topTexts = improved.slice(0, 3).map(m => {
                            const d = activePlayerObj.deltas[m.key];
                            return `${m.label}（${d > 0 ? '+' : ''}${d.toFixed(m.decimals ?? 1)}${m.unit}）`;
                          });
                          return `${activePlayerObj.beforeDate} から ${activePlayerObj.afterDate} にかけて、${topTexts.join('、')} が向上しています。`;
                        })()}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* =====================================================================
          印刷 / PDF 出力専用：ページごとに完全区画化された A4 レポートシート
          ===================================================================== */}
      {playerGrowthList.length > 0 && (
        <div className="hidden print:block">
          {/* 1ページ目（〜複数ページ）：チーム成長ランキング＆サマリーシート（25名ごとにA4改ページ） */}
          {paginatedRankingPages.map((pageRows, pageIdx) => {
            const totalPages = paginatedRankingPages.length + (activePlayerObj ? 1 : 0);
            const currentPageNum = pageIdx + 1;
            const allMetrics = (CATEGORY_METRICS[category] || []).slice(0, 6);

            return (
              <div
                key={`print-ranking-page-${pageIdx}`}
                className={`print-a4-sheet ${pageIdx > 0 ? 'print-page-break-before' : ''}`}
              >
                {/* シートヘッダー区画 */}
                <div style={{ borderBottom: '2px solid #0f172a', paddingBottom: '6px', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                  <div>
                    <div style={{ fontSize: '9pt', fontWeight: 700, color: '#475569' }}>
                      BASEBALL ANALYZER • {categoryTitle}（チーム全体シート）
                    </div>
                    <h1 style={{ fontSize: '16pt', fontWeight: 900, color: '#0f172a', margin: '2px 0 0 0' }}>
                      {selectedTeam === 'ALL' ? '全チーム' : selectedTeam} 成長比較一覧（{currentMetricMeta?.label} 順）
                    </h1>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: '8.5pt', color: '#334155' }}>
                    <div>出力日: <strong>{todayStr}</strong></div>
                    <div>対象人数: <strong>{playerGrowthList.length}名</strong>　|　ページ: <strong>{currentPageNum} / {totalPages}</strong></div>
                  </div>
                </div>

                {/* 1ページ目のみチーム全体KPIサマリー4区画を表示 */}
                {pageIdx === 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '12px' }}>
                    {teamSummary.map(item => {
                      const dec = item.decimals ?? 1;
                      const dStr = item.avgDelta != null
                        ? `${item.avgDelta > 0 ? '+' : ''}${item.avgDelta.toFixed(dec)} ${item.unit}`
                        : '-';
                      return (
                        <div
                          key={`print-kpi-${item.key}`}
                          style={{ border: '1px solid #94a3b8', borderRadius: '6px', padding: '6px 8px' }}
                        >
                          <div style={{ fontSize: '7.5pt', fontWeight: 700, color: '#475569' }}>
                            {item.label}（チーム平均変化）
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '3px' }}>
                            <span style={{ fontSize: '12pt', fontWeight: 900, color: '#0f172a' }}>{dStr}</span>
                            <span style={{ fontSize: '7.5pt', fontWeight: 700, color: '#334155' }}>
                              向上 {item.improvedCount}/{item.totalCompared}名
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 選手別 Before / After / Δ 一覧テーブル区画 */}
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8pt' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '32px' }}>順位</th>
                      <th style={{ textAlign: 'left', paddingLeft: '6px' }}>選手名</th>
                      <th style={{ width: '135px' }}>比較期間 (Before → After)</th>
                      {allMetrics.map(m => (
                        <th key={`th-${m.key}`}>
                          {m.label}<br />
                          <span style={{ fontSize: '6.5pt', fontWeight: 600 }}>Before → After (Δ{m.unit})</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((p, idx) => {
                      const rank = pageIdx * RANKING_ROWS_PER_PAGE + idx + 1;
                      return (
                        <tr key={`print-row-${p.playerName}`}>
                          <td style={{ textAlign: 'center', fontWeight: 800 }}>#{rank}</td>
                          <td style={{ fontWeight: 800, paddingLeft: '6px', whiteSpace: 'nowrap' }}>
                            {p.playerName}
                          </td>
                          <td style={{ textAlign: 'center', fontSize: '7pt', whiteSpace: 'nowrap' }}>
                            {p.beforeDate} → {p.afterDate}
                          </td>
                          {allMetrics.map(m => {
                            const bVal = p.beforeStats?.[m.key];
                            const aVal = p.afterStats?.[m.key];
                            const dVal = p.deltas?.[m.key];
                            const dec = m.decimals ?? 1;
                            if (bVal == null && aVal == null) {
                              return <td key={`td-${p.playerName}-${m.key}`} style={{ textAlign: 'center' }}>-</td>;
                            }
                            const dText = dVal != null ? `${dVal > 0 ? '+' : ''}${dVal.toFixed(dec)}` : '-';
                            return (
                              <td key={`td-${p.playerName}-${m.key}`} style={{ textAlign: 'right', paddingRight: '5px', whiteSpace: 'nowrap' }}>
                                <span style={{ color: '#475569' }}>{bVal != null ? bVal.toFixed(dec) : '-'}</span>
                                {' → '}
                                <strong>{aVal != null ? aVal.toFixed(dec) : '-'}</strong>
                                {' '}
                                <span style={{ fontWeight: 800, color: dVal > 0 ? '#047857' : (dVal < 0 ? '#be123c' : '#334155') }}>
                                  ({dText})
                                </span>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}

          {/* 最終ページ：選択中の選手の「個人成長カルテ」専用A4シート（独立1ページ区画） */}
          {activePlayerObj && (
            <div className="print-a4-sheet print-page-break-before">
              {/* カルテヘッダー区画 */}
              <div style={{ borderBottom: '2px solid #0f172a', paddingBottom: '8px', marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                  <div style={{ fontSize: '9pt', fontWeight: 700, color: '#475569' }}>
                    BASEBALL ANALYZER • 個人成長カルテ（Before / After 詳細比較シート）
                  </div>
                  <h1 style={{ fontSize: '20pt', fontWeight: 900, color: '#0f172a', margin: '3px 0 0 0' }}>
                    {activePlayerObj.playerName} 選手
                  </h1>
                </div>
                <div style={{ textAlign: 'right', fontSize: '8.5pt', color: '#334155' }}>
                  <div>出力日: <strong>{todayStr}</strong></div>
                  <div>
                    ページ: <strong>{paginatedRankingPages.length + 1} / {paginatedRankingPages.length + 1}</strong>
                  </div>
                </div>
              </div>

              {/* 測定期間メタ情報ボックス区画 */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '16px' }}>
                <div style={{ border: '1px solid #94a3b8', borderRadius: '6px', padding: '8px 10px' }}>
                  <div style={{ fontSize: '7.5pt', fontWeight: 700, color: '#475569' }}>比較元（Before 測定日）</div>
                  <div style={{ fontSize: '12pt', fontWeight: 900, color: '#0f172a', marginTop: '2px' }}>
                    {activePlayerObj.beforeDate}
                  </div>
                  <div style={{ fontSize: '7.5pt', color: '#475569' }}>
                    対象データ数: {activePlayerObj.beforeStats?.count || 0} 件
                  </div>
                </div>
                <div style={{ border: '1px solid #94a3b8', borderRadius: '6px', padding: '8px 10px' }}>
                  <div style={{ fontSize: '7.5pt', fontWeight: 700, color: '#475569' }}>最新（After 測定日）</div>
                  <div style={{ fontSize: '12pt', fontWeight: 900, color: '#0f172a', marginTop: '2px' }}>
                    {activePlayerObj.afterDate}
                  </div>
                  <div style={{ fontSize: '7.5pt', color: '#475569' }}>
                    対象データ数: {activePlayerObj.afterStats?.count || 0} 件
                  </div>
                </div>
                <div style={{ border: '1px solid #94a3b8', borderRadius: '6px', padding: '8px 10px' }}>
                  <div style={{ fontSize: '7.5pt', fontWeight: 700, color: '#475569' }}>分析カテゴリ / 計測日数</div>
                  <div style={{ fontSize: '12pt', fontWeight: 900, color: '#0f172a', marginTop: '2px' }}>
                    {categoryTitle}
                  </div>
                  <div style={{ fontSize: '7.5pt', color: '#475569' }}>
                    累計計測日数: {activePlayerObj.dateCount} 日
                  </div>
                </div>
              </div>

              {/* 全測定指標 Before / After / 変化量（Δ）詳細テーブル区画 */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '10pt', fontWeight: 900, color: '#0f172a', marginBottom: '6px', borderLeft: '4px solid #0f172a', paddingLeft: '8px' }}>
                  1. 各測定指標の Before / After 変化明細
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9.5pt' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '6px 10px', width: '28%' }}>測定項目</th>
                      <th style={{ textAlign: 'right', padding: '6px 10px', width: '22%' }}>Before ({activePlayerObj.beforeDate})</th>
                      <th style={{ textAlign: 'right', padding: '6px 10px', width: '22%' }}>After ({activePlayerObj.afterDate})</th>
                      <th style={{ textAlign: 'right', padding: '6px 10px', width: '16%' }}>変化量 (Δ)</th>
                      <th style={{ textAlign: 'center', padding: '6px 10px', width: '12%' }}>判定</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(CATEGORY_METRICS[category] || []).map(m => {
                      const bVal = activePlayerObj.beforeStats?.[m.key];
                      const aVal = activePlayerObj.afterStats?.[m.key];
                      const delta = activePlayerObj.deltas?.[m.key];
                      const dec = m.decimals ?? 1;
                      const isPositiveGood = m.higherIsBetter !== false;
                      const isImproved = delta != null && Math.abs(delta) >= 0.05 && (m.higherIsBetter === null ? delta > 0 : (isPositiveGood ? delta > 0 : delta < 0));
                      const isDeclined = delta != null && Math.abs(delta) >= 0.05 && !isImproved && m.higherIsBetter !== null;

                      return (
                        <tr key={`print-player-metric-${m.key}`}>
                          <td style={{ padding: '6px 10px', fontWeight: 800 }}>{m.label}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'monospace' }}>
                            {bVal != null ? `${bVal.toFixed(dec)} ${m.unit}` : '-'}
                          </td>
                          <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 800 }}>
                            {aVal != null ? `${aVal.toFixed(dec)} ${m.unit}` : '-'}
                          </td>
                          <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 900, color: isImproved ? '#047857' : (isDeclined ? '#be123c' : '#0f172a') }}>
                            {delta != null ? `${delta > 0 ? '+' : ''}${delta.toFixed(dec)} ${m.unit}` : '-'}
                          </td>
                          <td style={{ padding: '6px 10px', textAlign: 'center', fontWeight: 800 }}>
                            {delta == null ? '-' : (isImproved ? '↑ 向上' : (isDeclined ? '↓ 課題' : '→ 維持'))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* 成長サマリー所見＆指導メモ欄区画 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }}>
                <div style={{ border: '1px solid #94a3b8', borderRadius: '6px', padding: '10px 12px' }}>
                  <div style={{ fontSize: '9.5pt', fontWeight: 900, color: '#0f172a', marginBottom: '4px' }}>
                    2. 自動分析サマリー
                  </div>
                  <div style={{ fontSize: '9pt', color: '#1e293b', lineHeight: 1.5 }}>
                    {(() => {
                      const metrics = CATEGORY_METRICS[category] || [];
                      const improved = metrics.filter(m => {
                        const d = activePlayerObj.deltas?.[m.key];
                        if (d == null || Math.abs(d) < 0.05) return false;
                        return m.higherIsBetter === false ? d < 0 : d > 0;
                      });
                      const declined = metrics.filter(m => {
                        const d = activePlayerObj.deltas?.[m.key];
                        if (d == null || Math.abs(d) < 0.05 || m.higherIsBetter === null) return false;
                        return m.higherIsBetter === false ? d > 0 : d < 0;
                      });
                      const impText = improved.length > 0
                        ? `向上指標: ${improved.map(m => `${m.label} (${activePlayerObj.deltas[m.key] > 0 ? '+' : ''}${activePlayerObj.deltas[m.key].toFixed(m.decimals ?? 1)}${m.unit})`).join('、')}。`
                        : '向上指標: 現時点では大きなプラス変化はありません。';
                      const decText = declined.length > 0
                        ? ` 重点確認指標: ${declined.map(m => `${m.label} (${activePlayerObj.deltas[m.key] > 0 ? '+' : ''}${activePlayerObj.deltas[m.key].toFixed(m.decimals ?? 1)}${m.unit})`).join('、')}。`
                        : '';
                      return `${activePlayerObj.beforeDate} から ${activePlayerObj.afterDate} の比較結果 — ${impText}${decText}`;
                    })()}
                  </div>
                </div>

                <div style={{ border: '1px solid #94a3b8', borderRadius: '6px', padding: '10px 12px', minHeight: '95px' }}>
                  <div style={{ fontSize: '9.5pt', fontWeight: 900, color: '#0f172a', marginBottom: '4px' }}>
                    3. コーチ・指導者フィードバック / 次回目標メモ欄
                  </div>
                  <div style={{ fontSize: '8pt', color: '#94a3b8', borderBottom: '1px dashed #cbd5e1', height: '24px' }} />
                  <div style={{ fontSize: '8pt', color: '#94a3b8', borderBottom: '1px dashed #cbd5e1', height: '24px' }} />
                  <div style={{ fontSize: '8pt', color: '#94a3b8', borderBottom: '1px dashed #cbd5e1', height: '24px' }} />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
