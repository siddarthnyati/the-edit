import { NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';
import { getSupabaseAdmin } from '@/lib/supabase';

// Public, app-facing garment classifier (CAMERA_BUILD_PLAN.md Phase B).
// The styleMeUp app POSTs a captured photo; we return a structured
// classification into the 16-kind taxonomy plus an honest ambiguity signal,
// so the app's deterministic gate can decide whether to trust it or ask the
// user. The model classifies INTO the taxonomy only — it cannot invent a
// kind, and says "unknown" when nothing fits.
//
// NOTE: keep KINDS in sync with styleMeUp components/GarmentTile GARMENT_KINDS.

export const dynamic = 'force-dynamic';

const KINDS = [
  'tee', 'oxford', 'knit', 'dress', 'denim', 'trouser', 'shorts', 'skirt',
  'jacket', 'coat', 'sneaker', 'boot', 'heel', 'flat', 'bag', 'belt', 'cap',
] as const;

// Slot is derived deterministically from kind — the combo engine only needs
// slot-level accuracy (PRODUCT_STRATEGY.md §9.1), and a fixed map is more
// reliable than asking the model. 'dress' fills the top+bottom slot at once.
const KIND_TO_SLOT: Record<(typeof KINDS)[number], string> = {
  tee: 'top', oxford: 'top', knit: 'top',
  dress: 'dress',
  denim: 'bottom', trouser: 'bottom', shorts: 'bottom', skirt: 'bottom',
  jacket: 'outerwear', coat: 'outerwear',
  sneaker: 'footwear', boot: 'footwear', heel: 'footwear', flat: 'footwear',
  bag: 'accessory', belt: 'accessory', cap: 'accessory',
};

// gemini-2.5-flash was retired for new API users (404 caught by
// evals/classify on 2026-06-20); 3.6-flash is the current flash tier.
const MODEL = 'gemini-3.6-flash';
// Rough flash-tier rates ($/token); telemetry estimate, not billing truth.
const INPUT_RATE = 0.30 / 1_000_000;
const OUTPUT_RATE = 2.5 / 1_000_000;

function publicHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: publicHeaders() });
}

const PROMPT = [
  'You are a careful wardrobe cataloguer. Classify the single garment in this photo.',
  '',
  `Choose "kind" from exactly this list: ${KINDS.join(', ')}.`,
  'If the item does not clearly fit any of those, set kind to "unknown" — never invent a kind.',
  'If two kinds are both plausible, put your second choice in "alternativeKind" (else "none").',
  'Set "ambiguous" to true when you are genuinely unsure (bad angle, occluded, between two kinds).',
  'Set "isGarment" to false if the photo is not a single wearable item (a room, a person, food, multiple items).',
  '',
  'colorName: the dominant colour in plain words (e.g. "charcoal", "optic white", "washed indigo").',
  'material: best guess at fabric (e.g. "cotton jersey", "raw denim", "wool"). Say "unsure" if unclear.',
  '',
  'Also describe the garment FOR COMBINING into outfits:',
  'formality: integer 1-5 (1 = gym/loungewear, 3 = smart casual, 5 = formal/black-tie).',
  'pattern: "solid" (no pattern), "subtle" (small/quiet pattern), or "bold" (loud/large pattern).',
  'season: "all-season", "warm" (lightweight/summer), or "cold" (heavy/winter).',
  '',
  'detail: one quiet lowercase phrase a luxury catalogue would use — two short clauses, period-separated,',
  '  no marketing adjectives, no exclamation (e.g. "dense cotton. clean neck.").',
  'reason: one short sentence on why it is unknown/ambiguous, or "" if confident.',
].join('\n');

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    isGarment: { type: Type.BOOLEAN },
    kind: { type: Type.STRING, enum: [...KINDS, 'unknown'] },
    alternativeKind: { type: Type.STRING, enum: [...KINDS, 'unknown', 'none'] },
    ambiguous: { type: Type.BOOLEAN },
    colorName: { type: Type.STRING },
    material: { type: Type.STRING },
    formality: { type: Type.INTEGER },
    pattern: { type: Type.STRING, enum: ['solid', 'subtle', 'bold'] },
    season: { type: Type.STRING, enum: ['all-season', 'warm', 'cold'] },
    detail: { type: Type.STRING },
    reason: { type: Type.STRING },
  },
  required: [
    'isGarment', 'kind', 'alternativeKind', 'ambiguous',
    'colorName', 'material', 'formality', 'pattern', 'season', 'detail', 'reason',
  ],
};

export async function POST(request: Request) {
  const t0 = Date.now();

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY not set' }, { status: 500, headers: publicHeaders() });
  }

  let body: { imageBase64?: string; mimeType?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: publicHeaders() });
  }

  const imageBase64 = body.imageBase64?.replace(/^data:[^,]+,/, '');
  const mimeType = body.mimeType ?? 'image/jpeg';
  if (!imageBase64) {
    return NextResponse.json({ error: 'imageBase64 required' }, { status: 400, headers: publicHeaders() });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType, data: imageBase64 } },
            { text: PROMPT },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0,
      },
    });

    const text = response.text;
    if (!text) {
      return NextResponse.json({ error: 'Empty model response' }, { status: 502, headers: publicHeaders() });
    }

    const raw = JSON.parse(text) as Record<string, unknown>;
    // Normalize the 'none' sentinel back to null for the app's gate.
    const alternativeKind =
      raw.alternativeKind === 'none' || raw.alternativeKind === raw.kind ? null : raw.alternativeKind;
    // Derive slot deterministically from kind (the gate accuracy axis, §9.1).
    const kind = raw.kind as string;
    const slot = KIND_TO_SLOT[kind as keyof typeof KIND_TO_SLOT] ?? 'unknown';

    const classification = { ...raw, alternativeKind, slot };

    const usage = response.usageMetadata;
    const promptTokens = usage?.promptTokenCount ?? 0;
    const outputTokens = usage?.candidatesTokenCount ?? 0;
    const costUsd = promptTokens * INPUT_RATE + outputTokens * OUTPUT_RATE;
    const latencyMs = Date.now() - t0;

    // Traceability (classify_events): one telemetry row per decision — no
    // image, no PII. Mirrors the app's gate so lane mix is queryable.
    // Best-effort: a logging failure must never fail the classification.
    try {
      {
        const lane = raw.isGarment === false
          ? 'reject'
          : (kind === 'unknown' || raw.ambiguous === true || alternativeKind != null) ? 'ask' : 'accept';
        const supabase = getSupabaseAdmin();
        await supabase.from('classify_events').insert({
          model: MODEL,
          is_garment: raw.isGarment === true,
          kind,
          slot,
          ambiguous: raw.ambiguous === true,
          lane,
          latency_ms: latencyMs,
          cost_usd: costUsd,
        });
      }
    } catch {
      // swallow — telemetry only
    }

    return NextResponse.json(
      { classification, costUsd, latencyMs },
      { headers: publicHeaders() },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'classification failed';
    return NextResponse.json({ error: message }, { status: 502, headers: publicHeaders() });
  }
}
