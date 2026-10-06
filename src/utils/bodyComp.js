// Body composition (体組成) helpers
// Column matching here is EXACT (after normalisation) on purpose: the generic fuzzy
// matcher in dataHelpers would confuse e.g. "筋肉量" with "左腕筋肉量".
// Aliases cover Japanese headers, English headers and the snake_case column names
// used by the Supabase `body_comp_data` table (so cloud rows round-trip).
import Papa from 'papaparse';
import { getDataValue, BS_KEYS, parseAnyDate, getRawDataValue, DEFAULT_DATE_KEYS } from './dataHelpers';

export const BODY_METRICS = [
  { key: 'height',   label: '身長',         unit: 'cm',    digits: 1, dbColumn: 'height',           aliases: ['身長', 'height', '身長cm', 'heightcm', 'bodyheight', 'stature'] },
  { key: 'weight',   label: '体重',         unit: 'kg',    digits: 1, dbColumn: 'weight',           aliases: ['体重', 'weight', '体重kg', 'weightkg', 'bodyweight', 'bodymass'] },
  { key: 'muscle',   label: '筋肉量',       unit: 'kg',    digits: 1, dbColumn: 'muscle_mass',      aliases: ['筋肉量', '全身筋肉量', '骨格筋量', '骨格筋肉量', 'musclemass', 'muscle', '筋肉量kg', 'bodymusclemass', 'totalmusclemass', 'skeletalmusclemass', 'smm'] },
  { key: 'fatPct',   label: '体脂肪率',     unit: '%',     digits: 1, dbColumn: 'body_fat_pct',     aliases: ['体脂肪率', 'bodyfat', 'bodyfat%', 'fat%', '体脂肪率%', 'bodyfatpct', 'bodyfatpercent', 'bodyfatpercentage', 'fatpercent', 'fatpercentage', 'percentbodyfat', 'pbf'] },
  { key: 'bmr',      label: '基礎代謝量',   unit: 'kcal',  digits: 0, dbColumn: 'bmr',              aliases: ['基礎代謝量', '基礎代謝', 'bmr', '基礎代謝量kcal', 'basalmetabolicrate', 'basalmetabolism', 'basalmetabolic'] },
  { key: 'bmi',      label: 'BMI',          unit: 'kg/m²', digits: 1, dbColumn: 'bmi',              aliases: ['bmi', 'bodymassindex'] },
  { key: 'trunk',    label: '体幹',         unit: 'kg',    digits: 1, group: 'part', dbColumn: 'trunk_muscle',     aliases: ['体幹', '体幹筋肉量', '部位別筋肉量体幹', '筋肉量体幹', 'trunk', 'trunkmuscle', 'trunkmusclemass', 'musclemasstrunk'] },
  { key: 'leftArm',  label: '左腕',         unit: 'kg',    digits: 2, group: 'part', dbColumn: 'left_arm_muscle',  aliases: ['左腕', '左腕筋肉量', '部位別筋肉量左腕', '筋肉量左腕', 'leftarm', 'leftarmmuscle', 'leftarmmusclemass', 'musclemassleftarm'] },
  { key: 'rightArm', label: '右腕',         unit: 'kg',    digits: 2, group: 'part', dbColumn: 'right_arm_muscle', aliases: ['右腕', '右腕筋肉量', '部位別筋肉量右腕', '筋肉量右腕', 'rightarm', 'rightarmmuscle', 'rightarmmusclemass', 'musclemassrightarm'] },
  { key: 'leftLeg',  label: '左足',         unit: 'kg',    digits: 2, group: 'part', dbColumn: 'left_leg_muscle',  aliases: ['左足', '左脚', '左足筋肉量', '左脚筋肉量', '部位別筋肉量左足', '部位別筋肉量左脚', 'leftleg', 'leftlegmuscle', 'leftlegmusclemass', 'musclemassleftleg'] },
  { key: 'rightLeg', label: '右足',         unit: 'kg',    digits: 2, group: 'part', dbColumn: 'right_leg_muscle', aliases: ['右足', '右脚', '右足筋肉量', '右脚筋肉量', '部位別筋肉量右足', '部位別筋肉量右脚', 'rightleg', 'rightlegmuscle', 'rightlegmusclemass', 'musclemassrightleg'] },
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
