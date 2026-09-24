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

export const toAsciiNumbers = (str) => {
  if (str == null) return '';
  return String(str)
    .replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xfee0))
    .replace(/．/g, '.')
    .replace(/－/g, '-');
};

export const parseNumeric = (val) => {
  if (val === null || val === undefined || val === '') return NaN;
  if (typeof val === 'number') return val;
  const ascii = toAsciiNumbers(val);
  const cleaned = String(ascii).replace(/[^0-9.-]/g, '');
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

export const BS_KEYS = [
  'バット速度', 'バットスピード', 'スイング速度', 'スイングスピード', 'バットスピー', 'スイング',
  'bat_speed', 'BatSpeed', 'Bat Speed', 'Bat_Speed', 'Bat Speed (mph)', 'Bat Speed (km/h)',
  'BatSpeed (km/h)', 'BatSpeed (mph)', 'バット速度(km/h)', 'バット速度（km/h）', 'スイング速度(km/h)'
];

export const PLANE_KEYS = ['on_plane_efficiency', 'OnPlaneEfficiency', 'オンプレーン効率', 'オンプレーン%', 'オンプレーン', 'On Plane Efficiency (%)'];
export const CONN_KEYS = ['connection_score', 'ConnectionScore', 'コネクション', '体とバットの'];
export const ROT_KEYS = ['rotation_score', 'RotationScore', 'ローテーション', '体の回転によ', '体の回転による加速スコア'];
export const TIME_KEYS = ['time_to_contact', 'TimeToContact', 'スイング時間', 'Time to Contact (sec)'];

export const EV_KEYS = [
  '打球速度', '打球初速', '打球スピード', '打球速', '打球', 
  'ExitVelocity', 'Exit Velocity', 'launch_speed', 'exit_velocity', 
  'Exit Speed', 'ExitSpeed', 'Ball Speed', 'BallSpeed', 
  'Exit Velocity (mph)', 'Exit Velocity (km/h)', 'Exit Speed (mph)', 'Exit Speed (km/h)',
  'BallSpeed (km/h)', 'Ball Speed (km/h)', 'BallSpeed (mph)', 'Ball Speed (mph)',
  '打球速度(km/h)', '打球速度（km/h）', '打球速度 [km/h]', '打球速度(mph)', '打球速度（mph）',
  '打球初速(km/h)', '打球初速（km/h）', '初速', 'ExitVelo', 'exit_velo', 'Exit Velo', 'EV'
];

export const LA_KEYS = [
  '打球角度', '角度', '打球角', '打ち出し角', '打ち出し角度',
  'LaunchAngle', 'Launch Angle', 'launch_angle', 'Launch Angle (deg)', 'LaunchAngle (deg)',
  '打球角度(°)', '打球角度（°）', 'LA'
];

export const DIST_KEYS = ['Distance', 'hit_distance_sc', 'distance', '飛距離', '推定飛距離'];
export const ROTATION_ACCEL_KEYS = ['rotation_acceleration', 'Rotation Acceleration', '回転加速', '体の回転による'];

export const AA_KEYS = [
  'アッパースイング度', 'アタックアングル', 'アッパー', 'アッパースイング', 'アッパースイング角度', 'アッパー角度',
  'attack_angle', 'Attack Angle', 'AttackAngle', 'Attack Angle (deg)', 'アタックアングル(°)', 'アタックアングル（°）', 'AA'
];

export const PITCH_VELO_KEYS = ['PitchBallVelo', 'release_speed', 'pitch_velocity', '球速', '球速（投球）', '投球速度', 'Pitch Speed', 'PitchSpeed', 'Velo', 'Speed'];
export const HS_KEYS = ['peak_hand_speed', 'PeakHandSpeed', '手の最大速度', '手の最大スピード', 'Hand Speed'];
export const ON_PLANE_SCORE_KEYS = ['on_plane_score', 'OnPlaneScore', 'オンプレーンスコア', 'オンプレーンのスコア'];
export const GRADE_KEYS = ['grade', 'Grade', '学年', '年次', '学年・年次'];
export const NAME_KEYS = ['player_name', 'Player Name', 'Player', 'PlayerName', '選手名', '氏名', '名前', '名前・氏名', 'batter_name'];

// Pitcher Specific Keys (Prioritizing trajectory for VB and HB as requested)
export const VB_TRAJ_KEYS = ['VB (trajectory)', 'VB(trajectory)', 'vbreak_traj', 'traj_vb', 'VB', 'vbreak', 'VerticalBreak', '縦変化量', '縦変化量(cm)', 'iVB'];
export const HB_TRAJ_KEYS = ['HB (trajectory)', 'HB(trajectory)', 'hbreak_traj', 'traj_hb', 'HB', 'hbreak', 'HorizontalBreak', '横変化量', '横変化量(cm)'];
export const SPIN_RATE_KEYS = ['Spin Rate', 'SpinRate', 'spin_rate', 'release_spin_rate', '回転数', '回転数(rpm)', 'Spin'];
export const SPIN_AXIS_KEYS = ['Spin Direction', 'SpinDirection', 'spin_direction', 'Spin Axis', 'SpinAxis', 'spin_axis', '回転軸', '回転方向', 'Axis', 'True Spin Axis', '回転軸(時:分)'];
export const SPIN_EFFICIENCY_KEYS = ['Spin Efficiency', 'SpinEfficiency', 'spin_efficiency', '回転効率', '回転効率(%)', 'Spin Efficiency (%)', 'True Spin %', 'Efficiency', 'EFF'];
export const GYRO_ANGLE_KEYS = ['Gyro Angle', 'GyroAngle', 'gyro_angle', 'ジャイロ角度', 'ジャイロ角', 'Gyro Angle (deg)', 'Gyro'];
export const VAA_KEYS = ['VAA', 'VerticalApproachAngle', 'vertical_approach_angle', 'VAA (deg)', '垂直アプローチ角度', '垂直アプローチ角', 'アプローチ角度'];
export const PITCH_TYPE_KEYS = ['Pitch Type', 'PitchType', 'pitch_type', 'pitch_name', '球種', 'Pitch', 'Type'];
export const RELEASE_HEIGHT_KEYS = ['Release Height', 'ReleaseHeight', 'release_pos_z', 'リリース高度', 'リリース高', 'Release Height (m)', 'Release Height (ft)'];
export const RELEASE_SIDE_KEYS = ['Release Side', 'ReleaseSide', 'release_pos_x', 'リリース横', 'リリース幅', 'Release Side (m)', 'Release Side (ft)'];
export const PITCHER_NAME_KEYS = ['pitcher_name', 'Pitcher Name', 'Pitcher', 'PitcherName', '投手名', '投手', 'player_name', 'Player Name', 'Player'];
export const PITCHER_THROWS_KEYS = ['p_throws', 'PitcherThrows', 'Throws', 'pitcher_hand', 'PitcherHand', '投球アーム', '利き腕', '投球腕', 'Pitcher Hand', 'Hand', 'Arm', '投手利き腕'];

export const getPitcherHand = (rowOrEvents) => {
  const events = Array.isArray(rowOrEvents) ? rowOrEvents : [rowOrEvents];
  for (const row of events) {
    if (!row) continue;
    for (const k of PITCHER_THROWS_KEYS) {
      if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') {
        const v = String(row[k]).trim().toUpperCase();
        if (v === 'R' || v === 'RIGHT' || v === '右' || v.includes('右')) return 'R';
        if (v === 'L' || v === 'LEFT' || v === '左' || v.includes('左')) return 'L';
      }
    }
  }
  return 'R';
};

