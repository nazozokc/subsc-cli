import { readFileSync, existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { consola } from "consola"
import initSqlJs from "sql.js"
import type { Database } from "sql.js"
import type { AddLlmUsageFromLogArgs } from "./types.ts"
import { defineScanner, type ScanResult } from "./scanner-types.ts"
import { safeJsonParse } from "./safe-json.ts"
import { dateToStartOfDayMs, dateToEndOfDayMs } from "./date-utils.ts"

const _SQL = await initSqlJs()

const DEFAULT_DB_PATHS = [
  join(homedir(), ".local", "share", "opencode", "opencode.db"),
]

/**
 * Find the OpenCode SQLite database file path.
 * Returns null if not found at any known location.
 */
function findOpenCodeDb(): string | null {
  for (const p of DEFAULT_DB_PATHS) {
    if (existsSync(p)) return p
  }
  return null
}

/**
 * Parse a single message row from OpenCode's `message` table.
 * Extracts token usage, model info, cost, and timestamp.
 * Returns null if the entry doesn't contain usable usage data.
 */
function parseMessage(
  msgId: string,
  dataJson: string,
): AddLlmUsageFromLogArgs | null {
  let data: Record<string, unknown>
  try {
    data = safeJsonParse<Record<string, unknown>>(dataJson)
  } catch {
    return null
  }

  const tokens = data.tokens as Record<string, unknown> | undefined
  if (!tokens || typeof tokens.input !== "number") return null

  const inputTokens = tokens.input as number
  const outputTokens = (tokens.output as number) ?? 0
  const cost = (data.cost as number) ?? 0
  const model = (data.modelID as string) ?? "unknown"
  const provider = (data.providerID as string) ?? (data.provider as string) ?? "unknown"

  // OpenCode stores cost in cents (same unit as subtrack)
  return {
    provider,
    model,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost,
    date: extractDate(data),
    description: null,
    generation_id: msgId,
  }
}

/**
 * Extract date from OpenCode message data.
 */
function extractDate(data: Record<string, unknown>): string {
  const timestamp = (data.time as Record<string, unknown>)?.created as number | undefined
  if (timestamp) {
    // OpenCode stores timestamps in milliseconds — use directly
    return new Date(timestamp).toISOString().split("T")[0]
  }
  return new Date().toISOString().split("T")[0]
}

/**
 * Scan the OpenCode database and extract LLM usage entries.
 * Optionally filter by date range (YYYY-MM-DD).
 */
export function scanOpenCodeDb(from?: string, to?: string): ScanResult {
  const dbPath = findOpenCodeDb()
  if (!dbPath) {
    consola.info("OpenCode DB not found — skip")
    return { source: "opencode", entries: [] }
  }

  if (!existsSync(dbPath)) {
    consola.info("OpenCode DB not found — skip")
    return { source: "opencode", entries: [] }
  }

  consola.info(`Reading OpenCode DB: ${dbPath}`)

  let data: Buffer
  try {
    data = readFileSync(dbPath)
  } catch (err) {
    consola.warn(`Cannot read OpenCode DB: ${String(err)}`)
    return { source: "opencode", entries: [] }
  }

  let db: InstanceType<typeof _SQL.Database> | null = null
  const entries: AddLlmUsageFromLogArgs[] = []

  try {
    db = new _SQL.Database(data)

    let sql = `SELECT id, data FROM message WHERE json_extract(data, '$.tokens.input') IS NOT NULL`
    const params: (number | string)[] = []

    if (from) {
      sql += ` AND json_extract(data, '$.time.created') >= ?`
      params.push(dateToStartOfDayMs(from))
    }
    if (to) {
      sql += ` AND json_extract(data, '$.time.created') <= ?`
      params.push(dateToEndOfDayMs(to))
    }

    const results = db.exec(sql, params)

    if (results.length === 0) {
      consola.info("No token usage data found in OpenCode DB")
      return { source: "opencode", entries: [] }
    }

    const { columns, values } = results[0]
    const idIdx = columns.indexOf("id")
    const dataIdx = columns.indexOf("data")

    for (const row of values) {
      const msgId = String(row[idIdx])
      const rawJson = String(row[dataIdx])

      const parsed = parseMessage(msgId, rawJson)
      if (parsed) entries.push(parsed)
    }
  } catch (err) {
    consola.warn(`Error scanning OpenCode DB: ${String(err)}`)
    return { source: "opencode", entries: [] }
  } finally {
    if (db) db.close()
  }

  consola.info(`Found ${entries.length} usage entr${entries.length === 1 ? "y" : "ies"} in OpenCode DB`)
  return { source: "opencode", entries }
}

/**
 * Scanner instance for OpenCode.
 */
export const createOpenCodeScanner = defineScanner("opencode", scanOpenCodeDb)
