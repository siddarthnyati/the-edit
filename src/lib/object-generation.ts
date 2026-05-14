import { generateObject, generateText } from 'ai';
import { recordCost } from './cost.js';

type GenerateObjectOptions = Parameters<typeof generateObject>[0];

type RepairableGenerateOptions = Record<string, unknown> & {
  repairLabel: string;
};

export async function generateObjectWithRepair(
  options: RepairableGenerateOptions,
): Promise<any> {
  const { repairLabel, ...generateOptions } = options;
  const withRepair = withRepairHook(generateOptions as GenerateObjectOptions, repairLabel);

  try {
    return await generateObject(withRepair);
  } catch (firstError) {
    const summary = summarizeError(firstError);
    console.warn(`[${repairLabel}] structured output failed once; retrying with strict JSON (${summary})`);

    const retryOptions = withRetryInstruction(generateOptions as GenerateObjectOptions, summary);
    return await generateObject(withRepairHook(retryOptions, repairLabel));
  }
}

function withRepairHook(options: GenerateObjectOptions, repairLabel: string): GenerateObjectOptions {
  return {
    ...options,
    experimental_repairText: async ({ text, error }) => {
      const extracted = extractJson(text);
      if (extracted) return extracted;

      const prompt = [
        'Repair the following model output so it is valid JSON for the requested schema.',
        'Return ONLY the repaired JSON object. No markdown, no commentary.',
        '',
        `Validation error: ${summarizeError(error)}`,
        '',
        '## Model output',
        text.slice(0, 20000),
      ].join('\n');

      const repaired = await generateText({
        model: options.model,
        prompt,
      });

      const usage = repaired.usage;
      if (usage) {
        const promptTokens = usage.promptTokens ?? 0;
        const completionTokens = usage.completionTokens ?? 0;
        const estimatedCostUsd = (promptTokens * 0.000003) + (completionTokens * 0.000015);
        recordCost(estimatedCostUsd, `${repairLabel}/repair`);
        console.log(
          `[${repairLabel}/repair] ~$${estimatedCostUsd.toFixed(4)} | ` +
          `${promptTokens}p + ${completionTokens}c tokens`,
        );
      }

      return repaired.text.trim();
    },
  } as GenerateObjectOptions;
}

function withRetryInstruction(options: GenerateObjectOptions, errorSummary: string): GenerateObjectOptions {
  const retryInstruction = [
    '',
    'STRICT RETRY:',
    `The previous response failed schema validation: ${errorSummary}`,
    'Return ONLY a valid JSON object for the schema. No markdown fences, no prose, no explanations.',
  ].join('\n');

  if ('prompt' in options && typeof options.prompt === 'string') {
    return { ...options, prompt: `${options.prompt}\n${retryInstruction}` };
  }

  if ('messages' in options && Array.isArray(options.messages)) {
    return {
      ...options,
      messages: [
        ...options.messages,
        { role: 'user', content: retryInstruction },
      ],
    } as GenerateObjectOptions;
  }

  return options;
}

function extractJson(text: string): string | null {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;

  const json = candidate.slice(firstBrace, lastBrace + 1);
  try {
    JSON.parse(json);
    return json;
  } catch {
    return null;
  }
}

export function summarizeError(error: unknown): string {
  if (error instanceof Error) {
    return [error.name, error.message].filter(Boolean).join(': ').slice(0, 1200);
  }
  if (typeof error === 'string') return error.slice(0, 1200);
  try {
    return JSON.stringify(error, (_key, value) => {
      if (typeof value === 'bigint') return value.toString();
      if (value instanceof Error) return { name: value.name, message: value.message };
      return value;
    }).slice(0, 1200);
  } catch {
    return String(error).slice(0, 1200);
  }
}
