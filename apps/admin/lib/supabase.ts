import { createClient } from '@supabase/supabase-js';

type SupabaseClient = ReturnType<typeof createClient<any>>;

let supabaseAnon: SupabaseClient | null = null;
let supabaseAdmin: SupabaseClient | null = null;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function getSupabaseAnon() {
  if (!supabaseAnon) {
    supabaseAnon = createClient<any>(
      requiredEnv('NEXT_PUBLIC_SUPABASE_URL'),
      requiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    );
  }

  return supabaseAnon;
}

// Service role client — only ever used in API routes / server actions
// running on the Vercel server. NEVER import from client components.
export function getSupabaseAdmin() {
  if (!supabaseAdmin) {
    supabaseAdmin = createClient<any>(
      requiredEnv('NEXT_PUBLIC_SUPABASE_URL'),
      requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
  }

  return supabaseAdmin;
}
