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

// Per-variant angle injection — each of the 4 variants gets a different
// camera angle so the picker has meaningful choices instead of 4 near-
// identical front-facing shots.
const VARIANT_ANGLES = [
  'front view, model facing camera straight on',
  'three-quarter view, model angled 30° to the right',
  'profile view from the left side, model walking',
  'back view, model walking away from camera with subtle head turn',
];

// Demographic rotation across variants. Explicit and named — generic
// "diverse models" prompts default to white-thin without naming
// alternatives. Each variant gets a different demographic so the
// picker shows representation breadth automatically.
const VARIANT_DEMOGRAPHICS = [
  'Black model, mid-20s, athletic build',
  'White model, late-20s, slim build',
  'East Asian model, early-30s, average build',
  'Latina model, mid-30s, curvy build',
];

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
  variantIdx: number;
}): string {
  const angle = VARIANT_ANGLES[args.variantIdx % VARIANT_ANGLES.length];
  const demo = VARIANT_DEMOGRAPHICS[args.variantIdx % VARIANT_DEMOGRAPHICS.length];
  const aspect = aspectRatioForSlot(args.slot);

  return [
    args.basePrompt,
    '',
    `Camera and composition: ${angle}.`,
    `Model: ${demo}. The garment is the subject; the model is the canvas.`,
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

  for (const job of jobs) {
    if (exceededImagineCap()) {
      console.warn(
        `[imagine] CAP EXCEEDED ($${getImagineCost().toFixed(4)} > $${getImagineCap().toFixed(2)}). ` +
        `Stopping with ${slotsGenerated.length}/${jobs.length} slots done. ` +
        `Variants for completed slots are in the DB; re-run later or pick from what exists.`,
      );
      break;
    }

    const { model, cost: perImageCost } = modelForSlot(job.slot);
    console.log(`[imagine] slot '${job.slot}' (${model}, $${perImageCost.toFixed(3)} ea)…`);

    // Generate variants for this slot in parallel. Each variant gets a
    // different camera angle and demographic so the picker has meaningful
    // choices instead of 4 near-identical shots.
    const variantPromises = Array.from({ length: VARIANTS_PER_SLOT }, async (_, idx) => {
      const finalPrompt = buildVariantPrompt({
        basePrompt: job.prompt,
        slot: job.slot,
        variantIdx: idx,
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
