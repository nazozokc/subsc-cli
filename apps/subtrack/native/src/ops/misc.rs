//! Miscellaneous operations: stats, currency, maintenance, clone, archive, audit, bulk.

use std::path::Path;

use rusqlite::Connection;

use crate::types::Subscription;
use crate::types::*;

// ── Stats ──

pub fn get_stats(conn: &Connection, db_path: Option<&Path>) -> napi::Result<DatabaseStats> {
    let total_subscriptions: i64 = conn
        .query_row("SELECT COUNT(*) FROM subscriptions", [], |row| row.get(0))
        .unwrap_or(0);

    let total_tags: i64 = conn
        .query_row("SELECT COUNT(*) FROM tags", [], |row| row.get(0))
        .unwrap_or(0);

    let total_usage: i64 = conn
        .query_row("SELECT COUNT(*) FROM llm_usage", [], |row| row.get(0))
        .unwrap_or(0);

    let total_trials: i64 = conn
        .query_row("SELECT COUNT(*) FROM trials", [], |row| row.get(0))
        .unwrap_or(0);

    let db_size_bytes: i64 = db_path
        .and_then(|p| std::fs::metadata(p).ok())
        .map(|m| m.len() as i64)
        .unwrap_or(0);

    let oldest_entry: Option<String> = conn
        .query_row("SELECT MIN(created_at) FROM subscriptions", [], |row| {
            row.get(0)
        })
        .ok();

    let newest_entry: Option<String> = conn
        .query_row("SELECT MAX(created_at) FROM subscriptions", [], |row| {
            row.get(0)
        })
        .ok();

    Ok(DatabaseStats {
        total_subscriptions,
        total_tags,
        total_usage,
        total_trials,
        db_size_bytes,
        oldest_entry,
        newest_entry,
    })
}

// ── Currency ──

pub fn list_currencies() -> Vec<CurrencyInfo> {
    vec![
        CurrencyInfo {
            code: "USD".to_string(),
            name: "US Dollar".to_string(),
            symbol: "$".to_string(),
        },
        CurrencyInfo {
            code: "EUR".to_string(),
            name: "Euro".to_string(),
            symbol: "€".to_string(),
        },
        CurrencyInfo {
            code: "GBP".to_string(),
            name: "British Pound".to_string(),
            symbol: "£".to_string(),
        },
        CurrencyInfo {
            code: "JPY".to_string(),
            name: "Japanese Yen".to_string(),
            symbol: "¥".to_string(),
        },
        CurrencyInfo {
            code: "CAD".to_string(),
            name: "Canadian Dollar".to_string(),
            symbol: "C$".to_string(),
        },
        CurrencyInfo {
            code: "AUD".to_string(),
            name: "Australian Dollar".to_string(),
            symbol: "A$".to_string(),
        },
        CurrencyInfo {
            code: "CHF".to_string(),
            name: "Swiss Franc".to_string(),
            symbol: "Fr".to_string(),
        },
        CurrencyInfo {
            code: "CNY".to_string(),
            name: "Chinese Yuan".to_string(),
            symbol: "¥".to_string(),
        },
        CurrencyInfo {
            code: "INR".to_string(),
            name: "Indian Rupee".to_string(),
            symbol: "₹".to_string(),
        },
        CurrencyInfo {
            code: "BRL".to_string(),
            name: "Brazilian Real".to_string(),
            symbol: "R$".to_string(),
        },
        CurrencyInfo {
            code: "KRW".to_string(),
            name: "South Korean Won".to_string(),
            symbol: "₩".to_string(),
        },
        CurrencyInfo {
            code: "SGD".to_string(),
            name: "Singapore Dollar".to_string(),
            symbol: "S$".to_string(),
        },
        CurrencyInfo {
            code: "NZD".to_string(),
            name: "New Zealand Dollar".to_string(),
            symbol: "NZ$".to_string(),
        },
        CurrencyInfo {
            code: "HKD".to_string(),
            name: "Hong Kong Dollar".to_string(),
            symbol: "HK$".to_string(),
        },
        CurrencyInfo {
            code: "SEK".to_string(),
            name: "Swedish Krona".to_string(),
            symbol: "kr".to_string(),
        },
        CurrencyInfo {
            code: "NOK".to_string(),
            name: "Norwegian Krone".to_string(),
            symbol: "kr".to_string(),
        },
        CurrencyInfo {
            code: "DKK".to_string(),
            name: "Danish Krone".to_string(),
            symbol: "kr".to_string(),
        },
        CurrencyInfo {
            code: "MXN".to_string(),
            name: "Mexican Peso".to_string(),
            symbol: "Mex$".to_string(),
        },
        CurrencyInfo {
            code: "TWD".to_string(),
            name: "New Taiwan Dollar".to_string(),
            symbol: "NT$".to_string(),
        },
        CurrencyInfo {
            code: "PLN".to_string(),
            name: "Polish Zloty".to_string(),
            symbol: "zł".to_string(),
        },
    ]
}

