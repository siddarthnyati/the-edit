import '../../src/lib/env.js';
import { createClient } from '@supabase/supabase-js';

/**
 * Classifier golden-set eval — scores /api/classify against the
 * wardrobe_basics catalog, which is a perfectly labeled image set we
 * already own (47+ product shots with known category).
 *
 * Primary metric: SLOT accuracy (top/bottom/footwear/outerwear/accessory/
 * dress) — the only axis the combo engine depends on (styleMeUp
 * PRODUCT_STRATEGY.md §9.1). Secondary: acceptable-KIND accuracy.
 * Also reports ambiguity rate, cost, and latency percentiles.
 *
 * Run (endpoint must be up — local dev server is fine):
 *   cd apps/admin && npm run dev            # terminal 1
 *   npx tsx evals/classify/run.ts --limit 6 # terminal 2 (smoke, ~$0.01)
 *   npx tsx evals/classify/run.ts           # full catalog (~$0.10)
 *
 * Env: CLASSIFY_URL (default http://localhost:3000/api/classify)
 */

const CLASSIFY_URL = process.env['CLASSIFY_URL'] ?? 'http://localhost:3000/api/classify';
const PUBLIC_BASE = `${process.env['SUPABASE_URL']}/storage/v1/object/public/wardrobe-basics`;

const limitArg = process.argv.indexOf('--limit');
const LIMIT = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : Infinity;

// Catalog category → the slot the combo engine needs (the gate axis).
const CATEGORY_TO_SLOT: Record<string, string> = {
  tee: 'top', sweater: 'top', dress: 'dress',
  jean: 'bottom', trouser: 'bottom', skirt: 'bottom',
  shoe: 'footwear', boot: 'footwear',
  jacket: 'outerwear', coat: 'outerwear',
  accessory: 'accessory',
};

// Catalog category → kinds we accept as "right enough" (§9.1: fine-grained
// kind confusion inside a slot does not change the outfit).
const CATEGORY_TO_KINDS: Record<string, string[]> = {
  tee: ['tee', 'knit'], sweater: ['knit', 'tee', 'oxford'], dress: ['dress'],
  jean: ['denim'], trouser: ['trouser', 'denim'], skirt: ['skirt'],
  shoe: ['sneaker', 'flat', 'heel'], boot: ['boot'],
  jacket: ['jacket', 'coat'], coat: ['coat', 'jacket'],
  accessory: ['bag', 'belt', 'cap'], // scarves still slot-only
};

type Row = { gender: string; category: string; slug: string; storage_path: string };
type Result = {
  slug: string; category: string;
  expectedSlot: string; gotSlot: string; slotOk: boolean;
  gotKind: string; kindOk: boolean | 'n/a';
  ambiguous: boolean; latencyMs: number; costUsd: number;
};

async function classifyImage(url: string): Promise<{ classification: Record<string, unknown>; costUsd: number; latencyMs: number }> {
  const imageResponse = await fetch(url);
  if (!imageResponse.ok) throw new Error(`image fetch ${imageResponse.status} for ${url}`);
  const buffer = Buffer.from(await imageResponse.arrayBuffer());

  const response = await fetch(CLASSIFY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64: buffer.toString('base64'), mimeType: 'image/png' }),
  });
  if (!response.ok) throw new Error(`classify ${response.status}: ${await response.text()}`);
  return response.json();
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;
}

async function main() {
  const supabase = createClient(process.env['SUPABASE_URL']!, process.env['SUPABASE_SERVICE_ROLE_KEY']!);
  const { data, error } = await supabase
    .from('wardrobe_basics')
    .select('gender, category, slug, storage_path')
    .order('category');
  if (error) throw error;

  const rows = (data as Row[]).slice(0, LIMIT);
  console.log(`\nclassifier golden-set eval — ${rows.length} labeled images → ${CLASSIFY_URL}\n`);

  const results: Result[] = [];
  for (const row of rows) {
    const expectedSlot = CATEGORY_TO_SLOT[row.category] ?? 'unknown';
    try {
      const { classification, costUsd, latencyMs } = await classifyImage(`${PUBLIC_BASE}/${row.storage_path}`);
      const gotSlot = String(classification['slot'] ?? 'unknown');
      const gotKind = String(classification['kind'] ?? 'unknown');
      const acceptableKinds = CATEGORY_TO_KINDS[row.category];
      const slotOk = gotSlot === expectedSlot;
      const kindOk: boolean | 'n/a' =
        row.category === 'accessory' ? 'n/a' : (acceptableKinds?.includes(gotKind) ?? false);
      const ambiguous = Boolean(classification['ambiguous']);
      results.push({ slug: row.slug, category: row.category, expectedSlot, gotSlot, slotOk, gotKind, kindOk, ambiguous, latencyMs, costUsd });
      const mark = slotOk ? ' ok ' : 'MISS';
      console.log(`[${mark}] ${row.slug.padEnd(32)} ${row.category.padEnd(10)} slot ${expectedSlot.padEnd(9)} → ${gotSlot.padEnd(9)} kind → ${gotKind}${ambiguous ? '  (ambiguous)' : ''}`);
    } catch (err) {
      console.log(`[ERR ] ${row.slug.padEnd(32)} ${err instanceof Error ? err.message : err}`);
    }
  }

  if (results.length === 0) {
    console.log('\nno results — is the endpoint up? (cd apps/admin && npm run dev)\n');
    process.exit(1);
  }

  const slotAccuracy = results.filter((r) => r.slotOk).length / results.length;
  const kindScored = results.filter((r) => r.kindOk !== 'n/a');
  const kindAccuracy = kindScored.length ? kindScored.filter((r) => r.kindOk === true).length / kindScored.length : 0;
  const ambiguityRate = results.filter((r) => r.ambiguous).length / results.length;
  const latencies = results.map((r) => r.latencyMs);
  const totalCost = results.reduce((sum, r) => sum + r.costUsd, 0);

  console.log(`\n— summary —`);
  console.log(`slot accuracy (the gate axis):  ${(slotAccuracy * 100).toFixed(1)}%   ← must stay ≥ 95%`);
  console.log(`acceptable-kind accuracy:       ${kindScored.length ? `${(kindAccuracy * 100).toFixed(1)}%` : 'n/a (no kind-scored rows)'}   (informational; §9.1 says slot is what matters)`);
  console.log(`ambiguity rate:                 ${(ambiguityRate * 100).toFixed(1)}%   ← ask-lane volume; watch for creep`);
  console.log(`latency p50/p95:                ${percentile(latencies, 50)}ms / ${percentile(latencies, 95)}ms`);
  console.log(`total cost:                     $${totalCost.toFixed(4)} (${results.length} images)\n`);

  // Gate: slot accuracy is the contract.
  process.exit(slotAccuracy >= 0.95 ? 0 : 1);
}

main().catch((e) => {
  console.error('[eval] fatal:', e instanceof Error ? e.message : e);
  process.exit(1);
});
