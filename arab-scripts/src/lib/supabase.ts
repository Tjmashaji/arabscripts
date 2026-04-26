import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dummy.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy_key'; // Must use Service Role to bypass RLS and create signed URLs for private bucket

if (supabaseUrl === 'https://dummy.supabase.co') {
  console.warn("⚠️ Supabase API keys are not defined in the environment variables. Using dummy keys for build.");
}

export const supabase = createClient(supabaseUrl, supabaseKey);
