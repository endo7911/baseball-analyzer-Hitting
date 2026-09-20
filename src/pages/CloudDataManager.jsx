import React, { useState, useEffect } from 'react';
import Papa from 'papaparse';
import { supabase, getSupabase } from '../lib/supabase';
import { Database, Trash2, RefreshCw, HardDrive, CheckCircle2, AlertCircle, Eye, EyeOff } from 'lucide-react';

function CloudDataManager({ updateDataState, profile, syncState, fetchFromCloud }) {
  const [loading, setLoading] = useState(false);
  const [datasets, setDatasets] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => { fetchDatasets(); }, []);

  const handleManualSync = async () => {
    await fetchFromCloud();
    fetchDatasets();
  };

  const fetchDatasets = async () => {
    setLoading(true);
    setError(null);
    const client = getSupabase();
    try {
      // 1. Fetch from new unified table
      let query = client.from('baseball_data').select('id, type, filename, updated_at, is_csv').order('updated_at', { ascending: false });
      if (profile && profile.role !== 'admin') {
        if (profile.team_id) {
          query = query.eq('team_id', profile.team_id);
        } else if (profile.id) {
          query = query.eq('owner_id', profile.id);
        }
      }
      const { data: unifiedData, error: unifiedError } = await query;
      
      // 2. Fetch from legacy tables
      let savantLegacyQuery = client.from('savant_data').select('file_name, created_at');
      let blastLegacyQuery = client.from('blast_data').select('file_name, created_at');
      
      if (profile && profile.role !== 'admin') {
        if (profile.team_id) {
          savantLegacyQuery = savantLegacyQuery.eq('team_id', profile.team_id);
          blastLegacyQuery = blastLegacyQuery.eq('team_id', profile.team_id);
        } else if (profile.id) {
          savantLegacyQuery = savantLegacyQuery.eq('owner_id', profile.id);
          blastLegacyQuery = blastLegacyQuery.eq('owner_id', profile.id);
        }
      }
      
      const { data: savantLegacy } = await savantLegacyQuery.limit(1000);
      const { data: blastLegacy } = await blastLegacyQuery.limit(1000);

      // Process legacy data into a similar format
      const processedLegacy = [];
      if (savantLegacy) {
        const uniqueSavant = [...new Set(savantLegacy.map(item => item.file_name))].filter(Boolean);
        uniqueSavant.forEach(name => {
          const item = savantLegacy.find(i => i.file_name === name);
          processedLegacy.push({
            id: `legacy-savant-${name}`,
            type: 'savant',
            filename: name,
            updated_at: item.created_at,
            is_legacy: true
          });
        });
      }
      if (blastLegacy) {
        const uniqueBlast = [...new Set(blastLegacy.map(item => item.file_name))].filter(Boolean);
        uniqueBlast.forEach(name => {
          const item = blastLegacy.find(i => i.file_name === name);
          processedLegacy.push({
            id: `legacy-blast-${name}`,
            type: 'blast',
            filename: name,
            updated_at: item.created_at,
            is_legacy: true
          });
        });
      }

      setDatasets([...(unifiedData || []), ...processedLegacy]);
    } catch (err) {
      console.error(err);
      setError(err.message || "データの取得に失敗しました。");
    } finally {
      setLoading(false);
    }
  };

  const deleteDataset = async (id, type, filename, isLegacy) => {
    if (!window.confirm(`「${filename}」を削除してもよろしいですか？`)) return;
    
    const client = getSupabase();
    try {
      if (isLegacy) {
        const table = type === 'savant' ? 'savant_data' : 'blast_data';
        const { error } = await client.from(table).delete().eq('file_name', filename);
        if (error) throw error;
      } else {
        let query = client.from('baseball_data').delete().eq('id', id);
        if (profile && profile.role !== 'admin' && profile.team_id) {
          query = query.eq('team_id', profile.team_id);
        }
        const { error } = await query;
        if (error) throw error;
        updateDataState(type, id, 'remove');
      }
      fetchDatasets();
      alert("削除しました。");
    } catch (err) {
      console.error(err);
      alert("削除に失敗しました。");
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
            syncState?.saving ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-500 shadow-xl'
          }`}
        >
          <RefreshCw className={`w-5 h-5 ${syncState?.saving ? 'animate-spin' : ''}`} />
          {syncState?.saving ? '同期中...' : 'クラウドから同期'}
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
        {datasets.length === 0 ? (
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
                          dataset.type === 'blast' ? 'bg-purple-600/20 text-purple-400 border border-purple-500/30' : 
                          'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30'
                        }`}>
                          {dataset.type}
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
                      {dataset.updated_at ? new Date(dataset.updated_at).toLocaleString('ja-JP') : '不明'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => deleteDataset(dataset.id, dataset.type, dataset.filename, dataset.is_legacy)}
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
