import type { Cycle, SharedArgs } from "../types.ts"
import { periodFactor } from "../date-utils.ts"

export type CurrencyTotals = Record<string, number>

/** Pure billing calculation; presentation and currency conversion are deliberately outside. */
export function calculateTotals(subscriptions: SharedArgs[], period: Cycle): CurrencyTotals {
  const totals: CurrencyTotals = {}
  for (const subscription of subscriptions) {
    if (subscription.status === "cancelled") continue
    const amount = subscription.price * periodFactor(subscription.cycle, period)
    totals[subscription.currency] = (totals[subscription.currency] ?? 0) + amount
  }
  return totals
}

/** Return the monthly equivalent of a subscription's price. */
export function calculateMonthlyTotal(subscription: SharedArgs): number {
  return subscription.price * periodFactor(subscription.cycle, "monthly")
}
