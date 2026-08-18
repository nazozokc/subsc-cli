import { consola } from "consola"
import pc from "picocolors"
import CliTable3 from "cli-table3"
import type { Currency, Cycle, CompareOptions } from "./types.ts"
import { periodFactor, getPeriodDateRange, getPreviousPeriodDateRange, SHORT_MONTH_NAMES } from "./date-utils.ts"
import { getNonCancelledSubscriptions, getLlmUsageTotal, getAllPriceChanges } from "./db.ts"
import { formatPrice } from "./price.ts"
import { fetchFxRates, convertPrice } from "./fx.ts"
import type { FxRates } from "./fx.ts"
import { calcSubTotal } from "./payment.ts"
import { TABLE_CHARS, getTableStyle, calcColumnWidths } from "./display-constants.ts"
import type { ColumnConfig } from "./display-constants.ts"

type PeriodLabel = string

type CompareRow = {
  label: string
  current: string
  previous: string
  change: string
  isCurrencyTotal?: boolean
  isDivider?: boolean
  isGrandTotal?: boolean
}

function periodLabel(period: Cycle): string {
  switch (period) {
    case "monthly": return "month"
    case "yearly": return "year"
    case "quarterly": return "quarter"
    case "semi-annual": return "6 months"
    case "weekly": return "week"
    case "bi-weekly": return "2 weeks"
  }
}

function formatDateRange(from: string, to: string): string {
  // Format: "Jun 1–27, 2026"
  const f = new Date(from + "T00:00:00")
  const t = new Date(to + "T00:00:00")
  const months = SHORT_MONTH_NAMES
  if (f.getFullYear() === t.getFullYear()) {
    if (f.getMonth() === t.getMonth()) {
      return `${months[f.getMonth()]} ${f.getDate()}–${t.getDate()}, ${f.getFullYear()}`
    }
    return `${months[f.getMonth()]} ${f.getDate()} – ${months[t.getMonth()]} ${t.getDate()}, ${f.getFullYear()}`
  }
  return `${months[f.getMonth()]} ${f.getDate()}, ${f.getFullYear()} – ${months[t.getMonth()]} ${t.getDate()}, ${t.getFullYear()}`
}

function fmtChange(current: number, previous: number, currency: string): string {
  const diff = current - previous
  const pct = previous > 0 ? ((diff / previous) * 100) : 0
  const sign = diff >= 0 ? "+" : ""
  const colored = pct >= 0 ? pc.red(`${sign}${(pct).toFixed(1)}%`) : pc.green(`${sign}${(pct).toFixed(1)}%`)
  return `${formatPrice(Math.round(diff), currency)} (${colored})`
}

function renderCompareTable(
  rows: CompareRow[],
  currentLabel: string,
  previousLabel: string,
): void {
  const headers = ["", currentLabel, previousLabel, "Change"] as const
  const COMPARE_COLS: ColumnConfig = {
    headers,
    minWidths: [10, 12, 12, 16] as const,
    maxWidths: [40, 20, 20, 30] as const,
  }
  const colWidths = calcColumnWidths(
    rows.map((r) => [r.label, r.current, r.previous, r.change]),
    COMPARE_COLS,
  )

  const table = new CliTable3({
    chars: { ...TABLE_CHARS },
    style: getTableStyle(),
    colWidths,
    head: [...headers],
    colAligns: ["left", "right", "right", "right"],
  })

  for (const row of rows) {
    if (row.isDivider) {
      table.push([{ colSpan: 4, content: pc.dim("─") }])
    } else if (row.isGrandTotal) {
      table.push([
        pc.bold(pc.yellow(row.label)),
        pc.bold(pc.yellow(row.current)),
        pc.bold(pc.yellow(row.previous)),
        pc.bold(pc.yellow(row.change)),
      ])
    } else if (row.isCurrencyTotal) {
      table.push([
        pc.bold(row.label),
        pc.bold(row.current),
        pc.bold(row.previous),
        row.change,
      ])
    } else {
      table.push([row.label, row.current, row.previous, row.change])
    }
  }

  consola.log(table.toString())
}

