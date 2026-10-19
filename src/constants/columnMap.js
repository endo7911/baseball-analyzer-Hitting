/**
 * Supabase テーブルスキーマに対応する許可カラム定義および CSV カラム名マッピング辞書
 */

export const SAVANT_COLUMNS = [
  'game_date', 'pitcher_name', 'batter_name', 'pitch_name', 'release_speed', 'release_spin_rate', 
  'launch_speed', 'launch_angle', 'bat_speed', 'attack_angle', 'hit_distance_sc', 'events', 'description', 'zone', 'stand', 
  'p_throws', 'home_team', 'away_team', 'type', 'hit_location', 'bb_type', 'balls', 'strikes', 
  'game_year', 'pfx_x', 'pfx_z', 'plate_x', 'plate_z', 'on_3b', 'on_2b', 'on_1b', 
  'outs_when_up', 'inning', 'inning_topbot', 'hc_x', 'hc_y', 'vx0', 'vy0', 'vz0', 
  'ax', 'ay', 'az', 'sz_top', 'sz_bot', 'effective_speed', 'release_extension', 
  'game_pk', 'spin_axis', 'delta_home_win_exp', 'delta_run_exp', 'file_name', 'upload_id', 'user_id', 'team_id', 'team_name',
  'pitch_type', 'release_pos_x', 'release_pos_y', 'release_pos_z', 'vaa', 'haa',
  'attack_direction', 'estimated_woba_using_speedangle', 'pitcher', 'batter', 'swing_length'
];

export const BLAST_COLUMNS = [
  'date', 'player_name', 'batter_name', 'bat_speed', 'attack_angle', 'vertical_bat_angle', 'power', 
  'time_to_contact', 'peak_hand_speed', 'on_plane_efficiency', 'rotation_score', 
  'on_plane_score', 'connection_score', 'rotation_acceleration', 'connection_at_impact', 
  'connection_at_address', 'bat_angle', 'file_name', 'upload_id', 'user_id', 'team_id', 'team_name',
  'launch_speed', 'launch_angle', 'hit_distance_sc'
];

export const COMBINED_COLUMNS = [
  'date', 'game_date', 'player_name', 'batter_name', 'team_name', 'grade',
  'bat_speed', 'launch_speed', 'attack_angle', 'launch_angle', 'hit_distance_sc',
  'hc_x', 'on_plane_efficiency', 'connection_score', 'rotation_score',
  'time_to_contact', 'peak_hand_speed', 'power', 'vertical_bat_angle',
  'release_speed', 'file_name', 'upload_id', 'user_id', 'team_id',
  'on_plane_score', 'rotation_acceleration', 'connection_at_impact', 'connection_at_address', 'bat_angle'
];

export const PITCHING_COLUMNS = [
  'date', 'game_date', 'pitcher_name', 'player_name', 'team_name',
  'pitch_type', 'pitch_name', 'release_speed', 'release_spin_rate',
  'spin_axis', 'spin_efficiency', 'gyro_angle', 'vb_traj', 'hb_traj',
  'release_pos_x', 'release_pos_z', 'vaa', 'p_throws',
  'file_name', 'upload_id', 'user_id', 'team_id'
];

export const BODY_COMP_COLUMNS = [
  'date', 'player_name', 'team_name', 'height', 'weight', 'muscle_mass',
  'body_fat_pct', 'bmr', 'bmi', 'trunk_muscle', 'left_arm_muscle',
  'right_arm_muscle', 'left_leg_muscle', 'right_leg_muscle', 'ffmi',
  'file_name', 'upload_id', 'user_id', 'team_id'
];

