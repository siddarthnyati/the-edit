import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

// Supabase free-tier keep-alive (vercel.json cron, daily).
//
// The drip project auto-pauses after ~7 days without database activity,
// which has silently killed every public image URL and the Discover API
// twice now (2026-06-18, 2026-06-20). A daily one-row read is real DB
// activity, so the project never goes idle. Runs server-side on Vercel —
// nothing depends on a laptop being open.

export const dynamic = 'force-dynamic';

export async function GET() {
  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'supabase env missing' }, { status: 500 });
  }

  const { count, error } = await supabase
    .from('classify_events')
    .select('id', { count: 'exact', head: true });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 502 });
  }

  return NextResponse.json({ ok: true, at: new Date().toISOString(), classifyEvents: count ?? 0 });
}
