//! subtrack-core: Native Node.js addon for subscription management.
//!
//! Exposes a `Database` class to JavaScript via napi-rs.

mod crypto;
mod db;
mod ops;
mod types;

use std::path::Path;
use std::sync::Mutex;

use napi_derive::napi;

use crate::ops::*;
use crate::types::*;

/// The main database handle. All CRUD operations go through this class.
#[napi]
pub struct Database {
    inner: Mutex<db::Database>,
}

#[napi]
impl Database {
    /// Open or create the database in `db_dir`.
    /// If `passphrase` is set, derive encryption key from it; otherwise use key file.
    #[napi(constructor)]
    pub fn new(db_dir: String, passphrase: Option<String>) -> napi::Result<Self> {
        let inner = db::Database::open(Path::new(&db_dir), passphrase)?;
        Ok(Self {
            inner: Mutex::new(inner),
        })
    }

    /// Persist the in-memory database to disk (encrypted).
    #[napi]
    pub fn save(&self) -> napi::Result<()> {
        let inner = self
            .inner
            .lock()
            .map_err(|e| napi::Error::from_reason(format!("Failed to lock database: {}", e)))?;
        inner.save()
    }

    // ── Subscriptions ──

    /// Get all subscriptions with optional filtering.
    #[napi]
    pub fn get_subscriptions(
        &self,
        filter: Option<SubscriptionFilter>,
    ) -> napi::Result<Vec<Subscription>> {
        let inner = self
            .inner
            .lock()
            .map_err(|e| napi::Error::from_reason(format!("Failed to lock database: {}", e)))?;
        let conn = &inner.conn;

        let f = filter.unwrap_or_default();
        let mut wheres = Vec::new();
        let mut owned_params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

        let mut sort_field = "id".to_string();
        let mut sort_order = "ASC".to_string();

        if let Some(ref status) = f.status {
            wheres.push(format!("s.status = ?{}", owned_params.len() + 1));
            owned_params.push(Box::new(status.clone()));
        }
        if let Some(true) = f.active_only {
            wheres.push("s.status != 'archived'".to_string());
        }
        if let Some(ref search) = f.search {
            wheres.push(format!("s.name LIKE ?{}", owned_params.len() + 1));
            owned_params.push(Box::new(format!("%{}%", search)));
        }
        if let Some(ref sort) = f.sort {
            let valid_fields = [
                "id",
                "name",
                "price",
                "currency",
                "cycle",
                "status",
                "created_at",
            ];
            if valid_fields.contains(&sort.as_str()) {
                sort_field = sort.clone();
            }
        }
        if let Some(true) = f.descending {
            sort_order = "DESC".to_string();
        }

        // Tag filtering (AND logic)
        if let Some(ref tags) = f.tags {
            if !tags.is_empty() {
                for tag in tags {
                    let idx = owned_params.len() + 1;
                    wheres.push(format!(
                        "s.id IN (SELECT st.subscription_id FROM subscription_tags st \
                         JOIN tags t ON t.id = st.tag_id WHERE t.name = ?{})",
                        idx
                    ));
                    owned_params.push(Box::new(tag.clone()));
                }
            }
        }

        let where_clause = if wheres.is_empty() {
            String::new()
        } else {
            format!("WHERE {}", wheres.join(" AND "))
        };

        let sql = format!(
            "SELECT s.id, s.name, s.price, s.currency, s.cycle, s.status, \
             s.billing_day, s.created_at, s.notes, s.payment_method, \
             s.contract_start, s.contract_end, s.auto_renewal, \
             s.vendor_name, s.vendor_url, s.plan_tier, s.discount_amount, s.discount_type \
             FROM subscriptions s {} \
             ORDER BY s.{} {}",
            where_clause, sort_field, sort_order
        );

        let param_refs: Vec<&dyn rusqlite::types::ToSql> =
            owned_params.iter().map(|p| p.as_ref()).collect();
        let mut stmt = conn
            .prepare(&sql)
            .map_err(|e| napi::Error::from_reason(format!("SQL prepare error: {}", e)))?;

        let subs: Vec<Subscription> = stmt
            .query_map(param_refs.as_slice(), to_subscription)
            .map_err(|e| napi::Error::from_reason(format!("SQL query error: {}", e)))?
            .filter_map(|r| r.ok())
            .collect();

        // Map tags for each subscription
        map_tags(conn, &subs)
    }

