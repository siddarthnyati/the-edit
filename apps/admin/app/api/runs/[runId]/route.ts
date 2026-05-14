import { NextResponse } from 'next/server';
import { loadRunArtifacts } from '@/lib/magazine';
import { loadMagazineRun } from '@/lib/runs';

export const dynamic = 'force-dynamic';

type Context = {
  params: Promise<{ runId: string }>;
};

export async function GET(_request: Request, { params }: Context) {
  const { runId } = await params;
  const [run, artifacts] = await Promise.all([
    loadMagazineRun(runId),
    loadRunArtifacts(runId),
  ]);

  if (!run && artifacts.steps.length === 0) {
    return NextResponse.json({ error: `Run ${runId} not found.` }, { status: 404 });
  }

  return NextResponse.json({ run, artifacts });
}
