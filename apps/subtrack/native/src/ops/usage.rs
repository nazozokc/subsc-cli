//! LLM usage tracking: add, list, delete, totals.

use rusqlite::Connection;

use crate::types::{LlmUsageEntry, NewLlmUsageInput, ProviderBreakdown, UsageFilter, UsageTotal};

pub fn add_usage(conn: &Connection, input: &NewLlmUsageInput) -> napi::Result<LlmUsageEntry> {
    conn.execute(
        "INSERT INTO llm_usage (provider, model, input_tokens, output_tokens, cost, date, description, generation_id) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![
            input.provider, input.model, input.input_tokens, input.output_tokens,
            input.cost, input.date, input.description, input.generation_id,
        ],
    )
    .map_err(|e| napi::Error::from_reason(format!("Failed to insert usage: {}", e)))?;

    let id: i64 = conn
        .query_row("SELECT last_insert_rowid()", [], |row| row.get(0))
        .map_err(|e| napi::Error::from_reason(format!("Failed to get insert id: {}", e)))?;

    Ok(LlmUsageEntry {
        id,
        provider: input.provider.clone(),
        model: input.model.clone(),
        input_tokens: input.input_tokens,
        output_tokens: input.output_tokens,
        cost: input.cost,
        date: input.date.clone(),
        description: input.description.clone(),
        generation_id: input.generation_id.clone(),
    })
}

pub fn list_usage(conn: &Connection, filter: &UsageFilter) -> napi::Result<Vec<LlmUsageEntry>> {
    let mut wheres = Vec::new();
    let mut owned_params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(ref provider) = filter.provider {
        let idx = owned_params.len() + 1;
        wheres.push(format!("provider = ?{}", idx));
        owned_params.push(Box::new(provider.clone()));
    }
    if let Some(ref from) = filter.from {
        let idx = owned_params.len() + 1;
        wheres.push(format!("date >= ?{}", idx));
        owned_params.push(Box::new(from.clone()));
    }
    if let Some(ref to) = filter.to {
        let idx = owned_params.len() + 1;
        wheres.push(format!("date <= ?{}", idx));
        owned_params.push(Box::new(to.clone()));
    }
    if let Some(min_cost) = filter.min_cost {
        let idx = owned_params.len() + 1;
        wheres.push(format!("cost >= ?{}", idx));
        owned_params.push(Box::new(min_cost));
    }

    // Apply limit/offset after building WHERE clause
    let where_clause = if wheres.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", wheres.join(" AND "))
    };

    let limit = filter.limit.unwrap_or(100);
    let offset = filter.offset.unwrap_or(0);

    let sql = format!(
        "SELECT id, provider, model, input_tokens, output_tokens, cost, date, description, generation_id \
         FROM llm_usage {} ORDER BY date DESC, id DESC LIMIT ?{} OFFSET ?{}",
        where_clause,
        owned_params.len() + 1,
        owned_params.len() + 2,
    );

    owned_params.push(Box::new(limit));
    owned_params.push(Box::new(offset));

    let param_refs: Vec<&dyn rusqlite::types::ToSql> =
        owned_params.iter().map(|p| p.as_ref()).collect();

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| napi::Error::from_reason(format!("SQL prepare: {}", e)))?;

    let entries = stmt
        .query_map(param_refs.as_slice(), |row| {
            Ok(LlmUsageEntry {
                id: row.get(0)?,
                provider: row.get(1)?,
                model: row.get(2)?,
                input_tokens: row.get(3)?,
                output_tokens: row.get(4)?,
                cost: row.get(5)?,
                date: row.get(6)?,
                description: row.get(7)?,
                generation_id: row.get(8)?,
            })
        })
        .map_err(|e| napi::Error::from_reason(format!("SQL query: {}", e)))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(entries)
}

pub fn delete_usage(conn: &Connection, ids: &[i64]) -> napi::Result<i64> {
    if ids.is_empty() {
        return Ok(0);
    }

    let placeholders: Vec<String> = ids
        .iter()
        .enumerate()
        .map(|(i, _)| format!("?{}", i + 1))
        .collect();

    let sql = format!(
        "DELETE FROM llm_usage WHERE id IN ({})",
        placeholders.join(",")
    );

    let owned_params: Vec<Box<dyn rusqlite::types::ToSql>> = ids
        .iter()
        .map(|id| Box::new(*id) as Box<dyn rusqlite::types::ToSql>)
        .collect();
    let param_refs: Vec<&dyn rusqlite::types::ToSql> =
        owned_params.iter().map(|p| p.as_ref()).collect();

    conn.execute(&sql, param_refs.as_slice())
        .map_err(|e| napi::Error::from_reason(format!("Failed to delete usage: {}", e)))
        .map(|n| n as i64)
}

pub fn get_usage_total(
    conn: &Connection,
    from: Option<&str>,
    to: Option<&str>,
) -> napi::Result<UsageTotal> {
    let mut wheres = Vec::new();
    let mut owned_params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(f) = from {
        let idx = owned_params.len() + 1;
        wheres.push(format!("date >= ?{}", idx));
        owned_params.push(Box::new(f.to_string()));
    }
    if let Some(t) = to {
        let idx = owned_params.len() + 1;
        wheres.push(format!("date <= ?{}", idx));
        owned_params.push(Box::new(t.to_string()));
    }

    let where_clause = if wheres.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", wheres.join(" AND "))
    };

    let param_refs: Vec<&dyn rusqlite::types::ToSql> =
        owned_params.iter().map(|p| p.as_ref()).collect();

    // Get totals
    let sql = format!(
        "SELECT COALESCE(SUM(cost), 0), COALESCE(SUM(input_tokens), 0), \
         COALESCE(SUM(output_tokens), 0), \
         COALESCE(MIN(date), ''), COALESCE(MAX(date), '') \
         FROM llm_usage {}",
        where_clause
    );

    let (total_cost, total_input, total_output, _min_date, _max_date): (
        f64,
        i64,
        i64,
        String,
        String,
    ) = conn
        .query_row(&sql, param_refs.as_slice(), |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
            ))
        })
        .map_err(|e| napi::Error::from_reason(format!("SQL query: {}", e)))?;

    // Get provider breakdown
    let breakdown_sql = format!(
        "SELECT provider, COALESCE(SUM(cost), 0), \
         COALESCE(SUM(input_tokens), 0), COALESCE(SUM(output_tokens), 0) \
         FROM llm_usage {} GROUP BY provider ORDER BY provider",
        where_clause
    );

    let mut stmt = conn
        .prepare(&breakdown_sql)
        .map_err(|e| napi::Error::from_reason(format!("SQL prepare: {}", e)))?;

    let breakdown = stmt
        .query_map(param_refs.as_slice(), |row| {
            Ok(ProviderBreakdown {
                provider: row.get(0)?,
                cost: row.get(1)?,
                input_tokens: row.get(2)?,
                output_tokens: row.get(3)?,
            })
        })
        .map_err(|e| napi::Error::from_reason(format!("SQL query: {}", e)))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(UsageTotal {
        total_cost,
        total_input_tokens: total_input,
        total_output_tokens: total_output,
        provider_breakdown: breakdown,
        from: from.unwrap_or("").to_string(),
        to: to.unwrap_or("").to_string(),
    })
}
