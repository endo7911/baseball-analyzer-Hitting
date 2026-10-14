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

async function hashPassword(password) {
  const subtle = await getSubtleCrypto();
  const msgBuffer = new TextEncoder().encode(String(password));
  const hashBuffer = await subtle.digest('SHA-256', msgBuffer);
  return 'sha256:' + Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
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

async function saveLegacyUsers(adminClient, usersList) {
  try {
    const enc = await encryptPayload(usersList);
    const { data } = await adminClient
      .from('baseball_data')
      .select('id')
      .eq('file_name', SYSTEM_USER_FILE_NAME);
    if (data && data.length > 0) {
      await adminClient.from('baseball_data').update({
        upload_id: enc,
        updated_at: new Date().toISOString()
      }).eq('id', data[0].id);
    }
    return true;
  } catch {
    return false;
  }
}

function normalizeIdentifier(rawId) {
  const trimmed = String(rawId || '').trim();
  if (trimmed.includes('@')) {
    return { email: trimmed.toLowerCase(), username: trimmed.split('@')[0] };
  }
  return { email: `${trimmed.toLowerCase()}@baseball-analyzer.internal`, username: trimmed };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, X-User-Email');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY missing on server.' });
  }

  try {
    const adminClient = getAdminClient();
    const { email: rawEmail, newPassword } = req.body || {};

    if (!newPassword || newPassword.trim().length < 8) {
      return res.status(400).json({ error: 'パスワードは8文字以上にしてください。' });
    }

    // 1. Verify caller identity
    let callerEmail = '';
    let callerUserId = null;

    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const { data: { user }, error: userError } = await adminClient.auth.getUser(token);
      if (!userError && user) {
        callerEmail = user.email?.toLowerCase();
        callerUserId = user.id;
      }
    }

    if (!callerEmail) {
      const headerEmail = req.headers['x-user-email'] || rawEmail;
      if (headerEmail) {
        callerEmail = String(headerEmail).toLowerCase().trim();
      }
    }

    if (!callerEmail) {
      return res.status(401).json({ error: 'ログイン情報が見つかりません。' });
    }

    const { email: cleanEmail } = normalizeIdentifier(callerEmail);
    const cleanPassword = newPassword.trim();
    const hashed = await hashPassword(cleanPassword);

    // 2. Update Supabase Auth if account exists
    const { data: authList } = await adminClient.auth.admin.listUsers();
    const existingAuth = authList?.users?.find(u => 
      (u.email && u.email.toLowerCase() === cleanEmail.toLowerCase()) || 
      (callerUserId && u.id === callerUserId)
    );

    if (existingAuth) {
      const { error: authErr } = await adminClient.auth.admin.updateUserById(existingAuth.id, {
        password: cleanPassword
      });
      if (authErr) {
        console.warn('Supabase Auth updateUserById error:', authErr.message);
      }
      callerUserId = existingAuth.id;

      // Clear temp_password_info in profiles
      await adminClient
        .from('profiles')
        .update({
          temp_password_info: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingAuth.id);
    }

    // 3. Update legacy user storage in baseball_data (with service_role, bypasses RLS)
    try {
      const legacyUsers = await getLegacyUsers(adminClient);
      const updatedLegacy = legacyUsers.map(u => {
        const uEmail = (u.email || '').toLowerCase();
        if (uEmail === cleanEmail || uEmail === callerEmail || (callerUserId && u.id === callerUserId)) {
          return {
            ...u,
            password: hashed,
            temp_password: null,
            password_changed_at: new Date().toISOString()
          };
        }
        return u;
      });
      await saveLegacyUsers(adminClient, updatedLegacy);
    } catch (legErr) {
      console.warn('Legacy password update error:', legErr);
    }

    // 4. Log to access_logs
    try {
      await adminClient.from('access_logs').insert([{
        user_id: callerUserId && callerUserId.includes('-') ? callerUserId : null,
        email: cleanEmail,
        event_type: 'password_changed',
        status: 'info',
        details: { action: 'user_changed_password' },
        created_at: new Date().toISOString()
      }]);
    } catch {}

    return res.status(200).json({
      success: true,
      message: 'パスワードを正常に変更しました。次回から新しいパスワードでログインしてください。'
    });

  } catch (err) {
    console.error('Change password API error:', err);
    return res.status(500).json({ error: 'Internal Server Error: ' + (err.message || String(err)) });
  }
}
