//! Trial operations: add, list, delete, expiring.

use rusqlite::Connection;

use crate::types::{NewTrialInput, TrialEntry};

pub fn add_trial(conn: &Connection, input: &NewTrialInput) -> napi::Result<TrialEntry> {
    let created_at = chrono::Utc::now().format("%Y-%m-%d").to_string();

    conn.execute(
        "INSERT INTO trials (name, expires_at, price, currency, cycle, notes, created_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![
            input.name,
            input.expires_at,
            input.price,
            input.currency,
            input.cycle,
            input.notes,
            created_at,
        ],
    )
    .map_err(|e| napi::Error::from_reason(format!("Failed to insert trial: {}", e)))?;

    let id: i64 = conn
        .query_row("SELECT last_insert_rowid()", [], |row| row.get(0))
        .map_err(|e| napi::Error::from_reason(format!("Failed to get insert id: {}", e)))?;

    Ok(TrialEntry {
        id,
        name: input.name.clone(),
        expires_at: input.expires_at.clone(),
        price: input.price,
        currency: input.currency.clone(),
        cycle: input.cycle.clone(),
        notes: input.notes.clone(),
        created_at,
    })
}

pub fn list_trials(conn: &Connection) -> napi::Result<Vec<TrialEntry>> {
    let mut stmt = conn
        .prepare(
            "SELECT id, name, expires_at, price, currency, cycle, notes, created_at \
             FROM trials ORDER BY expires_at ASC",
        )
        .map_err(|e| napi::Error::from_reason(format!("SQL prepare: {}", e)))?;

    let trials = stmt
        .query_map([], |row| {
            Ok(TrialEntry {
                id: row.get(0)?,
                name: row.get(1)?,
                expires_at: row.get(2)?,
                price: row.get(3)?,
                currency: row.get(4)?,
                cycle: row.get(5)?,
                notes: row.get(6)?,
                created_at: row.get(7)?,
            })
        })
        .map_err(|e| napi::Error::from_reason(format!("SQL query: {}", e)))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(trials)
}

pub fn get_expiring_trials(conn: &Connection, days: i64) -> napi::Result<Vec<TrialEntry>> {
    let mut stmt = conn
        .prepare(
            "SELECT id, name, expires_at, price, currency, cycle, notes, created_at \
             FROM trials \
             WHERE expires_at >= date('now') AND expires_at <= date('now', ?1) \
             ORDER BY expires_at ASC",
        )
        .map_err(|e| napi::Error::from_reason(format!("SQL prepare: {}", e)))?;

    let day_str = format!("+{} days", days);
    let trials = stmt
        .query_map([&day_str], |row| {
            Ok(TrialEntry {
                id: row.get(0)?,
                name: row.get(1)?,
                expires_at: row.get(2)?,
                price: row.get(3)?,
                currency: row.get(4)?,
                cycle: row.get(5)?,
                notes: row.get(6)?,
                created_at: row.get(7)?,
            })
        })
        .map_err(|e| napi::Error::from_reason(format!("SQL query: {}", e)))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(trials)
}

pub fn delete_trials(conn: &Connection, ids: &[i64]) -> napi::Result<i64> {
    if ids.is_empty() {
        return Ok(0);
    }

    let placeholders: Vec<String> = ids
        .iter()
        .enumerate()
        .map(|(i, _)| format!("?{}", i + 1))
        .collect();

    let sql = format!(
        "DELETE FROM trials WHERE id IN ({})",
        placeholders.join(",")
    );

    let owned_params: Vec<Box<dyn rusqlite::types::ToSql>> = ids
        .iter()
        .map(|id| Box::new(*id) as Box<dyn rusqlite::types::ToSql>)
        .collect();
    let param_refs: Vec<&dyn rusqlite::types::ToSql> =
        owned_params.iter().map(|p| p.as_ref()).collect();

    conn.execute(&sql, param_refs.as_slice())
        .map_err(|e| napi::Error::from_reason(format!("Failed to delete trials: {}", e)))
        .map(|n| n as i64)
}
