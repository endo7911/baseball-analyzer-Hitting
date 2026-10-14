import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://ukyppwxsvcgxuxedwfom.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getAdminClient() {
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured.');
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

// Decrypt AES-GCM payload stored in baseball_data table
const ENCRYPTION_SALT = 'baseball-analyzer-secure-payload-salt-v2';

async function getEncryptionKey() {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.digest('SHA-256', encoder.encode(ENCRYPTION_SALT));
  return crypto.subtle.importKey('raw', keyMaterial, 'AES-GCM', false, ['decrypt']);
}

async function decryptLegacyPayload(payloadStr) {
  if (!payloadStr) return null;
  if (typeof payloadStr === 'string' && payloadStr.startsWith('enc:v2:')) {
    try {
      const parts = payloadStr.split(':');
      if (parts.length < 4) return null;
      const ivHex = parts[2];
      const cipherHex = parts[3];
      const iv = new Uint8Array(ivHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
      const cipher = new Uint8Array(cipherHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
      const key = await getEncryptionKey();
      const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
      return JSON.parse(new TextDecoder().decode(decrypted));
    } catch (e) {
      console.error('Legacy decrypt error:', e);
      return null;
    }
  }
  if (typeof payloadStr === 'string' && (payloadStr.startsWith('[') || payloadStr.startsWith('{'))) {
    try { return JSON.parse(payloadStr); } catch { return null; }
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not configured in Vercel environment variables.' });
  }

  try {
    const adminClient = getAdminClient();

    // 1. Fetch legacy profiles from baseball_data
    const { data: rows, error: fetchErr } = await adminClient
      .from('baseball_data')
      .select('upload_id')
      .eq('file_name', '__app_user_profiles_v1__');

    if (fetchErr) {
      return res.status(500).json({ error: 'Failed to fetch legacy profiles: ' + fetchErr.message });
    }

    if (!rows || rows.length === 0 || !rows[0].upload_id) {
      return res.status(200).json({ message: 'No legacy users found to migrate.', count: 0 });
    }

    const legacyUsers = await decryptLegacyPayload(rows[0].upload_id);
    if (!Array.isArray(legacyUsers) || legacyUsers.length === 0) {
      return res.status(200).json({ message: 'No valid legacy user records decoded.', count: 0 });
    }

    const results = [];

    for (const u of legacyUsers) {
      const rawEmail = u.email || '';
      if (!rawEmail) continue;

      const email = rawEmail.includes('@') ? rawEmail.toLowerCase().trim() : `${rawEmail.toLowerCase().trim()}@baseball-analyzer.internal`;
      const username = rawEmail.includes('@') ? rawEmail.split('@')[0] : rawEmail;
      
      // Default initial password if password is a hash that cannot be reversed
      const tempPass = 'initPass' + Math.floor(1000 + Math.random() * 9000) + '!';

      try {
        // Create user in Supabase Auth
        const { data: authUser, error: authErr } = await adminClient.auth.admin.createUser({
          email,
          password: tempPass,
          email_confirm: true,
          user_metadata: {
            username,
            display_name: u.display_name || username,
            team_id: u.team_id || 'Team A',
            role: u.role || 'user'
          }
        });

        const userId = authUser?.user?.id;
        if (userId) {
          // Upsert to profiles table
          await adminClient.from('profiles').upsert({
            id: userId,
            email,
            username,
            display_name: u.display_name || username,
            team_id: u.team_id || 'Team A',
            team_name: u.team_id || 'Team A',
            role: u.role || 'user',
            is_disabled: !!u.is_disabled,
            allow_hitting: u.allow_hitting !== false,
            allow_pitching: u.allow_pitching !== false,
            allow_body_comp: u.allow_body_comp !== false,
            temp_password_info: {
              is_initial: true,
              pass_plain: tempPass,
              issued_at: new Date().toISOString()
            }
          });

          results.push({ email, status: 'migrated', initialTempPass: tempPass });
        } else if (authErr?.message?.includes('already registered')) {
          results.push({ email, status: 'already_exists' });
        } else {
          results.push({ email, status: 'failed', error: authErr?.message });
        }
      } catch (err) {
        results.push({ email, status: 'error', error: err.message });
      }
    }

    return res.status(200).json({
      message: 'Migration process finished.',
      migratedCount: results.filter(r => r.status === 'migrated').length,
      results
    });

  } catch (err) {
    console.error('Migration error:', err);
    return res.status(500).json({ error: err.message || String(err) });
  }
}
