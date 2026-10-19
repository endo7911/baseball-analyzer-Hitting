/**
 * クラウド同期・データ保存・サーバーサイド絞り込み・ファイル結合サービス
 *
 * App.jsx の肥大化を解消し、以下を提供します:
 * 1. サーバーサイド絞り込み（一般アカウント起動時に他チーム行の無駄な転送を削減）
 * 2. 専用削除レジストリ (`deletedRegistry.js`) との連携
 * 3. 各計測種別（打撃・投球・ブラスト・総合・体組成）の正規化と結合
 */

import { getSupabase } from '../lib/supabase.js';
import {
  SAVANT_COLUMNS,
  BLAST_COLUMNS,
  COMBINED_COLUMNS,
  PITCHING_COLUMNS,
  BODY_COMP_COLUMNS,
  COLUMN_MAP
} from '../constants/columnMap.js';
import {
  extractRowVal,
  toAsciiNumbers,
  parseAnyDate,
  getRawDataValue,
  DEFAULT_DATE_KEYS,
  getDataValue,
  PITCH_VELO_KEYS,
  SPIN_RATE_KEYS,
  SPIN_EFFICIENCY_KEYS,
  GYRO_ANGLE_KEYS,
  VB_TRAJ_KEYS,
  HB_TRAJ_KEYS,
  RELEASE_HEIGHT_KEYS,
  RELEASE_SIDE_KEYS
} from '../utils/dataHelpers.js';
import { toBodyCompDbRow, extractBodyValues, getBodyName, getBodyTeam, getBodyDate } from '../utils/bodyComp.js';
import { fetchDeletedFilesMap, removeDeletedFileRecord } from './deletedRegistry.js';

