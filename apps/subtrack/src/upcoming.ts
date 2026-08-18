import { consola } from "consola"
import pc from "picocolors"
import type { SharedArgs, Cycle, Currency } from "./types.ts"
import { getSubscriptions, getNonCancelledSubscriptions } from "./db.ts"
import { formatPrice } from "./price.ts"
import { fetchFxRates, tryConvert } from "./fx.ts"
import type { FxRates } from "./fx.ts"
import { toDate, formatDate, formatShortDate, dateWithClampedDay, daysUntil } from "./date-utils.ts"
import { runPreCommandHooks } from "./pre-command.ts"

function getBillingDay(sub: SharedArgs): number {
  if (sub.billingDay) return sub.billingDay
  // Fall back to created_at day
  const created = toDate(sub.createdAt)
  return created.getDate()
}

/**
 * Date of the k-th period occurrence anchored on `anchorDate`,
 * billed on `day` (clamped to the month length).
 */
function periodDate(anchorDate: Date, periodMonths: number, k: number, day: number): Date {
  const monthIndex = anchorDate.getMonth() + k * periodMonths
  const year = anchorDate.getFullYear() + Math.floor(monthIndex / 12)
  const month = ((monthIndex % 12) + 12) % 12
  return dateWithClampedDay(year, month, day)
}

export function nextDateForCycle(anchorDay: number, anchorDate: Date, cycle: Cycle, fromDate: Date): Date {
  switch (cycle) {
    case "monthly": {
      // Calculate next billing date based on anchor day
      const candidate = dateWithClampedDay(fromDate.getFullYear(), fromDate.getMonth(), anchorDay)
      if (candidate >= fromDate) return candidate
      // Move to next month
      return dateWithClampedDay(fromDate.getFullYear(), fromDate.getMonth() + 1, anchorDay)
    }
    case "yearly": {
      const candidate = dateWithClampedDay(fromDate.getFullYear(), anchorDate.getMonth(), anchorDay)
      if (candidate >= fromDate) return candidate
      return dateWithClampedDay(fromDate.getFullYear() + 1, anchorDate.getMonth(), anchorDay)
    }
    case "weekly":
    case "bi-weekly": {
      // Every 7/14 days from the anchor (billing day of the anchor month)
      const periodDays = cycle === "weekly" ? 7 : 14
      const anchor = dateWithClampedDay(anchorDate.getFullYear(), anchorDate.getMonth(), anchorDay)
      const msPerPeriod = periodDays * 24 * 60 * 60 * 1000
      const periodsSince = Math.ceil((fromDate.getTime() - anchor.getTime()) / msPerPeriod)
      return new Date(anchor.getTime() + Math.max(0, periodsSince) * msPerPeriod)
    }
    case "quarterly":
    case "semi-annual": {
      // Every 3/6 months from the anchor month, billed on anchorDay
      const periodMonths = cycle === "quarterly" ? 3 : 6
      let k = 0
      for (;;) {
        const candidate = periodDate(anchorDate, periodMonths, k, anchorDay)
        if (candidate >= fromDate) return candidate
        k++
      }
    }
  }
}

export function calculateNextBilling(sub: SharedArgs, fromDate: Date): Date {
  const anchorDate = toDate(sub.createdAt)
  const day = getBillingDay(sub)
  return nextDateForCycle(day, anchorDate, sub.cycle, fromDate)
}

export type UpcomingEntry = {
  sub: SharedArgs
  nextDate: Date
  amount: number
}

export function calcUpcoming(days: number = 7): UpcomingEntry[] {
  const list = getNonCancelledSubscriptions()
  if (list.length === 0) return []

  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const endDate = new Date(now)
  endDate.setDate(endDate.getDate() + days)

  const entries: UpcomingEntry[] = []

  for (const sub of list) {
    const next = calculateNextBilling(sub, now)
    if (next >= now && next <= endDate) {
      const amount = sub.price
      entries.push({ sub, nextDate: next, amount })
    }
  }

  entries.sort((a, b) => a.nextDate.getTime() - b.nextDate.getTime())
  return entries
}

export async function calcUpcomingWithCurrency(days: number = 7, targetCurrency?: string): Promise<UpcomingEntry[]> {
  const entries = calcUpcoming(days)
  if (!targetCurrency || entries.length === 0) return entries

  try {
    const rates = await fetchFxRates()
    for (const entry of entries) {
      const converted = tryConvert(entry.amount, entry.sub.currency, targetCurrency as Currency, rates.rates)
      if (converted !== null) {
        entry.amount = Math.round(converted)
        entry.sub = { ...entry.sub, price: Math.round(converted), currency: targetCurrency }
      }
    }
  } catch {
    consola.warn("Failed to fetch exchange rates; showing in original currencies")
  }

  return entries
}

export async function showUpcoming(days: number = 7, options: { currency?: string } = {}): Promise<void> {
  const entries = await calcUpcomingWithCurrency(days, options.currency)

  if (entries.length === 0) {
    consola.info(`No upcoming bills in the next ${days} day${days > 1 ? "s" : ""}`)
    return
  }

  consola.log(pc.bold(`Upcoming bills (next ${days} day${days > 1 ? "s" : ""}):`))
  consola.log("")

  const currencyTotals: Record<string, number> = {}
  for (const entry of entries) {
    const dateStr = formatShortDate(entry.nextDate)
    const dayLabel = daysUntil(entry.nextDate) === 0 ? " (today)" : daysUntil(entry.nextDate) === 1 ? " (tomorrow)" : ""
    consola.log(
      `  ${pc.cyan(dateStr)}${pc.dim(dayLabel)}  ${pc.bold(entry.sub.name)}  ${formatPrice(entry.sub.price, entry.sub.currency)}/${entry.sub.cycle}  ${pc.dim(entry.sub.tags.length > 0 ? `[${entry.sub.tags.join(", ")}]` : "")}`,
    )
    currencyTotals[entry.sub.currency] = (currencyTotals[entry.sub.currency] ?? 0) + entry.sub.price
  }

  if (entries.length > 1) {
    consola.log("")
    const totalParts = Object.entries(currencyTotals)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ccy, total]) => formatPrice(Math.round(total), ccy))
    consola.log(`  ${pc.bold("Total:")} ${totalParts.join(" + ")} (across ${entries.length} subscription${entries.length > 1 ? "s" : ""})`)
  }
}

// ── Command handler ──────────────────────────────────────

export async function handleUpcoming(days: number = 7, options: { json?: boolean; currency?: string } = {}): Promise<void> {
  // Show notification banner for non-JSON output
  await runPreCommandHooks(options)

  if (options.json) {
    const entries = options.currency ? await calcUpcomingWithCurrency(days, options.currency) : calcUpcoming(days)
    const data = entries.map((e) => ({
      id: e.sub.id,
      name: e.sub.name,
      price: e.sub.price,
      currency: e.sub.currency,
      cycle: e.sub.cycle,
      nextDate: formatDate(e.nextDate),
      amount: Math.round(e.amount),
      tags: e.sub.tags,
    }))
    process.stdout.write(JSON.stringify(data, null, 2) + "\n")
    return
  }
  await showUpcoming(days, { currency: options.currency })
}
