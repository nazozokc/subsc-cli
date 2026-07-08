//! Export (CSV, JSON, Markdown) and CSV import operations.

use rusqlite::Connection;

use crate::types::{ExportOptions, ImportResult};

/// Build the base WHERE clause from export options.
fn build_filter_clause(
    options: Option<&ExportOptions>,
) -> (String, Vec<Box<dyn rusqlite::types::ToSql>>) {
    let opts = match options {
        Some(o) => o,
        None => return (String::new(), Vec::new()),
    };

    let mut wheres = Vec::new();
    let mut owned_params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(ref status) = opts.status {
        // Support comma-separated statuses
        let statuses: Vec<&str> = status.split(',').map(|s| s.trim()).collect();
        let placeholders: Vec<String> = statuses
            .iter()
            .enumerate()
            .map(|(i, _)| format!("?{}", owned_params.len() + i + 1))
            .collect();
        wheres.push(format!("s.status IN ({})", placeholders.join(",")));
        for st in &statuses {
            owned_params.push(Box::new(st.to_string()));
        }
    } else {
        wheres.push("s.status != 'archived'".to_string());
    }

    if let Some(ref _currency) = opts.currency {
        // Currency filtering is handled post-query in TS via FX rates
    }

    let _tag_filter = opts.tags.as_ref().and_then(|t| {
        let flat = t.join(",");
        let tags: Vec<String> = flat
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
        if tags.is_empty() {
            None
        } else {
            Some(tags)
        }
    });

    let where_clause = if wheres.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", wheres.join(" AND "))
    };

    (where_clause, owned_params)
}

fn get_export_subs(
    conn: &Connection,
    options: Option<&ExportOptions>,
) -> napi::Result<Vec<crate::types::Subscription>> {
    let default_opts = ExportOptions {
        format: "csv".to_string(),
        currency: None,
        tags: None,
        status: None,
    };
    let opts = options.unwrap_or(&default_opts);

    let (where_clause, owned_params) = build_filter_clause(Some(opts));

    let sql = format!(
        "SELECT s.id, s.name, s.price, s.currency, s.cycle, s.status, \
         s.billing_day, s.created_at, s.notes, s.payment_method, \
         s.contract_start, s.contract_end, s.auto_renewal, \
         s.vendor_name, s.vendor_url, s.plan_tier, s.discount_amount, s.discount_type \
         FROM subscriptions s {} ORDER BY s.name",
        where_clause
    );

    let param_refs: Vec<&dyn rusqlite::types::ToSql> =
        owned_params.iter().map(|p| p.as_ref()).collect();

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| napi::Error::from_reason(format!("SQL prepare: {}", e)))?;

    let subs: Vec<(
        i64,
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
        bool,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<i64>,
        Option<String>,
    )> = stmt
        .query_map(param_refs.as_slice(), |row| {
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
                row.get(11)?,
                row.get::<_, Option<i64>>(12)?.unwrap_or(1) != 0,
                row.get(13)?,
                row.get(14)?,
                row.get(15)?,
                row.get(16)?,
                row.get(17)?,
            ))
        })
        .map_err(|e| napi::Error::from_reason(format!("SQL query: {}", e)))?
        .filter_map(|r| r.ok())
        .collect();

    // Map tags (as in lib.rs)
    let ids: Vec<i64> = subs.iter().map(|s| s.0).collect();
    let tag_map = if ids.is_empty() {
        std::collections::HashMap::new()
    } else {
        let placeholders: Vec<String> = ids
            .iter()
            .enumerate()
            .map(|(i, _)| format!("?{}", i + 1))
            .collect();
        let tag_sql = format!(
            "SELECT st.subscription_id, t.name FROM tags t \
             JOIN subscription_tags st ON st.tag_id = t.id \
             WHERE st.subscription_id IN ({}) ORDER BY t.name",
            placeholders.join(",")
        );
        let owned_ids: Vec<Box<dyn rusqlite::types::ToSql>> = ids
            .iter()
            .map(|id| Box::new(*id) as Box<dyn rusqlite::types::ToSql>)
            .collect();
        let id_refs: Vec<&dyn rusqlite::types::ToSql> =
            owned_ids.iter().map(|p| p.as_ref()).collect();
        let mut tag_stmt = conn
            .prepare(&tag_sql)
            .map_err(|e| napi::Error::from_reason(format!("SQL prepare: {}", e)))?;
        let tag_rows = tag_stmt
            .query_map(id_refs.as_slice(), |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|e| napi::Error::from_reason(format!("SQL query: {}", e)))?;
        let mut map: std::collections::HashMap<i64, Vec<String>> = std::collections::HashMap::new();
        for row in tag_rows.flatten() {
            map.entry(row.0).or_default().push(row.1);
        }
        map
    };

    let result: Vec<crate::types::Subscription> = subs
        .into_iter()
        .map(|s| crate::types::Subscription {
            id: s.0,
            name: s.1,
            price: s.2,
            currency: s.3,
            cycle: s.4,
            status: s.5,
            billing_day: s.6,
            created_at: s.7,
            notes: s.8,
            payment_method: s.9,
            contract_start: s.10,
            contract_end: s.11,
            auto_renewal: s.12,
            vendor_name: s.13,
            vendor_url: s.14,
            plan_tier: s.15,
            discount_amount: s.16,
            discount_type: s.17,
            tags: tag_map.get(&s.0).cloned().unwrap_or_default(),
        })
        .collect();

    // Apply tag filter post-query (AND logic)
    if let Some(ref tag_vec) = opts.tags {
        let tag_str = tag_vec.join(",");
        let filter_tags: Vec<&str> = tag_str
            .split(',')
            .map(|t| t.trim())
            .filter(|t| !t.is_empty())
            .collect();
        if !filter_tags.is_empty() {
            let filtered: Vec<_> = result
                .into_iter()
                .filter(|sub| {
                    filter_tags
                        .iter()
                        .all(|t| sub.tags.contains(&t.to_string()))
                })
                .collect();
            return Ok(filtered);
        }
    }

    Ok(result)
}

