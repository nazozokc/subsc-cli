//! Calendar, timeline, upcoming bills, and price history operations.

use rusqlite::Connection;

use crate::types::*;

pub fn get_upcoming_bills(conn: &Connection, days: Option<i64>) -> napi::Result<Vec<UpcomingBill>> {
    let days_val = days.unwrap_or(7).max(1);
    let day_str = format!("+{} days", days_val);

    let mut stmt = conn
        .prepare(
            "SELECT s.id, s.name, s.price, s.currency, \
             CASE \
               WHEN s.billing_day IS NOT NULL THEN \
                 CASE \
                   WHEN s.billing_day >= CAST(strftime('%d', 'now') AS INTEGER) \
                   THEN date('now', printf('+%d days', s.billing_day - CAST(strftime('%d', 'now') AS INTEGER))) \
                   ELSE date('now', 'start of month', printf('+%d days', s.billing_day - 1), '+1 month') \
                 END \
               ELSE date('now', printf('+%d days', CAST(strftime('%d', 'now') AS INTEGER) % 28)) \
             END AS due_date \
             FROM subscriptions s \
             WHERE s.status = 'active' \
               AND due_date >= date('now') \
               AND due_date <= date('now', ?1) \
             ORDER BY due_date ASC",
        )
        .map_err(|e| napi::Error::from_reason(format!("SQL prepare: {}", e)))?;

    let bills = stmt
        .query_map([&day_str], |row| {
            let due_date: String = row.get(4)?;
            let today = chrono::Utc::now().date_naive();
            let due_naive =
                chrono::NaiveDate::parse_from_str(&due_date, "%Y-%m-%d").unwrap_or(today);
            let days_until = (due_naive - today).num_days().max(0);

            Ok(UpcomingBill {
                subscription_id: row.get(0)?,
                name: row.get(1)?,
                amount: row.get(2)?,
                currency: row.get(3)?,
                due_date,
                days_until,
            })
        })
        .map_err(|e| napi::Error::from_reason(format!("SQL query: {}", e)))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(bills)
}

pub fn get_calendar_data(
    conn: &Connection,
    year: Option<i64>,
    month: Option<i64>,
) -> napi::Result<CalendarData> {
    let now = chrono::Utc::now();
    let y: i64 = year.unwrap_or_else(|| now.format("%Y").to_string().parse().unwrap_or(2026));
    let m: i64 = month.unwrap_or_else(|| now.format("%m").to_string().parse().unwrap_or(1));

    let m_clamped = m.clamp(1, 12);

    let mut stmt = conn
        .prepare(
            "SELECT s.id, s.name, s.price, s.currency, s.status, \
             CASE \
               WHEN s.billing_day IS NOT NULL THEN \
                 printf('%04d-%02d-%02d', ?1, ?2, MIN(s.billing_day, 31)) \
               ELSE date('now') \
             END AS event_date \
             FROM subscriptions s \
             WHERE s.status != 'archived' \
               AND s.billing_day IS NOT NULL \
             ORDER BY s.billing_day ASC",
        )
        .map_err(|e| napi::Error::from_reason(format!("SQL prepare: {}", e)))?;

    let events: Vec<CalendarEvent> = stmt
        .query_map(rusqlite::params![y, m_clamped], |row| {
            let date: String = row.get(5)?;
            Ok(CalendarEvent {
                date,
                subscription_id: row.get(0)?,
                name: row.get(1)?,
                amount: row.get(2)?,
                currency: row.get(3)?,
                status: row.get(4)?,
            })
        })
        .map_err(|e| napi::Error::from_reason(format!("SQL query: {}", e)))?
        .filter_map(|r| r.ok())
        .filter(|e| e.date.starts_with(&format!("{}-{:02}", y, m_clamped)))
        .collect();

    let total: i64 = events.iter().map(|e| e.amount).sum();

    Ok(CalendarData {
        year: y,
        month: m_clamped as i64,
        events,
        total,
    })
}

