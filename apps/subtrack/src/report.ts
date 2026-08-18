import { consola } from "consola"
import pc from "picocolors"
import type { Currency, SharedArgs } from "./types.ts"
import type { AuditEntry } from "./db.ts"
import { getSubscriptions, getAllPriceChanges, getAuditLogs } from "./db.ts"
import { loadConfig } from "./config.ts"
import { formatPrice } from "./price.ts"
import { periodFactor, OCCURRENCES_PER_YEAR } from "./date-utils.ts"
import { fetchFxRates, convertPrice, convertSubsWithRates } from "./fx.ts"
import type { FxRates } from "./fx.ts"
import { renderBarChart } from "./timeline.ts"
import { fail } from "./error.ts"

export type ReportOptions = {
  /** Target year (default: current year) */
  year?: number
  /** Convert all prices to target currency */
  currency?: string
  /** Output as JSON */
  json?: boolean
}

export type MonthTotal = {
  label: string
  year: number
  month: number
  total: number
}

/**
 * Calculate monthly spending totals for a specific calendar year.
 * Cancelled subscriptions count until their contractEnd; archived ones are excluded.
 */
export function calcYearlyTotals(subs: SharedArgs[], year: number): MonthTotal[] {
  const results: MonthTotal[] = []
  for (let m = 0; m < 12; m++) {
    const monthStart = new Date(year, m, 1)
    const monthEnd = new Date(year, m + 1, 0)
    let total = 0
    for (const sub of subs) {
      if (sub.status === "archived") continue
      // Subscription must already exist by the end of the month
      const created = new Date(sub.createdAt + "T00:00:00")
      if (created > monthEnd) continue
      // Cancelled subscriptions only count until their contract end
      if (sub.status === "cancelled") {
        if (!sub.contractEnd) continue
        const end = new Date(sub.contractEnd + "T23:59:59")
        if (end < monthStart) continue
      }
      total += sub.price * periodFactor(sub.cycle, "monthly")
    }
    results.push({
      label: `${year}-${String(m + 1).padStart(2, "0")}`,
      year,
      month: m,
      total: Math.round(total),
    })
  }
  return results
}

/** Yearly cost of a single subscription (price × occurrences per year). */
export function yearlyCost(sub: SharedArgs): number {
  return sub.price * OCCURRENCES_PER_YEAR[sub.cycle]
}

/** Top N subscriptions by yearly cost. */
export function calcTopSubscriptions(subs: SharedArgs[], n = 5): SharedArgs[] {
  return subs
    .filter((s) => s.status !== "archived")
    .sort((a, b) => yearlyCost(b) - yearlyCost(a))
    .slice(0, n)
}