    /// Get a single subscription by ID.
    #[napi]
    pub fn get_subscription(&self, id: i64) -> napi::Result<Option<Subscription>> {
        let inner = self
            .inner
            .lock()
            .map_err(|e| napi::Error::from_reason(format!("Failed to lock database: {}", e)))?;
        let conn = &inner.conn;

        let mut stmt = conn
            .prepare(
                "SELECT s.id, s.name, s.price, s.currency, s.cycle, s.status, \
                 s.billing_day, s.created_at, s.notes, s.payment_method, \
                 s.contract_start, s.contract_end, s.auto_renewal, \
                 s.vendor_name, s.vendor_url, s.plan_tier, s.discount_amount, s.discount_type \
                 FROM subscriptions s WHERE s.id = ?1",
            )
            .map_err(|e| napi::Error::from_reason(format!("SQL prepare: {}", e)))?;

        let mut sub = match stmt.query_row([id], to_subscription) {
            Ok(s) => s,
            Err(rusqlite::Error::QueryReturnedNoRows) => return Ok(None),
            Err(e) => {
                return Err(napi::Error::from_reason(format!("SQL error: {}", e)));
            }
        };

        sub.tags = get_tags_for_subscription(conn, id)?;
        Ok(Some(sub))
    }

    /// Add a new subscription.
    #[napi]
    pub fn add_subscription(&self, input: NewSubscriptionInput) -> napi::Result<Subscription> {
        let mut inner = self
            .inner
            .lock()
            .map_err(|e| napi::Error::from_reason(format!("Failed to lock database: {}", e)))?;

        let unique_tags: Vec<String> = {
            let mut seen = std::collections::HashSet::new();
            input
                .tags
                .iter()
                .filter(|t| seen.insert((*t).clone()))
                .cloned()
                .collect()
        };

        let status = input.status.clone().unwrap_or_else(|| "active".to_string());
        let created_at = input
            .created_at
            .clone()
            .unwrap_or_else(|| chrono::Utc::now().format("%Y-%m-%d").to_string());

        // Scope the transaction so the mutable borrow drops before save()
        let id = {
            let conn = &mut inner.conn;
            let tx = conn
                .transaction()
                .map_err(|e| napi::Error::from_reason(format!("Failed to begin tx: {}", e)))?;

            tx.execute(
                "INSERT INTO subscriptions (name, price, currency, cycle, status, billing_day, \
                 created_at, notes, payment_method, contract_start, contract_end, auto_renewal, \
                 vendor_name, vendor_url, plan_tier, discount_amount, discount_type) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)",
                rusqlite::params![
                    input.name, input.price, input.currency, input.cycle,
                    status, input.billing_day, created_at, input.notes, input.payment_method,
                    input.contract_start, input.contract_end, input.auto_renewal.unwrap_or(true),
                    input.vendor_name, input.vendor_url, input.plan_tier,
                    input.discount_amount, input.discount_type,
                ],
            )
            .map_err(|e| napi::Error::from_reason(format!("Failed to insert: {}", e)))?;

            let id: i64 = tx
                .query_row("SELECT last_insert_rowid()", [], |row| row.get(0))
                .map_err(|e| napi::Error::from_reason(format!("Failed to get insert id: {}", e)))?;

            // Handle tags
            for tag in &unique_tags {
                tx.execute("INSERT OR IGNORE INTO tags (name) VALUES (?1)", [tag])
                    .map_err(|e| {
                        napi::Error::from_reason(format!("Failed to insert tag: {}", e))
                    })?;
                let tag_id: i64 = tx
                    .query_row("SELECT id FROM tags WHERE name = ?1", [tag], |row| {
                        row.get(0)
                    })
                    .map_err(|e| {
                        napi::Error::from_reason(format!("Failed to get tag id: {}", e))
                    })?;
                tx.execute(
                    "INSERT INTO subscription_tags (subscription_id, tag_id) VALUES (?1, ?2)",
                    [id, tag_id],
                )
                .map_err(|e| napi::Error::from_reason(format!("Failed to link tag: {}", e)))?;
            }

            tx.commit()
                .map_err(|e| napi::Error::from_reason(format!("Failed to commit: {}", e)))?;
            id
        }; // conn mutable borrow released here

        inner.save()?;

        Ok(Subscription {
            id,
            name: input.name,
            price: input.price,
            currency: input.currency,
            cycle: input.cycle,
            status,
            billing_day: input.billing_day,
            created_at,
            notes: input.notes,
            payment_method: input.payment_method,
            contract_start: input.contract_start,
            contract_end: input.contract_end,
            auto_renewal: input.auto_renewal.unwrap_or(true),
            vendor_name: input.vendor_name,
            vendor_url: input.vendor_url,
            plan_tier: input.plan_tier,
            discount_amount: input.discount_amount,
            discount_type: input.discount_type,
            tags: unique_tags,
        })
    }

