/**
 * Database statistics command.
 */

import { consola } from "consola"
import { getStats, getSubscriptions } from "./db.ts"

export function handleStats(options: { json?: boolean } = {}): void {
  const stats = getStats()
  const allSubs = getSubscriptions()
  const statusCounts: Record<string, number> = {}
  for (const sub of allSubs) {
    statusCounts[sub.status] = (statusCounts[sub.status] ?? 0) + 1
  }
  const total = allSubs.length
  const active = statusCounts["active"] ?? 0
  const paused = statusCounts["paused"] ?? 0
  const cancelled = statusCounts["cancelled"] ?? 0
  const archived = statusCounts["archived"] ?? 0

  // Price range from active subscriptions
  const activeSubs = allSubs.filter((s) => s.status === "active")
  const currencies = [...new Set(activeSubs.map((s) => s.currency))]
  const min = activeSubs.length > 0 ? Math.min(...activeSubs.map((s) => s.price)) : 0
  const max = activeSubs.length > 0 ? Math.max(...activeSubs.map((s) => s.price)) : 0

  if (options.json) {
    process.stdout.write(JSON.stringify(stats, null, 2) + "\n")
    return
  }

  consola.log("── Database Statistics ──")
  consola.log(`  Subscriptions: ${stats.totalSubscriptions}`)
  consola.log(`    Active:       ${active}`)
  consola.log(`    Paused:       ${paused}`)
  consola.log(`    Cancelled:    ${cancelled}`)
  consola.log(`    Archived:     ${archived}`)
  consola.log(`  Tags:           ${stats.totalTags}`)
  consola.log(`  Trials:         ${stats.totalTrials}`)
  consola.log(`  LLM Usage entries: ${stats.totalUsage}`)
  if (activeSubs.length > 0) {
    consola.log(`  Active price range:`)
    consola.log(`    Min:  ${min} (${currencies.join(", ")})`)
    consola.log(`    Max:  ${max} (${currencies.join(", ")})`)
  }
  consola.log(`  Database size:   ${formatBytes(stats.dbSizeBytes)}`)
}

function formatBytes(bytes: number): string {
  const units = ["B", "kB", "MB", "GB"]
  let i = 0
  let size = bytes
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024
    i++
  }
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}
