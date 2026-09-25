import { supabase } from './supabase';

const SYSTEM_USER_FILE_NAME = '__app_user_profiles_v1__';

// SHA-256 hash for password storage (one-way, safe to store in cloud)
export async function hashPassword(password) {
  const msgBuffer = new TextEncoder().encode(String(password));
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return 'sha256:' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Verify a login attempt against stored value (supports both hash and legacy plain text)
export async function verifyPassword(inputPassword, stored) {
  if (!stored || !inputPassword) return false;
  if (stored.startsWith('sha256:')) {
    const hashed = await hashPassword(inputPassword);
    return hashed === stored;
  }
  // Legacy plain-text fallback (only for migrating old accounts)
  return stored === String(inputPassword).trim();
}

export const DEFAULT_MOCK_USERS = [
  {
    id: 'admin-id',
    email: 'admin@example.com',
    password: 'baseball2024',
    display_name: '管理者アカウント',
    role: 'admin',
    team_id: '管理者',
    is_disabled: false
  },
  {
    id: 'user-default-id',
    email: 'user@example.com',
    password: 'user123',
    display_name: '一般利用者',
    role: 'user',
    team_id: 'Test',
    is_disabled: false
  }
];

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

// Fetch all registered users from Supabase Cloud (falling back to localStorage)
export async function getGlobalUsers() {
  let cloudUsers = null;

  try {
    const { data, error } = await supabase
      .from('baseball_data')
      .select('upload_id')
      .eq('file_name', SYSTEM_USER_FILE_NAME);

    if (!error && data && data.length > 0) {
      const raw = data[0].upload_id;
      if (raw) {
        cloudUsers = JSON.parse(raw);
      }
    }
  } catch (e) {
    console.warn("Failed to fetch global users from Supabase:", e);
  }

  const localUsers = JSON.parse(localStorage.getItem('mockUsersList') || '[]');

  // Merge: defaults → local → cloud
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

  // Cloud is authoritative for all fields including hashed password
  if (Array.isArray(cloudUsers)) {
    cloudUsers.forEach(u => {
      if (u && u.email) {
        const key = u.email.toLowerCase();
        const existing = userMap.get(key) || {};
        userMap.set(key, { ...existing, ...u });
      }
    });
  }

  const merged = Array.from(userMap.values());

  // Auto-sync any local users missing from cloud
  const cloudEmailSet = new Set((cloudUsers || []).map(u => (u?.email || '').toLowerCase()));
  const hasUnsyncedLocalUser = merged.some(u => !cloudEmailSet.has((u?.email || '').toLowerCase()));

  if (hasUnsyncedLocalUser && Array.isArray(cloudUsers)) {
    console.log("Auto-migrating pre-existing local accounts to Supabase Cloud...");
    saveGlobalUsers(merged).catch(err => console.warn("Auto-migration error:", err));
  }

  // Update local cache
  try {
    localStorage.setItem('mockUsersList', JSON.stringify(merged));
  } catch {}

  return merged;
}

// Save all registered users to Supabase Cloud (hashed passwords) and localStorage (hashed passwords)
export async function saveGlobalUsers(usersList) {
  if (!Array.isArray(usersList)) return false;

  // Hash passwords before saving anywhere
  const hashedList = await hashUsersForCloud(usersList);

  // 1. Update localStorage cache (hashed)
  try {
    localStorage.setItem('mockUsersList', JSON.stringify(hashedList));
  } catch {}

  // 2. Persist to Supabase Cloud (hashed passwords - safe to store)
  try {
    const jsonStr = JSON.stringify(hashedList);

    const { data } = await supabase
      .from('baseball_data')
      .select('id')
      .eq('file_name', SYSTEM_USER_FILE_NAME);

    if (data && data.length > 0) {
      const rowId = data[0].id;
      await supabase
        .from('baseball_data')
        .update({
          upload_id: jsonStr,
          updated_at: new Date().toISOString()
        })
        .eq('id', rowId);
    } else {
      await supabase
        .from('baseball_data')
        .insert([
          {
            file_name: SYSTEM_USER_FILE_NAME,
            player_name: '__system_users__',
            team_name: '__system__',
            upload_id: jsonStr
          }
        ]);
    }
    return true;
  } catch (e) {
    console.error("Failed to save global users to Supabase:", e);
    return false;
  }
}
