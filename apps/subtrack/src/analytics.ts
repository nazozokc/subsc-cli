import { consola } from "consola"
import pc from "picocolors"
import type { SharedArgs } from "./types.ts"
import { getSubscriptions } from "./db.ts"
import { formatPrice } from "./price.ts"
import { calcSummary } from "./payment.ts"
import { loadConfig } from "./config.ts"
import { periodFactor } from "./date-utils.ts"

export function showAnalytics(): void {
  const list = getSubscriptions().filter((s) => s.status !== "cancelled")
  if (list.length === 0) {
    consola.info("No active subscriptions found")
    return
  }

  const config = loadConfig()
  const data = calcSummary(list)

  // Header
  consola.log(pc.bold("Subscription Analytics"))
  consola.log("")

  // Overview
  consola.log(pc.bold("Overview:"))
  consola.log(`  Total subscriptions:  ${pc.bold(String(data.totalCount))}`)
  consola.log(`  Status breakdown:`)
  const activeCount = list.filter((s) => s.status === "active").length
  const pausedCount = list.filter((s) => s.status === "paused").length
  const cancelledCount = getSubscriptions().filter((s) => s.status === "cancelled").length
  consola.log(`    ${pc.green(`active: ${activeCount}`)}`)
  if (pausedCount > 0) consola.log(`    ${pc.yellow(`paused: ${pausedCount}`)}`)
  if (cancelledCount > 0) consola.log(`    ${pc.red(`cancelled: ${cancelledCount}`)}`)

  if (data.mostExpensive) {
    const me = data.mostExpensive
    consola.log(`  Most expensive:       ${pc.bold(me.name)} (${formatPrice(me.price, me.currency)}/${me.cycle})`)
  }

  // Monthly spending
  consola.log("")
  consola.log(pc.bold("Monthly spending:"))
  for (const [ccy, total] of Object.entries(data.monthlyByCurrency).sort()) {
    consola.log(`  ${ccy}    ${formatPrice(Math.round(total), ccy)}`)
  }

  // Budget
  if (config.monthlyBudget > 0) {
    const defaultCurrency = config.defaultCurrency || "USD"
    const currencies = new Set(list.map((s) => s.currency))
    const budgetDisplay = formatPrice(config.monthlyBudget, defaultCurrency)
    consola.log(`  ${pc.dim("─".repeat(30))}`)
    consola.log(`  Budget:     ${pc.bold(budgetDisplay)}`)

    if (currencies.size === 1) {
      const ccy = [...currencies][0]
      const monthlyTotal = list.reduce((sum, sub) => sum + sub.price * periodFactor(sub.cycle, "monthly"), 0)
      const remaining = config.monthlyBudget - monthlyTotal
      if (ccy === defaultCurrency) {
        const remainingDisplay = formatPrice(remaining, defaultCurrency)
        if (remaining >= 0) {
          consola.log(`  Remaining:  ${pc.green(remainingDisplay)}`)
        } else {
          consola.log(`  Over budget: ${pc.red(remainingDisplay.replace("-", ""))}`)
        }
      } else {
        consola.log(`  Spending:   ${formatPrice(Math.round(monthlyTotal), ccy)}/${pc.dim(defaultCurrency)}`)
      }
    } else {
      consola.log(pc.dim("  (Multiple currencies — set a defaultCurrency for budget comparison)"))
    }
  }

  // Tags breakdown
  if (Object.keys(data.monthlyByTag).length > 0) {
    consola.log("")
    consola.log(pc.bold("Monthly by tag:"))
    const sorted = Object.entries(data.monthlyByTag).sort(
      (a, b) => Object.values(b[1].monthly).reduce((s, v) => s + v, 0) - Object.values(a[1].monthly).reduce((s, v) => s + v, 0),
    )
    for (const [tag, info] of sorted) {
      const ccyEntries = Object.entries(info.monthly)
      const priceStr = ccyEntries.length === 1
        ? formatPrice(Math.round(ccyEntries[0][1]), ccyEntries[0][0])
        : ccyEntries.map(([ccy, total]) => formatPrice(Math.round(total), ccy)).join(" + ")
      consola.log(
        `  ${tag.padEnd(16)} ${priceStr}/month (${info.count} sub${info.count > 1 ? "s" : ""})`,
      )
    }
  }
}
