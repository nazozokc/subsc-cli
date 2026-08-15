import { consola } from "consola"
import { fail } from "./error.ts"
import pc from "picocolors"
import { getSubscriptions } from "./db.ts"
import type { SharedArgs, Currency } from "./types.ts"
import { periodFactor } from "./date-utils.ts"
import { formatPrice } from "./price.ts"
import { fetchFxRates, convertPrice } from "./fx.ts"
import type { FxRates } from "./fx.ts"

export type TimelineOptions = {
  months?: number
  categories?: boolean
  json?: boolean
  currency?: string
}

type MonthTotal = {
  label: string
  year: number
  month: number
  total: number
}

type CategoryMonth = {
  category: string
  months: number[]
}

/**
 * Calculate monthly spending totals for the past N months.
 * Each subscription's monthly cost is: price * periodFactor(cycle, "monthly").
 * Cancelled subscriptions are excluded. Subscriptions that didn't exist yet
 * in a given month are excluded from that month's total.
 */
function calcMonthlyTotals(
  subs: SharedArgs[],
  months: number,
): MonthTotal[] {
  const now = new Date()
  const results: MonthTotal[] = []

  for (let i = months - 1; i >= 0; i--) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const y = monthDate.getFullYear()
    const m = monthDate.getMonth()
    const label = `${y}-${String(m + 1).padStart(2, "0")}`
    const monthEnd = new Date(y, m + 1, 0) // last day of month

    let total = 0
    for (const sub of subs) {
      // Skip cancelled subscriptions
      if (sub.status === "cancelled") continue

      // Skip if subscription was created after this month
      const created = new Date(sub.createdAt)
      if (created > monthEnd) continue

      total += sub.price * periodFactor(sub.cycle, "monthly")
    }

    results.push({ label, year: y, month: m, total: Math.round(total) })
  }

  return results
}

/**
 * Calculate monthly totals broken down by category (first tag).
 */
function calcMonthlyTotalsByCategory(
  subs: SharedArgs[],
  months: number,
): { totals: MonthTotal[]; categories: CategoryMonth[] } {
  const totals = calcMonthlyTotals(subs, months)

  // Collect unique categories (first tag, or "Other")
  const catSet = new Set<string>()
  for (const sub of subs) {
    if (sub.status === "cancelled") continue
    catSet.add(sub.tags[0] || "Other")
  }
  const categories = [...catSet].sort()

  // Per-category per-month totals
  const now = new Date()
  const catData: CategoryMonth[] = categories.map((cat) => ({
    category: cat,
    months: Array.from({ length: months }, () => 0),
  }))

  for (let i = 0; i < months; i++) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1)
    const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0)

    for (const sub of subs) {
      if (sub.status === "cancelled") continue
      const created = new Date(sub.createdAt)
      if (created > monthEnd) continue

      const cat = sub.tags[0] || "Other"
      const idx = categories.indexOf(cat)
      catData[idx].months[i] += sub.price * periodFactor(sub.cycle, "monthly")
    }
  }

  // Round all values
  for (const cd of catData) {
    cd.months = cd.months.map((v) => Math.round(v))
  }

  return { totals, categories: catData }
}

/**
 * Render a bar chart showing monthly spending.
 */
function renderBarChart(totals: MonthTotal[], currency: string = "USD"): string {
  const max = Math.max(...totals.map((t) => t.total), 1)
  const barWidth = 40
  const labelWidth = 4 // "Dec " or "Jun "
  const lines: string[] = []

  const monthNames = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ]

  lines.push(pc.bold("Monthly spending"))
  lines.push("─".repeat(barWidth + labelWidth + 16))
  lines.push("")

  for (const t of totals) {
    const shortMon = monthNames[t.month]
    const label = `${shortMon} ${String(t.year).slice(2)}`.padEnd(labelWidth + 3)
    const barLen = Math.round((t.total / max) * barWidth)
    const bar = "█".repeat(barLen) + "░".repeat(barWidth - barLen)
    const price = formatPrice(t.total, currency)
    lines.push(` ${label} ${bar} ${pc.dim(price)}`)
  }

  lines.push("")
  lines.push("─".repeat(barWidth + labelWidth + 16))

  const avg = Math.round(totals.reduce((s, t) => s + t.total, 0) / totals.length)
  const totalSum = totals.reduce((s, t) => s + t.total, 0)
  lines.push(
    ` ${pc.dim(`Avg: ${formatPrice(avg, currency)}/mo  │  Total: ${formatPrice(totalSum, currency)}`)}`,
  )

  return lines.join("\n")
}

