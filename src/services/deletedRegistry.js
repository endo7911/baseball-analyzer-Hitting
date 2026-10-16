/**
 * 専用削除レジストリ（Tombstone）管理サービス
 *
 * 以前は `baseball_data` テーブルに `file_name = '__deleted_files_registry_v1__'` の
 * ダミー打撃行を挿入していましたが、専用テーブル `deleted_files_registry` と
 * ローカルキャッシュ (`localStorage`) に分離し、打撃データテーブルの汚染を防止します。
 */

export const LEGACY_DELETED_REGISTRY_FILE_NAME = '__deleted_files_registry_v1__';
export const DELETED_REGISTRY_TABLE = 'deleted_files_registry';
const LOCAL_STORAGE_KEY = 'deletedCloudFiles';

// セッション中に `deleted_files_registry` テーブルが存在しない（404/42P01）と判明した場合のキャッシュフラグ
let dedicatedTableAvailable = true;

/**
 * ローカルストレージから削除済みファイル配列を取得
 */
export function getLocalDeletedEntries() {
  try {
    const raw = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

/**
 * ローカルストレージへ削除済みファイル配列を保存
 */
export function saveLocalDeletedEntries(entries) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(entries));
  } catch (e) {
    console.warn('Failed to save deletedCloudFiles to localStorage:', e);
  }
}

/**
 * エントリを DeletedFilesMap にマージする内部ヘルパー
 */
function mergeEntryIntoMap(map, item) {
  if (!item) return;
  if (typeof item === 'string') {
    map.set(item, { filename: item, deletedAt: Date.now() });
    return;
  }
  const fname = item.filename || item.file_name;
  if (!fname) return;
  const deletedAt = typeof item.deletedAt === 'number'
    ? item.deletedAt
    : (item.deleted_at ? new Date(item.deleted_at).getTime() : Date.now());
  const normalized = {
    filename: fname,
    type: item.type || item.file_type || 'any',
    team: item.team || item.team_name || 'ALL',
    deletedAt: Number.isNaN(deletedAt) ? Date.now() : deletedAt
  };
  const existing = map.get(fname);
  if (!existing || existing.deletedAt < normalized.deletedAt) {
    map.set(fname, normalized);
  }
}

/**
 * クラウド（専用テーブル `deleted_files_registry`）＋レガシー行＋ローカルから削除済みファイルMapを構築
 * @param {object} client - Supabase client
 * @param {Array} [legacyBaseballRows] - 既に取得済みの baseball_data 行があれば渡す（レガシー互換用）
 * @returns {Promise<Map<string, {filename: string, type: string, team: string, deletedAt: number}>>}
 */
export async function fetchDeletedFilesMap(client, legacyBaseballRows = []) {
  const deletedFilesMap = new Map();

  // 1. ローカルストレージから読み込み
  const localList = getLocalDeletedEntries();
  localList.forEach(item => mergeEntryIntoMap(deletedFilesMap, item));

  // 2. 専用テーブル `deleted_files_registry` から取得
  if (client && dedicatedTableAvailable) {
    try {
      const { data, error } = await client
        .from(DELETED_REGISTRY_TABLE)
        .select('file_name, file_type, team_name, deleted_at')
        .limit(2000);

      if (error) {
        // テーブル未作成（42P01 / PGRST205 等）の場合は以降スキップしてフォールバック
        const code = String(error.code || '');
        const msg = String(error.message || '');
        if (code === '42P01' || code.startsWith('PGRST') || msg.includes('does not exist') || msg.includes('schema cache')) {
          dedicatedTableAvailable = false;
        }
      } else if (Array.isArray(data)) {
        data.forEach(row => mergeEntryIntoMap(deletedFilesMap, row));
      }
    } catch {
      dedicatedTableAvailable = false;
    }
  }

  // 3. レガシー `baseball_data` 内の `__deleted_files_registry_v1__` 行があれば読み取り（後方互換）
  if (Array.isArray(legacyBaseballRows) && legacyBaseballRows.length > 0) {
    const regRows = legacyBaseballRows.filter(r => r && r.file_name === LEGACY_DELETED_REGISTRY_FILE_NAME);
    for (const regRow of regRows) {
      if (!regRow?.upload_id) continue;
      try {
        let parsed = null;
        if (typeof regRow.upload_id === 'string' && (regRow.upload_id.startsWith('{') || regRow.upload_id.startsWith('['))) {
          parsed = JSON.parse(regRow.upload_id);
        }
        if (Array.isArray(parsed)) {
          parsed.forEach(item => mergeEntryIntoMap(deletedFilesMap, item));
        } else if (parsed && typeof parsed === 'object') {
          mergeEntryIntoMap(deletedFilesMap, parsed);
        }
      } catch {}
    }
  }

  // ローカルストレージを最新状態に同期
  saveLocalDeletedEntries(Array.from(deletedFilesMap.values()));

  return deletedFilesMap;
}