    /// Update an existing subscription.
    #[napi]
    pub fn update_subscription(
        &self,
        id: i64,
        input: UpdateSubscriptionInput,
    ) -> napi::Result<Subscription> {
        let mut inner = self
            .inner
            .lock()
            .map_err(|e| napi::Error::from_reason(format!("Failed to lock database: {}", e)))?;

        let tags_to_set: Option<Vec<String>> = input.tags.as_ref().map(|tags| {
            let mut seen = std::collections::HashSet::new();
            tags.iter()
                .filter(|t| seen.insert((*t).clone()))
                .cloned()
                .collect()
        });

        // Scope transaction
        {
            let conn = &mut inner.conn;
            let tx = conn
                .transaction()
                .map_err(|e| napi::Error::from_reason(format!("Failed to begin tx: {}", e)))?;

            // Build SET clause dynamically
            let mut sets = Vec::new();
            let mut owned_params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

            macro_rules! set_if_some {
                ($field:literal, $val:expr) => {
                    if let Some(v) = $val {
                        sets.push(format!("{} = ?{}", $field, owned_params.len() + 1));
                        owned_params.push(Box::new(v));
                    }
                };
            }

            set_if_some!("name", &input.name);
            set_if_some!("price", input.price);
            set_if_some!("currency", &input.currency);
            set_if_some!("cycle", &input.cycle);
            set_if_some!("status", &input.status);
            set_if_some!("billing_day", input.billing_day);
            set_if_some!("notes", &input.notes);
            set_if_some!("payment_method", &input.payment_method);
            set_if_some!("contract_start", &input.contract_start);
            set_if_some!("contract_end", &input.contract_end);
            if let Some(v) = input.auto_renewal {
                sets.push(format!("auto_renewal = ?{}", owned_params.len() + 1));
                owned_params.push(Box::new(v));
            }
            set_if_some!("vendor_name", &input.vendor_name);
            set_if_some!("vendor_url", &input.vendor_url);
            set_if_some!("plan_tier", &input.plan_tier);
            set_if_some!("discount_amount", input.discount_amount);
            set_if_some!("discount_type", &input.discount_type);

            if !sets.is_empty() {
                owned_params.push(Box::new(id));
                let sql = format!(
                    "UPDATE subscriptions SET {} WHERE id = ?{}",
                    sets.join(", "),
                    owned_params.len()
                );
                let param_refs: Vec<&dyn rusqlite::types::ToSql> =
                    owned_params.iter().map(|p| p.as_ref()).collect();
                tx.execute(&sql, param_refs.as_slice())
                    .map_err(|e| napi::Error::from_reason(format!("Failed to update: {}", e)))?;
            }

            // Handle tags if provided
            if let Some(ref new_tags) = tags_to_set {
                tx.execute(
                    "DELETE FROM subscription_tags WHERE subscription_id = ?1",
                    [id],
                )
                .map_err(|e| napi::Error::from_reason(format!("Failed to clear tags: {}", e)))?;

                for tag in new_tags {
                    tx.execute("INSERT OR IGNORE INTO tags (name) VALUES (?1)", [tag])
                        .map_err(|e| {
                            napi::Error::from_reason(format!("Failed to insert tag: {}", e))
                        })?;
                    let tag_id: i64 = tx
                        .query_row("SELECT id FROM tags WHERE name = ?1", [tag], |row| {
                            row.get(0)
                        })
                        .map_err(|e| {
                            napi::Error::from_reason(format!("Failed to get tag id: {}", e))
                        })?;
                    tx.execute(
                        "INSERT INTO subscription_tags (subscription_id, tag_id) VALUES (?1, ?2)",
                        [id, tag_id],
                    )
                    .map_err(|e| napi::Error::from_reason(format!("Failed to link tag: {}", e)))?;
                }
            }

            tx.commit()
                .map_err(|e| napi::Error::from_reason(format!("Failed to commit: {}", e)))?;
        } // conn mutable borrow released

        inner.save()?;

        // Fetch and return the updated subscription (&conn works here since save released the mut borrow)
        let conn = &inner.conn;
        let mut stmt = conn
            .prepare(
                "SELECT s.id, s.name, s.price, s.currency, s.cycle, s.status, \
                 s.billing_day, s.created_at, s.notes, s.payment_method, \
                 s.contract_start, s.contract_end, s.auto_renewal, \
                 s.vendor_name, s.vendor_url, s.plan_tier, s.discount_amount, s.discount_type \
                 FROM subscriptions s WHERE s.id = ?1",
            )
            .map_err(|e| napi::Error::from_reason(format!("SQL prepare: {}", e)))?;

        let mut sub = stmt.query_row([id], to_subscription).map_err(|e| {
            napi::Error::from_reason(format!("Subscription {} not found after update: {}", id, e))
        })?;

        sub.tags = get_tags_for_subscription(conn, id)?;
        Ok(sub)
    }

