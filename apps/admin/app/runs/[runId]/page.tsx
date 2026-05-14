import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import {
  createSignedUrl,
  loadRunArtifacts,
  publishRunToApp,
  REQUIRED_SLOTS,
  type IssueCard,
  type PromptSuite,
  type Variant,
} from '@/lib/magazine';
import { getSupabaseAdmin } from '@/lib/supabase';
import { cancelMagazineRun, loadMagazineRun, retryMagazineRun, runMagazineStep } from '@/lib/runs';
import { RunPoller } from './RunPoller';

export const dynamic = 'force-dynamic';

async function pickVariant(formData: FormData) {
  'use server';
  const variantId = parseInt(formData.get('variantId') as string, 10);
  const runId = formData.get('runId') as string;
  const slot = formData.get('slot') as string;

  const supabaseAdmin = getSupabaseAdmin();

  await supabaseAdmin
    .from('magazine_image_variants')
    .update({ picked: false, picked_at: null })
    .eq('run_id', runId)
    .eq('slot', slot);

  await supabaseAdmin
    .from('magazine_image_variants')
    .update({ picked: true, picked_at: new Date().toISOString() })
    .eq('id', variantId);

  revalidatePath(`/runs/${runId}`);
  revalidatePath('/');
}

async function publishAction(formData: FormData) {
  'use server';
  const runId = formData.get('runId') as string;
  await publishRunToApp(runId);
  revalidatePath(`/runs/${runId}`);
  revalidatePath('/');
  redirect(`/runs/${runId}?published=1`);
}

async function cancelAction(formData: FormData) {
  'use server';
  const runId = formData.get('runId') as string;
  await cancelMagazineRun(runId);
  revalidatePath(`/runs/${runId}`);
  revalidatePath('/');
}

async function retryAction(formData: FormData) {
  'use server';
  const runId = formData.get('runId') as string;
  await retryMagazineRun(runId);
  revalidatePath(`/runs/${runId}`);
  revalidatePath('/');
}

async function advanceAction(formData: FormData) {
  'use server';
  const runId = formData.get('runId') as string;
  await runMagazineStep(runId);
  revalidatePath(`/runs/${runId}`);
  revalidatePath('/');
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ color: '#777', textTransform: 'uppercase', letterSpacing: 1.4, fontSize: 12, marginBottom: 8 }}>
      {children}
    </div>
  );
}

function TextBlock({ children }: { children: React.ReactNode }) {
  return <p style={{ color: '#aaa', lineHeight: 1.55, margin: '8px 0 0' }}>{children}</p>;
}

function IssueCardPreview({ card }: { card: IssueCard }) {
  return (
    <article style={{ borderTop: '1px solid #333', paddingTop: 14 }}>
      <Label>{card.eyebrow ?? card.section}</Label>
      <h4 style={{ fontFamily: 'Georgia, serif', fontSize: 26, fontStyle: 'italic', lineHeight: 1.05, margin: 0 }}>
        {card.headline}
      </h4>
      <TextBlock>{card.deck}</TextBlock>
      <p style={{ color: '#777', lineHeight: 1.55, marginTop: 12 }}>{card.body}</p>
      {card.baseSelectionIds && card.baseSelectionIds.length > 0 && (
        <div style={{ color: '#9a8f7a', fontSize: 12, marginTop: 12 }}>
          base: {card.baseSelectionIds.join(', ')}
        </div>
      )}
    </article>
  );
}

function PromptLines({ prompts }: { prompts?: PromptSuite }) {
  if (!prompts) return <TextBlock>No prompt suite recorded for this run.</TextBlock>;

  const rows = [
    ['cover-start', prompts.coverStart?.prompt],
    ['cover-end', prompts.coverEnd?.prompt],
    ['cover-motion', prompts.coverMotion?.prompt],
    ...(prompts.trendCardPrompts ?? []).map((prompt) => [`trend: ${prompt.slug}`, prompt.prompt] as const),
    ...(prompts.curatorCardPrompts ?? []).map((prompt) => [`curator: ${prompt.slug}`, prompt.prompt] as const),
  ];

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {rows.map(([label, prompt]) => (
        <div key={label} style={{ borderTop: '1px solid #222', paddingTop: 12 }}>
          <div style={{ color: '#777', fontSize: 12, marginBottom: 6 }}>{label}</div>
          <div style={{ color: '#cfc7b8', fontSize: 13, lineHeight: 1.5 }}>{prompt ?? 'missing'}</div>
        </div>
      ))}
      {prompts.promptNotes && <TextBlock>{prompts.promptNotes}</TextBlock>}
    </div>
  );
}

