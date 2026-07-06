import { consola } from "consola"
import pc from "picocolors"
import CliTable3 from "cli-table3"
import type { SharedArgs, Currency, Cycle } from "./types.ts"
import { periodFactor } from "./date-utils.ts"
import { getSubscriptions, getLlmUsageTotal, getLlmUsageTotalByProvider, getAllPriceChanges } from "./db.ts"
import { formatPrice } from "./price.ts"
import { getPeriodDateRange, getPreviousPeriodDateRange } from "./payment.ts"
import { fetchFxRates, convertPrice } from "./fx.ts"
import type { FxRates } from "./fx.ts"
import { TABLE_CHARS, TABLE_STYLE } from "./display-constants.ts"

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

function calcSubTotal(
  subs: SharedArgs[],
  rates: FxRates | null,
  targetCurrency: Currency | undefined,
): Record<string, number> {
  const totals: Record<string, number> = {}
  for (const sub of subs) {
    if (sub.status === "cancelled") continue
    const monthly = sub.price * periodFactor(sub.cycle, "monthly")
    if (targetCurrency && rates) {
      try {
        const converted = convertPrice(monthly, sub.currency, targetCurrency, rates.rates)
        totals[targetCurrency] = (totals[targetCurrency] ?? 0) + converted
      } catch {
        totals[sub.currency] = (totals[sub.currency] ?? 0) + monthly
      }
    } else {
      totals[sub.currency] = (totals[sub.currency] ?? 0) + monthly
    }
  }
  return totals
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
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
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
  const table = new CliTable3({
    chars: { ...TABLE_CHARS },
    style: { ...TABLE_STYLE },
    head: ["", currentLabel, previousLabel, "Change"],
    colAligns: ["left", "right", "right", "right"],
  })

  for (const row of rows) {
    if (row.isDivider) {
      table.push([pc.dim("─".repeat(20)), pc.dim("─"), pc.dim("─"), pc.dim("─")])
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
  const subs = getSubscriptions()

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
      consola.fail("Failed to fetch exchange rates; showing per-currency totals")
    }
  }

  const targetCurrency = options.currency as Currency | undefined

  const activeSubs = subs.filter((s) => s.status !== "cancelled")
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

    // Convert API cost if currency specified
    let curApiDisplay = curApi
    let prevApiDisplay = prevApi
    if (targetCurrency && rates) {
      try {
        curApiDisplay = convertPrice(Math.round(curApi), "USD", targetCurrency, rates.rates)
        prevApiDisplay = convertPrice(Math.round(prevApi), "USD", targetCurrency, rates.rates)
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
