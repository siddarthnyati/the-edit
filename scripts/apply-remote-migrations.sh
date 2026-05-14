#!/usr/bin/env bash
set -euo pipefail

PROJECT_REF="${SUPABASE_PROJECT_REF:-bocvtwwmqphfnwmzdjcc}"

if ! command -v npx >/dev/null 2>&1; then
  echo "npx is required. Install Node/npm first." >&2
  exit 1
fi

if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  read -r -s -p "Supabase access token: " SUPABASE_ACCESS_TOKEN
  echo
fi

if [[ -z "${SUPABASE_DB_PASSWORD:-}" ]]; then
  read -r -s -p "Supabase database password for ${PROJECT_REF}: " SUPABASE_DB_PASSWORD
  echo
fi

echo "Logging into Supabase CLI..."
npx supabase login --token "${SUPABASE_ACCESS_TOKEN}" --name the-edit-migrations

echo "Linking project ${PROJECT_REF}..."
npx supabase link --project-ref "${PROJECT_REF}" --password "${SUPABASE_DB_PASSWORD}"

echo "Dry run: pending migrations..."
npx supabase db push --dry-run --password "${SUPABASE_DB_PASSWORD}"

read -r -p "Apply these migrations to ${PROJECT_REF}? Type yes to continue: " CONFIRM
if [[ "${CONFIRM}" != "yes" ]]; then
  echo "Aborted."
  exit 1
fi

echo "Applying migrations..."
npx supabase db push --password "${SUPABASE_DB_PASSWORD}"

echo "Done."
