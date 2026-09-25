import React, { useState, useEffect } from 'react';
import { getSupabase } from '../lib/supabase';
import { Database, Trash2, RefreshCw, HardDrive, AlertCircle } from 'lucide-react';

function CloudDataManager({ updateDataState, profile, syncState, fetchFromCloud }) {
  const [loading, setLoading] = useState(false);
  const [datasets, setDatasets] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => { 
    fetchDatasets(); 
  }, [profile]);

  const handleManualSync = async () => {
    if (fetchFromCloud) await fetchFromCloud();
    await fetchDatasets();
  };

  const fetchDatasets = async () => {
    setLoading(true);
    setError(null);
    const client = getSupabase();
    try {
      const userTeamName = profile?.team_name;
      const userTeamId = profile?.team_id;
      const userId = profile?.id;

      // 1. Fetch from unified table (baseball_data)
      const { data: baseballRows, error: bError } = await client
        .from('baseball_data')
        .select('file_name, upload_id, updated_at, created_at, team_name')
        .limit(5000);

      if (bError) {
        console.warn("baseball_data fetch error:", bError);
      }

      // 2. Fetch from legacy/dedicated tables (savant_data, blast_data, pitching_data)
      const { data: savantRows, error: sError } = await client
        .from('savant_data')
        .select('file_name, upload_id, updated_at, created_at')
        .limit(5000);

      const { data: blastRows, error: blError } = await client
        .from('blast_data')
        .select('file_name, upload_id, updated_at, created_at')
        .limit(5000);

      const { data: pitchingRows, error: pError } = await client
        .from('pitching_data')
        .select('file_name, upload_id, updated_at, created_at')
        .limit(5000);

      if (sError) console.warn("savant_data fetch error:", sError);
      if (blError) console.warn("blast_data fetch error:", blError);
      if (pError) console.warn("pitching_data fetch error:", pError);

      const userEmail = (profile?.email || profile?.display_name || '').trim().toLowerCase();

      const isRowForUser = (row) => {
        if (!row) return false;
        const uId = String(row.upload_id || '').toLowerCase();
        const tName = String(row.team_name || '').toLowerCase();
        if (uId.includes('::')) {
          const emailPrefix = uId.split('::')[0];
          return emailPrefix === userEmail;
        }
        if (tName === userEmail) return true;
        if (userEmail === 'admin@example.com' && !uId.includes('::')) return true;
        return false;
      };

      const datasetMap = new Map();

      // Process baseball_data (unified combined table)
      (baseballRows || []).forEach(row => {
        if (!isRowForUser(row)) return;

        const name = row.file_name || row.upload_id || 'ファイル名なし';
        if (name.startsWith('__')) return;
        const key = `baseball-${name}`;
        if (!datasetMap.has(key)) {
          datasetMap.set(key, {
            id: key,
            type: 'combined',
            filename: name,
            updated_at: row.updated_at || row.created_at,
            table: 'baseball_data',
            is_legacy: false,
            count: 1
          });
        } else {
          datasetMap.get(key).count += 1;
        }
      });

      // Process pitching_data
      const pitchingFileMap = new Map();
      (pitchingRows || []).forEach(row => {
        if (!isRowForUser(row)) return;
        const name = row.file_name || row.upload_id;
        if (!name) return;
        const key = `pitching-${name}`;
        if (!datasetMap.has(key)) {
          datasetMap.set(key, {
            id: key,
            type: 'savant_pitching',
            filename: name,
            updated_at: row.updated_at || row.created_at,
            table: 'pitching_data',
            is_legacy: false,
            count: 1
          });
        } else {
          datasetMap.get(key).count += 1;
        }
      });

      // Process savant_data
      const savantFileMap = new Map();
      (savantRows || []).forEach(row => {
        if (!isRowForUser(row)) return;
        const name = row.file_name || row.upload_id;
        if (!name) return;
        if (!savantFileMap.has(name)) {
          savantFileMap.set(name, row.updated_at || row.created_at);
        }
      });

      // Process blast_data
      const blastFileMap = new Map();
      (blastRows || []).forEach(row => {
        if (!isRowForUser(row)) return;
        const name = row.file_name || row.upload_id;
        if (!name) return;
        if (!blastFileMap.has(name)) {
          blastFileMap.set(name, row.updated_at || row.created_at);
        }
      });

      const legacyNames = new Set([...savantFileMap.keys(), ...blastFileMap.keys()]);
      legacyNames.forEach(name => {
        // Skip if captured in baseball_data
        if (datasetMap.has(`baseball-${name}`)) return;

        const inSavant = savantFileMap.has(name);
        const inBlast = blastFileMap.has(name);
        const updatedAt = savantFileMap.get(name) || blastFileMap.get(name);

        if (inSavant && inBlast) {
          datasetMap.set(`legacy-combined-${name}`, {
            id: `legacy-combined-${name}`,
            type: 'combined',
            filename: name,
            updated_at: updatedAt,
            is_legacy: true,
            table: 'both'
          });
        } else if (inSavant) {
          datasetMap.set(`legacy-savant-${name}`, {
            id: `legacy-savant-${name}`,
            type: 'savant',
            filename: name,
            updated_at: updatedAt,
            is_legacy: true,
            table: 'savant_data'
          });
        } else if (inBlast) {
          datasetMap.set(`legacy-blast-${name}`, {
            id: `legacy-blast-${name}`,
            type: 'blast',
            filename: name,
            updated_at: updatedAt,
            is_legacy: true,
            table: 'blast_data'
          });
        }
      });

      const datasetList = Array.from(datasetMap.values()).sort((a, b) => {
        const dateA = new Date(a.updated_at || 0);
        const dateB = new Date(b.updated_at || 0);
        return dateB - dateA;
      });

      setDatasets(datasetList);
    } catch (err) {
      console.error("fetchDatasets error:", err);
      setError(err.message || "データの取得に失敗しました。");
    } finally {
      setLoading(false);
    }
  };

  const deleteDataset = async (dataset) => {
    const { filename, type, table } = dataset;
    if (!window.confirm(`「${filename}」を削除してもよろしいですか？`)) return;
    
    setLoading(true);
    const client = getSupabase();
    try {
      if (table === 'both') {
        await client.from('savant_data').delete().eq('file_name', filename);
        await client.from('blast_data').delete().eq('file_name', filename);
      } else if (table === 'baseball_data') {
        const { error } = await client.from('baseball_data').delete().eq('file_name', filename);
        if (error) throw error;
      } else if (table === 'pitching_data') {
        const { error } = await client.from('pitching_data').delete().eq('file_name', filename);
        if (error) throw error;
      } else {
        const targetTable = table || (type === 'savant' ? 'savant_data' : 'blast_data');
        const { error } = await client.from(targetTable).delete().eq('file_name', filename);
        if (error) throw error;
      }

      if (updateDataState) {
        updateDataState(type, filename, 'remove');
      }
      if (fetchFromCloud) {
        await fetchFromCloud();
      }
      await fetchDatasets();
      alert("削除しました。");
    } catch (err) {
      console.error("Delete dataset error:", err);
      alert("削除に失敗しました: " + (err.message || JSON.stringify(err)));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-in fade-in duration-500">
      <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-white mb-2 flex items-center">
            <HardDrive className="w-8 h-8 mr-3 text-blue-400" />
            クラウドデータ管理
          </h2>
          <p className="text-slate-400">サーバーに保存されているファイルの確認・同期・削除を行います。</p>
        </div>
        <button 
          onClick={handleManualSync}
          disabled={syncState?.saving || loading}
          className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-black transition-all ${
            syncState?.saving || loading ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-500 shadow-xl'
          }`}
        >
          <RefreshCw className={`w-5 h-5 ${syncState?.saving || loading ? 'animate-spin' : ''}`} />
          {syncState?.saving || loading ? '同期中...' : 'クラウドから同期'}
        </button>
      </header>

      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/50 rounded-xl flex items-center gap-3 text-red-400">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <div>
            <p className="font-bold text-sm">エラーが発生しました</p>
            <p className="text-xs opacity-80">{error}</p>
          </div>
          <button onClick={fetchDatasets} className="ml-auto p-2 hover:bg-red-500/20 rounded-lg transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
        {loading && datasets.length === 0 ? (
          <div className="p-10 text-center text-slate-400 animate-pulse">
            クラウドデータを読み込み中...
          </div>
        ) : datasets.length === 0 ? (
          <div className="p-10 text-center text-slate-500">
            <Database className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p>クラウドに保存されているデータはありません。</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-900 border-b border-slate-700 text-xs uppercase text-slate-400">
                <tr>
                  <th className="px-6 py-4">種別</th>
                  <th className="px-6 py-4">ファイル名</th>
                  <th className="px-6 py-4">件数</th>
                  <th className="px-6 py-4">更新日時</th>
                  <th className="px-6 py-4 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {datasets.map((dataset) => (
                  <tr key={dataset.id} className="hover:bg-slate-700/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter ${
                          dataset.type === 'savant' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 
                          dataset.type === 'savant_pitching' ? 'bg-amber-600/20 text-amber-400 border border-amber-500/30' : 
                          dataset.type === 'blast' ? 'bg-purple-600/20 text-purple-400 border border-purple-500/30' : 
                          'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30'
                        }`}>
                          {dataset.type === 'savant' ? 'RAPSODO 打撃' : dataset.type === 'savant_pitching' ? 'RAPSODO 投球' : dataset.type === 'combined' ? '統合データ' : dataset.type?.toUpperCase()}
                        </span>
                        {dataset.is_legacy && (
                          <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-500 border border-amber-500/20 text-[9px] font-bold">LEGACY</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-200">
                      {dataset.filename}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-400">
                      {dataset.count ? `${dataset.count.toLocaleString()} 件` : '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-400">
                      {dataset.updated_at ? new Date(dataset.updated_at).toLocaleString('ja-JP') : '不明'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => deleteDataset(dataset)}
                        className="p-2 text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors border border-transparent hover:border-rose-500/30 inline-flex items-center gap-1"
                        title="削除"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span className="text-xs font-bold">削除</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default CloudDataManager;