pub fn get_timeline(conn: &Connection, months: Option<i64>) -> napi::Result<Vec<TimelineEntry>> {
    let num_months = months.unwrap_or(12).max(1).min(60);

    // Get active subscriptions with monthly values
    let mut stmt = conn
        .prepare(
            "SELECT s.id, s.name, s.price, s.currency, s.cycle, s.created_at \
             FROM subscriptions s WHERE s.status != 'archived' ORDER BY s.created_at",
        )
        .map_err(|e| napi::Error::from_reason(format!("SQL prepare: {}", e)))?;

    let subs: Vec<(i64, String, i64, String, String, String)> = stmt
        .query_map([], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
                row.get(5)?,
            ))
        })
        .map_err(|e| napi::Error::from_reason(format!("SQL query: {}", e)))?
        .filter_map(|r| r.ok())
        .collect();

    let now = chrono::Utc::now();
    let mut entries = Vec::new();

    for i in (0..num_months).rev() {
        let dt = now - chrono::Months::new(i as u32);
        let month_key = dt.format("%Y-%m").to_string();

        let mut total = 0.0f64;
        let mut count = 0i64;
        let mut names = Vec::new();

        for (_id, name, price, _currency, cycle, created_at) in &subs {
            // Check if subscription existed in this month
            if let Ok(created) = chrono::NaiveDate::parse_from_str(created_at, "%Y-%m-%d") {
                let month_start = dt.format("%Y-%m-01").to_string();
                if let Ok(ms) = chrono::NaiveDate::parse_from_str(&month_start, "%Y-%m-%d") {
                    if created <= ms + chrono::Months::new(1) - chrono::Duration::days(1) {
                        let monthly =
                            *price as f64 * super::payment::cycle_to_monthly_factor(cycle);
                        total += monthly;
                        count += 1;
                        names.push(name.clone());
                    }
                }
            } else {
                let monthly = *price as f64 * super::payment::cycle_to_monthly_factor(cycle);
                total += monthly;
                count += 1;
                names.push(name.clone());
            }
        }

        entries.push(TimelineEntry {
            month: month_key,
            total: (total * 100.0).round() / 100.0,
            count,
            subscriptions: names,
        });
    }

    Ok(entries)
}

pub fn get_price_history(
    conn: &Connection,
    sub_id: Option<i64>,
    days: Option<i64>,
) -> napi::Result<Vec<PriceHistoryEntry>> {
    use crate::types::PriceHistoryEntry;

    let mut wheres = Vec::new();
    let mut owned_params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(id) = sub_id {
        let idx = owned_params.len() + 1;
        wheres.push(format!("ph.subscription_id = ?{}", idx));
        owned_params.push(Box::new(id));
    }

    if let Some(d) = days {
        let idx = owned_params.len() + 1;
        wheres.push(format!("ph.changed_at >= datetime('now', ?{})", idx));
        owned_params.push(Box::new(format!("-{} days", d)));
    }

    let where_clause = if wheres.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", wheres.join(" AND "))
    };

    let sql = format!(
        "SELECT ph.id, ph.subscription_id, COALESCE(s.name, 'Deleted'), \
         ph.old_price, ph.new_price, ph.old_currency, ph.new_currency, ph.changed_at \
         FROM price_history ph \
         LEFT JOIN subscriptions s ON s.id = ph.subscription_id \
         {} ORDER BY ph.changed_at DESC",
        where_clause
    );

    let param_refs: Vec<&dyn rusqlite::types::ToSql> =
        owned_params.iter().map(|p| p.as_ref()).collect();

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| napi::Error::from_reason(format!("SQL prepare: {}", e)))?;

    let entries = stmt
        .query_map(param_refs.as_slice(), |row| {
            Ok(PriceHistoryEntry {
                id: row.get(0)?,
                subscription_id: row.get(1)?,
                subscription_name: row.get(2)?,
                old_price: row.get(3)?,
                new_price: row.get(4)?,
                old_currency: row.get(5)?,
                new_currency: row.get(6)?,
                changed_at: row.get(7)?,
            })
        })
        .map_err(|e| napi::Error::from_reason(format!("SQL query: {}", e)))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(entries)
}

pub fn get_price_history_by_sub_id(
    conn: &Connection,
    sub_id: i64,
) -> napi::Result<Vec<PriceHistoryEntry>> {
    get_price_history(conn, Some(sub_id), None)
}
