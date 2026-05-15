import '../lib/env.js';
import { GoogleGenAI } from '@google/genai';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { createClient } from '@supabase/supabase-js';

// First-fit / audience-picker hero shots — model-in-scene editorial
// portraits for the styleMeUp onboarding cover. Three plates: man,
// woman, non-binary. Mood: Zara SS24 mens desert lookbook × Toteme
// campaign film. Quiet luxury, documentary, NOT runway.
//
// Uploads to the existing public `wardrobe-basics` bucket under
// firstfit/{slug}.png. Public URL pattern:
//   https://{host}/storage/v1/object/public/wardrobe-basics/firstfit/{slug}.png
//
// Not indexed in `wardrobe_basics` table — these are app heroes, not
// product catalog rows. Storage is the single source of truth.
//
// Usage:
//   npm run firstfit                       # all three, Pro tier
//   npm run firstfit -- --slug man         # one plate only
//   npm run firstfit -- --flash            # cheaper, lower quality
//   npm run firstfit -- --local-only       # skip Supabase upload

const apiKey = process.env['GEMINI_API_KEY'];
if (!apiKey) throw new Error('GEMINI_API_KEY required');
const ai = new GoogleGenAI({ apiKey });

const supabaseUrl = process.env['SUPABASE_URL']!;
const supabaseKey = process.env['SUPABASE_SERVICE_ROLE_KEY']!;
const supabase = createClient(supabaseUrl, supabaseKey);

const args = process.argv.slice(2);
const forceFlash = args.includes('--flash');
const localOnly = args.includes('--local-only');
const slugArg = args[args.indexOf('--slug') + 1] as 'man' | 'woman' | 'non-binary' | undefined;

const PRO_MODEL = 'gemini-3-pro-image-preview';
const FLASH_MODEL = 'gemini-2.5-flash-image';
const PRO_COST = 0.10;
const FLASH_COST = 0.039;

type Tier = 'pro' | 'flash';

type HeroPlate = {
  slug: 'man' | 'woman' | 'non-binary';
  subject: string;
};

const SCENE = `
A documentary-style fashion editorial portrait. Setting: a quiet desert
location with warm terracotta-painted earthen walls and soft sand at
the subject's feet. Late golden-hour light, soft directional side-shadow,
slight haze. Captured on medium-format film, fine grain, shallow depth
of field, lens around 50mm equivalent. The subject is the only person
in frame, positioned center-frame at full body, captured from a slight
distance — not close-up. Composition leaves generous negative space
above and around the subject for typography. Tall vertical portrait
aspect (4:5 or taller). The frame is full-bleed; no border, no white
space. Muted palette: terracotta, sand, ecru, navy, oxblood, charcoal,
ivory. Mood: unhurried, quiet luxury, Zara SS24 mens lookbook, Toteme
campaign film, Document Journal cover. NOT runway, NOT high-fashion
spectacle, NOT commercial-bright, NOT studio.
`.trim();

const PLATES: HeroPlate[] = [
  {
    slug: 'man',
    subject: `A man in his late 20s to mid 30s, ethnically ambiguous warm
brown complexion, lean build, short dark hair. Wearing a loose
half-tucked ecru linen camp-collar shirt with one button open, navy
wide-leg drawstring trousers cropped at the ankle, bare feet. Walking
slowly through soft sand in mid-stride, body angled three-quarters
away from camera, gaze cast off to the side — not at the lens. Hands
empty, relaxed at his sides. Quiet, unposed.`,
  },
  {
    slug: 'woman',
    subject: `A woman in her late 20s to mid 30s, ethnically ambiguous
warm complexion, dark hair worn long and loose. Wearing a floor-length
ivory raw-silk slip dress with delicate spaghetti straps, no
accessories, bare feet. Standing still in profile against the
terracotta wall, head turned a fraction toward camera, gaze even,
expression composed. Hands empty, one resting at her side, the other
just touching the wall. Quiet, unposed.`,
  },
  {
    slug: 'non-binary',
    subject: `A non-binary person in their late 20s to mid 30s, ethnically
ambiguous complexion, cropped dark hair. Wearing oversized
charcoal-grey wool tailoring — a broad-shouldered double-breasted
blazer worn open over a plain ecru cotton tank, matching wide-leg
trousers breaking at the ankle, polished black leather oxford shoes.
Standing facing the camera in a three-quarter pose, weight on one
leg, hands in trouser pockets, expression even and direct. Quiet,
unposed.`,
  },
];

const NEGATIVE = [
  'NEVER include: brand logos, brand names, visible labels, watermarks',
  'NEVER include: AI artifacts, distorted hands, distorted faces, extra limbs',
  'NEVER include: additional people, other models, crowds, photographers',
  'NEVER include: smiling, laughing, looking directly into camera with intensity, posed catalog smiles',
  'NEVER include: HDR effects, oversaturated colors, lens flare, blur, motion-blur',
  'NEVER include: jewelry, sunglasses, hats, props, bags, luggage',
  'NEVER include: studio backdrops, white seamless paper, runway settings, fashion-show audiences',
].join('. ');