const isUUID = (str) => {
  if (!str || typeof str !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
};

/**
 * データセットをクラウド（Supabase / Upload API）へ保存する
 */
export async function saveDatasetToCloud({ type, dataObj, user, profile }) {
  const client = getSupabase();
  const dataArray = Array.isArray(dataObj?.data) ? dataObj.data : [];
  const totalRows = dataArray.length;
  const batchSize = 500;
  const uploaderEmail = (user?.email || profile?.email || 'guest').trim().toLowerCase();
  const currentTeamName = profile?.team_name || profile?.team_id || 'Team A';
  const currentTeamId = profile?.team_id || profile?.team_name || 'Team A';
  const currentUserId = user?.id || profile?.id || null;
  const isAdmin = profile?.role === 'admin' || user?.user_metadata?.role === 'admin';
  const uploadId = `${uploaderEmail}::team:${encodeURIComponent(currentTeamName)}::up-${Date.now()}`;

  // 過去に削除された同名ファイルがあれば Tombstone を解除
  await removeDeletedFileRecord(client, dataObj.filename);

  const insertRowsToTable = async (targetTable, targetColumns) => {
    for (let i = 0; i < totalRows; i += batchSize) {
      const batch = dataArray.slice(i, i + batchSize).map(row => {
        const filteredRow = {};

        Object.keys(row).forEach(key => {
          let targetKey = key;
          const normalizedKey = key.trim();
          const lowerKey = normalizedKey.toLowerCase();

          // 1. Exact match in COLUMN_MAP (case-insensitive)
          let mapKey = Object.keys(COLUMN_MAP).find(k => normalizedKey === k || lowerKey === k.toLowerCase());
          if (mapKey) {
            targetKey = COLUMN_MAP[mapKey];
          } else if (targetColumns.includes(normalizedKey)) {
            // 2. Already a valid DB column name (e.g. plate_x, events, hc_x)
            targetKey = normalizedKey;
          } else if (targetColumns.includes(lowerKey)) {
            targetKey = lowerKey;
          } else {
            // 3. Substring match fallback only for longer keys (>= 4 chars for ASCII, >= 2 chars for Japanese)
            // so 2-letter abbreviations like 'LA', 'EV', 'AA', 'VB', 'HB' never false-match unrelated columns
            mapKey = Object.keys(COLUMN_MAP).find(k => {
              const isAscii = /^[a-zA-Z0-9\s_()%-]+$/.test(k);
              const minLen = isAscii ? 4 : 2;
              return k.length >= minLen && (normalizedKey.includes(k) || lowerKey.includes(k.toLowerCase()));
            });
            if (mapKey) {
              targetKey = COLUMN_MAP[mapKey];
            }
          }

          const val = row[key];

          const numericColumns = [
            'launch_speed', 'launch_angle', 'bat_speed', 'attack_angle',
            'release_speed', 'release_spin_rate', 'hit_distance_sc',
            'time_to_contact', 'peak_hand_speed', 'power', 'vertical_bat_angle',
            'on_plane_efficiency', 'rotation_score', 'on_plane_score', 'connection_score',
            'rotation_acceleration', 'connection_at_impact', 'connection_at_address', 'bat_angle',
            'hc_x', 'hc_y', 'pfx_x', 'pfx_z', 'plate_x', 'plate_z',
            'vx0', 'vy0', 'vz0', 'ax', 'ay', 'az', 'sz_top', 'sz_bot',
            'effective_speed', 'release_extension', 'delta_home_win_exp', 'delta_run_exp',
            'release_pos_x', 'release_pos_y', 'release_pos_z', 'vaa', 'haa',
            'attack_direction', 'estimated_woba_using_speedangle', 'swing_length',
            'zone', 'balls', 'strikes', 'game_year', 'outs_when_up', 'inning',
            'spin_efficiency', 'gyro_angle', 'vb_traj', 'hb_traj',
            'height', 'weight', 'muscle_mass', 'body_fat_pct', 'bmr', 'bmi',
            'trunk_muscle', 'left_arm_muscle', 'right_arm_muscle', 'left_leg_muscle', 'right_leg_muscle', 'ffmi'
          ];

          if (numericColumns.includes(targetKey)) {
            const strVal = val != null ? String(val).trim() : '';
            if (
              val === null || val === undefined || strVal === '' ||
              strVal === '-' || strVal === '---' || strVal === 'ー' ||
              strVal.startsWith('#') || strVal.toLowerCase() === 'nan' || strVal.toLowerCase() === 'n/a'
            ) {
              if (filteredRow[targetKey] === undefined) {
                filteredRow[targetKey] = null;
              }
            } else {
              const ascii = toAsciiNumbers(strVal);
              const cleaned = String(ascii).replace(/[^-0-9.]/g, '');
              const num = parseFloat(cleaned);
              if (!isNaN(num) && isFinite(num)) {
                filteredRow[targetKey] = num;
              } else if (filteredRow[targetKey] === undefined) {
                filteredRow[targetKey] = null;
              }
            }
          } else {
            if (val != null && val !== '') {
              filteredRow[targetKey] = val;
            } else if (filteredRow[targetKey] === undefined) {
              filteredRow[targetKey] = null;
            }
          }
        });

        // Backfill numeric fields from aliases if missing
        if (filteredRow.launch_speed == null) {
          filteredRow.launch_speed = extractRowVal(row, ['launch_speed', 'exit_velocity', 'ExitVelocity', 'Exit Velocity', '打球速度', '打球初速', '打球スピード']);
        }
        if (filteredRow.bat_speed == null) {
          filteredRow.bat_speed = extractRowVal(row, ['bat_speed', 'BatSpeed', 'Bat Speed', 'Bat Speed (mph)', 'Bat Speed (km/h)', 'スイング速度', 'バットスピード', 'バット速度']);
        }
        if (filteredRow.launch_angle == null) {
          filteredRow.launch_angle = extractRowVal(row, ['launch_angle', 'LaunchAngle', 'Launch Angle', '打球角度']);
        }
        if (filteredRow.attack_angle == null) {
          filteredRow.attack_angle = extractRowVal(row, ['attack_angle', 'AttackAngle', 'Attack Angle', 'Attack Angle (deg)', 'アタックアングル', 'アッパー', 'アッパースイング度']);
        }
        if (filteredRow.on_plane_efficiency == null) {
          filteredRow.on_plane_efficiency = extractRowVal(row, ['on_plane_efficiency', 'OnPlaneEfficiency', 'On Plane Efficiency', 'On Plane Efficiency (%)', 'オンプレーン効率', 'オンプレーンの効率', 'オンプレーン']);
        }
        if (filteredRow.connection_score == null) {
          filteredRow.connection_score = extractRowVal(row, ['connection_score', 'ConnectionScore', 'Connection Score', 'Connection (80)', 'コネクションスコア', '体とバットの角度スコア', 'コネクション']);
        }
        if (filteredRow.rotation_score == null) {
          filteredRow.rotation_score = extractRowVal(row, ['rotation_score', 'RotationScore', 'Rotation Score', 'Rotation (80)', 'ローテーションスコア', '体の回転による加速スコア', 'ローテーション']);
        }
        if (filteredRow.time_to_contact == null) {
          filteredRow.time_to_contact = extractRowVal(row, ['time_to_contact', 'TimeToContact', 'Time to Contact', 'Time to Contact (sec)', 'スイング時間', 'インパクトまでの時間']);
        }
        if (filteredRow.peak_hand_speed == null) {
          filteredRow.peak_hand_speed = extractRowVal(row, ['peak_hand_speed', 'PeakHandSpeed', 'Peak Hand Speed', 'Peak Hand Speed (mph)', '手の最大速度', '手の最大']);
        }
        if (filteredRow.power == null) {
          filteredRow.power = extractRowVal(row, ['power', 'Power', 'Power (kW)', 'パワー']);
        }
        if (filteredRow.vertical_bat_angle == null) {
          filteredRow.vertical_bat_angle = extractRowVal(row, ['vertical_bat_angle', 'VerticalBatAngle', 'Vertical Bat Angle', 'Vertical Bat Angle (deg)', '垂直バット角度']);
        }

        if (targetTable === 'blast_data') {
          if (!filteredRow.player_name) {
            filteredRow.player_name = filteredRow.batter_name || row['選手名'] || row['名前'] || row['氏名'] || row['Player Name'] || row['Player'] || row['Athlete'] || row['User'] || 'Unknown Player';
          }
          if (!filteredRow.batter_name) {
            filteredRow.batter_name = filteredRow.player_name;
          }
        }
        if (targetTable === 'baseball_data') {
          if (!filteredRow.player_name) {
            filteredRow.player_name = filteredRow.batter_name || row['選手名'] || row['名前'] || row['氏名'] || row['Player Name'] || row['Player'] || row['Athlete'] || row['User'] || 'Unknown Player';
          }
          if (!filteredRow.batter_name) {
            filteredRow.batter_name = filteredRow.player_name;
          }
        }
        if (targetTable === 'savant_data') {
          if (!filteredRow.batter_name) {
            filteredRow.batter_name = filteredRow.player_name || row['選手名'] || row['名前'] || row['氏名'] || row['Player Name'] || row['Player'] || row['Athlete'] || row['User'] || 'Unknown Player';
          }
          if (!filteredRow.player_name) {
            filteredRow.player_name = filteredRow.batter_name;
          }
        }
        if (targetTable === 'pitching_data') {
          if (!filteredRow.pitcher_name) {
            filteredRow.pitcher_name = filteredRow.player_name || row['投手名'] || row['投手'] || row['Pitcher Name'] || row['選手名'] || 'Unknown Pitcher';
          }
          if (!filteredRow.player_name) {
            filteredRow.player_name = filteredRow.pitcher_name;
          }

          if (filteredRow.release_speed == null || filteredRow.release_speed === 0) {
            const v = getDataValue(row, PITCH_VELO_KEYS);
            if (v > 0) filteredRow.release_speed = v;
          }
          if (filteredRow.release_spin_rate == null || filteredRow.release_spin_rate === 0) {
            const s = getDataValue(row, SPIN_RATE_KEYS);
            if (s > 0) filteredRow.release_spin_rate = s;
          }
          if (filteredRow.spin_efficiency == null || filteredRow.spin_efficiency === 0) {
            const eff = getDataValue(row, SPIN_EFFICIENCY_KEYS);
            if (eff > 0) filteredRow.spin_efficiency = eff;
          }
          if (filteredRow.vb_traj == null || filteredRow.vb_traj === 0) {
            const vb = getDataValue(row, VB_TRAJ_KEYS);
            if (vb !== 0) filteredRow.vb_traj = vb;
          }
          if (filteredRow.hb_traj == null || filteredRow.hb_traj === 0) {
            const hb = getDataValue(row, HB_TRAJ_KEYS);
            if (hb !== 0) filteredRow.hb_traj = hb;
          }
          if (filteredRow.release_pos_z == null || filteredRow.release_pos_z === 0) {
            const rz = getDataValue(row, RELEASE_HEIGHT_KEYS);
            if (rz > 0) filteredRow.release_pos_z = rz;
          }
          if (filteredRow.release_pos_x == null || filteredRow.release_pos_x === 0) {
            const rx = getDataValue(row, RELEASE_SIDE_KEYS);
            if (rx !== 0) filteredRow.release_pos_x = rx;
          }
          if (filteredRow.gyro_angle == null || filteredRow.gyro_angle === 0) {
            let g = getDataValue(row, GYRO_ANGLE_KEYS);
            if ((g == null || g === 0 || isNaN(g)) && filteredRow.spin_efficiency > 0 && filteredRow.spin_efficiency <= 100) {
              const rad = Math.acos(filteredRow.spin_efficiency / 100);
              g = Math.round((rad * 180 / Math.PI) * 10) / 10;
            }
            if (g) filteredRow.gyro_angle = g;
          }
        }

        const finalRow = { ...filteredRow };
        const rawDateVal = getRawDataValue(finalRow, DEFAULT_DATE_KEYS) || getRawDataValue(row, DEFAULT_DATE_KEYS) || parseAnyDate(dataObj.filename);
        const normD = rawDateVal ? parseAnyDate(rawDateVal) : '';
        if (normD && /^\d{4}-\d{2}-\d{2}/.test(normD)) {
          finalRow.date = normD.slice(0, 10);
          finalRow.game_date = normD.slice(0, 10);
        } else {
          // 不正な日付文字列（"---" や時刻のみ等）が Postgres の date 型エラー (22007) を起こさないよう null 化
          delete finalRow.date;
          delete finalRow.game_date;
        }

        const rowPayload = {};
        targetColumns.forEach(col => {
          if (finalRow[col] !== undefined && finalRow[col] !== null) {
            rowPayload[col] = finalRow[col];
          }
        });

        if (targetColumns.includes('file_name')) rowPayload.file_name = dataObj.filename;
        if (targetColumns.includes('upload_id')) rowPayload.upload_id = uploadId;
        const detectedTeam = finalRow.team_name || row['チーム名'] || row['チーム'] || row['Team'] || row['team_name'];
        if (targetColumns.includes('team_name')) {
          const isGenericAdmin = isAdmin || currentTeamName === '管理者' || currentTeamName === 'admin' || currentTeamName === 'administrator';
          rowPayload.team_name = (detectedTeam && String(detectedTeam).trim() !== '' && String(detectedTeam).trim() !== 'Unknown Team')
            ? String(detectedTeam).trim()
            : (isGenericAdmin ? 'Unknown Team' : currentTeamName);
        }
        // Keep user_id, team_id, owner_id null so Supabase RLS (user_id IS NULL OR auth.uid() = user_id)
        // never hides uploaded team data from browser anon/general-account SELECT queries.
        if (targetColumns.includes('team_id')) rowPayload.team_id = null;
        if (targetColumns.includes('owner_id')) rowPayload.owner_id = null;
        rowPayload.user_id = null;
        if (targetColumns.includes('updated_at')) rowPayload.updated_at = new Date().toISOString();

        return rowPayload;
      });

      // 1. Primary: Attempt privileged Serverless Upload API (/api/data/upload)
      let savedViaApi = false;
      try {
        const { data: { session } } = await client.auth.getSession();
        const headers = { 'Content-Type': 'application/json' };
        if (session?.access_token) {
          headers['Authorization'] = `Bearer ${session.access_token}`;
        }
        if (uploaderEmail) headers['X-User-Email'] = uploaderEmail;
        if (currentTeamName) headers['X-User-Team'] = encodeURIComponent(currentTeamName);
        if (profile?.role) headers['X-User-Role'] = profile.role || 'user';

        const res = await fetch('/api/data/upload', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            type,
            filename: dataObj.filename,
            rows: batch,
            team_name: currentTeamName,
            team_id: currentTeamId,
            user_id: currentUserId,
            email: uploaderEmail,
            upload_id: uploadId,
            isFirstBatch: i === 0
          })
        });

        if (res.ok) {
          const resData = await res.json().catch(() => ({}));
          if (resData.success) {
            savedViaApi = true;
          }
        }
      } catch (apiErr) {
        console.warn('Direct upload API attempt skipped or failed, falling back to direct client insert:', apiErr);
      }

      if (savedViaApi) {
        await new Promise(resolve => setTimeout(resolve, 50));
        continue;
      }

      // 2. Secondary Fallback: Direct client insert
      let { error } = await client.from(targetTable).insert(batch);

      if (error && (error.code === '22P02' || (error.message && error.message.includes('type uuid')))) {
        const safeBatch = batch.map(row => ({
          ...row,
          team_id: null,
          user_id: null,
          owner_id: null
        }));
        const fbResult = await client.from(targetTable).insert(safeBatch);
        error = fbResult.error;
      }

      let retryCount = 0;
      let fallbackBatch = [...batch];
      while (error && error.message && retryCount < 10) {
        retryCount++;
        const colMatch = error.message.match(/column ["']?([a-zA-Z0-9_]+)["']?.*does not exist/i) ||
                         error.message.match(/Could not find the ['"]?([a-zA-Z0-9_]+)['"]? column/i);
        if (colMatch && colMatch[1]) {
          const missingCol = colMatch[1];
          fallbackBatch = fallbackBatch.map(({ [missingCol]: _, ...rest }) => rest);
          const fbResult = await client.from(targetTable).insert(fallbackBatch);
          error = fbResult.error;
        } else {
          let pruned = false;
          ['user_id', 'team_id', 'team_name', 'owner_id', 'grade', 'launch_speed', 'launch_angle', 'hit_distance_sc'].forEach(col => {
            if (error.message && (error.message.includes(`'${col}'`) || error.message.includes(`"${col}"`))) {
              fallbackBatch = fallbackBatch.map(({ [col]: _, ...rest }) => rest);
              pruned = true;
            }
          });
          if (pruned) {
            const fbResult = await client.from(targetTable).insert(fallbackBatch);
            error = fbResult.error;
          } else {
            break;
          }
        }
      }

      if (error && (targetTable === 'blast_data' || targetTable === 'savant_data')) {
        console.warn(`${targetTable} direct insert failed, falling back to baseball_data:`, error.message);
        const fbRes = await client.from('baseball_data').insert(fallbackBatch);
        error = fbRes.error;
      }

      if (error) {
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  };

  if (type === 'savant') {
    await insertRowsToTable('savant_data', SAVANT_COLUMNS);
  } else if (type === 'blast') {
    await insertRowsToTable('blast_data', BLAST_COLUMNS);
  } else if (type === 'savant_pitching') {
    await insertRowsToTable('pitching_data', PITCHING_COLUMNS);
  } else if (type === 'body_comp') {
    let savedToDedicated = false;
    try {
      const bodyCompDbRows = dataArray.map(row => {
        const dbRow = toBodyCompDbRow(row) || {};
        const d = dbRow.date || parseAnyDate(getRawDataValue(row, DEFAULT_DATE_KEYS)) || null;
        return {
          ...dbRow,
          file_name: dataObj.filename,
          upload_id: uploadId,
          team_name: dbRow.team_name || getBodyTeam(row) || currentTeamName,
          team_id: null,
          user_id: null,
          player_name: dbRow.player_name || getBodyName(row) || 'Unknown Player',
          date: d
        };
      }).filter(r => r.player_name);

      try {
        const { data: { session } } = await client.auth.getSession();
        const headers = { 'Content-Type': 'application/json' };
        if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
        if (uploaderEmail) headers['X-User-Email'] = uploaderEmail;
        if (currentTeamName) headers['X-User-Team'] = encodeURIComponent(currentTeamName);
        if (profile?.role) headers['X-User-Role'] = profile.role || 'user';

        const res = await fetch('/api/data/upload', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            type: 'body_comp',
            filename: dataObj.filename,
            rows: bodyCompDbRows,
            team_name: currentTeamName,
            team_id: currentTeamId,
            user_id: currentUserId,
            email: uploaderEmail,
            upload_id: uploadId,
            isFirstBatch: true
          })
        });
        if (res.ok) {
          const resJson = await res.json().catch(() => ({}));
          if (resJson.success) savedToDedicated = true;
        }
      } catch {}

      if (!savedToDedicated && bodyCompDbRows.length > 0) {
        let { error: bcErr } = await client.from('body_comp_data').insert(bodyCompDbRows);
        if (bcErr && (bcErr.code === '22P02' || (bcErr.message && bcErr.message.includes('type uuid')))) {
          const sanitizedRows = bodyCompDbRows.map(r => ({ ...r, user_id: null, team_id: null }));
          const retryRes = await client.from('body_comp_data').insert(sanitizedRows);
          bcErr = retryRes.error;
        }
        if (!bcErr) savedToDedicated = true;
      }
    } catch {}

    if (!savedToDedicated) {
      const fallbackRows = dataArray.map(row => {
        const values = extractBodyValues(row);
        const name = getBodyName(row) || row['選手名'] || row['Player'] || 'Unknown Player';
        const team = getBodyTeam(row) || row['チーム名'] || row['Team'] || currentTeamName;
        const d = getBodyDate(row) || parseAnyDate(getRawDataValue(row, DEFAULT_DATE_KEYS)) || null;
        const payloadObj = {
          h: values.height, w: values.weight, m: values.muscle, f: values.fatPct,
          bmr: values.bmr, bmi: values.bmi, t: values.trunk,
          la: values.leftArm, ra: values.rightArm, ll: values.leftLeg, rl: values.rightLeg, ffmi: values.ffmi
        };
        const jsonStr = JSON.stringify(payloadObj);
        return {
          file_name: `__bodycomp__::${dataObj.filename}`,
          player_name: name,
          team_name: team && team !== 'Unknown Team' ? team : currentTeamName,
          team_id: null,
          user_id: null,
          game_date: d,
          date: d,
          upload_id: `${uploaderEmail}::team:${encodeURIComponent(currentTeamName)}::bodycomp::${Date.now()}::${jsonStr}`
        };
      }).filter(r => r.player_name);

      for (let i = 0; i < fallbackRows.length; i += 500) {
        const batch = fallbackRows.slice(i, i + 500);
        let { error: fbErr } = await client.from('baseball_data').insert(batch);
        if (fbErr && (fbErr.code === '22P02' || (fbErr.message && fbErr.message.includes('type uuid')))) {
          const sanitizedBatch = batch.map(r => ({ ...r, user_id: null, team_id: null }));
          const retryRes = await client.from('baseball_data').insert(sanitizedBatch);
          fbErr = retryRes.error;
        }
        if (fbErr) throw fbErr;
      }
    }
  } else {
    await insertRowsToTable('baseball_data', COMBINED_COLUMNS);
  }

  return { totalRows };
}

/**
 * クラウド（Supabase）からデータを取得し、サーバーサイド絞り込み＋削除フィルタ＋正規化を行う
 */
export async function fetchDatasetsFromCloud({ user, profile }) {
  const client = getSupabase();
  const rawEmail = (user?.email || profile?.email || '').trim().toLowerCase();
  const uploaderEmail = rawEmail.includes('@') ? rawEmail : 'guest';
  const isAdmin = profile?.role === 'admin';
  const rawTeamName = (profile?.team_name || profile?.team_id || '').trim();
  const currentTeamName = rawTeamName.toLowerCase();
  const currentTeamId = (profile?.team_id || profile?.team_name || '').trim().toLowerCase();

  const withTimeout = (promise, ms = 6000, errorMsg = 'Operation timed out') => {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(errorMsg)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  };

  /**
   * サーバーサイド絞り込み付きページネーション取得:
   * - 管理者は全件取得
   * - 一般アカウントは PostgREST の `.or(...)` で自チーム・自身のアップロード行・システム行に絞り込み、
   *   万一スキーマ差異（team_name カラム未定義等）でエラーになった場合は透過的に標準 select('*') へフォールバック
   */
  const fetchTable = async (table) => {
    const PAGE_SIZE = 1000;
    let allRows = [];
    let from = 0;
    let hasMore = true;
    let useServerFilter = !isAdmin && Boolean(rawTeamName);
    let loopCount = 0;
    const MAX_LOOPS = 10; // Safety limit: max 10,000 rows per table

    const buildFilterExpr = () => {
      const encodedTeam = encodeURIComponent(rawTeamName);
      // ダブルクォートで囲むことで日本語チーム名やスペースを含むチーム名も安全にフィルタ可能
      const safeTeam = rawTeamName.replace(/"/g, '');
      const filters = [
        `team_name.eq."${safeTeam}"`,
        `upload_id.ilike.%::team:${encodedTeam}::%`
      ];
      if (uploaderEmail && uploaderEmail !== 'guest') {
        filters.push(`upload_id.ilike.${uploaderEmail}::%`);
      }
      if (table === 'baseball_data') {
        filters.push('file_name.eq.__deleted_files_registry_v1__');
      }
      return filters.join(',');
    };

    while (hasMore && loopCount < MAX_LOOPS) {
      loopCount++;
      let query = client.from(table).select('*');
      if (useServerFilter) {
        query = query.or(buildFilterExpr());
      }
      query = query.range(from, from + PAGE_SIZE - 1);

      try {
        const { data, error } = await withTimeout(query, 6000, `${table} query timeout`);
        if (error) {
          if (useServerFilter) {
            // サーバーサイドフィルタ非対応のテーブル構造の場合はフォールバックして再試行
            useServerFilter = false;
            continue;
          }
          console.warn(`Query ${table} error:`, error);
          break;
        }

        const rows = data || [];
        allRows = allRows.concat(rows);
        if (rows.length < PAGE_SIZE) {
          hasMore = false;
        } else {
          from += PAGE_SIZE;
        }
      } catch (err) {
        console.warn(`Query ${table} timed out or failed:`, err);
        if (useServerFilter) {
          useServerFilter = false;
          continue;
        }
        break;
      }
    }
    return allRows;
  };

  const [savantRaw, blastRaw, combinedRaw, pitchingRaw, bodyCompRaw] = await Promise.all([
    fetchTable('savant_data').catch(() => []),
    fetchTable('blast_data').catch(() => []),
    fetchTable('baseball_data').catch(() => []),
    fetchTable('pitching_data').catch(() => []),
    fetchTable('body_comp_data').catch(() => [])
  ]);

  // 専用テーブル `deleted_files_registry` + レガシー行 + ローカルから削除レジストリを取得
  const deletedFilesMap = await withTimeout(
    fetchDeletedFilesMap(client, combinedRaw),
    4000,
    'deletedFilesMap timeout'
  ).catch(() => new Map());

  const isRowDeleted = (row) => {
    if (!row || deletedFilesMap.size === 0) return false;
    const fName = String(row.file_name || '').normalize('NFC').trim();
    const cleanName = fName.replace(/^__bodycomp__::/, '').normalize('NFC').trim();
    const uId = String(row.upload_id || '');

    let uploadTimestamp = 0;
    const upMatch = uId.match(/::(?:up|bodycomp)::?(\d+)/);
    if (upMatch && upMatch[1]) {
      uploadTimestamp = parseInt(upMatch[1], 10);
    }

    const effectiveRowTime = Math.max(
      uploadTimestamp,
      row.updated_at ? new Date(row.updated_at).getTime() : 0,
      row.created_at ? new Date(row.created_at).getTime() : 0
    );

    for (const [rawDelName, delEntry] of deletedFilesMap.entries()) {
      const delName = String(rawDelName || '').normalize('NFC').trim();
      const delTime = typeof delEntry === 'number' ? delEntry : (delEntry?.deletedAt || 0);
      if (
        fName === delName ||
        cleanName === delName ||
        uId === delName ||
        uId.endsWith(`::${delName}`) ||
        uId.includes(`::${delName}::`)
      ) {
        if (effectiveRowTime > 0 && effectiveRowTime > delTime + 2000) {
          continue;
        }
        return true;
      }
    }
    return false;
  };

  const filterByUserEmail = (rows) => {
    if (!Array.isArray(rows)) return [];
    return rows.filter(row => {
      if (!row) return false;
      if (isRowDeleted(row)) return false;

      const uId = String(row.upload_id || '').toLowerCase();
      let tName = String(row.team_name || row['チーム名'] || row['Team'] || '').toLowerCase();
      const tId = String(row.team_id || '').toLowerCase();

      let uploadTeam = '';
      if (uId.includes('::team:')) {
        const match = uId.match(/::team:([^:]+)::/);
        if (match && match[1]) {
          try { uploadTeam = decodeURIComponent(match[1]).toLowerCase(); } catch {}
        }
      }
      if (!tName && uploadTeam) {
        tName = uploadTeam;
      }

      const fName = String(row.file_name || '').toLowerCase();
      if (fName.startsWith('__') && !fName.startsWith('__bodycomp__::')) return false;

      if (isAdmin) return true;

      const isExplicitTeam = tName && tName !== 'unknown team' && tName !== '__system__' && !tName.includes('@');
      const isUserTeamMatch =
        (currentTeamName && (tName === currentTeamName || tId === currentTeamName || uploadTeam === currentTeamName)) ||
        (currentTeamId && (tId === currentTeamId || tName === currentTeamId || uploadTeam === currentTeamId));

      // 1. Exact team match for the logged-in user's team (or team encoded in upload_id)
      if (isUserTeamMatch) return true;

      // 2. Check if this row was uploaded by this exact logged-in user
      if (uId.includes('::')) {
        const uploader = uId.split('::')[0];
        const uploaderUsername = uploader.split('@')[0];
        const userUsername = uploaderEmail.split('@')[0];
        const isUploadedByUser = Boolean(
          uploaderEmail &&
          uploaderEmail !== 'guest' &&
          (uploader === uploaderEmail ||
           uploaderUsername === userUsername ||
           uploader === userUsername ||
           uploaderUsername === uploaderEmail)
        );
        if (isUploadedByUser && (!uploadTeam || uploadTeam === currentTeamName || uploadTeam === currentTeamId || uploadTeam === 'team a')) {
          return true;
        }
      }

      // 3. STRICT MULTI-TENANT ISOLATION: If the row is explicitly tagged with a different team, reject immediately
      if (isExplicitTeam && (currentTeamName || currentTeamId)) {
        return false;
      }

      if (tName.includes('@')) {
        return Boolean(
          uploaderEmail &&
          uploaderEmail !== 'guest' &&
          (tName === uploaderEmail || tName === uploaderEmail.split('@')[0])
        );
      }

      // Do not allow untagged cloud rows from unknown sources to leak to general accounts
      return false;
    });
  };

  const sRaw = filterByUserEmail(savantRaw);
  const bRaw = filterByUserEmail(blastRaw);
  const cRawHitting = (combinedRaw || []).filter(r => {
    const fName = String(r?.file_name || '');
    const uId = String(r?.upload_id || '');
    return !fName.startsWith('__bodycomp__::') && !uId.includes('::bodycomp::');
  });
  const cRaw = filterByUserEmail(cRawHitting);

  const pRaw = filterByUserEmail(pitchingRaw).map(row => {
    const speed = row.release_speed ?? row['Pitch Speed'] ?? row['PitchSpeed'] ?? row['球速'];
    const spin = row.release_spin_rate ?? row['Spin Rate'] ?? row['SpinRate'] ?? row['回転数'];
    const eff = row.spin_efficiency ?? row['Spin Efficiency'] ?? row['SpinEfficiency'] ?? row['回転効率'];
    const vb = row.vb_traj ?? row['VB (trajectory)'] ?? row['VB(trajectory)'] ?? row['縦変化量'];
    const hb = row.hb_traj ?? row['HB (trajectory)'] ?? row['HB(trajectory)'] ?? row['横変化量'];
    const rz = row.release_pos_z ?? row['Release Height'] ?? row['ReleaseHeight'] ?? row['リリース高度'];
    const rx = row.release_pos_x ?? row['Release Side'] ?? row['ReleaseSide'] ?? row['リリース横'];
    const pName = row.pitcher_name ?? row.player_name ?? row['投手名'] ?? row['選手名'] ?? row['Pitcher'];
    const pType = row.pitch_type ?? row['Pitch Type'] ?? row['PitchType'] ?? row['球種'];
    const pThrows = row.p_throws ?? row['Throws'] ?? row['利き腕'] ?? row['投球腕'];
    const sAxis = row.spin_axis ?? row['Spin Direction'] ?? row['SpinDirection'] ?? row['回転軸'];
    let gyro = row.gyro_angle ?? row['Gyro Degree (deg)'] ?? row['Gyro Degree'] ?? row['Gyro Angle'] ?? row['GyroAngle'] ?? row['ジャイロ角度'] ?? row['ジャイロ角'];
    if ((gyro == null || gyro === 0 || isNaN(gyro)) && eff > 0 && eff <= 100) {
      const rad = Math.acos(eff / 100);
      gyro = Math.round((rad * 180 / Math.PI) * 10) / 10;
    }
    const vaaVal = row.vaa ?? row['VAA'] ?? row['垂直アプローチ角度'];

    return {
      ...row,
      release_speed: speed, 'Pitch Speed': speed, '球速': speed,
      release_spin_rate: spin, 'Spin Rate': spin, '回転数': spin,
      spin_efficiency: eff, 'Spin Efficiency': eff, 'Spin Efficiency (release)': eff, '回転効率': eff,
      vb_traj: vb, 'VB (trajectory)': vb, '縦変化量': vb,
      hb_traj: hb, 'HB (trajectory)': hb, '横変化量': hb,
      release_pos_z: rz, 'Release Height': rz, 'リリース高度': rz,
      release_pos_x: rx, 'Release Side': rx, 'リリース横': rx,
      pitcher_name: pName, player_name: pName, '投手名': pName, '選手名': pName,
      pitch_type: pType, 'Pitch Type': pType, '球種': pType,
      p_throws: pThrows, 'Throws': pThrows,
      spin_axis: sAxis, 'Spin Direction': sAxis,
      gyro_angle: gyro, 'Gyro Angle': gyro, 'Gyro Degree (deg)': gyro, 'Gyro Degree': gyro, 'ジャイロ角': gyro,
      vaa: vaaVal, 'VAA': vaaVal
    };
  });

  const bcDedicated = filterByUserEmail(bodyCompRaw).map(row => ({
    ...row,
    '身長': row.height ?? row['身長'],
    '体重': row.weight ?? row['体重'],
    '筋肉量': row.muscle_mass ?? row['筋肉量'],
    '体脂肪率': row.body_fat_pct ?? row['体脂肪率'],
    '基礎代謝量': row.bmr ?? row['基礎代謝量'],
    'BMI': row.bmi ?? row['BMI'],
    '体幹': row.trunk_muscle ?? row['体幹'],
    '左腕': row.left_arm_muscle ?? row['左腕'],
    '右腕': row.right_arm_muscle ?? row['右腕'],
    '左足': row.left_leg_muscle ?? row['左足'],
    '右足': row.right_leg_muscle ?? row['右足'],
    'FFMI': row.ffmi ?? row['FFMI'],
    height: row.height ?? row['身長'],
    weight: row.weight ?? row['体重'],
    muscle_mass: row.muscle_mass ?? row['筋肉量'],
    body_fat_pct: row.body_fat_pct ?? row['体脂肪率'],
    bmr: row.bmr ?? row['基礎代謝量'],
    bmi: row.bmi ?? row['BMI'],
    trunk_muscle: row.trunk_muscle ?? row['体幹'],
    left_arm_muscle: row.left_arm_muscle ?? row['左腕'],
    right_arm_muscle: row.right_arm_muscle ?? row['右腕'],
    left_leg_muscle: row.left_leg_muscle ?? row['左足'],
    right_leg_muscle: row.right_leg_muscle ?? row['右足'],
    ffmi: row.ffmi ?? row['FFMI'],
  }));

  const bcFallbackRaw = (combinedRaw || []).filter(row => {
    if (!row) return false;
    const fName = String(row.file_name || '');
    const uId = String(row.upload_id || '').toLowerCase();
    return fName.startsWith('__bodycomp__::') || uId.includes('::bodycomp::');
  });

  const bcFallback = filterByUserEmail(bcFallbackRaw).map(row => {
    const cleanFileName = String(row.file_name || '').replace(/^__bodycomp__::/, '');
    const uId = String(row.upload_id || '');
    let parsedVals = {};
    if (uId.includes('::bodycomp::')) {
      const bodyCompIdx = uId.indexOf('::bodycomp::');
      const remainder = uId.slice(bodyCompIdx + '::bodycomp::'.length);
      const parts = remainder.split('::');
      const jsonPart = parts.slice(1).join('::');
      if (jsonPart) {
        try {
          const p = JSON.parse(jsonPart);
          parsedVals = {
            '身長': p.h ?? p.height, 'height': p.h ?? p.height,
            '体重': p.w ?? p.weight, 'weight': p.w ?? p.weight,
            '筋肉量': p.m ?? p.muscle_mass, 'muscle_mass': p.m ?? p.muscle_mass,
            '体脂肪率': p.f ?? p.body_fat_pct, 'body_fat_pct': p.f ?? p.body_fat_pct,
            '基礎代謝量': p.bmr, 'bmr': p.bmr,
            'BMI': p.bmi, 'bmi': p.bmi,
            '体幹': p.t ?? p.trunk_muscle, 'trunk_muscle': p.t ?? p.trunk_muscle,
            '左腕': p.la ?? p.left_arm_muscle, 'left_arm_muscle': p.la ?? p.left_arm_muscle,
            '右腕': p.ra ?? p.right_arm_muscle, 'right_arm_muscle': p.ra ?? p.right_arm_muscle,
            '左足': p.ll ?? p.left_leg_muscle, 'left_leg_muscle': p.ll ?? p.left_leg_muscle,
            '右足': p.rl ?? p.right_leg_muscle, 'right_leg_muscle': p.rl ?? p.right_leg_muscle,
            'FFMI': p.ffmi, 'ffmi': p.ffmi
          };
        } catch {}
      }
    }
    return {
      ...row,
      ...parsedVals,
      file_name: cleanFileName,
      player_name: row.player_name,
      team_name: row.team_name,
      date: row.date || row.game_date
    };
  });

  const dedicatedFiles = new Set(bcDedicated.map(r => r.file_name).filter(Boolean));
  const filteredBcFallback = bcFallback.filter(r => !dedicatedFiles.has(r.file_name));
  const allBcRows = [...bcDedicated, ...filteredBcFallback];

  const groupIntoFiles = (rows, type) => {
    if (!Array.isArray(rows)) return [];
    const grouped = {};
    rows.forEach(row => {
      if (!row) return;
      let fileName = row.file_name || row.filename || 'Cloud Data';
      if (fileName.startsWith('__bodycomp__::')) {
        fileName = fileName.replace(/^__bodycomp__::/, '');
      } else if (fileName.startsWith('__')) {
        return;
      }

      const rawDateVal = getRawDataValue(row, DEFAULT_DATE_KEYS) || row.date || row.game_date;
      let normD = rawDateVal ? parseAnyDate(rawDateVal) : '';
      if (!normD && (row.file_name || row.filename || fileName)) {
        normD = parseAnyDate(row.file_name || row.filename || fileName);
      }
      if (normD) {
        row.date = normD;
        row.game_date = normD;
      }

      if (!row.player_name && row.batter_name) row.player_name = row.batter_name;
      if (!row.batter_name && row.player_name) row.batter_name = row.player_name;

      const evVal = extractRowVal(row, ['launch_speed', 'exit_velocity', 'ExitVelocity', 'Exit Velocity', '打球速度', '打球初速', '打球スピード']);
      if (evVal != null) {
        row.launch_speed = evVal;
      }

      if (type === 'savant_pitching' || row.pitcher_name || row['Pitch Speed'] || row.release_speed != null || row.vb_traj != null) {
        const v = getDataValue(row, PITCH_VELO_KEYS);
        if (v > 0) { row.release_speed = v; row['Pitch Speed'] = v; }
        const s = getDataValue(row, SPIN_RATE_KEYS);
        if (s > 0) { row.release_spin_rate = s; row['Spin Rate'] = s; }
        const eff = getDataValue(row, SPIN_EFFICIENCY_KEYS);
        if (eff > 0) { row.spin_efficiency = eff; row['Spin Efficiency'] = eff; }
        const vb = getDataValue(row, VB_TRAJ_KEYS);
        if (vb !== 0) { row.vb_traj = vb; row['VB (trajectory)'] = vb; }
        const hb = getDataValue(row, HB_TRAJ_KEYS);
        if (hb !== 0) { row.hb_traj = hb; row['HB (trajectory)'] = hb; }
        const rz = getDataValue(row, RELEASE_HEIGHT_KEYS);
        if (rz > 0) { row.release_pos_z = rz; row['Release Height'] = rz; }
        const rx = getDataValue(row, RELEASE_SIDE_KEYS);
        if (rx !== 0) { row.release_pos_x = rx; row['Release Side'] = rx; }
        let g = getDataValue(row, GYRO_ANGLE_KEYS);
        if ((g == null || g === 0 || isNaN(g)) && (row.spin_efficiency > 0 || eff > 0)) {
          const curEff = row.spin_efficiency || eff;
          if (curEff <= 100) {
            const rad = Math.acos(curEff / 100);
            g = Math.round((rad * 180 / Math.PI) * 10) / 10;
          }
        }
        if (g) { row.gyro_angle = g; row['Gyro Angle'] = g; row['Gyro Degree (deg)'] = g; }
      }

      if (!grouped[fileName]) {
        grouped[fileName] = {
          id: row.upload_id || `cloud-${fileName}`,
          filename: fileName,
          updated_at: row.updated_at || row.created_at,
          data: [],
          headers: Object.keys(row).filter(k => !['id', 'owner_id', 'team_id', 'updated_at', 'upload_id'].includes(k))
        };
      }
      grouped[fileName].data.push(row);
    });
    return Object.values(grouped);
  };

  const savantFileNames = new Set(sRaw.map(r => r?.file_name).filter(Boolean));
  const blastFileNames = new Set(bRaw.map(r => r?.file_name).filter(Boolean));

  const combinedFileNames = new Set();
  savantFileNames.forEach(name => {
    if (blastFileNames.has(name)) combinedFileNames.add(name);
  });
  sRaw.forEach(r => {
    if (r?.file_name && (r.bat_speed != null || r.attack_angle != null)) {
      combinedFileNames.add(r.file_name);
    }
  });

  const combinedRawList = [...cRaw];
  combinedFileNames.forEach(name => {
    const sRows = sRaw.filter(r => r?.file_name === name);
    const bRows = bRaw.filter(r => r?.file_name === name);
    const maxLen = Math.max(sRows.length, bRows.length);
    for (let i = 0; i < maxLen; i++) {
      const s = sRows[i] || {};
      const b = bRows[i] || {};

      const ev = extractRowVal(s, ['launch_speed', 'exit_velocity', 'ExitVelocity', 'Exit Velocity', '打球速度', '打球初速'])
            ?? extractRowVal(b, ['launch_speed', 'exit_velocity', 'ExitVelocity', 'Exit Velocity', '打球速度', '打球初速']);
      const bs = extractRowVal(s, ['bat_speed', 'BatSpeed', 'Bat Speed', 'スイング速度', 'バットスピード'])
            ?? extractRowVal(b, ['bat_speed', 'BatSpeed', 'Bat Speed', 'スイング速度', 'バットスピード']);
      const la = extractRowVal(s, ['launch_angle', 'LaunchAngle', 'Launch Angle', '打球角度'])
            ?? extractRowVal(b, ['launch_angle', 'LaunchAngle', 'Launch Angle', '打球角度']);
      const aa = extractRowVal(s, ['attack_angle', 'AttackAngle', 'Attack Angle', 'アタックアングル'])
            ?? extractRowVal(b, ['attack_angle', 'AttackAngle', 'Attack Angle', 'アタックアングル']);

      combinedRawList.push({
        ...b,
        ...s,
        player_name: s.batter_name || s.player_name || b.player_name || 'Unknown',
        batter_name: s.batter_name || s.player_name || b.player_name || 'Unknown',
        bat_speed: bs,
        launch_speed: ev,
        attack_angle: aa,
        launch_angle: la,
        hit_distance_sc: s.hit_distance_sc ?? b.hit_distance_sc,
        date: s.game_date || s.date || b.date,
        game_date: s.game_date || s.date || b.date,
        file_name: name
      });
    }
  });

  return {
    savantFilesCloud: groupIntoFiles(sRaw, 'savant'),
    blastFilesCloud: groupIntoFiles(bRaw, 'blast'),
    pitchingFilesCloud: groupIntoFiles(pRaw, 'savant_pitching'),
    combinedFilesCloud: groupIntoFiles(combinedRawList, 'combined'),
    bodyCompFilesCloud: groupIntoFiles(allBcRows, 'body_comp')
  };
}

/**
 * 複数ファイル（クラウド＋ローカル）を1つの分析用データセットに統合・テナント分離する
 */
export function mergeDatasetFiles(files, { user, profile }) {
  if (!Array.isArray(files) || files.length === 0) return null;

  const rawEmail = (user?.email || profile?.email || '').trim().toLowerCase();
  const userEmail = rawEmail.includes('@') ? rawEmail : 'guest';
  const isAdmin = profile?.role === 'admin';
  const currentTeamName = (profile?.team_name || profile?.team_id || '').trim().toLowerCase();
  const currentTeamId = (profile?.team_id || profile?.team_name || '').trim().toLowerCase();

  const allHeaders = new Set();
  const safeRows = [];

  const seenFilenames = new Set();
  const uniqueFiles = [];
  files.forEach(f => {
    if (!f) return;
    const fn = f.filename || f.id;
    if (fn && seenFilenames.has(fn)) return;
    if (fn) seenFilenames.add(fn);
    uniqueFiles.push(f);
  });

  uniqueFiles.forEach(f => {
    if (f.headers && Array.isArray(f.headers)) f.headers.forEach(h => allHeaders.add(h));
    if (Array.isArray(f.data)) {
      f.data.forEach(row => {
        if (!row) return;

        Object.keys(row).forEach(k => {
          if (!['id', 'owner_id', 'team_id', 'updated_at', 'upload_id'].includes(k)) {
            allHeaders.add(k);
          }
        });

        const rawDateVal = getRawDataValue(row, DEFAULT_DATE_KEYS) || row.date || row.game_date;
        let normD = rawDateVal ? parseAnyDate(rawDateVal) : '';
        if (!normD && (row.file_name || row.filename || f?.filename)) {
          normD = parseAnyDate(row.file_name || row.filename || f?.filename);
        }
        if (normD) {
          row.date = normD;
          row.game_date = normD;
        }

        if (!row.player_name && row.batter_name) row.player_name = row.batter_name;
        if (!row.batter_name && row.player_name) row.batter_name = row.player_name;

        if (row.launch_speed == null) {
          const evVal = extractRowVal(row, ['launch_speed', 'exit_velocity', 'ExitVelocity', 'Exit Velocity', '打球速度', '打球初速', '打球スピード']);
          if (evVal != null) {
            row.launch_speed = evVal;
          }
        }

        if (row.pitcher_name || row['Pitch Speed'] || row.release_speed != null || row.vb_traj != null) {
          const v = getDataValue(row, PITCH_VELO_KEYS);
          if (v > 0) { row.release_speed = v; row['Pitch Speed'] = v; }
          const s = getDataValue(row, SPIN_RATE_KEYS);
          if (s > 0) { row.release_spin_rate = s; row['Spin Rate'] = s; }
          const eff = getDataValue(row, SPIN_EFFICIENCY_KEYS);
          if (eff > 0) { row.spin_efficiency = eff; row['Spin Efficiency'] = eff; }
          const vb = getDataValue(row, VB_TRAJ_KEYS);
          if (vb !== 0) { row.vb_traj = vb; row['VB (trajectory)'] = vb; }
          const hb = getDataValue(row, HB_TRAJ_KEYS);
          if (hb !== 0) { row.hb_traj = hb; row['HB (trajectory)'] = hb; }
          const rz = getDataValue(row, RELEASE_HEIGHT_KEYS);
          if (rz > 0) { row.release_pos_z = rz; row['Release Height'] = rz; }
          const rx = getDataValue(row, RELEASE_SIDE_KEYS);
          if (rx !== 0) { row.release_pos_x = rx; row['Release Side'] = rx; }
          let g = getDataValue(row, GYRO_ANGLE_KEYS);
          if ((g == null || g === 0 || isNaN(g)) && (row.spin_efficiency > 0 || eff > 0)) {
            const curEff = row.spin_efficiency || eff;
            if (curEff <= 100) {
              const rad = Math.acos(curEff / 100);
              g = Math.round((rad * 180 / Math.PI) * 10) / 10;
            }
          }
          if (g) { row.gyro_angle = g; row['Gyro Angle'] = g; row['Gyro Degree (deg)'] = g; }
        }

        if (!isAdmin) {
          const uId = String(row.upload_id || '').toLowerCase();
          let tName = String(row.team_name || row['チーム名'] || row['Team'] || '').toLowerCase();
          const tId = String(row.team_id || '').toLowerCase();

          let uploadTeam = '';
          if (uId.includes('::team:')) {
            const match = uId.match(/::team:([^:]+)::/);
            if (match && match[1]) {
              try { uploadTeam = decodeURIComponent(match[1]).toLowerCase(); } catch {}
            }
          }
          if (!tName && uploadTeam) {
            tName = uploadTeam;
          }

          const isExplicitTeam = tName && tName !== 'unknown team' && tName !== '__system__' && !tName.includes('@');
          const isTeamMatch =
            (currentTeamName && (tName === currentTeamName || tId === currentTeamName || uploadTeam === currentTeamName)) ||
            (currentTeamId && (tId === currentTeamId || tName === currentTeamId || uploadTeam === currentTeamId));

          if (!isTeamMatch) {
            let isUserMatch = false;
            if (uId.includes('::')) {
              const uploader = uId.split('::')[0];
              const uploaderUsername = uploader.split('@')[0];
              const userUsername = userEmail.split('@')[0];
              const isUploadedByUser = Boolean(
                userEmail &&
                userEmail !== 'guest' &&
                (uploader === userEmail ||
                 uploaderUsername === userUsername ||
                 uploader === userUsername ||
                 uploaderUsername === userEmail)
              );
              if (isUploadedByUser && (!uploadTeam || uploadTeam === currentTeamName || uploadTeam === currentTeamId || uploadTeam === 'team a')) {
                isUserMatch = true;
              }
            }
            if (!isUserMatch) {
              // Strictly block rows explicitly tagged with a different team
              if (isExplicitTeam && (currentTeamName || currentTeamId)) {
                return;
              }
              if (uId.includes('::')) {
                return;
              } else if (tName.includes('@') && tName !== userEmail && tName !== userEmail.split('@')[0]) {
                return;
              } else if (uId) {
                // Has a non-empty upload_id without '::' and doesn't match team -> block
                return;
              }
            }
          }
        }

        // Normalize team_name if it was saved as an email address or generic tag
        const currentExplicitTeam = profile?.team_name || profile?.team_id;
        let rowTeam = String(row.team_name || row['チーム名'] || row['Team'] || '').trim();
        if (rowTeam.includes('@') || rowTeam === '管理者' || rowTeam.toLowerCase() === 'admin' || rowTeam === 'Unknown Team') {
          if (!isAdmin && currentExplicitTeam && currentExplicitTeam !== 'Unknown Team') {
            row.team_name = currentExplicitTeam;
            if (row['チーム名'] !== undefined) row['チーム名'] = currentExplicitTeam;
            if (row['Team'] !== undefined) row['Team'] = currentExplicitTeam;
          }
        }

        safeRows.push(row);
      });
    }
  });

  if (safeRows.length === 0) return null;

  return {
    headers: Array.from(allHeaders),
    data: safeRows
  };
}
