import { supabase } from './supabase';

const SYSTEM_USER_FILE_NAME = '__app_user_profiles_v1__';

// SHA-256 hash for password storage (one-way, safe to store in cloud)
export async function hashPassword(password) {
  const msgBuffer = new TextEncoder().encode(String(password));
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return 'sha256:' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Verify a login attempt against stored value (supports main password and 30-minute temporary passwords)
export async function verifyPassword(inputPassword, stored, tempPasswordObj) {
  if (!inputPassword) return false;

  // 1. Verify against main stored password
  if (stored) {
    if (stored.startsWith('sha256:')) {
      const hashed = await hashPassword(inputPassword);
      if (hashed === stored) return 'main';
    } else if (stored === String(inputPassword).trim()) {
      return 'main';
    }
  }

  // 2. Verify against temporary password if valid (within 30 mins)
  if (tempPasswordObj && tempPasswordObj.expires_at) {
    const expiresMs = new Date(tempPasswordObj.expires_at).getTime();
    if (!isNaN(expiresMs) && expiresMs > Date.now()) {
      const inputTrimmed = String(inputPassword).trim();
      if (tempPasswordObj.pass_plain && inputTrimmed === String(tempPasswordObj.pass_plain).trim()) {
        return 'temp';
      }
      if (tempPasswordObj.hashed) {
        const hashed = await hashPassword(inputPassword);
        if (hashed === tempPasswordObj.hashed) return 'temp';
      }
    }
  }

  return false;
}

export const DEFAULT_MOCK_USERS = [];

// Change a user's own password and invalidate any temporary password
export async function changeUserPassword(email, newPassword) {
  const users = await getGlobalUsers();
  const key = String(email || '').toLowerCase();
  let found = false;
  const updated = users.map(u => {
    if ((u.email || '').toLowerCase() === key) {
      found = true;
      return { ...u, password: String(newPassword).trim(), temp_password: null, password_changed_at: new Date().toISOString() };
    }
    return u;
  });
  if (!found) return false;
  return saveGlobalUsers(updated);
}


// Encryption key derivation and AES-GCM authenticated payload protection
const ENCRYPTION_SALT = 'baseball-analyzer-secure-payload-salt-v2';

async function getEncryptionKey() {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.digest('SHA-256', encoder.encode(ENCRYPTION_SALT));
  return crypto.subtle.importKey('raw', keyMaterial, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

// Encrypt payload with AES-GCM (prevents unauthorized reading & tampering)
export async function encryptPayload(dataObj) {
  try {
    const encoder = new TextEncoder();
    const key = await getEncryptionKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = JSON.stringify(dataObj);
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(plaintext));
    const ivHex = Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join('');
    const cipherHex = Array.from(new Uint8Array(encrypted)).map(b => b.toString(16).padStart(2, '0')).join('');
    return `enc:v2:${ivHex}:${cipherHex}`;
  } catch (e) {
    console.error('Payload encryption failed:', e);
    throw e;
  }
}

// Decrypt and verify authenticated payload (returns null if tampered)
export async function decryptPayload(payloadStr) {
  if (!payloadStr) return null;

  // Handle encrypted AES-GCM payload
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
      const decoder = new TextDecoder();
      return JSON.parse(decoder.decode(decrypted));
    } catch (e) {
      console.error('Payload decryption or integrity check failed (data may be tampered):', e);
      return null;
    }
  }

  // Fallback for legacy plain JSON format
  if (typeof payloadStr === 'string' && (payloadStr.startsWith('[') || payloadStr.startsWith('{'))) {
    try {
      return JSON.parse(payloadStr);
    } catch {
      return null;
    }
  }

  return null;
}

// Hash passwords in the user list before cloud storage
async function hashUsersForCloud(users) {
  return Promise.all(users.map(async (u) => {
    if (!u.password) return u;
    // Already hashed → keep as-is
    if (String(u.password).startsWith('sha256:')) return u;
    // Hash the plain-text password
    const hashed = await hashPassword(u.password);
    return { ...u, password: hashed };
  }));
}

