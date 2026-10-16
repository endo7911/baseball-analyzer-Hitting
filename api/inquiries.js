import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://ukyppwxsvcgxuxedwfom.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const ENCRYPTION_SALT = 'baseball-analyzer-secure-payload-salt-v2';
const INQUIRY_FILE_NAME = '__inquiry__';

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
      .eq('file_name', '__app_user_profiles_v1__');
    if (data && data.length > 0 && data[0].upload_id) {
      const parsed = await decryptPayload(data[0].upload_id);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

async function verifyAdminCaller(req, adminClient) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    const { data: { user }, error } = await adminClient.auth.getUser(token);
    if (!error && user) {
      const { data: profile } = await adminClient
        .from('profiles')
        .select('role, is_disabled')
        .eq('id', user.id)
        .single();
      if (profile && profile.role === 'admin' && !profile.is_disabled) {
        return { ok: true, adminUser: user };
      }
      if (user.user_metadata?.role === 'admin') {
        return { ok: true, adminUser: user };
      }
    }
  }

  const legacyEmail = req.headers['x-legacy-admin-email'] || req.headers['x-admin-email'] || req.headers['x-user-email'];
  if (legacyEmail) {
    const cleanEmail = String(legacyEmail).toLowerCase().trim();
    try {
      const { data: profile } = await adminClient
        .from('profiles')
        .select('role, is_disabled')
        .eq('email', cleanEmail)
        .maybeSingle();
      if (profile && profile.role === 'admin' && !profile.is_disabled) {
        return { ok: true, adminUser: { email: cleanEmail } };
      }
    } catch {}

    const legacyUsers = await getLegacyUsers(adminClient);
    const matched = legacyUsers.find(u => (u.email || '').toLowerCase() === cleanEmail);
    if (matched && matched.role === 'admin' && !matched.is_disabled) {
      return { ok: true, adminUser: { email: cleanEmail } };
    }
  }

  return { ok: false, status: 403, error: 'Administrator authentication required.' };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, X-User-Email, X-Legacy-Admin-Email, X-Legacy-Admin-Role, X-Legacy-Admin-Id');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY missing on server.' });
  }

  try {
    const adminClient = getAdminClient();

    // GET /api/inquiries
    if (req.method === 'GET') {
      const { user_email } = req.query || {};
      // If fetching ALL inquiries (without a specific user_email filter), require admin verification
      if (!user_email) {
        const authCheck = await verifyAdminCaller(req, adminClient);
        if (!authCheck.ok) {
          return res.status(authCheck.status).json({ error: authCheck.error });
        }
      }

      const { data, error } = await adminClient
        .from('baseball_data')
        .select('id, upload_id, created_at')
        .eq('file_name', INQUIRY_FILE_NAME)
        .order('id', { ascending: false })
        .limit(2000);

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      const list = await Promise.all((data || []).map(async (row) => {
        const body = await decryptPayload(row.upload_id);
        if (!body) return null;
        return { ...body, rowId: row.id, created_at: body.created_at || row.created_at };
      }));

      let filtered = list.filter(Boolean);
      if (user_email) {
        const key = String(user_email).toLowerCase().trim();
        filtered = filtered.filter(i => (i.login_id || '').toLowerCase() === key);
      }

      filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      return res.status(200).json({ success: true, inquiries: filtered });
    }

    // POST /api/inquiries (Submit new inquiry)
    if (req.method === 'POST') {
      const { source, loginId, displayName, contact, category, subject, message } = req.body || {};
      if (!subject || !message) {
        return res.status(400).json({ error: '件名とメッセージを入力してください。' });
      }

      const body = {
        source: source || 'app',
        login_id: String(loginId || '').trim().toLowerCase(),
        display_name: String(displayName || '').trim(),
        contact: String(contact || '').trim(),
        category: category || 'other',
        subject: String(subject || '').trim(),
        message: String(message || '').trim(),
        status: 'open',
        reply: null,
        replied_at: null,
        read_by_user: true,
        created_at: new Date().toISOString(),
      };

      const enc = await encryptPayload(body);
      const { error } = await adminClient.from('baseball_data').insert([{
        file_name: INQUIRY_FILE_NAME,
        player_name: '__inquiry__',
        team_name: '__system__',
        upload_id: enc,
      }]);

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      return res.status(200).json({ success: true });
    }

    // PATCH /api/inquiries (Reply or update status)
    if (req.method === 'PATCH') {
      const { rowId, changes } = req.body || {};
      if (!rowId || !changes) {
        return res.status(400).json({ error: 'rowId and changes are required.' });
      }

      // If updating reply or status (admin action), verify admin caller; allow read_by_user mark-as-read by user
      const isMarkReadOnly = Object.keys(changes).every(k => k === 'read_by_user');
      if (!isMarkReadOnly) {
        const authCheck = await verifyAdminCaller(req, adminClient);
        if (!authCheck.ok) {
          return res.status(authCheck.status).json({ error: authCheck.error });
        }
      }

      const { data, error: fetchErr } = await adminClient
        .from('baseball_data')
        .select('upload_id')
        .eq('id', rowId)
        .eq('file_name', INQUIRY_FILE_NAME);

      if (fetchErr || !data || data.length === 0) {
        return res.status(404).json({ error: 'Inquiry not found.' });
      }

      const current = await decryptPayload(data[0].upload_id);
      if (!current) {
        return res.status(500).json({ error: 'Failed to decrypt inquiry data.' });
      }

      const updated = {
        ...current,
        ...changes,
        updated_at: new Date().toISOString()
      };

      const enc = await encryptPayload(updated);
      const { error: updateErr } = await adminClient
        .from('baseball_data')
        .update({
          upload_id: enc,
          updated_at: updated.updated_at
        })
        .eq('id', rowId)
        .eq('file_name', INQUIRY_FILE_NAME);

      if (updateErr) {
        return res.status(500).json({ error: updateErr.message });
      }

      return res.status(200).json({ success: true, inquiry: { ...updated, rowId } });
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (err) {
    console.error('Inquiries API error:', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}
