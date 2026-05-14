import { NextResponse } from 'next/server';
import { createMagazineRun } from '@/lib/runs';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { runId } = await createMagazineRun({
    mode: 'manual',
    seedTrend: typeof body.seedTrend === 'string' && body.seedTrend.trim() ? body.seedTrend.trim() : undefined,
    budgetUsd: typeof body.budgetUsd === 'number' ? body.budgetUsd : undefined,
  });

  return NextResponse.json({ runId });
}