// Mapping for Japanese/Rapsodo/Blast keys to DB columns
export const COLUMN_MAP = {
  // 選手名 / 投手名
  '選手名': 'player_name',
  'Player Name': 'player_name',
  'Player': 'player_name',
  'PlayerName': 'player_name',
  'Athlete': 'player_name',
  'Athlete Name': 'player_name',
  'User': 'player_name',
  'User Name': 'player_name',
  'batter_name': 'player_name',
  '氏名': 'player_name',
  '名前': 'player_name',
  '投手名': 'pitcher_name',
  'Pitcher Name': 'pitcher_name',
  'Pitcher': 'pitcher_name',
  'PitcherName': 'pitcher_name',
  'pitcher_name': 'pitcher_name',
  // 体組成 (Body Composition)
  '身長': 'height', 'Height': 'height', 'height': 'height',
  '体重': 'weight', 'Weight': 'weight', 'weight': 'weight',
  '筋肉量': 'muscle_mass', '全身筋肉量': 'muscle_mass', '骨格筋量': 'muscle_mass', 'Muscle Mass': 'muscle_mass', 'muscle_mass': 'muscle_mass', 'SMM': 'muscle_mass',
  '体脂肪率': 'body_fat_pct', 'Body Fat': 'body_fat_pct', 'body_fat_pct': 'body_fat_pct', 'PBF': 'body_fat_pct',
  '基礎代謝量': 'bmr', '基礎代謝': 'bmr', 'BMR': 'bmr', 'bmr': 'bmr',
  'BMI': 'bmi', 'bmi': 'bmi',
  '体幹': 'trunk_muscle', '体幹筋肉量': 'trunk_muscle', 'Trunk': 'trunk_muscle', 'trunk_muscle': 'trunk_muscle',
  '左腕': 'left_arm_muscle', '左腕筋肉量': 'left_arm_muscle', 'Left Arm': 'left_arm_muscle', 'left_arm_muscle': 'left_arm_muscle',
  '右腕': 'right_arm_muscle', '右腕筋肉量': 'right_arm_muscle', 'Right Arm': 'right_arm_muscle', 'right_arm_muscle': 'right_arm_muscle',
  '左足': 'left_leg_muscle', '左脚': 'left_leg_muscle', 'Left Leg': 'left_leg_muscle', 'left_leg_muscle': 'left_leg_muscle',
  '右足': 'right_leg_muscle', '右脚': 'right_leg_muscle', 'Right Leg': 'right_leg_muscle', 'right_leg_muscle': 'right_leg_muscle',
  'FFMI': 'ffmi', 'ffmi': 'ffmi',
  // 学年
  '学年': 'grade',
  'grade': 'grade',
  'Grade': 'grade',
  '年次': 'grade',
  '学年・年次': 'grade',
  // バットスピード
  'バットスピード': 'bat_speed',
  'スイング速度': 'bat_speed',
  'bat_speed': 'bat_speed',
  'BatSpeed': 'bat_speed',
  'Bat Speed': 'bat_speed',
  'Bat Speed (mph)': 'bat_speed',
  'バット速度': 'bat_speed',
  // 打球速度
  '打球速度': 'launch_speed',
  'ExitVelocity': 'launch_speed',
  'Exit Velocity': 'launch_speed',
  'Exit Velocity (mph)': 'launch_speed',
  'launch_speed': 'launch_speed',
  'exit_velocity': 'launch_speed',
  'EV': 'launch_speed',
  '打球スピード': 'launch_speed',
  '打球初速': 'launch_speed',
  // 打球角度
  '打球角度': 'launch_angle',
  'LaunchAngle': 'launch_angle',
  'Launch Angle': 'launch_angle',
  'Launch Angle (deg)': 'launch_angle',
  'launch_angle': 'launch_angle',
  'LA': 'launch_angle',
  '角度': 'launch_angle',
  // 飛距離
  '飛距離': 'hit_distance_sc',
  'Distance': 'hit_distance_sc',
  'hit_distance_sc': 'hit_distance_sc',
  'distance': 'hit_distance_sc',
  '推定飛距離': 'hit_distance_sc',
  'Estimated Distance (ft)': 'hit_distance_sc',
  // アタックアングル
  'アタックアングル': 'attack_angle',
  'attack_angle': 'attack_angle',
  'AttackAngle': 'attack_angle',
  'Attack Angle': 'attack_angle',
  'Attack Angle (deg)': 'attack_angle',
  'AA': 'attack_angle',
  'アッパースイング度': 'attack_angle',
  'アッパー角度': 'attack_angle',
  'アッパースイング': 'attack_angle',
  'アッパー': 'attack_angle',
  // スイング時間
  'スイング時間': 'time_to_contact',
  'time_to_contact': 'time_to_contact',
  'TimeToContact': 'time_to_contact',
  'Time to Contact (sec)': 'time_to_contact',
  'Time to Contact': 'time_to_contact',
  'インパクトまでの時間': 'time_to_contact',
  // オンプレーン効率 / オンプレーンスコア
  'オンプレーンの効率': 'on_plane_efficiency',
  'オンプレーン効率': 'on_plane_efficiency',
  'オンプレーン': 'on_plane_efficiency',
  'on_plane_efficiency': 'on_plane_efficiency',
  'OnPlaneEfficiency': 'on_plane_efficiency',
  'On Plane Efficiency': 'on_plane_efficiency',
  'On Plane Efficiency (%)': 'on_plane_efficiency',
  'オンプレーンスコア': 'on_plane_score',
  'プレーンスコア': 'on_plane_score',
  'Plane Score': 'on_plane_score',
  'PlaneScore': 'on_plane_score',
  'Plane Score (80)': 'on_plane_score',
  'Plane (80)': 'on_plane_score',
  'Plane': 'on_plane_score',
  'plane_score': 'on_plane_score',
  // コネクションスコア
  '体とバットの角度スコア': 'connection_score',
  'コネクションスコア': 'connection_score',
  'コネクション': 'connection_score',
  'Connection Score': 'connection_score',
  'ConnectionScore': 'connection_score',
  'Connection Score (80)': 'connection_score',
  'Connection (80)': 'connection_score',
  'Connection': 'connection_score',
  'connection_score': 'connection_score',
  // ローテーションスコア
  '体の回転による加速スコア': 'rotation_score',
  'ローテーションスコア': 'rotation_score',
  'ローテーション': 'rotation_score',
  'Rotation Score': 'rotation_score',
  'RotationScore': 'rotation_score',
  'Rotation Score (80)': 'rotation_score',
  'Rotation (80)': 'rotation_score',
  'Rotation': 'rotation_score',
  'rotation_score': 'rotation_score',
  // 回転加速度 (初動)
  '初動': 'rotation_acceleration',
  '回転加速度': 'rotation_acceleration',
  'Rotational Acceleration': 'rotation_acceleration',
  'RotationalAcceleration': 'rotation_acceleration',
  'Rotational Acceleration (g)': 'rotation_acceleration',
  'rotational_acceleration': 'rotation_acceleration',
  'rotation_acceleration': 'rotation_acceleration',
  // 垂直バット角度 / バット角度
  '垂直バット角度': 'vertical_bat_angle',
  'Vertical Bat Angle': 'vertical_bat_angle',
  'VerticalBatAngle': 'vertical_bat_angle',
  'Vertical Bat Angle (deg)': 'vertical_bat_angle',
  'vertical_bat_angle': 'vertical_bat_angle',
  'バット角度': 'bat_angle',
  'Bat Angle': 'bat_angle',
  'bat_angle': 'bat_angle',
  // インパクト時・構え時コネクション
  'インパクト': 'connection_at_impact',
  'インパクト時のコネクション': 'connection_at_impact',
  'Connection at Impact': 'connection_at_impact',
  'Connection at Impact (deg)': 'connection_at_impact',
  'ConnectionAtImpact': 'connection_at_impact',
  'connection_at_impact': 'connection_at_impact',
  '構え': 'connection_at_address',
  '構え時のコネクション': 'connection_at_address',
  'Connection at Address': 'connection_at_address',
  'Connection at Address (deg)': 'connection_at_address',
  'ConnectionAtAddress': 'connection_at_address',
  'connection_at_address': 'connection_at_address',
  // パワー
  'パワー': 'power',
  'Power': 'power',
  'Power (kW)': 'power',
  'power': 'power',
  // 手の最大速度
  '手の最大速度': 'peak_hand_speed',
  '手の最大': 'peak_hand_speed',
  'peak_hand_speed': 'peak_hand_speed',
  'PeakHandSpeed': 'peak_hand_speed',
  'Peak Hand Speed': 'peak_hand_speed',
  'Peak Hand Speed (mph)': 'peak_hand_speed',
  'Hand Speed': 'peak_hand_speed',
  // 球速
  '球速': 'release_speed',
  'release_speed': 'release_speed',
  'PitchBallVelo': 'release_speed',
  'pitch_velocity': 'release_speed',
  'Pitch Speed': 'release_speed',
  'PitchSpeed': 'release_speed',
  // 球種
  '球種': 'pitch_type',
  'Pitch Type': 'pitch_type',
  'PitchType': 'pitch_type',
  'pitch_type': 'pitch_type',
  'pitch_name': 'pitch_type',
  // 回転数
  '回転数': 'release_spin_rate',
  'Spin Rate': 'release_spin_rate',
  'SpinRate': 'release_spin_rate',
  'release_spin_rate': 'release_spin_rate',
  // 回転軸
  '回転軸': 'spin_axis',
  'Spin Axis': 'spin_axis',
  'SpinAxis': 'spin_axis',
  'spin_axis': 'spin_axis',
  // 回転効率
  '回転効率': 'spin_efficiency',
  'Spin Efficiency': 'spin_efficiency',
  'SpinEfficiency': 'spin_efficiency',
  'Spin Efficiency (release)': 'spin_efficiency',
  'spin_efficiency': 'spin_efficiency',
  // ジャイロ角
  'ジャイロ角': 'gyro_angle',
  'ジャイロ角度': 'gyro_angle',
  'ジャイロ度': 'gyro_angle',
  'ジャイロ': 'gyro_angle',
  'Gyro Angle': 'gyro_angle',
  'GyroAngle': 'gyro_angle',
  'Gyro Degree (deg)': 'gyro_angle',
  'Gyro Degree': 'gyro_angle',
  'Gyro (deg)': 'gyro_angle',
  'Gyro': 'gyro_angle',
  'gyro_angle': 'gyro_angle',
  // 変化量
  '縦変化量': 'vb_traj',
  'VB (trajectory)': 'vb_traj',
  'VB': 'vb_traj',
  'vbreak_traj': 'vb_traj',
  '横変化量': 'hb_traj',
  'HB (trajectory)': 'hb_traj',
  'HB': 'hb_traj',
  'hbreak_traj': 'hb_traj',
  // リリース位置
  'リリース高度': 'release_pos_z',
  'リリース高': 'release_pos_z',
  'Release Height': 'release_pos_z',
  'ReleaseHeight': 'release_pos_z',
  'release_pos_z': 'release_pos_z',
  'リリース横': 'release_pos_x',
  'リリース幅': 'release_pos_x',
  'Release Side': 'release_pos_x',
  'ReleaseSide': 'release_pos_x',
  'release_pos_x': 'release_pos_x',
  // VAA
  'VAA': 'vaa',
  'VerticalApproachAngle': 'vaa',
  // 利き腕
  '利き腕': 'p_throws',
  'Throws': 'p_throws',
  'p_throws': 'p_throws',
  // 日付
  '日付': 'date',
  'Date': 'game_date',
  'game_date': 'game_date',
  // その他
  'チーム名': 'team_name',
  'Team': 'team_name',
  'Direction': 'hc_x',
  'Bearing': 'hc_x',
  'HitDirection': 'hc_x',
  '打球方向': 'hc_x'
};

