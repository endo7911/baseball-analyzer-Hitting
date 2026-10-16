import React, { useState, useEffect } from 'react';
import { getSupabase } from '../lib/supabase';
import { Database, Trash2, RefreshCw, HardDrive, AlertCircle } from 'lucide-react';
import { fetchDeletedFilesMap, recordDeletedFile } from '../services/deletedRegistry';

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
      const rawEmail = (profile?.email || profile?.display_name || '').trim().toLowerCase();
      const userEmail = rawEmail.includes('@') ? rawEmail : 'guest';
      const userUsername = userEmail.split('@')[0];
      const isAdmin = profile?.role === 'admin';
      const rawTeamName = (profile?.team_name || profile?.team_id || '').trim();
      const currentTeamName = rawTeamName.toLowerCase();
      const currentTeamId = (profile?.team_id || profile?.team_name || '').trim().toLowerCase();

      // Server-side filtered metadata fetch with seamless fallback if columns differ
      const fetchMetaFromTable = async (table, cols) => {
        if (!isAdmin && rawTeamName) {
          const encodedTeam = encodeURIComponent(rawTeamName);
          const safeTeam = rawTeamName.replace(/"/g, '');
          const filters = [
            `team_name.eq."${safeTeam}"`,
            `upload_id.ilike.%::team:${encodedTeam}::%`
          ];
          if (userEmail && userEmail !== 'guest') {
            filters.push(`upload_id.ilike.${userEmail}::%`);
          }
          if (table === 'baseball_data') {
            filters.push('file_name.eq.__deleted_files_registry_v1__');
          }
          const { data, error: fErr } = await client
            .from(table)
            .select(cols)
            .or(filters.join(','))
            .limit(5000);
          if (!fErr && Array.isArray(data)) {
            return data;
          }
        }
        const { data, error: qErr } = await client
          .from(table)
          .select(cols)
          .limit(5000);
        if (qErr) console.warn(`${table} fetch error:`, qErr);
        return data || [];
      };

      const [baseballRows, savantRows, blastRows, pitchingRows, bodyCompRows] = await Promise.all([
        fetchMetaFromTable('baseball_data', 'file_name, upload_id, updated_at, created_at, team_name'),
        fetchMetaFromTable('savant_data', 'file_name, upload_id, created_at'),
        fetchMetaFromTable('blast_data', 'file_name, upload_id, created_at'),
        fetchMetaFromTable('pitching_data', 'file_name, upload_id, created_at'),
        fetchMetaFromTable('body_comp_data', 'file_name, upload_id, created_at')
      ]);

      // 0. Extract deleted files registry from dedicated deleted_files_registry table + local + legacy
      const deletedFilesMap = await fetchDeletedFilesMap(client, baseballRows);

      const isFileDeleted = (fname, rowTime, uploadId) => {
        if (!fname) return false;
        const clean = fname.replace(/^__bodycomp__::/, '');
        const delEntry = deletedFilesMap.get(fname) || deletedFilesMap.get(clean);
        if (!delEntry) return false;
        const delTime = typeof delEntry === 'number' ? delEntry : (delEntry?.deletedAt || 0);

        let uploadTimestamp = 0;
        const uId = String(uploadId || '');
        const upMatch = uId.match(/::(?:up|bodycomp)::?(\d+)/);
        if (upMatch && upMatch[1]) {
          uploadTimestamp = parseInt(upMatch[1], 10);
        }

        const effectiveTime = Math.max(
          uploadTimestamp,
          rowTime ? new Date(rowTime).getTime() : 0
        );

        if (effectiveTime > 0 && effectiveTime > delTime + 2000) {
          return false; // Re-uploaded after deletion
        }
        return true;
      };

      const isRowForUser = (row) => {
        if (!row) return false;
        // 1. Admin has access to all datasets across all teams
        if (isAdmin) return true;

        const uId = String(row.upload_id || '').toLowerCase();
        let tName = String(row.team_name || row['チーム名'] || row['Team'] || '').toLowerCase();
        const tId = String(row.team_id || '').toLowerCase();

        // Extract team encoded in upload_id if present (e.g. ::team:team%20a::)
        if (!tName && uId.includes('::team:')) {
          const match = uId.match(/::team:([^:]+)::/);
          if (match && match[1]) {
            try { tName = decodeURIComponent(match[1]).toLowerCase(); } catch {}
          }
        }

        const isExplicitTeam = tName && tName !== 'unknown team' && tName !== '__system__' && !tName.includes('@');
        const isUserTeamMatch =
          (currentTeamName && (tName === currentTeamName || tId === currentTeamName)) ||
          (currentTeamId && (tId === currentTeamId || tName === currentTeamId));

        // 2. Team match: team members see all data for their team
        if (isUserTeamMatch) return true;

        // 3. STRICT MULTI-TENANT ISOLATION: If row is explicitly tagged with a different team, reject immediately
        if (isExplicitTeam && (currentTeamName || currentTeamId)) {
          return false;
        }

        // 4. User upload match (only if row has no explicit conflicting team)
        if (uId.includes('::')) {
          const emailPrefix = uId.split('::')[0];
          const uploaderUsername = emailPrefix.split('@')[0];
          return Boolean(
            userEmail &&
            userEmail !== 'guest' &&
            (emailPrefix === userEmail || 
             uploaderUsername === userUsername || 
             emailPrefix === userUsername ||
             uploaderUsername === userEmail)
          );
        }

        if (tName.includes('@')) {
          return Boolean(
            userEmail &&
            userEmail !== 'guest' &&
            (tName === userEmail || tName === userUsername)
          );
        }
        return false;
      };

      const datasetMap = new Map();

      // Process baseball_data (unified combined table)
      (baseballRows || []).forEach(row => {
        if (!isRowForUser(row)) return;

        const name = row.file_name || row.upload_id || 'ファイル名なし';
        if (isFileDeleted(name, row.updated_at || row.created_at, row.upload_id)) return;

        if (name.startsWith('__bodycomp__::')) {
          const cleanName = name.replace(/^__bodycomp__::/, '');
          if (isFileDeleted(cleanName, row.updated_at || row.created_at, row.upload_id)) return;
          const key = `body_comp-${cleanName}`;
          if (!datasetMap.has(key)) {
            datasetMap.set(key, {
              id: key,
              type: 'body_comp',
              filename: cleanName,
              updated_at: row.updated_at || row.created_at,
              table: 'baseball_data',
              is_legacy: false,
              is_fallback: true,
              count: 1
            });
          } else {
            datasetMap.get(key).count += 1;
          }
          return;
        }
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
        if (!name || isFileDeleted(name, row.updated_at || row.created_at, row.upload_id)) return;
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

      // Process body_comp_data
      (bodyCompRows || []).forEach(row => {
        if (!isRowForUser(row)) return;
        const name = row.file_name || row.upload_id;
        if (!name || isFileDeleted(name, row.updated_at || row.created_at, row.upload_id)) return;
        const key = `body_comp-${name}`;
        if (!datasetMap.has(key)) {
          datasetMap.set(key, {
            id: key,
            type: 'body_comp',
            filename: name,
            updated_at: row.updated_at || row.created_at,
            table: 'body_comp_data',
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
        if (!name || isFileDeleted(name, row.updated_at || row.created_at, row.upload_id)) return;
        if (!savantFileMap.has(name)) {
          savantFileMap.set(name, row.updated_at || row.created_at);
        }
      });

      // Process blast_data
      const blastFileMap = new Map();
      (blastRows || []).forEach(row => {
        if (!isRowForUser(row)) return;
        const name = row.file_name || row.upload_id;
        if (!name || isFileDeleted(name, row.updated_at || row.created_at, row.upload_id)) return;
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
      return datasetList;
    } catch (err) {
      console.error("fetchDatasets error:", err);
      setError(err.message || "データの取得に失敗しました。");
      return [];
    } finally {
      setLoading(false);
    }
  };

  const deleteDataset = async (dataset) => {
    const { filename, type, table } = dataset;

    // Security guard: never allow deleting system metadata or profiles
    if (!filename || filename.startsWith('__system') || filename === '__app_user_profiles_v1__') {
      alert("システム予約データは削除できません。");
      return;
    }

    if (!window.confirm(`「${filename}」を削除してもよろしいですか？`)) return;
    
    setLoading(true);
    const client = getSupabase();
    try {
      let apiSucceeded = false;
      let totalDeleted = 0;
      const cleanName = filename.replace(/^__bodycomp__::/, '');
      const userTeam = profile?.team_name || profile?.team_id || 'Team A';

      // 1. Record in dedicated deleted_files_registry table + localStorage (no longer pollutes baseball_data)
      await recordDeletedFile(client, {
        filename,
        type,
        teamName: userTeam,
        deletedBy: profile?.email || null
      });

      // 3. Try serverless deletion API (uses service_role with team-isolation verification)
      try {
        const { data: { session } } = await client.auth.getSession();
        const headers = { 'Content-Type': 'application/json' };
        if (session?.access_token) {
          headers['Authorization'] = `Bearer ${session.access_token}`;
        }
        
        let callerEmail = profile?.email || '';
        let callerRole = profile?.role || 'user';
        let callerTeam = profile?.team_name || profile?.team_id || '';

        if (!callerEmail) {
          try {
            const saved = sessionStorage.getItem('mockUser') || localStorage.getItem('mockUser');
            if (saved) {
              const u = JSON.parse(saved);
              callerEmail = u.email || '';
              callerRole = u.role || callerRole;
              callerTeam = u.team_id || u.team_name || callerTeam;
            }
          } catch {}
        }

        if (callerEmail) {
          headers['X-User-Email'] = callerEmail;
          if (callerTeam) headers['X-User-Team'] = encodeURIComponent(callerTeam);
          if (callerRole) headers['X-User-Role'] = callerRole;
        }

        const res = await fetch('/api/data/delete', {
          method: 'POST',
          headers,
          body: JSON.stringify({ filename, table, type })
        });

        const resData = await res.json().catch(() => ({}));
        if (res.ok && typeof resData.deletedCount === 'number' && resData.deletedCount > 0) {
          apiSucceeded = true;
          totalDeleted += resData.deletedCount;
        } else if (res.ok) {
          console.warn("Delete API returned OK but 0 rows deleted, proceeding to direct client fallback:", resData);
        } else {
          console.warn("Delete API returned non-OK:", res.status, resData);
        }
      } catch (apiErr) {
        console.warn("Delete API fetch failed, trying direct client delete:", apiErr);
      }

      // 4. Direct client fallback across all tables and filename variants
      if (!apiSucceeded || totalDeleted === 0) {
        const cleanTbls = ['pitching_data', 'baseball_data', 'body_comp_data', 'savant_data', 'blast_data'];
        for (const t of cleanTbls) {
          // Exact file_name
          try {
            const { count } = await client.from(t).delete({ count: 'exact' }).eq('file_name', filename);
            if (typeof count === 'number' && count > 0) totalDeleted += count;
          } catch {}
          // Bodycomp prefix
          try {
            const { count } = await client.from(t).delete({ count: 'exact' }).eq('file_name', `__bodycomp__::${filename}`);
            if (typeof count === 'number' && count > 0) totalDeleted += count;
          } catch {}
          // Exact upload_id
          try {
            const { count } = await client.from(t).delete({ count: 'exact' }).eq('upload_id', filename);
            if (typeof count === 'number' && count > 0) totalDeleted += count;
          } catch {}
          // upload_id ends with filename
          try {
            const { count } = await client.from(t).delete({ count: 'exact' }).ilike('upload_id', `%::${filename}`);
            if (typeof count === 'number' && count > 0) totalDeleted += count;
          } catch {}
          // upload_id contains filename
          try {
            const { count } = await client.from(t).delete({ count: 'exact' }).ilike('upload_id', `%::${filename}::%`);
            if (typeof count === 'number' && count > 0) totalDeleted += count;
          } catch {}
        }
      }

      // 5. Immediately hide from current dataset list in UI
      setDatasets(prev => prev.filter(d => d.filename !== filename && d.filename !== cleanName && d.id !== dataset.id));

      if (updateDataState) {
        updateDataState(type, filename, 'remove');
        updateDataState(type, cleanName, 'remove');
      }
      if (fetchFromCloud) {
        await fetchFromCloud();
      }
      await fetchDatasets();

      alert(`「${filename}」を削除しました。`);
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
          className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-black transition-all whitespace-nowrap shrink-0 ${
            syncState?.saving || loading ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-500 shadow-xl'
          }`}
        >
          <RefreshCw className={`w-5 h-5 shrink-0 ${syncState?.saving || loading ? 'animate-spin' : ''}`} />
          <span className="whitespace-nowrap">{syncState?.saving || loading ? '同期中...' : 'クラウドから同期'}</span>
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
                          dataset.type === 'body_comp' ? 'bg-cyan-600/20 text-cyan-400 border border-cyan-500/30' :
                          'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30'
                        }`}>
                          {dataset.type === 'savant' ? 'RAPSODO 打撃' : dataset.type === 'savant_pitching' ? 'RAPSODO 投球' : dataset.type === 'blast' ? 'BLAST' : dataset.type === 'body_comp' ? '体組成' : dataset.type === 'combined' ? '統合データ' : dataset.type?.toUpperCase()}
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