// ── Maintenance ──

pub fn run_maintenance(
    conn: &Connection,
    vacuum: bool,
    check: bool,
) -> napi::Result<MaintenanceResult> {
    let mut result = MaintenanceResult {
        integrity_ok: None,
        integrity_message: None,
        vacuum_ok: None,
        vacuum_message: None,
    };

    if check {
        let integrity: String = conn
            .query_row("PRAGMA integrity_check", [], |row| row.get(0))
            .map_err(|e| napi::Error::from_reason(format!("Integrity check failed: {}", e)))?;

        result.integrity_ok = Some(integrity == "ok");
        result.integrity_message = Some(integrity);
    }

    if vacuum {
        match conn.execute_batch("VACUUM") {
            Ok(_) => {
                result.vacuum_ok = Some(true);
                result.vacuum_message = Some("VACUUM completed".to_string());
            }
            Err(e) => {
                result.vacuum_ok = Some(false);
                result.vacuum_message = Some(format!("VACUUM failed: {}", e));
            }
        }
    }

    Ok(result)
}

// ── Clone ──

pub fn clone_subscription(
    conn: &Connection,
    id: i64,
    new_name: Option<&str>,
) -> napi::Result<Subscription> {
    // Fetch original
    let mut stmt = conn
        .prepare(
            "SELECT s.name, s.price, s.currency, s.cycle, s.status, \
             s.billing_day, s.created_at, s.notes, s.payment_method, \
             s.contract_start, s.contract_end, s.auto_renewal, \
             s.vendor_name, s.vendor_url, s.plan_tier, s.discount_amount, s.discount_type \
             FROM subscriptions s WHERE s.id = ?1",
        )
        .map_err(|e| napi::Error::from_reason(format!("SQL prepare: {}", e)))?;

    let (
        name,
        price,
        currency,
        cycle,
        status,
        billing_day,
        _created_at,
        notes,
        payment_method,
        contract_start,
        contract_end,
        auto_renewal,
        vendor_name,
        vendor_url,
        plan_tier,
        discount_amount,
        discount_type,
    ): (
        String,
        i64,
        String,
        String,
        String,
        Option<i64>,
        String,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        i64,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<i64>,
        Option<String>,
    ) = stmt
        .query_row([id], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
                row.get(5)?,
                row.get(6)?,
                row.get(7)?,
                row.get(8)?,
                row.get(9)?,
                row.get(10)?,
                row.get::<_, i64>(11)?,
                row.get(12)?,
                row.get(13)?,
                row.get(14)?,
                row.get(15)?,
                row.get(16)?,
            ))
        })
        .map_err(|e| napi::Error::from_reason(format!("Subscription {} not found: {}", id, e)))?;

    let default_name = format!("{} (copy)", name);
    let new_name = new_name.unwrap_or(&default_name);

    // Use the add_subscription logic via direct SQL
    let created_at = chrono::Utc::now().format("%Y-%m-%d").to_string();
    conn.execute(
        "INSERT INTO subscriptions (name, price, currency, cycle, status, billing_day, \
         created_at, notes, payment_method, contract_start, contract_end, auto_renewal, \
         vendor_name, vendor_url, plan_tier, discount_amount, discount_type) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)",
        rusqlite::params![
            new_name,
            price,
            currency,
            cycle,
            status,
            billing_day,
            created_at,
            notes,
            payment_method,
            contract_start,
            contract_end,
            auto_renewal,
            vendor_name,
            vendor_url,
            plan_tier,
            discount_amount,
            discount_type,
        ],
    )
    .map_err(|e| napi::Error::from_reason(format!("Failed to clone: {}", e)))?;

    let new_id: i64 = conn
        .query_row("SELECT last_insert_rowid()", [], |row| row.get(0))
        .map_err(|e| napi::Error::from_reason(format!("Failed to get new id: {}", e)))?;

    // Clone tags
    conn.execute(
        "INSERT INTO subscription_tags (subscription_id, tag_id) \
         SELECT ?1, tag_id FROM subscription_tags WHERE subscription_id = ?2",
        rusqlite::params![new_id, id],
    )
    .map_err(|e| napi::Error::from_reason(format!("Failed to clone tags: {}", e)))?;

    // Fetch and return the new subscription with tags
    let mut stmt = conn
        .prepare(
            "SELECT s.id, s.name, s.price, s.currency, s.cycle, s.status, \
             s.billing_day, s.created_at, s.notes, s.payment_method, \
             s.contract_start, s.contract_end, s.auto_renewal, \
             s.vendor_name, s.vendor_url, s.plan_tier, s.discount_amount, s.discount_type \
             FROM subscriptions s WHERE s.id = ?1",
        )
        .map_err(|e| napi::Error::from_reason(format!("SQL prepare: {}", e)))?;

    let mut sub: Subscription = stmt
        .query_row([new_id], |row| {
            Ok(Subscription {
                id: row.get(0)?,
                name: row.get(1)?,
                price: row.get(2)?,
                currency: row.get(3)?,
                cycle: row.get(4)?,
                status: row.get(5)?,
                billing_day: row.get(6)?,
                created_at: row.get(7)?,
                notes: row.get(8)?,
                payment_method: row.get(9)?,
                contract_start: row.get(10)?,
                contract_end: row.get(11)?,
                auto_renewal: row.get::<_, Option<i64>>(12)?.unwrap_or(1) != 0,
                vendor_name: row.get(13)?,
                vendor_url: row.get(14)?,
                plan_tier: row.get(15)?,
                discount_amount: row.get(16)?,
                discount_type: row.get(17)?,
                tags: Vec::new(),
            })
        })
        .map_err(|e| napi::Error::from_reason(format!("Failed to fetch cloned sub: {}", e)))?;

    // Fetch tags
    let mut tag_stmt = conn
        .prepare(
            "SELECT t.name FROM tags t \
             JOIN subscription_tags st ON st.tag_id = t.id \
             WHERE st.subscription_id = ?1 ORDER BY t.name",
        )
        .map_err(|e| napi::Error::from_reason(format!("SQL prepare: {}", e)))?;

    sub.tags = tag_stmt
        .query_map([new_id], |row| row.get::<_, String>(0))
        .map_err(|e| napi::Error::from_reason(format!("SQL query: {}", e)))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(sub)
}

