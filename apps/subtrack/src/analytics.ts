import { consola } from "consola"
import pc from "picocolors"
import type { AnalyticsOptions } from "./types.ts"
import { getSubscriptions, getNonCancelledSubscriptions } from "./db.ts"
import { formatPrice } from "./price.ts"
import { calcSummary } from "./payment.ts"
import { loadConfig } from "./config.ts"
import { periodFactor } from "./date-utils.ts"
import { fetchFxRates, convertPrice, tryConvert } from "./fx.ts"
import type { FxRates } from "./fx.ts"

export async function handleAnalytics(options: AnalyticsOptions = {}): Promise<void> {
  if (options.json) {
    const subs = getNonCancelledSubscriptions()
    const data = calcSummary(subs)

    const output: Record<string, unknown> = {
      ...data,
      period: options.period ?? "monthly",
    }

    if (options.currency) {
      let rates: FxRates | null = null
      try {
        rates = await fetchFxRates()
      } catch {
        consola.warn("Failed to fetch exchange rates; showing in original currencies")
      }
      const converted: Record<string, number> = {}
      if (rates) {
        for (const [ccy, total] of Object.entries(data.monthlyByCurrency)) {
          if (ccy !== options.currency) {
            const value = tryConvert(total, ccy, options.currency, rates.rates)
            if (value !== null) {
              converted[options.currency] = (converted[options.currency] ?? 0) + value
              continue
            }
          }
          converted[ccy] = (converted[ccy] ?? 0) + total
        }
        output.monthlyByCurrency = Object.fromEntries(
          Object.entries(converted).map(([ccy, total]) => [ccy, Math.round(total)]),
        )
      }
      output.currency = options.currency
    }

    process.stdout.write(JSON.stringify(output, null, 2) + "\n")
    return
  }
  await showAnalytics(options)
}

