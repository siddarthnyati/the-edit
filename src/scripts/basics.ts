import '../lib/env.js';
import { GoogleGenAI } from '@google/genai';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

// Wardrobe-basics image generator.
// Different from the Magazine pipeline: these are SSENSE-style product
// shots of staples, not editorial trend imagery. Same Gemini API, but
// a totally different prompt template optimized for product fidelity
// not editorial flair.
//
// Usage:
//   npm run basics                          # generate the 5-item smoke test
//   npm run basics -- --item white-tee      # one specific item
//   npm run basics -- --all                 # generate everything in the catalog
//
// Outputs land in ./basics-output/ for local inspection. Once we're happy,
// upload to Supabase Storage under magazine-assets/basics/{slug}.png.

const apiKey = process.env['GEMINI_API_KEY'];
if (!apiKey) throw new Error('GEMINI_API_KEY required');
const ai = new GoogleGenAI({ apiKey });

// Use Nano Banana Pro for higher fidelity on product shots. Cost is
// ~$0.10/image vs $0.039 for Flash, but quality difference is huge.
const MODEL = 'gemini-3-pro-image-preview';

type BasicItem = {
  slug: string;
  category: 'tee' | 'jean' | 'shoe' | 'boot' | 'jacket' | 'accessory';
  name: string;
  // The garment description — fabric, weight, cut, color, hardware.
  // Write like an SSENSE product page would, not like a fashion editorial.
  garment: string;
  // Per-category photography spec. Different garments need different
  // photo conventions to look real.
  photography: string;
};

// Photography templates by category — derived from how SSENSE / Mr Porter
// / Acne Studios actually shoot each kind of product. The big insight:
// "garment on void" is a category-specific photo style, not a generic one.
const PHOTOGRAPHY_BY_CATEGORY: Record<BasicItem['category'], string> = {
  tee: 'Front-facing on an invisible mannequin. Shoulders square, slight drape under chest. Subtle ground shadow. 4:5 portrait. Clean white seamless studio backdrop, soft three-point lighting from upper left. SSENSE / Mr Porter product photography style — hyperrealistic, no model, no human, no hands.',
  jean: 'Front view, garment laid against a flat vertical surface OR styled on an invisible lower mannequin showing the natural drape. Both legs visible, full length, hem at frame bottom. Soft ground shadow. Pockets, stitching, and waistband visibly detailed. Clean light grey seamless studio backdrop, soft directional lighting from upper right. SSENSE product photography style.',
  shoe: 'Single shoe, lateral side profile view (the editorial standard for footwear). Photographed on a clean cream seamless ground plane with soft contact shadow. Three-quarter angle slightly visible. Acne Studios / Mr Porter shoe-photography style. Hyperrealistic. Hardware (eyelets, laces, soles) clearly defined.',
  boot: 'Single boot, lateral side profile view. Pull tab visible. Photographed on a clean cream seamless ground plane with soft contact shadow at the sole. Acne Studios footwear product photography style. Hyperrealistic detail on the leather grain, stitching, and sole construction.',
  jacket: 'Front view on an invisible mannequin with shoulders defined, lapels or collar shown in 3D depth. Subtle ground shadow. Buttons or hardware visible. Clean white seamless studio backdrop, three-point lighting. Mr Porter / SSENSE outerwear photography style.',
  accessory: 'Single object, top-down OR three-quarter view depending on form. Clean cream seamless backdrop, soft contact shadow. Detail on hardware, stitching, material grain. Acne Studios accessory photography style.',
};