// Raw string value extractor that does NOT strip colons (useful for clock strings like "0:38" or "12:15")
export const getRawDataValue = (row, keyOrKeys) => {
  if (!row) return null;
  const targetKeys = Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys];
  
  for (const k of targetKeys) {
    if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') {
      return String(row[k]).trim();
    }
  }

  const rowKeys = Object.keys(row);
  for (const k of targetKeys) {
    const lowerK = k.toLowerCase();
    const foundKey = rowKeys.find(ak => ak.toLowerCase() === lowerK || ak.toLowerCase().includes(lowerK));
    if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null && String(row[foundKey]).trim() !== '') {
      return String(row[foundKey]).trim();
    }
  }

  return null;
};

export function getSpinDirectionClock(spinAxis) {
  if (spinAxis === null || spinAxis === undefined || spinAxis === '') return '-';
  const strVal = String(spinAxis).trim();
  if (!strVal || strVal === '-') return '-';

  // 1. If it's already a clock string like "0:38", "12:15", "1:30"
  if (strVal.includes(':')) {
    const parts = strVal.split(':');
    let hour = parseInt(parts[0], 10);
    const minute = (parts[1] || '00').padStart(2, '0');
    if (isNaN(hour)) return strVal;
    if (hour === 0) hour = 12; // Rapsodo 0:38 -> convert to 12:38 12-hour clock
    return `${hour}:${minute}`;
  }

  // 2. If it's a numeric degree (e.g. 45° -> 1:30, 180° -> 6:00, 330° -> 11:00)
  let num = Number(strVal);
  if (isNaN(num)) return strVal;

  // Normalize angle to [0, 360)
  // Standard Rapsodo/Trackman clock angle: 0° = 12:00, 90° = 3:00, 180° = 6:00, 270° = 9:00
  num = ((num % 360) + 360) % 360;

  let hour = Math.floor((num / 30) % 12);
  if (hour === 0) hour = 12;

  let minute = Math.round(((num % 30) / 30) * 60);
  if (minute === 60) {
    minute = 0;
    hour = hour === 12 ? 1 : hour + 1;
  }

  const minuteStr = String(minute).padStart(2, '0');
  return `${hour}:${minuteStr}`;
}


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

