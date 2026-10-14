import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://ukyppwxsvcgxuxedwfom.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_PCKtT5zEB4r6UMZ5H1q81w_Wpp1b3te';

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
    // GET: List all users from profiles table & Supabase Auth
    // -------------------------------------------------------------------------
    if (req.method === 'GET') {
      const { data: profiles, error: pError } = await adminClient
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (pError) {
        return res.status(500).json({ error: 'Failed to fetch profiles: ' + pError.message });
      }

      // Format for frontend AdminPanel
      const formatted = (profiles || []).map(p => ({
        id: p.id,
        email: p.email,
        username: p.username || (p.email?.includes('@baseball-analyzer.internal') ? p.email.replace('@baseball-analyzer.internal', '') : p.email),
        display_name: p.display_name || p.username || p.email,
        team_id: p.team_id || 'Team A',
        team_name: p.team_name || p.team_id || 'Team A',
        role: p.role || 'user',
        is_disabled: !!p.is_disabled,
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
      }));

      return res.status(200).json({ users: formatted });
    }

    // -------------------------------------------------------------------------
    // POST: Create a new user (Supabase Auth + profiles table)
    // -------------------------------------------------------------------------
    if (req.method === 'POST') {
      const { email: rawEmail, password, team_id, role, display_name } = req.body || {};

      if (!rawEmail || !password) {
        return res.status(400).json({ error: 'ID/Email and Password are required.' });
      }

      const { email, username } = normalizeIdentifier(rawEmail);

      // Create user in Supabase Auth (email_confirm: true bypasses verification email)
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

      // Upsert profile record explicitly to ensure consistency
      const { data: profile, error: upsertError } = await adminClient
        .from('profiles')
        .upsert({
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
        })
        .select()
        .single();

      if (upsertError) {
        console.warn('Profile upsert warning:', upsertError.message);
      }

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

      // Special action: Issue temporary password
      if (action === 'temp_password') {
        const tempPass = 'tp' + Math.floor(100000 + Math.random() * 900000);
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

        // 1. Update password in Supabase Auth
        const { error: authErr } = await adminClient.auth.admin.updateUserById(id, {
          password: tempPass
        });

        if (authErr) {
          return res.status(400).json({ error: 'Failed to set temporary password: ' + authErr.message });
        }

        // 2. Record temporary password info in profiles
        const tempInfo = {
          is_temporary: true,
          expires_at: expiresAt,
          issued_at: new Date().toISOString()
        };

        await adminClient
          .from('profiles')
          .update({
            temp_password_info: tempInfo,
            updated_at: new Date().toISOString()
          })
          .eq('id', id);

        return res.status(200).json({
          message: 'Temporary password issued.',
          tempPassword: tempPass,
          expiresAt
        });
      }

      // Password update / reset
      if (password) {
        const { error: pErr } = await adminClient.auth.admin.updateUserById(id, {
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
          .eq('id', id);
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

      // Delete from Supabase Auth (cascades to profiles)
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
