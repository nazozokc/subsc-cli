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
