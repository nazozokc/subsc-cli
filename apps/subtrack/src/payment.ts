import { consola } from "consola"
import pc from "picocolors"
import type { SharedArgs, Currency, Cycle } from "./types.ts"
import { periodFactor } from "./date-utils.ts"
import { getSubscriptions, getLlmUsageTotal, getLlmUsageTotalByProvider } from "./db.ts"
import { formatPrice } from "./price.ts"
import { fetchFxRates, convertPrice } from "./fx.ts"
import type { FxRates } from "./fx.ts"

/**
 * Returns the [from, to] date range (inclusive, YYYY-MM-DD) for a given period.
 * The range covers the current calendar period (month / quarter / year etc.)
 * up to today.
 */
export function getPeriodDateRange(period: Cycle): { from: string; to: string } {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth() // 0‑based
  const d = now.getDate()
  const pad = (n: number) => String(n).padStart(2, "0")
  const to = `${y}-${pad(m + 1)}-${pad(d)}`

  switch (period) {
    case "monthly":
      return { from: `${y}-${pad(m + 1)}-01`, to }
    case "yearly":
      return { from: `${y}-01-01`, to }
    case "weekly": {
      const day = now.getDay()
      const diff = day === 0 ? 6 : day - 1 // Monday = 0
      const mon = new Date(now)
      mon.setDate(d - diff)
      return {
        from: `${mon.getFullYear()}-${pad(mon.getMonth() + 1)}-${pad(mon.getDate())}`,
        to,
      }
    }
    case "bi-weekly": {
      const twoWeeksAgo = new Date(now)
      twoWeeksAgo.setDate(d - 14)
      return {
        from: `${twoWeeksAgo.getFullYear()}-${pad(twoWeeksAgo.getMonth() + 1)}-${pad(twoWeeksAgo.getDate())}`,
        to,
      }
    }
    case "quarterly": {
      const qs = Math.floor(m / 3) * 3
      return { from: `${y}-${pad(qs + 1)}-01`, to }
    }
    case "semi-annual": {
      const hs = Math.floor(m / 6) * 6
      return { from: `${y}-${pad(hs + 1)}-01`, to }
    }
  }
}

/**
 * Returns the [from, to] date range for the period immediately before
 * the current period.  The returned range covers a complete period
 * (e.g. full month, full year) for accurate side-by-side comparison.
 */
