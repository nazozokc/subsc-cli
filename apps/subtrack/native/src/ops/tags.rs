//! Tag operations: list, rename, delete, prune, merge.

use rusqlite::Connection;

use crate::types::Tag;

pub fn list_tags(conn: &Connection) -> napi::Result<Vec<Tag>> {
    let mut stmt = conn
        .prepare(
            "SELECT t.id, t.name, COUNT(st.subscription_id) AS cnt \
             FROM tags t \
             LEFT JOIN subscription_tags st ON st.tag_id = t.id \
             GROUP BY t.id, t.name \
             ORDER BY t.name",
        )
        .map_err(|e| napi::Error::from_reason(format!("SQL prepare: {}", e)))?;

    let tags = stmt
        .query_map([], |row| {
            Ok(Tag {
                id: row.get(0)?,
                name: row.get(1)?,
                count: row.get(2)?,
            })
        })
        .map_err(|e| napi::Error::from_reason(format!("SQL query: {}", e)))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(tags)
}

pub fn rename_tag(conn: &Connection, old_name: &str, new_name: &str) -> napi::Result<()> {
    let updated = conn
        .execute(
            "UPDATE tags SET name = ?1 WHERE name = ?2",
            rusqlite::params![new_name, old_name],
        )
        .map_err(|e| napi::Error::from_reason(format!("Failed to rename tag: {}", e)))?;

    if updated == 0 {
        return Err(napi::Error::from_reason(format!(
            "Tag '{}' not found",
            old_name
        )));
    }
    Ok(())
}

pub fn delete_tag(conn: &Connection, name: &str) -> napi::Result<i64> {
    // CASCADE will remove subscription_tags rows
    let deleted = conn
        .execute("DELETE FROM tags WHERE name = ?1", [name])
        .map_err(|e| napi::Error::from_reason(format!("Failed to delete tag: {}", e)))?;

    Ok(deleted as i64)
}

pub fn prune_tags(conn: &Connection) -> napi::Result<i64> {
    let deleted = conn
        .execute(
            "DELETE FROM tags WHERE id NOT IN (SELECT DISTINCT tag_id FROM subscription_tags)",
            [],
        )
        .map_err(|e| napi::Error::from_reason(format!("Failed to prune tags: {}", e)))?;

    Ok(deleted as i64)
}

pub fn merge_tags(conn: &Connection, source: &str, target: &str) -> napi::Result<i64> {
    // Ensure target exists
    conn.execute("INSERT OR IGNORE INTO tags (name) VALUES (?1)", [target])
        .map_err(|e| napi::Error::from_reason(format!("Failed to ensure target tag: {}", e)))?;

    let target_id: i64 = conn
        .query_row("SELECT id FROM tags WHERE name = ?1", [target], |row| {
            row.get(0)
        })
        .map_err(|e| napi::Error::from_reason(format!("Failed to get target tag id: {}", e)))?;

    let source_id: i64 = conn
        .query_row("SELECT id FROM tags WHERE name = ?1", [source], |row| {
            row.get(0)
        })
        .map_err(|e| napi::Error::from_reason(format!("Tag '{}' not found: {}", source, e)))?;

    // Re-assign subscriptions from source to target (skip duplicates)
    conn.execute(
        "INSERT OR IGNORE INTO subscription_tags (subscription_id, tag_id) \
         SELECT subscription_id, ?1 FROM subscription_tags WHERE tag_id = ?2",
        rusqlite::params![target_id, source_id],
    )
    .map_err(|e| napi::Error::from_reason(format!("Failed to reassign tags: {}", e)))?;

    let merged = conn
        .execute(
            "DELETE FROM subscription_tags WHERE tag_id = ?1",
            [source_id],
        )
        .map_err(|e| napi::Error::from_reason(format!("Failed to clean up source: {}", e)))?
        as i64;

    conn.execute("DELETE FROM tags WHERE id = ?1", [source_id])
        .ok();

    Ok(merged)
}
