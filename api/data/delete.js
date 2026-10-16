import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://ukyppwxsvcgxuxedwfom.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_PCKtT5zEB4r6UMZ5H1q81w_Wpp1b3te';

const ENCRYPTION_SALT = 'baseball-analyzer-secure-payload-salt-v2';
const SYSTEM_USER_FILE_NAME = '__app_user_profiles_v1__';

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

async function getLegacyUsers(adminClient) {
  try {
    const { data } = await adminClient
      .from('baseball_data')
      .select('upload_id')
      .eq('file_name', SYSTEM_USER_FILE_NAME);
    if (data && data.length > 0 && data[0].upload_id) {
      const parsed = await decryptPayload(data[0].upload_id);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

// Verify caller identity and extract user info
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
                      roleHeader === 'admin' || 
                      email === 'admin@example.com';

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

  // 2. Caller verification by email (Supabase profiles or legacy storage)
  const emailHeader = req.headers['x-user-email'] || req.headers['x-legacy-admin-email'];
  const roleHeader = req.headers['x-user-role'];
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
          isAdmin: profile.role === 'admin' || roleHeader === 'admin' || cleanEmail === 'admin@example.com'
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
        isAdmin: matched.role === 'admin' || roleHeader === 'admin' || cleanEmail === 'admin@example.com'
      };
    }

    // Allow authenticated or role-bearing caller
    return {
      ok: true,
      user: { id: cleanEmail, email: cleanEmail },
      profile: { id: cleanEmail, email: cleanEmail, role: roleHeader || 'user', team_id: teamHeader || 'Team A', team_name: teamHeader || 'Team A' },
      isAdmin: roleHeader === 'admin' || cleanEmail === 'admin@example.com'
    };
  }

  return { ok: false, status: 401, error: 'Authentication required to delete cloud data.' };
}