// The catalog. Start tight — 5 items for the smoke test. Add more after
// we verify quality.
const CATALOG: BasicItem[] = [
  {
    slug: 'white-tee',
    category: 'tee',
    name: 'White Tee',
    garment:
      'Classic crew-neck t-shirt in heavyweight (200gsm) cotton jersey, optical white. Mid-weight knit with subtle texture, ribbed crew collar, set-in sleeves at the shoulder line, straight hem. Unbranded, no logo, no graphics. Slightly relaxed fit through the body. Sleeves end mid-bicep.',
    photography: PHOTOGRAPHY_BY_CATEGORY.tee,
  },
  {
    slug: 'black-tee',
    category: 'tee',
    name: 'Black Tee',
    garment:
      'Same as the white tee in jet black — heavyweight (200gsm) cotton jersey, crew neck, ribbed collar, set-in sleeves, straight hem. Unbranded, no logo. Slightly relaxed fit. The black should read true black, not faded grey-black.',
    photography: PHOTOGRAPHY_BY_CATEGORY.tee,
  },
  {
    slug: 'raw-indigo-jean',
    category: 'jean',
    name: 'Raw Indigo Jean',
    garment:
      'Five-pocket straight-leg jean in 14oz raw selvedge denim, dark indigo. Mid-rise waistband, copper rivets at stress points, button fly, classic arcuate stitching on the back pockets (kept minimal, no large branded stitching). Hem unfinished and slightly slubbed. Standard 32-inch inseam.',
    photography: PHOTOGRAPHY_BY_CATEGORY.jean,
  },
  {
    slug: 'white-low-sneaker',
    category: 'shoe',
    name: 'White Low Sneaker',
    garment:
      'Minimal low-top leather sneaker in clean optical white. Full-grain calfskin upper, six-eyelet lacing in flat white laces, rubber cup sole in cream, tonal stitching, no visible branding. Slim silhouette, square-ish toe. Common Projects / Maison Margiela aesthetic — quiet, considered.',
    photography: PHOTOGRAPHY_BY_CATEGORY.shoe,
  },
  {
    slug: 'black-chelsea-boot',
    category: 'boot',
    name: 'Black Chelsea Boot',
    garment:
      'Classic chelsea boot in polished black calfskin leather. Elasticated side panels, leather pull tab at heel, almond toe, leather sole with subtle stacked heel. No visible branding. Saint Laurent / Common Projects silhouette — sharp, minimal.',
    photography: PHOTOGRAPHY_BY_CATEGORY.boot,
  },
];

const NEGATIVE = [
  'NEVER include: brand logos, brand names, visible labels, watermarks, AI artifacts',
  'NEVER include: humans, faces, hands, skin, body parts',
  'NEVER include: cluttered backgrounds, props, additional garments, decorative elements',
  'NEVER include: flat-lay from-above arrangements, top-down compositions',
  'NEVER include: oversaturated colors, HDR effects, blur, lens flare',
  'NEVER include: incorrect anatomical drape (jeans must hang naturally, shoes must sit on the ground plane)',
].join('. ');

function buildPrompt(item: BasicItem): string {
  return [
    `Product photograph of a single garment, isolated, hyperrealistic.`,
    ``,
    `Garment: ${item.garment}`,
    ``,
    `Photography: ${item.photography}`,
    ``,
    NEGATIVE,
    ``,
    `Output: a single still product image suitable for a luxury e-commerce site (SSENSE, Mr Porter, Acne Studios). Resolution and detail comparable to a real product photograph.`,
  ].join('\n');
}

async function generateBasic(item: BasicItem, outputDir: string): Promise<{ ok: boolean; bytes?: number; cost?: number; error?: string }> {
  const prompt = buildPrompt(item);
  const t0 = Date.now();

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
    });

    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const imagePart = parts.find((p) => p.inlineData?.data);
    if (!imagePart?.inlineData?.data) {
      return { ok: false, error: 'no image data returned' };
    }

    const bytes = Buffer.from(imagePart.inlineData.data, 'base64');
    const path = join(outputDir, `${item.slug}.png`);
    writeFileSync(path, bytes);

    const dt = Date.now() - t0;
    console.log(`  ✓ ${item.slug.padEnd(24)} ${bytes.length.toString().padStart(7)}b  ${dt}ms  → ${path}`);

    return { ok: true, bytes: bytes.length };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`  ✗ ${item.slug}: ${msg.slice(0, 100)}`);
    return { ok: false, error: msg };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const itemArg = args.find((a, i) => args[i - 1] === '--item');
  const all = args.includes('--all');

  let items: BasicItem[];
  if (itemArg) {
    const found = CATALOG.find((c) => c.slug === itemArg);
    if (!found) {
      console.error(`Unknown item: ${itemArg}. Available:`);
      CATALOG.forEach((c) => console.error(`  - ${c.slug}`));
      process.exit(1);
    }
    items = [found];
  } else if (all) {
    items = CATALOG;
  } else {
    // Default: the 5-item smoke test
    items = CATALOG;
  }

  const outputDir = './basics-output';
  mkdirSync(outputDir, { recursive: true });

  console.log(`[basics] generating ${items.length} item(s) with ${MODEL}`);
  console.log(`[basics] output: ${outputDir}/`);
  console.log();

  let succeeded = 0;
  let failed = 0;

  // Sequential, not parallel — respects free-tier rate limits (10 RPM)
  for (const item of items) {
    const result = await generateBasic(item, outputDir);
    if (result.ok) succeeded++;
    else failed++;
    // Small delay between calls to stay well under rate limits
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log();
  console.log(`[basics] done — ${succeeded}/${items.length} succeeded${failed > 0 ? `, ${failed} failed` : ''}`);
  console.log(`[basics] inspect with: open ${outputDir}`);
}

main().catch((e) => {
  console.error('[basics] fatal:', e instanceof Error ? e.message : e);
  process.exit(1);
});
