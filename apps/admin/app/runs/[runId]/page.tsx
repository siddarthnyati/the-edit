import { supabaseAdmin } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

type Variant = {
  id: number;
  run_id: string;
  slot: string;
  variant_index: number;
  storage_path: string;
  picked: boolean;
  prompt: string;
  alt_text: string | null;
};

async function loadVariants(runId: string): Promise<Variant[]> {
  const { data, error } = await supabaseAdmin
    .from('magazine_image_variants')
    .select('id, run_id, slot, variant_index, storage_path, picked, prompt, alt_text')
    .eq('run_id', runId)
    .order('slot', { ascending: true })
    .order('variant_index', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Variant[];
}

async function signedUrl(path: string): Promise<string> {
  const { data, error } = await supabaseAdmin.storage
    .from('magazine-assets')
    .createSignedUrl(path, 3600);
  if (error) return '';
  return data.signedUrl;
}

async function pickVariant(formData: FormData) {
  'use server';
  const variantId = parseInt(formData.get('variantId') as string, 10);
  const runId = formData.get('runId') as string;
  const slot = formData.get('slot') as string;

  // Clear previous picks on this slot, then set the new one
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
}

export default async function PickerPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const variants = await loadVariants(runId);

  // Group by slot, with signed URLs
  const slotMap = new Map<string, Variant[]>();
  for (const v of variants) {
    const list = slotMap.get(v.slot) ?? [];
    list.push(v);
    slotMap.set(v.slot, list);
  }

  const slots = Array.from(slotMap.entries());
  const urlsBySlotVariant = new Map<string, string>();
  await Promise.all(
    variants.map(async (v) => {
      const url = await signedUrl(v.storage_path);
      urlsBySlotVariant.set(`${v.slot}/${v.variant_index}`, url);
    }),
  );

  if (variants.length === 0) {
    return (
      <div>
        <Link href="/" style={{ color: '#888', fontSize: 13 }}>
          ← all runs
        </Link>
        <h2 style={{ marginTop: 24 }}>No variants for this run.</h2>
        <p style={{ color: '#888' }}>
          Run <code>npm run imagine -- {runId}</code> in the-edit repo to generate them.
        </p>
      </div>
    );
  }

  return (
    <div>
      <Link href="/" style={{ color: '#888', fontSize: 13, textDecoration: 'none' }}>
        ← all runs
      </Link>

      <h2 style={{ fontSize: 28, fontStyle: 'italic', margin: '16px 0 8px', fontFamily: 'Georgia, serif' }}>
        {runId.slice(0, 8)}…
      </h2>
      <p style={{ color: '#888', marginBottom: 32 }}>
        {slots.length} slots · {variants.length} variants · {variants.filter((v) => v.picked).length} picked
      </p>

      {slots.map(([slot, slotVariants]) => (
        <section key={slot} style={{ marginBottom: 48 }}>
          <h3
            style={{
              fontSize: 14,
              textTransform: 'uppercase',
              letterSpacing: 1.5,
              color: '#aaa',
              marginBottom: 16,
            }}
          >
            {slot}
          </h3>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: 16,
            }}
          >
            {slotVariants.map((v) => {
              const url = urlsBySlotVariant.get(`${v.slot}/${v.variant_index}`) ?? '';
              const isPicked = v.picked;
              return (
                <form key={v.id} action={pickVariant}>
                  <input type="hidden" name="variantId" value={v.id} />
                  <input type="hidden" name="runId" value={runId} />
                  <input type="hidden" name="slot" value={v.slot} />
                  <button
                    type="submit"
                    style={{
                      padding: 0,
                      background: 'transparent',
                      border: isPicked ? '2px solid #f4f1ea' : '2px solid #1a1a1a',
                      cursor: 'pointer',
                      width: '100%',
                      display: 'block',
                      transition: 'border-color 0.15s',
                    }}
                  >
                    {url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={url}
                        alt={v.alt_text ?? `${v.slot} variant ${v.variant_index}`}
                        style={{ width: '100%', display: 'block' }}
                      />
                    ) : (
                      <div style={{ aspectRatio: '4/5', background: '#222', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>
                        no preview
                      </div>
                    )}
                    <div
                      style={{
                        padding: '8px 12px',
                        background: isPicked ? '#f4f1ea' : '#0a0a0a',
                        color: isPicked ? '#0a0a0a' : '#888',
                        fontSize: 12,
                        textAlign: 'left',
                      }}
                    >
                      variant {v.variant_index} {isPicked && '· PICKED'}
                    </div>
                  </button>
                </form>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
