// Body composition (体組成) helpers
// Column matching here is EXACT (after normalisation) on purpose: the generic fuzzy
// matcher in dataHelpers would confuse e.g. "筋肉量" with "左腕筋肉量".
// Aliases cover Japanese headers, English headers and the snake_case column names
// used by the Supabase `body_comp_data` table (so cloud rows round-trip).
import Papa from 'papaparse';
import {
  getDataValue,
  BS_KEYS,
  EV_KEYS,
  PITCH_VELO_KEYS,
  DIST_KEYS,
  NAME_KEYS,
  PITCHER_NAME_KEYS,
  parseAnyDate,
  getRawDataValue,
  DEFAULT_DATE_KEYS
} from './dataHelpers.js';

export const BODY_METRICS = [
  { key: 'height',   label: '身長',         unit: 'cm',    digits: 1, dbColumn: 'height',           aliases: ['身長', 'height', '身長cm', 'heightcm', 'bodyheight', 'stature'] },
  { key: 'weight',   label: '体重',         unit: 'kg',    digits: 1, dbColumn: 'weight',           aliases: ['体重', 'weight', '体重kg', 'weightkg', 'bodyweight', 'bodymass'] },
  { key: 'muscle',   label: '筋肉量',       unit: 'kg',    digits: 1, dbColumn: 'muscle_mass',      aliases: ['筋肉量', '全身筋肉量', '骨格筋量', '骨格筋肉量', 'musclemass', 'muscle', 'muscle_mass', '筋肉量kg', 'bodymusclemass', 'totalmusclemass', 'skeletalmusclemass', 'smm'] },
  { key: 'fatPct',   label: '体脂肪率',     unit: '%',     digits: 1, dbColumn: 'body_fat_pct',     aliases: ['体脂肪率', 'bodyfat', 'bodyfat%', 'fat%', '体脂肪率%', 'bodyfatpct', 'body_fat_pct', 'bodyfatpercent', 'bodyfatpercentage', 'fatpercent', 'fatpercentage', 'percentbodyfat', 'pbf'] },
  { key: 'bmr',      label: '基礎代謝量',   unit: 'kcal',  digits: 0, dbColumn: 'bmr',              aliases: ['基礎代謝量', '基礎代謝', 'bmr', '基礎代謝量kcal', 'basalmetabolicrate', 'basalmetabolism', 'basalmetabolic'] },
  { key: 'bmi',      label: 'BMI',          unit: 'kg/m²', digits: 1, dbColumn: 'bmi',              aliases: ['bmi', 'bodymassindex'] },
  { key: 'trunk',    label: '体幹',         unit: 'kg',    digits: 1, group: 'part', dbColumn: 'trunk_muscle',     aliases: ['体幹', '体幹筋肉量', '部位別筋肉量体幹', '筋肉量体幹', 'trunk', 'trunkmuscle', 'trunk_muscle', 'trunkmusclemass', 'musclemasstrunk'] },
  { key: 'leftArm',  label: '左腕',         unit: 'kg',    digits: 2, group: 'part', dbColumn: 'left_arm_muscle',  aliases: ['左腕', '左腕筋肉量', '部位別筋肉量左腕', '筋肉量左腕', 'leftarm', 'leftarmmuscle', 'left_arm_muscle', 'leftarmmusclemass', 'musclemassleftarm'] },
  { key: 'rightArm', label: '右腕',         unit: 'kg',    digits: 2, group: 'part', dbColumn: 'right_arm_muscle', aliases: ['右腕', '右腕筋肉量', '部位別筋肉量右腕', '筋肉量右腕', 'rightarm', 'rightarmmuscle', 'right_arm_muscle', 'rightarmmusclemass', 'musclemassrightarm'] },
  { key: 'leftLeg',  label: '左足',         unit: 'kg',    digits: 2, group: 'part', dbColumn: 'left_leg_muscle',  aliases: ['左足', '左脚', '左足筋肉量', '左脚筋肉量', '部位別筋肉量左足', '部位別筋肉量左脚', 'leftleg', 'leftlegmuscle', 'left_leg_muscle', 'leftlegmusclemass', 'musclemassleftleg'] },
  { key: 'rightLeg', label: '右足',         unit: 'kg',    digits: 2, group: 'part', dbColumn: 'right_leg_muscle', aliases: ['右足', '右脚', '右足筋肉量', '右脚筋肉量', '部位別筋肉量右足', '部位別筋肉量右脚', 'rightleg', 'rightlegmuscle', 'right_leg_muscle', 'rightlegmusclemass', 'musclemassrightleg'] },
  { key: 'ffmi',     label: 'FFMI',         unit: '',      digits: 1, dbColumn: 'ffmi',             aliases: ['ffmi', '除脂肪量指数', '除脂肪指数', 'fatfreemassindex'] },
];

