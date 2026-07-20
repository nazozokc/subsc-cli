/**
 * Suggestions database operations.
 *
 * Stores subscription suggestions extracted from emails (or other sources)
 * and tracks their lifecycle: pending → dismissed | added.
 */

import type { SqlValue } from "sql.js"
import { getDb, execObjs, execObj, saveDb } from "./connection.ts"
import type { Suggestion } from "../suggest/types.ts"

/** Add a new suggestion to the database. */
export function writeSuggestion(data: {
  name: string
  price: number | null
  currency: string | null
  cycle: string | null
  vendorName?: string | null
  vendorUrl?: string | null
  planTier?: string | null
  paymentMethod?: string | null
  source: string
  sourceDetail?: string | null
  emailSubject?: string | null
  emailFrom?: string | null
  emailDate?: string | null
  confidence?: number
}): number {
  const db = getDb()
  db.run(
    `INSERT INTO suggestions (name, price, currency, cycle, vendor_name, vendor_url, plan_tier, payment_method, source, source_detail, email_subject, email_from, email_date, confidence)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.name,
      data.price ?? null,
      data.currency ?? null,
      data.cycle ?? null,
      data.vendorName ?? null,
      data.vendorUrl ?? null,
      data.planTier ?? null,
      data.paymentMethod ?? null,
      data.source,
      data.sourceDetail ?? null,
      data.emailSubject ?? null,
      data.emailFrom ?? null,
      data.emailDate ?? null,
      data.confidence ?? 0.0,
    ],
  )
  const idRow = execObj<Record<string, SqlValue>>(db, "SELECT last_insert_rowid() AS id")
  const id = Number(idRow?.id ?? 0)
  saveDb()
  return id
}

/** Batch insert suggestions with dedup by name+price+source (case-insensitive). */
export function writeSuggestionBatch(
  items: Array<{
    name: string
    price: number | null
    currency: string | null
    cycle: string | null
    vendorName?: string | null
    source: string
    sourceDetail?: string | null
    emailSubject?: string | null
    emailFrom?: string | null
    emailDate?: string | null
    confidence?: number
  }>,
): number {
  const db = getDb()
  let inserted = 0

  for (const item of items) {
    // Dedup: skip if same name+price+source already exists as pending
    const existing = execObjs<Record<string, SqlValue>>(
      db,
      `SELECT id FROM suggestions
       WHERE LOWER(name) = LOWER(?) AND price IS ? AND source = ? AND status = 'pending'
       LIMIT 1`,
      [item.name, item.price ?? null, item.source],
    )
    if (existing.length > 0) continue

    writeSuggestion(item)
    inserted++
  }

  return inserted
}

/** Get all suggestions with optional status filter. Returns empty array if table doesn't exist. */
export function getSuggestions(status?: "pending" | "dismissed" | "added"): Suggestion[] {
  try {
    const db = getDb()
    const conditions: string[] = []
    const params: SqlValue[] = []

    if (status) {
      conditions.push("status = ?")
      params.push(status)
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""

    return execObjs<Suggestion>(
      db,
      `SELECT id, name, price, currency, cycle, vendor_name AS vendorName,
              vendor_url AS vendorUrl, plan_tier AS planTier,
              payment_method AS paymentMethod, source, source_detail AS sourceDetail,
              email_subject AS emailSubject, email_from AS emailFrom,
              email_date AS emailDate, confidence, status,
              matched_sub_id AS matchedSubId, created_at AS createdAt
       FROM suggestions ${where}
       ORDER BY created_at DESC`,
      params.length > 0 ? params : undefined,
    )
  } catch {
    return []
  }
}

/** Get pending suggestions count. Returns 0 if table doesn't exist. */
export function getPendingSuggestionCount(): number {
  try {
    const db = getDb()
    const result = db.exec("SELECT COUNT(*) AS count FROM suggestions WHERE status = 'pending'")
    return result.length > 0 ? Number(result[0].values[0][0]) : 0
  } catch {
    return 0
  }
}

/** Get a single suggestion by id. */
export function getSuggestion(id: number): Suggestion | undefined {
  try {
    const db = getDb()
    return execObj<Suggestion>(
      db,
      `SELECT id, name, price, currency, cycle, vendor_name AS vendorName,
              vendor_url AS vendorUrl, plan_tier AS planTier,
              payment_method AS paymentMethod, source, source_detail AS sourceDetail,
              email_subject AS emailSubject, email_from AS emailFrom,
              email_date AS emailDate, confidence, status,
              matched_sub_id AS matchedSubId, created_at AS createdAt
       FROM suggestions WHERE id = ?`,
      [id],
    )
  } catch {
    return undefined
  }
}

/** Mark a suggestion as dismissed. */
export function dismissSuggestion(id: number): boolean {
  const db = getDb()
  db.run("UPDATE suggestions SET status = 'dismissed' WHERE id = ? AND status = 'pending'", [id])
  const modified = db.getRowsModified() > 0
  if (modified) saveDb()
  return modified
}

/** Mark all pending suggestions as dismissed. */
export function dismissAllSuggestions(): number {
  const db = getDb()
  db.run("UPDATE suggestions SET status = 'dismissed' WHERE status = 'pending'")
  const modified = db.getRowsModified()
  if (modified > 0) saveDb()
  return modified
}

/** Mark a suggestion as added (linked to a subscription). */
export function markSuggestionAsAdded(suggestionId: number, subscriptionId: number): void {
  const db = getDb()
  db.run(
    "UPDATE suggestions SET status = 'added', matched_sub_id = ? WHERE id = ? AND status = 'pending'",
    [subscriptionId, suggestionId],
  )
  saveDb()
}