// ── Archive / Unarchive ──

pub fn archive_subscription(conn: &Connection, id: i64) -> napi::Result<()> {
    let updated = conn
        .execute(
            "UPDATE subscriptions SET status = 'archived' WHERE id = ?1 AND status != 'archived'",
            [id],
        )
        .map_err(|e| napi::Error::from_reason(format!("Failed to archive: {}", e)))?;

    if updated == 0 {
        return Err(napi::Error::from_reason(format!(
            "Subscription {} not found or already archived",
            id
        )));
    }
    Ok(())
}

pub fn unarchive_subscription(conn: &Connection, id: i64) -> napi::Result<()> {
    let updated = conn
        .execute(
            "UPDATE subscriptions SET status = 'active' WHERE id = ?1 AND status = 'archived'",
            [id],
        )
        .map_err(|e| napi::Error::from_reason(format!("Failed to unarchive: {}", e)))?;

    if updated == 0 {
        return Err(napi::Error::from_reason(format!(
            "Subscription {} not found or not archived",
            id
        )));
    }
    Ok(())
}

// ── Audit ──

pub fn get_audit_log(conn: &Connection, filter: &AuditFilter) -> napi::Result<Vec<AuditEntry>> {
    let mut wheres = Vec::new();
    let mut owned_params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(ref action) = filter.action {
        let idx = owned_params.len() + 1;
        wheres.push(format!("action = ?{}", idx));
        owned_params.push(Box::new(action.clone()));
    }
    if let Some(ref from) = filter.from {
        let idx = owned_params.len() + 1;
        wheres.push(format!("created_at >= ?{}", idx));
        owned_params.push(Box::new(format!("{}T00:00:00", from)));
    }
    if let Some(ref to) = filter.to {
        let idx = owned_params.len() + 1;
        wheres.push(format!("created_at <= ?{}", idx));
        owned_params.push(Box::new(format!("{}T23:59:59", to)));
    }

    let where_clause = if wheres.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", wheres.join(" AND "))
    };

    let limit = filter.limit.unwrap_or(50);

    let sql = format!(
        "SELECT id, action, entity_type, entity_id, details, created_at \
         FROM audit_log {} ORDER BY created_at DESC LIMIT ?{}",
        where_clause,
        owned_params.len() + 1,
    );

    owned_params.push(Box::new(limit));

    let param_refs: Vec<&dyn rusqlite::types::ToSql> =
        owned_params.iter().map(|p| p.as_ref()).collect();

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| napi::Error::from_reason(format!("SQL prepare: {}", e)))?;

    let entries = stmt
        .query_map(param_refs.as_slice(), |row| {
            Ok(AuditEntry {
                id: row.get(0)?,
                action: row.get(1)?,
                entity_type: row.get(2)?,
                entity_id: row.get(3)?,
                details: row.get(4)?,
                created_at: row.get(5)?,
            })
        })
        .map_err(|e| napi::Error::from_reason(format!("SQL query: {}", e)))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(entries)
}