export function getPreviousPeriodDateRange(period: Cycle): { from: string; to: string } {
  const pad = (n: number) => String(n).padStart(2, "0")
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth() // 0‑based

  switch (period) {
    case "monthly": {
      const prevM = m === 0 ? 11 : m - 1
      const prevY = m === 0 ? y - 1 : y
      const lastDay = new Date(prevY, prevM + 1, 0).getDate()
      return {
        from: `${prevY}-${pad(prevM + 1)}-01`,
        to: `${prevY}-${pad(prevM + 1)}-${pad(lastDay)}`,
      }
    }
    case "yearly": {
      return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` }
    }
    case "weekly": {
      const day = now.getDay()
      const diff = day === 0 ? 6 : day - 1
      const thisMon = new Date(now)
      thisMon.setDate(now.getDate() - diff)
      const prevMon = new Date(thisMon)
      prevMon.setDate(thisMon.getDate() - 7)
      const prevSun = new Date(thisMon)
      prevSun.setDate(thisMon.getDate() - 1)
      return {
        from: `${prevMon.getFullYear()}-${pad(prevMon.getMonth() + 1)}-${pad(prevMon.getDate())}`,
        to: `${prevSun.getFullYear()}-${pad(prevSun.getMonth() + 1)}-${pad(prevSun.getDate())}`,
      }
    }
    case "bi-weekly": {
      const d2 = now.getDay()
      const diff2 = d2 === 0 ? 6 : d2 - 1
      const thisMon2 = new Date(now)
      thisMon2.setDate(now.getDate() - diff2)
      const prevStart = new Date(thisMon2)
      prevStart.setDate(thisMon2.getDate() - 14)
      const prevEnd = new Date(thisMon2)
      prevEnd.setDate(thisMon2.getDate() - 1)
      return {
        from: `${prevStart.getFullYear()}-${pad(prevStart.getMonth() + 1)}-${pad(prevStart.getDate())}`,
        to: `${prevEnd.getFullYear()}-${pad(prevEnd.getMonth() + 1)}-${pad(prevEnd.getDate())}`,
      }
    }
    case "quarterly": {
      const currentQ = Math.floor(m / 3) * 3
      const prevQStart = currentQ - 3
      const qY = prevQStart < 0 ? y - 1 : y
      const qM = ((prevQStart % 12) + 12) % 12
      const lastDayQ = new Date(qY, qM + 3, 0).getDate()
      return {
        from: `${qY}-${pad(qM + 1)}-01`,
        to: `${qY}-${pad(qM + 3)}-${pad(lastDayQ)}`,
      }
    }
    case "semi-annual": {
      const currentH = Math.floor(m / 6) * 6
      const prevHStart = currentH - 6
      const hY = prevHStart < 0 ? y - 1 : y
      const hM = ((prevHStart % 12) + 12) % 12
      const lastDayH = new Date(hY, hM + 6, 0).getDate()
      return {
        from: `${hY}-${pad(hM + 1)}-01`,
        to: `${hY}-${pad(hM + 6)}-${pad(lastDayH)}`,
      }
    }
  }
}

export const showPayment = async (
  period: Cycle = "monthly",
  currency?: Currency,
  subs?: SharedArgs[],
  includeApi?: boolean,
  byMethod?: boolean,
): Promise<void> => {
  const list = subs ?? getSubscriptions()

  if (list.length === 0) {
    consola.info("No subscriptions found")
    return
  }

  // Calculate per-subscription converted price
  type Entry = { convertedPrice: number; currency: Currency; paymentMethod: string | null }
  const entries: Entry[] = list.map((sub) => ({
    convertedPrice: sub.price * periodFactor(sub.cycle, period),
    currency: sub.currency,
    paymentMethod: sub.paymentMethod,
  }))

  const fmtPeriod = period === "monthly" ? "month" : period === "bi-weekly" ? "bi-week" : period === "semi-annual" ? "6 months" : period

  // ── API usage (when --api is set) ──────────────────────
  let apiTotal = 0
  let apiByProvider: { provider: string; total: number }[] = []
  if (includeApi) {
    const { from, to } = getPeriodDateRange(period)
    apiTotal = getLlmUsageTotal(from, to)
    apiByProvider = getLlmUsageTotalByProvider(from, to)
  }

  if (currency) {
    // Convert all to the target currency
    let rates: FxRates | null = null
    try {
      rates = await fetchFxRates()
    } catch {
      consola.fail("Failed to fetch exchange rates; falling back to per-currency display")
    }

    if (rates) {
      let subTotal = 0
      let hasMissingRate = false
      for (const entry of entries) {
        try {
          subTotal += convertPrice(
            entry.convertedPrice,
            entry.currency,
            currency,
            rates.rates,
          )
        } catch {
          hasMissingRate = true
        }
      }

      if (hasMissingRate) {
        consola.warn("Some prices could not be converted (missing rate)")
      }

      if (includeApi && apiTotal > 0) {
        // Convert API cost (USD) to target currency
        let apiConverted = 0
        try {
          apiConverted = convertPrice(
            Math.round(apiTotal),
            "USD",
            currency,
            rates.rates,
          )
        } catch {
          consola.warn("Could not convert API cost to target currency")
        }
        const grandTotal = subTotal + apiConverted
        consola.log(
          `${formatPrice(Math.round(subTotal), currency)}/${fmtPeriod}  ${pc.dim(`+ API ${formatPrice(Math.round(apiConverted), currency)} = ${pc.bold(formatPrice(Math.round(grandTotal), currency))}/${fmtPeriod}`)}`,
        )
      } else {
        consola.log(`${formatPrice(Math.round(subTotal), currency)}/${fmtPeriod}`)
      }
      if (includeApi && apiTotal <= 0) {
        consola.info("No API usage found for this period")
      }
      return
    }
    // fallback: continue to per-currency display
  }

  // Group by currency
  const groups: Record<string, number> = {}
  for (const entry of entries) {
    groups[entry.currency] = (groups[entry.currency] ?? 0) + entry.convertedPrice
  }

  for (const ccy of Object.keys(groups).sort()) {
    const total = groups[ccy]
    // Round to integer for display (prices are stored as integers)
    const rounded = Math.round(total)
    consola.log(`${ccy} ${formatPrice(rounded, ccy)}/${fmtPeriod}`)
  }

  // Group by payment method
  if (byMethod) {
    const methodGroups: Record<string, number> = {}
    const methodCurrencies: Record<string, Set<string>> = {}
    for (const entry of entries) {
      const method = entry.paymentMethod || "unspecified"
      methodGroups[method] = (methodGroups[method] ?? 0) + entry.convertedPrice
      if (!methodCurrencies[method]) methodCurrencies[method] = new Set()
      methodCurrencies[method].add(entry.currency)
    }
    consola.log("")
    consola.log(pc.bold("By payment method:"))
    for (const [method, total] of Object.entries(methodGroups).sort()) {
      const rounded = Math.round(total)
      const ccies = [...(methodCurrencies[method] ?? new Set())]
      const ccy = ccies.length === 1 ? ccies[0] : "USD"
      consola.log(`  ${method.padEnd(16)} ${formatPrice(rounded, ccy)}/${fmtPeriod}`)
    }
  }

  if (includeApi) {
    if (apiTotal <= 0) {
      consola.info("No API usage found for this period")
    } else {
      // Show API usage in USD with provider breakdown
      const providerDetails = apiByProvider
        .map((p) => `${p.provider}: $${(p.total / 100).toFixed(2)}`)
        .join(", ")
      consola.log(
        pc.dim(
          `${pc.bold("API usage:")} $${(apiTotal / 100).toFixed(2)}/${fmtPeriod}  ${pc.dim(`(${providerDetails})`)}`,
        ),
      )
    }
  }
}

// ── Summary ──────────────────────────────────────────────

export type SummaryData = {
  totalCount: number
  monthlyByCurrency: Record<string, number>
  monthlyByTag: Record<string, { count: number; monthly: Record<string, number> }>
  mostExpensive: SharedArgs | undefined
}

export function calcSummary(subs: SharedArgs[]): SummaryData {
  const monthlyByCurrency: Record<string, number> = {}
  const monthlyByTag: Record<string, { count: number; monthly: Record<string, number> }> = {}

  for (const sub of subs) {
    const monthly = sub.price * periodFactor(sub.cycle, "monthly")

    monthlyByCurrency[sub.currency] = (monthlyByCurrency[sub.currency] ?? 0) + monthly

    for (const tag of sub.tags) {
      if (!monthlyByTag[tag]) monthlyByTag[tag] = { count: 0, monthly: {} }
      monthlyByTag[tag].count++
      monthlyByTag[tag].monthly[sub.currency] = (monthlyByTag[tag].monthly[sub.currency] ?? 0) + monthly
    }
  }

  const mostExpensive = subs.length > 0
    ? subs.reduce((max, sub) => sub.price > max.price ? sub : max)
    : undefined

  return {
    totalCount: subs.length,
    monthlyByCurrency,
    monthlyByTag,
    mostExpensive,
  }
}

export function showSummary(subs?: SharedArgs[]): void {
  const list = subs ?? getSubscriptions()

  if (list.length === 0) {
    consola.info("No subscriptions found")
    return
  }

  const data = calcSummary(list)

  consola.log(`Total subscriptions:  ${pc.bold(String(data.totalCount))}`)

  if (data.mostExpensive) {
    const me = data.mostExpensive
    consola.log(
      `Most expensive:       ${pc.bold(me.name)} (${formatPrice(me.price, me.currency)}/${me.cycle})`,
    )
  }

  consola.log("")
  consola.log(pc.bold("Monthly by currency:"))
  for (const [ccy, total] of Object.entries(data.monthlyByCurrency).sort()) {
    consola.log(`  ${ccy}    ${formatPrice(Math.round(total), ccy)}`)
  }

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
