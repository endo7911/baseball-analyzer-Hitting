import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://ukyppwxsvcgxuxedwfom.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_FALLBACK_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_PCKtT5zEB4r6UMZ5H1q81w_Wpp1b3te';

const ACCESS_LOG_FILE_NAME = '__access_log__';

function getClient() {
  const key = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_FALLBACK_KEY;
  return createClient(SUPABASE_URL, key, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, X-User-Email, X-User-Role, X-User-Team, X-Legacy-Admin-Email');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const client = getClient();

  // POST: Record a new security / audit access log
  if (req.method === 'POST') {
    const { email, userId, teamId, eventType, status, details, userAgent } = req.body || {};
    if (!email || !eventType) {
      return res.status(400).json({ error: 'email and eventType are required.' });
    }

    const logEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      user_id: userId || null,
      email: String(email).trim().toLowerCase(),
      team_id: teamId || null,
      event_type: eventType,
      status: status || 'info',
      user_agent: userAgent || req.headers['user-agent'] || 'Unknown',
      details: details || {},
      created_at: new Date().toISOString()
    };

    // 1. Try dedicated access_logs table
    let savedToDedicated = false;
    try {
      const { error: insErr } = await client.from('access_logs').insert([{
        user_id: logEntry.user_id && logEntry.user_id.includes('-') ? logEntry.user_id : null,
        email: logEntry.email,
        team_id: logEntry.team_id,
        event_type: logEntry.event_type,
        status: logEntry.status,
        user_agent: logEntry.user_agent,
        details: logEntry.details,
        created_at: logEntry.created_at
      }]);
      if (!insErr) {
        savedToDedicated = true;
      }
    } catch {}

    // 2. Reliable fallback to baseball_data (__access_log__)
    if (!savedToDedicated) {
      try {
        await client.from('baseball_data').insert([{
          file_name: ACCESS_LOG_FILE_NAME,
          upload_id: `__log__::${Date.now()}::${JSON.stringify(logEntry)}`,
          team_name: logEntry.team_id || 'System',
          user_id: null
        }]);
      } catch (fbErr) {
        console.error('baseball_data log fallback failed:', fbErr);
        return res.status(500).json({ error: fbErr.message });
      }
    }

    return res.status(200).json({ success: true, savedToDedicated });
  }

  // GET: Fetch logs (bypasses RLS)
  if (req.method === 'GET') {
    const emailFilter = (req.query?.email || '').toLowerCase().trim();
    const allLogs = [];

    // 1. Try access_logs table
    try {
      let q = client.from('access_logs').select('*').order('created_at', { ascending: false }).limit(300);
      if (emailFilter && emailFilter !== 'all') {
        q = q.eq('email', emailFilter);
      }
      const { data: dedicatedLogs } = await q;
      if (Array.isArray(dedicatedLogs)) {
        allLogs.push(...dedicatedLogs);
      }
    } catch {}

    // 2. Fetch from baseball_data (__access_log__)
    try {
      const { data: fbRows } = await client
        .from('baseball_data')
        .select('id, upload_id, created_at')
        .eq('file_name', ACCESS_LOG_FILE_NAME)
        .order('created_at', { ascending: false })
        .limit(500);

      if (Array.isArray(fbRows)) {
        fbRows.forEach(r => {
          const uId = String(r.upload_id || '');
          if (uId.includes('::')) {
            const parts = uId.split('::');
            const jsonStr = parts.slice(2).join('::') || parts.slice(1).join('::');
            try {
              const parsed = JSON.parse(jsonStr);
              if (parsed && parsed.event_type) {
                if (!emailFilter || emailFilter === 'all' || (parsed.email || '').toLowerCase() === emailFilter) {
                  allLogs.push({
                    ...parsed,
                    id: parsed.id || r.id,
                    created_at: parsed.created_at || r.created_at
                  });
                }
              }
            } catch {}
          }
        });
      }
    } catch (fbErr) {
      console.warn('Fetch fallback logs error:', fbErr);
    }

    // Sort by created_at descending
    allLogs.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    return res.status(200).json({ logs: allLogs.slice(0, 300) });
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
