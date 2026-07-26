import { readFileSync, existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { consola } from "consola"
import initSqlJs from "sql.js"
import type { Database } from "sql.js"
import type { AddLlmUsageFromLogArgs } from "./types.ts"
import { defineScanner, type ScanResult } from "./scanner-types.ts"
import { safeJsonParse } from "./safe-json.ts"
import { isDateInRange, estimateTokenSplit } from "./date-utils.ts"

const _SQL = await initSqlJs()

/**
 * Known paths for Cursor's state.vscdb across platforms.
 */
function findCursorDb(): string | null {
  const candidates = [
    // Linux
    join(homedir(), ".config", "Cursor", "User", "globalStorage", "state.vscdb"),
    // macOS
    join(homedir(), "Library", "Application Support", "Cursor", "User", "globalStorage", "state.vscdb"),
    // Windows (via WSL or Git Bash)
    join(homedir(), "AppData", "Roaming", "Cursor", "User", "globalStorage", "state.vscdb"),
  ]
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  return null
}

/**
 * Try to extract token usage data from a cursorDiskKV value blob.
 * The value is typically a JSON string with token fields nested inside.
 */
function parseCursorKvValue(key: string, value: string): AddLlmUsageFromLogArgs | null {
  if (!key.startsWith("bubbleId:")) return null

  let data: Record<string, unknown>
  try {
    data = safeJsonParse<Record<string, unknown>>(value)
  } catch {
    return null
  }

  // Cursor stores token data in various nested formats.
  // Common paths:
  //   data.tokensUsed or data.tokens or data.usage?.totalTokens
  //   data.model
  //   data.provider
  const tokensUsed = (data.tokensUsed as number) ?? (data.tokens as number) ?? 0
  if (tokensUsed <= 0) return null

  const model = (data.model as string) ?? "unknown"
  const provider = (data.provider as string) ?? "cursor"

  // Cursor only stores total tokens typically — estimate 2:1 split
  const { inputTokens, outputTokens } = estimateTokenSplit(tokensUsed)

  // Extract timestamp
  const ts = (data.timestamp as number) ?? (data.createdAt as number) ?? (data.time as number) ?? 0
  const date = ts > 0
    ? new Date(ts).toISOString().split("T")[0]
    : new Date().toISOString().split("T")[0]

  return {
    provider,
    model,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost: 0,
    date,
    description: null,
    generation_id: `cursor-${key}`,
  }
}

/**
 * Scan Cursor editor's state.vscdb and extract LLM usage entries.
 */
export function scanCursor(from?: string, to?: string): ScanResult {
  const dbPath = findCursorDb()
  if (!dbPath) {
    consola.info("Cursor state DB not found — skip")
    return { source: "cursor", entries: [] }
  }

  consola.info(`Reading Cursor DB: ${dbPath}`)

  let data: Buffer
  try {
    data = readFileSync(dbPath)
  } catch (err) {
    consola.warn(`Cannot read Cursor DB: ${String(err)}`)
    return { source: "cursor", entries: [] }
  }

  let db: Database | null = null
  const entries: AddLlmUsageFromLogArgs[] = []

  try {
    db = new _SQL.Database(data)

    // Try both possible table names
    const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'")
    const tableNames = tables.length > 0 ? tables[0].values.map((r) => String(r[0])) : []
    const knownTables = ["cursorDiskKV", "ItemTable"]
    const tableName = knownTables.find((t) => tableNames.includes(t))
    if (!tableName) {
      consola.info("No known Cursor KV table found")
      return { source: "cursor", entries: [] }
    }

    // tableName is guaranteed to be one of `knownTables` by construction
    // (see the `.find` above), so no further SQL injection guard is needed

    const results = db.exec(`SELECT key, value FROM "${tableName}" WHERE key LIKE 'bubbleId:%'`)

    if (results.length === 0) {
      consola.info("No usage data found in Cursor DB")
      return { source: "cursor", entries: [] }
    }

    const { columns, values } = results[0]
    const keyIdx = columns.indexOf("key")
    const valueIdx = columns.indexOf("value")

    for (const row of values) {
      const key = String(row[keyIdx] ?? "")
      const rawValue = String(row[valueIdx] ?? "")

      const parsed = parseCursorKvValue(key, rawValue)
      if (parsed && isDateInRange(parsed.date, from, to)) {
        entries.push(parsed)
      }
    }
  } catch (err) {
    consola.warn(`Error scanning Cursor DB: ${String(err)}`)
    return { source: "cursor", entries: [] }
  } finally {
    if (db) db.close()
  }

  consola.info(`Found ${entries.length} usage entr${entries.length === 1 ? "y" : "ies"} in Cursor DB`)
  return { source: "cursor", entries }
}

/**
 * Scanner instance for Cursor.
 */
export const createCursorScanner = defineScanner("cursor", scanCursor)