export const SWING_METRIC = { key: 'swingSpeed', label: 'スイングスピード', unit: 'km/h', digits: 1 };

export const getMetric = (key) => (key === 'swingSpeed' ? SWING_METRIC : BODY_METRICS.find(m => m.key === key));

const NAME_ALIASES = ['選手名', '名前', '氏名', '選手', 'playername', 'player', 'name', 'athlete', 'athletename', 'batter_name', 'player_name'];
const TEAM_ALIASES = ['チーム名', 'チーム', 'team', 'team_name', 'teamname'];

// Rows such as "チーム平均" / "Average" that some exports append must not become players.
const SUMMARY_ROW_NAMES = ['平均', 'チーム平均', '全体平均', '合計', '全体', 'average', 'avg', 'mean', 'total', 'teamaverage', 'teamavg'];

// Normalise a header: drop BOM, whitespace, bracketed units, separators and case.
export const normalizeHeader = (h) =>
  String(h ?? '')
    .replace(/^\ufeff/, '')
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/[\s\u3000_\-・/／]/g, '')
    .toLowerCase();

export const normalizeName = (n) => String(n ?? '').replace(/[\s\u3000]/g, '');

const isSummaryName = (name) => SUMMARY_ROW_NAMES.includes(normalizeName(name).toLowerCase());

const NORMALIZED_ALIASES = BODY_METRICS.reduce((acc, m) => {
  acc[m.key] = m.aliases.map(normalizeHeader);
  return acc;
}, {});

const findKey = (row, normalizedAliases) => {
  if (!row) return null;
  for (const k of Object.keys(row)) {
    if (normalizedAliases.includes(normalizeHeader(k))) return k;
  }
  return null;
};

export const toNumber = (v) => {
  if (v === null || v === undefined || v === '' || v === '-') return null;
  if (typeof v === 'number') return isNaN(v) ? null : v;
  // Full-width digits / dot / minus -> ASCII, then drop units, thousands separators, "%", etc.
  const s = String(v).replace(/[０-９．－]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/[^-0-9.]/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
};

export const getBodyName = (row) => {
  const k = findKey(row, NAME_ALIASES.map(normalizeHeader));
  const name = k && row[k] !== null && row[k] !== undefined ? String(row[k]).trim() : '';
  return isSummaryName(name) ? '' : name;
};

export const getBodyTeam = (row) => {
  const k = findKey(row, TEAM_ALIASES.map(normalizeHeader));
  return k && row[k] ? String(row[k]).trim() : 'Unknown Team';
};

export const getBodyDate = (row) => {
  const raw = getRawDataValue(row, DEFAULT_DATE_KEYS) || row?.date || row?.game_date || '';
  return raw ? parseAnyDate(raw) : '';
};

// FFMI = 除脂肪量(kg) / 身長(m)^2,  除脂肪量 = 体重 × (1 - 体脂肪率/100)
export const calcFFMI = (height, weight, fatPct) => {
  if (!height || !weight || fatPct === null || fatPct === undefined) return null;
  const m = height / 100;
  if (m <= 0) return null;
  return (weight * (1 - fatPct / 100)) / (m * m);
};

export const extractBodyValues = (row) => {
  const values = {};
  BODY_METRICS.forEach(m => {
    const k = findKey(row, NORMALIZED_ALIASES[m.key]);
    values[m.key] = k ? toNumber(row[k]) : null;
  });
  if (values.bmi === null && values.height && values.weight) {
    values.bmi = values.weight / Math.pow(values.height / 100, 2);
  }
  // FFMI: Always calculate from uploaded measurements (height, weight, body fat %)
  const computedFFMI = calcFFMI(values.height, values.weight, values.fatPct);
  if (computedFFMI !== null) {
    values.ffmi = computedFFMI;
  }
  return values;
};

// Average bat speed per player (normalised name) from batting datasets.
export const buildSwingSpeedMap = (...datasets) => {
  const acc = {};
  datasets.forEach(ds => {
    (ds?.data || []).forEach(row => {
      const name = normalizeName(getBodyName(row));
      if (!name) return;
      const bs = getDataValue(row, BS_KEYS);
      if (!bs || isNaN(bs) || bs <= 0) return;
      if (!acc[name]) acc[name] = { sum: 0, n: 0 };
      acc[name].sum += bs;
      acc[name].n += 1;
    });
  });
  const out = {};
  Object.keys(acc).forEach(k => { out[k] = acc[k].sum / acc[k].n; });
  return out;
};

export const lookupSwingSpeed = (map, name) => map?.[normalizeName(name)] ?? null;

// One record per player = their most recent measurement (falls back to last row when undated).
export const buildPlayerRecords = (rows, swingMap = {}) => {
  const byPlayer = {};
  (rows || []).forEach((row, idx) => {
    const name = getBodyName(row);
    if (!name) return;
    if (!byPlayer[name]) byPlayer[name] = [];
    byPlayer[name].push({ row, idx, date: getBodyDate(row) });
  });

  return Object.keys(byPlayer).map(name => {
    const history = byPlayer[name]
      .sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.idx - b.idx)
      .map(h => ({ date: h.date, team: getBodyTeam(h.row), values: extractBodyValues(h.row) }));
    const latest = history[history.length - 1];
    return {
      name,
      team: latest.team,
      date: latest.date,
      values: latest.values,
      swingSpeed: lookupSwingSpeed(swingMap, name),
      history,
    };
  });
};

