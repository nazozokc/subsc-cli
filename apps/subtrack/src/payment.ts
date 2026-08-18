import { consola } from "consola"
import pc from "picocolors"
import type { SharedArgs, Currency, Cycle } from "./types.ts"
import { periodFactor, getPeriodDateRange } from "./date-utils.ts"
import { getSubscriptions, getNonCancelledSubscriptions, getLlmUsageTotal, getLlmUsageTotalByProvider, getAllPriceChanges } from "./db.ts"
import { formatPrice, formatUsdCost } from "./price.ts"
import { fetchFxRates, convertPrice } from "./fx.ts"
import type { FxRates } from "./fx.ts"
import { runPreCommandHooks } from "./pre-command.ts"

// ── JSON options helper ───────────────────────────────
export type JsonOptions = { json?: boolean }

export const showPayment = async (
  period: Cycle = "monthly",
  currency?: Currency,
  subs?: SharedArgs[],
  includeApi?: boolean,
  byMethod?: boolean,
): Promise<void> => {
  const list = subs ?? getNonCancelledSubscriptions()

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
      consola.warn("Failed to fetch exchange rates; showing in original currencies")
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
        // Convert API cost (USD cents) to target currency
        let apiConverted = 0
        try {
          apiConverted = convertPrice(
            apiTotal / 100,
            "USD",
            currency,
            rates.rates,
          )
        } catch {
          consola.warn("Could not convert API cost to target currency")
        }
        const grandTotal = subTotal + apiConverted
        consola.log(
          `${formatPrice(Math.round(subTotal), currency)}/${fmtPeriod}  ${pc.dim(`+ API ${formatPrice(Math.round(apiConverted), currency)} = ${pc.bold(pc.yellow(formatPrice(Math.round(grandTotal), currency)))}/${fmtPeriod}`)}`,
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

  // Group by payment method (per-currency to avoid mixing currencies)
  if (byMethod) {
    const methodGroups: Record<string, Record<string, number>> = {}
    for (const entry of entries) {
      const method = entry.paymentMethod || "unspecified"
      if (!methodGroups[method]) methodGroups[method] = {}
      methodGroups[method][entry.currency] = (methodGroups[method][entry.currency] ?? 0) + entry.convertedPrice
    }
    consola.log("")
    consola.log(pc.bold("By payment method:"))
    for (const [method, totals] of Object.entries(methodGroups).sort()) {
      const priceStr = Object.entries(totals)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([ccy, total]) => formatPrice(Math.round(total), ccy))
        .join(" + ")
      consola.log(`  ${method.padEnd(16)} ${priceStr}/${fmtPeriod}`)
    }
  }

  if (includeApi) {
    if (apiTotal <= 0) {
      consola.info("No API usage found for this period")
    } else {
      // Show API usage in USD with provider breakdown
      const providerDetails = apiByProvider
        .map((p) => `${p.provider}: ${formatUsdCost(p.total, 2)}`)
        .join(", ")
      consola.log(
        pc.dim(
          `${pc.bold("API usage:")} ${formatUsdCost(apiTotal, 2)}/${fmtPeriod}  ${pc.dim(`(${providerDetails})`)}`,
        ),
      )
    }
  }
}

// ── Shared compare helpers ─────────────────────────────

type CcyTotals = Record<string, number>

/**
 * Calculate per-currency monthly totals for a set of subscriptions,
 * optionally converting to a target currency.
 * Shared by compare.ts and MCP handlers.
 */
export function calcSubTotal(
  subs: SharedArgs[],
  rates: FxRates | null,
  targetCurrency: Currency | undefined,
  period: Cycle = "monthly",
): CcyTotals {
  const totals: CcyTotals = {}
  for (const sub of subs) {
    if (sub.status === "cancelled") continue
    const normalized = sub.price * periodFactor(sub.cycle, period)
    if (targetCurrency && rates) {
      try {
        const converted = convertPrice(normalized, sub.currency, targetCurrency, rates.rates)
        totals[targetCurrency] = (totals[targetCurrency] ?? 0) + converted
      } catch {
        totals[sub.currency] = (totals[sub.currency] ?? 0) + normalized
      }
    } else {
      totals[sub.currency] = (totals[sub.currency] ?? 0) + normalized
    }
  }
  return totals
}

/**
 * Calculate per-currency monthly totals using historical prices from
 * price history to estimate the previous period's costs.
 * Shared by compare.ts and MCP handlers.
 */
