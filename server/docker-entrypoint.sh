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

bun -e "import { Database } from 'bun:sqlite';
const dbFile = process.env.DB_FILE_NAME || 'prediction_market.db';
const db = new Database(dbFile);
const columns = db.query('PRAGMA table_info(users)').all();
const hasRoleColumn = columns.some((column) => column?.name === 'role');
if (!hasRoleColumn) {
  db.run(\"ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'\");
}
const hasBalanceColumn = columns.some((column) => column?.name === 'balance');
if (!hasBalanceColumn) {
  db.run(\"ALTER TABLE users ADD COLUMN balance REAL NOT NULL DEFAULT 1000\");
}

const adminCountRow = db
  .query(\"SELECT COUNT(*) as count FROM users WHERE role = ?\")
  .get('admin');
const adminCount = Number(adminCountRow?.count ?? 0);
if (adminCount === 0) {
  db.run(\"UPDATE users SET role = 'admin' WHERE id = (SELECT id FROM users ORDER BY id ASC LIMIT 1)\");
}

db.run(
  \"CREATE TABLE IF NOT EXISTS market_refunds (id INTEGER PRIMARY KEY AUTOINCREMENT, market_id INTEGER NOT NULL, user_id INTEGER NOT NULL, amount REAL NOT NULL, created_at INTEGER NOT NULL)\",
);
db.run(
  \"CREATE UNIQUE INDEX IF NOT EXISTS market_refunds_market_user_idx ON market_refunds(market_id, user_id)\",
);
db.run(
  \"CREATE INDEX IF NOT EXISTS market_refunds_market_id_idx ON market_refunds(market_id)\",
);
db.run(
  \"CREATE INDEX IF NOT EXISTS market_refunds_user_id_idx ON market_refunds(user_id)\",
);
db.run(
  \"CREATE TABLE IF NOT EXISTS market_payouts (id INTEGER PRIMARY KEY AUTOINCREMENT, market_id INTEGER NOT NULL, user_id INTEGER NOT NULL, amount REAL NOT NULL, created_at INTEGER NOT NULL)\",
);
db.run(
  \"CREATE UNIQUE INDEX IF NOT EXISTS market_payouts_market_user_idx ON market_payouts(market_id, user_id)\",
);
db.run(
  \"CREATE INDEX IF NOT EXISTS market_payouts_market_id_idx ON market_payouts(market_id)\",
);
db.run(
  \"CREATE INDEX IF NOT EXISTS market_payouts_user_id_idx ON market_payouts(user_id)\",
);
db.close();"

if [ "${SEED_DATABASE:-false}" = "true" ] && [ "$SHOULD_SEED" = "true" ]; then
  bun run db:seed
fi

exec bun index.ts
