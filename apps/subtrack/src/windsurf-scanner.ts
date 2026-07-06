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
 * Known paths for Windsurf's state.vscdb across platforms.
 */
function findWindsurfDb(): string | null {
  const candidates = [
    // Linux
    join(homedir(), ".config", "Windsurf", "User", "globalStorage", "state.vscdb"),
    // macOS
    join(homedir(), "Library", "Application Support", "Windsurf", "User", "globalStorage", "state.vscdb"),
    // Windows (via WSL or Git Bash)
    join(homedir(), "AppData", "Roaming", "Windsurf", "User", "globalStorage", "state.vscdb"),
  ]
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  return null
}

/**
 * Try to extract token usage data from a windsurfDiskKV value blob.
 */
function parseWindsurfKvValue(key: string, value: string): AddLlmUsageFromLogArgs | null {
  // Windsurf stores metrics under various key prefixes
  if (!key.includes("token") && !key.includes("usage") && !key.includes("completion")) return null

  let data: Record<string, unknown>
  try {
    data = safeJsonParse<Record<string, unknown>>(value)
  } catch {
    return null
  }

  const tokensUsed = (data.tokensUsed as number) ?? (data.tokens as number) ?? (data.totalTokens as number) ?? 0
  if (tokensUsed <= 0) return null

  const model = (data.model as string) ?? "unknown"
  const provider = "windsurf"

  const { inputTokens, outputTokens } = estimateTokenSplit(tokensUsed)

  const ts = (data.timestamp as number) ?? (data.createdAt as number) ?? 0
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
    generation_id: `windsurf-${key}`,
  }
}

/**
 * Scan Windsurf editor's state.vscdb and extract LLM usage entries.
 */
export function scanWindsurf(from?: string, to?: string): ScanResult {
  const dbPath = findWindsurfDb()
  if (!dbPath) {
    consola.info("Windsurf state DB not found — skip")
    return { source: "windsurf", entries: [] }
  }

  consola.info(`Reading Windsurf DB: ${dbPath}`)

  let data: Buffer
  try {
    data = readFileSync(dbPath)
  } catch (err) {
    consola.warn(`Cannot read Windsurf DB: ${String(err)}`)
    return { source: "windsurf", entries: [] }
  }

  let db: Database | null = null
  const entries: AddLlmUsageFromLogArgs[] = []

  try {
    db = new _SQL.Database(data)

    const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'")
    const tableNames = tables.length > 0 ? tables[0].values.map((r) => String(r[0])) : []
    const knownTables = ["windsurfDiskKV", "ItemTable"]
    const tableName = knownTables.find((t) => tableNames.includes(t))
    if (!tableName) {
      consola.info("No known Windsurf KV table found")
      return { source: "windsurf", entries: [] }
    }

    // tableName is guaranteed to be one of `knownTables` by construction
    // (see the `.find` above), so no further SQL injection guard is needed

    // Fetch key-value pairs matching usage-related patterns
    const results = db.exec(`SELECT key, value FROM "${tableName}" WHERE key LIKE '%token%' OR key LIKE '%usage%' OR key LIKE '%completion%'`)

    if (results.length === 0) {
      consola.info("No data found in Windsurf DB")
      return { source: "windsurf", entries: [] }
    }

    const { columns, values } = results[0]
    const keyIdx = columns.indexOf("key")
    const valueIdx = columns.indexOf("value")

    for (const row of values) {
      const key = String(row[keyIdx] ?? "")
      const rawValue = String(row[valueIdx] ?? "")

      const parsed = parseWindsurfKvValue(key, rawValue)
      if (parsed && isDateInRange(parsed.date, from, to)) {
        entries.push(parsed)
      }
    }
  } catch (err) {
    consola.warn(`Error scanning Windsurf DB: ${String(err)}`)
    return { source: "windsurf", entries: [] }
  } finally {
    if (db) db.close()
  }

  consola.info(`Found ${entries.length} usage entr${entries.length === 1 ? "y" : "ies"} in Windsurf DB`)
  return { source: "windsurf", entries }
}

/**
 * Scanner instance for Windsurf.
 */
export const createWindsurfScanner = defineScanner("windsurf", scanWindsurf)