export function calcPreviousTotals(
  activeSubs: SharedArgs[],
  rates: FxRates | null,
  targetCurrency: Currency | undefined,
  period: Cycle = "monthly",
): CcyTotals {
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

  const totals: CcyTotals = {}
  for (const sub of activeSubs) {
    if (sub.status === "cancelled") continue
    const prev = priceBefore[sub.id]
    const price = prev?.price ?? sub.price
    const currency = prev?.currency ?? sub.currency
    const monthly = price * periodFactor(sub.cycle, period)

    if (targetCurrency && rates) {
      try {
        const converted = convertPrice(monthly, currency, targetCurrency, rates.rates)
        totals[targetCurrency] = (totals[targetCurrency] ?? 0) + converted
      } catch {
        totals[currency] = (totals[currency] ?? 0) + monthly
      }
    } else {
      totals[currency] = (totals[currency] ?? 0) + monthly
    }
  }
  return totals
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
  const list = subs ?? getNonCancelledSubscriptions()

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

// ── Command handlers ─────────────────────────────────────

export async function handlePayment(
  period: Cycle,
  options: { currency?: string; api?: boolean; method?: boolean } & JsonOptions,
) {
  // Show notification banner for non-JSON output
  await runPreCommandHooks(options)

  if (options.json) {
    const subs = getNonCancelledSubscriptions()
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

    let apiTotal = 0
    let apiByProvider: { provider: string; total: number }[] = []
    if (options.api) {
      const { from, to } = getPeriodDateRange(period)
      apiTotal = getLlmUsageTotal(from, to)
      apiByProvider = getLlmUsageTotalByProvider(from, to)
    }

    let targetCurrency = options.currency as Currency | undefined
    let finalCurrency: string | undefined
    let rates: FxRates | null = null
    let subTotal = 0

    if (targetCurrency) {
      try { rates = await fetchFxRates() } catch { consola.warn("Failed to fetch exchange rates; showing in original currencies") }
      if (rates) {
        for (const entry of entries) {
          try { subTotal += convertPrice(entry.convertedPrice, entry.currency, targetCurrency, rates.rates) }
          catch { consola.warn(`Missing exchange rate for ${entry.currency} → ${targetCurrency}`) }
        }
        finalCurrency = targetCurrency
      }
    }

    if (!finalCurrency) {
      const byCurrency: Record<string, number> = {}
      for (const entry of entries) { byCurrency[entry.currency] = (byCurrency[entry.currency] ?? 0) + entry.convertedPrice }
      subTotal = Object.values(byCurrency).reduce((a, b) => a + b, 0)
    }

    const byMethod: Record<string, { total: number; currencies: string[]; byCurrency: Record<string, number> }> = {}
    if (options.method) {
      for (const entry of entries) {
        const method = entry.paymentMethod || "unspecified"
        if (!byMethod[method]) byMethod[method] = { total: 0, currencies: [], byCurrency: {} }
        // Sum in the same currency space as the total: converted when a target
        // currency is available, otherwise per original currency.
        const currency = finalCurrency ?? entry.currency
        let amount = entry.convertedPrice
        if (finalCurrency && rates) {
          try { amount = convertPrice(entry.convertedPrice, entry.currency, finalCurrency, rates.rates) }
          catch { /* keep original amount */ }
        }
        byMethod[method].total += amount
        if (!byMethod[method].currencies.includes(currency)) { byMethod[method].currencies.push(currency) }
        byMethod[method].byCurrency[currency] = (byMethod[method].byCurrency[currency] ?? 0) + amount
      }
    }

    const output: Record<string, unknown> = {
      period,
      total: Math.round(subTotal),
      currency: finalCurrency ?? null,
      subscriptions: entries.map((e) => ({
        id: e.sub.id, name: e.sub.name, price: e.sub.price,
        currency: e.sub.currency, cycle: e.sub.cycle, status: e.sub.status,
        periodPrice: Math.round(e.convertedPrice),
      })),
    }
    if (options.api && apiTotal > 0) { output.apiUsage = { total: apiTotal, byProvider: apiByProvider } }
    if (options.method && Object.keys(byMethod).length > 0) { output.byMethod = byMethod }
    process.stdout.write(JSON.stringify(output, null, 2) + "\n")
    return
  }
  await showPayment(period, options.currency as Currency | undefined, undefined, options.api, options.method)
}

export async function handleSummary(options: JsonOptions = {}) {
  await runPreCommandHooks(options)

  if (options.json) {
    const subs = getNonCancelledSubscriptions()
    const data = calcSummary(subs)
    process.stdout.write(JSON.stringify(data, null, 2) + "\n")
    return
  }
  await showSummary()
}