// Fetch all registered users from Supabase Cloud
export async function getGlobalUsers() {
  let cloudUsers = null;
  let wasUnencrypted = false;

  try {
    const { data, error } = await supabase
      .from('baseball_data')
      .select('id, upload_id, created_at')
      .eq('file_name', SYSTEM_USER_FILE_NAME)
      .order('created_at', { ascending: false })
      .limit(1);

    if (!error && data && data.length > 0) {
      const raw = data[0].upload_id;
      if (raw) {
        if (typeof raw === 'string' && !raw.startsWith('enc:v2:')) {
          wasUnencrypted = true;
        }
        cloudUsers = await decryptPayload(raw);
      }
    }
  } catch (e) {
    console.warn("Failed to fetch global users from Supabase:", e);
  }

  let localUsers = [];
  try {
    const rawLocal = localStorage.getItem('mockUsersList');
    if (rawLocal) {
      localUsers = (await decryptPayload(rawLocal)) || JSON.parse(rawLocal);
    }
  } catch {}

  // Merge: defaults → local → cloud (respecting newer updated_at timestamps)
  const userMap = new Map();

  DEFAULT_MOCK_USERS.forEach(u => userMap.set(u.email.toLowerCase(), { ...u }));

  if (Array.isArray(localUsers)) {
    localUsers.forEach(u => {
      if (u && u.email) {
        const key = u.email.toLowerCase();
        userMap.set(key, { ...userMap.get(key), ...u });
      }
    });
  }

  if (Array.isArray(cloudUsers)) {
    cloudUsers.forEach(u => {
      if (u && u.email) {
        const key = u.email.toLowerCase();
        const existing = userMap.get(key);
        if (!existing) {
          userMap.set(key, { ...u });
        } else {
          const localTime = new Date(existing.updated_at || existing.permissions_updated_at || 0).getTime();
          const cloudTime = new Date(u.updated_at || u.permissions_updated_at || 0).getTime();
          if (localTime > cloudTime) {
            userMap.set(key, { ...u, ...existing });
          } else {
            userMap.set(key, { ...existing, ...u });
          }
        }
      }
    });
  }

  const merged = Array.from(userMap.values());

  // Only upgrade if the raw data in cloud was in legacy unencrypted format
  if (wasUnencrypted && Array.isArray(cloudUsers)) {
    saveGlobalUsers(merged).catch(() => {});
  }

  return merged;
}

// Save all registered users to Supabase Cloud (encrypted) and localStorage (encrypted)
export async function saveGlobalUsers(usersList) {
  if (!Array.isArray(usersList)) return false;

  // Hash passwords before saving anywhere
  const hashedList = await hashUsersForCloud(usersList);

  // Encrypt payload with AES-GCM (tamper-proof & readable only by authorized app)
  let encryptedPayload;
  try {
    encryptedPayload = await encryptPayload(hashedList);
  } catch (e) {
    console.error("Encryption failed before save:", e);
    return false;
  }

  // 1. Update localStorage cache (encrypted)
  try {
    localStorage.setItem('mockUsersList', encryptedPayload);
  } catch {}

  // 2. Persist to Supabase Cloud (AES-GCM encrypted payload)
  try {
    const { data, error } = await supabase
      .from('baseball_data')
      .select('id, file_name')
      .eq('file_name', SYSTEM_USER_FILE_NAME)
      .order('created_at', { ascending: false })
      .limit(1);

    let updatedInPlace = false;
    if (!error && data && data.length > 0 && data[0].id) {
      const { data: updatedRows, error: updateErr } = await supabase
        .from('baseball_data')
        .update({
          upload_id: encryptedPayload
        })
        .eq('id', data[0].id)
        .eq('file_name', SYSTEM_USER_FILE_NAME)
        .select('id');

      if (!updateErr && Array.isArray(updatedRows) && updatedRows.length > 0) {
        updatedInPlace = true;
      }
    }

    // If RLS blocked UPDATE (0 rows updated) or no row existed yet, insert new authoritative snapshot row
    if (!updatedInPlace) {
      const { error: insertErr } = await supabase
        .from('baseball_data')
        .insert([
          {
            file_name: SYSTEM_USER_FILE_NAME,
            player_name: '__system_users__',
            team_name: '__system__',
            upload_id: encryptedPayload
          }
        ]);
      if (insertErr) throw insertErr;
    }
    return true;
  } catch (e) {
    console.error("Failed to save global users to Supabase:", e);
    return false;
  }
}