/**
 * ファイル削除時にレジストリへ記録する（baseball_data には一切ダミー行を書き込まない）
 */
export async function recordDeletedFile(client, { filename, type = 'any', teamName = 'ALL', deletedBy = null }) {
  if (!filename) return;
  const cleanName = filename.replace(/^__bodycomp__::/, '');
  const nowMs = Date.now();
  const entry = {
    filename: cleanName,
    type: type || 'any',
    team: teamName || 'ALL',
    deletedAt: nowMs
  };

  // 1. ローカルストレージへ即時保存
  const list = getLocalDeletedEntries().filter(item => {
    const f = typeof item === 'string' ? item : item?.filename;
    return f !== cleanName && f !== filename;
  });
  list.push(entry);
  saveLocalDeletedEntries(list);

  // 2. 専用テーブル `deleted_files_registry` へ保存（存在する場合のみ）
  if (client && dedicatedTableAvailable) {
    try {
      const { error } = await client
        .from(DELETED_REGISTRY_TABLE)
        .insert([{
          file_name: cleanName,
          file_type: entry.type,
          team_name: entry.team,
          deleted_by: deletedBy,
          deleted_at: new Date(nowMs).toISOString()
        }]);
      if (error) {
        const code = String(error.code || '');
        const msg = String(error.message || '');
        if (code === '42P01' || code.startsWith('PGRST') || msg.includes('does not exist') || msg.includes('schema cache')) {
          dedicatedTableAvailable = false;
        }
      }
    } catch {
      dedicatedTableAvailable = false;
    }
  }
}

/**
 * 同名ファイルが再アップロードされた際に削除レジストリから解除する
 */
export async function removeDeletedFileRecord(client, filename) {
  if (!filename) return;
  const cleanName = filename.replace(/^__bodycomp__::/, '');

  // 1. ローカルストレージから除去
  const list = getLocalDeletedEntries();
  const filtered = list.filter(item => {
    const f = typeof item === 'string' ? item : item?.filename;
    return f !== filename && f !== cleanName && f !== `__bodycomp__::${cleanName}`;
  });
  if (filtered.length !== list.length) {
    saveLocalDeletedEntries(filtered);
  }

  // 2. 専用テーブル `deleted_files_registry` から除去
  if (client && dedicatedTableAvailable) {
    try {
      await client
        .from(DELETED_REGISTRY_TABLE)
        .delete()
        .in('file_name', [filename, cleanName, `__bodycomp__::${cleanName}`]);
    } catch {}
  }

  // 3. レガシー `baseball_data` に残っている古い Tombstone 行があれば掃除
  if (client) {
    try {
      const { data: legacyRows } = await client
        .from('baseball_data')
        .select('id, upload_id')
        .eq('file_name', LEGACY_DELETED_REGISTRY_FILE_NAME);
      if (Array.isArray(legacyRows) && legacyRows.length > 0) {
        const idsToDelete = [];
        for (const row of legacyRows) {
          try {
            const parsed = typeof row.upload_id === 'string' ? JSON.parse(row.upload_id) : row.upload_id;
            const tFile = parsed?.filename;
            if (tFile === filename || tFile === cleanName || tFile === `__bodycomp__::${cleanName}`) {
              idsToDelete.push(row.id);
            }
          } catch {}
        }
        if (idsToDelete.length > 0) {
          await client.from('baseball_data').delete().in('id', idsToDelete);
        }
      }
    } catch {}
  }
}

/**
 * データ行が削除レジストリに該当するか判定するヘルパー
 */
export function isRowDeletedByRegistry(row, deletedFilesMap, extractRawFilenameFn) {
  if (!row || !deletedFilesMap || deletedFilesMap.size === 0) return false;
  const rawFname = extractRawFilenameFn
    ? extractRawFilenameFn(row)
    : (row.file_name || row._sourceFile || '').replace(/^__bodycomp__::/, '');
  const cleanFname = rawFname.replace(/^__bodycomp__::/, '');
  const delEntry = deletedFilesMap.get(cleanFname) || deletedFilesMap.get(rawFname) || deletedFilesMap.get(row.file_name);
  if (!delEntry) return false;

  const rowTeam = row.team_name || 'ALL';
  if (delEntry.team && delEntry.team !== 'ALL' && rowTeam !== 'ALL' && delEntry.team !== rowTeam) {
    return false;
  }
  if (row.created_at && delEntry.deletedAt) {
    const rowTime = new Date(row.created_at).getTime();
    if (!Number.isNaN(rowTime) && rowTime > delEntry.deletedAt + 5000) {
      return false; // 削除時刻より5秒以上後に新規作成された行は有効とみなす
    }
  }
  return true;
}
