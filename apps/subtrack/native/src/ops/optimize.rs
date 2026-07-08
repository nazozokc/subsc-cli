//! Optimization suggestions for reducing subscription costs.

use rusqlite::Connection;

use crate::types::OptimizationSuggestion;

pub fn get_optimization_suggestions(
    conn: &Connection,
    min_savings: Option<i64>,
) -> napi::Result<Vec<OptimizationSuggestion>> {
    let min = min_savings.unwrap_or(0);
    let mut suggestions = Vec::new();

    // 1. Find duplicate subscriptions (same name, different IDs)
    let mut stmt = conn
        .prepare(
            "SELECT s1.id, s1.name, s1.price, s1.currency, s2.id, s2.price, s2.currency \
             FROM subscriptions s1 \
             JOIN subscriptions s2 ON s1.name = s2.name AND s1.id < s2.id \
             WHERE s1.status != 'archived' AND s2.status != 'archived' \
             ORDER BY s1.name",
        )
        .map_err(|e| napi::Error::from_reason(format!("SQL prepare: {}", e)))?;

    let duplicates = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, i64>(5)?,
                row.get::<_, String>(6)?,
            ))
        })
        .map_err(|e| napi::Error::from_reason(format!("SQL query: {}", e)))?
        .filter_map(|r| r.ok())
        .collect::<Vec<_>>();

    for (name, p1, c1, p2, c2) in &duplicates {
        let smaller = (*p1).min(*p2);
        let currency = if c1 == c2 {
            c1.clone()
        } else {
            String::from("N/A")
        };
        suggestions.push(OptimizationSuggestion {
            category: "duplicate".to_string(),
            message: format!(
                "Duplicate subscription '{}': consider keeping the cheaper one (save ~{}/mo)",
                name, smaller
            ),
            potential_savings: Some(smaller),
            currency: Some(currency),
        });
    }

    // 2. Find unused/archived subscriptions
    let unused_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM subscriptions WHERE status = 'cancelled' OR status = 'archived'",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    if unused_count > 0 {
        suggestions.push(OptimizationSuggestion {
            category: "cleanup".to_string(),
            message: format!(
                "You have {} cancelled/archived subscriptions. Consider cleaning them up.",
                unused_count
            ),
            potential_savings: None,
            currency: None,
        });
    }

    // 3. Find subscriptions with no tags (uncategorized)
    let untagged_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM subscriptions s \
             WHERE s.status != 'archived' \
             AND NOT EXISTS (SELECT 1 FROM subscription_tags st WHERE st.subscription_id = s.id)",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    if untagged_count > 0 {
        suggestions.push(OptimizationSuggestion {
            category: "organization".to_string(),
            message: format!(
                "{} subscriptions are not tagged. Adding tags helps with analysis.",
                untagged_count
            ),
            potential_savings: None,
            currency: None,
        });
    }

    // 4. Find yearly subscriptions that could be switched to monthly (cash flow)
    let mut stmt = conn
        .prepare(
            "SELECT s.name, s.price, s.currency FROM subscriptions s \
             WHERE s.cycle = 'yearly' AND s.status != 'archived' \
             ORDER BY s.price DESC LIMIT 5",
        )
        .map_err(|e| napi::Error::from_reason(format!("SQL prepare: {}", e)))?;

    let yearly_bills = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(|e| napi::Error::from_reason(format!("SQL query: {}", e)))?
        .filter_map(|r| r.ok())
        .collect::<Vec<_>>();

    for (name, price, currency) in &yearly_bills {
        suggestions.push(OptimizationSuggestion {
            category: "cashflow".to_string(),
            message: format!(
                "'{}' costs {}/yr ({}). Consider if you still need it.",
                name, price, currency
            ),
            potential_savings: Some(*price),
            currency: Some(currency.clone()),
        });
    }

    // Filter by minimum savings
    if min > 0 {
        suggestions.retain(|s| s.potential_savings.map(|v| v >= min).unwrap_or(true));
    }

    Ok(suggestions)
}
