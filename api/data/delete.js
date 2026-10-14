import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://ukyppwxsvcgxuxedwfom.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const ENCRYPTION_SALT = 'baseball-analyzer-secure-payload-salt-v2';
const SYSTEM_USER_FILE_NAME = '__app_user_profiles_v1__';

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

      return {
        ok: true,
        user,
        profile: profile || {
          id: user.id,
          email: user.email,
          role: user.user_metadata?.role || 'user',
          team_id: user.user_metadata?.team_id || 'Team A',
          team_name: user.user_metadata?.team_id || 'Team A'
        },
        isAdmin: profile?.role === 'admin' || user.user_metadata?.role === 'admin'
      };
    }
  }

  // 2. Legacy Session caller verification
  const emailHeader = req.headers['x-user-email'] || req.headers['x-legacy-admin-email'];
  if (emailHeader) {
    const cleanEmail = String(emailHeader).trim().toLowerCase();
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
  }

  return { ok: false, status: 401, error: 'Authentication required to delete cloud data.' };
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
    if (filename.startsWith('__')) {
      return res.status(400).json({ error: 'System metadata cannot be deleted.' });
    }

    const isAdmin = callerAuth.isAdmin;
    const userTeam = callerAuth.profile?.team_name || callerAuth.profile?.team_id;
    const userEmail = (callerAuth.user?.email || callerAuth.profile?.email || '').toLowerCase();

    const tablesToClean = [];
    if (table === 'both') {
      tablesToClean.push('savant_data', 'blast_data');
    } else if (table === 'baseball_data' || type === 'combined') {
      tablesToClean.push('baseball_data');
    } else if (table === 'pitching_data' || type === 'savant_pitching') {
      tablesToClean.push('pitching_data');
    } else if (table === 'body_comp_data' || type === 'body_comp') {
      tablesToClean.push('body_comp_data', 'baseball_data');
    } else if (table === 'savant_data' || type === 'savant') {
      tablesToClean.push('savant_data');
    } else if (table === 'blast_data' || type === 'blast') {
      tablesToClean.push('blast_data');
    } else {
      tablesToClean.push('baseball_data', 'savant_data', 'blast_data', 'pitching_data', 'body_comp_data');
    }

    let totalDeleted = 0;

    for (const tbl of tablesToClean) {
      try {
        let q = adminClient.from(tbl).delete();

        // Exact filename match or bodycomp prefix match
        if (tbl === 'baseball_data' && (table === 'body_comp_data' || type === 'body_comp')) {
          q = q.or(`file_name.eq.${filename},file_name.eq.__bodycomp__::${filename}`);
        } else {
          q = q.eq('file_name', filename);
        }

        // Team isolation: if not admin, restrict deletion to caller's team or user
        if (!isAdmin) {
          const conditions = [];
          if (userTeam) {
            conditions.push(`team_name.eq.${userTeam}`);
            conditions.push(`team_id.eq.${userTeam}`);
          }
          if (userEmail && userEmail.includes('@')) {
            conditions.push(`upload_id.ilike.${userEmail}::%`);
          }
          if (callerAuth.user?.id) {
            conditions.push(`user_id.eq.${callerAuth.user.id}`);
          }
          if (conditions.length > 0) {
            q = q.or(conditions.join(','));
          }
        }

        const { error, count } = await q;
        if (error) {
          console.warn(`Delete error on ${tbl}:`, error.message);
        } else {
          totalDeleted += (count || 1);
        }
      } catch (tblErr) {
        console.warn(`Exception deleting from ${tbl}:`, tblErr);
      }
    }

    // Log deletion in access_logs
    try {
      await adminClient.from('access_logs').insert([{
        user_id: callerAuth.user?.id && callerAuth.user.id.includes('-') ? callerAuth.user.id : null,
        email: userEmail || 'unknown',
        team_id: userTeam || 'Team A',
        event_type: 'data_deleted',
        status: 'info',
        details: { filename, table, isAdmin },
        created_at: new Date().toISOString()
      }]);
    } catch {}

    return res.status(200).json({
      message: `「${filename}」をクラウドから削除しました。`,
      deletedCount: totalDeleted
    });

  } catch (err) {
    console.error('Delete API error:', err);
    return res.status(500).json({ error: 'Internal Server Error: ' + (err.message || String(err)) });
  }
}
