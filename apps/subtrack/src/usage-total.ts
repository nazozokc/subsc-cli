/**
 * Usage total command — aggregated LLM API usage summary.
 */

import { consola } from "consola"
import pc from "picocolors"
import {
  getLlmUsageTotal,
  getLlmUsageTokenTotal,
  getLlmUsageTotalByProvider,
  getLlmUsageTotalByModel,
} from "./db.ts"
import { getPeriodDateRange } from "./date-utils.ts"
import type { Cycle } from "./types.ts"

export type UsageTotalOptions = {
  from?: string
  to?: string
  period?: Cycle
  json?: boolean
}

export function handleUsageTotal(options: UsageTotalOptions = {}): void {
  let from: string
  let to: string

  if (options.from && options.to) {
    from = options.from
    to = options.to
  } else {
    const range = getPeriodDateRange(options.period ?? "monthly")
    from = range.from
    to = range.to
  }

  const total = getLlmUsageTotal(from, to)
  const byProvider = getLlmUsageTotalByProvider(from, to)
  const byModel = getLlmUsageTotalByModel(from, to)
  const tokens = getLlmUsageTokenTotal(from, to)

  if (options.json) {
    process.stdout.write(JSON.stringify({
      from,
      to,
      total,
      tokens,
      byProvider,
      byModel,
    }, null, 2) + "\n")
    return
  }

  if (total <= 0) {
    consola.info(`No API usage found from ${from} to ${to}`)
    return
  }

  consola.log(`── LLM API Usage (${from} → ${to}) ──`)
  consola.log(pc.bold("  By provider:"))
  for (const p of byProvider) {
    consola.log(`    ${p.provider}: $${(p.total / 100).toFixed(2)}`)
  }
  if (byModel.length > 0) {
    consola.log(pc.bold("  By model:"))
    for (const m of byModel) {
      consola.log(
        `    ${m.model}: $${(m.total / 100).toFixed(2)} ` +
        `(${m.inputTokens.toLocaleString()} in / ${m.outputTokens.toLocaleString()} out)`,
      )
    }
  }
  consola.log(`  ${"─".repeat(20)}`)
  consola.log(
    `  Tokens: ${tokens.inputTokens.toLocaleString()} in / ${tokens.outputTokens.toLocaleString()} out`,
  )
  consola.log(`  Total: $${(total / 100).toFixed(2)}`)
}