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

const pad = (n: number) => String(n).padStart(2, "0")

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
