import type { Database } from "sql.js"
import { consola } from "consola"
import { createAuditTable } from "./audit.ts"

/** Apply schema creation and migrations to a database instance. */
export function runMigrations(db: Database): void {
  db.run(`CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price INTEGER NOT NULL,
    currency TEXT NOT NULL,
    cycle TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    billing_day INTEGER,
    created_at TEXT NOT NULL DEFAULT (date('now')),
    notes TEXT
  )`)
  db.run(`CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  )`)
  db.run(`CREATE TABLE IF NOT EXISTS subscription_tags (
    subscription_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (subscription_id, tag_id),
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
  )`)
  db.run(`CREATE TABLE IF NOT EXISTS llm_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cost REAL NOT NULL,
    date TEXT NOT NULL,
    description TEXT,
    generation_id TEXT
  )`)
  db.run(`CREATE TABLE IF NOT EXISTS trials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    price INTEGER,
    currency TEXT,
    cycle TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (date('now'))
  )`)
  db.run(`CREATE TABLE IF NOT EXISTS price_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subscription_id INTEGER NOT NULL,
    old_price INTEGER,
    new_price INTEGER NOT NULL,
    old_currency TEXT,
    new_currency TEXT NOT NULL,
    changed_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE
  )`)

  // Migration: add generation_id column if missing (pre-4.1.0 databases)
  const llmCols = db.exec("PRAGMA table_info(llm_usage)")
  const hasGenId = llmCols.length > 0 && llmCols[0].values.some(
    (row) => String(row[1]) === "generation_id",
  )
  if (!hasGenId) {
    db.run("ALTER TABLE llm_usage ADD COLUMN generation_id TEXT")
    db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_llm_usage_generation_id ON llm_usage(generation_id)")
  }

  // Migration: add notes column if missing (pre-6.x databases)
  const subCols = db.exec("PRAGMA table_info(subscriptions)")
  const hasNotes = subCols.length > 0 && subCols[0].values.some(
    (row) => String(row[1]) === "notes",
  )
  if (!hasNotes) {
    db.run("ALTER TABLE subscriptions ADD COLUMN notes TEXT")
  }

  // Migration: add payment_method column if missing
  const hasPaymentMethod = subCols.length > 0 && subCols[0].values.some(
    (row) => String(row[1]) === "payment_method",
  )
  if (!hasPaymentMethod) {
    db.run("ALTER TABLE subscriptions ADD COLUMN payment_method TEXT")
  }

  // Audit log table
  createAuditTable(db)

  // Suggestions table for email scan results
  db.run(`CREATE TABLE IF NOT EXISTS suggestions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price INTEGER,
    currency TEXT,
    cycle TEXT,
    vendor_name TEXT,
    vendor_url TEXT,
    plan_tier TEXT,
    payment_method TEXT,
    source TEXT NOT NULL DEFAULT 'email',
    source_detail TEXT,
    email_subject TEXT,
    email_from TEXT,
    email_date TEXT,
    confidence REAL DEFAULT 0.0,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'dismissed', 'added')),
    matched_sub_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (matched_sub_id) REFERENCES subscriptions(id) ON DELETE SET NULL
  )`)

  // Verify database integrity on startup
  const integrityResult = db.exec("PRAGMA integrity_check")
  if (
    integrityResult.length > 0 &&
    integrityResult[0].values.length > 0 &&
    String(integrityResult[0].values[0][0]) !== "ok"
  ) {
    consola.warn(
      `Database integrity check failed: ${String(integrityResult[0].values[0][0])}\n` +
      "  Run 'subtrack backup' immediately and restore from a known-good backup.",
    )
  }
}
