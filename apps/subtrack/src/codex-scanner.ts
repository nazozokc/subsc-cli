import { readFileSync, existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { consola } from "consola"
import initSqlJs from "sql.js"
import type { AddLlmUsageFromLogArgs } from "./types.ts"
import { defineScanner, type ScanResult } from "./scanner-types.ts"
import { isInDateRange, dateToStartOfDayMs, dateToEndOfDayMs, estimateTokenSplit } from "./date-utils.ts"

const _SQL = await initSqlJs()

const STATE_DB_PATH = join(homedir(), ".codex", "state_5.sqlite")
const GOALS_DB_PATH = join(homedir(), ".codex", "goals_1.sqlite")

/**
 * Scan Codex CLI database and extract LLM usage entries.
 */
export function scanCodexCli(from?: string, to?: string): ScanResult {
  if (!existsSync(STATE_DB_PATH)) {
    consola.info("Codex CLI DB not found — skip")
    return { source: "codex", entries: [] }
  }

  consola.info(`Reading Codex CLI DB: ${STATE_DB_PATH}`)

  let data: Buffer
  try {
    data = readFileSync(STATE_DB_PATH)
  } catch (err) {
    consola.warn(`Cannot read Codex CLI DB: ${String(err)}`)
    return { source: "codex", entries: [] }
  }

  let db: InstanceType<typeof _SQL.Database> | null = null
  const entries: AddLlmUsageFromLogArgs[] = []

  try {
    db = new _SQL.Database(data)

    let sql = `SELECT id, tokens_used, model, model_provider, created_at_ms FROM threads WHERE tokens_used > 0`
    const params: (number | string)[] = []
    if (from) { sql += ` AND created_at_ms >= ?`; params.push(dateToStartOfDayMs(from)) }
    if (to) { sql += ` AND created_at_ms <= ?`; params.push(dateToEndOfDayMs(to)) }

    const results = db.exec(sql, params)

    if (results.length === 0) {
      consola.info("No usage data found in Codex CLI DB")
      return { source: "codex", entries: [] }
    }

    const { columns, values } = results[0]
    const idIdx = columns.indexOf("id")
    const tokensIdx = columns.indexOf("tokens_used")
    const modelIdx = columns.indexOf("model")
    const providerIdx = columns.indexOf("model_provider")
    const createdAtIdx = columns.indexOf("created_at_ms")

    for (const row of values) {
      const threadId = String(row[idIdx])
      const tokensUsed = Number(row[tokensIdx] ?? 0)
      const model = String(row[modelIdx] ?? "unknown")
      const provider = String(row[providerIdx] ?? "unknown")
      const createdAtMs = Number(row[createdAtIdx] ?? 0)

      if (tokensUsed <= 0) continue

      const { inputTokens, outputTokens } = estimateTokenSplit(tokensUsed)

      const date = createdAtMs > 0
        ? new Date(createdAtMs).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0]

      entries.push({
        provider: provider !== "unknown" ? provider : "codex",
        model,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cost: 0,
        date,
        description: null,
        generation_id: `codex-${threadId}`,
      })
    }
  } catch (err) {
    consola.warn(`Error scanning Codex CLI DB: ${String(err)}`)
    return { source: "codex", entries: [] }
  } finally {
    if (db) db.close()
  }

  consola.info(`Found ${entries.length} usage entr${entries.length === 1 ? "y" : "ies"} in Codex CLI DB`)
  return { source: "codex", entries }
}

/**
 * Scanner instance for Codex CLI.
 */
export const createCodexScanner = defineScanner("codex", scanCodexCli)
