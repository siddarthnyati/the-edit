import { GoogleGenAI } from '@google/genai';
import { supabase } from '../lib/supabase.js';
import { recordImagineCost, exceededImagineCap, getImagineCost, getImagineCap } from '../lib/cost.js';
import type { PromptOutput } from './prompt.js';

// Generates N variants per slot using Gemini 2.5 Flash Image (Nano Banana).
// Each variant is uploaded to Supabase Storage and a row is inserted into
// magazine_image_variants. The variant picker (Step 4) reads from that
// table; the publisher (Step 5) reads picked rows to build asset_paths.

const VARIANTS_PER_SLOT = parseInt(process.env['MAGAZINE_VARIANTS_PER_SLOT'] ?? '4', 10);
const BUCKET = 'magazine-assets';

// Per-slot model routing. Cover slots use the highest-quality model
// (Nano Banana Pro). Trend / curator cards use the cheaper standard
// model. Cost difference is small (~$0.50/run) for materially better
// covers.
const MODEL_BY_SLOT_PREFIX: Array<{ prefix: string; model: string; cost: number }> = [
  { prefix: 'cover-', model: 'gemini-3-pro-image-preview', cost: 0.10 }, // Nano Banana Pro
  { prefix: 'trend-', model: 'gemini-2.5-flash-image', cost: 0.039 },
  { prefix: 'curator-', model: 'gemini-2.5-flash-image', cost: 0.039 },
];

function modelForSlot(slot: string): { model: string; cost: number } {
  const match = MODEL_BY_SLOT_PREFIX.find((m) => slot.startsWith(m.prefix));
  return match ?? { model: 'gemini-2.5-flash-image', cost: 0.039 };
}

// Variant strategy: most variants are GARMENT-ONLY editorial detail shots
// (the brand default — void background, no human, focus on textile and cut).
// The LAST variant in each slot is a model wearing the garment for context.
// This gives the picker 3 product shots + 1 lifestyle shot per slot.
const VARIANT_ANGLES_GARMENT_ONLY = [
  'front view, garment on invisible mannequin, no human visible',
  'three-quarter view from the right, garment on invisible mannequin',
  'profile view from the left, garment on invisible mannequin',
];

// The single model variant per slot uses one demographic from this list.
// Demographic rotates across SLOTS (not variants within a slot) so that
// each issue shows representation breadth across the cover + cards.
// Pick by slot index — see modelDemographicForSlotIndex() below.
const SLOT_MODEL_DEMOGRAPHICS = [
  'Black model, mid-20s, athletic build, walking',
  'White model, late-20s, slim build, walking',
  'East Asian model, early-30s, average build, walking',
  'Latina model, mid-30s, curvy build, walking',
  'Middle Eastern model, late-20s, tall, walking',
  'South Asian model, mid-30s, average build, walking',
];

function modelDemographicForSlotIndex(slotIdx: number): string {
  return SLOT_MODEL_DEMOGRAPHICS[slotIdx % SLOT_MODEL_DEMOGRAPHICS.length]!;
}

// Per-slot aspect ratio. Cover and rotations are 4:5 portrait (mobile
// feed); trend cards are 1:1 square (grid layout).
function aspectRatioForSlot(slot: string): string {
  if (slot.startsWith('cover-')) return '4:5 portrait';
  if (slot.startsWith('trend-')) return '1:1 square';
  return '4:5 portrait';
}

// Negative prompt applied to every generation as a global enforcement
// layer. Catches things the prompt executor might let through.
const NEGATIVE_PROMPT_RULES =
  'NEVER include: brand logos, brand names, branded waistbands, anatomical close-ups (groin/chest/hip-only crops), flat-lay or top-down composition, decorative props, stock photography aesthetics.';

const apiKey = process.env['GEMINI_API_KEY'];
if (!apiKey) {
  throw new Error(
    'GEMINI_API_KEY is required for the imagine executor. Add it to .env.\n' +
    'Get one at https://aistudio.google.com/apikey',
  );
}

const ai = new GoogleGenAI({ apiKey });

export type ImagineInput = {
  runId: string;
  prompts: PromptOutput;
};

export type ImagineOutput = {
  totalVariants: number;
  totalCostUsd: number;
  slotsGenerated: string[];
};

