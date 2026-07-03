// ── Re-exports from domain modules ──────────────────────

export { handleList, handleAdd, handleDelete, handleEdit, handleTags } from "./subscription.ts"
export { handleSearch } from "./search.ts"
export { handleTrialAdd, handleTrialList, handleTrialExpiring, handleTrialDelete } from "./trial.ts"
export { handleBulkStatus, handleBulkDelete, handleBulkTagAdd, handleBulkTagRemove } from "./bulk.ts"
export { handleForecast } from "./forecast.ts"
export { handleHistory } from "./history.ts"
export { handleNotify } from "./notify.ts"
export { handleTimeline } from "./timeline.ts"
export { handleOptimize } from "./optimize.ts"
export { handleProfile } from "./profile.ts"
export { handleBackup, handleRestore } from "./backup.ts"
export { handleTagList, handleTagRename, handleTagDelete, handleTagPrune } from "./tag.ts"

// Lazy import for TUI to avoid loading Ink/React/yoga-layout WASM in tests
export async function handleTui(): Promise<void> {
  const { handleTui: tui } = await import("./tui.tsx")
  return tui()
}

// ── Export handler ──────────────────────────────────────

import { consola } from "consola"
import { writeFileSync } from "node:fs"
import type { Currency, Cycle, SubtrackConfig, AnalyticsOptions, CompareOptions } from "./types.ts"
import { tagsSubscription, getSubscriptions, getLlmUsageTotal, getLlmUsageTotalByProvider } from "./db.ts"
import { formatPrice } from "./price.ts"
import { showPayment, showSummary, calcSummary, getPeriodDateRange } from "./payment.ts"
import { showUpcoming, calcUpcoming, calcUpcomingWithCurrency } from "./upcoming.ts"
import { showAnalytics } from "./analytics.ts"
import { showCompare } from "./compare.ts"
import { exportCsv, exportMd, exportJson, exportExcel, exportIcs } from "./export.ts"
import { showCalendar, calcCalendarEntries } from "./calendar.ts"
import { fetchFxRates, convertPrice, type FxRates } from "./fx.ts"
import os from "node:os"
import { resolveSafeOutputPath } from "./path-utils.ts"
import type { SharedArgs } from "./types.ts"
import { periodFactor } from "./date-utils.ts"

export async function handleExport(
  format: string,
  options: { currency?: string; tags?: string; output?: string; status?: string },
) {
  const supported = ["csv", "json", "md", "excel", "ics"] as const
  if (!(supported as readonly string[]).includes(format)) {
    consola.error(`Unsupported export format: "${format}". Supported: ${supported.join(", ")}`)
    return
  }

  let list = options.tags
    ? tagsSubscription(options.tags.split(",").map((t) => t.trim()))
    : getSubscriptions(undefined, undefined, "all")

  if (options.status) {
    const statuses = options.status.split(",").map((s) => s.trim().toLowerCase())
    list = list.filter((s) => statuses.includes(s.status))
  }

  if (list.length === 0) {
    consola.info("No subscriptions found")
    return
  }

  if (options.currency) {
    try {
      const rates = await fetchFxRates()
      const targetCurrency = options.currency as Currency
      list = list.map((sub) => ({
        ...sub,
        price: Math.round(
          convertPrice(sub.price, sub.currency, targetCurrency, rates.rates),
        ),
        currency: targetCurrency,
      }))
    } catch (e) {
      consola.fail(
        `Failed to fetch exchange rates; exporting in original currencies: ${String(e)}`,
      )
    }
  }

  if (format === "excel") {
    const buf = await exportExcel(list)
    if (options.output) {
      const safePath = resolveSafeOutputPath([os.homedir(), os.tmpdir()], options.output)
      if (!safePath) {
        consola.error(`Invalid output path — must be within home directory`)
        return
      }
      writeFileSync(safePath, buf, { mode: 0o600 })
      consola.success(`Exported to: ${safePath}`)
    } else {
      process.stdout.write(buf)
    }
    return
  }

  const content = format === "csv"
    ? exportCsv(list)
    : format === "json"
      ? exportJson(list)
      : format === "md"
        ? exportMd(list)
        : exportIcs(list)

  if (options.output) {
    const safePath = resolveSafeOutputPath([os.homedir(), os.tmpdir()], options.output)
    if (!safePath) {
      consola.error(`Invalid output path — must be within home directory`)
      return
    }
    writeFileSync(safePath, content, { mode: 0o600 })
    consola.success(`Exported to: ${safePath}`)
  } else {
    consola.log(content)
  }
}

// ── Thin CLI wrappers ───────────────────────────────────

export type JsonOptions = { json?: boolean }

