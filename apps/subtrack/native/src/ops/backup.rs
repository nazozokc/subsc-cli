//! Backup and restore operations.

use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use rusqlite::Connection;

use crate::types::BackupFileInfo;

/// Create a gzip-compressed backup of the database file.
pub fn backup_database(
    conn: &Connection,
    _db_path: &Path,
    destination: &str,
    _encrypt: bool, // will be handled by TS-level crypto
) -> napi::Result<String> {
    use std::fs;
    use std::io::{Read, Write};

    let dest_path = PathBuf::from(destination);
    fs::create_dir_all(&dest_path)
        .map_err(|e| napi::Error::from_reason(format!("Failed to create backup dir: {}", e)))?;

    // Create a temporary backup of the in-memory DB
    let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S");
    let backup_filename = format!("subtrack_backup_{}.db.gz", timestamp);
    let backup_path = dest_path.join(&backup_filename);

    // Dump in-memory DB to temp file
    let temp_dir = std::env::temp_dir();
    let temp_path = temp_dir.join(format!("subtrack_backup_{}.db", timestamp));

    {
        let mut temp_conn = rusqlite::Connection::open(&temp_path)
            .map_err(|e| napi::Error::from_reason(format!("Failed to create temp DB: {}", e)))?;

        let backup = rusqlite::backup::Backup::new(conn, &mut temp_conn)
            .map_err(|e| napi::Error::from_reason(format!("Failed to create backup: {}", e)))?;

        backup
            .run_to_completion(100, std::time::Duration::from_millis(0), None)
            .map_err(|e| napi::Error::from_reason(format!("Backup failed: {}", e)))?;
    }

    // Compress with gzip
    let mut raw_data = Vec::new();
    fs::File::open(&temp_path)
        .map_err(|e| napi::Error::from_reason(format!("Failed to read temp: {}", e)))?
        .read_to_end(&mut raw_data)
        .map_err(|e| napi::Error::from_reason(format!("Failed to read temp: {}", e)))?;

    let mut encoder = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
    encoder
        .write_all(&raw_data)
        .map_err(|e| napi::Error::from_reason(format!("Gzip compression failed: {}", e)))?;
    let compressed = encoder
        .finish()
        .map_err(|e| napi::Error::from_reason(format!("Gzip finalize failed: {}", e)))?;

    fs::write(&backup_path, &compressed)
        .map_err(|e| napi::Error::from_reason(format!("Failed to write backup: {}", e)))?;

    fs::remove_file(&temp_path).ok();

    Ok(backup_path.to_string_lossy().to_string())
}

/// List backup files in a directory.
pub fn list_backups(dir: &Path) -> napi::Result<Vec<BackupFileInfo>> {
    use std::fs;

    let mut backups = Vec::new();

    if !dir.exists() {
        return Ok(backups);
    }

    let entries = fs::read_dir(dir)
        .map_err(|e| napi::Error::from_reason(format!("Failed to read backup dir: {}", e)))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("gz")
            && path
                .file_name()
                .and_then(|n| n.to_str())
                .map(|n| n.starts_with("subtrack_backup_"))
                .unwrap_or(false)
        {
            let (mtime, size) = fs::metadata(&path)
                .ok()
                .map(|m| {
                    let size = m.len() as i64;
                    let mtime = m
                        .modified()
                        .ok()
                        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                        .map(|d| d.as_secs_f64())
                        .unwrap_or(0.0);
                    (mtime, size)
                })
                .unwrap_or((0.0, 0));

            backups.push(BackupFileInfo {
                name: entry.file_name().to_string_lossy().to_string(),
                path: path.to_string_lossy().to_string(),
                mtime,
                size,
            });
        }
    }

    backups.sort_by(|a, b| {
        b.mtime
            .partial_cmp(&a.mtime)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    Ok(backups)
}

/// Restore a gzip-compressed backup file into the in-memory database.
pub fn restore_database(conn: &mut Connection, source: &Path) -> napi::Result<()> {
    use std::fs;
    use std::io::Read;

    // Read and decompress
    let mut compressed = Vec::new();
    fs::File::open(source)
        .map_err(|e| napi::Error::from_reason(format!("Failed to read backup: {}", e)))?
        .read_to_end(&mut compressed)
        .map_err(|e| napi::Error::from_reason(format!("Failed to read backup: {}", e)))?;

    let mut decoder = flate2::read::GzDecoder::new(&compressed[..]);
    let mut raw_data = Vec::new();
    decoder
        .read_to_end(&mut raw_data)
        .map_err(|e| napi::Error::from_reason(format!("Gzip decompression failed: {}", e)))?;

    // Write to temp file and restore via backup API
    let temp_dir = std::env::temp_dir();
    let temp_path = temp_dir.join("subtrack_restore_temp.db");
    fs::write(&temp_path, &raw_data)
        .map_err(|e| napi::Error::from_reason(format!("Failed to write temp: {}", e)))?;

    let temp_conn = rusqlite::Connection::open_with_flags(
        &temp_path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
    )
    .map_err(|e| napi::Error::from_reason(format!("Failed to open temp DB: {}", e)))?;

    let backup = rusqlite::backup::Backup::new(&temp_conn, conn)
        .map_err(|e| napi::Error::from_reason(format!("Failed to create backup: {}", e)))?;

    backup
        .run_to_completion(100, std::time::Duration::from_millis(0), None)
        .map_err(|e| napi::Error::from_reason(format!("Restore failed: {}", e)))?;

    fs::remove_file(&temp_path).ok();

    Ok(())
}
