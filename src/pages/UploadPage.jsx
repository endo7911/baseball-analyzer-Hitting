import React from 'react';
import Papa from 'papaparse';
import { UploadCloud, FileText, Database, Cloud, Save, RefreshCw, X, Sparkles, Zap } from 'lucide-react';
import { getSupabase } from '../lib/supabase';

function UploadPage({ savantFiles, blastFiles, combinedFiles, updateDataState, setActiveView, saveToCloud, syncState, profile, fetchFromCloud }) {
  const [isLoading, setIsLoading] = React.useState(false);

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
    alert("テスト（サンプル）データ（7選手・70打席分）を読み込みました！\n下部のボタンまたは左メニューから「チーム分析」「個人成績」に進んでデザインをご確認ください。");
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
      
      // Try UTF-8 first
      let decoder = new TextDecoder('utf-8');
      let text = decoder.decode(arrayBuffer);
      
      // If it looks like Shift-JIS (common for Japanese Blast CSVs) or markers are missing, try Shift-JIS
      const hasUtf8Markers = text.includes('©Blast Motion') || text.includes('Date') || text.includes('バットスピード');
      if (!hasUtf8Markers) {
        try {
          decoder = new TextDecoder('shift-jis');
          const sjisText = decoder.decode(arrayBuffer);
          if (sjisText.includes('©Blast Motion') || sjisText.includes('日付') || sjisText.includes('バットスピード')) {
            text = sjisText;
          }
        } catch (err) {
          console.error("Shift-JIS decoding failed", err);
        }
      }

      let csvText = text;
      // If it's Blast data, skip the first few lines of metadata
      if (type === 'blast' || text.includes('©Blast Motion') || text.includes('Blast Motion')) {
        const lines = text.split(/\r?\n/);
        let headerIndex = -1;
        for (let i = 0; i < Math.min(lines.length, 30); i++) {
          const line = lines[i];
          if ((line.includes('Date') || line.includes('日付')) &&
              (line.includes('Bat Speed') || line.includes('スイング') || line.includes('バットスピード') || line.includes('スピード'))) {
            headerIndex = i;
            break;
          }
        }
        
        if (headerIndex !== -1) {
          csvText = lines.slice(headerIndex).join('\n');
          console.log(`Blast Header found at line ${headerIndex + 1}`);
        } else {
          console.warn("Blast header not found, using raw text");
        }
      }

      Papa.parse(csvText, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: (results) => {
          const headers = results.meta.fields || [];
          
          // Enhanced mapping to ensure columns like 'バットスピード (mph)' are cleaned up for headers list
          // but we keep raw results for now. dataHelpers will handle the fuzzy match.
          
          const isSavant = headers.includes('launch_speed') || headers.includes('player_name') || headers.includes('batter_name');
          const isBlast = headers.some(h => h.includes('オンプレーン') || h.includes('バットスピード') || h.includes('アタックアングル') || h.includes('Bat Speed'));

          if (type === 'savant' && isBlast && !isSavant) {
            alert("警告: BlastデータがRapsodoスロットにアップロードされた可能性があります。");
          }

          updateDataState(type, {
            filename: file.name,
            headers: headers,
            data: results.data
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
          <p className="text-xs opacity-75 mt-1 text-center px-4">CSVファイルを選択するか、<br/>クラウドから同期してください</p>
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
          <button 
            onClick={() => files.forEach(f => saveToCloud(typeLabel.toLowerCase(), f))}
            disabled={syncState.saving}
            className={`flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              syncState.saving ? 'bg-slate-700 text-slate-500 cursor-wait' : 'bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border border-emerald-500/30'
            }`}
          >
            <Save className={`w-3.5 h-3.5 ${syncState.saving ? 'animate-pulse' : ''}`} />
            保存
          </button>
        </div>
        
        <div className="text-xs text-slate-300 mb-2 flex-1 overflow-y-auto pr-2 space-y-1">
          {files.map((f, idx) => (
            <div key={idx} className="bg-slate-800/50 px-2 py-1.5 rounded truncate border border-slate-700/50 flex justify-between items-center group">
              <span className="truncate mr-2">{f.filename}</span>
              <div className="flex items-center gap-2">
                <span className="text-slate-500 text-[10px]">{f.data?.length || 0}行</span>
                <button 
                  onClick={() => updateDataState(typeLabel.toLowerCase(), idx, 'remove')}
                  className="p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors"
                  title="このファイルを削除"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
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
      content = '日付,選手名,学年,スイング速度,打球速度,打球角度,打球方向,推定飛距離,アタックアングル,スイング時間,オンプレーン効率,手の最大速度,球速\n2026-09-01,山田 太郎,3年,142.5,155.0,24.0,-12.5,110,12.5,0.15,78.5,35.0,138.0\n';
    } else if (type === 'blast') {
      filename = '打撃データ入力フォーマット_Blast.csv';
      content = '日付,選手名,バットスピード,アッパースイング,オンプレーン効率,体とバットの角度スコア,体の回転による加速スコア,スイング時間,手の最大,パワー,垂直バット角度\n2026-09-01,山田 太郎,142.5,12.5,78.5,60,65,0.15,35.0,4.2,30.0\n';
    } else if (type === 'savant') {
      filename = '打撃データ入力フォーマット_Rapsodo.csv';
      content = 'Date,Player Name,Team,ExitVelocity,LaunchAngle,Distance,HitDirection\n2026-09-01,山田 太郎,Aチーム,155.0,24.0,110,-12.5\n';
    }

    // UTF-8 BOM for Microsoft Excel compatibility (prevents garbled Japanese text)
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
            <h3 className="text-base font-extrabold text-white">エクセル / CSV 入力フォーマットのダウンロード</h3>
            <p className="text-xs text-slate-400">Excel等で直接入力できる空フォーマット（ヘッダー項目設定済み）を取得できます</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          <button
            onClick={() => downloadCSVTemplate('combined')}
            className="flex items-center justify-between p-3.5 bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-500/40 rounded-xl text-left transition-all group"
          >
            <div>
              <p className="text-xs font-bold text-emerald-300">1ファイル統合フォーマット</p>
              <p className="text-[10px] text-slate-400 mt-0.5">日付・チーム・名前・速度・角度</p>
            </div>
            <span className="text-xs font-bold text-emerald-400 group-hover:translate-y-0.5 transition-transform">↓ DL</span>
          </button>

          <button
            onClick={() => downloadCSVTemplate('blast')}
            className="flex items-center justify-between p-3.5 bg-purple-950/40 hover:bg-purple-900/60 border border-purple-500/40 rounded-xl text-left transition-all group"
          >
            <div>
              <p className="text-xs font-bold text-purple-300">Blast Motion フォーマット</p>
              <p className="text-[10px] text-slate-400 mt-0.5">バット速度・アッパー・回転加速</p>
            </div>
            <span className="text-xs font-bold text-purple-400 group-hover:translate-y-0.5 transition-transform">↓ DL</span>
          </button>

          <button
            onClick={() => downloadCSVTemplate('savant')}
            className="flex items-center justify-between p-3.5 bg-blue-950/40 hover:bg-blue-900/60 border border-blue-500/40 rounded-xl text-left transition-all group"
          >
            <div>
              <p className="text-xs font-bold text-blue-300">Rapsodo フォーマット</p>
              <p className="text-[10px] text-slate-400 mt-0.5">ExitVelocity・LaunchAngle 等</p>
            </div>
            <span className="text-xs font-bold text-blue-400 group-hover:translate-y-0.5 transition-transform">↓ DL</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-5xl">
        {/* Savant Card */}
        <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold text-white flex items-center">
              <span className="bg-blue-500 w-3 h-6 rounded-full mr-3"></span>
              Rapsodo Data
            </h3>
            <label className="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-blue-900/20">
              ファイルを選択
              <input type="file" accept=".csv" className="hidden" onChange={(e) => handleFileUpload(e, 'savant')} />
            </label>
          </div>
          {renderDataView(savantFiles, 'savant')}
        </div>

        {/* Blast Card */}
        <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold text-white flex items-center">
              <span className="bg-purple-500 w-3 h-6 rounded-full mr-3"></span>
              Blast Data
            </h3>
            <label className="cursor-pointer bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-purple-900/20">
              ファイルを選択
              <input type="file" accept=".csv" className="hidden" onChange={(e) => handleFileUpload(e, 'blast')} />
            </label>
          </div>
          {renderDataView(blastFiles, 'blast')}
        </div>

        {/* Combined Card */}
        <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50 col-span-1 lg:col-span-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <div>
              <h3 className="text-xl font-bold text-white flex items-center mb-1">
                <span className="bg-emerald-500 w-3 h-6 rounded-full mr-3"></span>
                1ファイル統合データ (Combined CSV)
              </h3>
              <p className="text-xs text-slate-400">
                スイング速度・打球速度・アッパー・打球角度・名前・学年が1ファイルにまとまったCSVデータに対応
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {profile?.role === 'admin' && (
                <button
                  onClick={handleLoadSampleData}
                  className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 px-4 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md"
                >
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  テストデータをセット
                </button>
              )}
              <label className="cursor-pointer bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all shadow-lg shadow-emerald-900/30 whitespace-nowrap">
                統合ファイルを選択
                <input type="file" accept=".csv" className="hidden" onChange={(e) => handleFileUpload(e, 'combined')} />
              </label>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-2 mb-4">
            <span className="px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-[11px] font-bold">名前 / 選手名</span>
            <span className="px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-[11px] font-bold">学年</span>
            <span className="px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-[11px] font-bold">スイング速度</span>
            <span className="px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-[11px] font-bold">打球速度</span>
            <span className="px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-[11px] font-bold">アッパー (アタックアングル)</span>
            <span className="px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-[11px] font-bold">打球角度</span>
          </div>

          {renderDataView(combinedFiles, 'combined')}
        </div>
      </div>

      {(savantFiles.length > 0 || blastFiles.length > 0 || combinedFiles.length > 0) && (
        <div className="mt-10 p-6 bg-blue-900/20 border border-blue-500/30 rounded-2xl flex flex-col sm:flex-row items-center justify-between">
          <div>
            <h4 className="text-lg font-bold text-blue-100 mb-1">データの準備ができました！</h4>
            <p className="text-blue-300 text-sm">左側のメニューから「チーム分析」や「個人成績」に進んでください。</p>
          </div>
          <button 
            onClick={() => setActiveView('team')}
            className="mt-4 sm:mt-0 bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-6 rounded-xl shadow-lg transition-transform transform hover:scale-105"
          >
            チーム分析を見る
          </button>
        </div>
      )}
    </div>
  );
}

export default UploadPage;
