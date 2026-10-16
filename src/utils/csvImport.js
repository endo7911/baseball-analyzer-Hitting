// CSV import helpers shared by the upload screen (and unit-testable without React).

// Words that appear in the header row of the files this app understands.
const BASE_HEADER_KEYWORDS = [
  'Date', '日付', '測定日', '計測日',
  'Player', '選手名', '名前', '氏名', 'Athlete', 'User', 'Pitcher', '投手名',
  'Bat Speed', 'BatSpeed', 'bat_speed', 'スイング速度', 'バットスピード', 'バット速度', 'スイング',
  'ExitVelocity', 'Exit Velocity', 'launch_speed', '打球速度', '打球初速', '打球スピード',
  'Launch Angle', 'LaunchAngle', 'launch_angle', '打球角度',
  'Attack Angle', 'AttackAngle', 'attack_angle', 'アタックアングル', 'アッパー',
  'On Plane', 'OnPlaneEfficiency', 'on_plane_efficiency', 'オンプレーン', 'プレーンスコア', 'Plane Score',
  'Connection', 'connection_score', 'コネクション', '体とバットの角度', 'インパクト', '構え',
  'Rotation', 'rotation_score', 'ローテーション', '回転加速', '初動',
  'Time to Contact', 'TimeToContact', 'time_to_contact', 'スイング時間',
  'Peak Hand Speed', 'PeakHandSpeed', 'peak_hand_speed', '手の最大', 'Hand Speed',
  'Power', 'power', 'パワー',
  'Vertical Bat Angle', 'vertical_bat_angle', '垂直バット角度', 'バット角度',
  'Distance', 'hit_distance_sc', '飛距離', '推定飛距離',
  '球速', 'Pitch Speed', 'PitchBallVelo', 'release_speed',
  'Pitch Type', 'pitch_type', '球種',
  'Spin Rate', 'release_spin_rate', '回転数',
  'Grade', 'grade', '学年', '年次',
  'Team', 'team_name', 'チーム'
];

export const BODY_COMP_HEADER_KEYWORDS = [
  '身長', '体重', '筋肉量', '骨格筋量', '体脂肪', '基礎代謝', '体幹', '左腕', '右腕', '左足', '右足',
  'Height', 'Weight', 'Muscle', 'Body Fat', 'BMI', 'FFMI', '測定日'
];

// Decode a CSV file buffer (UTF-8 with/without BOM, or Shift-JIS from Japanese Windows Excel).
export const decodeCsvBuffer = (arrayBuffer) => {
  let utf8Text;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(arrayBuffer);
  } catch (e) {
    utf8Text = new TextDecoder('utf-8').decode(arrayBuffer);
  }
  try {
    return new TextDecoder('shift-jis').decode(arrayBuffer);
  } catch (err) {
    console.error('Shift-JIS decoding failed', err);
    return utf8Text;
  }
};

/**
 * CSV の先頭行（最大50行）から本来のテーブルヘッダー行インデックスを特定する。
 * デバイス出力CSV（Blast Motion / Rapsodo / InBody等）やExcel出力で先頭にメタ情報行
 * （例: "Report Date, 2026-10-14" や "Player Name, 山田太郎"）が含まれる場合でも、
 * カラム数とキーワード一致数が最も多い本物のテーブルヘッダー行を確実に選択する。
 */
export const findHeaderIndex = (lines, extraKeywords = []) => {
  const keywords = [...BASE_HEADER_KEYWORDS, ...extraKeywords];
  const lowerKeywords = keywords.map(k => k.toLowerCase());

  let bestIndex = -1;
  let bestScore = 0;

  const limit = Math.min(lines.length, 50);
  for (let i = 0; i < limit; i++) {
    const rawLine = lines[i];
    if (!rawLine || rawLine.trim() === '') continue;

    // カンマまたはタブで分割し、空でないセル数をカウント
    const cells = rawLine
      .split(/[,;\t]/)
      .map(c => c.replace(/^["'\ufeff]+|["']+$/g, '').trim())
      .filter(Boolean);

    // テーブルヘッダーは最低2カラム以上必要
    if (cells.length < 2) continue;

    // 各セルがヘッダーキーワードにマッチするか判定
    let matchedCells = 0;
    for (const cell of cells) {
      const lowerCell = cell.toLowerCase();
      const isMatch = lowerKeywords.some(kw => lowerCell === kw || lowerCell.includes(kw));
      if (isMatch) matchedCells++;
    }

    // 2カラムしかないメタ情報行（例: "Report Date, 2026-10-14"）を誤ってヘッダーと判定しないよう、
    // 3セル以上の行、または2セルとも明確なヘッダー名の場合のみスコア計算
    if (cells.length === 2 && matchedCells < 2) continue;

    if (matchedCells >= 2 || (cells.length >= 4 && matchedCells >= 1)) {
      // マッチしたセル数を優先しつつ、カラム数が多い行（本物のテーブルヘッダー）を高く評価
      const score = matchedCells * 10 + Math.min(cells.length, 30);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }
  }

  return bestIndex;
};

/**
 * ヘッダー行より前にあるプリアンブル（メタ情報行）から選手名・チーム名・日付を抽出するヘルパー
 * （Blast Motion の単一選手エクスポート等でテーブル内に Player 列が無い場合の自動補完用）
 */
export const extractPreambleMetadata = (lines, headerIndex) => {
  const meta = { playerName: '', teamName: '', date: '' };
  if (!Array.isArray(lines) || headerIndex <= 0) return meta;

  for (let i = 0; i < headerIndex; i++) {
    const line = lines[i];
    if (!line || !line.trim()) continue;
    const parts = line
      .split(/[,:\t：]/)
      .map(s => s.replace(/^["'\ufeff]+|["']+$/g, '').trim())
      .filter(Boolean);

    if (parts.length >= 2) {
      const key = parts[0].toLowerCase();
      const val = parts[1];
      if (!val) continue;
      if (['player', 'player name', 'athlete', 'user', '選手名', '氏名', '名前'].some(k => key.includes(k))) {
        if (!meta.playerName) meta.playerName = val;
      } else if (['team', 'team name', 'チーム', 'チーム名', '所属'].some(k => key.includes(k))) {
        if (!meta.teamName) meta.teamName = val;
      } else if (['date', 'report date', '日付', '測定日', '計測日'].some(k => key.includes(k))) {
        if (!meta.date) meta.date = val;
      }
    }
  }
  return meta;
};