pub fn export_csv(conn: &Connection, options: Option<&ExportOptions>) -> napi::Result<String> {
    let subs = get_export_subs(conn, options)?;

    let mut wtr = csv::Writer::from_writer(Vec::new());
    wtr.write_record(&[
        "id",
        "name",
        "price",
        "currency",
        "cycle",
        "status",
        "billing_day",
        "created_at",
        "notes",
        "payment_method",
        "contract_start",
        "contract_end",
        "auto_renewal",
        "vendor_name",
        "vendor_url",
        "plan_tier",
        "discount_amount",
        "discount_type",
        "tags",
    ])
    .map_err(|e| napi::Error::from_reason(format!("CSV write header: {}", e)))?;

    for sub in &subs {
        wtr.write_record(&[
            sub.id.to_string(),
            sub.name.clone(),
            sub.price.to_string(),
            sub.currency.clone(),
            sub.cycle.clone(),
            sub.status.clone(),
            sub.billing_day.map(|d| d.to_string()).unwrap_or_default(),
            sub.created_at.clone(),
            sub.notes.clone().unwrap_or_default(),
            sub.payment_method.clone().unwrap_or_default(),
            sub.contract_start.clone().unwrap_or_default(),
            sub.contract_end.clone().unwrap_or_default(),
            if sub.auto_renewal {
                "1".to_string()
            } else {
                "0".to_string()
            },
            sub.vendor_name.clone().unwrap_or_default(),
            sub.vendor_url.clone().unwrap_or_default(),
            sub.plan_tier.clone().unwrap_or_default(),
            sub.discount_amount
                .map(|d| d.to_string())
                .unwrap_or_default(),
            sub.discount_type.clone().unwrap_or_default(),
            sub.tags.join(";"),
        ])
        .map_err(|e| napi::Error::from_reason(format!("CSV write record: {}", e)))?;
    }

    let data = wtr
        .into_inner()
        .map_err(|e| napi::Error::from_reason(format!("CSV finalize: {}", e)))?;
    String::from_utf8(data).map_err(|e| napi::Error::from_reason(format!("UTF-8 error: {}", e)))
}

pub fn export_json(conn: &Connection, options: Option<&ExportOptions>) -> napi::Result<String> {
    let subs = get_export_subs(conn, options)?;
    serde_json::to_string_pretty(&subs)
        .map_err(|e| napi::Error::from_reason(format!("JSON serialize: {}", e)))
}

pub fn export_md(conn: &Connection, options: Option<&ExportOptions>) -> napi::Result<String> {
    let subs = get_export_subs(conn, options)?;

    let mut output = String::from("# Subscriptions\n\n");
    output.push_str("| ID | Name | Price | Currency | Cycle | Status | Tags |\n");
    output.push_str("|---|---|---|---|---|---|---|\n");

    for sub in &subs {
        output.push_str(&format!(
            "| {} | {} | {} | {} | {} | {} | {} |\n",
            sub.id,
            sub.name,
            sub.price,
            sub.currency,
            sub.cycle,
            sub.status,
            sub.tags.join(", "),
        ));
    }

    Ok(output)
}

