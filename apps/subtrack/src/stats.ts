/**
 * Database statistics command.
 */

import { consola } from "consola"
import { getDb, getDbPath } from "./db.ts"
import type { Status } from "./types.ts"
import { execObjs } from "./db/connection.ts"
import { formatBytes, getFileSize } from "./format.ts"

type SubStats = {
  total: number
  active: number
  paused: number
  cancelled: number
  archived: number
  totalTags: number
  totalTrials: number
  totalUsage: number
  dbSizeBytes: number
  priceRange: { min: number; max: number; currencies: string[] }
}

export function handleStats(options: { json?: boolean } = {}): void {
  const db = getDb()

  // Subscription counts by status
  const statusRows = execObjs<{ status: Status; count: number }>(
    db,
    "SELECT status, COUNT(*) AS count FROM subscriptions GROUP BY status",
  )
  const statusMap = new Map(statusRows.map((r) => [r.status, r.count]))
  const total = statusRows.reduce((a, r) => a + r.count, 0)
  const active = statusMap.get("active") ?? 0
  const paused = statusMap.get("paused") ?? 0
  const cancelled = statusMap.get("cancelled") ?? 0
  const archived = statusMap.get("archived") ?? 0

  // Tags
  const tagRow = execObjs<{ count: number }>(db, "SELECT COUNT(*) AS count FROM tags")
  const totalTags = tagRow.length > 0 ? tagRow[0].count : 0

  // Trials
  const trialRow = execObjs<{ count: number }>(db, "SELECT COUNT(*) AS count FROM trials")
  const totalTrials = trialRow.length > 0 ? trialRow[0].count : 0

  // Usage entries
  const usageRow = execObjs<{ count: number }>(db, "SELECT COUNT(*) AS count FROM llm_usage")
  const totalUsage = usageRow.length > 0 ? usageRow[0].count : 0

  // Price range
  const priceRows = execObjs<{ price: number; currency: string }>(
    db,
    "SELECT price, currency FROM subscriptions WHERE status = 'active'",
  )
  const currencies = [...new Set(priceRows.map((r) => r.currency))]
  const min = priceRows.length > 0 ? Math.min(...priceRows.map((r) => r.price)) : 0
  const max = priceRows.length > 0 ? Math.max(...priceRows.map((r) => r.price)) : 0

  // DB size
  const dbSizeBytes = getFileSize(getDbPath())

  const stats: SubStats = {
    total, active, paused, cancelled, archived,
    totalTags, totalTrials, totalUsage,
    dbSizeBytes,
    priceRange: { min, max, currencies },
  }

  if (options.json) {
    process.stdout.write(JSON.stringify(stats, null, 2) + "\n")
    return
  }

  consola.log("── Database Statistics ──")
  consola.log(`  Subscriptions: ${total}`)
  consola.log(`    Active:       ${active}`)
  consola.log(`    Paused:       ${paused}`)
  consola.log(`    Cancelled:    ${cancelled}`)
  consola.log(`    Archived:     ${archived}`)
  consola.log(`  Tags:           ${totalTags}`)
  consola.log(`  Trials:         ${totalTrials}`)
  consola.log(`  LLM Usage entries: ${totalUsage}`)
  if (priceRows.length > 0) {
    consola.log(`  Active price range:`)
    consola.log(`    Min:  ${min} (${currencies.join(", ")})`)
    consola.log(`    Max:  ${max} (${currencies.join(", ")})`)
  }
  consola.log(`  Database size:   ${formatBytes(dbSizeBytes)}`)
}