export async function showCompare(
  period: Cycle = "monthly",
  options: { currency?: string; api?: boolean } = {},
): Promise<void> {
  const subs = getNonCancelledSubscriptions()

  const currentRange = getPeriodDateRange(period)
  const previousRange = getPreviousPeriodDateRange(period)

  const currentLabel = formatDateRange(currentRange.from, currentRange.to)
  const previousLabel = formatDateRange(previousRange.from, previousRange.to)

  const periodStr = periodLabel(period)

  // Fetch FX rates if a target currency is specified
  let rates: FxRates | null = null
  if (options.currency) {
    try {
      rates = await fetchFxRates()
    } catch {
      consola.warn("Failed to fetch exchange rates; showing in original currencies")
    }
  }

  const targetCurrency = options.currency as Currency | undefined

  const activeSubs = subs
  if (activeSubs.length === 0) {
    consola.info("No active subscriptions found")
    return
  }

  // Current period uses current prices
  const currentTotals = calcSubTotal(activeSubs, rates, targetCurrency)

  // Previous period — estimate from price history when available
  const priceChanges = getAllPriceChanges()
  const priceBefore: Record<number, { price: number; currency: string }> = {}
  for (const change of priceChanges) {
    if (change.oldPrice !== null && !priceBefore[change.subscriptionId]) {
      priceBefore[change.subscriptionId] = {
        price: change.oldPrice,
        currency: change.oldCurrency ?? change.newCurrency,
      }
    }
  }

  const previousSubs = activeSubs.map((s) => {
    const prev = priceBefore[s.id]
    if (prev) {
      return { ...s, price: prev.price, currency: prev.currency }
    }
    return s
  })
  const previousTotals = calcSubTotal(previousSubs, rates, targetCurrency)

  consola.log("")
  consola.log(pc.bold(`Comparing ${periodStr}: ${currentLabel} vs ${previousLabel}`))
  consola.log("")

  const rows: CompareRow[] = []
  const currencies = [...new Set([...Object.keys(currentTotals), ...Object.keys(previousTotals)])].sort()

  let grandCurrent = 0
  let grandPrevious = 0

  for (const ccy of currencies) {
    const cur = Math.round(currentTotals[ccy] ?? 0)
    const prev = Math.round(previousTotals[ccy] ?? 0)
    grandCurrent += cur
    grandPrevious += prev
    rows.push({
      label: ccy,
      current: formatPrice(cur, ccy),
      previous: formatPrice(prev, ccy),
      change: fmtChange(cur, prev, ccy),
      isCurrencyTotal: true,
    })
  }

  // API usage
  if (options.api) {
    rows.push({ label: "", current: "", previous: "", change: "", isDivider: true })

    const curApi = getLlmUsageTotal(currentRange.from, currentRange.to)
    const prevApi = getLlmUsageTotal(previousRange.from, previousRange.to)

    // API cost is stored in USD cents — convert to dollars (major units)
    const curApiUsd = curApi / 100
    const prevApiUsd = prevApi / 100

    // Convert API cost if currency specified
    let curApiDisplay = curApiUsd
    let prevApiDisplay = prevApiUsd
    if (targetCurrency && rates) {
      try {
        curApiDisplay = convertPrice(curApiUsd, "USD", targetCurrency, rates.rates)
        prevApiDisplay = convertPrice(prevApiUsd, "USD", targetCurrency, rates.rates)
      } catch { /* keep as USD */ }
    }

    const apiCcy = targetCurrency && rates ? targetCurrency : "USD"
    rows.push({
      label: pc.dim("API Usage"),
      current: pc.dim(formatPrice(Math.round(curApiDisplay), apiCcy)),
      previous: pc.dim(formatPrice(Math.round(prevApiDisplay), apiCcy)),
      change: pc.dim(fmtChange(Math.round(curApiDisplay), Math.round(prevApiDisplay), apiCcy)),
    })

    grandCurrent += Math.round(curApiDisplay)
    grandPrevious += Math.round(prevApiDisplay)
  }

  // Grand total — only show when a target currency is set or there's a single currency
  const canGrandTotal = targetCurrency || currencies.length <= 1
  if (canGrandTotal) {
    rows.push({ label: "", current: "", previous: "", change: "", isDivider: true })
    const totalCcy = targetCurrency ?? (currencies[0] ?? "USD")
    rows.push({
      label: pc.bold("Grand Total"),
      current: formatPrice(grandCurrent, totalCcy),
      previous: formatPrice(grandPrevious, totalCcy),
      change: fmtChange(grandCurrent, grandPrevious, totalCcy),
      isGrandTotal: true,
    })
  }

  renderCompareTable(rows, currentLabel, previousLabel)
  consola.log("")
}

// ── Command handler ──────────────────────────────────────

export async function handleCompare(
  period: Cycle,
  options: CompareOptions = {},
): Promise<void> {
  if (options.json) {
    const subs = getNonCancelledSubscriptions()
    if (subs.length === 0) {
      process.stdout.write(JSON.stringify({ period, current: {}, previous: {}, change: {} }, null, 2) + "\n")
      return
    }

    const activeSubs = subs
    const currentTotals: Record<string, number> = {}
    for (const sub of activeSubs) {
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
