import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://ukyppwxsvcgxuxedwfom.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const ENCRYPTION_SALT = 'baseball-analyzer-secure-payload-salt-v2';
const SYSTEM_USER_FILE_NAME = '__app_user_profiles_v1__';
const DELETED_REGISTRY_FILE_NAME = '__deleted_files_registry_v1__';

function getAdminClient() {
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured in environment variables.');
  }
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

      const roleHeader = req.headers['x-user-role'];
      const email = (user.email || profile?.email || '').toLowerCase();
      const isAdmin = profile?.role === 'admin' || 
                      user.user_metadata?.role === 'admin' || 
                      roleHeader === 'admin';

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
  const roleHeader = req.headers['x-user-role'];
  const teamHeader = req.headers['x-user-team'];
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
          isAdmin: profile.role === 'admin' || roleHeader === 'admin'
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
        isAdmin: matched.role === 'admin' || roleHeader === 'admin'
      };
    }

    return {
      ok: true,
      user: { id: cleanEmail, email: cleanEmail },
      profile: { id: cleanEmail, email: cleanEmail, role: roleHeader || 'user', team_id: teamHeader || 'Team A', team_name: teamHeader || 'Team A' },
      isAdmin: roleHeader === 'admin'
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

// Robust insert helper with automatic missing-column pruning & UUID retry
async function safeBatchInsert(adminClient, targetTable, rawRows) {
  if (!rawRows || rawRows.length === 0) return { count: 0, error: null };

  const isUUID = (str) => typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

  let currentBatch = rawRows.map(r => ({ ...r }));
  let maxAttempts = 10;
  let lastError = null;

  while (maxAttempts > 0) {
    maxAttempts--;
    const { error } = await adminClient.from(targetTable).insert(currentBatch);
    if (!error) {
      return { count: currentBatch.length, error: null };
    }

    lastError = error;
    console.warn(`safeBatchInsert attempt error on ${targetTable}:`, error.message, error.code);

    // 1. Handle UUID type error (22P02)
    if (error.code === '22P02' || (error.message && error.message.includes('type uuid'))) {
      currentBatch = currentBatch.map(row => ({
        ...row,
        user_id: isUUID(row.user_id) ? row.user_id : null,
        team_id: isUUID(row.team_id) ? row.team_id : null,
        owner_id: isUUID(row.owner_id) ? row.owner_id : null
      }));
      continue;
    }

    // 2. Extract missing column from error message
    // e.g. "column \"launch_speed\" of relation \"blast_data\" does not exist"
    // or "column \"on_plane_efficiency\" does not exist"
    const colMatch = error.message?.match(/column ["']?([a-zA-Z0-9_]+)["']?.*does not exist/i) ||
                     error.message?.match(/Could not find the ['"]?([a-zA-Z0-9_]+)['"]? column/i);

    if (colMatch && colMatch[1]) {
      const missingCol = colMatch[1];
      console.log(`Pruning non-existent column "${missingCol}" from ${targetTable} batch and retrying...`);
      currentBatch = currentBatch.map(({ [missingCol]: _, ...rest }) => rest);
      continue;
    }

    // 3. Fallback: check standard metadata columns
    let pruned = false;
    ['user_id', 'team_id', 'team_name', 'owner_id', 'grade', 'launch_speed', 'launch_angle', 'hit_distance_sc'].forEach(col => {
      if (error.message && (error.message.includes(`'${col}'`) || error.message.includes(`"${col}"`))) {
        currentBatch = currentBatch.map(({ [col]: _, ...rest }) => rest);
        pruned = true;
      }
    });

    if (!pruned) {
      break;
    }
  }

  return { count: 0, error: lastError };
}

// Remove previously deleted file from deleted registry if re-uploaded
async function unTombstoneFile(adminClient, filename) {
  try {
    const { data } = await adminClient
      .from('baseball_data')
      .select('upload_id')
      .eq('file_name', DELETED_REGISTRY_FILE_NAME)
      .limit(1);

    if (data && data.length > 0 && data[0].upload_id) {
      const parsed = await decryptPayload(data[0].upload_id);
      if (Array.isArray(parsed)) {
        const cleanName = (filename || '').replace(/^__bodycomp__::/, '');
        const updated = parsed.filter(item => {
          const itemFile = typeof item === 'string' ? item : item?.filename;
          return itemFile !== filename && itemFile !== cleanName;
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
  } catch (e) {
    console.warn('unTombstoneFile error (non-fatal):', e);
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, X-User-Email, X-User-Role, X-User-Team, X-Legacy-Admin-Email');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
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

    const { type, filename, rows, team_name, team_id, user_id, email: bodyEmail } = req.body || {};

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

    // Prepare rows with standardized system metadata
    const uploadId = `${uploaderEmail}::up-${Date.now()}`;
    const preparedRows = rows.map(r => {
      const copy = { ...r };
      copy.file_name = filename;
      copy.upload_id = uploadId;
      copy.team_name = copy.team_name || userTeam;
      if (effectiveUserId) copy.user_id = effectiveUserId;
      return copy;
    });

    // 1. Primary insert on designated table
    let result = await safeBatchInsert(adminClient, targetTable, preparedRows);

    // 2. Fallback for body_comp: if body_comp_data table does not exist, insert into baseball_data
    if (type === 'body_comp' && result.error) {
      console.warn(`body_comp_data insert failed, falling back to baseball_data:`, result.error.message);
      const fallbackRows = rows.map(r => ({
        file_name: `__bodycomp__::${filename}`,
        player_name: r.player_name || 'Unknown Player',
        team_name: userTeam,
        date: r.date || null,
        game_date: r.date || null,
        upload_id: `${uploaderEmail}::bodycomp::${Date.now()}::${JSON.stringify(r)}`
      }));
      result = await safeBatchInsert(adminClient, 'baseball_data', fallbackRows);
    }

    if (result.error) {
      console.error(`Upload API error for ${filename} on ${targetTable}:`, result.error);
      return res.status(500).json({
        error: `データベースへの保存に失敗しました: ${result.error.message || JSON.stringify(result.error)}`,
        table: targetTable
      });
    }

    // 3. Remove from deleted files registry (so re-uploaded files show up immediately)
    await unTombstoneFile(adminClient, filename);

    // 4. Record access log
    try {
      await adminClient.from('access_logs').insert([{
        user_id: effectiveUserId && effectiveUserId.includes('-') ? effectiveUserId : null,
        email: uploaderEmail,
        team_id: userTeam,
        event_type: 'data_uploaded',
        status: 'success',
        details: { filename, type, table: targetTable, rowsCount: rows.length },
        created_at: new Date().toISOString()
      }]);
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