function PublishPanel({ runId, ready, qaApproved, missingSlots, published }: {
  runId: string;
  ready: boolean;
  qaApproved: boolean;
  missingSlots: string[];
  published: boolean;
}) {
  if (published) {
    return <div style={{ color: '#9bd8b0' }}>Published. StyleMeUp can read this issue from /api/issues/latest.</div>;
  }

  if (!ready) {
    return (
      <div>
        <div style={{ color: '#f0c36a', marginBottom: 10 }}>Not publishable yet.</div>
        <ul style={{ color: '#888', lineHeight: 1.7, margin: 0, paddingLeft: 18 }}>
          {!qaApproved && <li>QA verdict must be approve.</li>}
          {missingSlots.length > 0 && <li>Pick: {missingSlots.join(', ')}.</li>}
        </ul>
      </div>
    );
  }

  return (
    <form action={publishAction}>
      <input type="hidden" name="runId" value={runId} />
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
        Publish to app
      </button>
    </form>
  );
}

function RunControlPanel({ runId, status, currentStep, error }: {
  runId: string;
  status: string;
  currentStep?: string | null;
  error?: string | null;
}) {
  const active = status === 'queued' || status === 'running';
  const retryable = status === 'blocked' || status === 'failed';

  return (
    <div style={{ marginTop: 18, borderTop: '1px solid #222', paddingTop: 16 }}>
      <Label>workflow</Label>
      <div style={{ display: 'grid', gap: 8, color: '#aaa' }}>
        <div>Status: {status}</div>
        <div>Step: {currentStep ?? 'none'}</div>
        {error && <div style={{ color: '#f0c36a', lineHeight: 1.45 }}>{error}</div>}
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        {active && (
          <form action={cancelAction}>
            <input type="hidden" name="runId" value={runId} />
            <button type="submit" style={secondaryButtonStyle}>Cancel</button>
          </form>
        )}
        {active && (
          <form action={advanceAction}>
            <input type="hidden" name="runId" value={runId} />
            <button type="submit" style={secondaryButtonStyle}>Run next step</button>
          </form>
        )}
        {retryable && (
          <form action={retryAction}>
            <input type="hidden" name="runId" value={runId} />
            <button type="submit" style={secondaryButtonStyle}>Retry from here</button>
          </form>
        )}
      </div>
    </div>
  );
}

const secondaryButtonStyle: React.CSSProperties = {
  background: '#111',
  color: '#f4f1ea',
  border: '1px solid #333',
  padding: '10px 12px',
  cursor: 'pointer',
};

function groupVariants(variants: Variant[]) {
  const slotMap = new Map<string, Variant[]>();
  for (const variant of variants) {
    const list = slotMap.get(variant.slot) ?? [];
    list.push(variant);
    slotMap.set(variant.slot, list);
  }

  return REQUIRED_SLOTS.map((slot) => [slot, slotMap.get(slot) ?? []] as const);
}

