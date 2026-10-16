import React, { useState, useEffect, useMemo } from 'react';
import {
  Trophy, TrendingUp, Users, Target, Zap, Activity, Flame,
  Search, ArrowUpDown, ChevronDown, Filter, Sparkles, BarChart3,
  Calendar, Award, Info, PieChart as PieIcon
} from 'lucide-react';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LabelList, BarChart, Bar, Legend, ReferenceLine
} from 'recharts';
import {
  extractTeams, isBarrel, parseAnyDate, getRawDataValue,
  DEFAULT_DATE_KEYS, NAME_KEYS, EV_KEYS, LA_KEYS, DIST_KEYS, extractRowVal
} from '../utils/dataHelpers';

// Recognized event candidates in CSV
const EVENT_COL_CANDIDATES = [
  'events', 'event', 'play_result', 'PlayResult', 'playResult',
  'Result', 'result', 'outcome', 'Outcome', '打球結果', '結果', '判定'
];

function normalizeEvent(rawEvent, ev, la, dist) {
  if (rawEvent != null && String(rawEvent).trim() !== '') {
    const s = String(rawEvent).toLowerCase().trim();
    if (['single', '1b', '単打', '安打', 'ヒット', '右前安打', '左前安打', '中前安打'].some(k => s.includes(k))) return 'single';
    if (['double', '2b', '二塁打', 'ツーベース', '右中間二塁打', '左中間二塁打'].some(k => s.includes(k))) return 'double';
    if (['triple', '3b', '三塁打', 'スリーベース'].some(k => s.includes(k))) return 'triple';
    if (['home_run', 'homerun', 'hr', '本塁打', 'ホームラン'].some(k => s.includes(k))) return 'home_run';
    if (['walk', 'bb', '四球'].some(k => s.includes(k))) return 'walk';
    if (['hit_by_pitch', 'hbp', '死球'].some(k => s.includes(k))) return 'hit_by_pitch';
    if (['strikeout', 'so', 'k', '三振'].some(k => s.includes(k))) return 'strikeout';
    if (['sac_fly', 'sf', '犠飛', 'sac_bunt', '犠打'].some(k => s.includes(k))) return 'sac';
    if (['out', 'ground_out', 'fly_out', 'line_out', 'pop_out', 'field_out', 'force_out', 'ゴロ', 'フライ', 'ライナー', '凡打'].some(k => s.includes(k))) return 'out';
  }

  // Physics-based estimation (xStats / 打球シミュレーション) if no explicit event
  const numEv = Number(ev);
  const numLa = Number(la);
  const numDist = Number(dist);

  if (isNaN(numEv) || numEv <= 0) return null;

  // Statcast-like estimation adapted for amateur/high school velocity (km/h)
  // 1. Home Run: EV >= 142 km/h, LA 22-38 deg, Dist >= 98m (or Dist >= 105m)
  if ((numEv >= 142 && numLa >= 22 && numLa <= 38 && (!numDist || numDist >= 98)) || (numDist && numDist >= 105)) {
    return 'home_run';
  }
  // 2. Extra base hit (Double / Triple)
  if ((numEv >= 134 && numLa >= 12 && numLa <= 28) || (numDist && numDist >= 82)) {
    return (numEv >= 145 && numLa >= 18 && numDist >= 92) ? 'triple' : 'double';
  }
  // 3. Line drive single
  if (numEv >= 115 && numLa >= 8 && numLa <= 25) {
    return 'single';
  }
  // 4. Hard grounder through infield
  if (numEv >= 132 && numLa >= -5 && numLa <= 6) {
    return 'single';
  }
  // 5. Weak contact or high pop
  if (numLa < 6 || numLa > 36 || numEv < 112) {
    return 'out';
  }

  // Moderate contact: 30% hit probability based on exit velocity
  if (numEv >= 125) return 'single';
  return 'out';
}