pub fn prune_audit_log(conn: &Connection, days: i64) -> napi::Result<i64> {
    let deleted = conn
        .execute(
            "DELETE FROM audit_log WHERE created_at < datetime('now', ?1)",
            [format!("-{} days", days)],
        )
        .map_err(|e| napi::Error::from_reason(format!("Failed to prune audit log: {}", e)))?;

    Ok(deleted as i64)
}

// ── Bulk Operations ──

pub fn bulk_update_status(
    conn: &Connection,
    new_status: &str,
    filter: &BulkFilter,
) -> napi::Result<i64> {
    let (where_clause, owned_params) = build_bulk_filter(filter);

    let status_idx = owned_params.len() + 1;
    let sql = format!(
        "UPDATE subscriptions SET status = ?{} {}",
        status_idx, where_clause
    );

    let mut all_params: Vec<Box<dyn rusqlite::types::ToSql>> = owned_params;
    all_params.push(Box::new(new_status.to_string()));

    let param_refs: Vec<&dyn rusqlite::types::ToSql> =
        all_params.iter().map(|p| p.as_ref()).collect();

    conn.execute(&sql, param_refs.as_slice())
        .map_err(|e| napi::Error::from_reason(format!("Bulk update failed: {}", e)))
        .map(|n| n as i64)
}

