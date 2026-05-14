import { NextResponse } from 'next/server';
import { cancelMagazineRun } from '@/lib/runs';

export const dynamic = 'force-dynamic';

type Context = {
  params: Promise<{ runId: string }>;
};

export async function POST(_request: Request, { params }: Context) {
  const { runId } = await params;
  await cancelMagazineRun(runId);
  return NextResponse.json({ ok: true });
}