// Date parsing helper - flexible extraction of year/month/day
export function parseJapaneseDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) return dateStr;
  
  const enMonthMap = {'jan':'01','feb':'02','mar':'03','apr':'04','may':'05','jun':'06','jul':'07','aug':'08','sep':'09','oct':'10','nov':'11','dec':'12'};
  
  try {
    const yearMatch = dateStr.match(/\b(20\d{2})\b/);
    const monMatch = dateStr.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i);
    if (yearMatch && monMatch) {
      const year = yearMatch[1];
      const month = enMonthMap[monMatch[1].toLowerCase()];
      const dayMatch = dateStr.match(/\b(\d{1,2})\b/);
      const day = dayMatch ? dayMatch[1].padStart(2, '0') : '01';
      return `${year}-${month}-${day}`;
    }
    
    let cleaned = dateStr;
    const months = ['12月','11月','10月','9月','8月','7月','6月','5月','4月','3月','2月','1月'];
    const monthMap = {'1月':'01','2月':'02','3月':'03','4月':'04','5月':'05','6月':'06','7月':'07','8月':'08','9月':'09','10月':'10','11月':'11','12月':'12'};
    months.forEach(m => { if (cleaned.includes(m)) cleaned = cleaned.replace(m, monthMap[m]); });
    const isPM = cleaned.includes('午後');
    cleaned = cleaned.replace('午前', '').replace('午後', '').trim();
    const parts = cleaned.split(/[\s,:]+/);
    if (parts.length >= 6) {
      const [month, day, year, hour, minute, second] = parts;
      let h = parseInt(hour, 10);
      if (isPM && h < 12) h += 12;
      if (!isPM && h === 12) h = 0;
      return `${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}T${String(h).padStart(2,'0')}:${minute.padStart(2,'0')}:${second.padStart(2,'0')}`;
    }
  } catch (e) {
    console.warn("Date parse failed:", dateStr, e);
  }
  return null;
}
