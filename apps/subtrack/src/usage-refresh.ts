import { consola } from "consola"
import type { UsageRefreshFlags } from "./types.ts"
import { batchAddLlmUsageFromLog } from "./db.ts"
import { runAllScanners } from "./scanner.ts"
import { currentMonthStart } from "./date-utils.ts"
import { todayLocal } from "./usage-import.ts"
import {
  ensurePricingCache,
  lookupModelKey,
  getModelPricing,
  calculateCostCents,
} from "./pricing.ts"

// ── Handler ──────────────────────────────────────────────

export async function handleUsageRefresh(flags: UsageRefreshFlags = {}) {
  const from = flags.all ? undefined : (flags.from ?? currentMonthStart())
  const to = flags.all ? undefined : (flags.to ?? todayLocal())

  const result = runAllScanners(from, to)

  if (result.entries.length === 0) {
    consola.info("No new usage entries found")
    return
  }

  // Resolve cost via pricing for entries that don't have cost data
  const cache = await ensurePricingCache()
  let resolvedCount = 0
  for (const entry of result.entries) {
    if (entry.cost > 0) continue // already has cost (e.g. from OpenCode)

    if (!cache) continue

    const modelKey = lookupModelKey(cache, entry.model, entry.provider)
    if (!modelKey) continue

    const pricing = getModelPricing(cache, modelKey)
    if (!pricing) continue

    const costCents = calculateCostCents(pricing, entry.input_tokens, entry.output_tokens)
    if (costCents > 0) {
      entry.cost = costCents
      resolvedCount++
    }
  }

  if (resolvedCount > 0) {
    consola.info(`Estimated cost for ${resolvedCount} entr${resolvedCount === 1 ? "y" : "ies"} via pricing`)
  }

  const { added, skipped } = batchAddLlmUsageFromLog(result.entries)

  if (added === 0 && skipped === 0) {
    consola.info("No new usage entries found")
  } else if (added > 0) {
    const periodInfo = from && to ? ` (${from} to ${to})` : ""
    consola.success(
      `Refreshed: ${added} entr${added === 1 ? "y" : "ies"} added` +
      (skipped > 0 ? `, ${skipped} duplicate${skipped === 1 ? "" : "s"} skipped` : "") +
      periodInfo,
    )
  } else {
    consola.info(`All ${skipped} entr${skipped === 1 ? "y" : "ies"} already imported (no new data)`)
  }
}
