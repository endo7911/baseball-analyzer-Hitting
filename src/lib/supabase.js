import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://uzbggxstgmerexnugbxj.supabase.co';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV6YmdneHN0Z21lcmV4bnVnYnhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxNDE3MzIsImV4cCI6MjA3OTcxNzczMn0.8LdP0AfWsBUpEAc0CaaujLqbqqESgkAKDalXW7CcfPo';

// Single shared client - key is fixed, no user input needed
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Keep getSupabase for compatibility but always use fixed key
export const getSupabase = () => supabase;

