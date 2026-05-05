import '../lib/env.js';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { supabase } from '../lib/supabase.js';

// Usage:
//   npm run inspect                    → list latest 10 runs
//   npm run inspect -- <runId>          → dump that run's full output to runs/<runId>.md
//   npm run inspect -- latest           → dump the most recent run

const arg = process.argv[2];

async function listRecent() {
  const { data, error } = await supabase
    .from('magazine_run_steps')
    .select('run_id, step, status, created_at, estimated_cost_usd, error')
    .order('created_at', { ascending: false })
    .limit(60);

  if (error) throw new Error(error.message);

  const grouped: Record<string, Array<typeof data[0]>> = {};
  for (const row of data ?? []) {
    grouped[row.run_id] ??= [];
    grouped[row.run_id]!.push(row);
  }

  const runs = Object.entries(grouped).slice(0, 10);
  console.log(`\nLast ${runs.length} runs (most recent first):\n`);
  for (const [runId, steps] of runs) {
    const stepSummary = steps
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((s) => {
        const icon = s.status === 'complete' ? '✓' : s.status === 'failed' ? '✗' : '·';
        return `${icon}${s.step}`;
      }).join(' → ');
    const totalCost = steps.reduce((sum, s) => sum + (Number(s.estimated_cost_usd) || 0), 0);
    const lastTime = steps[0]?.created_at?.slice(0, 19) ?? '?';
    const failed = steps.find((s) => s.status === 'failed');
    console.log(`  ${runId.slice(0, 8)}… | ${lastTime} | $${totalCost.toFixed(4)} | ${stepSummary}${failed ? ' ← FAILED' : ''}`);
  }
  console.log('\nDump a specific run with:  npm run inspect -- <runId>\n');
}

async function dumpRun(runId: string) {
  const { data, error } = await supabase
    .from('magazine_run_steps')
    .select('*')
    .eq('run_id', runId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    console.error(`No steps found for runId ${runId}`);
    process.exit(1);
  }

  const totalCost = data.reduce((sum, s) => sum + (Number(s.estimated_cost_usd) || 0), 0);
  const md: string[] = [
    `# Magazine run \`${runId}\``,
    '',
    `Steps: ${data.length}  ·  Total cost: $${totalCost.toFixed(4)}`,
    `First step: ${data[0]!.created_at}`,
    `Last step:  ${data[data.length - 1]!.completed_at ?? data[data.length - 1]!.created_at}`,
    '',
    '---',
    '',
  ];

  // Dedupe: each step appears twice (running + complete). Keep the terminal one.
  const terminal = new Map<string, typeof data[0]>();
  for (const row of data) {
    const existing = terminal.get(row.step);
    if (!existing || row.status !== 'running') terminal.set(row.step, row);
  }

  for (const row of terminal.values()) {
    md.push(`## ${row.step.toUpperCase()}  ·  ${row.status}  ·  $${Number(row.estimated_cost_usd ?? 0).toFixed(4)}`);
    md.push('');
    if (row.error) {
      md.push(`**Error:** ${row.error}`);
      md.push('');
    }
    if (row.output) {
      md.push('```json');
      md.push(JSON.stringify(row.output, null, 2));
      md.push('```');
      md.push('');
    }
  }

  mkdirSync(resolve('runs'), { recursive: true });
  const path = resolve('runs', `${runId}.md`);
  writeFileSync(path, md.join('\n'));

  console.log(`\nDumped run ${runId.slice(0, 8)}… to ${path}`);
  console.log(`Total cost: $${totalCost.toFixed(4)}\n`);
}

async function findLatest(): Promise<string> {
  const { data, error } = await supabase
    .from('magazine_run_steps')
    .select('run_id, created_at')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error('No runs found.');
  return data[0]!.run_id as string;
}

const main = async () => {
  if (!arg) return listRecent();
  if (arg === 'latest') return dumpRun(await findLatest());
  return dumpRun(arg);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
