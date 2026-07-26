import { OCCURRENCES_PER_YEAR } from "../../../date-utils.ts"
import type { Cycle } from "../../../types.ts"

const CYCLES = Object.keys(OCCURRENCES_PER_YEAR) as Cycle[]

function isValidCycle(cycle: string): cycle is Cycle {
  return CYCLES.includes(cycle as Cycle)
}

export function monthlyFactor(cycle: string): number {
  const occurrences = isValidCycle(cycle)
    ? OCCURRENCES_PER_YEAR[cycle]
    : undefined
  if (occurrences === undefined) {
    // Unknown cycle — default to monthly
    return 1
  }
  return occurrences / 12
}

export function yearlyFactor(cycle: string): number {
  const occurrences = isValidCycle(cycle)
    ? OCCURRENCES_PER_YEAR[cycle]
    : undefined
  if (occurrences === undefined) {
    // Unknown cycle — default to 12 (monthly)
    return 12
  }
  return occurrences
}

export function computeNextBill(day: number, from: Date, until: Date): Date | null {
  const year = from.getFullYear()
  const month = from.getMonth()
  const lastDay = new Date(year, month + 1, 0).getDate()
  const clampedDay = Math.min(day, lastDay)
  let d = new Date(year, month, clampedDay)
  if (d < from) {
    const nextLastDay = new Date(year, month + 2, 0).getDate()
    d = new Date(year, month + 1, Math.min(day, nextLastDay))
  }
  if (d <= until) return d
  return null
}
