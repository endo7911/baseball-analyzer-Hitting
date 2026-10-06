// CSV import helpers shared by the upload screen (and unit-testable without React).

// Words that appear in the header row of the files this app understands.
// The body-composition entries make the header row detectable for 体組成 files that
// carry a preamble (e.g. an instrument name / measurement info above the table).
const BASE_HEADER_KEYWORDS = [
  'Date', '日付', 'Player', '選手名', '名前', 'Bat Speed', 'スイング', 'バットスピード', 'ExitVelocity', '打球',
  '球速', 'Pitch Speed', 'Pitch Type', 'Grade', '学年', 'Team', 'チーム', 'Exit Velocity', 'Launch Angle',
];
export const BODY_COMP_HEADER_KEYWORDS = [
  '身長', '体重', '筋肉量', '体脂肪', 'Height', 'Weight', 'Muscle', 'Body Fat', 'BMI', '測定日',
];

// Decode a CSV file buffer.
// Excel on Japanese Windows saves CSV as Shift-JIS, most other tools use UTF-8 (often with BOM).
// A strict UTF-8 decode is the reliable discriminator: Shift-JIS text is practically never valid UTF-8,
// whereas a keyword heuristic breaks as soon as a file has none of the expected headers.
export const decodeCsvBuffer = (arrayBuffer) => {
  let utf8Text;
  try {
    // fatal: true -> throws on invalid byte sequences. A leading BOM is stripped automatically.
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

// Find the line index of the real header row (files exported by devices often have preamble lines).
// Returns -1 when no better candidate than the first line is found.
export const findHeaderIndex = (lines, extraKeywords = []) => {
  const keywords = [...BASE_HEADER_KEYWORDS, ...extraKeywords];
  for (let i = 0; i < Math.min(lines.length, 50); i++) {
    const line = lines[i];
    if (!line || line.trim() === '') continue;
    const matches = keywords.filter(kw => line.includes(kw)).length;
    if (matches >= 2 || (i > 0 && matches >= 1 && (line.includes('Date') || line.includes('日付')))) {
      return i;
    }
  }
  return -1;
};
