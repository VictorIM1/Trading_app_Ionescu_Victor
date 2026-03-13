#!/bin/sh
set -eu

DB_FILE="${DB_FILE_NAME:-prediction_market.db}"
DB_DIR="$(dirname "$DB_FILE")"
MIGRATIONS_JOURNAL="./drizzle/meta/_journal.json"
SHOULD_SEED="false"

mkdir -p "$DB_DIR"

if [ ! -f "$DB_FILE" ]; then
  SHOULD_SEED="true"
fi

if [ ! -f "$MIGRATIONS_JOURNAL" ] && [ "$SHOULD_SEED" = "true" ]; then
  bun run db:generate
fi

if [ -f "$MIGRATIONS_JOURNAL" ]; then
  bun run db:migrate
else
  echo "No Drizzle migration journal found; skipping migrations for existing database."
fi

if [ "${SEED_DATABASE:-false}" = "true" ] && [ "$SHOULD_SEED" = "true" ]; then
  bun run db:seed
fi

exec bun index.ts