pub fn bulk_delete_subs(conn: &Connection, filter: &BulkFilter) -> napi::Result<i64> {
    let (where_clause, owned_params) = build_bulk_filter(filter);

    let sql = format!("DELETE FROM subscriptions {}", where_clause);

    let param_refs: Vec<&dyn rusqlite::types::ToSql> =
        owned_params.iter().map(|p| p.as_ref()).collect();

    conn.execute(&sql, param_refs.as_slice())
        .map_err(|e| napi::Error::from_reason(format!("Bulk delete failed: {}", e)))
        .map(|n| n as i64)
}

pub fn bulk_tag_add(conn: &Connection, tag: &str, filter: &BulkFilter) -> napi::Result<i64> {
    // Ensure tag exists
    conn.execute("INSERT OR IGNORE INTO tags (name) VALUES (?1)", [tag])
        .map_err(|e| napi::Error::from_reason(format!("Failed to create tag: {}", e)))?;

    let tag_id: i64 = conn
        .query_row("SELECT id FROM tags WHERE name = ?1", [tag], |row| {
            row.get(0)
        })
        .map_err(|e| napi::Error::from_reason(format!("Failed to get tag id: {}", e)))?;

    let (where_clause, owned_params) = build_bulk_filter(filter);

    let tag_idx = owned_params.len() + 1;
    let sql = format!(
        "INSERT OR IGNORE INTO subscription_tags (subscription_id, tag_id) \
         SELECT id, ?{} FROM subscriptions {}",
        tag_idx, where_clause
    );

    let mut all_params: Vec<Box<dyn rusqlite::types::ToSql>> = owned_params;
    all_params.push(Box::new(tag_id));

    let param_refs: Vec<&dyn rusqlite::types::ToSql> =
        all_params.iter().map(|p| p.as_ref()).collect();

    conn.execute(&sql, param_refs.as_slice())
        .map_err(|e| napi::Error::from_reason(format!("Bulk tag add failed: {}", e)))
        .map(|n| n as i64)
}

pub fn bulk_tag_remove(conn: &Connection, tag: &str, filter: &BulkFilter) -> napi::Result<i64> {
    let tag_id: i64 = conn
        .query_row("SELECT id FROM tags WHERE name = ?1", [tag], |row| {
            row.get(0)
        })
        .map_err(|e| napi::Error::from_reason(format!("Tag '{}' not found: {}", tag, e)))?;

    let (where_clause, owned_params) = build_bulk_filter(filter);

    let sql = format!(
        "DELETE FROM subscription_tags WHERE subscription_id IN \
         (SELECT id FROM subscriptions {}) AND tag_id = ?{}",
        where_clause,
        owned_params.len() + 1,
    );

    let mut all_params: Vec<Box<dyn rusqlite::types::ToSql>> = owned_params;
    all_params.push(Box::new(tag_id));

    let param_refs: Vec<&dyn rusqlite::types::ToSql> =
        all_params.iter().map(|p| p.as_ref()).collect();

    conn.execute(&sql, param_refs.as_slice())
        .map_err(|e| napi::Error::from_reason(format!("Bulk tag remove failed: {}", e)))
        .map(|n| n as i64)
}

// ── Helpers ──

fn build_bulk_filter(filter: &BulkFilter) -> (String, Vec<Box<dyn rusqlite::types::ToSql>>) {
    let mut wheres = Vec::new();
    let mut owned_params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(ref tag) = filter.tag {
        let idx = owned_params.len() + 1;
        wheres.push(format!(
            "id IN (SELECT subscription_id FROM subscription_tags st \
             JOIN tags t ON t.id = st.tag_id WHERE t.name = ?{})",
            idx
        ));
        owned_params.push(Box::new(tag.clone()));
    }

    if let Some(ref status) = filter.status {
        let idx = owned_params.len() + 1;
        wheres.push(format!("status = ?{}", idx));
        owned_params.push(Box::new(status.clone()));
    }

    if let Some(ref name) = filter.name {
        let idx = owned_params.len() + 1;
        wheres.push(format!("name LIKE ?{}", idx));
        owned_params.push(Box::new(format!("%{}%", name)));
    }

    let where_clause = if wheres.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", wheres.join(" AND "))
    };

    (where_clause, owned_params)
}
