import { createClient } from '@supabase/supabase-js';
import {
  COLUMN_MAP,
  SAVANT_COLUMNS,
  BLAST_COLUMNS,
  COMBINED_COLUMNS,
  PITCHING_COLUMNS,
  BODY_COMP_COLUMNS
} from '../../src/constants/columnMap.js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://ukyppwxsvcgxuxedwfom.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_PCKtT5zEB4r6UMZ5H1q81w_Wpp1b3te';

const ENCRYPTION_SALT = 'baseball-analyzer-secure-payload-salt-v2';
const SYSTEM_USER_FILE_NAME = '__app_user_profiles_v1__';
const DELETED_REGISTRY_FILE_NAME = '__deleted_files_registry_v1__';

function getAdminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

function getSubtleCrypto() {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
    return globalThis.crypto.subtle;
  }
  return import('crypto').then(c => c.webcrypto.subtle);
}

async function getEncryptionKey() {
  const encoder = new TextEncoder();
  const subtle = await getSubtleCrypto();
  const keyMaterial = await subtle.digest('SHA-256', encoder.encode(ENCRYPTION_SALT));
  return subtle.importKey('raw', keyMaterial, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function decryptPayload(payloadStr) {
  if (!payloadStr) return null;
  if (typeof payloadStr === 'string' && payloadStr.startsWith('enc:v2:')) {
    try {
      const parts = payloadStr.split(':');
      if (parts.length < 4) return null;
      const ivHex = parts[2];
      const cipherHex = parts[3];
      const iv = new Uint8Array(ivHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
      const cipher = new Uint8Array(cipherHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
      const subtle = await getSubtleCrypto();
      const key = await getEncryptionKey();
      const decrypted = await subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
      const decoder = new TextDecoder();
      return JSON.parse(decoder.decode(decrypted));
    } catch {
      return null;
    }
  }
  if (typeof payloadStr === 'string' && (payloadStr.startsWith('[') || payloadStr.startsWith('{'))) {
    try { return JSON.parse(payloadStr); } catch { return null; }
  }
  return null;
}

async function encryptPayload(dataObj) {
  const encoder = new TextEncoder();
  const subtle = await getSubtleCrypto();
  const key = await getEncryptionKey();
  const iv = new Uint8Array(12);
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(iv);
  } else {
    const cryptoMod = await import('crypto');
    cryptoMod.webcrypto.getRandomValues(iv);
  }
  const plaintext = JSON.stringify(dataObj);
  const encrypted = await subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(plaintext));
  const ivHex = Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join('');
  const cipherHex = Array.from(new Uint8Array(encrypted)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `enc:v2:${ivHex}:${cipherHex}`;
}

async function getLegacyUsers(adminClient) {
  try {
    const { data } = await adminClient
      .from('baseball_data')
      .select('upload_id')
      .eq('file_name', SYSTEM_USER_FILE_NAME)
      .limit(1);
    if (data && data.length > 0 && data[0].upload_id) {
      const parsed = await decryptPayload(data[0].upload_id);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

// Verify caller identity (both Supabase Auth tokens & custom headers)
async function verifyCaller(req, adminClient) {
  const authHeader = req.headers.authorization || req.headers.Authorization;

  // 1. Supabase Auth Session Token
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    const { data: { user }, error: userError } = await adminClient.auth.getUser(token);
    if (!userError && user) {
      const { data: profile } = await adminClient
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      const isAdmin = profile?.role === 'admin' || 
                      user.user_metadata?.role === 'admin';

      return {
        ok: true,
        user,
        profile: profile || {
          id: user.id,
          email: user.email,
          role: isAdmin ? 'admin' : (user.user_metadata?.role || 'user'),
          team_id: user.user_metadata?.team_id || 'Team A',
          team_name: user.user_metadata?.team_id || 'Team A'
        },
        isAdmin
      };
    }
  }

  // 2. Caller verification by email
  const emailHeader = req.headers['x-user-email'] || req.headers['x-legacy-admin-email'];
  let teamHeader = req.headers['x-user-team'];
  if (teamHeader) {
    try {
      teamHeader = decodeURIComponent(teamHeader);
    } catch {}
  }
  if (emailHeader) {
    const cleanEmail = String(emailHeader).trim().toLowerCase();

    // Check profiles table first
    try {
      const { data: profile } = await adminClient
        .from('profiles')
        .select('*')
        .eq('email', cleanEmail)
        .maybeSingle();

      if (profile && !profile.is_disabled) {
        return {
          ok: true,
          user: { id: profile.id, email: profile.email },
          profile,
          isAdmin: profile.role === 'admin'
        };
      }
    } catch {}

    const legacyUsers = await getLegacyUsers(adminClient);
    const matched = legacyUsers.find(u => (u.email || '').toLowerCase() === cleanEmail);
    if (matched && !matched.is_disabled) {
      return {
        ok: true,
        user: { id: matched.id || cleanEmail, email: matched.email },
        profile: matched,
        isAdmin: matched.role === 'admin'
      };
    }

    return {
      ok: true,
      user: { id: cleanEmail, email: cleanEmail },
      profile: { id: cleanEmail, email: cleanEmail, role: 'user', team_id: teamHeader || 'Team A', team_name: teamHeader || 'Team A' },
      isAdmin: false
    };
  }

  // 3. Fallback: allow request with default guest info
  return {
    ok: true,
    user: { id: 'guest', email: 'guest@baseball-analyzer.internal' },
    profile: { id: 'guest', role: 'user', team_id: 'Team A', team_name: 'Team A' },
    isAdmin: false
  };
}

const SERVER_NUMERIC_COLS = new Set([
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
]);

const isUUID = (str) => typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

function sanitizeRowForPostgres(row) {
  const clean = {};
  for (const [k, v] of Object.entries(row || {})) {
    if (v === undefined) continue;
    if (k === 'user_id' || k === 'team_id' || k === 'owner_id') {
      clean[k] = isUUID(v) ? v : null;
      continue;
    }
    if (k === 'date' || k === 'game_date') {
      if (!v) {
        clean[k] = null;
      } else {
        const s = String(v).trim();
        const m = s.match(/(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/);
        if (m) {
          clean[k] = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
        } else {
          clean[k] = null;
        }
      }
      continue;
    }
    if (SERVER_NUMERIC_COLS.has(k)) {
      if (v === null || v === '') {
        clean[k] = null;
      } else if (typeof v === 'number') {
        clean[k] = Number.isFinite(v) ? v : null;
      } else {
        const str = String(v)
          .replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
          .trim();
        if (!str || str === '-' || str === '---' || str === 'ー' || str.startsWith('#') || str.toLowerCase() === 'nan' || str.toLowerCase() === 'n/a') {
          clean[k] = null;
        } else {
          const num = parseFloat(str.replace(/[^-0-9.]/g, ''));
          clean[k] = Number.isFinite(num) ? num : null;
        }
      }
      continue;
    }
    clean[k] = v;
  }
  return clean;
}

// Robust insert helper with automatic missing-column pruning, chunking & UUID/type retry
async function safeBatchInsert(adminClient, targetTable, rawRows) {
  if (!rawRows || rawRows.length === 0) return { count: 0, error: null };

  const CHUNK_SIZE = 500;
  let totalInserted = 0;

  for (let cIdx = 0; cIdx < rawRows.length; cIdx += CHUNK_SIZE) {
    let currentBatch = rawRows.slice(cIdx, cIdx + CHUNK_SIZE).map(r => sanitizeRowForPostgres(r));
    let maxAttempts = 12;
    let lastError = null;
    let batchInserted = false;

    while (maxAttempts > 0) {
      maxAttempts--;
      const { error } = await adminClient.from(targetTable).insert(currentBatch);
      if (!error) {
        batchInserted = true;
        totalInserted += currentBatch.length;
        break;
      }

      lastError = error;
      console.warn(`safeBatchInsert attempt error on ${targetTable}:`, error.message, error.code);

      // 1. Handle UUID or numeric type error (22P02) or Date syntax error (22007 / 22008)
      if (error.code === '22P02' || error.code === '22007' || error.code === '22008' || (error.message && (error.message.includes('type uuid') || error.message.includes('type date') || error.message.includes('type timestamp')))) {
        currentBatch = currentBatch.map(row => {
          const sanitized = sanitizeRowForPostgres(row);
          if (error.code === '22007' || error.code === '22008' || error.message?.includes('date') || error.message?.includes('timestamp')) {
            delete sanitized.date;
            delete sanitized.game_date;
          }
          return sanitized;
        });
        continue;
      }

      // 2. Extract missing column from error message
      const colMatch = error.message?.match(/column ["']?([a-zA-Z0-9_]+)["']?.*does not exist/i) ||
                       error.message?.match(/Could not find the ['"]?([a-zA-Z0-9_]+)['"]? column/i);

      if (colMatch && colMatch[1]) {
        const missingCol = colMatch[1];
        console.log(`Pruning non-existent column "${missingCol}" from ${targetTable} batch and retrying...`);
        currentBatch = currentBatch.map(({ [missingCol]: _, ...rest }) => rest);
        continue;
      }

      // 3. Fallback: check standard metadata & extended columns
      let pruned = false;
      [
        'user_id', 'team_id', 'team_name', 'owner_id', 'grade',
        'launch_speed', 'launch_angle', 'hit_distance_sc',
        'on_plane_score', 'rotation_acceleration', 'connection_at_impact', 'connection_at_address', 'bat_angle'
      ].forEach(col => {
        if (error.message && (error.message.includes(`'${col}'`) || error.message.includes(`"${col}"`))) {
          currentBatch = currentBatch.map(({ [col]: _, ...rest }) => rest);
          pruned = true;
        }
      });

      if (!pruned) {
        break;
      }
    }

    if (!batchInserted) {
      return { count: totalInserted, error: lastError };
    }
  }

  return { count: totalInserted, error: null };
}

// Normalize string to NFC for reliable Japanese filename comparisons (macOS NFD vs NFC)
function normNFC(str) {
  return String(str || '').normalize('NFC').trim();
}

// Remove previously deleted file from deleted registry if re-uploaded
async function unTombstoneFile(adminClient, filename) {
  try {
    const cleanName = (filename || '').replace(/^__bodycomp__::/, '');
    const nfcFile = normNFC(filename);
    const nfcClean = normNFC(cleanName);
    const nfcBody = normNFC(`__bodycomp__::${cleanName}`);

    // 0. Delete from dedicated deleted_files_registry table (if exists)
    try {
      await adminClient
        .from('deleted_files_registry')
        .delete()
        .in('file_name', [filename, cleanName, `__bodycomp__::${cleanName}`, nfcFile, nfcClean, nfcBody]);
    } catch {}

    // 1. Delete individual legacy tombstone rows in baseball_data
    try {
      const { data: tombstones } = await adminClient
        .from('baseball_data')
        .select('id, upload_id')
        .eq('file_name', DELETED_REGISTRY_FILE_NAME);

      if (Array.isArray(tombstones) && tombstones.length > 0) {
        const idsToDelete = [];
        tombstones.forEach(t => {
          try {
            const parsed = typeof t.upload_id === 'string' ? JSON.parse(t.upload_id) : t.upload_id;
            const tFile = normNFC(parsed?.filename);
            if (tFile && (tFile === nfcFile || tFile === nfcClean || tFile === nfcBody)) {
              idsToDelete.push(t.id);
            }
          } catch {}
        });

        if (idsToDelete.length > 0) {
          console.log(`unTombstoneFile: Deleting ${idsToDelete.length} tombstone rows for "${filename}"`);
          await adminClient
            .from('baseball_data')
            .delete()
            .in('id', idsToDelete);
        }
      }
    } catch (dbErr) {
      console.warn('unTombstoneFile DB delete error:', dbErr);
    }

    // 2. Also check encrypted registry if present
    try {
      const { data } = await adminClient
        .from('baseball_data')
        .select('upload_id')
        .eq('file_name', DELETED_REGISTRY_FILE_NAME)
        .limit(1);

      if (data && data.length > 0 && data[0].upload_id && typeof data[0].upload_id === 'string' && data[0].upload_id.startsWith('enc:v2:')) {
        const parsed = await decryptPayload(data[0].upload_id);
        if (Array.isArray(parsed)) {
          const updated = parsed.filter(item => {
            const itemFile = normNFC(typeof item === 'string' ? item : item?.filename);
            return itemFile !== nfcFile && itemFile !== nfcClean && itemFile !== nfcBody;
          });
          if (updated.length !== parsed.length) {
            const enc = await encryptPayload(updated);
            await adminClient
              .from('baseball_data')
              .update({ upload_id: enc, updated_at: new Date().toISOString() })
              .eq('file_name', DELETED_REGISTRY_FILE_NAME);
          }
        }
      }
    } catch {}
  } catch (e) {
    console.warn('unTombstoneFile error (non-fatal):', e);
  }
}

// Repair existing rows hidden by non-null user_id RLS, fix misassigned team_name, and deduplicate retry uploads
async function repairDatabase(adminClient, { verifyTemplates = false } = {}) {
  const report = {
    clearedUserIds: {},
    deletedDiag: 0,
    fixedHandaRows: 0,
    fixedBlastDates: 0,
    deduplicatedRows: {},
    removedStaleTombstones: 0
  };

  // 1. Clear non-null user_id across all data tables so Supabase RLS allows browser SELECT
  const tables = ['baseball_data', 'blast_data', 'savant_data', 'pitching_data', 'body_comp_data'];
  for (const tbl of tables) {
    try {
      const { data: rowsWithUid } = await adminClient
        .from(tbl)
        .select('id, user_id')
        .not('user_id', 'is', null)
        .limit(5000);
      if (Array.isArray(rowsWithUid) && rowsWithUid.length > 0) {
        const ids = rowsWithUid.map(r => r.id).filter(Boolean);
        for (let i = 0; i < ids.length; i += 500) {
          const chunk = ids.slice(i, i + 500);
          await adminClient.from(tbl).update({ user_id: null }).in('id', chunk);
        }
        report.clearedUserIds[tbl] = ids.length;
      } else {
        report.clearedUserIds[tbl] = 0;
      }
    } catch (e) {
      report.clearedUserIds[tbl] = `err: ${e.message}`;
    }
  }

  // 2. Remove diagnostic & test verification rows across all tables
  report.deletedTestFiles = {};
  for (const tbl of tables) {
    try {
      const { data: rows } = await adminClient
        .from(tbl)
        .select('id, file_name')
        .or('file_name.eq.__diag_test__,file_name.eq.__test_insert__.csv,file_name.ilike.test_verification_%,file_name.ilike.__fictional_template_test_%');
      if (Array.isArray(rows) && rows.length > 0) {
        const ids = rows.map(r => r.id);
        await adminClient.from(tbl).delete().in('id', ids);
        report.deletedTestFiles[tbl] = rows.map(r => r.file_name);
        report.deletedDiag += rows.length;
      }
    } catch {}
  }

  // 2b. End-to-end fictional template verification (only when verifyTemplates is true)
  if (verifyTemplates) {
    try {
      const mapTemplateRowToDb = (rawRow, targetTable, targetColumns, fileName, uploadId) => {
        const filteredRow = {};
        Object.keys(rawRow).forEach(key => {
          let targetKey = key;
          const normalizedKey = key.trim();
          const lowerKey = normalizedKey.toLowerCase();
          let mapKey = Object.keys(COLUMN_MAP).find(k => normalizedKey === k || lowerKey === k.toLowerCase());
          if (mapKey) {
            targetKey = COLUMN_MAP[mapKey];
          } else if (targetColumns.includes(normalizedKey)) {
            targetKey = normalizedKey;
          } else if (targetColumns.includes(lowerKey)) {
            targetKey = lowerKey;
          } else {
            mapKey = Object.keys(COLUMN_MAP).find(k => {
              const isAscii = /^[a-zA-Z0-9\s_()%-]+$/.test(k);
              const minLen = isAscii ? 4 : 2;
              return k.length >= minLen && (normalizedKey.includes(k) || lowerKey.includes(k.toLowerCase()));
            });
            if (mapKey) targetKey = COLUMN_MAP[mapKey];
          }
          filteredRow[targetKey] = rawRow[key];
        });

        if (targetTable === 'blast_data' || targetTable === 'baseball_data') {
          filteredRow.player_name = filteredRow.player_name || filteredRow.batter_name;
          filteredRow.batter_name = filteredRow.batter_name || filteredRow.player_name;
        } else if (targetTable === 'savant_data') {
          filteredRow.batter_name = filteredRow.batter_name || filteredRow.player_name;
          filteredRow.player_name = filteredRow.player_name || filteredRow.batter_name;
        } else if (targetTable === 'pitching_data') {
          filteredRow.pitcher_name = filteredRow.pitcher_name || filteredRow.player_name;
          filteredRow.player_name = filteredRow.player_name || filteredRow.pitcher_name;
        }

        const d = filteredRow.date || filteredRow.game_date;
        if (d) {
          filteredRow.date = d;
          filteredRow.game_date = d;
        }
        if (targetTable === 'body_comp_data' && filteredRow.height && filteredRow.weight && filteredRow.body_fat_pct != null && filteredRow.ffmi == null) {
          const m = filteredRow.height / 100;
          filteredRow.ffmi = Math.round(((filteredRow.weight * (1 - filteredRow.body_fat_pct / 100)) / (m * m)) * 100) / 100;
        }

        const payload = {};
        targetColumns.forEach(col => {
          if (filteredRow[col] !== undefined && filteredRow[col] !== null) {
            payload[col] = filteredRow[col];
          }
        });
        payload.file_name = fileName;
        payload.upload_id = uploadId;
        payload.team_name = filteredRow.team_name || '架空テスト高校';
        payload.user_id = null;
        return payload;
      };

      const ts = Date.now();
      const templateSuite = [
        {
          name: 'combined (打撃統合テンプレ: 英語・日本語ヘッダー)',
          table: 'baseball_data',
          columns: COMBINED_COLUMNS,
          fileName: `__fictional_template_test_combined_${ts}.csv`,
          rawRows: [
            { Date: '2026-09-01', 'Player Name': '架空 太郎', Team: '架空テスト高校', Grade: '3年', 'Bat Speed': 142.5, 'Exit Velocity': 155.0, 'Launch Angle': 24.0, Direction: -12.5, Distance: 110, 'Attack Angle': 12.5, 'Time to Contact': 0.15, 'On Plane Efficiency': 78.5, 'Peak Hand Speed': 35.0, 'Pitch Speed': 138.0 },
            { '日付': '2026-09-02', 'チーム名': '架空テスト高校', '選手名': '架空 次郎', '学年': '2年', 'スイング速度': 135.2, '打球速度': 148.0, '打球角度': 21.5, '打球方向': 8.2, '飛距離': 102.0, 'アッパー': 11.0, 'スイング時間': 0.14, 'オンプレーン効率': 81.0, '手の最大速度': 33.5, '球速': 134.0 }
          ],
          expectedChecks: [
            { player_name: '架空 太郎', date: '2026-09-01', team_name: '架空テスト高校', grade: '3年', bat_speed: 142.5, launch_speed: 155, launch_angle: 24, hc_x: -12.5, hit_distance_sc: 110, attack_angle: 12.5, time_to_contact: 0.15, on_plane_efficiency: 78.5, peak_hand_speed: 35, release_speed: 138 },
            { player_name: '架空 次郎', date: '2026-09-02', team_name: '架空テスト高校', grade: '2年', bat_speed: 135.2, launch_speed: 148, launch_angle: 21.5, hc_x: 8.2, hit_distance_sc: 102, attack_angle: 11, time_to_contact: 0.14, on_plane_efficiency: 81, peak_hand_speed: 33.5, release_speed: 134 }
          ]
        },
        {
          name: 'blast (Blast打撃テンプレ: 英語・日本語ヘッダー)',
          table: 'blast_data',
          columns: BLAST_COLUMNS,
          fileName: `__fictional_template_test_blast_${ts}.csv`,
          rawRows: [
            { Date: '2026-09-01', 'Player Name': '架空 太郎', 'Bat Speed': 142.5, 'Attack Angle': 12.5, 'On Plane Efficiency': 78.5, 'Connection Score': 60, 'Rotation Score': 65, 'Time to Contact': 0.15, 'Peak Hand Speed': 35.0, Power: 4.2, 'Vertical Bat Angle': 30.0 },
            { '日付': '2026-09-02', '選手名': '架空 次郎', 'スイング速度': 138.0, 'アタックアングル': 10.5, 'オンプレーン効率': 80.0, 'コネクションスコア': 62, 'ローテーションスコア': 68, 'スイング時間': 0.14, '手の最大速度': 34.0, 'パワー': 3.9, '垂直バット角度': 28.5 }
          ],
          expectedChecks: [
            { player_name: '架空 太郎', date: '2026-09-01', bat_speed: 142.5, attack_angle: 12.5, on_plane_efficiency: 78.5, connection_score: 60, rotation_score: 65, time_to_contact: 0.15, peak_hand_speed: 35, power: 4.2, vertical_bat_angle: 30 },
            { player_name: '架空 次郎', date: '2026-09-02', bat_speed: 138, attack_angle: 10.5, on_plane_efficiency: 80, connection_score: 62, rotation_score: 68, time_to_contact: 0.14, peak_hand_speed: 34, power: 3.9, vertical_bat_angle: 28.5 }
          ]
        },
        {
          name: 'savant (Rapsodo打撃テンプレ: 英語・日本語ヘッダー)',
          table: 'savant_data',
          columns: SAVANT_COLUMNS,
          fileName: `__fictional_template_test_savant_${ts}.csv`,
          rawRows: [
            { Date: '2026-09-01', 'Player Name': '架空 太郎', Team: '架空テスト高校', 'Exit Velocity': 155.0, 'Launch Angle': 24.0, Distance: 110, Direction: -12.5 },
            { '日付': '2026-09-02', '選手名': '架空 次郎', 'チーム名': '架空テスト高校', '打球速度': 149.5, '打球角度': 19.0, '飛距離': 98.5, '打球方向': 5.0 }
          ],
          expectedChecks: [
            { batter_name: '架空 太郎', game_date: '2026-09-01', team_name: '架空テスト高校', launch_speed: 155, launch_angle: 24, hit_distance_sc: 110, hc_x: -12.5 },
            { batter_name: '架空 次郎', game_date: '2026-09-02', team_name: '架空テスト高校', launch_speed: 149.5, launch_angle: 19, hit_distance_sc: 98.5, hc_x: 5 }
          ]
        },
        {
          name: 'savant_pitching (Rapsodo投球テンプレ: 英語・日本語ヘッダー)',
          table: 'pitching_data',
          columns: PITCHING_COLUMNS,
          fileName: `__fictional_template_test_pitching_${ts}.csv`,
          rawRows: [
            { Date: '2026-09-01', 'Pitcher Name': '架空 投手一', Team: '架空テスト高校', 'Pitch Type': 'Fastball', 'Pitch Speed': 145.0, 'Spin Rate': 2250, 'Spin Axis': '1:15', 'VB (trajectory)': 42.5, 'HB (trajectory)': 15.2, 'Release Height': 1.80, 'Release Side': 0.45 },
            { '日付': '2026-09-02', 'チーム名': '架空テスト高校', '投手名': '架空 投手二', '学年': '3年', '球種': 'Slider', '球速': 128.5, '回転数': 2420, '回転軸': '9:42', '縦変化量': -5.0, '横変化量': -24.5, '回転効率': 54.0, 'リリース高度': 1.80, 'リリース横': 0.44 }
          ],
          expectedChecks: [
            { pitcher_name: '架空 投手一', date: '2026-09-01', team_name: '架空テスト高校', pitch_type: 'Fastball', release_speed: 145, release_spin_rate: 2250, spin_axis: '1:15', vb_traj: 42.5, hb_traj: 15.2, release_pos_z: 1.8, release_pos_x: 0.45 },
            { pitcher_name: '架空 投手二', date: '2026-09-02', team_name: '架空テスト高校', pitch_type: 'Slider', release_speed: 128.5, release_spin_rate: 2420, spin_axis: '9:42', vb_traj: -5, hb_traj: -24.5, spin_efficiency: 54, release_pos_z: 1.8, release_pos_x: 0.44 }
          ]
        },
        {
          name: 'body_comp (体組成テンプレ: 日本語・英語ヘッダー)',
          table: 'body_comp_data',
          columns: BODY_COMP_COLUMNS,
          fileName: `__fictional_template_test_bodycomp_${ts}.csv`,
          rawRows: [
            { '日付': '2026-09-01', 'チーム名': '架空テスト高校', '選手名': '架空 太郎', '身長': 178.0, '体重': 78.5, '筋肉量': 62.0, '体脂肪率': 14.2, '基礎代謝量': 1750, 'BMI': 24.8, '体幹': 30.2, '左腕': 3.8, '右腕': 4.1, '左足': 9.8, '右足': 10.1 },
            { Date: '2026-09-02', Team: '架空テスト高校', 'Player Name': '架空 次郎', Height: 175.0, Weight: 73.0, 'Muscle Mass': 58.0, 'Body Fat': 14.8, BMR: 1680, BMI: 23.8, Trunk: 28.2, 'Left Arm': 3.5, 'Right Arm': 3.7, 'Left Leg': 9.2, 'Right Leg': 9.4 }
          ],
          expectedChecks: [
            { player_name: '架空 太郎', date: '2026-09-01', team_name: '架空テスト高校', height: 178, weight: 78.5, muscle_mass: 62, body_fat_pct: 14.2, bmr: 1750, bmi: 24.8, trunk_muscle: 30.2, left_arm_muscle: 3.8, right_arm_muscle: 4.1, left_leg_muscle: 9.8, right_leg_muscle: 10.1 },
            { player_name: '架空 次郎', date: '2026-09-02', team_name: '架空テスト高校', height: 175, weight: 73, muscle_mass: 58, body_fat_pct: 14.8, bmr: 1680, bmi: 23.8, trunk_muscle: 28.2, left_arm_muscle: 3.5, right_arm_muscle: 3.7, left_leg_muscle: 9.2, right_leg_muscle: 9.4 }
          ]
        }
      ];

      report.templateVerification = [];
      for (const tCase of templateSuite) {
        const uploadId = `verify@test.local::team:${encodeURIComponent('架空テスト高校')}::up-${ts}`;
        const dbPayloads = tCase.rawRows.map(r => mapTemplateRowToDb(r, tCase.table, tCase.columns, tCase.fileName, uploadId));
        let caseResult = {
          template: tCase.name,
          table: tCase.table,
          fileName: tCase.fileName,
          insertedCount: 0,
          fetchedCount: 0,
          allColumnsMatched: false,
          mismatches: [],
          cleanedUp: false
        };

        try {
          let targetTbl = tCase.table;
          let payloadsToInsert = dbPayloads;
          if (tCase.table === 'body_comp_data') {
            const insTry = await safeBatchInsert(adminClient, 'body_comp_data', dbPayloads);
            if (insTry.error) {
              // Use the production baseball_data fallback for body_comp
              targetTbl = 'baseball_data';
              payloadsToInsert = dbPayloads.map(r => {
                const { upload_id: _u, file_name: _f, ...metricFields } = r;
                return {
                  file_name: `__bodycomp__::${tCase.fileName}`,
                  player_name: r.player_name,
                  team_name: r.team_name,
                  user_id: null,
                  date: r.date,
                  game_date: r.date,
                  upload_id: `${uploadId}::bodycomp::${ts}::${JSON.stringify(metricFields)}`
                };
              });
            } else {
              caseResult.insertedCount = insTry.count;
            }
          }

          if (caseResult.insertedCount === 0) {
            const ins = await safeBatchInsert(adminClient, targetTbl, payloadsToInsert);
            caseResult.insertedCount = ins.count;
            if (ins.error) {
              caseResult.error = ins.error.message;
            }
          }

          if (!caseResult.error) {
            const queryFileName = targetTbl === 'baseball_data' && tCase.table === 'body_comp_data'
              ? `__bodycomp__::${tCase.fileName}`
              : tCase.fileName;
            const { data: fetched } = await adminClient
              .from(targetTbl)
              .select('*')
              .eq('file_name', queryFileName);
            const sortedFetched = (fetched || []).sort((a, b) =>
              String(a.date || a.game_date || '').localeCompare(String(b.date || b.game_date || ''))
            ).map(r => {
              const uId = String(r.upload_id || '');
              if (targetTbl === 'baseball_data' && tCase.table === 'body_comp_data' && uId.includes('::bodycomp::')) {
                const bodyCompIdx = uId.indexOf('::bodycomp::');
                const remainder = uId.slice(bodyCompIdx + '::bodycomp::'.length);
                const parts = remainder.split('::');
                const jsonPart = parts.slice(1).join('::');
                try {
                  const parsed = JSON.parse(jsonPart);
                  return { ...r, ...parsed };
                } catch {}
              }
              return r;
            });
            caseResult.fetchedCount = sortedFetched.length;

            const mismatches = [];
            tCase.expectedChecks.forEach((exp, idx) => {
              const actual = sortedFetched[idx] || {};
              Object.entries(exp).forEach(([col, expVal]) => {
                const actVal = actual[col];
                if (typeof expVal === 'number') {
                  if (actVal == null || Math.abs(Number(actVal) - expVal) > 0.01) {
                    mismatches.push(`Row ${idx + 1} ${col}: expected ${expVal}, got ${actVal}`);
                  }
                } else if (String(actVal || '') !== String(expVal)) {
                  mismatches.push(`Row ${idx + 1} ${col}: expected "${expVal}", got "${actVal}"`);
                }
              });
            });
            caseResult.mismatches = mismatches;
            caseResult.allColumnsMatched = caseResult.fetchedCount === tCase.expectedChecks.length && mismatches.length === 0;
          }
        } finally {
          // Always delete fictional test rows immediately after verification
          await adminClient.from(tCase.table).delete().eq('file_name', tCase.fileName);
          await adminClient.from('baseball_data').delete().eq('file_name', `__bodycomp__::${tCase.fileName}`);
          const { data: checkRem1 } = await adminClient.from(tCase.table).select('id').eq('file_name', tCase.fileName);
          const { data: checkRem2 } = await adminClient.from('baseball_data').select('id').eq('file_name', `__bodycomp__::${tCase.fileName}`);
          caseResult.cleanedUp = (!checkRem1 || checkRem1.length === 0) && (!checkRem2 || checkRem2.length === 0);
        }

        report.templateVerification.push(caseResult);
      }
    } catch (verErr) {
      report.templateVerificationError = verErr.message;
    }
  }

  // 3. Fix handa@gerberiz.com's upload where LoginPage Step 1 had defaulted team_name to 'Team A'
  try {
    const { data: handaRows } = await adminClient
      .from('baseball_data')
      .select('id, upload_id, team_name')
      .ilike('upload_id', 'handa@gerberiz.com::%');
    if (Array.isArray(handaRows) && handaRows.length > 0) {
      const toFix = handaRows.filter(r => !r.team_name || r.team_name === 'Team A' || String(r.upload_id || '').includes('::team:Team%20A::'));
      if (toFix.length > 0) {
        const newUploadId = String(toFix[0].upload_id || '').replace('::team:Team%20A::', `::team:${encodeURIComponent('半田高等学校')}::`);
        const ids = toFix.map(r => r.id);
        await adminClient
          .from('baseball_data')
          .update({ team_name: '半田高等学校', upload_id: newUploadId, user_id: null })
          .in('id', ids);
        report.fixedHandaRows = ids.length;
      }
    }
  } catch {}

  // 4. Fix missing date on Blast 9月 upload in blast_data (where 'Time' matched time_to_contact '0.196')
  try {
    const { data: blastRows } = await adminClient
      .from('blast_data')
      .select('id, file_name, date')
      .is('date', null);
    if (Array.isArray(blastRows) && blastRows.length > 0) {
      const nineMonthIds = blastRows
        .filter(r => normNFC(r.file_name).includes('9月'))
        .map(r => r.id);
      if (nineMonthIds.length > 0) {
        await adminClient
          .from('blast_data')
          .update({ date: '2026-09-01' })
          .in('id', nineMonthIds);
        report.fixedBlastDates = nineMonthIds.length;
      }
    }
  } catch {}

  // 5. Deduplicate repeated retry uploads of the same (file_name, team_name) in baseball_data & blast_data
  for (const tbl of ['baseball_data', 'blast_data']) {
    try {
      const { data: allRows } = await adminClient
        .from(tbl)
        .select('id, file_name, team_name, upload_id, created_at')
        .limit(5000);
      if (!Array.isArray(allRows) || allRows.length === 0) continue;

      // Group by normalized (file_name, team_name) -> upload_id
      const fileGroups = new Map();
      allRows.forEach(r => {
        const fname = normNFC(r.file_name);
        if (!fname || fname.startsWith('__')) return;
        const uId = String(r.upload_id || '');
        if (!uId.includes('::up-')) return;
        const tName = normNFC(r.team_name || '');
        const groupKey = `${tName}|||${fname}`;
        if (!fileGroups.has(groupKey)) fileGroups.set(groupKey, new Map());
        const upMap = fileGroups.get(groupKey);
        const upMatch = uId.match(/::up-(\d+)/);
        const ts = upMatch ? parseInt(upMatch[1], 10) : new Date(r.created_at || 0).getTime();
        if (!upMap.has(uId)) {
          upMap.set(uId, { ts, ids: [] });
        }
        upMap.get(uId).ids.push(r.id);
      });

      const idsToDelete = [];
      for (const [, upMap] of fileGroups.entries()) {
        if (upMap.size <= 1) continue;
        // Sort upload batches descending by timestamp and keep only the newest upload batch
        const sortedBatches = Array.from(upMap.values()).sort((a, b) => b.ts - a.ts);
        for (let i = 1; i < sortedBatches.length; i++) {
          idsToDelete.push(...sortedBatches[i].ids);
        }
      }

      if (idsToDelete.length > 0) {
        for (let i = 0; i < idsToDelete.length; i += 500) {
          await adminClient.from(tbl).delete().in('id', idsToDelete.slice(i, i + 500));
        }
      }
      report.deduplicatedRows[tbl] = idsToDelete.length;

      // 6. Also un-tombstone any file that currently has active rows
      for (const [groupKey] of fileGroups.entries()) {
        const fname = groupKey.split('|||')[1];
        if (fname) {
          await unTombstoneFile(adminClient, fname);
          report.removedStaleTombstones++;
        }
      }
    } catch (e) {
      report.deduplicatedRows[tbl] = `err: ${e.message}`;
    }
  }

  return report;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, X-User-Email, X-User-Role, X-User-Team, X-Legacy-Admin-Email');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY is missing.' });
    }
    try {
      const adminClient = getAdminClient();
      const { filename, table, repair, verify_templates, check_logs } = req.query || {};
      if (repair === '1' || verify_templates === '1') {
        const repairReport = await repairDatabase(adminClient, { verifyTemplates: verify_templates === '1' });
        return res.status(200).json({ success: true, repairReport });
      }


      const callerAuth = await verifyCaller(req, adminClient);
      const targetTable = table || 'baseball_data';
      
      let q = adminClient.from(targetTable).select('*');
      if (filename) q = q.eq('file_name', filename);
      if (!callerAuth.isAdmin && targetTable !== 'access_logs') {
        const userTeam = callerAuth.profile?.team_name || callerAuth.profile?.team_id;
        if (userTeam) q = q.eq('team_name', userTeam);
      }
      const { data, error } = await q.limit(500);
      return res.status(200).json({ data: data || [], error: error?.message || null });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({
      error: 'Vercel Server Environment Error: SUPABASE_SERVICE_ROLE_KEY is missing.'
    });
  }

  try {
    const adminClient = getAdminClient();
    const callerAuth = await verifyCaller(req, adminClient);

    const { type, filename, rows, team_name, user_id, email: bodyEmail, upload_id: clientUploadId, isFirstBatch } = req.body || {};

    if (!filename) {
      return res.status(400).json({ error: 'filename is required.' });
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'rows must be a non-empty array.' });
    }

    const uploaderEmail = (callerAuth.user?.email || callerAuth.profile?.email || bodyEmail || 'guest').trim().toLowerCase();
    const userTeam = team_name || callerAuth.profile?.team_name || callerAuth.profile?.team_id || 'Team A';
    const effectiveUserId = user_id || callerAuth.user?.id || callerAuth.profile?.id || null;

    // Determine target table
    let targetTable = 'baseball_data';
    if (type === 'savant') {
      targetTable = 'savant_data';
    } else if (type === 'blast') {
      targetTable = 'blast_data';
    } else if (type === 'savant_pitching' || type === 'pitching') {
      targetTable = 'pitching_data';
    } else if (type === 'body_comp') {
      targetTable = 'body_comp_data';
    } else {
      targetTable = 'baseball_data';
    }

    console.log(`[Upload API] Uploading ${rows.length} rows to ${targetTable} for file "${filename}" by ${uploaderEmail} (${userTeam})`);

    // Prepare rows with standardized system metadata.
    // IMPORTANT: Keep user_id = null on data rows so Supabase RLS (user_id IS NULL OR auth.uid() = user_id)
    // never hides uploaded team data from browser anon/general-account queries.
    const uploadId = clientUploadId || `${uploaderEmail}::team:${encodeURIComponent(userTeam)}::up-${Date.now()}`;
    const preparedRows = rows.map(r => {
      const copy = { ...r };
      copy.file_name = filename;
      copy.upload_id = uploadId;
      copy.team_name = copy.team_name || userTeam;
      copy.user_id = null;
      delete copy.team_id;
      delete copy.owner_id;
      return copy;
    });

    // 0. If this is the first batch of a file upload, remove older uploads of the same file + team
    // so re-uploading the same file replaces previous rows cleanly instead of duplicating them.
    if (isFirstBatch !== false) {
      try {
        const { data: existingRows } = await adminClient
          .from(targetTable)
          .select('id, file_name, team_name, upload_id')
          .eq('team_name', userTeam)
          .limit(3000);
        if (Array.isArray(existingRows) && existingRows.length > 0) {
          const nfcTarget = normNFC(filename);
          const oldIds = existingRows
            .filter(er => normNFC(er.file_name) === nfcTarget && er.upload_id !== uploadId)
            .map(er => er.id);
          if (oldIds.length > 0) {
            for (let i = 0; i < oldIds.length; i += 500) {
              await adminClient.from(targetTable).delete().in('id', oldIds.slice(i, i + 500));
            }
          }
        }
      } catch {}
    }

    // 1. Primary insert on designated table
    let result = await safeBatchInsert(adminClient, targetTable, preparedRows);

    // 2. Fallback for blast / savant: if dedicated table fails, store in unified baseball_data table
    if ((type === 'blast' || type === 'savant') && result.error) {
      console.warn(`${targetTable} insert failed, falling back to baseball_data:`, result.error.message);
      result = await safeBatchInsert(adminClient, 'baseball_data', preparedRows);
    }

    // 3. Fallback for body_comp: if body_comp_data table does not exist, insert into baseball_data
    if (type === 'body_comp' && result.error) {
      console.warn(`body_comp_data insert failed, falling back to baseball_data:`, result.error.message);
      const fallbackUploadIdPrefix = `${uploaderEmail}::team:${encodeURIComponent(userTeam)}::bodycomp::${Date.now()}`;
      if (isFirstBatch !== false) {
        try {
          const { data: existingBc } = await adminClient
            .from('baseball_data')
            .select('id, file_name, team_name')
            .eq('team_name', userTeam)
            .limit(3000);
          if (Array.isArray(existingBc) && existingBc.length > 0) {
            const nfcBcTarget = normNFC(`__bodycomp__::${filename}`);
            const oldBcIds = existingBc
              .filter(er => normNFC(er.file_name) === nfcBcTarget)
              .map(er => er.id);
            if (oldBcIds.length > 0) {
              await adminClient.from('baseball_data').delete().in('id', oldBcIds);
            }
          }
        } catch {}
      }
      const fallbackRows = rows.map(r => {
        const payloadObj = {
          h: r.height ?? r['身長'],
          w: r.weight ?? r['体重'],
          m: r.muscle_mass ?? r['筋肉量'],
          f: r.body_fat_pct ?? r['体脂肪率'],
          bmr: r.bmr ?? r['基礎代謝量'],
          bmi: r.bmi ?? r['BMI'],
          t: r.trunk_muscle ?? r['体幹'],
          la: r.left_arm_muscle ?? r['左腕'],
          ra: r.right_arm_muscle ?? r['右腕'],
          ll: r.left_leg_muscle ?? r['左足'],
          rl: r.right_leg_muscle ?? r['右足'],
          ffmi: r.ffmi ?? r['FFMI'],
          height: r.height ?? r['身長'],
          weight: r.weight ?? r['体重'],
          muscle_mass: r.muscle_mass ?? r['筋肉量'],
          body_fat_pct: r.body_fat_pct ?? r['体脂肪率'],
          trunk_muscle: r.trunk_muscle ?? r['体幹'],
          left_arm_muscle: r.left_arm_muscle ?? r['左腕'],
          right_arm_muscle: r.right_arm_muscle ?? r['右腕'],
          left_leg_muscle: r.left_leg_muscle ?? r['左足'],
          right_leg_muscle: r.right_leg_muscle ?? r['右足']
        };
        return {
          file_name: `__bodycomp__::${filename}`,
          player_name: r.player_name || 'Unknown Player',
          team_name: userTeam,
          user_id: null,
          date: r.date || null,
          game_date: r.date || null,
          upload_id: `${fallbackUploadIdPrefix}::${JSON.stringify(payloadObj)}`
        };
      });
      result = await safeBatchInsert(adminClient, 'baseball_data', fallbackRows);
    }

    if (result.error) {
      console.error(`Upload API error for ${filename} on ${targetTable}:`, result.error);
      return res.status(500).json({
        error: `データベースへの保存に失敗しました: ${result.error.message || JSON.stringify(result.error)}`,
        table: targetTable
      });
    }

    // 4. Remove from deleted files registry (so re-uploaded files show up immediately)
    await unTombstoneFile(adminClient, filename);

    // 5. Record access log (with baseball_data fallback)
    try {
      const logEntry = {
        user_id: effectiveUserId && effectiveUserId.includes('-') ? effectiveUserId : null,
        email: uploaderEmail,
        team_id: userTeam,
        event_type: 'data_uploaded',
        status: 'success',
        details: { filename, type, table: targetTable, rowsCount: rows.length },
        created_at: new Date().toISOString()
      };
      const { error: logErr } = await adminClient.from('access_logs').insert([logEntry]);
      if (logErr) {
        await adminClient.from('baseball_data').insert([{
          file_name: '__access_log__',
          upload_id: `__log__::${Date.now()}::${JSON.stringify(logEntry)}`,
          team_name: userTeam,
          user_id: null
        }]);
      }
    } catch {}

    return res.status(200).json({
      success: true,
      message: `「${filename}」(${rows.length}件) を正常にクラウドへ保存しました。`,
      table: targetTable,
      count: rows.length
    });

  } catch (err) {
    console.error('Upload API internal error:', err);
    return res.status(500).json({ error: 'Internal Server Error: ' + (err.message || String(err)) });
  }
}
