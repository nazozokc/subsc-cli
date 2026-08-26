/**
 * Audit log database operations.
 *
 * Tracks all mutating operations (add, edit, delete, restore, import, bulk)
 * for security diagnostics and change history.
 */

import type { Database, SqlValue } from "sql.js"
import { getDb, execObjs, saveDb } from "./connection.ts"

export type AuditAction =
  | "subscription.add"
  | "subscription.edit"
  | "subscription.delete"
  | "subscription.archive"
  | "subscription.unarchive"
  | "subscription.restore"
  | "subscription.import"
  | "subscription.bulk_status"
  | "subscription.bulk_delete"
  | "subscription.bulk_tag_add"
  | "subscription.bulk_tag_remove"
  | "subscription.clone"
  | "subscription.merge"
  | "subscription.cancel"
  | "subscription.pause"
  | "subscription.resume"
  | "subscription.renew"
  | "trial.add"
  | "trial.delete"
  | "tag.rename"
  | "tag.delete"
  | "tag.prune"
  | "tag.merge"
  | "config.set"
  | "config.reset"
  | "backup.restore"
  | "usage.add"
  | "usage.edit"
  | "usage.delete"
  | "cleanup"
  | "suggestion.receipt"
  | "template.add"
  | "template.edit"
  | "template.delete"
  | "template.use"

export type AuditEntry = {
  id: number
  action: AuditAction
  target_type: string | null
  target_id: number | null
  details: string | null
  created_at: string
}

export type AddAuditArgs = {
  action: AuditAction
  targetType?: string | null
  targetId?: number | null
  details?: string | null
}

/** Create the audit_log table (called from schema migrations). */
export function createAuditTable(db: Database): void {
  db.run(`CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id INTEGER,
    details TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_audit_target ON audit_log(target_type, target_id)`)
}

/** Insert an audit log entry. */
export function addAuditLog(args: AddAuditArgs): void {
  const db = getDb()
  try {
    db.run(
      `INSERT INTO audit_log (action, target_type, target_id, details) VALUES (?, ?, ?, ?)`,
      [args.action, args.targetType ?? null, args.targetId ?? null, args.details ?? null],
    )
    saveDb()
  } catch {
    // Silently ignore if table doesn't exist (test environments, first-run edge cases)
  }
}

/** Query audit log entries with optional filters. */
export function getAuditLogs(options: {
  action?: string
  limit?: number
  offset?: number
  from?: string
  to?: string
} = {}): AuditEntry[] {
  const conditions: string[] = []
  const params: SqlValue[] = []

  if (options.action) {
    conditions.push("action = ?")
    params.push(options.action)
  }
  if (options.from) {
    conditions.push("created_at >= ?")
    params.push(options.from)
  }
  if (options.to) {
    conditions.push("created_at <= ?")
    params.push(options.to + "T23:59:59")
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""
  const limit = options.limit ?? 50
  const offset = options.offset ?? 0

  return execObjs<AuditEntry>(
    getDb(),
    `SELECT * FROM audit_log ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset] as SqlValue[],
  )
}

/** Get the count of audit log entries (with optional filters). */
export function getAuditLogCount(options: { action?: string; from?: string; to?: string } = {}): number {
  const conditions: string[] = []
  const params: SqlValue[] = []

  if (options.action) {
    conditions.push("action = ?")
    params.push(options.action)
  }
  if (options.from) {
    conditions.push("created_at >= ?")
    params.push(options.from)
  }
  if (options.to) {
    conditions.push("created_at <= ?")
    params.push(options.to + "T23:59:59")
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""
  const result = getDb().exec(`SELECT COUNT(*) AS count FROM audit_log ${where}`, params)
  return result.length > 0 ? Number(result[0].values[0][0]) : 0
}

/** Prune audit log entries older than a given date. */
export function pruneAuditLogs(before: string): number {
  const db = getDb()
  db.run("DELETE FROM audit_log WHERE created_at < ?", [before])
  return db.getRowsModified()
}
