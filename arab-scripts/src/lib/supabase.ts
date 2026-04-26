import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''; // Must use Service Role to bypass RLS and create signed URLs for private bucket

if (!supabaseUrl || !supabaseKey) {
  console.warn("⚠️ Supabase API keys are not defined in the environment variables.");
}

export const supabase = createClient(supabaseUrl, supabaseKey);
