import { safeResponseJson } from "./safe-json.ts"

export type FxRates = {
  base: string
  rates: Record<string, number>
}

const FX_FETCH_TIMEOUT_MS = 10_000

/**
 * Fetch current USD-based exchange rates from open.er-api.com.
 * Returns a map of currency codes to their exchange rate relative to USD.
 */
export async function fetchFxRates(): Promise<FxRates> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FX_FETCH_TIMEOUT_MS)
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", {
      signal: controller.signal,
    })
    if (!res.ok) {
      throw new Error(`FX API responded with ${res.status}`)
    }
    return await safeResponseJson<FxRates>(res)
  } finally {
    clearTimeout(timer)
  }
}

const MIN_SANE_RATE = 0.0001
const MAX_SANE_RATE = 1_000_000

/** Validate a rate value is within a sane range. */
function validateRate(rate: number, currency: string): void {
  if (rate <= 0 || rate > MAX_SANE_RATE || rate < MIN_SANE_RATE) {
    throw new Error(
      `Suspicious exchange rate for ${currency}: ${rate}` +
      ` (expected between ${MIN_SANE_RATE} and ${MAX_SANE_RATE})`,
    )
  }
}

export function convertPrice(
  price: number,
  from: string,
  to: string,
  rates: Record<string, number>,
): number {
  if (from === to) return price
  const fromRate = rates[from]
  const toRate = rates[to]
  if (!fromRate || !toRate) {
    throw new Error(`No rate available for ${from} → ${to}`)
  }
  validateRate(fromRate, from)
  validateRate(toRate, to)

  // Convert via USD base: source → USD → target
  const inUsd = from === "USD" ? price : price / fromRate
  return to === "USD" ? inUsd : inUsd * toRate
}