export const extractRowVal = (row, keys) => {
  if (!row) return null;
  const keyList = Array.isArray(keys) ? keys : [keys];
  for (const k of keyList) {
    if (row[k] != null && row[k] !== '' && row[k] !== '-') {
      if (typeof row[k] === 'number') return row[k];
      const ascii = toAsciiNumbers(row[k]);
      const num = parseFloat(ascii.replace(/[^-0-9.]/g, ''));
      if (!isNaN(num)) return num;
    }
  }
  return null;
};

export const getDataValue = (row, keyOrKeys) => {
  if (!row) return 0;
  const targetKeys = Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys];
  
  // 1. Try exact match first (also stripping BOM)
  const rowKeys = Object.keys(row);
  for (const k of targetKeys) {
    // Check direct key
    if (row[k] !== undefined && row[k] !== null && row[k] !== '') {
      if (typeof row[k] === 'number') return row[k];
      const ascii = toAsciiNumbers(row[k]);
      const val = parseFloat(ascii.replace(/[^-0-9.]/g, ''));
      if (!isNaN(val)) return val;
    }
    // Check BOM key match (e.g. \ufeff打球速度)
    const bomKey = rowKeys.find(ak => ak.replace(/^\ufeff/, '').trim() === k);
    if (bomKey && row[bomKey] !== undefined && row[bomKey] !== null && row[bomKey] !== '') {
      if (typeof row[bomKey] === 'number') return row[bomKey];
      const ascii = toAsciiNumbers(row[bomKey]);
      const val = parseFloat(ascii.replace(/[^-0-9.]/g, ''));
      if (!isNaN(val)) return val;
    }
  }

  // 2. Case-insensitive / fuzzy match for header variations
  for (const k of targetKeys) {
    const lowerK = k.toLowerCase().trim();
    
    // Prevent short acronyms (<=2 chars like "EV", "LA", "AA") from falsely matching words like "events"
    const foundKey = rowKeys.find(ak => {
      const lowerAk = ak.replace(/^\ufeff/, '').toLowerCase().trim();
      if (lowerK.length <= 2) {
        return lowerAk === lowerK;
      }
      return lowerAk === lowerK || lowerAk.startsWith(lowerK) || lowerAk.includes(lowerK);
    });

    if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null && row[foundKey] !== '') {
      if (typeof row[foundKey] === 'number') return row[foundKey];
      const ascii = toAsciiNumbers(row[foundKey]);
      const val = parseFloat(ascii.replace(/[^-0-9.]/g, ''));
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
    if (val !== null && val !== undefined && !isNaN(val) && val !== 0) {
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