export async function showAnalytics(options: AnalyticsOptions = {}): Promise<void> {
  const all = getSubscriptions()
  const list = all.filter((s) => s.status !== "cancelled")
  if (list.length === 0) {
    consola.info("No active subscriptions found")
    return
  }

  const config = loadConfig()
  const data = calcSummary(list)

  // Optional FX conversion
  let rates: FxRates | null = null
  const targetCurrency = options.currency
  if (targetCurrency) {
    try {
      rates = await fetchFxRates()
    } catch {
      consola.warn("Failed to fetch exchange rates; showing in original currencies")
    }
  }

  // Period multiplier (yearly shows annual figures)
  const isYearly = options.period === "yearly"
  const mult = isYearly ? 12 : 1
  const periodLabel = isYearly ? "Yearly" : "Monthly"

  // Header
  consola.log(pc.bold("Subscription Analytics"))
  consola.log("")

  // Overview
  consola.log(pc.bold("Overview:"))
  consola.log(`  Total subscriptions:  ${pc.bold(String(data.totalCount))}`)
  consola.log(`  Status breakdown:`)
  const activeCount = list.filter((s) => s.status === "active").length
  const pausedCount = list.filter((s) => s.status === "paused").length
  const cancelledCount = all.filter((s) => s.status === "cancelled").length
  consola.log(`    ${pc.green(`active: ${activeCount}`)}`)
  if (pausedCount > 0) consola.log(`    ${pc.yellow(`paused: ${pausedCount}`)}`)
  if (cancelledCount > 0) consola.log(`    ${pc.red(`cancelled: ${cancelledCount}`)}`)

  if (data.mostExpensive) {
    const me = data.mostExpensive
    consola.log(`  Most expensive:       ${pc.bold(me.name)} (${formatPrice(me.price, me.currency)}/${me.cycle})`)
  }

  // Spending (per currency, optionally converted to target)
  consola.log("")
  consola.log(pc.bold(`${periodLabel} spending:`))
  const byCurrency: Record<string, number> = {}
  for (const sub of list) {
    const monthly = sub.price * periodFactor(sub.cycle, "monthly")
    const ccy = targetCurrency ?? sub.currency
    let amount = monthly
    if (targetCurrency && rates && sub.currency !== targetCurrency) {
      // Keep original on missing rate
      amount = tryConvert(monthly, sub.currency, targetCurrency, rates.rates) ?? monthly
    }
    byCurrency[ccy] = (byCurrency[ccy] ?? 0) + amount * mult
  }
  for (const [ccy, total] of Object.entries(byCurrency).sort()) {
    consola.log(`  ${ccy}    ${formatPrice(Math.round(total), ccy)}`)
  }

  // Budget comparison (converted to the display currency when possible)
  const budget = isYearly ? (config.yearlyBudget ?? config.monthlyBudget * 12) : config.monthlyBudget
  if (budget > 0) {
    const budgetCurrency = config.defaultCurrency || "USD"
    const displayCcy = targetCurrency ?? (Object.keys(byCurrency).length === 1 ? Object.keys(byCurrency)[0] : undefined)

    consola.log(`  ${pc.dim("─".repeat(30))}`)
    consola.log(`  Budget:     ${pc.bold(formatPrice(budget, budgetCurrency))}${isYearly ? "/year" : ""}`)

    // spending already converted to the display currency (period-adjusted)
    const spendingTotal = Object.values(byCurrency).reduce((a, b) => a + b, 0)

    if (displayCcy) {
      if (displayCcy === budgetCurrency) {
        const remaining = budget - spendingTotal
        const remainingDisplay = formatPrice(remaining, budgetCurrency)
        if (remaining >= 0) {
          consola.log(`  Remaining:  ${pc.green(remainingDisplay)}`)
        } else {
          consola.log(`  Over budget: ${pc.red(remainingDisplay.replace("-", ""))}`)
        }
      } else if (rates) {
        try {
          // Compare in budget currency: convert spending back from display currency
          const spendingInBudget = convertPrice(spendingTotal, displayCcy, budgetCurrency, rates.rates)
          const remaining = budget - spendingInBudget
          const remainingDisplay = formatPrice(remaining, budgetCurrency)
          if (remaining >= 0) {
            consola.log(`  Remaining:  ${pc.green(remainingDisplay)} (${pc.dim(`${formatPrice(spendingTotal, displayCcy)} spent`)} in ${displayCcy})`)
          } else {
            consola.log(`  Over budget: ${pc.red(remainingDisplay.replace("-", ""))} (${pc.dim(`${formatPrice(spendingTotal, displayCcy)} spent`)} in ${displayCcy})`)
          }
        } catch {
          consola.log(pc.dim(`  (Cannot convert ${budgetCurrency} budget to ${displayCcy} — missing rate)`))
        }
      } else {
        consola.log(pc.dim("  (Cannot compare — no exchange rates available)"))
      }
    } else {
      consola.log(pc.dim(`  (Multiple currencies — use --currency to compare against budget)`))
    }
  }

  // Tags breakdown
  if (Object.keys(data.monthlyByTag).length > 0) {
    consola.log("")
    consola.log(pc.bold(`${periodLabel} by tag:`))
    const sorted = Object.entries(data.monthlyByTag).sort(
      (a, b) => Object.values(b[1].monthly).reduce((s, v) => s + v, 0) - Object.values(a[1].monthly).reduce((s, v) => s + v, 0),
    )
    for (const [tag, info] of sorted) {
      const ccyEntries = Object.entries(info.monthly)
      const priceStr = ccyEntries.length === 1
        ? formatPrice(Math.round(ccyEntries[0][1] * mult), ccyEntries[0][0])
        : ccyEntries.map(([ccy, total]) => formatPrice(Math.round(total * mult), ccy)).join(" + ")
      consola.log(
        `  ${tag.padEnd(16)} ${priceStr}/${periodLabel.toLowerCase()} (${info.count} sub${info.count > 1 ? "s" : ""})`,
      )
    }
  }
}