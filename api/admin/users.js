import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://ukyppwxsvcgxuxedwfom.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const ENCRYPTION_SALT = 'baseball-analyzer-secure-payload-salt-v2';
const SYSTEM_USER_FILE_NAME = '__app_user_profiles_v1__';

// Create admin client with service_role key for secure privileged operations
function getAdminClient() {
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured in environment variables.');
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

// Subtle crypto helper
function getSubtleCrypto() {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
    return globalThis.crypto.subtle;
  }
  return import('crypto').then(c => c.webcrypto.subtle);
}

function getRandomValues(arr) {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
    return globalThis.crypto.getRandomValues(arr);
  }
  return import('crypto').then(c => c.webcrypto.getRandomValues(arr));
}

async function getEncryptionKey() {
  const encoder = new TextEncoder();
  const subtle = await getSubtleCrypto();
  const keyMaterial = await subtle.digest('SHA-256', encoder.encode(ENCRYPTION_SALT));
  return subtle.importKey('raw', keyMaterial, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function encryptPayload(dataObj) {
  try {
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
  } catch (e) {
    console.error('Payload encryption failed:', e);
    throw e;
  }
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
    } catch (e) {
      console.warn('Decryption failed:', e);
      return null;
    }
  }
  if (typeof payloadStr === 'string' && (payloadStr.startsWith('[') || payloadStr.startsWith('{'))) {
    try {
      return JSON.parse(payloadStr);
    } catch {
      return null;
    }
  }
  return null;
}