    /// Delete subscriptions by IDs. Returns the number of deleted rows.
    #[napi]
    pub fn delete_subscriptions(&self, ids: Vec<i64>) -> napi::Result<i64> {
        let inner = self
            .inner
            .lock()
            .map_err(|e| napi::Error::from_reason(format!("Failed to lock database: {}", e)))?;

        if ids.is_empty() {
            return Ok(0);
        }

        let placeholders: Vec<String> = ids
            .iter()
            .enumerate()
            .map(|(i, _)| format!("?{}", i + 1))
            .collect();

        let sql = format!(
            "DELETE FROM subscriptions WHERE id IN ({})",
            placeholders.join(",")
        );

        let owned_params: Vec<Box<dyn rusqlite::types::ToSql>> = ids
            .iter()
            .map(|id| Box::new(*id) as Box<dyn rusqlite::types::ToSql>)
            .collect();
        let param_refs: Vec<&dyn rusqlite::types::ToSql> =
            owned_params.iter().map(|p| p.as_ref()).collect();

        inner
            .conn
            .execute(&sql, param_refs.as_slice())
            .map_err(|e| napi::Error::from_reason(format!("Failed to delete: {}", e)))
            .map(|n| n as i64)
    }

    // ── Tags ──

    #[napi]
    pub fn list_tags(&self) -> napi::Result<Vec<Tag>> {
        let inner = self
            .inner
            .lock()
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;
        tags::list_tags(&inner.conn)
    }

    #[napi]
    pub fn rename_tag(&self, old_name: String, new_name: String) -> napi::Result<()> {
        let inner = self
            .inner
            .lock()
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;
        tags::rename_tag(&inner.conn, &old_name, &new_name)
    }

    #[napi]
    pub fn delete_tag(&self, name: String) -> napi::Result<i64> {
        let inner = self
            .inner
            .lock()
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;
        tags::delete_tag(&inner.conn, &name)
    }

    #[napi]
    pub fn prune_tags(&self) -> napi::Result<i64> {
        let inner = self
            .inner
            .lock()
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;
        tags::prune_tags(&inner.conn)
    }

    #[napi]
    pub fn merge_tags(&self, source: String, target: String) -> napi::Result<i64> {
        let inner = self
            .inner
            .lock()
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;
        tags::merge_tags(&inner.conn, &source, &target)
    }

    // ── LLM Usage ──

    #[napi]
    pub fn add_usage(&self, input: NewLlmUsageInput) -> napi::Result<LlmUsageEntry> {
        let inner = self
            .inner
            .lock()
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;
        usage::add_usage(&inner.conn, &input)
    }

