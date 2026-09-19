// Helper to extract unique teams from Savant data
export const extractTeams = (savantData) => {
  if (!savantData) return [];
  const teams = new Set();
  savantData.forEach(row => {
    if (row.home_team) teams.add(row.home_team);
    if (row.away_team) teams.add(row.away_team);
  });
  return Array.from(teams).sort();
};

// Helper to extract players belonging to a specific team
export const extractPlayersByTeam = (savantData, team, nameKey = 'player_name') => {
  if (!savantData || !team) return [];
  const players = new Set();
  
  savantData.forEach(row => {
    // If inning is Top, batter is Away team. If Bot, batter is Home team.
    const batterTeam = row.inning_topbot === 'Top' ? row.away_team : row.home_team;
    if (batterTeam === team && row[nameKey]) {
      players.add(String(row[nameKey])); // Store as string for consistent comparison
    }
  });
  
  return Array.from(players).sort();
};

// Helper to get stats for a specific player
export const getPlayerStats = (savantData, blastData, playerName, nameKey = 'player_name') => {
  // Use fuzzy equality (==) or String conversion to handle cases where ID is parsed as number
  const savantEvents = savantData ? savantData.filter(row => String(row[nameKey]) === String(playerName)) : [];
  
  // Blast data doesn't explicitly have the same "player_name" column if it's named differently,
  // but let's assume either the filename matches or there's a name column. 
  // Blast CSV usually has "Player" or it might just be the whole file for one player.
  // The user said "それ以外のバット起動の数値はブラストで", we will assume the uploaded Blast data 
  // corresponds to the selected player if there is no explicit Player column in Blast, 
  // or we just use all Blast data assuming they upload per-player, or we filter if a column exists.
  // Looking at Blast headers: "日付", "バット", etc., there is no "選手名". So Blast data is likely per-player.
  const blastEvents = blastData || [];

  return {
    savantEvents,
    blastEvents
  };
};

export const parseNumeric = (val) => {
  if (val === null || val === undefined || val === '') return NaN;
  if (typeof val === 'number') return val;
  // Handle strings with units like "100.5 mph"
  const cleaned = String(val).replace(/[^0-9.-]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
};

export const isBarrel = (ev, la) => {
  if (isNaN(ev) || isNaN(la) || ev < 98) return false;
  // Statcast Barrel definition: 98mph -> 26-30 deg. 
  // Range expands 1 degree each way for every 1 mph increase.
  const lower = 26 - (ev - 98);
  const upper = 30 + (ev - 98);
  return la >= lower && la <= upper;
};

export const isHit = (event) => {
  if (!event) return false;
  const hits = ['single', 'double', 'triple', 'home_run'];
  return hits.includes(event.toLowerCase());
};

export const calculateStats = (events) => {
  if (!events || events.length === 0) return { ba: 0, slg: 0, totalBases: 0, ab: 0 };
  
  // Filter for events that count as an At-Bat
  // This is a simplification, but covers the basics
  const abEvents = events.filter(e => {
    const ev = e.events ? e.events.toLowerCase() : '';
    return ev && !['walk', 'hit_by_pitch', 'intent_walk', 'sac_fly', 'sac_bunt', 'catcher_interf'].includes(ev);
  });
  
  if (abEvents.length === 0) return { ba: 0, slg: 0, totalBases: 0, ab: 0 };
  
  const hitsCount = abEvents.filter(e => isHit(e.events)).length;
  const ba = (hitsCount / abEvents.length);
  
  const totalBases = abEvents.reduce((acc, e) => {
    const ev = e.events ? e.events.toLowerCase() : '';
    if (ev === 'single') return acc + 1;
    if (ev === 'double') return acc + 2;
    if (ev === 'triple') return acc + 3;
    if (ev === 'home_run') return acc + 4;
    return acc;
  }, 0);
  
  const slg = (totalBases / abEvents.length);
  
  return { ba, slg, totalBases, ab: abEvents.length };
};

export const BS_KEYS = ['bat_speed', 'BatSpeed', 'バットスピード', 'バット速度', 'バットスピー', 'スイング速度', 'スイングスピード', 'Bat Speed (mph)', 'スイング'];
export const PLANE_KEYS = ['on_plane_efficiency', 'OnPlaneEfficiency', 'オンプレーン効率', 'オンプレーン%', 'オンプレーン', 'On Plane Efficiency (%)'];
export const CONN_KEYS = ['connection_score', 'ConnectionScore', 'コネクション', '体とバットの'];
export const ROT_KEYS = ['rotation_score', 'RotationScore', 'ローテーション', '体の回転によ', '体の回転による加速スコア'];
export const TIME_KEYS = ['time_to_contact', 'TimeToContact', 'スイング時間', 'Time to Contact (sec)'];
export const EV_KEYS = ['ExitVelocity', 'launch_speed', 'exit_velocity', 'EV', '打球速度', '打球スピード', '打球速', '打球'];
export const LA_KEYS = ['LaunchAngle', 'launch_angle', 'LA', '打球角度', '角度'];
export const DIST_KEYS = ['Distance', 'hit_distance_sc', 'distance', '飛距離', '推定飛距離'];
export const ROTATION_ACCEL_KEYS = ['rotation_acceleration', 'Rotation Acceleration', '回転加速', '体の回転による'];
export const AA_KEYS = ['attack_angle', 'アタックアングル', 'AttackAngle', 'AA', 'アッパースイング度', 'アッパー', 'アッパースイング', 'アッパースイング角度', 'アッパー角度'];
export const PITCH_VELO_KEYS = ['PitchBallVelo', 'release_speed', 'pitch_velocity', '球速'];
export const HS_KEYS = ['peak_hand_speed', 'PeakHandSpeed', '手の最大速度', '手の最大スピード', 'Hand Speed'];
export const ON_PLANE_SCORE_KEYS = ['on_plane_score', 'OnPlaneScore', 'オンプレーンスコア', 'オンプレーンのスコア'];
export const GRADE_KEYS = ['grade', 'Grade', '学年', '年次', '学年・年次'];
export const NAME_KEYS = ['player_name', 'Player Name', 'Player', 'PlayerName', '選手名', '氏名', '名前', '名前・氏名', 'batter_name'];

export const getPlayerGrade = (events) => {
  if (!events || events.length === 0) return '';
  for (let i = 0; i < events.length; i++) {
    const row = events[i];
    if (!row) continue;
    const val = row['学年'] || row['grade'] || row['Grade'] || row['年次'] || row['学年・年次'];
    if (val !== undefined && val !== null && val !== '') return String(val);
  }
  return '';
};

// Cache for fuzzy key resolutions to avoid Object.keys() on every row
const keyResolutionCache = new Map();

export const clearKeyResolutionCache = () => {
  keyResolutionCache.clear();
};

export const getDataValue = (row, keyOrKeys) => {
  if (!row) return 0;
  const targetKeys = Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys];
  
  // 1. Try direct match first (Rapsodo case-sensitive headers)
  for (const k of targetKeys) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== '') {
      if (typeof row[k] === 'number') return row[k];
      const val = parseFloat(String(row[k]).replace(/[^-0-9.]/g, ''));
      if (!isNaN(val)) return val;
    }
  }

  // 2. Fuzzy match for truncated headers (Excel exports like 'SerialNumbe')
  for (const k of targetKeys) {
    const rowKeys = Object.keys(row);
    const schemaSignature = rowKeys[0] || '';
    const cacheKey = `${schemaSignature}:${k}`;
    
    let actualKey = keyResolutionCache.get(cacheKey);
    if (actualKey === undefined) {
      const lowerK = k.toLowerCase();
      actualKey = rowKeys.find(ak => ak.toLowerCase().startsWith(lowerK)) || null;
      keyResolutionCache.set(cacheKey, actualKey);
    }
    
    if (actualKey && row[actualKey] !== undefined && row[actualKey] !== null && row[actualKey] !== '') {
      if (typeof row[actualKey] === 'number') return row[actualKey];
      const val = parseFloat(String(row[actualKey]).replace(/[^-0-9.]/g, ''));
      if (!isNaN(val)) return val;
    }
  }
  
  return 0;
};

