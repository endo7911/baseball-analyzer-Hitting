import { supabase } from './supabase';

const SYSTEM_USER_FILE_NAME = '__app_user_profiles_v1__';

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
    team_id: 'Team A',
    is_disabled: false
  }
];

// Fetch all registered users from Supabase Cloud (falling back to localStorage)
export async function getGlobalUsers() {
  let cloudUsers = null;

  try {
    const { data, error } = await supabase
      .from('baseball_data')
      .select('*')
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

  // Add default users first
  DEFAULT_MOCK_USERS.forEach(u => userMap.set(u.email.toLowerCase(), u));

  // Add local users
  if (Array.isArray(localUsers)) {
    localUsers.forEach(u => {
      if (u && u.email) {
        const key = u.email.toLowerCase();
        userMap.set(key, { ...userMap.get(key), ...u });
      }
    });
  }

  // Override / Add cloud users (cloud is authoritative across devices)
  if (Array.isArray(cloudUsers)) {
    cloudUsers.forEach(u => {
      if (u && u.email) {
        const key = u.email.toLowerCase();
        userMap.set(key, { ...userMap.get(key), ...u });
      }
    });
  }

  const merged = Array.from(userMap.values());

  // Update local cache
  try {
    localStorage.setItem('mockUsersList', JSON.stringify(merged));
  } catch {}

  return merged;
}

// Save all registered users to Supabase Cloud and localStorage
export async function saveGlobalUsers(usersList) {
  if (!Array.isArray(usersList)) return false;

  // 1. Update localStorage cache
  try {
    localStorage.setItem('mockUsersList', JSON.stringify(usersList));
  } catch {}

  // 2. Persist to Supabase Cloud
  try {
    const jsonStr = JSON.stringify(usersList);
    
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
