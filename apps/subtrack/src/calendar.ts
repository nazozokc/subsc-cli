import { consola } from "consola"
import pc from "picocolors"
import { getSubscriptions } from "./db.ts"
import { formatPrice } from "./price.ts"
import type { SharedArgs, Currency } from "./types.ts"
import { fetchFxRates, convertPrice } from "./fx.ts"
import type { FxRates } from "./fx.ts"

/** Options for the calendar command */
export type CalendarOptions = {
  /** Month number (1-12). Default: current month */
  month?: number
  /** Year. Default: current year */
  year?: number
  /** If true, output JSON to stdout instead of table */
  json?: boolean
  /** Convert all prices to target currency */
  currency?: string
}

/** A single day's billing events in the calendar */
export type CalendarEntry = {
  /** Day of month (1-31) */
  day: number
  /** Subscriptions billing on this day */
  subs: { name: string; price: number; currency: string; status: string; id: number }[]
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

function clampDay(day: number, year: number, month: number): number {
  return Math.min(day, daysInMonth(year, month))
}

function toDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number)
  return new Date(y, m - 1, d)
}

/**
 * Billing days of a subscription within a given month (1-31).
 * - monthly: every month on the billing day
 * - yearly: only the anchor month
 * - quarterly/semi-annual: every 3/6 months from the anchor month
 * - weekly/bi-weekly: every 7/14 days from the anchor date
 * The billing day falls back to the created_at day when unset.
 */
export function billingDaysInMonth(sub: SharedArgs, year: number, month: number): number[] {
  const anchorDate = toDate(sub.createdAt)
  const anchorMonth = anchorDate.getMonth()
  const day = sub.billingDay ?? anchorDate.getDate()
  const clampedDay = clampDay(day, year, month)

  switch (sub.cycle) {
    case "monthly":
      return [clampedDay]
    case "yearly":
      return anchorMonth === month - 1 ? [clampedDay] : []
    case "quarterly": {
      const diff = ((month - 1 - anchorMonth) % 12 + 12) % 12
      return diff % 3 === 0 ? [clampedDay] : []
    }
    case "semi-annual": {
      const diff = ((month - 1 - anchorMonth) % 12 + 12) % 12
      return diff % 6 === 0 ? [clampedDay] : []
    }
    case "weekly":
    case "bi-weekly": {
      const periodDays = sub.cycle === "weekly" ? 7 : 14
      const msPerPeriod = periodDays * 24 * 60 * 60 * 1000
      const anchor = new Date(
        anchorDate.getFullYear(),
        anchorMonth,
        Math.min(day, daysInMonth(anchorDate.getFullYear(), anchorMonth + 1)),
      )
      const start = new Date(year, month - 1, 1).getTime()
      const end = new Date(year, month - 1, daysInMonth(year, month)).getTime()
      const days: number[] = []
      const kStart = Math.max(0, Math.floor((start - anchor.getTime()) / msPerPeriod))
      for (let k = kStart; ; k++) {
        const t = anchor.getTime() + k * msPerPeriod
        if (t > end) break
        if (t >= start) days.push(new Date(t).getDate())
      }
      return days
    }
  }
}

/**
 * Calculate billing events for a given month.
 * @param month - Month number (1-12)
 * @param year - Year
 * @returns Array of calendar entries keyed by day
 */
