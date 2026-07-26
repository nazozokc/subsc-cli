import { consola } from "consola"
import pc from "picocolors"
import type { SharedArgs, Cycle, Currency } from "./types.ts"
import { getSubscriptions } from "./db.ts"
import { formatPrice } from "./price.ts"
import { fetchFxRates, convertPrice } from "./fx.ts"
import type { FxRates } from "./fx.ts"


function toDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number)
  return new Date(y, m - 1, d)
}

function getBillingDay(sub: SharedArgs): number {
  if (sub.billingDay) return sub.billingDay
  // Fall back to created_at day
  const created = toDate(sub.createdAt)
  return created.getDate()
}

function addMonths(date: Date, n: number): Date {
  const result = new Date(date)
  result.setMonth(result.getMonth() + n)
  return result
}

export function nextDateForCycle(anchorDay: number, anchorDate: Date, cycle: Cycle, fromDate: Date): Date {
  switch (cycle) {
    case "monthly": {
      // Calculate next billing date based on anchor day
      const candidate = new Date(fromDate.getFullYear(), fromDate.getMonth(), anchorDay)
      if (candidate >= fromDate) return candidate
      // Move to next month
      return new Date(fromDate.getFullYear(), fromDate.getMonth() + 1, anchorDay)
    }
    case "yearly": {
      const candidate = new Date(fromDate.getFullYear(), anchorDate.getMonth(), anchorDay)
      if (candidate >= fromDate) return candidate
      return new Date(fromDate.getFullYear() + 1, anchorDate.getMonth(), anchorDay)
    }
    case "weekly": {
      // Every 7 days from anchor
      const diff = fromDate.getTime() - anchorDate.getTime()
      const weeksSince = Math.ceil(diff / (7 * 24 * 60 * 60 * 1000))
      return new Date(anchorDate.getTime() + weeksSince * 7 * 24 * 60 * 60 * 1000)
    }
    case "bi-weekly": {
      const diff = fromDate.getTime() - anchorDate.getTime()
      const periodsSince = Math.ceil(diff / (14 * 24 * 60 * 60 * 1000))
      return new Date(anchorDate.getTime() + periodsSince * 14 * 24 * 60 * 60 * 1000)
    }
    case "quarterly": {
      // Every 3 months from anchor
      const monthsSince = (fromDate.getFullYear() - anchorDate.getFullYear()) * 12 + (fromDate.getMonth() - anchorDate.getMonth())
      const quartersSince = Math.ceil(monthsSince / 3)
      return addMonths(new Date(anchorDate), quartersSince * 3)
    }
    case "semi-annual": {
      const monthsSince = (fromDate.getFullYear() - anchorDate.getFullYear()) * 12 + (fromDate.getMonth() - anchorDate.getMonth())
      const halvesSince = Math.ceil(monthsSince / 6)
      return addMonths(new Date(anchorDate), halvesSince * 6)
    }
  }
}

export function calculateNextBilling(sub: SharedArgs, fromDate: Date): Date {
  const anchorDate = toDate(sub.createdAt)
  const day = getBillingDay(sub)

  // For monthly and yearly, use the billing day directly
  if (sub.cycle === "monthly" || sub.cycle === "yearly" || sub.cycle === "quarterly" || sub.cycle === "semi-annual") {
    const candidate = nextDateForCycle(day, anchorDate, sub.cycle, fromDate)
    // Handle month overflow (e.g., day 31 in February)
    if (candidate.getDate() !== day) {
      // Cap to last day of month
      candidate.setDate(0) // go to last day of previous month
    }
    return candidate
  }

  // For weekly/bi-weekly, cycle from anchor
  return nextDateForCycle(day, anchorDate, sub.cycle, fromDate)
}

function formatDate(d: Date): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  return `${months[d.getMonth()]} ${d.getDate()}`
}

function daysUntil(d: Date): number {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const target = new Date(d)
  target.setHours(0, 0, 0, 0)
  return Math.ceil((target.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
}

export type UpcomingEntry = {
  sub: SharedArgs
  nextDate: Date
  amount: number
}

export function calcUpcoming(days: number = 7): UpcomingEntry[] {
  const list = getSubscriptions().filter((s) => s.status !== "cancelled")
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
      try {
        const converted = convertPrice(entry.amount, entry.sub.currency, targetCurrency as Currency, rates.rates)
        entry.amount = Math.round(converted)
        entry.sub = { ...entry.sub, price: Math.round(converted), currency: targetCurrency }
      } catch {
        // Keep original currency
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
    const dateStr = formatDate(entry.nextDate)
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
  if (!options.json) {
    const { autoScan } = await import("./suggest/scan.ts")
    await autoScan()
    const { showNotificationBanner } = await import("./notifications/banner.ts")
    showNotificationBanner()
  }

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