    #[napi]
    pub fn list_usage(&self, filter: UsageFilter) -> napi::Result<Vec<LlmUsageEntry>> {
        let inner = self
            .inner
            .lock()
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;
        usage::list_usage(&inner.conn, &filter)
    }

    #[napi]
    pub fn delete_usage(&self, ids: Vec<i64>) -> napi::Result<i64> {
        let inner = self
            .inner
            .lock()
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;
        usage::delete_usage(&inner.conn, &ids)
    }

    #[napi]
    pub fn get_usage_total(
        &self,
        from: Option<String>,
        to: Option<String>,
    ) -> napi::Result<UsageTotal> {
        let inner = self
            .inner
            .lock()
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;
        usage::get_usage_total(&inner.conn, from.as_deref(), to.as_deref())
    }

    // ── Trials ──

    #[napi]
    pub fn add_trial(&self, input: NewTrialInput) -> napi::Result<TrialEntry> {
        let inner = self
            .inner
            .lock()
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;
        trial::add_trial(&inner.conn, &input)
    }

    #[napi]
    pub fn list_trials(&self) -> napi::Result<Vec<TrialEntry>> {
        let inner = self
            .inner
            .lock()
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;
        trial::list_trials(&inner.conn)
    }

    #[napi]
    pub fn get_expiring_trials(&self, days: i64) -> napi::Result<Vec<TrialEntry>> {
        let inner = self
            .inner
            .lock()
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;
        trial::get_expiring_trials(&inner.conn, days)
    }

    #[napi]
    pub fn delete_trials(&self, ids: Vec<i64>) -> napi::Result<i64> {
        let inner = self
            .inner
            .lock()
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;
        trial::delete_trials(&inner.conn, &ids)
    }

    // ── Payment ──

    #[napi]
    pub fn get_payment_summary(
        &self,
        period: String,
        filter: Option<PaymentFilter>,
    ) -> napi::Result<PaymentSummary> {
        let inner = self
            .inner
            .lock()
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;
        payment::get_payment_summary(&inner.conn, &period, filter.as_ref())
    }

    #[napi]
    pub fn get_forecast(&self, input: ForecastInput) -> napi::Result<ForecastResult> {
        let inner = self
            .inner
            .lock()
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;
        payment::get_forecast(&inner.conn, &input)
    }

    #[napi]
    pub fn get_analytics(
        &self,
        options: Option<AnalyticsOptions>,
    ) -> napi::Result<AnalyticsResult> {
        let inner = self
            .inner
            .lock()
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;
        payment::get_analytics(&inner.conn, options.as_ref())
    }

    #[napi]
    pub fn compare_periods(&self, input: CompareInput) -> napi::Result<CompareResult> {
        let inner = self
            .inner
            .lock()
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;
        payment::compare_periods(&inner.conn, &input)
    }

    // ── Export / Import ──

    #[napi]
    pub fn export_csv(&self, options: Option<ExportOptions>) -> napi::Result<String> {
        let inner = self
            .inner
            .lock()
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;
        export_import::export_csv(&inner.conn, options.as_ref())
    }

    #[napi]
    pub fn export_json(&self, options: Option<ExportOptions>) -> napi::Result<String> {
        let inner = self
            .inner
            .lock()
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;
        export_import::export_json(&inner.conn, options.as_ref())
    }

    #[napi]
    pub fn export_md(&self, options: Option<ExportOptions>) -> napi::Result<String> {
        let inner = self
            .inner
            .lock()
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;
        export_import::export_md(&inner.conn, options.as_ref())
    }

    #[napi]
    pub fn import_csv(
        &self,
        content: String,
        dry_run: Option<bool>,
        deduplicate: Option<bool>,
    ) -> napi::Result<ImportResult> {
        let inner = self
            .inner
            .lock()
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;
        export_import::import_from_csv(
            &inner.conn,
            &content,
            dry_run.unwrap_or(false),
            deduplicate.unwrap_or(false),
        )
    }

    // ── Backup / Restore ──

    #[napi]
    pub fn backup_db(&self, destination: String, encrypt: Option<bool>) -> napi::Result<String> {
        let inner = self
            .inner
            .lock()
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;
        let db_path = inner
            .db_path
            .as_ref()
            .ok_or_else(|| napi::Error::from_reason("No database path".to_string()))?;
        backup::backup_database(&inner.conn, db_path, &destination, encrypt.unwrap_or(false))
    }

