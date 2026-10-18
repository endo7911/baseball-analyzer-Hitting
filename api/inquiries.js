import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://ukyppwxsvcgxuxedwfom.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_FALLBACK_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_PCKtT5zEB4r6UMZ5H1q81w_Wpp1b3te';

const ENCRYPTION_SALT = 'baseball-analyzer-secure-payload-salt-v2';
const INQUIRY_FILE_NAME = '__inquiry__';

function getAdminClient() {
  const key = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_FALLBACK_KEY;
  return createClient(SUPABASE_URL, key, {
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

function deduplicateInquiries(rawItems) {
  const map = new Map();
  for (const item of rawItems) {
    if (!item) continue;
    const inquiryId = String(item.inquiry_id || item._db_row_id || item.rowId || '');
    if (!inquiryId) continue;

    const existing = map.get(inquiryId);
    if (!existing) {
      map.set(inquiryId, { ...item, inquiry_id: inquiryId, rowId: inquiryId });
    } else {
      const timeExisting = new Date(existing.updated_at || existing._db_created_at || existing.created_at || 0).getTime();
      const timeCandidate = new Date(item.updated_at || item._db_created_at || item.created_at || 0).getTime();
      if (timeCandidate >= timeExisting) {
        map.set(inquiryId, { ...item, inquiry_id: inquiryId, rowId: inquiryId });
      }
    }
  }

  return Array.from(map.values())
    .filter(item => item.deleted !== true)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
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
        .order('created_at', { ascending: false })
        .limit(2000);

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      const list = await Promise.all((data || []).map(async (row) => {
        const body = await decryptPayload(row.upload_id);
        if (!body) return null;
        const inquiryId = body.inquiry_id || row.id;
        return {
          ...body,
          inquiry_id: inquiryId,
          rowId: inquiryId,
          _db_row_id: row.id,
          _db_created_at: row.created_at,
          created_at: body.created_at || row.created_at
        };
      }));

      let filtered = deduplicateInquiries(list);
      if (user_email) {
        const key = String(user_email).toLowerCase().trim();
        filtered = filtered.filter(i => (i.login_id || '').toLowerCase() === key);
      }

      return res.status(200).json({ success: true, inquiries: filtered });
    }

    // POST /api/inquiries (Submit new inquiry)
    if (req.method === 'POST') {
      const { inquiryId, source, loginId, displayName, contact, category, subject, message } = req.body || {};
      if (!subject || !message) {
        return res.status(400).json({ error: '件名とメッセージを入力してください。' });
      }

      const nowIso = new Date().toISOString();
      const resolvedId = inquiryId || `inq_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      const body = {
        inquiry_id: resolvedId,
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
        created_at: nowIso,
        updated_at: nowIso,
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

    // PATCH /api/inquiries (Reply, update status, mark read, or delete)
    if (req.method === 'PATCH') {
      const { rowId, dbRowId, inquiry: clientInquiry, changes } = req.body || {};
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

      let current = null;
      let targetDbId = dbRowId || rowId;

      if (clientInquiry && typeof clientInquiry === 'object') {
        const { rowId: _r, _db_row_id: _d, _db_created_at: _c, ...rest } = clientInquiry;
        current = rest;
      } else {
        const { data } = await adminClient
          .from('baseball_data')
          .select('id, upload_id, created_at')
          .eq('file_name', INQUIRY_FILE_NAME)
          .order('created_at', { ascending: false })
          .limit(2000);

        const list = await Promise.all((data || []).map(async (row) => {
          const body = await decryptPayload(row.upload_id);
          if (!body) return null;
          const inquiryId = body.inquiry_id || row.id;
          return {
            ...body,
            inquiry_id: inquiryId,
            rowId: inquiryId,
            _db_row_id: row.id,
            _db_created_at: row.created_at,
            created_at: body.created_at || row.created_at
          };
        }));
        const deduped = deduplicateInquiries(list);
        const found = deduped.find(i => i.inquiry_id === rowId || i._db_row_id === rowId);
        if (found) {
          targetDbId = found._db_row_id;
          const { rowId: _r, _db_row_id: _d, _db_created_at: _c, ...rest } = found;
          current = rest;
        }
      }

      if (!current) {
        return res.status(404).json({ error: 'Inquiry not found.' });
      }

      const inquiryId = current.inquiry_id || rowId;
      const updated = {
        ...current,
        ...changes,
        inquiry_id: inquiryId,
        updated_at: new Date().toISOString()
      };

      const enc = await encryptPayload(updated);

      let updatedInPlace = false;
      if (targetDbId) {
        const { data: updatedRows, error: updateErr } = await adminClient
          .from('baseball_data')
          .update({
            upload_id: enc,
            updated_at: updated.updated_at
          })
          .eq('id', targetDbId)
          .eq('file_name', INQUIRY_FILE_NAME)
          .select('id');
        if (!updateErr && Array.isArray(updatedRows) && updatedRows.length > 0) {
          updatedInPlace = true;
        }
      }

      let latestDbRowId = targetDbId;
      if (!updatedInPlace) {
        const { data: insertedRows, error: insertErr } = await adminClient
          .from('baseball_data')
          .insert([{
            file_name: INQUIRY_FILE_NAME,
            player_name: '__inquiry__',
            team_name: '__system__',
            upload_id: enc,
          }])
          .select('id');
        if (insertErr) {
          return res.status(500).json({ error: insertErr.message });
        }
        if (insertedRows?.[0]?.id) {
          latestDbRowId = insertedRows[0].id;
        }
      }

      return res.status(200).json({
        success: true,
        inquiry: { ...updated, inquiry_id: inquiryId, rowId: inquiryId, _db_row_id: latestDbRowId }
      });
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (err) {
    console.error('Inquiries API error:', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}

