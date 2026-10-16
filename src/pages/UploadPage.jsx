import React, { useRef } from 'react';
import Papa from 'papaparse';
import { UploadCloud, FileText, Database, Cloud, Save, RefreshCw, X, Sparkles, Zap, Target, Activity, Dumbbell } from 'lucide-react';
import { parseAnyDate, getRawDataValue, DEFAULT_DATE_KEYS, extractRowVal } from '../utils/dataHelpers';
import { decodeCsvBuffer, findHeaderIndex, extractPreambleMetadata, BODY_COMP_HEADER_KEYWORDS } from '../utils/csvImport';
import { applyTwoRowHeader } from '../utils/bodyComp';
import { getSupabase } from '../lib/supabase';
import { SHOW_PITCHER_MODULE, SHOW_BODY_COMP_MODULE } from '../config';

function UploadPage({ savantFiles, savantPitchingFiles = [], blastFiles, combinedFiles, bodyCompFiles = [], updateDataState, setActiveView, saveToCloud, syncState, profile, fetchFromCloud, onViewPlayer }) {
  const [isLoading, setIsLoading] = React.useState(false);
  const fileInputRefs = useRef({});

  const allowHitting = profile?.allow_hitting !== false && profile?.permissions?.hitting !== false;
  const allowPitching = profile?.allow_pitching !== false && profile?.permissions?.pitching !== false;
  const allowBodyComp = profile?.allow_body_comp !== false && profile?.permissions?.bodyComp !== false;

  const handleLoadSampleData = () => {
    // 1. 体組成テストデータ (春4/15, 夏7/20, 秋10/15 の3期測定)
    const bodyCompRows = [
      { '日付': '2026-04-15', 'チーム名': 'Aチーム', '選手名': '山田 太郎', '学年': '3年', '身長': 178.0, '体重': 74.0, '筋肉量': 58.5, '体脂肪率': 15.2, '基礎代謝量': 1680, 'BMI': 23.4, '体幹': 28.5, '左腕': 3.6, '右腕': 3.8, '左足': 9.2, '右足': 9.4 },
      { '日付': '2026-04-15', 'チーム名': 'Aチーム', '選手名': '佐藤 健太', '学年': '2年', '身長': 172.0, '体重': 68.0, '筋肉量': 53.8, '体脂肪率': 15.0, '基礎代謝量': 1560, 'BMI': 23.0, '体幹': 26.0, '左腕': 3.1, '右腕': 3.3, '左足': 8.6, '右足': 8.8 },
      { '日付': '2026-04-15', 'チーム名': 'Aチーム', '選手名': '鈴木 翔太', '学年': '3年', '身長': 182.0, '体重': 79.5, '筋肉量': 63.5, '体脂肪率': 14.5, '基礎代謝量': 1820, 'BMI': 24.0, '体幹': 31.0, '左腕': 4.0, '右腕': 4.2, '左足': 10.2, '右足': 10.4 },
      { '日付': '2026-04-15', 'チーム名': 'Aチーム', '選手名': '高橋 陸',   '学年': '1年', '身長': 168.0, '体重': 61.0, '筋肉量': 47.2, '体脂肪率': 16.8, '基礎代謝量': 1430, 'BMI': 21.6, '体幹': 23.0, '左腕': 2.7, '右腕': 2.8, '左足': 7.4, '右足': 7.6 },
      { '日付': '2026-04-15', 'チーム名': 'Aチーム', '選手名': '田中 拓海', '学年': '2年', '身長': 175.0, '体重': 76.0, '筋肉量': 58.0, '体脂肪率': 18.2, '基礎代謝量': 1690, 'BMI': 24.8, '体幹': 29.0, '左腕': 3.6, '右腕': 3.8, '左足': 9.4, '右足': 9.6 },
      { '日付': '2026-04-15', 'チーム名': 'Aチーム', '選手名': '渡辺 蓮',   '学年': '3年', '身長': 180.0, '体重': 78.0, '筋肉量': 62.0, '体脂肪率': 14.8, '基礎代謝量': 1780, 'BMI': 24.1, '体幹': 30.2, '左腕': 3.9, '右腕': 4.1, '左足': 10.0, '右足': 10.2 },

      { '日付': '2026-07-20', 'チーム名': 'Aチーム', '選手名': '山田 太郎', '学年': '3年', '身長': 178.0, '体重': 76.2, '筋肉量': 60.4, '体脂肪率': 14.8, '基礎代謝量': 1720, 'BMI': 24.1, '体幹': 29.5, '左腕': 3.8, '右腕': 4.0, '左足': 9.5, '右足': 9.7 },
      { '日付': '2026-07-20', 'チーム名': 'Aチーム', '選手名': '佐藤 健太', '学年': '2年', '身長': 172.0, '体重': 68.2, '筋肉量': 54.2, '体脂肪率': 14.9, '基礎代謝量': 1570, 'BMI': 23.1, '体幹': 26.2, '左腕': 3.2, '右腕': 3.4, '左足': 8.7, '右足': 8.9 },
      { '日付': '2026-07-20', 'チーム名': 'Aチーム', '選手名': '鈴木 翔太', '学年': '3年', '身長': 182.0, '体重': 82.0, '筋肉量': 65.8, '体脂肪率': 13.8, '基礎代謝量': 1860, 'BMI': 24.8, '体幹': 32.0, '左腕': 4.1, '右腕': 4.3, '左足': 10.5, '右足': 10.7 },
      { '日付': '2026-07-20', 'チーム名': 'Aチーム', '選手名': '高橋 陸',   '学年': '1年', '身長': 168.0, '体重': 64.5, '筋肉量': 49.5, '体脂肪率': 16.5, '基礎代謝量': 1480, 'BMI': 22.9, '体幹': 24.2, '左腕': 2.9, '右腕': 3.0, '左足': 7.9, '右足': 8.1 },
      { '日付': '2026-07-20', 'チーム名': 'Aチーム', '選手名': '田中 拓海', '学年': '2年', '身長': 175.0, '体重': 74.2, '筋肉量': 58.2, '体脂肪率': 16.5, '基礎代謝量': 1660, 'BMI': 24.2, '体幹': 28.5, '左腕': 3.5, '右腕': 3.7, '左足': 9.3, '右足': 9.5 },
      { '日付': '2026-07-20', 'チーム名': 'Aチーム', '選手名': '渡辺 蓮',   '学年': '3年', '身長': 180.0, '体重': 80.0, '筋肉量': 63.8, '体脂肪率': 14.2, '基礎代謝量': 1810, 'BMI': 24.7, '体幹': 31.0, '左腕': 4.0, '右腕': 4.2, '左足': 10.2, '右足': 10.4 },

      { '日付': '2026-10-15', 'チーム名': 'Aチーム', '選手名': '山田 太郎', '学年': '3年', '身長': 178.0, '体重': 78.5, '筋肉量': 62.5, '体脂肪率': 14.2, '基礎代謝量': 1760, 'BMI': 24.8, '体幹': 30.5, '左腕': 4.0, '右腕': 4.2, '左足': 9.8, '右足': 10.1 },
      { '日付': '2026-10-15', 'チーム名': 'Aチーム', '選手名': '佐藤 健太', '学年': '2年', '身長': 172.0, '体重': 68.5, '筋肉量': 54.8, '体脂肪率': 14.6, '基礎代謝量': 1580, 'BMI': 23.2, '体幹': 26.5, '左腕': 3.3, '右腕': 3.5, '左足': 8.8, '右足': 9.0 },
      { '日付': '2026-10-15', 'チーム名': 'Aチーム', '選手名': '鈴木 翔太', '学年': '3年', '身長': 182.0, '体重': 84.5, '筋肉量': 68.0, '体脂肪率': 13.2, '基礎代謝量': 1900, 'BMI': 25.5, '体幹': 33.0, '左腕': 4.3, '右腕': 4.5, '左足': 10.9, '右足': 11.2 },
      { '日付': '2026-10-15', 'チーム名': 'Aチーム', '選手名': '高橋 陸',   '学年': '1年', '身長': 168.0, '体重': 67.0, '筋肉量': 51.0, '体脂肪率': 16.2, '基礎代謝量': 1520, 'BMI': 23.7, '体幹': 25.0, '左腕': 3.0, '右腕': 3.1, '左足': 8.3, '右足': 8.5 },
      { '日付': '2026-10-15', 'チーム名': 'Aチーム', '選手名': '田中 拓海', '学年': '2年', '身長': 175.0, '体重': 72.5, '筋肉量': 58.5, '体脂肪率': 14.8, '基礎代謝量': 1640, 'BMI': 23.7, '体幹': 28.0, '左腕': 3.5, '右腕': 3.7, '左足': 9.2, '右足': 9.4 },
      { '日付': '2026-10-15', 'チーム名': 'Aチーム', '選手名': '渡辺 蓮',   '学年': '3年', '身長': 180.0, '体重': 82.0, '筋肉量': 65.5, '体脂肪率': 13.8, '基礎代謝量': 1850, 'BMI': 25.3, '体幹': 31.8, '左腕': 4.1, '右腕': 4.3, '左足': 10.5, '右足': 10.7 },
    ];

    // 2. 打撃テストデータ (春4/15, 夏7/20, 秋10/15)
    const battingCsv = `日付,チーム名,選手名,学年,スイング速度,打球速度,打球角度,飛距離,アッパー,スイング時間,オンプレーン効率,手の最大速度
2026-04-15,Aチーム,山田 太郎,3年,108.5,135.0,22.0,92.0,11.5,0.16,74.5,31.2
2026-04-15,Aチーム,山田 太郎,3年,109.0,137.5,24.5,96.0,12.0,0.15,76.0,32.0
2026-04-15,Aチーム,山田 太郎,3年,110.2,142.0,26.0,102.5,13.0,0.15,75.2,32.5
2026-04-15,Aチーム,佐藤 健太,2年,101.0,126.5,19.0,82.0,9.0,0.14,79.0,30.5
2026-04-15,Aチーム,佐藤 健太,2年,102.5,129.0,21.5,85.5,10.0,0.14,80.5,31.0
2026-04-15,Aチーム,佐藤 健太,2年,102.0,132.0,23.0,88.0,10.5,0.14,81.0,31.2
2026-04-15,Aチーム,田中 拓海,2年,103.5,129.5,20.0,85.0,9.5,0.16,72.0,29.5
2026-04-15,Aチーム,田中 拓海,2年,105.0,136.0,25.0,93.0,11.0,0.15,74.0,30.8
2026-04-15,Aチーム,渡辺 蓮,3年,111.0,138.0,23.0,96.0,12.0,0.15,76.0,32.5
2026-04-15,Aチーム,渡辺 蓮,3年,112.5,142.5,25.5,101.0,12.8,0.15,77.5,33.0
2026-07-20,Aチーム,山田 太郎,3年,113.8,140.5,23.0,98.0,12.2,0.15,77.0,33.0
2026-07-20,Aチーム,山田 太郎,3年,114.5,143.0,25.0,103.0,12.8,0.14,78.2,33.5
2026-07-20,Aチーム,山田 太郎,3年,115.2,148.5,27.0,110.0,13.5,0.14,77.8,34.2
2026-07-20,Aチーム,佐藤 健太,2年,105.5,131.5,20.0,87.0,9.8,0.14,81.5,31.8
2026-07-20,Aチーム,佐藤 健太,2年,106.8,135.0,22.0,91.0,10.5,0.13,82.8,32.2
2026-07-20,Aチーム,佐藤 健太,2年,107.2,139.0,24.0,95.0,11.2,0.13,83.0,32.8
2026-07-20,Aチーム,田中 拓海,2年,108.0,134.0,21.5,90.0,10.5,0.15,75.0,31.0
2026-07-20,Aチーム,田中 拓海,2年,110.0,141.0,26.0,99.0,11.8,0.14,77.0,32.5
2026-07-20,Aチーム,渡辺 蓮,3年,115.0,143.5,24.0,102.0,12.5,0.14,78.5,33.8
2026-07-20,Aチーム,渡辺 蓮,3年,116.8,147.0,26.5,107.0,13.2,0.14,79.8,34.5
2026-10-15,Aチーム,山田 太郎,3年,119.5,146.5,24.0,106.0,13.0,0.14,79.0,34.5
2026-10-15,Aチーム,山田 太郎,3年,121.0,150.0,26.0,112.0,13.8,0.13,80.5,35.2
2026-10-15,Aチーム,山田 太郎,3年,122.5,156.0,28.0,120.0,14.5,0.13,80.0,36.0
2026-10-15,Aチーム,佐藤 健太,2年,110.2,137.0,21.0,93.0,10.2,0.13,83.5,33.0
2026-10-15,Aチーム,佐藤 健太,2年,111.8,140.5,23.0,98.0,11.0,0.13,84.5,33.8
2026-10-15,Aチーム,佐藤 健太,2年,112.5,145.0,25.0,104.0,11.8,0.12,85.0,34.2
2026-10-15,Aチーム,田中 拓海,2年,112.5,138.5,22.0,95.0,11.0,0.14,77.5,32.5
2026-10-15,Aチーム,田中 拓海,2年,114.5,146.0,27.0,106.0,12.5,0.13,79.5,34.0
2026-10-15,Aチーム,渡辺 蓮,3年,119.0,149.0,25.0,110.0,13.2,0.13,80.5,35.0
2026-10-15,Aチーム,渡辺 蓮,3年,121.2,154.5,27.5,117.0,14.0,0.13,81.8,35.8`;

    // 3. 投球テストデータ (春4/15, 夏7/20, 秋10/15)
    const pitchingCsv = `日付,チーム名,投手名,学年,球種,球速,回転数,回転軸,縦変化量,横変化量,回転効率,リリース高度,リリース横
2026-04-15,Aチーム,鈴木 翔太,3年,Fastball,135.5,2180,1:15,41.2,14.5,92.5,1.82,0.42
2026-04-15,Aチーム,鈴木 翔太,3年,Fastball,138.0,2230,1:14,43.5,15.5,94.0,1.83,0.41
2026-04-15,Aチーム,鈴木 翔太,3年,Slider,124.0,2350,9:45,-4.2,-22.0,52.0,1.80,0.45
2026-04-15,Aチーム,高橋 陸,1年,Fastball,121.5,1980,11:15,38.5,-16.0,89.0,1.75,-0.40
2026-04-15,Aチーム,高橋 陸,1年,Fastball,125.0,2040,11:18,40.0,-17.0,90.5,1.75,-0.39
2026-04-15,Aチーム,渡辺 蓮,3年,Fastball,132.0,2120,1:20,39.5,13.8,91.0,1.80,0.44
2026-07-20,Aチーム,鈴木 翔太,3年,Fastball,140.2,2240,1:16,43.0,15.2,93.5,1.82,0.42
2026-07-20,Aチーム,鈴木 翔太,3年,Fastball,143.5,2300,1:14,45.0,16.2,95.0,1.83,0.40
2026-07-20,Aチーム,鈴木 翔太,3年,Slider,128.5,2420,9:42,-5.0,-24.5,54.0,1.80,0.44
2026-07-20,Aチーム,高橋 陸,1年,Fastball,123.0,2020,11:14,39.5,-16.8,90.0,1.75,-0.40
2026-07-20,Aチーム,高橋 陸,1年,Fastball,127.0,2090,11:15,41.2,-17.8,91.5,1.75,-0.39
2026-07-20,Aチーム,渡辺 蓮,3年,Fastball,135.5,2180,1:18,41.2,14.5,92.5,1.80,0.43
2026-10-15,Aチーム,鈴木 翔太,3年,Fastball,145.0,2310,1:15,45.5,16.5,95.0,1.83,0.41
2026-10-15,Aチーム,鈴木 翔太,3年,Fastball,150.2,2380,1:13,48.0,17.5,96.5,1.84,0.39
2026-10-15,Aチーム,鈴木 翔太,3年,Slider,132.0,2490,9:40,-5.8,-26.0,56.5,1.81,0.43
2026-10-15,Aチーム,高橋 陸,1年,Fastball,125.0,2050,11:12,41.0,-17.5,91.2,1.75,-0.40
2026-10-15,Aチーム,高橋 陸,1年,Fastball,129.5,2140,11:12,43.0,-18.5,92.8,1.76,-0.38
2026-10-15,Aチーム,渡辺 蓮,3年,Fastball,139.0,2240,1:16,43.0,15.2,93.8,1.81,0.42
2026-10-15,Aチーム,渡辺 蓮,3年,Fastball,142.5,2290,1:17,44.5,15.8,94.5,1.82,0.41`;

    const parsedBatting = Papa.parse(battingCsv, { header: true, dynamicTyping: true, skipEmptyLines: true });
    const parsedPitching = Papa.parse(pitchingCsv, { header: true, dynamicTyping: true, skipEmptyLines: true });

    updateDataState('combined', {
      filename: '連動テスト_打撃統合データ.csv',
      headers: parsedBatting.meta.fields || [],
      data: parsedBatting.data || []
    }, 'add');

    if (SHOW_PITCHER_MODULE) {
      updateDataState('savant_pitching', {
        filename: '連動テスト_投球データ.csv',
        headers: parsedPitching.meta.fields || [],
        data: parsedPitching.data || []
      }, 'add');
    }

    if (SHOW_BODY_COMP_MODULE) {
      updateDataState('body_comp', {
        filename: '連動テスト_体組成データ.csv',
        headers: Object.keys(bodyCompRows[0]),
        data: bodyCompRows
      }, 'add');
    }

    alert("✨ 連動テスト用データセット（春・夏・秋の3期測定：打撃・投球・体組成）を一括セットしました！\n\n・下のカレンダーに測定日（4/15, 7/20, 10/15）と参加メンバーが自動反映されました。\n・「体組成分析」→「個人分析」を開くと、体重・筋肉量と速度の連動成長グラフ・還元効率をご確認いただけます！");
  };

  const handleCloudSync = async () => {
    setIsLoading(true);
    try {
      await fetchFromCloud();
      alert("同期処理を実行しました。（ローカル保存データがある場合はローカルより読み込まれます）");
    } catch (err) {
      console.warn("Cloud sync skipped:", err);
      alert("現在クラウド非接続のため、ブラウザ内に読み込まれたローカルデータを使用します。");
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = (event, type) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const arrayBuffer = e.target.result;

        // UTF-8 (with / without BOM) and Shift-JIS (Excel on Japanese Windows) are both supported
        const text = decodeCsvBuffer(arrayBuffer);
        if (!text || text.trim() === '') {
          alert(`「${file.name}」が空ファイルか、正しく読み取れませんでした。`);
          return;
        }

        // Universal Header Row Detection for all CSV files (Blast, Rapsodo, Excel CSV exports)
        const lines = text.split(/\r?\n/);
        const headerIndex = findHeaderIndex(lines, type === 'body_comp' ? BODY_COMP_HEADER_KEYWORDS : []);
        const preambleMeta = extractPreambleMetadata(lines, headerIndex);

        let csvText = text;
        if (headerIndex > 0) {
          csvText = lines.slice(headerIndex).join('\n');
          console.log(`Header found at line ${headerIndex + 1}`, preambleMeta);
        }

        // 体組成CSVは「部位別筋肉量」のような2行ヘッダーで出力されることがあるため、1行のヘッダーに統合する
        if (type === 'body_comp') {
          csvText = applyTwoRowHeader(csvText);
        }

        Papa.parse(csvText, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
          complete: (results) => {
            const headers = results.meta.fields || [];
            const fileDate = parseAnyDate(file.name) || parseAnyDate(preambleMeta.date);

            // Process and normalize rows
            const rows = (results.data || []).map(row => {
              if (!row) return row;
              
              // Normalize Date & backfill from preamble or filename if missing
              const rawDateVal = getRawDataValue(row, DEFAULT_DATE_KEYS);
              let normD = rawDateVal ? parseAnyDate(rawDateVal) : '';
              if (!normD && fileDate) normD = fileDate;

              if (normD) {
                row.date = normD;
                row.game_date = normD;
              }

              // Backfill player name from preamble if CSV table has no player column (common in single-player Blast exports)
              const hasPlayer = row.player_name || row.batter_name || row['選手名'] || row['名前'] || row['氏名'] || row['Player Name'] || row['Player'] || row['Athlete'] || row['User'];
              if (!hasPlayer && preambleMeta.playerName) {
                row.player_name = preambleMeta.playerName;
                row['選手名'] = preambleMeta.playerName;
              }

              // Backfill team name from preamble or user profile if missing
              const hasTeam = row.team_name || row['チーム名'] || row['チーム'] || row['Team'];
              if (!hasTeam && (preambleMeta.teamName || profile?.team_name || profile?.team_id)) {
                const fallbackTeam = preambleMeta.teamName || profile?.team_name || profile?.team_id;
                if (fallbackTeam && fallbackTeam !== '管理者' && fallbackTeam !== 'admin') {
                  row.team_name = fallbackTeam;
                }
              }

              // Ensure launch_speed alias backfill
              const evVal = extractRowVal(row, ['launch_speed', 'exit_velocity', 'ExitVelocity', 'Exit Velocity', '打球速度', '打球初速', '打球スピード']);
              if (evVal != null) {
                row.launch_speed = evVal;
              }

              return row;
            }).filter(r => r && Object.keys(r).length > 0);

            if (rows.length === 0) {
              alert(`「${file.name}」に有効なデータ行が見つかりませんでした。フォーマットをご確認ください。`);
              return;
            }

            const isPitching = headers.some(h => ['Pitch Speed', 'PitchBallVelo', 'Spin Rate', 'Pitch Type', 'VB (trajectory)', 'HB (trajectory)', '球速', '回転数', '縦変化量'].includes(h));
            const isHitting = headers.some(h => ['launch_speed', 'ExitVelocity', 'LaunchAngle', '打球速度', '打球角度'].includes(h));

            if (type === 'savant' && isPitching && !isHitting) {
              alert("※提示: 投球データが「Rapsodo 打撃」スロットに選択されました。「Rapsodo 投球データ」スロットを使用すると投手分析でより正確に表示されます。");
            } else if (type === 'savant_pitching' && isHitting && !isPitching) {
              alert("※提示: 打撃データが「Rapsodo 投球」スロットに選択されました。「Rapsodo 打撃データ」スロットをおすすめします。");
            }

            console.log(`[handleFileUpload] Successfully parsed ${rows.length} rows for type ${type} from ${file.name}`);

            updateDataState(type, {
              filename: file.name,
              headers: headers,
              data: rows
            }, 'add');

            if (fileInputRefs.current[type]) {
              fileInputRefs.current[type].value = '';
            }
          },
          error: (err) => {
            console.error("Error parsing CSV:", err);
            alert("CSVのパースに失敗しました: " + (err?.message || JSON.stringify(err)));
          }
        });
      } catch (readErr) {
        console.error("Error processing file buffer:", readErr);
        alert("ファイル処理中にエラーが発生しました: " + (readErr?.message || JSON.stringify(readErr)));
      }
    };
    
    reader.onerror = (e) => {
      console.error("FileReader failed:", e);
      alert("ファイルの読み込みに失敗しました。");
    };

    reader.readAsArrayBuffer(file);
  };

  const renderDataView = (files, typeLabel) => {
    if (!files || files.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-48 border-2 border-dashed border-slate-700 rounded-xl bg-slate-800/50 text-slate-400">
          <UploadCloud className="w-10 h-10 mb-3 opacity-50" />
          <p className="text-sm font-bold">データ未アップロード</p>
          <p className="text-xs opacity-75 mt-1 text-center px-4">CSVファイルを選択すると<br/>すぐに分析結果を閲覧できます</p>
        </div>
      );
    }

    const totalRows = files.reduce((acc, f) => acc + (f.data ? f.data.length : 0), 0);

    return (
      <div className="flex flex-col h-48 border border-emerald-500/30 rounded-xl bg-emerald-900/10 p-4 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500"></div>
        <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-1.5 mb-2">
          <div className="flex items-center min-w-0">
            <FileText className="w-5 h-5 text-emerald-400 mr-2 shrink-0" />
            <span className="text-sm font-bold text-emerald-300 truncate">読込完了 ({files.length} ファイル)</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button 
              onClick={() => {
                const targetView = typeLabel.toLowerCase().includes('body') ? 'bodyComp' : (typeLabel.toLowerCase().includes('pitching') ? 'pitcher' : (typeLabel.toLowerCase().includes('savant') || typeLabel.toLowerCase().includes('blast') ? 'player' : 'team'));
                setActiveView(targetView);
              }}
              className="flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-md transition-all cursor-pointer whitespace-nowrap shrink-0"
            >
              分析を見る →
            </button>
            <button 
              onClick={async () => {
                const fileType = typeLabel.toLowerCase().includes('body') ? 'body_comp' : (typeLabel.toLowerCase().includes('pitching') ? 'savant_pitching' : (typeLabel.toLowerCase().includes('savant') ? 'savant' : (typeLabel.toLowerCase().includes('blast') ? 'blast' : 'combined')));
                for (const f of [...files]) {
                  await saveToCloud(fileType, f);
                }
              }}
              disabled={syncState.saving}
              title="クラウドへ同期保存して枠をクリア"
              className={`flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap shrink-0 ${
                syncState.saving ? 'bg-slate-700 text-slate-500 cursor-wait' : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
              }`}
            >
              <Save className={`w-3.5 h-3.5 shrink-0 ${syncState.saving ? 'animate-pulse' : ''}`} />
              <span>クラウド同期</span>
            </button>
            <button 
              onClick={() => {
                const fileType = typeLabel.toLowerCase().includes('body') ? 'body_comp' : (typeLabel.toLowerCase().includes('pitching') ? 'savant_pitching' : (typeLabel.toLowerCase().includes('savant') ? 'savant' : (typeLabel.toLowerCase().includes('blast') ? 'blast' : 'combined')));
                updateDataState(fileType, null, 'clear');
              }}
              title="この枠の読み込みファイルをクリア"
              className="px-2 py-1.5 rounded-lg text-xs font-bold bg-slate-800 hover:bg-rose-900/50 hover:text-rose-300 text-slate-400 border border-slate-700 transition-all shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        
        <div className="text-xs text-slate-300 mb-2 flex-1 overflow-y-auto pr-2 space-y-1">
          {files.map((f, idx) => {
            const dates = Array.from(new Set(
              (f.data || [])
                .map(r => r.date || r.game_date || parseAnyDate(getRawDataValue(r, DEFAULT_DATE_KEYS)) || parseAnyDate(f.filename))
                .filter(Boolean)
            )).sort();

            const dateDisplay = dates.length === 1 
              ? dates[0] 
              : (dates.length > 1 ? `${dates[0]} ~ ${dates[dates.length - 1]}` : null);

            return (
              <div key={idx} className="bg-slate-800/50 px-2.5 py-1.5 rounded border border-slate-700/50 flex flex-wrap justify-between items-center gap-1 group">
                <div className="flex items-center min-w-0 mr-1 max-w-[65%]">
                  <span className="truncate text-slate-200 font-medium">{f.filename}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {dateDisplay ? (
                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-[10px] font-mono">
                      📅 {dateDisplay}
                    </span>
                  ) : (
                    <div className="flex items-center gap-1">
                      <span className="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/30 text-amber-300 text-[10px] font-mono">
                        ⚠️ 日付未設定
                      </span>
                      <input 
                        type="date"
                        onChange={(e) => {
                          if (e.target.value) {
                            updateDataState(typeLabel.toLowerCase(), { index: idx, date: e.target.value }, 'update_file_date');
                          }
                        }}
                        className="bg-slate-900 border border-amber-500/50 text-white text-[10px] rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-amber-400 cursor-pointer"
                        title="このファイルの日付を設定"
                      />
                    </div>
                  )}
                  <span className="text-slate-500 text-[10px] whitespace-nowrap">{f.data?.length || 0}行</span>
                  <button 
                    onClick={() => updateDataState(typeLabel.toLowerCase(), idx, 'remove')}
                    className="p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors"
                    title="このファイルを削除"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        
        <div className="text-xs text-slate-400 mt-auto font-bold bg-slate-900/50 p-2 rounded-lg border border-slate-700 flex justify-between items-center">
          <span>合計データ数</span>
          <span className="text-white text-sm">{totalRows} <span className="text-xs text-slate-400 font-normal">行</span></span>
        </div>
      </div>
    );
  };

  const downloadCSVTemplate = (type) => {
    let filename = '';
    let content = '';

    if (type === 'test_batting') {
      filename = '連動テスト_打撃統合データ.csv';
      content = `日付,チーム名,選手名,学年,スイング速度,打球速度,打球角度,飛距離,アッパー,スイング時間,オンプレーン効率,手の最大速度
2026-04-15,Aチーム,山田 太郎,3年,108.5,135.0,22.0,92.0,11.5,0.16,74.5,31.2
2026-04-15,Aチーム,山田 太郎,3年,109.0,137.5,24.5,96.0,12.0,0.15,76.0,32.0
2026-04-15,Aチーム,山田 太郎,3年,110.2,142.0,26.0,102.5,13.0,0.15,75.2,32.5
2026-04-15,Aチーム,佐藤 健太,2年,101.0,126.5,19.0,82.0,9.0,0.14,79.0,30.5
2026-04-15,Aチーム,佐藤 健太,2年,102.5,129.0,21.5,85.5,10.0,0.14,80.5,31.0
2026-04-15,Aチーム,佐藤 健太,2年,102.0,132.0,23.0,88.0,10.5,0.14,81.0,31.2
2026-04-15,Aチーム,田中 拓海,2年,103.5,129.5,20.0,85.0,9.5,0.16,72.0,29.5
2026-04-15,Aチーム,田中 拓海,2年,105.0,136.0,25.0,93.0,11.0,0.15,74.0,30.8
2026-04-15,Aチーム,渡辺 蓮,3年,111.0,138.0,23.0,96.0,12.0,0.15,76.0,32.5
2026-04-15,Aチーム,渡辺 蓮,3年,112.5,142.5,25.5,101.0,12.8,0.15,77.5,33.0
2026-07-20,Aチーム,山田 太郎,3年,113.8,140.5,23.0,98.0,12.2,0.15,77.0,33.0
2026-07-20,Aチーム,山田 太郎,3年,114.5,143.0,25.0,103.0,12.8,0.14,78.2,33.5
2026-07-20,Aチーム,山田 太郎,3年,115.2,148.5,27.0,110.0,13.5,0.14,77.8,34.2
2026-07-20,Aチーム,佐藤 健太,2年,105.5,131.5,20.0,87.0,9.8,0.14,81.5,31.8
2026-07-20,Aチーム,佐藤 健太,2年,106.8,135.0,22.0,91.0,10.5,0.13,82.8,32.2
2026-07-20,Aチーム,佐藤 健太,2年,107.2,139.0,24.0,95.0,11.2,0.13,83.0,32.8
2026-07-20,Aチーム,田中 拓海,2年,108.0,134.0,21.5,90.0,10.5,0.15,75.0,31.0
2026-07-20,Aチーム,田中 拓海,2年,110.0,141.0,26.0,99.0,11.8,0.14,77.0,32.5
2026-07-20,Aチーム,渡辺 蓮,3年,115.0,143.5,24.0,102.0,12.5,0.14,78.5,33.8
2026-07-20,Aチーム,渡辺 蓮,3年,116.8,147.0,26.5,107.0,13.2,0.14,79.8,34.5
2026-10-15,Aチーム,山田 太郎,3年,119.5,146.5,24.0,106.0,13.0,0.14,79.0,34.5
2026-10-15,Aチーム,山田 太郎,3年,121.0,150.0,26.0,112.0,13.8,0.13,80.5,35.2
2026-10-15,Aチーム,山田 太郎,3年,122.5,156.0,28.0,120.0,14.5,0.13,80.0,36.0
2026-10-15,Aチーム,佐藤 健太,2年,110.2,137.0,21.0,93.0,10.2,0.13,83.5,33.0
2026-10-15,Aチーム,佐藤 健太,2年,111.8,140.5,23.0,98.0,11.0,0.13,84.5,33.8
2026-10-15,Aチーム,佐藤 健太,2年,112.5,145.0,25.0,104.0,11.8,0.12,85.0,34.2
2026-10-15,Aチーム,田中 拓海,2年,112.5,138.5,22.0,95.0,11.0,0.14,77.5,32.5
2026-10-15,Aチーム,田中 拓海,2年,114.5,146.0,27.0,106.0,12.5,0.13,79.5,34.0
2026-10-15,Aチーム,渡辺 蓮,3年,119.0,149.0,25.0,110.0,13.2,0.13,80.5,35.0
2026-10-15,Aチーム,渡辺 蓮,3年,121.2,154.5,27.5,117.0,14.0,0.13,81.8,35.8\n`;
    } else if (type === 'test_pitching') {
      filename = '連動テスト_投球データ.csv';
      content = `日付,チーム名,投手名,学年,球種,球速,回転数,回転軸,縦変化量,横変化量,回転効率,リリース高度,リリース横
2026-04-15,Aチーム,鈴木 翔太,3年,Fastball,135.5,2180,1:15,41.2,14.5,92.5,1.82,0.42
2026-04-15,Aチーム,鈴木 翔太,3年,Fastball,138.0,2230,1:14,43.5,15.5,94.0,1.83,0.41
2026-04-15,Aチーム,鈴木 翔太,3年,Slider,124.0,2350,9:45,-4.2,-22.0,52.0,1.80,0.45
2026-04-15,Aチーム,高橋 陸,1年,Fastball,121.5,1980,11:15,38.5,-16.0,89.0,1.75,-0.40
2026-04-15,Aチーム,高橋 陸,1年,Fastball,125.0,2040,11:18,40.0,-17.0,90.5,1.75,-0.39
2026-04-15,Aチーム,渡辺 蓮,3年,Fastball,132.0,2120,1:20,39.5,13.8,91.0,1.80,0.44
2026-07-20,Aチーム,鈴木 翔太,3年,Fastball,140.2,2240,1:16,43.0,15.2,93.5,1.82,0.42
2026-07-20,Aチーム,鈴木 翔太,3年,Fastball,143.5,2300,1:14,45.0,16.2,95.0,1.83,0.40
2026-07-20,Aチーム,鈴木 翔太,3年,Slider,128.5,2420,9:42,-5.0,-24.5,54.0,1.80,0.44
2026-07-20,Aチーム,高橋 陸,1年,Fastball,123.0,2020,11:14,39.5,-16.8,90.0,1.75,-0.40
2026-07-20,Aチーム,高橋 陸,1年,Fastball,127.0,2090,11:15,41.2,-17.8,91.5,1.75,-0.39
2026-07-20,Aチーム,渡辺 蓮,3年,Fastball,135.5,2180,1:18,41.2,14.5,92.5,1.80,0.43
2026-10-15,Aチーム,鈴木 翔太,3年,Fastball,145.0,2310,1:15,45.5,16.5,95.0,1.83,0.41
2026-10-15,Aチーム,鈴木 翔太,3年,Fastball,150.2,2380,1:13,48.0,17.5,96.5,1.84,0.39
2026-10-15,Aチーム,鈴木 翔太,3年,Slider,132.0,2490,9:40,-5.8,-26.0,56.5,1.81,0.43
2026-10-15,Aチーム,高橋 陸,1年,Fastball,125.0,2050,11:12,41.0,-17.5,91.2,1.75,-0.40
2026-10-15,Aチーム,高橋 陸,1年,Fastball,129.5,2140,11:12,43.0,-18.5,92.8,1.76,-0.38
2026-10-15,Aチーム,渡辺 蓮,3年,Fastball,139.0,2240,1:16,43.0,15.2,93.8,1.81,0.42
2026-10-15,Aチーム,渡辺 蓮,3年,Fastball,142.5,2290,1:17,44.5,15.8,94.5,1.82,0.41\n`;
    } else if (type === 'test_body_comp') {
      filename = '連動テスト_体組成データ.csv';
      content = `日付,チーム名,選手名,学年,身長,体重,筋肉量,体脂肪率,基礎代謝量,BMI,体幹,左腕,右腕,左足,右足
2026-04-15,Aチーム,山田 太郎,3年,178.0,74.0,58.5,15.2,1680,23.4,28.5,3.6,3.8,9.2,9.4
2026-04-15,Aチーム,佐藤 健太,2年,172.0,68.0,53.8,15.0,1560,23.0,26.0,3.1,3.3,8.6,8.8
2026-04-15,Aチーム,鈴木 翔太,3年,182.0,79.5,63.5,14.5,1820,24.0,31.0,4.0,4.2,10.2,10.4
2026-04-15,Aチーム,高橋 陸,1年,168.0,61.0,47.2,16.8,1430,21.6,23.0,2.7,2.8,7.4,7.6
2026-04-15,Aチーム,田中 拓海,2年,175.0,76.0,58.0,18.2,1690,24.8,29.0,3.6,3.8,9.4,9.6
2026-04-15,Aチーム,渡辺 蓮,3年,180.0,78.0,62.0,14.8,1780,24.1,30.2,3.9,4.1,10.0,10.2
2026-07-20,Aチーム,山田 太郎,3年,178.0,76.2,60.4,14.8,1720,24.1,29.5,3.8,4.0,9.5,9.7
2026-07-20,Aチーム,佐藤 健太,2年,172.0,68.2,54.2,14.9,1570,23.1,26.2,3.2,3.4,8.7,8.9
2026-07-20,Aチーム,鈴木 翔太,3年,182.0,82.0,65.8,13.8,1860,24.8,32.0,4.1,4.3,10.5,10.7
2026-07-20,Aチーム,高橋 陸,1年,168.0,64.5,49.5,16.5,1480,22.9,24.2,2.9,3.0,7.9,8.1
2026-07-20,Aチーム,田中 拓海,2年,175.0,74.2,58.2,16.5,1660,24.2,28.5,3.5,3.7,9.3,9.5
2026-07-20,Aチーム,渡辺 蓮,3年,180.0,80.0,63.8,14.2,1810,24.7,31.0,4.0,4.2,10.2,10.4
2026-10-15,Aチーム,山田 太郎,3年,178.0,78.5,62.5,14.2,1760,24.8,30.5,4.0,4.2,9.8,10.1
2026-10-15,Aチーム,佐藤 健太,2年,172.0,68.5,54.8,14.6,1580,23.2,26.5,3.3,3.5,8.8,9.0
2026-10-15,Aチーム,鈴木 翔太,3年,182.0,84.5,68.0,13.2,1900,25.5,33.0,4.3,4.5,10.9,11.2
2026-10-15,Aチーム,高橋 陸,1年,168.0,67.0,51.0,16.2,1520,23.7,25.0,3.0,3.1,8.3,8.5
2026-10-15,Aチーム,田中 拓海,2年,175.0,72.5,58.5,14.8,1640,23.7,28.0,3.5,3.7,9.2,9.4
2026-10-15,Aチーム,渡辺 蓮,3年,180.0,82.0,65.5,13.8,1850,25.3,31.8,4.1,4.3,10.5,10.7\n`;
    } else if (type === 'combined') {
      filename = '打撃データ入力フォーマット_統合データ.csv';
      content = 'Date,Player Name,Team,Grade,Bat Speed,Exit Velocity,Launch Angle,Direction,Distance,Attack Angle,Time to Contact,On Plane Efficiency,Peak Hand Speed,Pitch Speed\n2026-09-01,山田 太郎,Aチーム,3年,142.5,155.0,24.0,-12.5,110,12.5,0.15,78.5,35.0,138.0\n';
    } else if (type === 'blast') {
      filename = '打撃データ入力フォーマット_Blast.csv';
      content = 'Date,Player Name,Bat Speed,Attack Angle,On Plane Efficiency,Connection Score,Rotation Score,Time to Contact,Peak Hand Speed,Power,Vertical Bat Angle\n2026-09-01,山田 太郎,142.5,12.5,78.5,60,65,0.15,35.0,4.2,30.0\n';
    } else if (type === 'savant') {
      filename = '打撃データ入力フォーマット_Rapsodo打撃.csv';
      content = 'Date,Player Name,Team,Exit Velocity,Launch Angle,Distance,Direction\n2026-09-01,山田 太郎,Aチーム,155.0,24.0,110,-12.5\n';
    } else if (type === 'savant_pitching') {
      filename = '投球データ入力フォーマット_Rapsodo投球.csv';
      content = 'Date,Pitcher Name,Team,Pitch Type,Pitch Speed,Spin Rate,Spin Axis,VB (trajectory),HB (trajectory),Release Height,Release Side\n2026-09-01,鈴木 翔太,Aチーム,Fastball,145.0,2250,1:15,42.5,15.2,1.80,0.45\n';
    } else if (type === 'body_comp') {
      filename = 'テスト体組成データ.csv';
      content = '日付,チーム名,選手名,身長,体重,筋肉量,体脂肪率,基礎代謝量,BMI,体幹,左腕,右腕,左足,右足\n' +
        '2026-09-01,Aチーム,山田 太郎,178.0,78.5,62.0,14.2,1750,24.8,30.2,3.8,4.1,9.8,10.1\n' +
        '2026-09-01,Aチーム,佐藤 健太,172.0,69.0,54.5,15.0,1580,23.3,26.5,3.2,3.4,8.8,9.0\n' +
        '2026-09-01,Aチーム,鈴木 翔太,182.0,84.0,67.5,13.5,1890,25.4,32.8,4.2,4.4,10.8,11.0\n' +
        '2026-09-01,Aチーム,高橋 陸,168.0,61.5,48.0,16.5,1450,21.8,23.4,2.8,2.9,7.6,7.8\n' +
        '2026-09-01,Aチーム,田中 拓海,175.0,73.0,58.0,14.8,1680,23.8,28.2,3.5,3.7,9.2,9.4\n' +
        '2026-09-01,Bチーム,渡辺 蓮,180.0,80.0,64.0,14.0,1810,24.7,31.0,4.0,4.2,10.2,10.4\n' +
        '2026-09-01,Bチーム,伊藤 颯太,170.0,65.0,51.5,15.8,1510,22.5,25.0,3.0,3.1,8.2,8.4\n';
    }

    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const blob = new Blob([bom, content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="animate-in fade-in duration-300">
      <header className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-white mb-2">データ管理</h2>
          <p className="text-slate-400">CSVファイルをアップロードして直接分析（ブラウザ内即時保存）します。</p>
        </div>
        <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700 flex flex-col sm:flex-row md:flex-col gap-3 w-full md:w-auto">
          {profile?.role === 'admin' && (
            <button 
              onClick={handleLoadSampleData}
              className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-extrabold py-2.5 px-4 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer border border-emerald-400/30 transform hover:scale-105"
            >
              <Sparkles className="w-4 h-4 text-emerald-200" />
              テストデータを一括セット
            </button>
          )}
          <button 
            onClick={handleCloudSync}
            disabled={isLoading}
            className="bg-slate-700 hover:bg-slate-600 disabled:opacity-30 text-slate-300 text-xs font-bold py-2 px-4 rounded-lg transition-all flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
          >
            {isLoading ? <RefreshCw className="w-3 h-3 animate-spin shrink-0" /> : <Cloud className="w-3 h-3 shrink-0" />}
            <span>クラウドから一括読込</span>
          </button>
        </div>
      </header>

      {/* Excel/CSV 入力フォーマットダウンロード セクション */}
      <div className="bg-slate-800/80 p-6 rounded-2xl border border-slate-700/80 mb-8 max-w-5xl shadow-xl">
        <div className="flex items-center gap-3 mb-4 border-b border-slate-700 pb-3">
          <FileText className="w-5 h-5 text-emerald-400" />
          <div>
            <h3 className="text-base font-extrabold text-white">エクセル / CSV 入力フォーマットのダウンロード</h3>
            <p className="text-xs text-slate-400">各分析データを取り込むためのExcel・CSV空フォーマットをダウンロードできます</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
          {allowHitting && (
            <button
              onClick={() => downloadCSVTemplate('combined')}
              className="flex items-center justify-between p-3.5 bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-500/40 rounded-xl text-left transition-all group"
            >
              <div>
                <p className="text-xs font-bold text-emerald-300">1ファイル統合</p>
                <p className="text-[10px] text-slate-400 mt-0.5">速度・角度・名前・学年</p>
              </div>
              <span className="text-xs font-bold text-emerald-400 group-hover:translate-y-0.5 transition-transform">↓ DL</span>
            </button>
          )}

          {SHOW_BODY_COMP_MODULE && allowBodyComp && (
            <button
              onClick={() => downloadCSVTemplate('body_comp')}
              className="flex items-center justify-between p-3.5 bg-cyan-950/40 hover:bg-cyan-900/60 border border-cyan-500/40 rounded-xl text-left transition-all group"
            >
              <div>
                <p className="text-xs font-bold text-cyan-300">体組成データ</p>
                <p className="text-[10px] text-slate-400 mt-0.5">身長・体重・筋肉量 (FFMI自動計算)</p>
              </div>
              <span className="text-xs font-bold text-cyan-400 group-hover:translate-y-0.5 transition-transform">↓ DL</span>
            </button>
          )}

          {SHOW_PITCHER_MODULE && allowPitching && (
            <button
              onClick={() => downloadCSVTemplate('savant_pitching')}
              className="flex items-center justify-between p-3.5 bg-amber-950/40 hover:bg-amber-900/60 border border-amber-500/40 rounded-xl text-left transition-all group"
            >
              <div>
                <p className="text-xs font-bold text-amber-300">Rapsodo 投球</p>
                <p className="text-[10px] text-slate-400 mt-0.5">球速・回転数・VB/HB (traj)</p>
              </div>
              <span className="text-xs font-bold text-amber-400 group-hover:translate-y-0.5 transition-transform">↓ DL</span>
            </button>
          )}

          {allowHitting && (
            <button
              onClick={() => downloadCSVTemplate('savant')}
              className="flex items-center justify-between p-3.5 bg-blue-950/40 hover:bg-blue-900/60 border border-blue-500/40 rounded-xl text-left transition-all group"
            >
              <div>
                <p className="text-xs font-bold text-blue-300">Rapsodo 打撃</p>
                <p className="text-[10px] text-slate-400 mt-0.5">ExitVelocity・LaunchAngle</p>
              </div>
              <span className="text-xs font-bold text-blue-400 group-hover:translate-y-0.5 transition-transform">↓ DL</span>
            </button>
          )}

          {allowHitting && (
            <button
              onClick={() => downloadCSVTemplate('blast')}
              className="flex items-center justify-between p-3.5 bg-purple-950/40 hover:bg-purple-900/60 border border-purple-500/40 rounded-xl text-left transition-all group"
            >
              <div>
                <p className="text-xs font-bold text-purple-300">Blast Motion</p>
                <p className="text-[10px] text-slate-400 mt-0.5">バット速度・アッパー等</p>
              </div>
              <span className="text-xs font-bold text-purple-400 group-hover:translate-y-0.5 transition-transform">↓ DL</span>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-5xl">
        {/* Combined Card */}
        {allowHitting && (
          <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50">
            <div className="flex justify-between items-center mb-4 gap-2">
              <div className="min-w-0 flex-1 mr-2">
                <h3 className="text-xl font-bold text-white flex items-center mb-1">
                  <span className="bg-emerald-500 w-3 h-6 rounded-full mr-3 shrink-0"></span>
                  <span className="truncate">1ファイル統合データ</span>
                </h3>
                <p className="text-xs text-slate-400">打撃・名前・学年統合CSV</p>
              </div>
              <label className="cursor-pointer bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-emerald-900/20 whitespace-nowrap shrink-0">
                ファイルを選択
                <input 
                  ref={el => fileInputRefs.current['combined'] = el} 
                  type="file" 
                  accept=".csv" 
                  className="hidden" 
                  onChange={(e) => handleFileUpload(e, 'combined')} 
                />
              </label>
            </div>
            {renderDataView(combinedFiles, 'combined')}
          </div>
        )}

        {/* Body Comp Card (Conditional - Cyan theme) */}
        {SHOW_BODY_COMP_MODULE && allowBodyComp && (
          <div className="bg-slate-800/40 p-6 rounded-2xl border border-cyan-500/30">
            <div className="flex justify-between items-center mb-6 gap-2">
              <h3 className="text-xl font-bold text-white flex items-center min-w-0 flex-1 mr-2">
                <span className="bg-cyan-500 w-3 h-6 rounded-full mr-3 shrink-0"></span>
                <span className="truncate">体組成データ (Body Composition)</span>
              </h3>
              <label className="cursor-pointer bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-cyan-900/20 whitespace-nowrap shrink-0">
                ファイルを選択
                <input 
                  ref={el => fileInputRefs.current['body_comp'] = el} 
                  type="file" 
                  accept=".csv" 
                  className="hidden" 
                  onChange={(e) => handleFileUpload(e, 'body_comp')} 
                />
              </label>
            </div>
            {renderDataView(bodyCompFiles, 'body_comp')}
          </div>
        )}

        {/* Rapsodo Pitching Card (Conditional) */}
        {SHOW_PITCHER_MODULE && allowPitching && (
          <div className="bg-slate-800/40 p-6 rounded-2xl border border-amber-500/30">
            <div className="flex justify-between items-center mb-6 gap-2">
              <h3 className="text-xl font-bold text-white flex items-center min-w-0 flex-1 mr-2">
                <span className="bg-amber-500 w-3 h-6 rounded-full mr-3 shrink-0"></span>
                <span className="truncate">Rapsodo 投球データ (Pitching)</span>
              </h3>
              <label className="cursor-pointer bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-amber-900/20 whitespace-nowrap shrink-0">
                ファイルを選択
                <input 
                  ref={el => fileInputRefs.current['savant_pitching'] = el} 
                  type="file" 
                  accept=".csv" 
                  className="hidden" 
                  onChange={(e) => handleFileUpload(e, 'savant_pitching')} 
                />
              </label>
            </div>
            {renderDataView(savantPitchingFiles, 'savant_pitching')}
          </div>
        )}

        {/* Rapsodo Hitting Card */}
        {allowHitting && (
          <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50">
            <div className="flex justify-between items-center mb-6 gap-2">
              <h3 className="text-xl font-bold text-white flex items-center min-w-0 flex-1 mr-2">
                <span className="bg-blue-500 w-3 h-6 rounded-full mr-3 shrink-0"></span>
                <span className="truncate">Rapsodo 打撃データ (Hitting)</span>
              </h3>
              <label className="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-blue-900/20 whitespace-nowrap shrink-0">
                ファイルを選択
                <input 
                  ref={el => fileInputRefs.current['savant'] = el} 
                  type="file" 
                  accept=".csv" 
                  className="hidden" 
                  onChange={(e) => handleFileUpload(e, 'savant')} 
                />
              </label>
            </div>
            {renderDataView(savantFiles, 'savant')}
          </div>
        )}

        {/* Blast Card */}
        {allowHitting && (
          <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50">
            <div className="flex justify-between items-center mb-6 gap-2">
              <h3 className="text-xl font-bold text-white flex items-center min-w-0 flex-1 mr-2">
                <span className="bg-purple-500 w-3 h-6 rounded-full mr-3 shrink-0"></span>
                <span className="truncate">Blast Data (バット計測)</span>
              </h3>
              <label className="cursor-pointer bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-purple-900/20 whitespace-nowrap shrink-0">
                ファイルを選択
                <input 
                  ref={el => fileInputRefs.current['blast'] = el} 
                  type="file" 
                  accept=".csv" 
                  className="hidden" 
                  onChange={(e) => handleFileUpload(e, 'blast')} 
                />
              </label>
            </div>
            {renderDataView(blastFiles, 'blast')}
          </div>
        )}
      </div>

      {(
        (allowHitting && (savantFiles.length > 0 || blastFiles.length > 0 || combinedFiles.length > 0)) ||
        (SHOW_PITCHER_MODULE && allowPitching && savantPitchingFiles.length > 0) ||
        (SHOW_BODY_COMP_MODULE && allowBodyComp && bodyCompFiles.length > 0)
      ) && (
        <div className="mt-10 p-6 bg-blue-900/20 border border-blue-500/30 rounded-2xl flex flex-col sm:flex-row items-center justify-between">
          <div>
            <h4 className="text-lg font-bold text-blue-100 mb-1">データの準備ができました！</h4>
            <p className="text-blue-300 text-sm">左側のメニューから各分析画面に進んでください。</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-4 sm:mt-0">
            {allowHitting && (
              <button 
                onClick={() => setActiveView('team')}
                className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-5 rounded-xl shadow-lg transition-transform transform hover:scale-105 text-sm"
              >
                打撃分析を見る
              </button>
            )}
            {SHOW_PITCHER_MODULE && allowPitching && (
              <button 
                onClick={() => setActiveView('pitcher')}
                className="bg-amber-600 hover:bg-amber-500 text-white font-bold py-3 px-5 rounded-xl shadow-lg transition-transform transform hover:scale-105 text-sm"
              >
                投手分析を見る
              </button>
            )}
            {SHOW_BODY_COMP_MODULE && allowBodyComp && (
              <button 
                onClick={() => setActiveView('bodyComp')}
                className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-3 px-5 rounded-xl shadow-lg transition-transform transform hover:scale-105 text-sm"
              >
                体組成分析を見る
              </button>
            )}
            <button 
              onClick={() => setActiveView('player')}
              className="bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 px-5 rounded-xl shadow-lg transition-transform transform hover:scale-105 text-sm"
            >
              個人分析を見る
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default UploadPage;