/** Subscriptions created in the given year. */
export function calcAddedThisYear(subs: SharedArgs[], year: number): SharedArgs[] {
  const prefix = `${year}-`
  return subs
    .filter((s) => s.createdAt.startsWith(prefix) && s.status !== "archived")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

/**
 * Subscriptions cancelled in the given year.
 * Derived from contractEnd dates (primary) and audit log entries (fallback).
 */
export function calcCancelledThisYear(subs: SharedArgs[], year: number): { name: string; date: string }[] {
  const prefix = `${year}-`
  const results = new Map<string, string>()

  for (const sub of subs) {
    if (sub.status === "cancelled" && sub.contractEnd?.startsWith(prefix)) {
      results.set(sub.name, sub.contractEnd)
    }
  }

  const auditEntries = getAuditLogs({
    action: "subscription.cancel",
    from: `${year}-01-01`,
    limit: 1000,
  })
  for (const entry of auditEntries) {
    if (entry.created_at.startsWith(prefix)) {
      results.set(entry.details ?? `#${entry.target_id}`, entry.created_at.slice(0, 10))
    }
  }

  return [...results.entries()]
    .map(([name, date]) => ({ name, date }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

/** Sum of monthly totals. */
export function sumYearlyTotals(totals: MonthTotal[]): number {
  return totals.reduce((s, t) => s + t.total, 0)
}

/**
 * Resolve a single comparable currency: the conversion target when set,
 * otherwise the only currency present (or null when mixed).
 */
function singleCurrency(
  displayCurrency: string | null,
  byCurrency: Record<string, number>,
): string | null {
  if (displayCurrency) return displayCurrency
  const keys = Object.keys(byCurrency)
  return keys.length === 1 ? keys[0] : null
}

export async function handleReport(options: ReportOptions = {}): Promise<void> {
  const year = options.year ?? new Date().getFullYear()
  if (year < 1970 || year > 9999 || !Number.isInteger(year)) {
    fail("year must be a valid year (e.g. 2025)")
    return
  }

  const subs = getSubscriptions({ includeArchived: true })

  // Convert to target currency when requested
  let displaySubs: SharedArgs[] = subs
  let rates: FxRates | null = null
  let displayCurrency: string | null = null
  if (options.currency) {
    const target = options.currency
    try {
      rates = await fetchFxRates()
      displayCurrency = target
      displaySubs = convertSubsWithRates(subs, target as Currency, rates!)
    } catch {
      consola.warn("Failed to fetch exchange rates; reporting in original currencies")
      displayCurrency = null
    }
  }

  const totals = calcYearlyTotals(displaySubs, year)
  const total = sumYearlyTotals(totals)

  // Per-currency yearly totals (when no conversion)
  const byCurrency: Record<string, number> = {}
  if (!displayCurrency) {
    for (const sub of subs) {
      if (sub.status === "archived") continue
      byCurrency[sub.currency] = (byCurrency[sub.currency] ?? 0) + yearlyCost(sub)
    }
    // Round for display
    for (const ccy of Object.keys(byCurrency)) {
      byCurrency[ccy] = Math.round(byCurrency[ccy]!)
    }
  }

  const top = calcTopSubscriptions(displaySubs, 5)
  const priceChanges = getAllPriceChanges().filter((c) => c.changedAt.startsWith(`${year}-`))
  const added = calcAddedThisYear(subs, year)
  const cancelled = calcCancelledThisYear(subs, year)

  // Budget comparison
  const config = loadConfig()
  const yearlyBudget = config.yearlyBudget ?? (config.monthlyBudget > 0 ? config.monthlyBudget * 12 : 0)
  const budgetCurrency = config.defaultCurrency || "USD"
  let budgetInfo: { amount: number; currency: string; remaining: number; over: boolean } | null = null
  if (yearlyBudget > 0) {
    const chartCcy = singleCurrency(displayCurrency, byCurrency)
    let spending = total
    let ccy = chartCcy
    if (chartCcy && rates && chartCcy !== budgetCurrency) {
      try {
        spending = Math.round(convertPrice(total, chartCcy, budgetCurrency, rates.rates))
        ccy = budgetCurrency
      } catch {
        // keep as-is
      }
    }
    if (ccy === budgetCurrency) {
      const remaining = yearlyBudget - spending
      budgetInfo = {
        amount: yearlyBudget,
        currency: budgetCurrency,
        remaining,
        over: remaining < 0,
      }
    }
  }

  if (options.json) {
    const output: Record<string, unknown> = {
      year,
      total: Math.round(total),
      currency: singleCurrency(displayCurrency, byCurrency),
      byCurrency,
      monthly: totals.map((t) => ({ month: t.label, total: t.total })),
      top: top.map((s) => ({
        id: s.id,
        name: s.name,
        yearlyCost: Math.round(yearlyCost(s)),
        currency: s.currency,
      })),
      priceChanges: priceChanges.map((c) => ({
        subscriptionId: c.subscriptionId,
        subscriptionName: c.subscriptionName,
        oldPrice: c.oldPrice,
        newPrice: c.newPrice,
        oldCurrency: c.oldCurrency,
        newCurrency: c.newCurrency,
        changedAt: c.changedAt,
        diff: c.oldPrice !== null && c.oldCurrency === c.newCurrency && c.oldPrice !== c.newPrice
          ? c.newPrice - c.oldPrice
          : null,
      })),
      added: added.map((s) => ({ id: s.id, name: s.name, price: s.price, currency: s.currency, cycle: s.cycle, createdAt: s.createdAt })),
      cancelled,
      budget: budgetInfo,
    }
    process.stdout.write(JSON.stringify(output, null, 2) + "\n")
    return
  }

  consola.log(pc.bold(`📊 Subscription Report — ${year}`))
  consola.log("")

  // Total spending
  consola.log(pc.bold("Total spending:"))
  if (displayCurrency) {
    consola.log(`  ${formatPrice(Math.round(total), displayCurrency)}`)
  } else if (Object.keys(byCurrency).length === 1) {
    const [ccy, amount] = Object.entries(byCurrency)[0]!
    consola.log(`  ${formatPrice(amount, ccy)}`)
  } else {
    const parts = Object.entries(byCurrency)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ccy, amount]) => `${formatPrice(amount, ccy)}`)
    consola.log(`  ${parts.join(" + ")}`)
  }

  // Monthly chart
  consola.log("")
  const chartCcy = singleCurrency(displayCurrency, byCurrency)
  if (chartCcy) {
    consola.log(renderBarChart(totals, chartCcy))
  } else {
    consola.log(pc.dim("(Monthly chart requires a single currency — use --currency to convert)"))
  }

  // Top subscriptions
  consola.log("")
  consola.log(pc.bold("Top subscriptions by yearly cost:"))
  if (top.length === 0) {
    consola.log("  (none)")
  }
  for (const s of top) {
    consola.log(`  ${s.name.padEnd(24)} ${formatPrice(Math.round(yearlyCost(s)), s.currency)}/year`)
  }

  // Price changes
  if (priceChanges.length > 0) {
    consola.log("")
    consola.log(pc.bold("Price changes:"))
    for (const c of priceChanges) {
      const date = c.changedAt.slice(0, 10)
      if (c.oldPrice !== null && c.oldCurrency === c.newCurrency && c.oldPrice !== c.newPrice) {
        const diff = c.newPrice - c.oldPrice
        const sign = diff > 0 ? "+" : ""
        consola.log(
          `  ${pc.dim(date)}  ${c.subscriptionName}: ${formatPrice(c.oldPrice, c.newCurrency)} → ${formatPrice(c.newPrice, c.newCurrency)}  (${sign}${formatPrice(diff, c.newCurrency)})`,
        )
      } else if (c.oldCurrency && c.oldCurrency !== c.newCurrency) {
        consola.log(
          `  ${pc.dim(date)}  ${c.subscriptionName}: ${formatPrice(c.oldPrice ?? c.newPrice, c.oldCurrency)} (${c.oldCurrency}) → ${formatPrice(c.newPrice, c.newCurrency)} (${c.newCurrency})`,
        )
      } else {
        consola.log(`  ${pc.dim(date)}  ${c.subscriptionName}: → ${formatPrice(c.newPrice, c.newCurrency)}`)
      }
    }
  }

  // Added / cancelled
  consola.log("")
  consola.log(pc.bold(`Added this year (${added.length}):`))
  for (const s of added) {
    consola.log(`  ${pc.green("+")} ${s.name}  ${formatPrice(s.price, s.currency)}/${s.cycle}  (${s.createdAt})`)
  }
  if (added.length === 0) consola.log("  (none)")

  consola.log("")
  consola.log(pc.bold(`Cancelled this year (${cancelled.length}):`))
  for (const c of cancelled) {
    consola.log(`  ${pc.red("-")} ${c.name}  (${c.date})`)
  }
  if (cancelled.length === 0) consola.log("  (none)")

  // Budget
  if (budgetInfo) {
    consola.log("")
    consola.log(pc.bold("Budget:"))
    consola.log(`  Budget: ${formatPrice(budgetInfo.amount, budgetInfo.currency)}/year`)
    if (budgetInfo.over) {
      consola.log(`  Over budget: ${pc.red(formatPrice(-budgetInfo.remaining, budgetInfo.currency))}`)
    } else {
      consola.log(`  Remaining: ${pc.green(formatPrice(budgetInfo.remaining, budgetInfo.currency))}`)
    }
  } else if (yearlyBudget > 0) {
    consola.log("")
    consola.log(pc.dim("(Cannot compare budget — multiple currencies. Use --currency.)"))
  } else {
    consola.log("")
    consola.log(pc.dim("(No budget set — use: subtrack config set yearlyBudget <amount>)"))
  }
}