pub fn import_from_csv(
    conn: &Connection,
    content: &str,
    dry_run: bool,
    deduplicate: bool,
) -> napi::Result<ImportResult> {
    let mut rdr = csv::ReaderBuilder::new()
        .flexible(true)
        .from_reader(content.as_bytes());

    let _headers = rdr
        .headers()
        .map_err(|e| napi::Error::from_reason(format!("CSV header error: {}", e)))?
        .clone();

    let mut imported = 0i64;
    let mut skipped = 0i64;
    let mut errors = Vec::new();

    for (i, result) in rdr.records().enumerate() {
        let line = i + 2; // 1-indexed + header
        let record = match result {
            Ok(r) => r,
            Err(e) => {
                errors.push(format!("Line {}: {}", line, e));
                continue;
            }
        };

        // Parse fields
        let name = record.get(1).unwrap_or("").trim().to_string();
        if name.is_empty() {
            errors.push(format!("Line {}: empty name, skipping", line));
            skipped += 1;
            continue;
        }

        let price: i64 = record.get(2).unwrap_or("0").trim().parse().unwrap_or(0);
        let currency = record.get(3).unwrap_or("USD").trim().to_string();
        let cycle = record.get(4).unwrap_or("monthly").trim().to_string();
        let status = record.get(5).unwrap_or("active").trim().to_string();
        let billing_day: Option<i64> = record.get(6).unwrap_or("").trim().parse().ok();
        let created_at = record.get(7).unwrap_or("").trim().to_string();
        let notes = record
            .get(8)
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
        let payment_method = record
            .get(9)
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
        let contract_start = record
            .get(10)
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
        let contract_end = record
            .get(11)
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
        let auto_renewal = record.get(12).map(|s| s.trim() == "1").unwrap_or(true);
        let vendor_name = record
            .get(13)
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
        let vendor_url = record
            .get(14)
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
        let plan_tier = record
            .get(15)
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
        let discount_amount: Option<i64> = record.get(16).unwrap_or("").trim().parse().ok();
        let discount_type = record
            .get(17)
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
        let tag_str = record.get(18).unwrap_or("").trim();

        let tags: Vec<String> = tag_str
            .split(&[';', ','][..])
            .map(|t| t.trim().to_string())
            .filter(|t| !t.is_empty())
            .collect();

        if deduplicate {
            let exists: bool = conn
                .query_row(
                    "SELECT COUNT(*) FROM subscriptions WHERE name = ?1 AND currency = ?2 AND cycle = ?3",
                    rusqlite::params![name, currency, cycle],
                    |row| row.get::<_, i64>(0),
                )
                .map(|c| c > 0)
                .unwrap_or(false);

            if exists {
                skipped += 1;
                continue;
            }
        }

        if dry_run {
            imported += 1;
            continue;
        }

        let created_at_val = if created_at.is_empty() {
            chrono::Utc::now().format("%Y-%m-%d").to_string()
        } else {
            created_at.clone()
        };

        if let Err(e) = conn.execute(
            "INSERT INTO subscriptions (name, price, currency, cycle, status, billing_day, \
             created_at, notes, payment_method, contract_start, contract_end, auto_renewal, \
             vendor_name, vendor_url, plan_tier, discount_amount, discount_type) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)",
            rusqlite::params![
                name,
                price,
                currency,
                cycle,
                status,
                billing_day,
                created_at_val,
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
        ) {
            errors.push(format!("Line {}: insert error: {}", line, e));
            skipped += 1;
            continue;
        }

        let sub_id: i64 = conn
            .query_row("SELECT last_insert_rowid()", [], |row| row.get(0))
            .unwrap_or(0);

        // Insert tags
        for tag in &tags {
            conn.execute("INSERT OR IGNORE INTO tags (name) VALUES (?1)", [tag])
                .ok();
            if let Ok(tag_id) =
                conn.query_row::<i64, _, _>("SELECT id FROM tags WHERE name = ?1", [tag], |row| {
                    row.get(0)
                })
            {
                conn.execute(
                    "INSERT OR IGNORE INTO subscription_tags (subscription_id, tag_id) VALUES (?1, ?2)",
                    rusqlite::params![sub_id, tag_id],
                ).ok();
            }
        }

        imported += 1;
    }

    Ok(ImportResult {
        imported,
        skipped,
        errors,
    })
}