async function hashPassword(password) {
  const subtle = await getSubtleCrypto();
  const msgBuffer = new TextEncoder().encode(String(password));
  const hashBuffer = await subtle.digest('SHA-256', msgBuffer);
  return 'sha256:' + Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Fetch legacy users from baseball_data using service_role client (bypasses RLS)
async function getLegacyUsers(adminClient) {
  try {
    const { data, error } = await adminClient
      .from('baseball_data')
      .select('upload_id')
      .eq('file_name', SYSTEM_USER_FILE_NAME);

    if (!error && data && data.length > 0 && data[0].upload_id) {
      const parsed = await decryptPayload(data[0].upload_id);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn('getLegacyUsers error:', e);
  }
  return [];
}

// Save legacy users to baseball_data using service_role client (bypasses RLS)
async function saveLegacyUsers(adminClient, usersList) {
  try {
    const encrypted = await encryptPayload(usersList);
    const { data, error } = await adminClient
      .from('baseball_data')
      .select('file_name')
      .eq('file_name', SYSTEM_USER_FILE_NAME)
      .limit(1);

    if (!error && data && data.length > 0) {
      await adminClient
        .from('baseball_data')
        .update({
          upload_id: encrypted,
          updated_at: new Date().toISOString()
        })
        .eq('file_name', SYSTEM_USER_FILE_NAME);
    } else {
      await adminClient
        .from('baseball_data')
        .insert([{
          file_name: SYSTEM_USER_FILE_NAME,
          player_name: '__system_users__',
          team_name: '__system__',
          upload_id: encrypted
        }]);
    }
    return true;
  } catch (e) {
    console.error('saveLegacyUsers error:', e);
    return false;
  }
}


// Helper to normalize username/email
function normalizeIdentifier(rawId) {
  const trimmed = String(rawId || '').trim();
  if (trimmed.includes('@')) {
    return { email: trimmed.toLowerCase(), username: trimmed.split('@')[0] };
  }
  return { email: `${trimmed.toLowerCase()}@baseball-analyzer.internal`, username: trimmed };
}

// Verify that the caller is an authenticated administrator (supports both Supabase Auth & Legacy Admin sessions)
async function verifyAdminCaller(req, adminClient) {
  const authHeader = req.headers.authorization || req.headers.Authorization;

  // 1. Supabase Auth Session Token
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    const { data: { user }, error: userError } = await adminClient.auth.getUser(token);
    if (!userError && user) {
      const { data: profile } = await adminClient
        .from('profiles')
        .select('role, is_disabled')
        .eq('id', user.id)
        .single();

      if (profile && profile.role === 'admin' && !profile.is_disabled) {
        return { ok: true, adminUser: user, profile };
      }
    }
  }

  // 2. Legacy Admin Session verification via X-Legacy-Admin-Email header
  const legacyEmail = req.headers['x-legacy-admin-email'] || req.headers['x-admin-email'];
  if (legacyEmail) {
    const legacyUsers = await getLegacyUsers(adminClient);
    const matched = legacyUsers.find(u => (u.email || '').toLowerCase() === String(legacyEmail).toLowerCase().trim());
    if (matched && matched.role === 'admin' && !matched.is_disabled) {
      return {
        ok: true,
        adminUser: { id: matched.id || matched.email, email: matched.email },
        profile: matched,
        isLegacy: true
      };
    }
  }

  return { ok: false, status: 401, error: 'Administrator authentication required.' };
}

export default async function handler(req, res) {
  // CORS configuration
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, X-Legacy-Admin-Email, X-Legacy-Admin-Role, X-Legacy-Admin-Id');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({
      error: 'Vercel Server Environment Error: SUPABASE_SERVICE_ROLE_KEY is missing. Please set it in Vercel Project Settings > Environment Variables.'
    });
  }

  try {
    const adminClient = getAdminClient();

    // 1. Authenticate caller as Admin
    const authCheck = await verifyAdminCaller(req, adminClient);
    if (!authCheck.ok) {
      return res.status(authCheck.status).json({ error: authCheck.error });
    }

    // -------------------------------------------------------------------------
    // GET: List all users OR Security Access Logs
    // -------------------------------------------------------------------------
    if (req.method === 'GET') {
      const type = req.query?.type || 'users';

      // 1. Security Audit Logs
      if (type === 'logs') {
        const emailFilter = req.query?.email;
        let query = adminClient
          .from('access_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(300);

        if (emailFilter && emailFilter !== 'all') {
          query = query.eq('email', emailFilter.toLowerCase().trim());
        }

        const { data: logs, error: lError } = await query;
        if (lError) {
          return res.status(200).json({ logs: [] });
        }
        return res.status(200).json({ logs: logs || [] });
      }

      // 2. Return User Profiles & Migration Status (Merged from Profiles & Legacy Store)
      const { data: profiles } = await adminClient
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      const legacyUsers = await getLegacyUsers(adminClient);
      const { data: authUsersData } = await adminClient.auth.admin.listUsers();
      const authUserMap = new Map();
      if (authUsersData?.users) {
        authUsersData.users.forEach(u => {
          if (u.email) authUserMap.set(u.email.toLowerCase(), u);
          if (u.id) authUserMap.set(u.id, u);
        });
      }

      const userMap = new Map();

      // First, add legacy users
      legacyUsers.forEach(u => {
        if (!u || !u.email) return;
        const key = u.email.toLowerCase();
        const hasAuth = authUserMap.has(key) || (u.id && authUserMap.has(u.id));
        userMap.set(key, {
          id: u.id || key,
          email: u.email,
          username: u.username || (u.email.includes('@baseball-analyzer.internal') ? u.email.replace('@baseball-analyzer.internal', '') : u.email),
          display_name: u.display_name || u.email,
          team_id: u.team_id || 'Team A',
          team_name: u.team_name || u.team_id || 'Team A',
          role: u.role || 'user',
          is_disabled: !!u.is_disabled,
          is_migrated: hasAuth,
          allow_hitting: u.allow_hitting !== false,
          allow_pitching: u.allow_pitching !== false,
          allow_body_comp: u.allow_body_comp !== false,
          permissions: {
            hitting: u.allow_hitting !== false,
            pitching: u.allow_pitching !== false,
            bodyComp: u.allow_body_comp !== false
          },
          temp_password: u.temp_password || null,
          created_at: u.created_at || new Date().toISOString()
        });
      });

      // Second, overlay Supabase profiles
      if (Array.isArray(profiles)) {
        profiles.forEach(p => {
          if (!p || !p.email) return;
          const key = p.email.toLowerCase();
          const existing = userMap.get(key) || {};
          const hasAuth = authUserMap.has(key) || (p.id && authUserMap.has(p.id));
          userMap.set(key, {
            ...existing,
            id: p.id,
            email: p.email,
            username: p.username || (p.email.includes('@baseball-analyzer.internal') ? p.email.replace('@baseball-analyzer.internal', '') : p.email),
            display_name: p.display_name || p.username || p.email,
            team_id: p.team_id || existing.team_id || 'Team A',
            team_name: p.team_name || p.team_id || 'Team A',
            role: p.role || existing.role || 'user',
            is_disabled: !!p.is_disabled,
            is_migrated: hasAuth,
            allow_hitting: p.allow_hitting !== false,
            allow_pitching: p.allow_pitching !== false,
            allow_body_comp: p.allow_body_comp !== false,
            permissions: {
              hitting: p.allow_hitting !== false,
              pitching: p.allow_pitching !== false,
              bodyComp: p.allow_body_comp !== false
            },
            temp_password: p.temp_password_info || existing.temp_password || null,
            created_at: p.created_at || existing.created_at,
            updated_at: p.updated_at
          });
        });
      }

      return res.status(200).json({ users: Array.from(userMap.values()) });
    }

    // -------------------------------------------------------------------------
    // POST: Create a new user OR Single User Migration
    // -------------------------------------------------------------------------
    if (req.method === 'POST') {
      const { email: rawEmail, password, team_id, role, display_name, action } = req.body || {};

      if (!rawEmail) {
        return res.status(400).json({ error: 'ID/Email is required.' });
      }

      const { email, username } = normalizeIdentifier(rawEmail);

      // Single User Migration Action (個別アカウント移行)
      if (action === 'migrate_single') {
        const tempPass = password?.trim() || ('pass' + Math.floor(100000 + Math.random() * 900000) + '!');
        let finalUserId = null;

        // 1. Check if user already exists in profiles
        try {
          const { data: pData } = await adminClient
            .from('profiles')
            .select('id')
            .eq('email', email)
            .maybeSingle();

          if (pData?.id) {
            finalUserId = pData.id;
            try {
              await adminClient.auth.admin.updateUserById(finalUserId, {
                password: tempPass,
                email_confirm: true,
                user_metadata: {
                  username,
                  display_name: display_name?.trim() || username,
                  team_id: team_id?.trim() || 'Team A',
                  role: role || 'user'
                }
              });
            } catch (uErr) {
              console.warn('updateUserById error:', uErr?.message || uErr);
            }
          }
        } catch (findErr) {
          console.warn('Profile search error:', findErr?.message);
        }

        // 2. If not found in profiles, create user directly in Supabase Auth
        if (!finalUserId) {
          const { data: newUser, error: createErr } = await adminClient.auth.admin.createUser({
            email,
            password: tempPass,
            email_confirm: true,
            user_metadata: {
              username,
              display_name: display_name?.trim() || username,
              team_id: team_id?.trim() || 'Team A',
              role: role || 'user'
            }
          });

          if (!createErr && newUser?.user?.id) {
            finalUserId = newUser.user.id;
          } else {
            // User may already be registered in Auth but not in profiles
            console.log('Create user failed or already exists:', createErr?.message);
            const { data: authList } = await adminClient.auth.admin.listUsers();
            const existingAuth = authList?.users?.find(u => u.email?.toLowerCase() === email);
            if (existingAuth?.id) {
              finalUserId = existingAuth.id;
              try {
                await adminClient.auth.admin.updateUserById(finalUserId, {
                  password: tempPass,
                  email_confirm: true
                });
              } catch (uErr) {
                console.warn('updateUserById error on retry:', uErr?.message);
              }
            } else if (createErr) {
              return res.status(400).json({ error: createErr.message });
            }
          }
        }

        if (!finalUserId) {
          return res.status(500).json({ error: 'Supabase Authユーザーの作成または更新に失敗しました。' });
        }

        // 3. Upsert profiles record
        try {
          await adminClient.from('profiles').upsert({
            id: finalUserId,
            email,
            username,
            display_name: display_name?.trim() || username,
            team_id: team_id?.trim() || 'Team A',
            team_name: team_id?.trim() || 'Team A',
            role: role || 'user',
            is_disabled: false,
            allow_hitting: true,
            allow_pitching: true,
            allow_body_comp: true,
            temp_password_info: {
              is_initial: true,
              pass_plain: tempPass,
              issued_at: new Date().toISOString()
            },
            updated_at: new Date().toISOString()
          });
        } catch (pErr) {
          console.error('profiles upsert error:', pErr);
        }

        // 4. Update legacy database to mark is_migrated (non-blocking)
        try {
          const legacyUsers = await getLegacyUsers(adminClient);
          const updatedLegacy = legacyUsers.map(u => {
            if ((u.email || '').toLowerCase() === email || (u.email || '').toLowerCase() === rawEmail.toLowerCase()) {
              return { ...u, is_migrated: true, id: finalUserId };
            }
            return u;
          });
          await saveLegacyUsers(adminClient, updatedLegacy);
        } catch (e) {
          console.warn('Update legacy is_migrated error:', e);
        }

        // 5. Log to access_logs (non-blocking)
        try {
          await adminClient.from('access_logs').insert([{
            user_id: finalUserId,
            email,
            team_id: team_id || 'Team A',
            event_type: 'migrated_to_auth',
            status: 'success',
            details: { admin_action: true, issuer: authCheck.adminUser.email },
            created_at: new Date().toISOString()
          }]);
        } catch (logErr) {
          console.warn('access_logs insert error:', logErr);
        }

        return res.status(200).json({
          message: `「${username}」を Supabase Auth に個別移行しました。`,
          userId: finalUserId,
          tempPassword: tempPass,
          email
        });
      }

      // Standard user creation
      if (!password) {
        return res.status(400).json({ error: 'Password is required.' });
      }

      const { data: authUser, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password: String(password).trim(),
        email_confirm: true,
        user_metadata: {
          username,
          display_name: display_name?.trim() || username,
          team_id: team_id?.trim() || 'Team A',
          role: role || 'user',
          allow_hitting: true,
          allow_pitching: true,
          allow_body_comp: true
        }
      });

      if (createError) {
        return res.status(400).json({ error: createError.message });
      }

      await adminClient.from('profiles').upsert({
        id: authUser.user.id,
        email,
        username,
        display_name: display_name?.trim() || username,
        team_id: team_id?.trim() || 'Team A',
        team_name: team_id?.trim() || 'Team A',
        role: role || 'user',
        is_disabled: false,
        allow_hitting: true,
        allow_pitching: true,
        allow_body_comp: true,
        updated_at: new Date().toISOString()
      });

      return res.status(201).json({
        message: 'User created successfully.',
        user: {
          id: authUser.user.id,
          email,
          username,
          display_name: display_name?.trim() || username,
          team_id: team_id?.trim() || 'Team A',
          role: role || 'user'
        }
      });
    }

    // -------------------------------------------------------------------------
    // PUT: Update user (status, team, permissions, password, temp_password)
    // -------------------------------------------------------------------------
    if (req.method === 'PUT') {
      const { id, action, updates, password } = req.body || {};

      if (!id) {
        return res.status(400).json({ error: 'User ID is required.' });
      }

      // Special action: Issue temporary password (works for both migrated and unmigrated accounts!)
      if (action === 'temp_password') {
        const rawEmail = (req.body.email || '').trim();
        const { email: cleanEmail, username } = normalizeIdentifier(rawEmail || id);
        const tempPass = 'tp' + Math.floor(100000 + Math.random() * 900000);
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
        const hashedTemp = await hashPassword(tempPass);

        // 1. Supabase Auth: Find or create user and set password to tempPass
        const { data: authList } = await adminClient.auth.admin.listUsers();
        const existingAuth = authList?.users?.find(u => 
          (u.email && cleanEmail && u.email.toLowerCase() === cleanEmail.toLowerCase()) || 
          (id && u.id === id)
        );

        let finalUserId;

        if (existingAuth) {
          const { error: authErr } = await adminClient.auth.admin.updateUserById(existingAuth.id, {
            password: tempPass
          });
          if (authErr) {
            console.warn('updateUserById error:', authErr.message);
          }
          finalUserId = existingAuth.id;
        } else {
          const { data: createdUser, error: createErr } = await adminClient.auth.admin.createUser({
            email: cleanEmail,
            password: tempPass,
            email_confirm: true,
            user_metadata: {
              username,
              display_name: req.body.display_name || username,
              team_id: req.body.team_id || 'Team A',
              role: req.body.role || 'user'
            }
          });
          if (!createErr && createdUser?.user) {
            finalUserId = createdUser.user.id;
          }
        }

        // 2. Update profiles table with temporary password info
        if (finalUserId) {
          const tempInfo = {
            is_temporary: true,
            expires_at: expiresAt,
            issued_at: new Date().toISOString()
          };

          await adminClient.from('profiles').upsert({
            id: finalUserId,
            email: cleanEmail,
            username,
            display_name: req.body.display_name || username,
            team_id: req.body.team_id || 'Team A',
            team_name: req.body.team_id || 'Team A',
            role: req.body.role || 'user',
            is_disabled: false,
            temp_password_info: tempInfo,
            updated_at: new Date().toISOString()
          });
        }

        // 3. CRITICAL: ALSO UPDATE LEGACY USERS TABLE (baseball_data) VIA SERVICE_ROLE!
        // This ensures unmigrated accounts can login immediately with tempPass via legacy hash check!
        try {
          const legacyUsers = await getLegacyUsers(adminClient);
          const updatedLegacy = legacyUsers.map(u => {
            const uEmail = (u.email || '').toLowerCase();
            if (
              (u.id && u.id === id) ||
              (cleanEmail && uEmail === cleanEmail.toLowerCase()) ||
              (rawEmail && uEmail === rawEmail.toLowerCase())
            ) {
              return {
                ...u,
                temp_password: {
                  hashed: hashedTemp,
                  pass_plain: tempPass,
                  expires_at: expiresAt
                }
              };
            }
            return u;
          });
          await saveLegacyUsers(adminClient, updatedLegacy);
        } catch (legErr) {
          console.warn("Update legacy baseball_data temp_password error:", legErr);
        }

        // 4. Record in access_logs
        try {
          await adminClient.from('access_logs').insert([{
            user_id: finalUserId || null,
            email: cleanEmail,
            team_id: req.body.team_id || 'Team A',
            event_type: 'temp_password_issued',
            status: 'warning',
            details: { issuer: authCheck.adminUser.email, expires_at: expiresAt },
            created_at: new Date().toISOString()
          }]);
        } catch (logErr) {
          console.warn('temp_password access_logs insert error:', logErr);
        }

        return res.status(200).json({
          message: 'Temporary password issued.',
          tempPassword: tempPass,
          expiresAt
        });
      }

      // Password update / reset
      if (password) {
        const rawEmail = (req.body.email || '').trim();
        const { email: cleanEmail } = normalizeIdentifier(rawEmail || id);

        const { data: authList } = await adminClient.auth.admin.listUsers();
        const existingAuth = authList?.users?.find(u => 
          (u.email && cleanEmail && u.email.toLowerCase() === cleanEmail.toLowerCase()) || 
          (id && u.id === id)
        );

        if (existingAuth) {
          await adminClient.auth.admin.updateUserById(existingAuth.id, {
            password: String(password).trim()
          });
          await adminClient
            .from('profiles')
            .update({
              temp_password_info: null,
              updated_at: new Date().toISOString()
            })
            .eq('id', existingAuth.id);
        }
      }

      // Standard profile field updates
      if (updates && typeof updates === 'object') {
        const allowedFields = [
          'team_id', 'team_name', 'display_name', 'is_disabled',
          'allow_hitting', 'allow_pitching', 'allow_body_comp', 'role'
        ];
        const safeUpdates = {};
        for (const k of allowedFields) {
          if (updates[k] !== undefined) {
            safeUpdates[k] = updates[k];
          }
        }
        const isUUID = (str) => typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
        const targetEmail = (updates.email || req.body.email || (typeof id === 'string' && id.includes('@') ? id : '')).toLowerCase().trim();

        if (id && isUUID(id)) {
          await adminClient
            .from('profiles')
            .update(safeUpdates)
            .eq('id', id);
        } else if (targetEmail) {
          await adminClient
            .from('profiles')
            .update(safeUpdates)
            .eq('email', targetEmail);
        }

        // Also update Supabase Auth user_metadata if auth user found
        try {
          let authId = id && isUUID(id) ? id : null;
          if (!authId && targetEmail) {
            const { data: authList } = await adminClient.auth.admin.listUsers();
            const found = authList?.users?.find(u => u.email?.toLowerCase() === targetEmail);
            if (found) authId = found.id;
          }
          if (authId) {
            await adminClient.auth.admin.updateUserById(authId, {
              user_metadata: safeUpdates
            });
          }
        } catch (authErr) {
          console.warn("Auth user_metadata update non-fatal error:", authErr);
        }

        // Also reflect updates in legacy storage
        try {
          const legacyUsers = await getLegacyUsers(adminClient);
          const updatedLegacy = legacyUsers.map(u => {
            if (u.id === id || (u.email && targetEmail && u.email.toLowerCase() === targetEmail)) {
              return { ...u, ...safeUpdates };
            }
            return u;
          });
          await saveLegacyUsers(adminClient, updatedLegacy);
        } catch {}
      }

      return res.status(200).json({ message: 'User updated successfully.' });
    }

    // -------------------------------------------------------------------------
    // DELETE: Delete user completely
    // -------------------------------------------------------------------------
    if (req.method === 'DELETE') {
      const { id } = req.body || req.query || {};

      if (!id) {
        return res.status(400).json({ error: 'User ID is required.' });
      }

      try {
        await adminClient.auth.admin.deleteUser(id);
      } catch (err) {
        console.warn('Delete auth user warning:', err);
      }
      try {
        await adminClient.from('profiles').delete().eq('id', id);
      } catch (err) {
        console.warn('Delete profile warning:', err);
      }

      try {
        const legacyUsers = await getLegacyUsers(adminClient);
        const filtered = legacyUsers.filter(u => u.id !== id && u.email !== id);
        await saveLegacyUsers(adminClient, filtered);
      } catch {}

      return res.status(200).json({ message: 'User deleted successfully.' });
    }

    return res.status(405).json({ error: 'Method Not Allowed' });

  } catch (err) {
    console.error('Admin API internal error:', err);
    return res.status(500).json({ error: 'Internal Server Error: ' + (err.message || String(err)) });
  }
}