export function calcCalendarEntries(month: number, year: number): CalendarEntry[] {
  const subs = getSubscriptions()
  const active = subs.filter((s) => s.status !== "cancelled")

  const dayMap = new Map<number, CalendarEntry["subs"]>()

  for (const sub of active) {
    for (const day of billingDaysInMonth(sub, year, month)) {
      if (!dayMap.has(day)) {
        dayMap.set(day, [])
      }
      dayMap.get(day)!.push({
        name: sub.name,
        price: sub.price,
        currency: sub.currency,
        status: sub.status,
        id: sub.id,
      })
    }
  }

  const entries: CalendarEntry[] = []
  for (const [day, subs_] of dayMap) {
    entries.push({ day, subs: subs_ })
  }
  entries.sort((a, b) => a.day - b.day)

  return entries
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

/**
 * Display (or JSON-print) a monthly calendar with billing days highlighted.
 * When `options.json` is true, writes JSON array to stdout instead of rendering.
 */
export async function showCalendar(options: CalendarOptions): Promise<void> {
  const now = new Date()
  const rawMonth = options.month ?? now.getMonth() + 1
  const rawYear = options.year ?? now.getFullYear()

  const month = rawMonth >= 1 && rawMonth <= 12 ? rawMonth : now.getMonth() + 1
  const year = rawYear >= 1 ? rawYear : now.getFullYear()

  // Handle currency conversion
  let entries = calcCalendarEntries(month, year)
  const targetCcy = options.currency
  if (targetCcy) {
    try {
      const rates = await fetchFxRates()
      entries = entries.map((entry) => ({
        day: entry.day,
        subs: entry.subs.map((sub) => {
          try {
            const converted = convertPrice(sub.price, sub.currency, targetCcy as Currency, rates.rates)
            return { ...sub, price: Math.round(converted), currency: targetCcy }
          } catch {
            return sub
          }
        }),
      }))
    } catch {
      consola.warn("Failed to fetch exchange rates; showing in original currencies")
    }
  }

  if (options.json) {
    process.stdout.write(JSON.stringify(entries, null, 2) + "\n")
    return
  }
  const entryMap = new Map(entries.map((e) => [e.day, e.subs]))

  consola.log(pc.bold(`      ${MONTH_NAMES[month - 1]} ${year}`))
  consola.log(pc.dim(" Su Mo Tu We Th Fr Sa"))

  const firstDay = new Date(year, month - 1, 1).getDay()
  const totalDays = daysInMonth(year, month)

  let line = ""
  for (let i = 0; i < firstDay; i++) {
    line += "   "
  }

  let eventCount = 0
  for (let day = 1; day <= totalDays; day++) {
    const dayEntries = entryMap.get(day)
    if (dayEntries) {
      const n = dayEntries.length
      eventCount += n
      const label = n > 1 ? `${String(day).padStart(1)}${superscript(n)}` : String(day).padStart(2)
      line += ` ${pc.green(pc.bold(label))}`
    } else {
      line += ` ${String(day).padStart(2)}`
    }

    if ((firstDay + day) % 7 === 0) {
      consola.log(line)
      line = ""
    }
  }

  if (line !== "") {
    consola.log(line)
  }

  consola.log("")

  if (entries.length === 0) {
    consola.info("No billing events this month")
    return
  }

  consola.log(pc.bold("Billing events:"))
  consola.log("")

  const currencyTotals: Record<string, number> = {}
  let totalSubs = 0

  for (const entry of entries) {
    for (const sub of entry.subs) {
      const statusStyle =
        sub.status === "active" ? pc.green : sub.status === "paused" ? pc.yellow : pc.dim
      consola.log(
        `  ${pc.cyan(`Day ${String(entry.day).padStart(2)}`)}  ${pc.bold(sub.name)}  ${formatPrice(sub.price, sub.currency)}  ${statusStyle(sub.status)}`,
      )
      currencyTotals[sub.currency] = (currencyTotals[sub.currency] ?? 0) + sub.price
      totalSubs++
    }
  }

  if (totalSubs > 0) {
    consola.log("")
    const parts = Object.entries(currencyTotals)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ccy, total]) => formatPrice(Math.round(total), ccy))
    consola.log(`  ${pc.bold("Total:")} ${parts.join(" + ")} (${totalSubs} event${totalSubs > 1 ? "s" : ""})`)
  }
}

// ── Command handler ──────────────────────────────────────

export async function handleCalendar(options: CalendarOptions): Promise<void> {
  await showCalendar(options)
}

function superscript(n: number): string {
  const supMap: Record<string, string> = {
    "0": "\u2070", "1": "\u00B9", "2": "\u00B2", "3": "\u00B3",
    "4": "\u2074", "5": "\u2075", "6": "\u2076", "7": "\u2077",
    "8": "\u2078", "9": "\u2079",
  }
  return String(n).split("").map((c) => supMap[c] ?? c).join("")
}