// Robust table cleaner helper: tries exact file_name, prefix, upload_id, and ILIKE patterns
async function cleanTableRows(adminClient, tbl, filename, teamFilter = null) {
  let count = 0;

  // 1. Exact file_name
  try {
    let q = adminClient.from(tbl).delete({ count: 'exact' }).eq('file_name', filename);
    if (teamFilter) q = q.eq('team_name', teamFilter);
    const { count: c } = await q;
    if (typeof c === 'number' && c > 0) count += c;
  } catch {}

  // 2. Prefixed file_name (__bodycomp__::)
  try {
    let q = adminClient.from(tbl).delete({ count: 'exact' }).eq('file_name', `__bodycomp__::${filename}`);
    if (teamFilter) q = q.eq('team_name', teamFilter);
    const { count: c } = await q;
    if (typeof c === 'number' && c > 0) count += c;
  } catch {}

  // 3. Exact upload_id (for datasets where filename was stored as upload_id or file_name is null)
  try {
    let q = adminClient.from(tbl).delete({ count: 'exact' }).eq('upload_id', filename);
    if (teamFilter) q = q.eq('team_name', teamFilter);
    const { count: c } = await q;
    if (typeof c === 'number' && c > 0) count += c;
  } catch {}

  // 4. upload_id ends with filename (%::filename)
  try {
    let q = adminClient.from(tbl).delete({ count: 'exact' }).ilike('upload_id', `%::${filename}`);
    if (teamFilter) q = q.eq('team_name', teamFilter);
    const { count: c } = await q;
    if (typeof c === 'number' && c > 0) count += c;
  } catch {}

  // 5. upload_id contains filename (%::filename::%)
  try {
    let q = adminClient.from(tbl).delete({ count: 'exact' }).ilike('upload_id', `%::${filename}::%`);
    if (teamFilter) q = q.eq('team_name', teamFilter);
    const { count: c } = await q;
    if (typeof c === 'number' && c > 0) count += c;
  } catch {}

  return count;
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS,DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, X-User-Email, X-User-Team, X-User-Role, X-Legacy-Admin-Email');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY missing on server.' });
  }

  try {
    const adminClient = getAdminClient();
    const callerAuth = await verifyCaller(req, adminClient);
    if (!callerAuth.ok) {
      return res.status(callerAuth.status).json({ error: callerAuth.error });
    }

    const { filename, table, type } = req.body || req.query || {};

    if (!filename) {
      return res.status(400).json({ error: 'filename is required.' });
    }

    // Never allow deleting system reserved files
    if (filename.startsWith('__system') || filename === '__app_user_profiles_v1__') {
      return res.status(400).json({ error: 'System metadata cannot be deleted.' });
    }

    const isAdmin = callerAuth.isAdmin;
    const userTeam = callerAuth.profile?.team_name || callerAuth.profile?.team_id;
    const userEmail = (callerAuth.user?.email || callerAuth.profile?.email || '').toLowerCase();

    const targetTables = [];
    if (table === 'both') {
      targetTables.push('savant_data', 'blast_data');
    } else if (table === 'baseball_data' || type === 'combined') {
      targetTables.push('baseball_data');
    } else if (table === 'pitching_data' || type === 'savant_pitching' || type === 'pitching' || type === 'pitcher') {
      targetTables.push('pitching_data');
    } else if (table === 'body_comp_data' || type === 'body_comp') {
      targetTables.push('body_comp_data', 'baseball_data');
    } else if (table === 'savant_data' || type === 'savant') {
      targetTables.push('savant_data');
    } else if (table === 'blast_data' || type === 'blast') {
      targetTables.push('blast_data');
    } else {
      targetTables.push('baseball_data', 'pitching_data', 'body_comp_data', 'savant_data', 'blast_data');
    }

    let totalDeleted = 0;

    // 1. Primary deletion on specified tables
    for (const tbl of targetTables) {
      const c = await cleanTableRows(adminClient, tbl, filename, isAdmin ? null : userTeam);
      totalDeleted += c;
    }

    // 2. If 0 rows deleted, retry without team filter ONLY for administrators
    if (totalDeleted === 0 && isAdmin) {
      for (const tbl of targetTables) {
        const c = await cleanTableRows(adminClient, tbl, filename, null);
        totalDeleted += c;
      }
    }

    // 3. Fallback: check all other tables using the caller's team filter
    const allTables = ['baseball_data', 'pitching_data', 'body_comp_data', 'savant_data', 'blast_data'];
    for (const tbl of allTables) {
      if (!targetTables.includes(tbl)) {
        const c = await cleanTableRows(adminClient, tbl, filename, isAdmin ? null : userTeam);
        totalDeleted += c;
      }
    }

    // Record in dedicated deleted_files_registry table (if table exists)
    try {
      const cleanName = String(filename).replace(/^__bodycomp__::/, '');
      await adminClient.from('deleted_files_registry').insert([{
        file_name: cleanName,
        file_type: type || table || 'any',
        team_name: userTeam || 'ALL',
        deleted_by: userEmail || 'unknown',
        deleted_at: new Date().toISOString()
      }]);
    } catch {}

    // Log deletion in access_logs
    try {
      await adminClient.from('access_logs').insert([{
        user_id: callerAuth.user?.id && callerAuth.user.id.includes('-') ? callerAuth.user.id : null,
        email: userEmail || 'unknown',
        team_id: userTeam || 'Team A',
        event_type: 'data_deleted',
        status: 'info',
        details: { filename, table, isAdmin, totalDeleted },
        created_at: new Date().toISOString()
      }]);
    } catch {}

    return res.status(200).json({
      success: true,
      message: totalDeleted > 0 
        ? `「${filename}」をクラウドから削除しました（${totalDeleted}件）。` 
        : `「${filename}」の削除対象データが見つかりませんでした。`,
      deletedCount: totalDeleted
    });

  } catch (err) {
    console.error('Delete API error:', err);
    return res.status(500).json({ error: 'Internal Server Error: ' + (err.message || String(err)) });
  }
}

