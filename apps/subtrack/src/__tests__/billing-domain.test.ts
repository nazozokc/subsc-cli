import { describe, expect, test } from "vitest"
import { calculateMonthlyTotal, calculateTotals } from "../domain/billing.ts"
import type { SharedArgs } from "../types.ts"

const sub = (overrides: Partial<SharedArgs> = {}): SharedArgs => ({
  id: 1,
  name: "Example",
  price: 1200,
  currency: "JPY",
  cycle: "monthly",
  tags: [],
  status: "active",
  billingDay: null,
  createdAt: "2026-01-01",
  notes: null,
  paymentMethod: null,
  contractStart: null,
  contractEnd: null,
  autoRenewal: true,
  vendorName: null,
  vendorUrl: null,
  planTier: null,
  discountAmount: null,
  discountType: null,
  ...overrides,
})

describe("billing domain", () => {
  test("calculates totals without presentation or database dependencies", () => {
    expect(calculateTotals([
      sub(),
      sub({ id: 2, price: 12000, cycle: "yearly" }),
      sub({ id: 3, currency: "USD", price: 10 }),
    ], "monthly")).toEqual({ JPY: 2200, USD: 10 })
  })

  test("excludes cancelled subscriptions", () => {
    expect(calculateTotals([sub({ status: "cancelled" })], "monthly")).toEqual({})
  })

  test("normalizes a subscription to monthly cost", () => {
    expect(calculateMonthlyTotal(sub({ price: 12000, cycle: "yearly" }))).toBe(1000)
  })
})

