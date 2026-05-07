import { supabaseAdmin } from '@/lib/supabase';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

type RunSummary = {
  run_id: string;
  step_count: number;
  has_qa: boolean;
  total_cost: number | null;
  variants_count: number;
  picked_count: number;
  latest_step_at: string;
};

async function loadRuns(): Promise<RunSummary[]> {
  // Pull last 30 distinct run_ids ordered by most recent step
  const { data: stepRows, error: stepErr } = await supabaseAdmin
    .from('magazine_run_steps')
    .select('run_id, step, status, estimated_cost_usd, created_at')
    .order('created_at', { ascending: false })
    .limit(500);

  if (stepErr) throw new Error(stepErr.message);

  const grouped = new Map<string, RunSummary>();
  for (const row of stepRows ?? []) {
    const id = row.run_id as string;
    const existing = grouped.get(id) ?? {
      run_id: id,
      step_count: 0,
      has_qa: false,
      total_cost: 0,
      variants_count: 0,
      picked_count: 0,
      latest_step_at: row.created_at as string,
    };
    existing.step_count += 1;
    if (row.step === 'qa' && row.status === 'complete') existing.has_qa = true;
    existing.total_cost = (existing.total_cost ?? 0) + (Number(row.estimated_cost_usd) || 0);
    grouped.set(id, existing);
  }

  // Pull variant counts per run
  const { data: variantRows } = await supabaseAdmin
    .from('magazine_image_variants')
    .select('run_id, picked');

  for (const row of variantRows ?? []) {
    const id = row.run_id as string;
    const summary = grouped.get(id);
    if (!summary) continue;
    summary.variants_count += 1;
    if (row.picked) summary.picked_count += 1;
  }

  return Array.from(grouped.values())
    .sort((a, b) => b.latest_step_at.localeCompare(a.latest_step_at))
    .slice(0, 30);
}

export default async function RunsPage() {
  const runs = await loadRuns();

  return (
    <div>
      <h2 style={{ fontSize: 32, fontStyle: 'italic', margin: '0 0 24px', fontFamily: 'Georgia, serif' }}>
        runs.
      </h2>
      <p style={{ color: '#888', marginBottom: 32, maxWidth: 600 }}>
        Every Magazine Weekly draft. Click any run to pick variants for its 7 slots, or to inspect what was generated.
      </p>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #333', textAlign: 'left', color: '#888' }}>
            <th style={{ padding: '12px 8px', fontWeight: 400 }}>Run</th>
            <th style={{ padding: '12px 8px', fontWeight: 400 }}>Steps</th>
            <th style={{ padding: '12px 8px', fontWeight: 400 }}>QA</th>
            <th style={{ padding: '12px 8px', fontWeight: 400 }}>Variants</th>
            <th style={{ padding: '12px 8px', fontWeight: 400 }}>Picked</th>
            <th style={{ padding: '12px 8px', fontWeight: 400 }}>Cost</th>
            <th style={{ padding: '12px 8px', fontWeight: 400 }}>Latest</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr key={r.run_id} style={{ borderBottom: '1px solid #1a1a1a' }}>
              <td style={{ padding: '12px 8px' }}>
                <Link href={`/runs/${r.run_id}`} style={{ color: '#f4f1ea', textDecoration: 'none' }}>
                  {r.run_id.slice(0, 8)}…
                </Link>
              </td>
              <td style={{ padding: '12px 8px', color: '#888' }}>{r.step_count}</td>
              <td style={{ padding: '12px 8px' }}>{r.has_qa ? '✓' : '—'}</td>
              <td style={{ padding: '12px 8px', color: '#888' }}>{r.variants_count}</td>
              <td style={{ padding: '12px 8px', color: r.picked_count > 0 ? '#f4f1ea' : '#666' }}>
                {r.picked_count}/{r.variants_count}
              </td>
              <td style={{ padding: '12px 8px', color: '#888' }}>
                ${(r.total_cost ?? 0).toFixed(2)}
              </td>
              <td style={{ padding: '12px 8px', color: '#666', fontSize: 12 }}>
                {new Date(r.latest_step_at).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {runs.length === 0 && (
        <p style={{ color: '#666', marginTop: 32 }}>No runs yet. Run <code>npm run draft</code> in the-edit repo to start.</p>
      )}
    </div>
  );
}