export const calculateAverages = (events, keys) => {
  if (!events || events.length === 0) return 0;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < events.length; i++) {
    const val = getDataValue(events[i], keys);
    if (val !== null && val !== undefined && !isNaN(val)) {
      sum += val;
      count++;
    }
  }
  return count > 0 ? (sum / count) : 0;
};

export const calculateMax = (events, keys) => {
  if (!events || events.length === 0) return 0;
  let max = 0;
  for (let i = 0; i < events.length; i++) {
    const val = getDataValue(events[i], keys);
    if (!isNaN(val) && val > max) {
      max = val;
    }
  }
  return max;
};

// Group events by team and then by player for O(N) lookup
export const groupEventsByTeamAndPlayer = (data, teamKey = 'team_name', nameKey = 'player_name') => {
  if (!data || !Array.isArray(data)) return {};
  
  const groups = {};
  const nameFallbacks = ['選手名', '名前', 'player_name', 'Player Name', 'Player', 'PlayerName', '氏名', 'batter_name', 'pitcher_name'];
  const teamFallbacks = ['チーム名', 'チーム', 'Team', 'team_name'];

  data.forEach(row => {
    // Determine Team — try supplied key, then fallback list
    let tName = row[teamKey];
    if (!tName || tName.toString().trim() === '' || tName === 'null' || tName === 'undefined') {
      const foundTeamKey = teamFallbacks.find(k => k !== teamKey && row[k] !== undefined && row[k] !== null && row[k].toString().trim() !== '');
      tName = foundTeamKey ? row[foundTeamKey] : 'Unknown Team';
    }
    tName = tName.toString().trim();
    if (tName === '' || tName === 'null' || tName === 'undefined') tName = 'Unknown Team';
    
    // Determine Player Name with robust fallback
    let pName = row[nameKey];
    if (!pName || pName.toString().trim() === '') {
      const foundKey = nameFallbacks.find(k => row[k] !== undefined && row[k] !== null && row[k].toString().trim() !== '');
      pName = foundKey ? row[foundKey] : 'Unknown Player';
    }
    pName = pName.toString().trim();

    if (!groups[tName]) groups[tName] = {};
    if (!groups[tName][pName]) groups[tName][pName] = [];
    groups[tName][pName].push(row);
  });
  
  return groups;
};
