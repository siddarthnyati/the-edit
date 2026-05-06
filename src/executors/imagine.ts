import { GoogleGenAI } from '@google/genai';
import { supabase } from '../lib/supabase.js';
import { recordImagineCost, exceededImagineCap, getImagineCost, getImagineCap } from '../lib/cost.js';
import type { PromptOutput } from './prompt.js';

// Generates N variants per slot using Gemini 2.5 Flash Image (Nano Banana).
// Each variant is uploaded to Supabase Storage and a row is inserted into
// magazine_image_variants. The variant picker (Step 4) reads from that
// table; the publisher (Step 5) reads picked rows to build asset_paths.

const VARIANTS_PER_SLOT = parseInt(process.env['MAGAZINE_VARIANTS_PER_SLOT'] ?? '4', 10);
const COST_PER_IMAGE_USD = 0.039;
const MODEL = 'gemini-2.5-flash-image';
const BUCKET = 'magazine-assets';

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

async function generateOne(prompt: string): Promise<Buffer> {
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
  });

  const parts = response.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    const inlineData = part.inlineData;
    if (inlineData?.data) {
      return Buffer.from(inlineData.data, 'base64');
    }
  }

  throw new Error(`Gemini returned no image data for prompt: ${prompt.slice(0, 80)}…`);
}

async function uploadVariant(runId: string, slot: string, idx: number, bytes: Buffer): Promise<string> {
  const path = `${runId}/${slot}/${idx}.png`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType: 'image/png',
    upsert: true,
  });
  if (error) throw new Error(`Storage upload failed for ${path}: ${error.message}`);
  return path;
}

async function recordVariant(args: {
  runId: string;
  slot: string;
  idx: number;
  storagePath: string;
  prompt: string;
  altText: string;
}): Promise<void> {
  const { error } = await supabase.from('magazine_image_variants').upsert(
    {
      run_id: args.runId,
      slot: args.slot,
      variant_index: args.idx,
      storage_path: args.storagePath,
      prompt: args.prompt,
      alt_text: args.altText,
      generation_model: MODEL,
      estimated_cost_usd: COST_PER_IMAGE_USD,
    },
    { onConflict: 'run_id,slot,variant_index' },
  );
  if (error) throw new Error(`Variant row insert failed: ${error.message}`);
}

export async function runImagine(input: ImagineInput): Promise<ImagineOutput> {
  const jobs = buildSlotJobs(input.prompts);
  const totalImages = jobs.length * VARIANTS_PER_SLOT;
  const expectedCost = totalImages * COST_PER_IMAGE_USD;

  console.log(
    `[imagine] generating ${jobs.length} slots × ${VARIANTS_PER_SLOT} variants = ` +
    `${totalImages} images (~$${expectedCost.toFixed(2)})`,
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

    console.log(`[imagine] slot '${job.slot}'…`);

    // Generate variants for this slot in parallel — Gemini handles concurrent
    // requests fine and this is the largest practical speedup.
    const variantPromises = Array.from({ length: VARIANTS_PER_SLOT }, async (_, idx) => {
      const bytes = await generateOne(job.prompt);
      const storagePath = await uploadVariant(input.runId, job.slot, idx, bytes);
      await recordVariant({
        runId: input.runId,
        slot: job.slot,
        idx,
        storagePath,
        prompt: job.prompt,
        altText: job.altText,
      });
      return idx;
    });

    const completed = await Promise.allSettled(variantPromises);
    const succeeded = completed.filter((r) => r.status === 'fulfilled').length;
    const failed = completed.length - succeeded;

    actualCost += succeeded * COST_PER_IMAGE_USD;
    recordImagineCost(succeeded * COST_PER_IMAGE_USD);

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
