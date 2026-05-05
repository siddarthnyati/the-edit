// Load .env with override semantics so values in the file beat parent-shell
// inheritance. Without this, running inside an environment that sets a
// different ANTHROPIC_API_KEY or ANTHROPIC_BASE_URL (e.g. Claude Code itself)
// silently hijacks every API call.
//
// Import this file FIRST, before any module that constructs an Anthropic
// or Supabase client.

import { config } from 'dotenv';

config({ override: true });

// If the parent shell pointed Anthropic at a different gateway and the user
// did not explicitly set one in .env, drop it so the SDK uses the default.
if (!process.env['ANTHROPIC_BASE_URL_FROM_DOTENV']) {
  delete process.env['ANTHROPIC_BASE_URL'];
}

const required = ['ANTHROPIC_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] as const;
for (const key of required) {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required env var: ${key}. Check .env at the repo root.`);
  }
}