export default async function RunDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ runId: string }>;
  searchParams: Promise<{ published?: string }>;
}) {
  const { runId } = await params;
  const { published } = await searchParams;
  const [artifacts, run] = await Promise.all([loadRunArtifacts(runId), loadMagazineRun(runId)]);
  const slots = groupVariants(artifacts.variants);
  const signedUrls = new Map<number, string>();

  await Promise.all(
    artifacts.variants.map(async (variant) => {
      signedUrls.set(variant.id, await createSignedUrl(variant.storage_path));
    }),
  );

  const rank = artifacts.rank ?? {};
  const researchNotes = String(artifacts.research?.researchNotes ?? '');
  const history = String(rank.eraReference ?? artifacts.draft?.trendCards[0]?.deck ?? '');
  const whyNow = String(rank.rationale ?? researchNotes);

  return (
    <div>
      <RunPoller runId={runId} active={run?.status === 'queued' || run?.status === 'running'} />
      <Link href="/" style={{ color: '#888', fontSize: 13, textDecoration: 'none' }}>
        ← dashboard
      </Link>

      <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: 32, marginTop: 22 }}>
        <div>
          <Label>run {runId.slice(0, 8)}</Label>
          <h2 style={{ fontSize: 52, lineHeight: 1, fontStyle: 'italic', margin: 0, fontFamily: 'Georgia, serif' }}>
            {artifacts.draft?.cover.headline ?? 'draft pending.'}
          </h2>
          <TextBlock>{artifacts.draft?.cover.deck ?? 'The edit step has not completed for this run.'}</TextBlock>
          {published === '1' && <p style={{ color: '#9bd8b0' }}>Published to the app feed.</p>}
        </div>

        <aside style={{ borderTop: '1px solid #333', paddingTop: 16 }}>
          <Label>readiness</Label>
          <div style={{ display: 'grid', gap: 10, color: '#aaa' }}>
            <div>Run: {run?.status ?? 'legacy'}</div>
            <div>Step: {run?.current_step ?? 'none'}</div>
            <div>QA: {artifacts.qaApproved ? 'approved' : String(artifacts.qa?.verdict ?? 'missing')}</div>
            <div>Picked: {artifacts.pickedCount}/{REQUIRED_SLOTS.length}</div>
            <div>Cost: ${artifacts.totalCost.toFixed(2)}</div>
            <div>Latest: {new Date(artifacts.latestStepAt).toLocaleString()}</div>
          </div>
          <div style={{ marginTop: 18 }}>
            <PublishPanel
              runId={runId}
              ready={artifacts.publishReady}
              qaApproved={artifacts.qaApproved}
              missingSlots={artifacts.missingSlots}
              published={published === '1'}
            />
          </div>
          {run && (
            <RunControlPanel
              runId={runId}
              status={run.status}
              currentStep={run.current_step}
              error={run.error_message}
            />
          )}
        </aside>
      </section>

      <section style={{ marginTop: 40 }}>
        <Label>step timeline</Label>
        <div style={{ display: 'grid', gap: 8 }}>
          {artifacts.steps.map((step) => (
            <div
              key={step.step}
              style={{
                display: 'grid',
                gridTemplateColumns: '120px 100px minmax(0, 1fr) 90px',
                gap: 12,
                borderTop: '1px solid #222',
                padding: '10px 0',
                color: step.status === 'failed' || step.status === 'blocked' ? '#f0c36a' : '#aaa',
                fontSize: 13,
              }}
            >
              <div>{step.step}</div>
              <div>{step.status}</div>
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{step.error ?? ''}</div>
              <div>${Number(step.estimated_cost_usd ?? 0).toFixed(3)}</div>
            </div>
          ))}
          {artifacts.steps.length === 0 && <TextBlock>Workflow has queued; first step has not started yet.</TextBlock>}
        </div>
      </section>

      {artifacts.draft && (
        <section style={{ marginTop: 48 }}>
          <Label>issue story</Label>
          <p style={{ color: '#d8d2c7', fontSize: 20, lineHeight: 1.45, maxWidth: 900 }}>
            {artifacts.draft.concept}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28, marginTop: 26 }}>
            <div>
              <Label>the return</Label>
              <TextBlock>{history || 'No era reference recorded.'}</TextBlock>
            </div>
            <div>
              <Label>why now</Label>
              <TextBlock>{whyNow || 'No ranking rationale recorded.'}</TextBlock>
            </div>
          </div>
        </section>
      )}

      {artifacts.draft && (
        <section style={{ marginTop: 48 }}>
          <Label>trend grid</Label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 22 }}>
            {artifacts.draft.trendCards.map((card) => <IssueCardPreview key={card.slug} card={card} />)}
          </div>
        </section>
      )}

      {artifacts.draft && (
        <section style={{ marginTop: 48 }}>
          <Label>curator loop</Label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 22 }}>
            {artifacts.draft.curatorRotations.map((card) => <IssueCardPreview key={card.slug} card={card} />)}
          </div>
        </section>
      )}

      <section style={{ marginTop: 56 }}>
        <Label>picked images</Label>
        <div style={{ display: 'grid', gap: 34 }}>
          {slots.map(([slot, slotVariants]) => (
            <div key={slot}>
              <h3 style={{ fontSize: 14, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1.4, marginBottom: 14 }}>
                {slot}
              </h3>
              {slotVariants.length === 0 ? (
                <div style={{ color: '#666', borderTop: '1px solid #222', paddingTop: 12 }}>No variants generated.</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 14 }}>
                  {slotVariants.map((variant) => {
                    const url = signedUrls.get(variant.id) ?? '';
                    return (
                      <form key={variant.id} action={pickVariant}>
                        <input type="hidden" name="variantId" value={variant.id} />
                        <input type="hidden" name="runId" value={runId} />
                        <input type="hidden" name="slot" value={variant.slot} />
                        <button
                          type="submit"
                          style={{
                            padding: 0,
                            background: 'transparent',
                            border: variant.picked ? '2px solid #f4f1ea' : '1px solid #222',
                            cursor: 'pointer',
                            width: '100%',
                            display: 'block',
                          }}
                        >
                          {url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={url}
                              alt={variant.alt_text ?? `${variant.slot} variant ${variant.variant_index}`}
                              style={{ width: '100%', aspectRatio: '4 / 5', objectFit: 'cover', display: 'block' }}
                            />
                          ) : (
                            <div style={{ aspectRatio: '4 / 5', background: '#151515' }} />
                          )}
                          <div
                            style={{
                              padding: '8px 10px',
                              background: variant.picked ? '#f4f1ea' : '#0a0a0a',
                              color: variant.picked ? '#0a0a0a' : '#888',
                              textAlign: 'left',
                              fontSize: 12,
                            }}
                          >
                            variant {variant.variant_index}{variant.picked ? ' · PICKED' : ''}
                          </div>
                        </button>
                      </form>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginTop: 56 }}>
        <Label>source summary</Label>
        <TextBlock>{researchNotes || 'No research notes recorded.'}</TextBlock>
      </section>

      <section style={{ marginTop: 56 }}>
        <Label>prompt text</Label>
        <PromptLines prompts={artifacts.prompts} />
      </section>
    </div>
  );
}
