//! Database module: initialization, persistence, and helpers.

pub mod schema;

use std::path::{Path, PathBuf};

use rusqlite::{Connection, OpenFlags};

use crate::crypto::Crypto;

/// The core database handle.
/// All access is serialized by the outer `Mutex<Database>` in lib.rs.
pub struct Database {
    pub conn: Connection,
    pub db_path: Option<PathBuf>,
    pub crypto: Option<Crypto>,
}

impl Database {
    /// Open or create a database in `db_dir`.
    /// If `passphrase` is Some, use passphrase-derived key; else use key file.
    pub fn open(db_dir: &Path, passphrase: Option<String>) -> napi::Result<Self> {
        use std::fs;

        fs::create_dir_all(db_dir)
            .map_err(|e| napi::Error::from_reason(format!("Failed to create db dir: {}", e)))?;

        let db_path = db_dir.join("subtrack.db");
        let crypto = Some(Crypto::new(db_dir.to_path_buf(), passphrase)?);

        let conn = if db_path.exists() {
            let raw = fs::read(&db_path)
                .map_err(|e| napi::Error::from_reason(format!("Failed to read db file: {}", e)))?;

            let data = if Crypto::is_encrypted(&raw) {
                crypto.as_ref().unwrap().decrypt(&raw)?
            } else {
                raw
            };

            // Write decrypted data to temp file, then load into in-memory DB
            let temp_path = db_dir.join(".subtrack_load_temp.db");
            fs::write(&temp_path, &data)
                .map_err(|e| napi::Error::from_reason(format!("Failed to write temp: {}", e)))?;

            let mut conn = Connection::open_in_memory().map_err(|e| {
                napi::Error::from_reason(format!("Failed to open in-memory DB: {}", e))
            })?;

            conn.execute_batch("PRAGMA foreign_keys = ON; PRAGMA secure_delete = ON;")
                .map_err(|e| napi::Error::from_reason(e.to_string()))?;

            {
                let temp_conn =
                    Connection::open_with_flags(&temp_path, OpenFlags::SQLITE_OPEN_READ_ONLY)
                        .map_err(|e| {
                            napi::Error::from_reason(format!("Failed to open temp DB: {}", e))
                        })?;

                let backup = rusqlite::backup::Backup::new(&temp_conn, &mut conn).map_err(|e| {
                    napi::Error::from_reason(format!("Failed to create backup: {}", e))
                })?;

                backup
                    .run_to_completion(100, std::time::Duration::from_millis(0), None)
                    .map_err(|e| {
                        napi::Error::from_reason(format!("Backup restore failed: {}", e))
                    })?;
            }

            fs::remove_file(&temp_path).ok();
            conn
        } else {
            let conn = Connection::open_in_memory().map_err(|e| {
                napi::Error::from_reason(format!("Failed to open in-memory DB: {}", e))
            })?;
            conn.execute_batch("PRAGMA foreign_keys = ON; PRAGMA secure_delete = ON;")
                .map_err(|e| napi::Error::from_reason(e.to_string()))?;
            conn
        };

        // Run migrations
        schema::run_migrations(&conn)?;

        // Integrity check
        let integrity: String = conn
            .query_row("PRAGMA integrity_check", [], |row| row.get(0))
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;

        if integrity != "ok" {
            log::warn!("Database integrity check: {}", integrity);
        }

        Ok(Self {
            conn,
            db_path: Some(db_path),
            crypto,
        })
    }

    /// Write the in-memory database to disk (encrypted).
    pub fn save(&self) -> napi::Result<()> {
        use std::fs;

        let db_path = self
            .db_path
            .as_ref()
            .ok_or_else(|| napi::Error::from_reason("No database path set".to_string()))?;

        // Backup in-memory DB to a temp file
        let temp_path = db_path.with_extension("db.tmp_save");
        {
            let mut temp_conn = Connection::open(&temp_path)
                .map_err(|e| napi::Error::from_reason(format!("Failed to open temp DB: {}", e)))?;

            let backup = rusqlite::backup::Backup::new(&self.conn, &mut temp_conn)
                .map_err(|e| napi::Error::from_reason(format!("Failed to create backup: {}", e)))?;

            backup
                .run_to_completion(100, std::time::Duration::from_millis(0), None)
                .map_err(|e| napi::Error::from_reason(format!("Backup failed: {}", e)))?;
        }

        // Read temp file, encrypt, write to final destination
        let raw = fs::read(&temp_path)
            .map_err(|e| napi::Error::from_reason(format!("Failed to read temp: {}", e)))?;

        let data = if let Some(ref c) = self.crypto {
            c.encrypt(&raw)
        } else {
            raw
        };

        fs::write(db_path, &data)
            .map_err(|e| napi::Error::from_reason(format!("Failed to write DB: {}", e)))?;

        fs::remove_file(&temp_path).ok();
        Ok(())
    }
}
