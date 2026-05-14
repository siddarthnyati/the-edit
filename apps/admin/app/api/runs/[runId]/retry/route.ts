import { NextResponse } from 'next/server';
import { retryMagazineRun } from '@/lib/runs';

export const dynamic = 'force-dynamic';

type Context = {
  params: Promise<{ runId: string }>;
};

export async function POST(_request: Request, { params }: Context) {
  const { runId } = await params;
  await retryMagazineRun(runId);
  return NextResponse.json({ ok: true });
}
