import { NextResponse } from 'next/server';
import { loadLatestPublicIssue } from '@/lib/magazine';

export const dynamic = 'force-dynamic';

function publicHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: publicHeaders() });
}

export async function GET() {
  const issue = await loadLatestPublicIssue();

  if (!issue) {
    return NextResponse.json({ error: 'No published issue found.' }, {
      status: 404,
      headers: publicHeaders(),
    });
  }

  return NextResponse.json({ issue }, { headers: publicHeaders() });
}
