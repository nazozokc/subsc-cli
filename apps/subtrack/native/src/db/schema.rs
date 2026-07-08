//! Database schema creation and migrations.

use rusqlite::Connection;

pub fn run_migrations(conn: &Connection) -> napi::Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS subscriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            price INTEGER NOT NULL,
            currency TEXT NOT NULL,
            cycle TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'active',
            billing_day INTEGER,
            created_at TEXT NOT NULL DEFAULT (date('now')),
            notes TEXT,
            payment_method TEXT,
            contract_start TEXT,
            contract_end TEXT,
            auto_renewal INTEGER NOT NULL DEFAULT 1,
            vendor_name TEXT,
            vendor_url TEXT,
            plan_tier TEXT,
            discount_amount INTEGER,
            discount_type TEXT
        );

        CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE
        );

        CREATE TABLE IF NOT EXISTS subscription_tags (
            subscription_id INTEGER NOT NULL,
            tag_id INTEGER NOT NULL,
            PRIMARY KEY (subscription_id, tag_id),
            FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS llm_usage (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            provider TEXT NOT NULL,
            model TEXT NOT NULL,
            input_tokens INTEGER NOT NULL DEFAULT 0,
            output_tokens INTEGER NOT NULL DEFAULT 0,
            cost REAL NOT NULL,
            date TEXT NOT NULL,
            description TEXT,
            generation_id TEXT
        );

        CREATE TABLE IF NOT EXISTS trials (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            price INTEGER,
            currency TEXT,
            cycle TEXT,
            notes TEXT,
            created_at TEXT NOT NULL DEFAULT (date('now'))
        );

        CREATE TABLE IF NOT EXISTS price_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            subscription_id INTEGER NOT NULL,
            old_price INTEGER,
            new_price INTEGER NOT NULL,
            old_currency TEXT,
            new_currency TEXT NOT NULL,
            changed_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            action TEXT NOT NULL,
            entity_type TEXT NOT NULL,
            entity_id INTEGER,
            details TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_llm_usage_generation_id ON llm_usage(generation_id);
        CREATE INDEX IF NOT EXISTS idx_subscription_tags_subscription ON subscription_tags(subscription_id);
        CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);
        CREATE INDEX IF NOT EXISTS idx_price_history_subscription ON price_history(subscription_id);
        ",
    )
    .map_err(|e| napi::Error::from_reason(format!("Migration failed: {}", e)))?;

    // Migration: add generation_id column if missing (pre-4.1.0)
    let has_gen_id: bool = conn
        .prepare("PRAGMA table_info(llm_usage)")
        .map_err(|e| napi::Error::from_reason(e.to_string()))?
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|e| napi::Error::from_reason(e.to_string()))?
        .filter_map(|r| r.ok())
        .any(|col| col == "generation_id");

    if !has_gen_id {
        conn.execute_batch(
            "ALTER TABLE llm_usage ADD COLUMN generation_id TEXT;
             CREATE UNIQUE INDEX IF NOT EXISTS idx_llm_usage_generation_id ON llm_usage(generation_id);"
        ).map_err(|e| napi::Error::from_reason(format!("Migration failed: {}", e)))?;
    }

    // Migration: add notes column if missing (pre-6.x)
    let has_notes: bool = conn
        .prepare("PRAGMA table_info(subscriptions)")
        .map_err(|e| napi::Error::from_reason(e.to_string()))?
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|e| napi::Error::from_reason(e.to_string()))?
        .filter_map(|r| r.ok())
        .any(|col| col == "notes");

    if !has_notes {
        conn.execute_batch("ALTER TABLE subscriptions ADD COLUMN notes TEXT")
            .map_err(|e| napi::Error::from_reason(format!("Migration failed: {}", e)))?;
    }

    // Migration: add payment_method column
    let has_payment_method: bool = conn
        .prepare("PRAGMA table_info(subscriptions)")
        .map_err(|e| napi::Error::from_reason(e.to_string()))?
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|e| napi::Error::from_reason(e.to_string()))?
        .filter_map(|r| r.ok())
        .any(|col| col == "payment_method");

    if !has_payment_method {
        conn.execute_batch("ALTER TABLE subscriptions ADD COLUMN payment_method TEXT")
            .map_err(|e| napi::Error::from_reason(format!("Migration failed: {}", e)))?;
    }

    Ok(())
}