    #[napi]
    pub fn list_backups(&self, dir: String) -> napi::Result<Vec<BackupFileInfo>> {
        backup::list_backups(Path::new(&dir))
    }

    #[napi]
    pub fn restore_db(&self, source: String) -> napi::Result<()> {
        let mut inner = self
            .inner
            .lock()
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;
        backup::restore_database(&mut inner.conn, Path::new(&source))
    }

    // ── Config (file-based, takes db_dir) ──

    #[napi]
    pub fn load_config(&self) -> napi::Result<AppConfig> {
        let inner = self
            .inner
            .lock()
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;
        let db_path = inner
            .db_path
            .as_ref()
            .ok_or_else(|| napi::Error::from_reason("No database path".to_string()))?;
        let db_dir = db_path
            .parent()
            .ok_or_else(|| napi::Error::from_reason("Invalid db path".to_string()))?;
        config::load_config_from_file(db_dir)
    }

    #[napi]
    pub fn save_config(&self, config: AppConfig) -> napi::Result<()> {
        let inner = self
            .inner
            .lock()
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;
        let db_path = inner
            .db_path
            .as_ref()
            .ok_or_else(|| napi::Error::from_reason("No database path".to_string()))?;
        let db_dir = db_path
            .parent()
            .ok_or_else(|| napi::Error::from_reason("Invalid db path".to_string()))?;
        config::save_config_to_file(db_dir, &config)
    }

    #[napi]
    pub fn reset_config_file(&self) -> napi::Result<()> {
        let inner = self
            .inner
            .lock()
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;
        let db_path = inner
            .db_path
            .as_ref()
            .ok_or_else(|| napi::Error::from_reason("No database path".to_string()))?;
        let db_dir = db_path
            .parent()
            .ok_or_else(|| napi::Error::from_reason("Invalid db path".to_string()))?;
        config::reset_config_file(db_dir)
    }

    // ── Profiles ──

    #[napi]
    pub fn list_profiles(&self) -> napi::Result<Vec<FilterProfile>> {
        let inner = self
            .inner
            .lock()
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;
        let db_path = inner
            .db_path
            .as_ref()
            .ok_or_else(|| napi::Error::from_reason("No database path".to_string()))?;
        let db_dir = db_path
            .parent()
            .ok_or_else(|| napi::Error::from_reason("Invalid db path".to_string()))?;
        config::list_profiles(db_dir)
    }

    #[napi]
    pub fn show_profile(&self, name: String) -> napi::Result<Option<FilterProfile>> {
        let inner = self
            .inner
            .lock()
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;
        let db_path = inner
            .db_path
            .as_ref()
            .ok_or_else(|| napi::Error::from_reason("No database path".to_string()))?;
        let db_dir = db_path
            .parent()
            .ok_or_else(|| napi::Error::from_reason("Invalid db path".to_string()))?;
        config::show_profile(db_dir, &name)
    }

    #[napi]
    pub fn save_profile(&self, name: String, profile: FilterProfile) -> napi::Result<()> {
        let inner = self
            .inner
            .lock()
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;
        let db_path = inner
            .db_path
            .as_ref()
            .ok_or_else(|| napi::Error::from_reason("No database path".to_string()))?;
        let db_dir = db_path
            .parent()
            .ok_or_else(|| napi::Error::from_reason("Invalid db path".to_string()))?;
        config::save_profile(db_dir, &name, &profile)
    }

    #[napi]
    pub fn switch_profile(&self, name: String) -> napi::Result<AppConfig> {
        let inner = self
            .inner
            .lock()
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;
        let db_path = inner
            .db_path
            .as_ref()
            .ok_or_else(|| napi::Error::from_reason("No database path".to_string()))?;
        let db_dir = db_path
            .parent()
            .ok_or_else(|| napi::Error::from_reason("Invalid db path".to_string()))?;
        config::switch_profile(db_dir, &name)
    }

