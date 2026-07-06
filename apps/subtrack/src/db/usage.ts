import type { SqlValue } from "sql.js"
import { getDb, execObjs, execObj, saveDb } from "./connection.ts"
import type { LlmUsageEntry, AddLlmUsageArgs, AddLlmUsageFromLogArgs, GetLlmUsageOptions } from "../types.ts"

export const addLlmUsage = (data: AddLlmUsageArgs): void => {
  const db = getDb()
  db.run(
    `INSERT INTO llm_usage (provider, model, input_tokens, output_tokens, cost, date, description)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      data.provider,
      data.model,
      data.input_tokens,
      data.output_tokens,
      data.cost,
      data.date,
      data.description,
    ],
  )
  saveDb()
}

/** Add from log import if not duplicate (by generation_id). Returns true if added, false if duplicate. */
export const addLlmUsageFromLog = (data: AddLlmUsageFromLogArgs): boolean => {
  const db = getDb()

  // Dedup: skip if generation_id already exists
  if (data.generation_id) {
    const existing = execObj<{ id: number }>(
      db,
      "SELECT id FROM llm_usage WHERE generation_id = ?",
      [data.generation_id],
    )
    if (existing) return false
  }

  db.run(
    `INSERT INTO llm_usage (provider, model, input_tokens, output_tokens, cost, date, description, generation_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.provider,
      data.model,
      data.input_tokens,
      data.output_tokens,
      data.cost,
      data.date,
      data.description,
      data.generation_id ?? null,
    ],
  )
  saveDb()
  return true
}

/**
 * Batch add usage entries from log sources.
 * Checks all generation_ids upfront, inserts new entries in a single transaction.
 * Much faster than calling addLlmUsageFromLog individually for each entry.
 */
export const batchAddLlmUsageFromLog = (
  entries: AddLlmUsageFromLogArgs[],
): { added: number; skipped: number } => {
  if (entries.length === 0) return { added: 0, skipped: 0 }

  const db = getDb()

  // Collect existing generation_ids for dedup
  const existing = new Set<string>()
  const rows = execObjs<{ generation_id: string | null }>(
    db,
    "SELECT generation_id FROM llm_usage WHERE generation_id IS NOT NULL",
  )
  for (const row of rows) {
    if (row.generation_id) existing.add(row.generation_id)
  }

  let added = 0
  let skipped = 0

  db.run("BEGIN TRANSACTION")
  try {
    for (const entry of entries) {
      if (existing.has(entry.generation_id)) {
        skipped++
        continue
      }
      existing.add(entry.generation_id)

      db.run(
        `INSERT INTO llm_usage (provider, model, input_tokens, output_tokens, cost, date, description, generation_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entry.provider,
          entry.model,
          entry.input_tokens,
          entry.output_tokens,
          entry.cost,
          entry.date,
          entry.description,
          entry.generation_id,
        ],
      )
      added++
    }
    db.run("COMMIT")
    saveDb()
  } catch (error) {
    db.run("ROLLBACK")
    throw error
  }

  return { added, skipped }
}

export const getLlmUsage = (options?: GetLlmUsageOptions): LlmUsageEntry[] => {
  const db = getDb()

  const conditions: string[] = []
  const params: SqlValue[] = []

  if (options?.provider) {
    conditions.push("provider = ?")
    params.push(options.provider)
  }
  if (options?.from) {
    conditions.push("date >= ?")
    params.push(options.from)
  }
  if (options?.to) {
    conditions.push("date <= ?")
    params.push(options.to)
  }
  if (options?.minCost !== undefined) {
    conditions.push("cost >= ?")
    params.push(options.minCost)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""
  const limitClause = options?.limit ? ` LIMIT ?` : ""
  if (options?.limit) params.push(options.limit)
  const offsetClause = options?.offset ? ` OFFSET ?` : ""
  if (options?.offset) params.push(options.offset)

  return execObjs<LlmUsageEntry>(
    db,
    `SELECT id, provider, model, input_tokens, output_tokens, cost, date, description
     FROM llm_usage ${where} ORDER BY date DESC, id DESC${limitClause}${offsetClause}`,
    params,
  )
}

export const deleteLlmUsage = (id: number): boolean => {
  const db = getDb()
  db.run("DELETE FROM llm_usage WHERE id = ?", [id])
  const modified = db.getRowsModified() > 0
  if (modified) saveDb()
  return modified
}

/** Sum `cost` for all entries whose `date` falls within [from, to]. Returns USD cents. */
export const getLlmUsageTotal = (from: string, to: string): number => {
  const db = getDb()
  const row = execObj<{ total: number }>(
    db,
    "SELECT COALESCE(SUM(cost), 0) AS total FROM llm_usage WHERE date >= ? AND date <= ?",
    [from, to],
  )
  return row?.total ?? 0
}

/** Get the sum of `cost` grouped by provider for a date range. */
export const getLlmUsageTotalByProvider = (
  from: string,
  to: string,
): { provider: string; total: number }[] => {
  const db = getDb()
  return execObjs<{ provider: string; total: number }>(
    db,
    `SELECT provider, SUM(cost) AS total
     FROM llm_usage
     WHERE date >= ? AND date <= ?
     GROUP BY provider
     ORDER BY total DESC`,
    [from, to],
  )
}