export const averageRecords = (records) => {
  const avg = {};
  BODY_METRICS.forEach(m => {
    const vals = records.map(r => r.values[m.key]).filter(v => v !== null && v !== undefined && !isNaN(v));
    avg[m.key] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  });
  const sw = records.map(r => r.swingSpeed).filter(v => v !== null && v !== undefined);
  avg.swingSpeed = sw.length ? sw.reduce((a, b) => a + b, 0) / sw.length : null;
  return avg;
};

export const fmt = (v, digits = 1) => (v === null || v === undefined || isNaN(v) ? '-' : Number(v).toFixed(digits));

export const recordValue = (rec, key) => (key === 'swingSpeed' ? rec.swingSpeed : rec.values?.[key]);

// Body comp CSVs are often exported with a 2-row header
// (row 1: "部位別筋肉量(kg)" spanning, row 2: "体幹,左腕,右腕,左足,右足").
// Merge them so every column ends up with a usable name.
const PART_SUB_HEADERS = ['体幹', '左腕', '右腕', '左足', '右足', '左脚', '右脚', 'trunk', 'leftarm', 'rightarm', 'leftleg', 'rightleg'];

export const mergeTwoRowHeader = (headerCells, subCells) => {
  const isSub = (subCells || []).some(c => PART_SUB_HEADERS.includes(normalizeHeader(c)));
  if (!isSub) return null;
  return headerCells.map((h, i) => {
    const sub = String(subCells[i] || '').trim();
    return sub || String(h || '').trim() || `col${i}`;
  });
};

// Takes CSV text whose header may span two rows and returns CSV text with a single merged header row.
// Text with an ordinary one-row header is returned untouched.
export const applyTwoRowHeader = (csvText) => {
  if (!csvText) return csvText;
  const lines = csvText.split(/\r?\n/);
  if (lines.length < 2) return csvText;
  const headerCells = Papa.parse(lines[0]).data[0] || [];
  const subCells = Papa.parse(lines[1]).data[0] || [];
  const merged = mergeTwoRowHeader(headerCells, subCells);
  if (!merged) return csvText;
  return [Papa.unparse([merged]), ...lines.slice(2)].join('\n');
};

// Reports what the importer understood from a header list so the user can verify a CSV right after loading it.
export const diagnoseBodyCompHeaders = (headers = []) => {
  const list = headers || [];
  const probe = {};
  list.forEach(h => { probe[h] = '1'; });
  const nameKey = findKey(probe, NAME_ALIASES.map(normalizeHeader));
  const teamKey = findKey(probe, TEAM_ALIASES.map(normalizeHeader));
  const isDateHeader = (h) => !!getRawDataValue({ [h]: '1' }, DEFAULT_DATE_KEYS);
  const found = [];
  const missing = [];
  const usedHeaders = new Set();
  BODY_METRICS.forEach(m => {
    const k = findKey(probe, NORMALIZED_ALIASES[m.key]);
    if (k) { found.push(m); usedHeaders.add(k); } else { missing.push(m); }
  });
  if (nameKey) usedHeaders.add(nameKey);
  if (teamKey) usedHeaders.add(teamKey);
  const hasDate = list.some(isDateHeader);
  const ignored = list.filter(h => !usedHeaders.has(h) && !isDateHeader(h) && String(h).trim() !== '');
  return { hasName: !!nameKey, hasTeam: !!teamKey, hasDate, found, missing, ignored };
};