    #[napi]
    pub fn delete_profile(&self, name: String) -> napi::Result<()> {
        let inner = self
            .inner
            .lock()
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;
        let db_path = inner
            .db_path
            .as_ref()
            .ok_or_else(|| napi::Error::from_reason("No database path".to_string()))?;
        let db_dir = db_path
            .parent()
            .ok_or_else(|| napi::Error::from_reason("Invalid db path".to_string()))?;
        config::delete_profile(db_dir, &name)
    }

    // ── Upcoming / Calendar / Timeline / History ──

    #[napi]
    pub fn get_upcoming_bills(&self, days: Option<i64>) -> napi::Result<Vec<UpcomingBill>> {
        let inner = self
            .inner
            .lock()
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;
        analytics::get_upcoming_bills(&inner.conn, days)
    }

    #[napi]
    pub fn get_calendar_data(
        &self,
        year: Option<i64>,
        month: Option<i64>,
    ) -> napi::Result<CalendarData> {
        let inner = self
            .inner
            .lock()
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;
        analytics::get_calendar_data(&inner.conn, year, month)
    }

    #[napi]
    pub fn get_timeline(&self, months: Option<i64>) -> napi::Result<Vec<TimelineEntry>> {
        let inner = self
            .inner
            .lock()
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;
        analytics::get_timeline(&inner.conn, months)
    }

    #[napi]
    pub fn get_price_history(
        &self,
        id: Option<i64>,
        days: Option<i64>,
    ) -> napi::Result<Vec<PriceHistoryEntry>> {
        let inner = self
            .inner
            .lock()
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;
        analytics::get_price_history(&inner.conn, id, days)
    }

    // ── Optimize ──

    #[napi]
    pub fn get_optimization_suggestions(
        &self,
        min_savings: Option<i64>,
    ) -> napi::Result<Vec<OptimizationSuggestion>> {
        let inner = self
            .inner
            .lock()
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;
        optimize::get_optimization_suggestions(&inner.conn, min_savings)
    }

    // ── Misc: Stats, Currency, Maintenance ──

    #[napi]
    pub fn get_stats(&self) -> napi::Result<DatabaseStats> {
        let inner = self
            .inner
            .lock()
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;
        let db_path = inner.db_path.as_deref();
        misc::get_stats(&inner.conn, db_path)
    }

    #[napi]
    pub fn list_currencies(&self) -> Vec<CurrencyInfo> {
        misc::list_currencies()
    }

    #[napi]
    pub fn run_maintenance(
        &self,
        vacuum: Option<bool>,
        check: Option<bool>,
    ) -> napi::Result<MaintenanceResult> {
        let inner = self
            .inner
            .lock()
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;
        misc::run_maintenance(&inner.conn, vacuum.unwrap_or(false), check.unwrap_or(true))
    }

    // ── Clone / Archive ──

    #[napi]
    pub fn clone_subscription(
        &self,
        id: i64,
        new_name: Option<String>,
    ) -> napi::Result<Subscription> {
        let inner = self
            .inner
            .lock()
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;
        misc::clone_subscription(&inner.conn, id, new_name.as_deref())
    }

    #[napi]
    pub fn archive_subscription(&self, id: i64) -> napi::Result<()> {
        let inner = self
            .inner
            .lock()
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;
        misc::archive_subscription(&inner.conn, id)
    }

    #[napi]
    pub fn unarchive_subscription(&self, id: i64) -> napi::Result<()> {
        let inner = self
            .inner
            .lock()
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;
        misc::unarchive_subscription(&inner.conn, id)
    }

    // ── Audit ──

    #[napi]
    pub fn get_audit_log(&self, filter: AuditFilter) -> napi::Result<Vec<AuditEntry>> {
        let inner = self
            .inner
            .lock()
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;
        misc::get_audit_log(&inner.conn, &filter)
    }

    #[napi]
    pub fn prune_audit_log(&self, days: i64) -> napi::Result<i64> {
        let inner = self
            .inner
            .lock()
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;
        misc::prune_audit_log(&inner.conn, days)
    }

    // ── Bulk Operations ──

    #[napi]
    pub fn bulk_update_status(&self, new_status: String, filter: BulkFilter) -> napi::Result<i64> {
        let inner = self
            .inner
            .lock()
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;
        misc::bulk_update_status(&inner.conn, &new_status, &filter)
    }

