import type { Cycle } from "./types.ts"

/**
 * Number of occurrences per year for each billing cycle.
 */
export const OCCURRENCES_PER_YEAR: Record<Cycle, number> = {
  weekly: 52,
  "bi-weekly": 26,
  monthly: 12,
  quarterly: 4,
  "semi-annual": 2,
  yearly: 1,
}

/**
 * Returns the multiplier to convert a price from one cycle to another.
 * e.g. periodFactor("yearly", "monthly") => 1/12
 *      periodFactor("monthly", "yearly") => 12
 */
export function periodFactor(from: Cycle, to: Cycle = "monthly"): number {
  return OCCURRENCES_PER_YEAR[from] / OCCURRENCES_PER_YEAR[to]
}

/**
 * Convert a YYYY-MM-DD date string to a Unix timestamp in milliseconds
 * representing the start of that day (00:00:00 UTC).
 */
export function dateToStartOfDayMs(dateStr: string): number {
  const date = new Date(dateStr + "T00:00:00.000Z")
  return date.getTime()
}

/**
 * Convert a YYYY-MM-DD date string to a Unix timestamp in milliseconds
 * representing the end of that day (23:59:59.999 UTC).
 */
export function dateToEndOfDayMs(dateStr: string): number {
  const date = new Date(dateStr + "T23:59:59.999Z")
  return date.getTime()
}

/**
 * Get today's date as YYYY-MM-DD string (local timezone).
 */
export function today(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
}

/**
 * Get the first day of the current month as YYYY-MM-DD string.
 */