// Maps one uploaded row to the columns of the Supabase `body_comp_data` table.
// Returns null for rows that have no player name (blank / summary rows).
export const toBodyCompDbRow = (row) => {
  const name = getBodyName(row);
  if (!name) return null;
  const values = extractBodyValues(row);
  const team = getBodyTeam(row);
  const date = getBodyDate(row);
  const out = {
    player_name: name,
    team_name: team === 'Unknown Team' ? null : team,
    date: date || null,
  };
  BODY_METRICS.forEach(m => {
    const v = values[m.key];
    if (v !== null && v !== undefined && !isNaN(v)) out[m.dbColumn] = v;
  });
  return out;
};

// Build correlated physical (weight, muscle) x performance (EV, bat speed, pitch velo) milestones
export const buildPhysicalPerformanceMilestones = ({
  playerName,
  history = [],
  savantData,
  blastData,
  combinedData,
  savantPitchingData
}) => {
  const normTarget = normalizeName(playerName).toLowerCase();
  if (!normTarget || !history || history.length === 0) {
    return { milestones: [], hasPerformanceData: false, hasBatting: false, hasPitching: false };
  }

  // 1. Gather batting events
  const battingRows = [
    ...(combinedData?.data || []),
    ...(savantData?.data || []),
    ...(blastData?.data || [])
  ];

  const matchedBatting = battingRows.filter(r => {
    if (!r) return false;
    const ev = getDataValue(r, EV_KEYS);
    const bs = getDataValue(r, BS_KEYS);
    if (ev <= 0 && bs <= 0) return false;

    for (const k of NAME_KEYS) {
      if (r[k] != null && String(r[k]).trim() !== '') {
        if (normalizeName(r[k]).toLowerCase() === normTarget) return true;
      }
    }
    const bName = normalizeName(getBodyName(r)).toLowerCase();
    return bName === normTarget;
  });

  // 2. Gather pitching events
  const pitchingRows = [
    ...(savantPitchingData?.data || []),
    ...(combinedData?.data || []).filter(r => getDataValue(r, PITCH_VELO_KEYS) > 0)
  ];

  const matchedPitching = pitchingRows.filter(r => {
    if (!r) return false;
    const v = getDataValue(r, PITCH_VELO_KEYS);
    if (v <= 0) return false;

    for (const k of PITCHER_NAME_KEYS) {
      if (r[k] != null && String(r[k]).trim() !== '') {
        if (normalizeName(r[k]).toLowerCase() === normTarget) return true;
      }
    }
    const bName = normalizeName(getBodyName(r)).toLowerCase();
    return bName === normTarget;
  });

  // Helper to extract date from any row
  const getRowDateStr = (r) => {
    const raw = getRawDataValue(r, DEFAULT_DATE_KEYS) || r.date || r.game_date || '';
    const parsed = parseAnyDate(raw);
    if (parsed) return parsed.slice(0, 10);
    if (r.file_name || r.filename) {
      const fromFile = parseAnyDate(r.file_name || r.filename);
      if (fromFile) return fromFile.slice(0, 10);
    }
    return '';
  };

  // 3. Group batting by date
  const battingByDate = {};
  matchedBatting.forEach(r => {
    const d = getRowDateStr(r) || 'undated';
    if (!battingByDate[d]) battingByDate[d] = { evs: [], bss: [] };
    const ev = getDataValue(r, EV_KEYS);
    const bs = getDataValue(r, BS_KEYS);
    if (ev > 0) battingByDate[d].evs.push(ev);
    if (bs > 0) battingByDate[d].bss.push(bs);
  });

  // 4. Group pitching by date
  const pitchingByDate = {};
  matchedPitching.forEach(r => {
    const d = getRowDateStr(r) || 'undated';
    if (!pitchingByDate[d]) pitchingByDate[d] = { velos: [] };
    const v = getDataValue(r, PITCH_VELO_KEYS);
    if (v > 0) pitchingByDate[d].velos.push(v);
  });

  const hasBatting = Object.values(battingByDate).some(b => b.evs.length > 0 || b.bss.length > 0);
  const hasPitching = Object.values(pitchingByDate).some(p => p.velos.length > 0);
  const hasPerformanceData = hasBatting || hasPitching;

  const calcPerfStats = (bObj, pObj) => {
    const evs = bObj?.evs || [];
    const bss = bObj?.bss || [];
    const velos = pObj?.velos || [];
    return {
      avgEv: evs.length ? evs.reduce((a, b) => a + b, 0) / evs.length : null,
      maxEv: evs.length ? Math.max(...evs) : null,
      avgBs: bss.length ? bss.reduce((a, b) => a + b, 0) / bss.length : null,
      maxBs: bss.length ? Math.max(...bss) : null,
      avgVelo: velos.length ? velos.reduce((a, b) => a + b, 0) / velos.length : null,
      maxVelo: velos.length ? Math.max(...velos) : null,
      battingCount: (evs.length || bss.length) ? Math.max(evs.length, bss.length) : 0,
      pitchingCount: velos.length
    };
  };

  const perfDates = Array.from(new Set([...Object.keys(battingByDate), ...Object.keys(pitchingByDate)])).filter(d => d !== 'undated');
  const perfStatsByDate = {};
  perfDates.forEach(d => {
    perfStatsByDate[d] = calcPerfStats(battingByDate[d], pitchingByDate[d]);
  });

  // Undated performance aggregation
  const undatedStats = (battingByDate.undated || pitchingByDate.undated)
    ? calcPerfStats(battingByDate.undated, pitchingByDate.undated)
    : null;

  // Days difference helper
  const daysDiff = (d1, d2) => {
    if (!d1 || !d2) return 999999;
    const t1 = new Date(d1).getTime();
    const t2 = new Date(d2).getTime();
    if (isNaN(t1) || isNaN(t2)) return 999999;
    return Math.abs(Math.round((t1 - t2) / (1000 * 60 * 60 * 24)));
  };

  // 5. Match InBody history with performance dates (within 45 days)
  const usedPerfDates = new Set();
  const milestones = history.map((b) => {
    let matchedPerf = null;
    let matchedPerfDate = null;

    if (b.date && perfStatsByDate[b.date]) {
      matchedPerf = perfStatsByDate[b.date];
      matchedPerfDate = b.date;
      usedPerfDates.add(b.date);
    } else if (b.date && perfDates.length > 0) {
      let bestDate = null;
      let minDiff = 46;
      perfDates.forEach(pd => {
        if (usedPerfDates.has(pd)) return;
        const diff = daysDiff(b.date, pd);
        if (diff < minDiff) {
          minDiff = diff;
          bestDate = pd;
        }
      });
      if (bestDate && minDiff <= 45) {
        matchedPerf = perfStatsByDate[bestDate];
        matchedPerfDate = bestDate;
        usedPerfDates.add(bestDate);
      }
    }

    if (!matchedPerf && undatedStats && history.length === 1) {
      matchedPerf = undatedStats;
      matchedPerfDate = b.date;
    }

    return {
      date: b.date,
      perfDate: matchedPerfDate,
      weight: b.weight,
      muscle: b.muscle,
      fatPct: b.fatPct,
      ffmi: b.ffmi,
      height: b.height,
      avgEv: matchedPerf?.avgEv ?? null,
      maxEv: matchedPerf?.maxEv ?? null,
      avgBs: matchedPerf?.avgBs ?? null,
      maxBs: matchedPerf?.maxBs ?? null,
      avgVelo: matchedPerf?.avgVelo ?? null,
      maxVelo: matchedPerf?.maxVelo ?? null,
      battingCount: matchedPerf?.battingCount ?? 0,
      pitchingCount: matchedPerf?.pitchingCount ?? 0,
      hasPerformance: matchedPerf != null
    };
  });

  return {
    milestones,
    hasPerformanceData,
    hasBatting,
    hasPitching
  };
};

