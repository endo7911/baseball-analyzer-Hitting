import { supabase } from './supabase';

const SYSTEM_USER_FILE_NAME = '__app_user_profiles_v1__';

// Simple hash for password storage (not cryptographic, but prevents plain text)
// Format: hash:<sha-like digest>
async function hashPassword(password) {
  const msgBuffer = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return 'hash:' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyPassword(password, stored) {
  if (!stored) return false;
  if (stored.startsWith('hash:')) {
    const hashed = await hashPassword(password);
    return hashed === stored;
  }
  // Legacy plain-text fallback (for migration only)
  return stored === password;
}

export const DEFAULT_MOCK_USERS = [
  {
    id: 'admin-id',
    email: 'admin@example.com',
    password: 'baseball2024', // will be hashed on first save
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

// Strip passwords before saving to cloud
function stripPasswords(users) {
  return users.map(u => {
    const { password, ...safe } = u;
    return safe;
  });
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
  
  // Merge cloud users, local users, and default preset users
  const userMap = new Map();

  // Add default users first (keep passwords locally for auth)
  DEFAULT_MOCK_USERS.forEach(u => userMap.set(u.email.toLowerCase(), u));

  // Add local users (may have passwords for login)
  if (Array.isArray(localUsers)) {
    localUsers.forEach(u => {
      if (u && u.email) {
        const key = u.email.toLowerCase();
        userMap.set(key, { ...userMap.get(key), ...u });
      }
    });
  }

  // Override with cloud users (cloud is authoritative, but cloud has NO passwords)
  if (Array.isArray(cloudUsers)) {
    cloudUsers.forEach(u => {
      if (u && u.email) {
        const key = u.email.toLowerCase();
        const existing = userMap.get(key) || {};
        // Keep local password, override other fields from cloud
        userMap.set(key, { ...existing, ...u, password: existing.password });
      }
    });
  }

  const merged = Array.from(userMap.values());

  // If there are local users missing from cloud, auto-sync them (without passwords)
  const cloudEmailSet = new Set((cloudUsers || []).map(u => (u?.email || '').toLowerCase()));
  const hasUnsyncedLocalUser = merged.some(u => !cloudEmailSet.has((u?.email || '').toLowerCase()));

  if (hasUnsyncedLocalUser && Array.isArray(cloudUsers)) {
    console.log("Auto-migrating pre-existing local accounts to Supabase Cloud...");
    saveGlobalUsers(merged).catch(err => console.warn("Auto-migration error:", err));
  }

  // Update local cache (with passwords, local only)
  try {
    localStorage.setItem('mockUsersList', JSON.stringify(merged));
  } catch {}

  return merged;
}

// Verify a login attempt
export async function verifyUserPassword(user, inputPassword) {
  if (!user || !inputPassword) return false;
  return verifyPassword(inputPassword, user.password);
}

// Save all registered users to Supabase Cloud (passwords stripped) and localStorage (with passwords)
export async function saveGlobalUsers(usersList) {
  if (!Array.isArray(usersList)) return false;

  // 1. Update localStorage cache (keep passwords locally)
  try {
    localStorage.setItem('mockUsersList', JSON.stringify(usersList));
  } catch {}

  // 2. Persist to Supabase Cloud — NO PASSWORDS
  try {
    const safeList = stripPasswords(usersList);
    const jsonStr = JSON.stringify(safeList);
    
    // Check if row already exists
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
