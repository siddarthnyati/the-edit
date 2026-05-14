import { NextResponse } from 'next/server';
import { runMagazineStep } from '@/lib/runs';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type Context = {
  params: Promise<{ runId: string }>;
};

export async function POST(_request: Request, { params }: Context) {
  const { runId } = await params;
  const result = await runMagazineStep(runId);
  return NextResponse.json(result);
}