type SlotJob = {
  slot: string;
  prompt: string;
  altText: string;
};

function buildSlotJobs(prompts: PromptOutput): SlotJob[] {
  const jobs: SlotJob[] = [
    { slot: 'cover-start', prompt: prompts.coverStart.prompt, altText: prompts.coverStart.altText },
    { slot: 'cover-end', prompt: prompts.coverEnd.prompt, altText: prompts.coverEnd.altText },
  ];

  prompts.trendCardPrompts.forEach((p, i) => {
    jobs.push({ slot: `trend-${i + 1}`, prompt: p.prompt, altText: p.altText });
  });

  prompts.curatorCardPrompts.forEach((p, i) => {
    jobs.push({ slot: `curator-${i + 1}`, prompt: p.prompt, altText: p.altText });
  });

  return jobs;
}

function buildVariantPrompt(args: {
  basePrompt: string;
  slot: string;
  slotIdx: number;
  variantIdx: number;
  variantsPerSlot: number;
}): string {
  const isModelShot = args.variantIdx === args.variantsPerSlot - 1; // last variant is model shot
  const aspect = aspectRatioForSlot(args.slot);

  if (isModelShot) {
    const demo = modelDemographicForSlotIndex(args.slotIdx);
    return [
      args.basePrompt,
      '',
      `LIFESTYLE / CONTEXT SHOT (1 of ${args.variantsPerSlot}):`,
      `Composition: editorial Zara-style — ${demo} wearing the garment, three-quarter walking pose, void or minimalist studio background.`,
      'The garment is still the subject; the model adds context.',
      `Aspect ratio: ${aspect}.`,
      '',
      NEGATIVE_PROMPT_RULES,
    ].join('\n');
  }

  // Default: garment-only editorial detail shot, no humans
  const angle = VARIANT_ANGLES_GARMENT_ONLY[args.variantIdx % VARIANT_ANGLES_GARMENT_ONLY.length];
  return [
    args.basePrompt,
    '',
    `PRODUCT SHOT (${args.variantIdx + 1} of ${args.variantsPerSlot - 1} garment-only variants):`,
    `Composition: ${angle}. No human, no model, no hands, no skin in frame.`,
    `Aspect ratio: ${aspect}.`,
    '',
    NEGATIVE_PROMPT_RULES,
  ].join('\n');
}

async function generateOne(prompt: string, model: string): Promise<Buffer> {
  const response = await ai.models.generateContent({
    model,
    contents: prompt,
  });

  const parts = response.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    const inlineData = part.inlineData;
    if (inlineData?.data) {
      const bytes = Buffer.from(inlineData.data, 'base64');
      if (bytes.length < 5000) {
        // Suspiciously small — Gemini sometimes returns near-empty
        // results on quality fail. Caller should retry.
        throw new Error(`Suspect output: only ${bytes.length} bytes`);
      }
      return bytes;
    }
  }

  throw new Error(`Gemini returned no image data for prompt: ${prompt.slice(0, 80)}…`);
}