/**
 * Render a multi-line category breakdown chart.
 */
function renderCategoryChart(
  totals: MonthTotal[],
  catData: CategoryMonth[],
  currency: string = "USD",
): string {
  const lines: string[] = []
  const monthNames = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ]

  lines.push(pc.bold("Monthly spending by category"))
  lines.push("")

  const maxCatTotal = Math.max(
    ...catData.map((cd) => Math.max(...cd.months, 0)),
    1,
  )
  const barWidth = 30

  for (const cd of catData) {
    lines.push(pc.bold(` ${cd.category}`))
    for (let i = 0; i < cd.months.length; i++) {
      const t = totals[i]
      if (cd.months[i] === 0) continue
      const shortMon = monthNames[t.month]
      const label = `  ${shortMon}`.padEnd(6)
      const barLen = Math.round((cd.months[i] / maxCatTotal) * barWidth)
      const bar = "█".repeat(Math.max(barLen, 1))
      lines.push(` ${label} ${bar} ${pc.dim(formatPrice(cd.months[i], currency))}`)
    }
    lines.push("")
  }

  return lines.join("\n")
}

export async function handleTimeline(options: TimelineOptions = {}): Promise<void> {
  const months = options.months ?? 12

  if (months < 1) {
    fail("months must be a positive integer")
    return
  }

  const subs = getSubscriptions()

  if (subs.length === 0) {
    consola.info("No subscriptions found")
    return
  }

  // Filter to non-cancelled for active analysis
  let activeSubs = subs.filter((s) => s.status !== "cancelled")

  // Currency conversion at the top level
  let displayCurrency = "USD" as string
  if (options.currency) {
    displayCurrency = options.currency
    try {
      const rates = await fetchFxRates()
      activeSubs = activeSubs.map((s) => ({
        ...s,
        price: Math.round(convertPrice(s.price, s.currency, displayCurrency as Currency, rates.rates)),
        currency: displayCurrency,
      }))
    } catch {
      consola.warn("Failed to fetch exchange rates; showing in original currencies")
      displayCurrency = "USD"
    }
  }

  // Determine display currency for chart labels
  const ccy = displayCurrency

  if (options.json) {
    const totals = calcMonthlyTotals(activeSubs, months)
    const data: Record<string, unknown> = {
      months,
      currency: ccy,
      total: totals.reduce((s, t) => s + t.total, 0),
      average:
        totals.length > 0
          ? Math.round(totals.reduce((s, t) => s + t.total, 0) / totals.length)
          : 0,
      entries: totals.map((t) => ({
        month: t.label,
        total: t.total,
      })),
    }
    if (options.categories) {
      const { categories } = calcMonthlyTotalsByCategory(activeSubs, months)
      const catData: Record<string, number[]> = {}
      for (const cd of categories) {
        catData[cd.category] = cd.months
      }
      data.categories = catData
    }
    process.stdout.write(JSON.stringify(data, null, 2) + "\n")
    return
  }

  if (options.categories) {
    const { totals, categories } = calcMonthlyTotalsByCategory(activeSubs, months)
    consola.log(renderBarChart(totals, ccy))
    consola.log("")
    consola.log(renderCategoryChart(totals, categories, ccy))
  } else {
    const totals = calcMonthlyTotals(activeSubs, months)
    consola.log(renderBarChart(totals, ccy))
  }
}
