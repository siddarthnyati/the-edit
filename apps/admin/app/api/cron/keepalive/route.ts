import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Supabase free-tier keep-alive (vercel.json cron, daily).
//
// The drip project auto-pauses after ~7 days without database activity,
// which has silently killed every public image URL and the Discover API
// twice now (2026-06-18, 2026-06-20). A daily one-row read is real DB
// activity, so the project never goes idle. Runs server-side on Vercel —
// nothing depends on a laptop being open.

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ ok: false, error: 'supabase env missing' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { count, error } = await supabase
    .from('classify_events')
    .select('id', { count: 'exact', head: true });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 502 });
  }

  return NextResponse.json({ ok: true, at: new Date().toISOString(), classifyEvents: count ?? 0 });
}