export async function handlePayment(
  period: Cycle,
  options: { currency?: string; api?: boolean; method?: boolean } & JsonOptions,
) {
  if (options.json) {
    const subs = getSubscriptions()
    if (subs.length === 0) {
      process.stdout.write(JSON.stringify({ period, total: 0, subscriptions: [] }, null, 2) + "\n")
      return
    }

    const entries = subs.map((sub) => ({
      convertedPrice: sub.price * periodFactor(sub.cycle, period),
      currency: sub.currency,
      paymentMethod: sub.paymentMethod,
      sub,
    }))

    // API usage
    let apiTotal = 0
    let apiByProvider: { provider: string; total: number }[] = []
    if (options.api) {
      const { from, to } = getPeriodDateRange(period)
      apiTotal = getLlmUsageTotal(from, to)
      apiByProvider = getLlmUsageTotalByProvider(from, to)
    }

    let targetCurrency = options.currency as Currency | undefined
    let finalCurrency: string | undefined
    let subTotal = 0

    // Currency conversion
    if (targetCurrency) {
      let rates: FxRates | null = null
      try {
        rates = await fetchFxRates()
      } catch {
        consola.fail("Failed to fetch exchange rates; reporting in original currencies")
      }
      if (rates) {
        for (const entry of entries) {
          try {
            subTotal += convertPrice(entry.convertedPrice, entry.currency, targetCurrency, rates.rates)
          } catch {
            consola.warn(`Missing exchange rate for ${entry.currency} → ${targetCurrency}`)
          }
        }
        finalCurrency = targetCurrency
      }
    }

    if (!finalCurrency) {
      // Per-currency totals
      const byCurrency: Record<string, number> = {}
      for (const entry of entries) {
        byCurrency[entry.currency] = (byCurrency[entry.currency] ?? 0) + entry.convertedPrice
      }
      subTotal = Object.values(byCurrency).reduce((a, b) => a + b, 0)
    }

    // Payment method grouping
    const byMethod: Record<string, { total: number; currencies: string[] }> = {}
    if (options.method) {
      for (const entry of entries) {
        const method = entry.paymentMethod || "unspecified"
        if (!byMethod[method]) byMethod[method] = { total: 0, currencies: [] }
        byMethod[method].total += entry.convertedPrice
        if (!byMethod[method].currencies.includes(entry.currency)) {
          byMethod[method].currencies.push(entry.currency)
        }
      }
    }

    const output: Record<string, unknown> = {
      period,
      total: Math.round(subTotal),
      currency: finalCurrency ?? null,
      subscriptions: entries.map((e) => ({
        id: e.sub.id,
        name: e.sub.name,
        price: e.sub.price,
        currency: e.sub.currency,
        cycle: e.sub.cycle,
        status: e.sub.status,
        periodPrice: Math.round(e.convertedPrice),
      })),
    }

    if (options.api && apiTotal > 0) {
      output.apiUsage = { total: apiTotal, byProvider: apiByProvider }
    }
    if (options.method && Object.keys(byMethod).length > 0) {
      output.byMethod = byMethod
    }

    process.stdout.write(JSON.stringify(output, null, 2) + "\n")
    return
  }
  await showPayment(period, options.currency as Currency | undefined, undefined, options.api, options.method)
}

export async function handleSummary(options: JsonOptions = {}) {
  if (options.json) {
    const subs = getSubscriptions()
    const data = calcSummary(subs)
    process.stdout.write(JSON.stringify(data, null, 2) + "\n")
    return
  }
  await showSummary()
}

export async function handleUpcoming(days: number = 7, options: { json?: boolean; currency?: string } = {}): Promise<void> {
  if (options.json) {
    const entries = options.currency ? await calcUpcomingWithCurrency(days, options.currency) : calcUpcoming(days)
    const data = entries.map((e) => ({
      id: e.sub.id,
      name: e.sub.name,
      price: e.sub.price,
      currency: e.sub.currency,
      cycle: e.sub.cycle,
      nextDate: `${e.nextDate.getFullYear()}-${String(e.nextDate.getMonth() + 1).padStart(2, "0")}-${String(e.nextDate.getDate()).padStart(2, "0")}`,
      amount: Math.round(e.amount),
      tags: e.sub.tags,
    }))
    process.stdout.write(JSON.stringify(data, null, 2) + "\n")
    return
  }
  await showUpcoming(days, { currency: options.currency })
}

export function handleAnalytics(options: AnalyticsOptions = {}): void {
  if (options.json) {
    const subs = getSubscriptions(undefined, undefined, "active,paused")
    if (subs.length === 0) {
      process.stdout.write(JSON.stringify({ totalCount: 0, monthlyByCurrency: {}, monthlyByTag: {} }, null, 2) + "\n")
      return
    }
    const data = calcSummary(subs)
    process.stdout.write(JSON.stringify(data, null, 2) + "\n")
    return
  }
  showAnalytics()
}

export async function handleCompare(
  period: Cycle,
  options: CompareOptions = {},
): Promise<void> {
  if (options.json) {
    const subs = getSubscriptions(undefined, undefined, "active,paused")
    if (subs.length === 0) {
      process.stdout.write(JSON.stringify({ period, current: {}, previous: {}, change: {} }, null, 2) + "\n")
      return
    }

    const activeSubs = subs.filter((s) => s.status !== "cancelled")
    const currentTotals: Record<string, number> = {}
    for (const sub of activeSubs) {
      const { periodFactor } = await import("./date-utils.ts")
      const monthly = sub.price * periodFactor(sub.cycle, "monthly")
      currentTotals[sub.currency] = (currentTotals[sub.currency] ?? 0) + monthly
    }

    process.stdout.write(JSON.stringify({
      period,
      currentPeriod: currentTotals,
      subscriptions: activeSubs.length,
    }, null, 2) + "\n")
    return
  }
  await showCompare(period, options)
}

// ── Calendar handler ────────────────────────────────────

export async function handleCalendar(options: { month?: number; year?: number; json?: boolean; currency?: string }): Promise<void> {
  await showCalendar(options)
}

// ── MCP handler ─────────────────────────────────────────

export async function handleMcp(): Promise<void> {
  const { startMcpServer } = await import("./mcp.ts")
  await startMcpServer()
}

// ── Config handlers ─────────────────────────────────────

export { handleConfigList, handleConfigGet, handleConfigSet, handleConfigReset } from "./config.ts"
