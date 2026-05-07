import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Anon client — used in server components for read-only queries the
// schema permits. Currently nothing because the magazine_* tables are
// service-role only. Kept for future read-paths if RLS opens up.
export const supabaseAnon = createClient(url, anonKey);

// Service role client — only ever used in API routes / server actions
// running on the Vercel server. NEVER imported from client components.
export const supabaseAdmin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