// Generates assessment badge, title, description, and styling based on physical and speed deltas
export const getSynergyAssessment = (deltaPhysical, deltaSpeed, physicalLabel = '体重', speedLabel = '打球速度') => {
  if (deltaPhysical === null || deltaPhysical === undefined || deltaSpeed === null || deltaSpeed === undefined || isNaN(deltaPhysical) || isNaN(deltaSpeed)) {
    return {
      badge: '📊 ベースライン記録中',
      title: '初回測定データを記録中',
      desc: '次回以降の測定データを追加すると、1kg増量あたりの速度還元効率と成長判定が自動算出されます。',
      color: 'border-slate-700 bg-slate-900/60 text-slate-300',
      badgeColor: 'bg-slate-700/60 text-slate-200 border-slate-600'
    };
  }

  const pUp = deltaPhysical > 0.3;
  const pFlat = Math.abs(deltaPhysical) <= 0.3;
  const pDown = deltaPhysical < -0.3;

  const sUp = deltaSpeed > 0.5;
  const sFlat = Math.abs(deltaSpeed) <= 0.5;
  const sDown = deltaSpeed < -0.5;

  if (pUp && sUp) {
    const eff = deltaSpeed / deltaPhysical;
    if (eff >= 1.5) {
      return {
        badge: '🔥 超高効率パワーアップ',
        title: '理想的な増量・速度還元',
        desc: `${physicalLabel}の増加 (+${deltaPhysical.toFixed(1)}kg) に伴い、${speedLabel}が +${deltaSpeed.toFixed(1)}km/h (1kg増あたり+${eff.toFixed(2)}km/h) と大幅に向上しています！身体の強化が出力向上に直結しています。`,
        color: 'border-emerald-500/40 bg-emerald-950/20 text-emerald-200',
        badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
      };
    }
    return {
      badge: '📈 順調なフィジカル還元',
      title: '増量に伴う出力向上',
      desc: `${physicalLabel}の増加 (+${deltaPhysical.toFixed(1)}kg) に伴い、${speedLabel}も +${deltaSpeed.toFixed(1)}km/h 向上中。フィジカル強化が良い形でパフォーマンスに還元されています。`,
      color: 'border-emerald-500/40 bg-emerald-950/20 text-emerald-200',
      badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
    };
  }

  if (pFlat && sUp) {
    return {
      badge: '⚡️ スピード先行向上',
      title: '技術・キレ主導の進化',
      desc: `${physicalLabel}を維持しながら、${speedLabel}が +${deltaSpeed.toFixed(1)}km/h 向上。フォームの最適化やキレの向上が見られます。`,
      color: 'border-cyan-500/40 bg-cyan-950/20 text-cyan-200',
      badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
    };
  }

  if (pDown && sUp) {
    return {
      badge: '🚀 絞り込みによるスピードUP',
      title: '軽量化とキレの向上',
      desc: `除脂肪・減量 (${deltaPhysical.toFixed(1)}kg) に伴い、身体のキレが上がり${speedLabel}が +${deltaSpeed.toFixed(1)}km/h 伸びています。`,
      color: 'border-blue-500/40 bg-blue-950/20 text-blue-200',
      badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/40'
    };
  }

  if (pUp && sFlat) {
    return {
      badge: '⚖️ 増量適応フェーズ',
      title: 'フィジカル先行・出力適応待ち',
      desc: `${physicalLabel}は +${deltaPhysical.toFixed(1)}kg 順調に増加。新しくついた筋量・体重をスイングや投球動作に連動させる適応フェーズです。`,
      color: 'border-amber-500/40 bg-amber-950/20 text-amber-200',
      badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/40'
    };
  }

  if (pUp && sDown) {
    return {
      badge: '⚠️ 増量先行・キレ調整推奨',
      title: '重さ先行の可能性',
      desc: `${physicalLabel}が増加する一方、${speedLabel}に一時的な低下 (${deltaSpeed.toFixed(1)}km/h) が見られます。重さに負けない俊敏性やキレのトレーニング、フォームの再確認が推奨されます。`,
      color: 'border-rose-500/40 bg-rose-950/20 text-rose-200',
      badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/40'
    };
  }

  if (pDown && sDown) {
    return {
      badge: '📉 コンディション低下注意',
      title: '筋量・出力の低下傾向',
      desc: `${physicalLabel}の減少 (${deltaPhysical.toFixed(1)}kg) とともに${speedLabel}も低下しています (${deltaSpeed.toFixed(1)}km/h)。エネルギー補給や疲労回復、筋量維持のケアが必要です。`,
      color: 'border-rose-500/40 bg-rose-950/20 text-rose-200',
      badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/40'
    };
  }

  return {
    badge: '📊 安定推移',
    title: '現状維持',
    desc: `${physicalLabel}・${speedLabel}ともに大きな変動なく安定して推移しています。`,
    color: 'border-slate-700 bg-slate-900/60 text-slate-300',
    badgeColor: 'bg-slate-700/60 text-slate-200 border-slate-600'
  };
};

