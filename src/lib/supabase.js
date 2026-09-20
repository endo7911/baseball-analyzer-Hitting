import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://ukyppwxsvcgxuxedwfom.supabase.co';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_PCKtT5zEB4r6UMZ5H1q81w_Wpp1b3te';

// Single shared client - key is fixed, no user input needed
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Keep getSupabase for compatibility but always use fixed key
export const getSupabase = () => supabase;