function GameStats({ savantData, blastData, combinedData }) {
  const defaultSource = useMemo(() => {
    const sLen = savantData?.data?.length || 0;
    const bLen = blastData?.data?.length || 0;
    const cLen = combinedData?.data?.length || 0;

    if (cLen >= sLen && cLen >= bLen && cLen > 0) return 'combined';
    if (sLen >= bLen && sLen > 0) return 'savant';
    if (bLen > 0) return 'blast';
    return 'combined';
  }, [savantData, blastData, combinedData]);

  const [sourceType, setSourceType] = useState(defaultSource);

  useEffect(() => {
    setSourceType(defaultSource);
  }, [defaultSource]);

  const activeData = sourceType === 'savant' ? savantData : sourceType === 'blast' ? blastData : combinedData;
  const headers = activeData ? activeData.headers : [];
  const rawRows = activeData ? (activeData.data || []) : [];

  const [selectedTeam, setSelectedTeam] = useState('all');
  const [selectedDate, setSelectedDate] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('scatter'); // 'scatter' | 'breakdown' | 'velocity_angle'
  const [sortField, setSortField] = useState('ops');
  const [sortAsc, setSortAsc] = useState(false);

  // Detect event column
  const detectedEventCol = useMemo(() => {
    return headers.find(h => EVENT_COL_CANDIDATES.includes(h)) || null;
  }, [headers]);

  // Extract all teams
  const teams = useMemo(() => {
    if (!rawRows.length) return [];
    const teamCandidates = ['チーム名', 'チーム', 'Team', 'team_name', 'home_team', 'away_team'];
    const teamKey = headers.find(h => teamCandidates.includes(h));
    const extracted = extractTeams(rawRows, teamKey);
    return extracted.filter(t => t && t !== '管理者' && t !== 'admin');
  }, [rawRows, headers]);

  // Extract all dates
  const availableDates = useMemo(() => {
    const dateSet = new Set();
    rawRows.forEach(r => {
      const d = parseAnyDate(getRawDataValue(r, DEFAULT_DATE_KEYS)) || parseAnyDate(r.date || r.game_date);
      if (d) dateSet.add(d.slice(0, 10));
    });
    return Array.from(dateSet).sort().reverse();
  }, [rawRows]);

  // Process rows into normalized at-bat events
  const processedEvents = useMemo(() => {
    if (!rawRows.length) return [];

    return rawRows.map((row, idx) => {
      // Player name
      let player = '';
      for (const k of NAME_KEYS) {
        if (row[k] != null && String(row[k]).trim() !== '') {
          player = String(row[k]).trim();
          break;
        }
      }
      if (!player) player = `選手 ${idx + 1}`;

      // Team name
      const teamCandidates = ['チーム名', 'チーム', 'Team', 'team_name'];
      let team = 'Aチーム';
      for (const k of teamCandidates) {
        if (row[k] != null && String(row[k]).trim() !== '') {
          team = String(row[k]).trim();
          break;
        }
      }

      // Date
      const date = parseAnyDate(getRawDataValue(row, DEFAULT_DATE_KEYS)) || parseAnyDate(row.date || row.game_date) || '';

      // Metrics
      const ev = Number(extractRowVal(row, EV_KEYS)) || 0;
      const la = Number(extractRowVal(row, LA_KEYS)) || 0;
      const dist = Number(extractRowVal(row, DIST_KEYS)) || 0;
      const grade = row['学年'] || row.grade || row.Grade || '';

      // Event normalization
      const rawEventVal = detectedEventCol ? row[detectedEventCol] : null;
      const event = normalizeEvent(rawEventVal, ev, la, dist);

      return {
        id: idx,
        player,
        team,
        date: date ? date.slice(0, 10) : '',
        grade,
        ev,
        la,
        dist,
        event,
        isRecorded: detectedEventCol != null && rawEventVal != null,
        barrel: isBarrel(ev, la)
      };
    }).filter(e => e.event !== null);
  }, [rawRows, detectedEventCol]);

  // Filter events by selected team & date
  const filteredEvents = useMemo(() => {
    return processedEvents.filter(e => {
      if (selectedTeam !== 'all' && e.team !== selectedTeam) return false;
      if (selectedDate !== 'all' && e.date !== selectedDate) return false;
      return true;
    });
  }, [processedEvents, selectedTeam, selectedDate]);

  // Calculate Aggregated Player Stats
  const playerStats = useMemo(() => {
    const playerMap = {};

    filteredEvents.forEach(e => {
      if (!playerMap[e.player]) {
        playerMap[e.player] = {
          player: e.player,
          team: e.team,
          grade: e.grade,
          pa: 0,
          ab: 0,
          single: 0,
          double: 0,
          triple: 0,
          hr: 0,
          bb: 0,
          hbp: 0,
          so: 0,
          sac: 0,
          outs: 0,
          barrels: 0,
          hardHits: 0,
          evList: [],
          laList: [],
          maxEv: 0,
        };
      }

      const p = playerMap[e.player];
      p.pa += 1;

      if (e.ev > 0) {
        p.evList.push(e.ev);
        if (e.ev > p.maxEv) p.maxEv = e.ev;
        if (e.ev >= 135) p.hardHits += 1;
      }
      if (e.barrel) p.barrels += 1;

      switch (e.event) {
        case 'single':
          p.ab += 1;
          p.single += 1;
          break;
        case 'double':
          p.ab += 1;
          p.double += 1;
          break;
        case 'triple':
          p.ab += 1;
          p.triple += 1;
          break;
        case 'home_run':
          p.ab += 1;
          p.hr += 1;
          break;
        case 'walk':
          p.bb += 1;
          break;
        case 'hit_by_pitch':
          p.hbp += 1;
          break;
        case 'strikeout':
          p.ab += 1;
          p.so += 1;
          p.outs += 1;
          break;
        case 'sac':
          p.sac += 1;
          break;
        case 'out':
        default:
          p.ab += 1;
          p.outs += 1;
          break;
      }
    });

    return Object.values(playerMap).map(p => {
      const hits = p.single + p.double + p.triple + p.hr;
      const totalBases = (p.single * 1) + (p.double * 2) + (p.triple * 3) + (p.hr * 4);
      const ba = p.ab > 0 ? hits / p.ab : 0;
      const obpDenominator = p.ab + p.bb + p.hbp + p.sac;
      const obp = obpDenominator > 0 ? (hits + p.bb + p.hbp) / obpDenominator : 0;
      const slg = p.ab > 0 ? totalBases / p.ab : 0;
      const ops = obp + slg;
      const iso = slg - ba;
      const avgEv = p.evList.length > 0 ? p.evList.reduce((a, b) => a + b, 0) / p.evList.length : 0;
      const barrelRate = p.pa > 0 ? (p.barrels / p.pa) * 100 : 0;
      const hardHitRate = p.evList.length > 0 ? (p.hardHits / p.evList.length) * 100 : 0;

      return {
        ...p,
        hits,
        totalBases,
        ba,
        obp,
        slg,
        ops,
        iso,
        avgEv: Math.round(avgEv * 10) / 10,
        maxEv: Math.round(p.maxEv * 10) / 10,
        barrelRate: Math.round(barrelRate * 10) / 10,
        hardHitRate: Math.round(hardHitRate * 10) / 10
      };
    });
  }, [filteredEvents]);

  // Overall Team KPIs
  const teamKpis = useMemo(() => {
    if (!playerStats.length) {
      return { pa: 0, ab: 0, hits: 0, hr: 0, ba: 0, obp: 0, slg: 0, ops: 0, avgEv: 0, maxEv: 0, barrels: 0 };
    }

    const totalPa = playerStats.reduce((acc, p) => acc + p.pa, 0);
    const totalAb = playerStats.reduce((acc, p) => acc + p.ab, 0);
    const totalHits = playerStats.reduce((acc, p) => acc + p.hits, 0);
    const totalHr = playerStats.reduce((acc, p) => acc + p.hr, 0);
    const totalTb = playerStats.reduce((acc, p) => acc + p.totalBases, 0);
    const totalBb = playerStats.reduce((acc, p) => acc + p.bb, 0);
    const totalHbp = playerStats.reduce((acc, p) => acc + p.hbp, 0);
    const totalSac = playerStats.reduce((acc, p) => acc + p.sac, 0);
    const totalBarrels = playerStats.reduce((acc, p) => acc + p.barrels, 0);
    const maxEv = Math.max(...playerStats.map(p => p.maxEv || 0));

    const allEvs = filteredEvents.map(e => e.ev).filter(v => v > 0);
    const avgEv = allEvs.length > 0 ? allEvs.reduce((a, b) => a + b, 0) / allEvs.length : 0;

    const ba = totalAb > 0 ? totalHits / totalAb : 0;
    const obpDenom = totalAb + totalBb + totalHbp + totalSac;
    const obp = obpDenom > 0 ? (totalHits + totalBb + totalHbp) / obpDenom : 0;
    const slg = totalAb > 0 ? totalTb / totalAb : 0;
    const ops = obp + slg;

    return {
      pa: totalPa,
      ab: totalAb,
      hits: totalHits,
      hr: totalHr,
      ba,
      obp,
      slg,
      ops,
      avgEv: Math.round(avgEv * 10) / 10,
      maxEv: Math.round(maxEv * 10) / 10,
      barrels: totalBarrels
    };
  }, [playerStats, filteredEvents]);

  // Sort & filter player list
  const sortedPlayers = useMemo(() => {
    let list = [...playerStats];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(p => p.player.toLowerCase().includes(q) || (p.grade && p.grade.toLowerCase().includes(q)));
    }

    list.sort((a, b) => {
      let va = a[sortField];
      let vb = b[sortField];
      if (typeof va === 'string') return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
      return sortAsc ? (va - vb) : (vb - va);
    });

    return list;
  }, [playerStats, searchQuery, sortField, sortAsc]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const formatRate = (val) => {
    if (val == null || isNaN(val)) return '.000';
    if (val >= 1) return val.toFixed(3);
    const s = val.toFixed(3);
    return '.' + s.split('.')[1];
  };

  return (
    <div className="animate-in fade-in duration-300">
      {/* Page Header */}
      <header className="mb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-amber-500/20 border border-amber-500/40 text-amber-300 inline-flex items-center gap-1">
              <Trophy className="w-3.5 h-3.5" />
              Game Analytics
            </span>
            {detectedEventCol ? (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                🎯 実戦記録列 ({detectedEventCol}) 反映中
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                ⚡ 打球物理推定 (xStats / シミュレーション)
              </span>
            )}
          </div>
          <h2 className="text-3xl font-extrabold text-white">試合スタッツ (Game Stats)</h2>
          <p className="text-sm text-slate-400 mt-1">
            実戦結果および打球速度・角度データから打率、長打率、OPS、バレル数などのセイバーメトリクス指標を算出します。
          </p>
        </div>

        {/* Filters */}
        <div className="bg-slate-800/90 p-3 rounded-2xl border border-slate-700/80 flex flex-wrap items-center gap-2.5 shadow-lg">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold text-slate-400">データ:</span>
            <select
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value)}
              className="bg-slate-900 border border-slate-700 text-white rounded-lg px-2.5 py-1.5 text-xs font-bold focus:ring-1 focus:ring-blue-500 outline-none"
            >
              <option value="combined">統合データ (Combined)</option>
              <option value="savant">Rapsodo 打撃</option>
              <option value="blast">Blast Motion</option>
            </select>
          </div>

          {teams.length > 1 && (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-400">チーム:</span>
              <select
                value={selectedTeam}
                onChange={(e) => setSelectedTeam(e.target.value)}
                className="bg-slate-900 border border-slate-700 text-white rounded-lg px-2.5 py-1.5 text-xs font-bold focus:ring-1 focus:ring-blue-500 outline-none"
              >
                <option value="all">全チーム ({teams.length})</option>
                {teams.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          )}

          {availableDates.length > 0 && (
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-slate-900 border border-slate-700 text-white rounded-lg px-2.5 py-1.5 text-xs font-bold focus:ring-1 focus:ring-blue-500 outline-none"
              >
                <option value="all">全日程 ({availableDates.length}日)</option>
                {availableDates.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </header>

      {/* Team KPI Overview Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
        <div className="bg-slate-800/80 p-4 rounded-2xl border border-blue-500/30 shadow-lg relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-16 h-16 bg-blue-500/10 rounded-full blur-xl group-hover:bg-blue-500/20 transition-all"></div>
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-400">チーム打率 (AVG)</span>
          <div className="text-2xl font-black text-white mt-1 font-mono">{formatRate(teamKpis.ba)}</div>
          <span className="text-[10px] text-slate-400 mt-0.5 block">{teamKpis.hits}安打 / {teamKpis.ab}打数</span>
        </div>

        <div className="bg-slate-800/80 p-4 rounded-2xl border border-cyan-500/30 shadow-lg relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-16 h-16 bg-cyan-500/10 rounded-full blur-xl group-hover:bg-cyan-500/20 transition-all"></div>
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-cyan-400">出塁率 (OBP)</span>
          <div className="text-2xl font-black text-white mt-1 font-mono">{formatRate(teamKpis.obp)}</div>
          <span className="text-[10px] text-slate-400 mt-0.5 block">四死球込 出塁率</span>
        </div>

        <div className="bg-slate-800/80 p-4 rounded-2xl border border-purple-500/30 shadow-lg relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-16 h-16 bg-purple-500/10 rounded-full blur-xl group-hover:bg-purple-500/20 transition-all"></div>
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-purple-400">長打率 (SLG)</span>
          <div className="text-2xl font-black text-white mt-1 font-mono">{formatRate(teamKpis.slg)}</div>
          <span className="text-[10px] text-slate-400 mt-0.5 block">1打数あたり塁打数</span>
        </div>

        <div className="bg-gradient-to-br from-amber-950/40 via-slate-800 to-amber-950/20 p-4 rounded-2xl border border-amber-500/40 shadow-xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-16 h-16 bg-amber-500/10 rounded-full blur-xl group-hover:bg-amber-500/20 transition-all"></div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-amber-300">チーム OPS</span>
            <span className={`text-[9px] font-black px-1.5 py-0.2 rounded ${teamKpis.ops >= 0.85 ? 'bg-rose-500/30 text-rose-300' : (teamKpis.ops >= 0.75 ? 'bg-amber-500/30 text-amber-300' : 'bg-blue-500/30 text-blue-300')}`}>
              {teamKpis.ops >= 0.85 ? '🔥 ELITE' : (teamKpis.ops >= 0.75 ? '⭐ HIGH' : 'NORMAL')}
            </span>
          </div>
          <div className="text-2xl font-black text-amber-400 mt-1 font-mono">{teamKpis.ops.toFixed(3)}</div>
          <span className="text-[10px] text-slate-400 mt-0.5 block">出塁率 + 長打率</span>
        </div>

        <div className="bg-slate-800/80 p-4 rounded-2xl border border-emerald-500/30 shadow-lg relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/10 rounded-full blur-xl group-hover:bg-emerald-500/20 transition-all"></div>
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-400">バレル / HR</span>
          <div className="text-2xl font-black text-white mt-1 font-mono">{teamKpis.barrels} <span className="text-xs text-slate-400 font-normal">/ {teamKpis.hr}本</span></div>
          <span className="text-[10px] text-slate-400 mt-0.5 block">理想打球角度×初速</span>
        </div>

        <div className="bg-slate-800/80 p-4 rounded-2xl border border-slate-700 shadow-lg relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-16 h-16 bg-slate-500/10 rounded-full blur-xl transition-all"></div>
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">平均 / 最高打球速</span>
          <div className="text-xl font-black text-white mt-1 font-mono">{teamKpis.avgEv} <span className="text-xs text-slate-400 font-normal">km/h</span></div>
          <span className="text-[10px] text-slate-400 mt-0.5 block">最速: {teamKpis.maxEv} km/h</span>
        </div>
      </div>

      {/* Visual Analytics Card with Tabs */}
      <div className="bg-slate-800/90 rounded-3xl border border-slate-700/80 shadow-2xl p-6 mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-700/80 pb-4 mb-6">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-400" />
            <h3 className="text-lg font-extrabold text-white">ビジュアル打撃アナリティクス</h3>
          </div>

          <div className="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-700/80 self-start sm:self-auto">
            <button
              onClick={() => setActiveTab('scatter')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'scatter' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              打率 vs 長打率 (OPS散布図)
            </button>
            <button
              onClick={() => setActiveTab('breakdown')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'breakdown' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              安打内訳グラフ
            </button>
            <button
              onClick={() => setActiveTab('velocity_angle')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'velocity_angle' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              初速 × 角度 (バレル分布)
            </button>
          </div>
        </div>

        {/* Tab 1: AVG vs SLG Scatter Chart */}
        {activeTab === 'scatter' && (
          <div className="h-80 sm:h-96 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 20, right: 30, bottom: 25, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.6} />
                <XAxis
                  type="number"
                  dataKey="ba"
                  name="AVG"
                  stroke="#94a3b8"
                  domain={[0, 'auto']}
                  tickFormatter={formatRate}
                  label={{ value: '打率 (AVG)', position: 'bottom', offset: 5, fill: '#64748b', fontSize: 11 }}
                />
                <YAxis
                  type="number"
                  dataKey="slg"
                  name="SLG"
                  stroke="#94a3b8"
                  domain={[0, 'auto']}
                  tickFormatter={formatRate}
                  label={{ value: '長打率 (SLG)', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 11 }}
                />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const d = payload[0].payload;
                      return (
                        <div className="bg-slate-900 border border-slate-700 p-3.5 rounded-xl shadow-2xl text-xs space-y-1">
                          <p className="font-extrabold text-white text-sm border-b border-slate-700 pb-1 flex items-center justify-between gap-4">
                            <span>{d.player}</span>
                            <span className="text-[10px] text-slate-400 font-mono">{d.team}</span>
                          </p>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 pt-1 font-mono">
                            <span className="text-slate-400">打率 (AVG):</span>
                            <span className="text-blue-300 font-bold">{formatRate(d.ba)}</span>
                            <span className="text-slate-400">出塁率 (OBP):</span>
                            <span className="text-cyan-300 font-bold">{formatRate(d.obp)}</span>
                            <span className="text-slate-400">長打率 (SLG):</span>
                            <span className="text-purple-300 font-bold">{formatRate(d.slg)}</span>
                            <span className="text-slate-400 font-bold">OPS:</span>
                            <span className="text-amber-400 font-black">{d.ops.toFixed(3)}</span>
                            <span className="text-slate-400">安打 / 打数:</span>
                            <span className="text-white">{d.hits} / {d.ab}</span>
                            <span className="text-slate-400">平均初速:</span>
                            <span className="text-white">{d.avgEv} km/h</span>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Scatter name="Players" data={playerStats}>
                  {playerStats.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.ops >= 0.9 ? '#ef4444' : (entry.ops >= 0.8 ? '#f59e0b' : (entry.ops >= 0.7 ? '#3b82f6' : '#64748b'))}
                      stroke="#fff"
                      strokeWidth={entry.ops >= 0.9 ? 2 : 0}
                    />
                  ))}
                  <LabelList dataKey="player" position="top" fill="#cbd5e1" fontSize={10} offset={8} />
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
            <div className="flex items-center justify-center gap-4 text-[11px] text-slate-400 mt-2">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block"></span> OPS .900+ (強打者)</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"></span> OPS .800 ~ .899 (好打者)</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block"></span> OPS .700 ~ .799</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-slate-500 inline-block"></span> OPS .700未満</span>
            </div>
          </div>
        )}

        {/* Tab 2: Hit Breakdown Stacked Bar Chart */}
        {activeTab === 'breakdown' && (
          <div className="h-80 sm:h-96 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={playerStats} margin={{ top: 20, right: 30, left: 10, bottom: 25 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.6} />
                <XAxis dataKey="player" stroke="#94a3b8" fontSize={11} interval={0} angle={-25} textAnchor="end" />
                <YAxis stroke="#94a3b8" fontSize={11} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-slate-900 border border-slate-700 p-3 rounded-xl text-xs space-y-1">
                          <p className="font-bold text-white text-sm border-b border-slate-700 pb-1">{label}</p>
                          {payload.map((p, idx) => (
                            <div key={idx} className="flex justify-between gap-3" style={{ color: p.color }}>
                              <span>{p.name}:</span>
                              <span className="font-mono font-bold">{p.value}本</span>
                            </div>
                          ))}
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                <Bar dataKey="single" name="単打 (1B)" stackId="a" fill="#3b82f6" />
                <Bar dataKey="double" name="二塁打 (2B)" stackId="a" fill="#06b6d4" />
                <Bar dataKey="triple" name="三塁打 (3B)" stackId="a" fill="#a855f7" />
                <Bar dataKey="hr" name="本塁打 (HR)" stackId="a" fill="#f59e0b" />
                <Bar dataKey="bb" name="四死球" stackId="a" fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Tab 3: Exit Velocity vs Launch Angle Map */}
        {activeTab === 'velocity_angle' && (
          <div className="h-80 sm:h-96 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 20, right: 30, bottom: 25, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.6} />
                <XAxis
                  type="number"
                  dataKey="la"
                  name="打球角度"
                  stroke="#94a3b8"
                  domain={[-20, 60]}
                  unit="°"
                  label={{ value: '打球角度 (Launch Angle °)', position: 'bottom', offset: 5, fill: '#64748b', fontSize: 11 }}
                />
                <YAxis
                  type="number"
                  dataKey="ev"
                  name="打球速度"
                  stroke="#94a3b8"
                  domain={['auto', 'auto']}
                  unit=" km/h"
                  label={{ value: '打球速度 (Exit Velocity km/h)', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 11 }}
                />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const d = payload[0].payload;
                      const eventLabel = {
                        single: '単打 (1B)',
                        double: '二塁打 (2B)',
                        triple: '三塁打 (3B)',
                        home_run: '🔥 本塁打 (HR)',
                        walk: '四球',
                        strikeout: '三振',
                        out: '凡打'
                      }[d.event] || d.event;

                      return (
                        <div className="bg-slate-900 border border-slate-700 p-3 rounded-xl text-xs space-y-1">
                          <p className="font-bold text-white text-sm">{d.player}</p>
                          <p className="text-amber-400 font-bold">{eventLabel}</p>
                          <div className="grid grid-cols-2 gap-x-3 text-slate-300 font-mono text-[11px] pt-1 border-t border-slate-700">
                            <span>打球初速:</span>
                            <span className="text-white font-bold">{d.ev} km/h</span>
                            <span>打球角度:</span>
                            <span className="text-white font-bold">{d.la}°</span>
                            {d.dist > 0 && (
                              <>
                                <span>推定飛距離:</span>
                                <span className="text-white font-bold">{d.dist} m</span>
                              </>
                            )}
                            {d.barrel && (
                              <span className="col-span-2 text-emerald-400 font-black pt-1">
                                ✨ バレルゾーン判定 (Barrel)
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Scatter name="Hits" data={filteredEvents}>
                  {filteredEvents.map((entry, index) => (
                    <Cell
                      key={`ev-la-${index}`}
                      fill={entry.barrel ? '#10b981' : (entry.event === 'home_run' ? '#f59e0b' : (entry.event === 'double' || entry.event === 'triple' ? '#06b6d4' : (entry.event === 'single' ? '#3b82f6' : '#64748b')))}
                      opacity={entry.event === 'out' ? 0.4 : 0.85}
                    />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
            <div className="flex items-center justify-center gap-4 text-[11px] text-slate-400 mt-2">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span> バレル打球</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"></span> 本塁打</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-cyan-400 inline-block"></span> 長打 (2B/3B)</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block"></span> 単打 (1B)</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-slate-600 inline-block"></span> 凡打</span>
            </div>
          </div>
        )}
      </div>

      {/* Detailed Player Stats Table */}
      <div className="bg-slate-800/90 rounded-3xl border border-slate-700/80 shadow-2xl overflow-hidden">
        <div className="p-5 bg-slate-900 border-b border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-amber-400" />
            <h3 className="font-extrabold text-white text-base">選手別 試合打撃成績一覧</h3>
            <span className="text-xs bg-slate-800 text-slate-400 px-2.5 py-0.5 rounded-full border border-slate-700">
              {sortedPlayers.length} 名
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="選手名で絞り込み..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:ring-1 focus:ring-blue-500 outline-none w-48"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left text-slate-300">
            <thead className="text-[11px] text-slate-400 uppercase bg-slate-900/60 border-b border-slate-700/80 font-bold select-none">
              <tr>
                <th className="px-4 py-3 text-center">順位</th>
                <th className="px-4 py-3 cursor-pointer hover:text-white" onClick={() => handleSort('player')}>
                  <div className="flex items-center gap-1">選手名 <ArrowUpDown className="w-3 h-3" /></div>
                </th>
                <th className="px-3 py-3 text-center cursor-pointer hover:text-white" onClick={() => handleSort('pa')}>
                  打席
                </th>
                <th className="px-3 py-3 text-center cursor-pointer hover:text-white" onClick={() => handleSort('ab')}>
                  打数
                </th>
                <th className="px-3 py-3 text-center cursor-pointer hover:text-white" onClick={() => handleSort('hits')}>
                  安打
                </th>
                <th className="px-2 py-3 text-center text-slate-400">1B</th>
                <th className="px-2 py-3 text-center text-slate-400">2B</th>
                <th className="px-2 py-3 text-center text-slate-400">3B</th>
                <th className="px-2 py-3 text-center text-amber-400 cursor-pointer hover:text-white" onClick={() => handleSort('hr')}>
                  HR
                </th>
                <th className="px-3 py-3 text-center cursor-pointer hover:text-blue-300 text-blue-400" onClick={() => handleSort('ba')}>
                  <div className="flex items-center justify-center gap-0.5">打率 (AVG) <ArrowUpDown className="w-3 h-3" /></div>
                </th>
                <th className="px-3 py-3 text-center cursor-pointer hover:text-cyan-300 text-cyan-400" onClick={() => handleSort('obp')}>
                  出塁率 (OBP)
                </th>
                <th className="px-3 py-3 text-center cursor-pointer hover:text-purple-300 text-purple-400" onClick={() => handleSort('slg')}>
                  長打率 (SLG)
                </th>
                <th className="px-4 py-3 text-center cursor-pointer text-amber-400 font-extrabold" onClick={() => handleSort('ops')}>
                  <div className="flex items-center justify-center gap-0.5">OPS <ArrowUpDown className="w-3 h-3" /></div>
                </th>
                <th className="px-3 py-3 text-center cursor-pointer hover:text-white" onClick={() => handleSort('avgEv')}>
                  平均初速
                </th>
                <th className="px-3 py-3 text-center cursor-pointer hover:text-white" onClick={() => handleSort('maxEv')}>
                  最速
                </th>
                <th className="px-3 py-3 text-center cursor-pointer hover:text-emerald-400 text-emerald-400" onClick={() => handleSort('barrels')}>
                  バレル
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/60 font-mono">
              {sortedPlayers.length === 0 ? (
                <tr>
                  <td colSpan={16} className="px-6 py-8 text-center text-slate-500 font-sans">
                    条件に該当するデータがありません
                  </td>
                </tr>
              ) : (
                sortedPlayers.map((p, idx) => {
                  const isTop3 = idx < 3 && sortField === 'ops' && !sortAsc;
                  return (
                    <tr key={p.player} className="hover:bg-slate-700/40 transition">
                      <td className="px-4 py-3 text-center">
                        {isTop3 ? (
                          <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-black ${
                            idx === 0 ? 'bg-amber-400 text-slate-900 shadow-md' : (idx === 1 ? 'bg-slate-300 text-slate-900' : 'bg-amber-700 text-white')
                          }`}>
                            {idx + 1}
                          </span>
                        ) : (
                          <span className="text-slate-500 text-[11px]">{idx + 1}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-sans font-bold text-white">
                        <div className="flex items-center gap-1.5">
                          <span>{p.player}</span>
                          {p.grade && (
                            <span className="text-[10px] text-slate-400 px-1 py-0.2 rounded bg-slate-900 border border-slate-700 font-normal">
                              {p.grade}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center text-slate-400">{p.pa}</td>
                      <td className="px-3 py-3 text-center text-slate-300">{p.ab}</td>
                      <td className="px-3 py-3 text-center font-bold text-white">{p.hits}</td>
                      <td className="px-2 py-3 text-center text-slate-400">{p.single}</td>
                      <td className="px-2 py-3 text-center text-slate-400">{p.double}</td>
                      <td className="px-2 py-3 text-center text-slate-400">{p.triple}</td>
                      <td className="px-2 py-3 text-center font-bold text-amber-400">{p.hr}</td>
                      <td className="px-3 py-3 text-center font-bold text-blue-300">{formatRate(p.ba)}</td>
                      <td className="px-3 py-3 text-center font-bold text-cyan-300">{formatRate(p.obp)}</td>
                      <td className="px-3 py-3 text-center font-bold text-purple-300">{formatRate(p.slg)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded font-black ${
                          p.ops >= 0.9 ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' : (p.ops >= 0.8 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'text-slate-200')
                        }`}>
                          {p.ops.toFixed(3)}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center text-slate-300">{p.avgEv > 0 ? `${p.avgEv}` : '-'}</td>
                      <td className="px-3 py-3 text-center text-slate-300">{p.maxEv > 0 ? `${p.maxEv}` : '-'}</td>
                      <td className="px-3 py-3 text-center text-emerald-400 font-bold">{p.barrels}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default GameStats;
