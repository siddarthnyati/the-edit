import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// GET /api/sign-url?path=<storage-path>
// Returns a 1-hour signed URL for a file in the magazine-assets bucket.
// Used by the styleMeUp app once it integrates (not by the picker page,
// which signs server-side).

export async function GET(request: Request) {
  const url = new URL(request.url);
  const path = url.searchParams.get('path');
  if (!path) return NextResponse.json({ error: 'path required' }, { status: 400 });

  const { data, error } = await supabaseAdmin.storage
    .from('magazine-assets')
    .createSignedUrl(path, 3600);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ url: data.signedUrl, expiresInSeconds: 3600 });
}
