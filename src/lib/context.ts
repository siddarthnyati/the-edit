import { readFileSync } from 'fs';
import { resolve } from 'path';
import { FALLBACK_AGENTS_MD, FALLBACK_DESIGN_MD } from './fallback-context.js';

// Loads brand and engineering rules from the styleMeUp repo.
// In production, embed the relevant sections as static strings to benefit
// from prompt caching — do not re-read from disk on every executor call.

const STYLEMEUP_REPO = process.env['STYLEMEUP_REPO_PATH'] ?? '../styleMeUp';

function load(relativePath: string, fallback: string): string {
  try {
    return readFileSync(resolve(STYLEMEUP_REPO, relativePath), 'utf-8');
  } catch {
    return fallback;
  }
}

let _designMd: string | null = null;
let _agentsMd: string | null = null;

export function designMd(): string {
  _designMd ??= load('DESIGN.md', FALLBACK_DESIGN_MD);
  return _designMd;
}

export function agentsMd(): string {
  _agentsMd ??= load('AGENTS.md', FALLBACK_AGENTS_MD);
  return _agentsMd;
}

// Compact brand rules injected at the top of every executor system prompt.
// Keep this short — it is not cached.
export const BRAND_PREAMBLE = `
You are producing content for StyleMeUp Magazine Weekly.
Register: Magazine only. Voice: editorial, declarative, present tense.
Never use: AI, magic, smart, intelligent, powered by, curated for you.
Never use: exclamation marks, emoji, passive voice, filler adjectives.
Every line must pass the Vogue test: could a Vogue editor have written this?
Banned copy and visuals are defined in DESIGN.md §4. Treat them as hard constraints.
`.trim();