async function generateWithRetry(prompt: string, model: string): Promise<Buffer> {
  try {
    return await generateOne(prompt, model);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[imagine]   first generation failed (${msg.slice(0, 80)}), retrying once`);
    // Single retry with a slightly rephrased prompt asking for cleaner output
    return await generateOne(`${prompt}\n\nIf the previous render had artifacts, regenerate with cleaner studio lighting and sharper focus.`, model);
  }
}

async function uploadVariant(runId: string, slot: string, idx: number, bytes: Buffer): Promise<string> {
  const path = `${runId}/${slot}/${idx}.png`;
  const delays = [1000, 4000, 16000]; // exponential backoff in ms

  let lastError: string | null = null;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
        contentType: 'image/png',
        upsert: true,
      });
      if (!error) return path;
      lastError = error.message;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }

    if (attempt < delays.length) {
      console.warn(`[imagine]   upload retry ${attempt + 1}/${delays.length} for ${slot}/${idx} after ${delays[attempt]}ms (${lastError})`);
      await new Promise((r) => setTimeout(r, delays[attempt]!));
    }
  }

  throw new Error(`Storage upload failed for ${path} after ${delays.length + 1} attempts: ${lastError}`);
}

async function recordVariant(args: {
  runId: string;
  slot: string;
  idx: number;
  storagePath: string;
  prompt: string;
  altText: string;
  model: string;
  cost: number;
}): Promise<void> {
  const { error } = await supabase.from('magazine_image_variants').upsert(
    {
      run_id: args.runId,
      slot: args.slot,
      variant_index: args.idx,
      storage_path: args.storagePath,
      prompt: args.prompt,
      alt_text: args.altText,
      generation_model: args.model,
      estimated_cost_usd: args.cost,
    },
    { onConflict: 'run_id,slot,variant_index' },
  );
  if (error) throw new Error(`Variant row insert failed: ${error.message}`);
}

export async function runImagine(input: ImagineInput): Promise<ImagineOutput> {
  const jobs = buildSlotJobs(input.prompts);
  const expectedCost = jobs.reduce((sum, job) => {
    return sum + (modelForSlot(job.slot).cost * VARIANTS_PER_SLOT);
  }, 0);

  console.log(
    `[imagine] generating ${jobs.length} slots × ${VARIANTS_PER_SLOT} variants = ` +
    `${jobs.length * VARIANTS_PER_SLOT} images (~$${expectedCost.toFixed(2)})`,
  );

  let actualCost = 0;
  const slotsGenerated: string[] = [];

  for (let slotIdx = 0; slotIdx < jobs.length; slotIdx++) {
    const job = jobs[slotIdx]!;
    if (exceededImagineCap()) {
      console.warn(
        `[imagine] CAP EXCEEDED ($${getImagineCost().toFixed(4)} > $${getImagineCap().toFixed(2)}). ` +
        `Stopping with ${slotsGenerated.length}/${jobs.length} slots done. ` +
        `Variants for completed slots are in the DB; re-run later or pick from what exists.`,
      );
      break;
    }

    const { model, cost: perImageCost } = modelForSlot(job.slot);
    const modelDemo = modelDemographicForSlotIndex(slotIdx).split(',')[0]; // just the demographic name for log
    console.log(`[imagine] slot '${job.slot}' (${model}, $${perImageCost.toFixed(3)} ea, ${VARIANTS_PER_SLOT - 1} product + 1 with ${modelDemo})…`);

    // Generate variants for this slot in parallel. The first N-1 variants
    // are garment-only editorial product shots at varying angles. The Nth
    // variant is a Zara-style lifestyle shot with a model — demographic
    // rotates per slot so each issue shows representation breadth.
    const variantPromises = Array.from({ length: VARIANTS_PER_SLOT }, async (_, idx) => {
      const finalPrompt = buildVariantPrompt({
        basePrompt: job.prompt,
        slot: job.slot,
        slotIdx,
        variantIdx: idx,
        variantsPerSlot: VARIANTS_PER_SLOT,
      });
      const bytes = await generateWithRetry(finalPrompt, model);
      const storagePath = await uploadVariant(input.runId, job.slot, idx, bytes);
      await recordVariant({
        runId: input.runId,
        slot: job.slot,
        idx,
        storagePath,
        prompt: finalPrompt,
        altText: job.altText,
        model,
        cost: perImageCost,
      });
      return idx;
    });

    const completed = await Promise.allSettled(variantPromises);
    const succeeded = completed.filter((r) => r.status === 'fulfilled').length;
    const failed = completed.length - succeeded;

    actualCost += succeeded * perImageCost;
    recordImagineCost(succeeded * perImageCost);

    slotsGenerated.push(job.slot);

    if (failed > 0) {
      const firstError = completed.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
      console.warn(`[imagine]   ${succeeded}/${completed.length} succeeded · ${failed} failed (${firstError?.reason})`);
    } else {
      console.log(`[imagine]   ${succeeded}/${completed.length} ok`);
    }
  }

  console.log(
    `[imagine] done — ${slotsGenerated.length} slots × up to ${VARIANTS_PER_SLOT} variants generated. ` +
    `Cost ~$${actualCost.toFixed(4)}.`,
  );

  return {
    totalVariants: slotsGenerated.length * VARIANTS_PER_SLOT,
    totalCostUsd: actualCost,
    slotsGenerated,
  };
}
