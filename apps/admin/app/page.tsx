import Link from 'next/link';
import { redirect } from 'next/navigation';
import { loadLatestPublicIssue, loadRunSummaries } from '@/lib/magazine';
import { createMagazineRun } from '@/lib/runs';

export const dynamic = 'force-dynamic';

async function runIssueAction(formData: FormData) {
  'use server';
  const seedTrend = String(formData.get('seedTrend') ?? '').trim();
  const { runId } = await createMagazineRun({
    mode: 'manual',
    seedTrend: seedTrend || undefined,
  });
  redirect(`/runs/${runId}`);
}

function StatusPill({ label, tone = 'muted' }: { label: string; tone?: 'good' | 'warn' | 'muted' }) {
  const color = tone === 'good' ? '#9bd8b0' : tone === 'warn' ? '#f0c36a' : '#888';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        border: `1px solid ${color}`,
        color,
        padding: '5px 9px',
        borderRadius: 999,
        fontSize: 12,
      }}
    >
      {label}
    </span>
  );
}

export default async function DashboardPage() {
  const [runs, latestIssue] = await Promise.all([loadRunSummaries(), loadLatestPublicIssue()]);
  const latestRun = runs[0];

  return (
    <div>
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.2fr) minmax(280px, 0.8fr)',
          gap: 32,
          alignItems: 'end',
          marginBottom: 44,
        }}
      >
        <div>
          <p style={{ color: '#888', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: 1.6, fontSize: 12 }}>
            editorial desk
          </p>
          <h2 style={{ fontSize: 54, lineHeight: 1, fontStyle: 'italic', margin: 0, fontFamily: 'Georgia, serif' }}>
            magazine control.
          </h2>
          <p style={{ color: '#aaa', margin: '18px 0 0', maxWidth: 680, fontSize: 18, lineHeight: 1.45 }}>
            Pick the issue, inspect the story, publish only the approved set. The app feed reads the same published manifest.
          </p>
          <form action={runIssueAction} style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 24, flexWrap: 'wrap' }}>
            <input
              name="seedTrend"
              placeholder="optional seed trend"
              style={{
                background: '#111',
                color: '#f4f1ea',
                border: '1px solid #333',
                padding: '12px 13px',
                minWidth: 240,
              }}
            />
            <button
              type="submit"
              style={{
                background: '#f4f1ea',
                color: '#0a0a0a',
                border: 0,
                padding: '12px 18px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Run issue
            </button>
          </form>
        </div>

        <div style={{ borderTop: '1px solid #333', paddingTop: 18 }}>
          <div style={{ color: '#777', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.4, marginBottom: 8 }}>
            live in app
          </div>
          {latestIssue ? (
            <>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: 24, fontStyle: 'italic', lineHeight: 1.05 }}>
                {latestIssue.title}
              </div>
              <div style={{ color: '#888', marginTop: 10 }}>
                Vol. {latestIssue.volume} · {new Date(latestIssue.publishDate).toLocaleString()}
              </div>
            </>
          ) : (
            <div style={{ color: '#888' }}>No approved issue has been published yet.</div>
          )}
        </div>
      </section>

      {latestRun && (
        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
            gap: 16,
            marginBottom: 40,
          }}
        >
          <div style={{ borderTop: '1px solid #333', paddingTop: 16 }}>
            <div style={{ color: '#777', fontSize: 12, marginBottom: 8 }}>latest run</div>
            <Link href={`/runs/${latestRun.run_id}`} style={{ color: '#f4f1ea', textDecoration: 'none', fontSize: 24 }}>
              {latestRun.run_id.slice(0, 8)}...
            </Link>
            {latestRun.run_status && <div style={{ color: '#777', marginTop: 8 }}>{latestRun.run_status} · {latestRun.current_step ?? 'idle'}</div>}
          </div>
          <div style={{ borderTop: '1px solid #333', paddingTop: 16 }}>
            <div style={{ color: '#777', fontSize: 12, marginBottom: 8 }}>QA</div>
            <StatusPill label={latestRun.qa_status} tone={latestRun.qa_approved ? 'good' : 'warn'} />
          </div>
          <div style={{ borderTop: '1px solid #333', paddingTop: 16 }}>
            <div style={{ color: '#777', fontSize: 12, marginBottom: 8 }}>picked</div>
            <div style={{ fontSize: 24 }}>{latestRun.picked_count}/{latestRun.variants_count}</div>
          </div>
          <div style={{ borderTop: '1px solid #333', paddingTop: 16 }}>
            <div style={{ color: '#777', fontSize: 12, marginBottom: 8 }}>cost</div>
            <div style={{ fontSize: 24 }}>${latestRun.total_cost.toFixed(2)}</div>
          </div>
        </section>
      )}

      {latestIssue && (
        <section style={{ display: 'grid', gridTemplateColumns: '320px minmax(0, 1fr)', gap: 28, marginBottom: 56 }}>
          {latestIssue.cover.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={latestIssue.cover.imageUrl}
              alt={latestIssue.cover.headline}
              style={{ width: '100%', aspectRatio: '4 / 5', objectFit: 'cover' }}
            />
          ) : (
            <div style={{ aspectRatio: '4 / 5', background: '#151515' }} />
          )}
          <div>
            <div style={{ color: '#777', textTransform: 'uppercase', letterSpacing: 1.5, fontSize: 12, marginBottom: 12 }}>
              latest published issue
            </div>
            <h3 style={{ margin: 0, fontSize: 40, fontStyle: 'italic', fontFamily: 'Georgia, serif', lineHeight: 1 }}>
              {latestIssue.cover.headline}
            </h3>
            <p style={{ color: '#aaa', fontSize: 18, lineHeight: 1.5, maxWidth: 720 }}>{latestIssue.cover.deck}</p>
            <p style={{ color: '#777', lineHeight: 1.55, maxWidth: 760 }}>{latestIssue.whyNow}</p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 18 }}>
              <StatusPill label={`${latestIssue.trendCards.length} trend cards`} />
              <StatusPill label={`${latestIssue.curatorCards.length} curator cards`} />
              <StatusPill label={`${latestIssue.sourceCount} sources`} />
            </div>
          </div>
        </section>
      )}

      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
          <h3 style={{ fontSize: 30, fontStyle: 'italic', margin: 0, fontFamily: 'Georgia, serif' }}>
            runs.
          </h3>
          <span style={{ color: '#666', fontSize: 12 }}>approved + picked runs can be published without rerunning models</span>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #333', textAlign: 'left', color: '#888' }}>
              <th style={{ padding: '12px 8px', fontWeight: 400 }}>Run</th>
              <th style={{ padding: '12px 8px', fontWeight: 400 }}>Headline</th>
              <th style={{ padding: '12px 8px', fontWeight: 400 }}>Status</th>
              <th style={{ padding: '12px 8px', fontWeight: 400 }}>QA</th>
              <th style={{ padding: '12px 8px', fontWeight: 400 }}>Picked</th>
              <th style={{ padding: '12px 8px', fontWeight: 400 }}>Cost</th>
              <th style={{ padding: '12px 8px', fontWeight: 400 }}>Ready</th>
              <th style={{ padding: '12px 8px', fontWeight: 400 }}>Latest</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.run_id} style={{ borderBottom: '1px solid #1a1a1a' }}>
                <td style={{ padding: '14px 8px' }}>
                  <Link href={`/runs/${run.run_id}`} style={{ color: '#f4f1ea', textDecoration: 'none' }}>
                    {run.run_id.slice(0, 8)}...
                  </Link>
                </td>
                <td style={{ padding: '14px 8px', color: run.headline ? '#d8d2c7' : '#666' }}>
                  {run.headline || 'draft pending'}
                </td>
                <td style={{ padding: '14px 8px' }}>
                  <StatusPill label={run.run_status ? `${run.run_status}${run.current_step ? ` · ${run.current_step}` : ''}` : 'legacy'} tone={run.run_status === 'complete' ? 'good' : run.run_status === 'blocked' || run.run_status === 'failed' ? 'warn' : 'muted'} />
                </td>
                <td style={{ padding: '14px 8px' }}>
                  <StatusPill label={run.qa_status} tone={run.qa_approved ? 'good' : 'muted'} />
                </td>
                <td style={{ padding: '14px 8px', color: run.picked_count ? '#f4f1ea' : '#666' }}>
                  {run.picked_count}/{run.variants_count}
                </td>
                <td style={{ padding: '14px 8px', color: '#888' }}>${run.total_cost.toFixed(2)}</td>
                <td style={{ padding: '14px 8px' }}>
                  {run.published ? (
                    <StatusPill label="published" tone="good" />
                  ) : run.qa_approved && run.missing_count === 0 ? (
                    <StatusPill label="ready" tone="good" />
                  ) : (
                    <StatusPill label={`${run.missing_count} missing`} tone="warn" />
                  )}
                </td>
                <td style={{ padding: '14px 8px', color: '#666', fontSize: 12 }}>
                  {new Date(run.latest_step_at).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {runs.length === 0 && (
          <p style={{ color: '#666', marginTop: 32 }}>
            No runs yet. Click <strong>Run issue</strong> to start the full web pipeline.
          </p>
        )}
      </section>
    </div>
  );
}
