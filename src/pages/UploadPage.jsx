import React, { useRef } from 'react';
import Papa from 'papaparse';
import { UploadCloud, FileText, Database, Cloud, Save, RefreshCw, X, Sparkles, Zap, Target, Activity, Dumbbell } from 'lucide-react';
import { parseAnyDate, getRawDataValue, DEFAULT_DATE_KEYS, extractRowVal } from '../utils/dataHelpers';
import { getSupabase } from '../lib/supabase';
import { SHOW_PITCHER_MODULE, SHOW_BODY_COMP_MODULE } from '../config';

function UploadPage({ savantFiles, savantPitchingFiles = [], blastFiles, combinedFiles, bodyCompFiles = [], updateDataState, setActiveView, saveToCloud, syncState, profile, fetchFromCloud }) {
  const [isLoading, setIsLoading] = React.useState(false);
  const fileInputRefs = useRef({});

  const handleLoadSampleData = () => {
    const players = [
      { name: '山田 太郎', grade: '3年', team: 'Aチーム', baseBs: 142, baseEv: 155, baseAa: 12.5, baseLa: 24 },
      { name: '佐藤 健太', grade: '2年', team: 'Aチーム', baseBs: 136, baseEv: 146, baseAa: 9.8, baseLa: 19 },
      { name: '鈴木 翔太', grade: '3年', team: 'Aチーム', baseBs: 148, baseEv: 162, baseAa: 14.0, baseLa: 27 },
      { name: '高橋 陸',   grade: '1年', team: 'Aチーム', baseBs: 128, baseEv: 135, baseAa: 7.2, baseLa: 14 },
      { name: '田中 拓海', grade: '2年', team: 'Aチーム', baseBs: 140, baseEv: 150, baseAa: 11.0, baseLa: 21 },
      { name: '渡辺 蓮',   grade: '3年', team: 'Bチーム', baseBs: 145, baseEv: 158, baseAa: 13.2, baseLa: 25 },
      { name: '伊藤 颯太', grade: '1年', team: 'Bチーム', baseBs: 132, baseEv: 138, baseAa: 8.5, baseLa: 16 },
    ];

    const sampleRows = [];
    const dates = ['2026-09-01', '2026-09-05', '2026-09-10', '2026-09-15'];

    players.forEach((p) => {
      // 10 swings per player
      for (let i = 0; i < 10; i++) {
        const bsNoise = Math.sin(i * 1.5) * 4;
        const evNoise = Math.cos(i * 1.2) * 6;
        const aaNoise = Math.sin(i * 2.1) * 2;
        const laNoise = Math.cos(i * 1.8) * 4;

        const bs = Math.round((p.baseBs + bsNoise) * 10) / 10;
        const ev = Math.round((p.baseEv + evNoise) * 10) / 10;
        const aa = Math.round((p.baseAa + aaNoise) * 10) / 10;
        const la = Math.round((p.baseLa + laNoise) * 10) / 10;
        const dist = Math.round(ev * 0.68 + la * 1.1);

        sampleRows.push({
          'チーム名': p.team,
          '選手名': p.name,
          '学年': p.grade,
          'スイング速度': bs,
          '打球速度': ev,
          'アッパー': aa,
          '打球角度': la,
          '飛距離': dist,
          '日付': dates[i % dates.length],
          'Direction': ((i % 5 - 2) * 12).toFixed(1)
        });
      }
    });

    const samplePayload = {
      filename: 'サンプル統合打撃テストデータ.csv',
      headers: ['チーム名', '選手名', '学年', 'スイング速度', '打球速度', 'アッパー', '打球角度', '飛距離', '日付'],
      data: sampleRows
    };

    updateDataState('combined', samplePayload, 'add');

    if (SHOW_BODY_COMP_MODULE) {
      const sampleBodyRows = [
        { 'チーム名': 'Aチーム', '選手名': '山田 太郎', '身長': 178, '体重': 78.5, '筋肉量': 62.0, '体脂肪率': 14.2, '基礎代謝量': 1750, 'BMI': 24.8, '体幹': 30.2, '左腕': 3.8, '右腕': 4.1, '左足': 9.8, '右足': 10.1, '日付': '2026-09-01' },
        { 'チーム名': 'Aチーム', '選手名': '佐藤 健太', '身長': 172, '体重': 69.0, '筋肉量': 54.5, '体脂肪率': 15.0, '基礎代謝量': 1580, 'BMI': 23.3, '体幹': 26.5, '左腕': 3.2, '右腕': 3.4, '左足': 8.8, '右足': 9.0, '日付': '2026-09-01' },
        { 'チーム名': 'Aチーム', '選手名': '鈴木 翔太', '身長': 182, '体重': 84.0, '筋肉量': 67.5, '体脂肪率': 13.5, '基礎代謝量': 1890, 'BMI': 25.4, '体幹': 32.8, '左腕': 4.2, '右腕': 4.4, '左足': 10.8, '右足': 11.0, '日付': '2026-09-01' },
        { 'チーム名': 'Aチーム', '選手名': '高橋 陸',   '身長': 168, '体重': 61.5, '筋肉量': 48.0, '体脂肪率': 16.5, '基礎代謝量': 1450, 'BMI': 21.8, '体幹': 23.4, '左腕': 2.8, '右腕': 2.9, '左足': 7.6, '右足': 7.8, '日付': '2026-09-01' },
        { 'チーム名': 'Aチーム', '選手名': '田中 拓海', '身長': 175, '体重': 73.0, '筋肉量': 58.0, '体脂肪率': 14.8, '基礎代謝量': 1680, 'BMI': 23.8, '体幹': 28.2, '左腕': 3.5, '右腕': 3.7, '左足': 9.2, '右足': 9.4, '日付': '2026-09-01' },
        { 'チーム名': 'Bチーム', '選手名': '渡辺 蓮',   '身長': 180, '体重': 80.0, '筋肉量': 64.0, '体脂肪率': 14.0, '基礎代謝量': 1810, 'BMI': 24.7, '体幹': 31.0, '左腕': 4.0, '右腕': 4.2, '左足': 10.2, '右足': 10.4, '日付': '2026-09-01' },
        { 'チーム名': 'Bチーム', '選手名': '伊藤 颯太', '身長': 170, '体重': 65.0, '筋肉量': 51.5, '体脂肪率': 15.8, '基礎代謝量': 1510, 'BMI': 22.5, '体幹': 25.0, '左腕': 3.0, '右腕': 3.1, '左足': 8.2, '右足': 8.4, '日付': '2026-09-01' },
      ];
      updateDataState('body_comp', {
        filename: 'サンプル体組成テストデータ.csv',
        headers: Object.keys(sampleBodyRows[0]),
        data: sampleBodyRows
      }, 'add');
    }

    alert("テスト（サンプル）データ（7選手・打撃および体組成データ）を読み込みました！\n左メニューから「打撃分析」「体組成分析」「個人分析」に進んで動作をご確認ください。");
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
      const arrayBuffer = e.target.result;

      // UTF-8 (with / without BOM) and Shift-JIS (Excel on Japanese Windows) are both supported
      const text = decodeCsvBuffer(arrayBuffer);

      // Universal Header Row Detection for all CSV files (Blast, Rapsodo, Excel CSV exports)
      const lines = text.split(/\r?\n/);
      const headerIndex = findHeaderIndex(lines, type === 'body_comp' ? BODY_COMP_HEADER_KEYWORDS : []);

      let csvText = text;
      if (headerIndex > 0) {
        csvText = lines.slice(headerIndex).join('\n');
        console.log(`Header found at line ${headerIndex + 1}`);
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
          const fileDate = parseAnyDate(file.name);

          // Process and normalize rows
          const rows = (results.data || []).map(row => {
            if (!row) return row;
            
            // Normalize Date & backfill from filename if missing
            const rawDateVal = getRawDataValue(row, DEFAULT_DATE_KEYS);
            let normD = rawDateVal ? parseAnyDate(rawDateVal) : '';
            if (!normD && fileDate) normD = fileDate;

            if (normD) {
              row.date = normD;
              row.game_date = normD;
            }

            // Ensure launch_speed alias backfill
            const evVal = extractRowVal(row, ['launch_speed', 'exit_velocity', 'ExitVelocity', 'Exit Velocity', '打球速度', '打球初速', '打球スピード']);
            if (evVal != null) {
              row.launch_speed = evVal;
            }

            return row;
          });

          const isPitching = headers.some(h => ['Pitch Speed', 'PitchBallVelo', 'Spin Rate', 'Pitch Type', 'VB (trajectory)', 'HB (trajectory)', '球速', '回転数', '縦変化量'].includes(h));
          const isHitting = headers.some(h => ['launch_speed', 'ExitVelocity', 'LaunchAngle', '打球速度', '打球角度'].includes(h));

          if (type === 'savant' && isPitching && !isHitting) {
            alert("※提示: 投球データが「Rapsodo 打撃」スロットに選択されました。「Rapsodo 投球データ」スロットを使用すると投手分析でより正確に表示されます。");
          } else if (type === 'savant_pitching' && isHitting && !isPitching) {
            alert("※提示: 打撃データが「Rapsodo 投球」スロットに選択されました。「Rapsodo 打撃データ」スロットをおすすめします。");
          }

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
          alert("CSVのパースに失敗しました。");
        }
      });
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
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center">
            <FileText className="w-5 h-5 text-emerald-400 mr-2" />
            <span className="text-sm font-bold text-emerald-300">読込完了 ({files.length} ファイル)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button 
              onClick={() => {
                const targetView = typeLabel.toLowerCase().includes('body') ? 'bodyComp' : (typeLabel.toLowerCase().includes('pitching') ? 'pitcher' : (typeLabel.toLowerCase().includes('savant') || typeLabel.toLowerCase().includes('blast') ? 'player' : 'team'));
                setActiveView(targetView);
              }}
              className="flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-md transition-all cursor-pointer"
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
              className={`flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                syncState.saving ? 'bg-slate-700 text-slate-500 cursor-wait' : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
              }`}
            >
              <Save className={`w-3.5 h-3.5 ${syncState.saving ? 'animate-pulse' : ''}`} />
              クラウド同期
            </button>
            <button 
              onClick={() => {
                const fileType = typeLabel.toLowerCase().includes('body') ? 'body_comp' : (typeLabel.toLowerCase().includes('pitching') ? 'savant_pitching' : (typeLabel.toLowerCase().includes('savant') ? 'savant' : (typeLabel.toLowerCase().includes('blast') ? 'blast' : 'combined')));
                updateDataState(fileType, null, 'clear');
              }}
              title="この枠の読み込みファイルをクリア"
              className="px-2 py-1.5 rounded-lg text-xs font-bold bg-slate-800 hover:bg-rose-900/50 hover:text-rose-300 text-slate-400 border border-slate-700 transition-all"
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

    if (type === 'combined') {
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
            className="bg-slate-700 hover:bg-slate-600 disabled:opacity-30 text-slate-300 text-xs font-bold py-2 px-4 rounded-lg transition-all flex items-center justify-center gap-2"
          >
            {isLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Cloud className="w-3 h-3" />}
            クラウドから一括読込
          </button>
        </div>
      </header>

      {/* Excel/CSV 入力フォーマットダウンロード セクション */}
      <div className="bg-slate-800/80 p-6 rounded-2xl border border-slate-700/80 mb-8 max-w-5xl shadow-xl">
        <div className="flex items-center gap-3 mb-3 border-b border-slate-700 pb-3">
          <FileText className="w-5 h-5 text-emerald-400" />
          <div>
            <h3 className="text-base font-extrabold text-white">エクセル / CSV 入力フォーマット・テストデータのダウンロード</h3>
            <p className="text-xs text-slate-400">Excel等で使える空フォーマットおよび動作テスト用のサンプルCSVを取得できます</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
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

          {SHOW_BODY_COMP_MODULE && (
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

          {SHOW_PITCHER_MODULE && (
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
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-5xl">
        {/* Combined Card */}
        <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="text-xl font-bold text-white flex items-center mb-1">
                <span className="bg-emerald-500 w-3 h-6 rounded-full mr-3"></span>
                1ファイル統合データ
              </h3>
              <p className="text-xs text-slate-400">打撃・名前・学年統合CSV</p>
            </div>
            <label className="cursor-pointer bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-emerald-900/20 whitespace-nowrap">
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

        {/* Body Comp Card (Conditional - Cyan theme) */}
        {SHOW_BODY_COMP_MODULE && (
          <div className="bg-slate-800/40 p-6 rounded-2xl border border-cyan-500/30">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-white flex items-center">
                <span className="bg-cyan-500 w-3 h-6 rounded-full mr-3"></span>
                体組成データ (Body Composition)
              </h3>
              <label className="cursor-pointer bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-cyan-900/20">
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
        {SHOW_PITCHER_MODULE && (
          <div className="bg-slate-800/40 p-6 rounded-2xl border border-amber-500/30">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-white flex items-center">
                <span className="bg-amber-500 w-3 h-6 rounded-full mr-3"></span>
                Rapsodo 投球データ (Pitching)
              </h3>
              <label className="cursor-pointer bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-amber-900/20">
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
        <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold text-white flex items-center">
              <span className="bg-blue-500 w-3 h-6 rounded-full mr-3"></span>
              Rapsodo 打撃データ (Hitting)
            </h3>
            <label className="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-blue-900/20">
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

        {/* Blast Card */}
        <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold text-white flex items-center">
              <span className="bg-purple-500 w-3 h-6 rounded-full mr-3"></span>
              Blast Data (バット計測)
            </h3>
            <label className="cursor-pointer bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-purple-900/20">
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
      </div>

      {(savantFiles.length > 0 || savantPitchingFiles.length > 0 || blastFiles.length > 0 || combinedFiles.length > 0 || bodyCompFiles.length > 0) && (
        <div className="mt-10 p-6 bg-blue-900/20 border border-blue-500/30 rounded-2xl flex flex-col sm:flex-row items-center justify-between">
          <div>
            <h4 className="text-lg font-bold text-blue-100 mb-1">データの準備ができました！</h4>
            <p className="text-blue-300 text-sm">左側のメニューから各分析画面に進んでください。</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-4 sm:mt-0">
            <button 
              onClick={() => setActiveView('team')}
              className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-5 rounded-xl shadow-lg transition-transform transform hover:scale-105 text-sm"
            >
              打撃分析を見る
            </button>
            {SHOW_PITCHER_MODULE && (
              <button 
                onClick={() => setActiveView('pitcher')}
                className="bg-amber-600 hover:bg-amber-500 text-white font-bold py-3 px-5 rounded-xl shadow-lg transition-transform transform hover:scale-105 text-sm"
              >
                投手分析を見る
              </button>
            )}
            {SHOW_BODY_COMP_MODULE && (
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