function buildPrompt(plate: HeroPlate): string {
  return [
    `A single editorial portrait photograph, hyperrealistic, suitable as the cover of a magazine issue.`,
    ``,
    `Scene: ${SCENE}`,
    ``,
    `Subject: ${plate.subject}`,
    ``,
    NEGATIVE,
    ``,
    `Output: a single still image, full-bleed portrait orientation, generous negative space, photograph-quality. Treat this as the cover plate of an issue — not an ad, not a campaign hero.`,
  ].join('\n');
}

async function generateWithFallback(plate: HeroPlate): Promise<{ bytes: Buffer; model: string; cost: number; dt: number } | null> {
  const order: Tier[] = forceFlash ? ['flash'] : ['pro', 'flash'];

  for (const tier of order) {
    const model = tier === 'pro' ? PRO_MODEL : FLASH_MODEL;
    const cost = tier === 'pro' ? PRO_COST : FLASH_COST;
    for (let attempt = 0; attempt < 3; attempt++) {
      const t0 = Date.now();
      try {
        const response = await ai.models.generateContent({ model, contents: buildPrompt(plate) });
        const part = response.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
        if (part?.inlineData?.data) {
          return { bytes: Buffer.from(part.inlineData.data, 'base64'), model, cost, dt: Date.now() - t0 };
        }
        await new Promise((r) => setTimeout(r, 2000));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const overloaded = msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('high demand');
        if (overloaded && attempt < 2) {
          const wait = Math.pow(2, attempt) * 3000;
          console.warn(`  ↻ ${plate.slug} ${tier} overloaded, retrying in ${wait}ms (attempt ${attempt + 1}/3)`);
          await new Promise((r) => setTimeout(r, wait));
          continue;
        }
        if (overloaded && tier === 'pro') {
          console.warn(`  ↳ ${plate.slug} falling back from pro → flash`);
          break;
        }
        throw e;
      }
    }
  }
  return null;
}

async function generateAndUpload(plate: HeroPlate, outputDir: string) {
  const result = await generateWithFallback(plate);
  if (!result) return { ok: false, error: 'all tiers exhausted', costUsd: 0 };
  const { bytes, model, cost: costUsd, dt } = result;
  const tier: Tier = model === PRO_MODEL ? 'pro' : 'flash';

  const localPath = join(outputDir, `${plate.slug}.png`);
  writeFileSync(localPath, bytes);

  if (localOnly) {
    console.log(`  ✓ firstfit/${plate.slug.padEnd(12)} ${tier} ${bytes.length.toString().padStart(7)}b ${dt}ms → ${localPath} (local-only)`);
    return { ok: true, costUsd, bytes: bytes.length };
  }

  const storagePath = `firstfit/${plate.slug}.png`;
  const { error: uploadError } = await supabase.storage
    .from('wardrobe-basics')
    .upload(storagePath, bytes, { contentType: 'image/png', upsert: true });

  if (uploadError) {
    console.warn(`  ✗ firstfit/${plate.slug} upload failed: ${uploadError.message}`);
    return { ok: false, error: uploadError.message, costUsd };
  }

  console.log(`  ✓ firstfit/${plate.slug.padEnd(12)} ${tier} ${bytes.length.toString().padStart(7)}b ${dt}ms → ${storagePath}`);
  return { ok: true, costUsd, bytes: bytes.length };
}

async function main() {
  const outputDir = `./basics-output/firstfit`;
  mkdirSync(outputDir, { recursive: true });

  const toRun = slugArg ? PLATES.filter((p) => p.slug === slugArg) : PLATES;
  if (toRun.length === 0) {
    console.error(`[firstfit] unknown slug: ${slugArg}`);
    process.exit(1);
  }

  console.log(`\n[firstfit] generating ${toRun.length} hero plate(s) — ${forceFlash ? 'Flash' : 'Pro (Flash fallback)'}`);
  console.log(`[firstfit] output: ${outputDir}/, supabase: ${localOnly ? 'SKIPPED' : 'wardrobe-basics bucket / firstfit/'}`);

  let totalCost = 0;
  let succeeded = 0;

  for (const plate of toRun) {
    const result = await generateAndUpload(plate, outputDir);
    if (result.ok) succeeded++;
    totalCost += result.costUsd;
    await new Promise((r) => setTimeout(r, 1500));
  }

  console.log(`\n[firstfit] DONE — ${succeeded}/${toRun.length} ok, $${totalCost.toFixed(4)} total`);
}

main().catch((e) => {
  console.error('[firstfit] fatal:', e instanceof Error ? e.message : e);
  process.exit(1);
});