    #[napi]
    pub fn bulk_delete_subs(&self, filter: BulkFilter) -> napi::Result<i64> {
        let inner = self
            .inner
            .lock()
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;
        misc::bulk_delete_subs(&inner.conn, &filter)
    }

    #[napi]
    pub fn bulk_tag_add(&self, tag: String, filter: BulkFilter) -> napi::Result<i64> {
        let inner = self
            .inner
            .lock()
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;
        misc::bulk_tag_add(&inner.conn, &tag, &filter)
    }

    #[napi]
    pub fn bulk_tag_remove(&self, tag: String, filter: BulkFilter) -> napi::Result<i64> {
        let inner = self
            .inner
            .lock()
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;
        misc::bulk_tag_remove(&inner.conn, &tag, &filter)
    }

    /// Execute raw SQL (testing/debugging). Returns rows modified.
    #[napi]
    pub fn exec_sql(&self, sql: String, params: Vec<String>) -> napi::Result<i32> {
        let inner = self
            .inner
            .lock()
            .map_err(|e| napi::Error::from_reason(format!("Failed to lock database: {}", e)))?;
        let conn = &inner.conn;
        let owned_params: Vec<Box<dyn rusqlite::types::ToSql>> = params
            .iter()
            .map(|s| Box::new(s.clone()) as Box<dyn rusqlite::types::ToSql>)
            .collect();
        let param_refs: Vec<&dyn rusqlite::types::ToSql> =
            owned_params.iter().map(|p| p.as_ref()).collect();
        let affected = conn
            .execute(&sql, param_refs.as_slice())
            .map_err(|e| napi::Error::from_reason(format!("SQL error: {}", e)))?;
        Ok(affected as i32)
    }
}

// ── Helper: convert rusqlite row to Subscription ──

fn to_subscription(row: &rusqlite::Row) -> rusqlite::Result<Subscription> {
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
}

fn map_tags(conn: &rusqlite::Connection, subs: &[Subscription]) -> napi::Result<Vec<Subscription>> {
    if subs.is_empty() {
        return Ok(subs.to_vec());
    }

    let ids: Vec<i64> = subs.iter().map(|s| s.id).collect();
    let placeholders: Vec<String> = ids
        .iter()
        .enumerate()
        .map(|(i, _)| format!("?{}", i + 1))
        .collect();

    let sql = format!(
        "SELECT st.subscription_id, t.name FROM tags t \
         JOIN subscription_tags st ON st.tag_id = t.id \
         WHERE st.subscription_id IN ({}) \
         ORDER BY t.name",
        placeholders.join(",")
    );

    let owned_params: Vec<Box<dyn rusqlite::types::ToSql>> = ids
        .iter()
        .map(|id| Box::new(*id) as Box<dyn rusqlite::types::ToSql>)
        .collect();
    let param_refs: Vec<&dyn rusqlite::types::ToSql> =
        owned_params.iter().map(|p| p.as_ref()).collect();

    let mut tag_map: std::collections::HashMap<i64, Vec<String>> = std::collections::HashMap::new();

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| napi::Error::from_reason(format!("Failed to prepare tag query: {}", e)))?;

    let rows = stmt
        .query_map(param_refs.as_slice(), |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| napi::Error::from_reason(format!("Failed to query tags: {}", e)))?;

    for row in rows.flatten() {
        tag_map.entry(row.0).or_default().push(row.1);
    }

    let result: Vec<Subscription> = subs
        .iter()
        .map(|s| {
            let mut sub = s.clone();
            sub.tags = tag_map.remove(&s.id).unwrap_or_default();
            sub
        })
        .collect();

    Ok(result)
}
fn get_tags_for_subscription(conn: &rusqlite::Connection, id: i64) -> napi::Result<Vec<String>> {
    let mut stmt = conn
        .prepare(
            "SELECT t.name FROM tags t \
             JOIN subscription_tags st ON st.tag_id = t.id \
             WHERE st.subscription_id = ?1 \
             ORDER BY t.name",
        )
        .map_err(|e| napi::Error::from_reason(format!("Failed to prepare tag query: {}", e)))?;

    let tags = stmt
        .query_map([id], |row| row.get::<_, String>(0))
        .map_err(|e| napi::Error::from_reason(format!("Failed to query tags: {}", e)))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(tags)
}
