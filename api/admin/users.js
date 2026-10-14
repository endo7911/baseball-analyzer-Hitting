import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://ukyppwxsvcgxuxedwfom.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

// Verify that the caller is an authenticated administrator
async function verifyAdminCaller(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { ok: false, status: 401, error: 'Authorization header missing or invalid format.' };
  }

  const token = authHeader.split(' ')[1];
  const adminClient = getAdminClient();

  // Validate the JWT token with Supabase Auth
  const { data: { user }, error: userError } = await adminClient.auth.getUser(token);
  if (userError || !user) {
    return { ok: false, status: 401, error: 'Invalid or expired session token.' };
  }

  // Check role in profiles table
  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('role, is_disabled')
    .eq('id', user.id)
    .single();

  if (profileError || !profile || profile.role !== 'admin' || profile.is_disabled) {
    return { ok: false, status: 403, error: 'Access denied: Administrator privileges required.' };
  }

  return { ok: true, adminUser: user, profile };
}

// Helper to normalize username/email
function normalizeIdentifier(rawId) {
  const trimmed = String(rawId || '').trim();
  if (trimmed.includes('@')) {
    return { email: trimmed.toLowerCase(), username: trimmed.split('@')[0] };
  }
  return { email: `${trimmed.toLowerCase()}@baseball-analyzer.internal`, username: trimmed };
}

export default async function handler(req, res) {
  // CORS configuration
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Check if service_role key is configured
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({
      error: 'Vercel Server Environment Error: SUPABASE_SERVICE_ROLE_KEY is missing. Please set it in Vercel Project Settings > Environment Variables.'
    });
  }

  try {
    const adminClient = getAdminClient();

    // 1. Authenticate caller as Admin
    const authCheck = await verifyAdminCaller(req);
    if (!authCheck.ok) {
      return res.status(authCheck.status).json({ error: authCheck.error });
    }

    // -------------------------------------------------------------------------
    // GET: List all users OR Security Access Logs
    // -------------------------------------------------------------------------
    if (req.method === 'GET') {
      const type = req.query?.type || 'users';

      // 1. Return Security Audit Logs
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
          // If table doesn't exist yet, return empty list gracefully
          return res.status(200).json({ logs: [] });
        }
        return res.status(200).json({ logs: logs || [] });
      }

      // 2. Return User Profiles & Migration Status
      const { data: profiles, error: pError } = await adminClient
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (pError) {
        return res.status(500).json({ error: 'Failed to fetch profiles: ' + pError.message });
      }

      // Get list of registered auth users to determine individual migration status
      const { data: authUsersData } = await adminClient.auth.admin.listUsers();
      const authUserMap = new Map();
      if (authUsersData?.users) {
        authUsersData.users.forEach(u => {
          authUserMap.set(u.email?.toLowerCase(), u);
          if (u.id) authUserMap.set(u.id, u);
        });
      }

      // Format for frontend AdminPanel
      const formatted = (profiles || []).map(p => {
        const emailKey = p.email?.toLowerCase();
        const hasAuthAccount = authUserMap.has(emailKey) || authUserMap.has(p.id);

        return {
          id: p.id,
          email: p.email,
          username: p.username || (p.email?.includes('@baseball-analyzer.internal') ? p.email.replace('@baseball-analyzer.internal', '') : p.email),
          display_name: p.display_name || p.username || p.email,
          team_id: p.team_id || 'Team A',
          team_name: p.team_name || p.team_id || 'Team A',
          role: p.role || 'user',
          is_disabled: !!p.is_disabled,
          is_migrated: hasAuthAccount, // 個別移行ステータス
          allow_hitting: p.allow_hitting !== false,
          allow_pitching: p.allow_pitching !== false,
          allow_body_comp: p.allow_body_comp !== false,
          permissions: {
            hitting: p.allow_hitting !== false,
            pitching: p.allow_pitching !== false,
            bodyComp: p.allow_body_comp !== false
          },
          temp_password: p.temp_password_info || null,
          created_at: p.created_at,
          updated_at: p.updated_at
        };
      });

      return res.status(200).json({ users: formatted });
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

        // Check if user already exists in auth
        const { data: authList } = await adminClient.auth.admin.listUsers();
        const existingAuth = authList?.users?.find(u => u.email?.toLowerCase() === email);

        let finalUserId;

        if (existingAuth) {
          // Update password for existing auth account
          await adminClient.auth.admin.updateUserById(existingAuth.id, {
            password: tempPass
          });
          finalUserId = existingAuth.id;
        } else {
          // Create new user in Supabase Auth
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
          if (createErr) {
            return res.status(400).json({ error: createErr.message });
          }
          finalUserId = newUser.user.id;
        }

        // Upsert profiles record
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

        // 監査ログに記録
        await adminClient.from('access_logs').insert([{
          user_id: finalUserId,
          email,
          team_id: team_id || 'Team A',
          event_type: 'migrated_to_auth',
          status: 'success',
          details: { admin_action: true, issuer: authCheck.adminUser.email },
          created_at: new Date().toISOString()
        }]);

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

        // 1. Find user in Supabase Auth by email or id
        const { data: authList } = await adminClient.auth.admin.listUsers();
        const existingAuth = authList?.users?.find(u => 
          (u.email && cleanEmail && u.email.toLowerCase() === cleanEmail.toLowerCase()) || 
          (id && u.id === id)
        );

        let finalUserId;

        if (existingAuth) {
          // User exists in Supabase Auth -> update password
          const { error: authErr } = await adminClient.auth.admin.updateUserById(existingAuth.id, {
            password: tempPass
          });
          if (authErr) {
            return res.status(400).json({ error: 'Supabase Auth パスワード更新エラー: ' + authErr.message });
          }
          finalUserId = existingAuth.id;
        } else {
          // User not yet in Supabase Auth -> Auto-create user with this temp password!
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
          if (createErr) {
            return res.status(400).json({ error: 'Supabase Auth アカウント作成エラー: ' + createErr.message });
          }
          finalUserId = createdUser.user.id;
        }

        // 2. Record temporary password info in profiles
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

        // 3. Record in access_logs
        await adminClient.from('access_logs').insert([{
          user_id: finalUserId,
          email: cleanEmail,
          team_id: req.body.team_id || 'Team A',
          event_type: 'temp_password_issued',
          status: 'warning',
          details: { issuer: authCheck.adminUser.email, expires_at: expiresAt },
          created_at: new Date().toISOString()
        }]).catch(() => {});

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
          const { error: pErr } = await adminClient.auth.admin.updateUserById(existingAuth.id, {
            password: String(password).trim()
          });
          if (pErr) {
            return res.status(400).json({ error: 'Failed to update password: ' + pErr.message });
          }
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
        safeUpdates.updated_at = new Date().toISOString();

        const { error: uErr } = await adminClient
          .from('profiles')
          .update(safeUpdates)
          .eq('id', id);

        if (uErr) {
          return res.status(400).json({ error: 'Failed to update profile: ' + uErr.message });
        }
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

      const { error: delError } = await adminClient.auth.admin.deleteUser(id);
      if (delError) {
        return res.status(400).json({ error: 'Failed to delete user: ' + delError.message });
      }

      return res.status(200).json({ message: 'User deleted successfully.' });
    }

    return res.status(405).json({ error: 'Method Not Allowed' });

  } catch (err) {
    console.error('Admin API internal error:', err);
    return res.status(500).json({ error: 'Internal Server Error: ' + (err.message || String(err)) });
  }
}