export function currentMonthStart(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`
}

/**
 * Check if a Unix timestamp in milliseconds falls within a date range.
 * If from/to are undefined, any timestamp is considered in range.
 */
export function isInDateRange(
  timestampMs: number,
  from?: string,
  to?: string,
): boolean {
  if (!from && !to) return true
  const ts = timestampMs
  if (from && ts < dateToStartOfDayMs(from)) return false
  if (to && ts > dateToEndOfDayMs(to)) return false
  return true
}

/**
 * Check if a YYYY-MM-DD date string falls within a date range.
 * Simple string comparison (lexicographic order matches chronological for ISO dates).
 */
export function isDateInRange(dateStr: string, from?: string, to?: string): boolean {
  if (from && dateStr < from) return false
  if (to && dateStr > to) return false
  return true
}

/**
 * Estimate input/output token split from total tokens.
 * Uses a 2:1 input-to-output heuristic common in chat completions.
 */
export function estimateTokenSplit(totalTokens: number): { inputTokens: number; outputTokens: number } {
  const inputTokens = Math.round(totalTokens * 2 / 3)
  return { inputTokens, outputTokens: totalTokens - inputTokens }
}

export const pad2 = (n: number) => String(n).padStart(2, "0")

/** Short month names (Jan, Feb, ...) for display formatting. */
export const SHORT_MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const

/**
 * Convert a YYYY-MM-DD date string to a local Date.
 * Invalid input produces an Invalid Date (caller's responsibility).
 */
export function toDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number)
  return new Date(y, m - 1, d)
}

/**
 * Format a Date as YYYY-MM-DD (local timezone).
 */
export function formatDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/**
 * Format a Date as a short display string, e.g. "Jan 5".
 */
export function formatShortDate(d: Date): string {
  return `${SHORT_MONTH_NAMES[d.getMonth()]} ${d.getDate()}`
}

/**
 * Days in a month. `month` is 1-12 (human convention).
 */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

/**
 * Clamp a day to the length of the given month. `month` is 1-12.
 */
export function clampDay(day: number, year: number, month: number): number {
  return Math.min(day, daysInMonth(year, month))
}

/**
 * Build a Date with the given day clamped to the month length,
 * avoiding JS Date overflow (e.g. day 31 in February -> Feb 28).
 * `month` is 0-based (JS convention).
 */
export function dateWithClampedDay(year: number, month: number, day: number): Date {
  return new Date(year, month, clampDay(day, year, month + 1))
}

/**
 * Days until a target date (YYYY-MM-DD string or Date), relative to today.
 * Returns 0 for today, negative for past dates.
 */
export function daysUntil(target: string | Date): number {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const parsed = typeof target === "string" ? new Date(target + "T00:00:00") : new Date(target)
  parsed.setHours(0, 0, 0, 0)
  return Math.ceil((parsed.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
}

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
  const to = `${y}-${pad2(m + 1)}-${pad2(d)}`

  switch (period) {
    case "monthly":
      return { from: `${y}-${pad2(m + 1)}-01`, to }
    case "yearly":
      return { from: `${y}-01-01`, to }
    case "weekly": {
      const day = now.getDay()
      const diff = day === 0 ? 6 : day - 1 // Monday = 0
      const mon = new Date(now)
      mon.setDate(d - diff)
      return {
        from: `${mon.getFullYear()}-${pad2(mon.getMonth() + 1)}-${pad2(mon.getDate())}`,
        to,
      }
    }
    case "bi-weekly": {
      const twoWeeksAgo = new Date(now)
      twoWeeksAgo.setDate(d - 13)
      return {
        from: `${twoWeeksAgo.getFullYear()}-${pad2(twoWeeksAgo.getMonth() + 1)}-${pad2(twoWeeksAgo.getDate())}`,
        to,
      }
    }
    case "quarterly": {
      const qs = Math.floor(m / 3) * 3
      return { from: `${y}-${pad2(qs + 1)}-01`, to }
    }
    case "semi-annual": {
      const hs = Math.floor(m / 6) * 6
      return { from: `${y}-${pad2(hs + 1)}-01`, to }
    }
  }
}

/**
 * Returns the [from, to] date range for the period immediately before
 * the current period.  The returned range covers a complete period
 * (e.g. full month, full year) for accurate side-by-side comparison.
 */
export function getPreviousPeriodDateRange(period: Cycle): { from: string; to: string } {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth() // 0‑based

  switch (period) {
    case "monthly": {
      const prevM = m === 0 ? 11 : m - 1
      const prevY = m === 0 ? y - 1 : y
      const lastDay = new Date(prevY, prevM + 1, 0).getDate()
      return {
        from: `${prevY}-${pad2(prevM + 1)}-01`,
        to: `${prevY}-${pad2(prevM + 1)}-${pad2(lastDay)}`,
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
        from: `${prevMon.getFullYear()}-${pad2(prevMon.getMonth() + 1)}-${pad2(prevMon.getDate())}`,
        to: `${prevSun.getFullYear()}-${pad2(prevSun.getMonth() + 1)}-${pad2(prevSun.getDate())}`,
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
        from: `${prevStart.getFullYear()}-${pad2(prevStart.getMonth() + 1)}-${pad2(prevStart.getDate())}`,
        to: `${prevEnd.getFullYear()}-${pad2(prevEnd.getMonth() + 1)}-${pad2(prevEnd.getDate())}`,
      }
    }
    case "quarterly": {
      const currentQ = Math.floor(m / 3) * 3
      const prevQStart = currentQ - 3
      const qY = prevQStart < 0 ? y - 1 : y
      const qM = ((prevQStart % 12) + 12) % 12
      const lastDayQ = new Date(qY, qM + 3, 0).getDate()
      return {
        from: `${qY}-${pad2(qM + 1)}-01`,
        to: `${qY}-${pad2(qM + 3)}-${pad2(lastDayQ)}`,
      }
    }
    case "semi-annual": {
      const currentH = Math.floor(m / 6) * 6
      const prevHStart = currentH - 6
      const hY = prevHStart < 0 ? y - 1 : y
      const hM = ((prevHStart % 12) + 12) % 12
      const lastDayH = new Date(hY, hM + 6, 0).getDate()
      return {
        from: `${hY}-${pad2(hM + 1)}-01`,
        to: `${hY}-${pad2(hM + 6)}-${pad2(lastDayH)}`,
      }
    }
  }
}
